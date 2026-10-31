import { categoryAllocationsToCents } from '#services/categoryAmountCodec'
import { parseMoneyCents } from '#common/moneyCents'
import { transactionRequest, categoryTransferRequest } from '../../helpers/transactionRequest.js'
// PREPARED ONLY: requires fresh spendcraft_test authorization. Not run during implementation.
// The normal tests/bootstrap.ts installs independent pg/pgLog/execution safeguards
// before setup and every fixture write/cleanup. Do not run with a standalone runner.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Transaction from '#models/Transaction'
import TransactionLog from '#models/TransactionLog'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async trx => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `tax-storage-${++sequence}`,
      email: `tax-storage-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Tax storage' })
    const account = await institution.related('accounts').create({ name: 'Checking',
      balanceCents: parseMoneyCents('10.00'),
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
    const group = await budget.related('groups').create({ name: 'Tax storage', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Tax storage',
      type: CategoryType.Regular,
      balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    const target = await Transaction.create({ budgetId: budget.id, type: 5, version: 0,
      date: DateTime.fromISO('2025-02-01'),
        categories: categoryAllocationsToCents([{ categoryId: category.id, amount: 10 }]),
        taxes: [] }, { client: trx })
    await account.related('accountTransactions').create({ transactionId: target.id, name:
      'Tax storage', amountCents: parseMoneyCents('10.00'), pending: false })
    // Explicit raw legacy fixture. No production writer is bypassed by the operation under test.
    await trx.from('transactions').where('id', target.id).update({
      categories: JSON.stringify([{ categoryId: category.id, amount: '10.00' }]),
    })
    return { budget, user, account, category, target }
  })
}
const entry = <T extends number | string>(amount: T) => ({ type: 'estimated_tax_payments', amount })
async function raw(id: number) { return db.from('transactions').where('id', id).firstOrFail() }
async function allState() {
  return Promise.all(['transactions', 'accounts', 'account_transactions', 'categories',
    'statements', 'transaction_logs']
    .map(table => db.from(table).orderBy('id')))
}
async function financialState(id: number) {
  return Promise.all(['accounts', 'account_transactions', 'categories', 'statements'].map(table =>
    db.from(table).orderBy('id')))
    .then(async state => ({ state, categories: (await raw(id)).categories }))
}

test.group('Transaction tax decimal-string PostgreSQL acceptance (prepared)', () => {
  test('PATCH raw JSON and API strings preserve other money').with([
    [12.345, '12.35'], [-1.005, '-1.00'], [0.125, '0.13'], [-0.125, '-0.12'],
    [0.30000000000000004, '0.30'], [0, '0.00'], [-0, '0.00'], [-0.005, '0.00'],
  ]).run(async ({ client, assert }, [amount, expected]) => {
    const f = await fixture(), before = await financialState(f.target.id)
    const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .accept('json')
      .json(transactionRequest({ version: 0, taxCategories: [entry(amount)] }))
    response.assertStatus(200)
    assert.strictEqual((await raw(f.target.id)).taxes[0].amount, expected)
    const types = await db.rawQuery(
      "SELECT jsonb_typeof(taxes->0->'amount') AS type FROM transactions WHERE id = ?", [f.target
      .id])
    assert.equal(types.rows[0].type, 'string')
    assert.strictEqual(response.body().data.transaction.taxes[0].amount, expected)
    assert.deepEqual(await financialState(f.target.id), before)
  })

  test('canonical, empty and null reads preserve JSON while legacy numeric storage rejects').with([
    'numeric', 'string', 'mixed', 'empty', 'null'])
    .run(async ({ client, assert }, shape) => {
      const f = await fixture()
      const taxes = shape === 'empty' ? [] : shape === 'null' ? null : [
        { ...entry(shape === 'numeric' ? 1.005 : '1.00'), metadata: { keep: 1.005 } },
        entry(shape === 'string' ? '-0.12' : -0.125),
      ]
      await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify(
        taxes) })
      const before = await allState()
      const response = await client.get(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
      if (shape === 'numeric' || shape === 'mixed') {
        response.assertStatus(422)
        assert.deepEqual(await allState(), before)
        return
      }
      response.assertStatus(200)
      if (Array.isArray(taxes)) assert.deepEqual(response.body().taxes, taxes)
      else assert.isNull(response.body().taxes)
      const model = await Transaction.findOrFail(f.target.id)
      if (Array.isArray(taxes)) assert.deepEqual(model.serialize().taxes, response.body().taxes)
      assert.deepEqual(await allState(), before)
      // SQL column is NOT NULL; JSON null is the legacy optional value tested here.
      // Keep this sentinel out of later SQL jsonb_to_recordset report fixtures.
      if (taxes === null) await db.from('transactions').where('id', f.target.id).update({ taxes:
        '[]' })
    })

  test('stored malformed amounts reject without normalization').with(['bad', '1.2', '1e2', '-0.00'])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify([entry(
        amount)]) })
      const before = await allState()
      try {
        const response = await client.get(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
          .accept('json')
        response.assertStatus(422)
        assert.deepEqual(await allState(), before)
      } finally {
        // Independent execution safeguard also protects this deliberate malformed-fixture cleanup.
        await db.from('transactions').where('id', f.target.id).update({ taxes: '[]' })
      }
    })

  test('explicit model tax replacement preserves optional stored metadata', async ({ assert }) => {
    const f = await fixture(), metadata = { amount: 1.005, keep: ['ordered', 'values'] }
    await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify([{
      ...entry('1.00'), metadata }]) })
    await db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
      const fresh = await Transaction.query({ client: trx }).where('id', f.target.id).firstOrFail()
      fresh.taxes[0].amount = 1.125
      await fresh.save()
    })
    assert.deepEqual((await raw(f.target.id)).taxes, [{ ...entry('1.13'), metadata }])
  })

  test('provider ordinary and opening tax PATCH change only tax attribution').with([0, 4])
    .run(async ({ client, assert }, type) => {
      const f = await fixture()
      await db.from('transactions').where('id', f.target.id).update({ type })
      const before = await financialState(f.target.id)
      const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, taxCategories: [entry(12.345)] }))
      response.assertStatus(200)
      assert.equal((await raw(f.target.id)).taxes[0].amount, '12.35')
      assert.deepEqual(await financialState(f.target.id), before)
    })

  test('duplicate entries retain order; no invented tax conservation', async ({ client, assert }) =>
    {
    const f = await fixture()
    const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .accept('json')
      .json(transactionRequest({ version: 0, taxCategories: [entry(1000), entry(-1.125), entry(
        50)] }))
    response.assertStatus(200)
    assert.deepEqual((await raw(f.target.id)).taxes.map((tax: { amount: string }) => tax.amount), [
      '1000.00', '-1.12', '50.00'])
  })

  test('empty replacement clears attribution', async ({ client, assert }) => {
    const f = await fixture()
    await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify([entry(
      '1.00')]) })
    const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .accept('json')
      .json(transactionRequest({ version: 0, taxCategories: [] }))
    response.assertStatus(200)
    assert.deepEqual((await raw(f.target.id)).taxes, [])
  })

  test('invalid input rejects without partial mutation').with(['bad', '', '0x10', true, null, Number
    .MAX_SAFE_INTEGER, undefined])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture(), before = await allState()
      const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, taxCategories: [{ type: 'estimated_tax_payments',
          amount }] }))
      response.assertStatus(422)
      assert.deepEqual(await allState(), before)
    })

  test('unrelated metadata and Category PATCH preserve canonical tax JSON').with(['metadata',
    'categories'])
    .run(async ({ client, assert }, kind) => {
      const f = await fixture(), taxes = [{ ...entry('1.00'), metadata: { keep: true } }, entry(
        '0.30')]
      await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify(
        taxes) })
      const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, ...(kind === 'metadata' ? { comment: 'Metadata' } : {
          categories: [{ categoryId: f.category.id, amount: 4 }, { categoryId: f.category.id,
            amount: 6 }],
        }) }))
      response.assertStatus(200)
      assert.deepEqual((await raw(f.target.id)).taxes, taxes)
    })

  test('deleted historical discrepancy does not block unrelated model metadata save', async ({
    assert }) => {
    const f = await fixture(), taxes = [entry('1.00')]
    await db.from('transactions').where('id', f.target.id).update({ deleted: true, categories: '[]',
      taxes: JSON.stringify(taxes) })
    const before = await financialState(f.target.id)
    await db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
      const fresh = await Transaction.query({ client: trx }).where('id', f.target.id).firstOrFail()
      fresh.comment = 'Deleted historical metadata'
      await fresh.save()
    })
    assert.deepEqual((await raw(f.target.id)).taxes, taxes)
    assert.deepEqual(await financialState(f.target.id), before)
  })

  test('late log failure rolls back raw storage, version and all financial state', async ({ client,
    assert }) => {
    const f = await fixture(), before = await allState()
    const saved = TransactionLog.prototype.save
    const fail = mock.method(TransactionLog.prototype, 'save', async function (
      this: TransactionLog) {
      if (this.transactionId === f.target.id) throw new Error('Injected late tax log failure')
      return saved.call(this)
    })
    try {
      const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, taxCategories: [entry(12.345)] }))
      response.assertStatus(500)
    } finally { fail.mock.restore() }
    assert.deepEqual(await allState(), before)
    const retry = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user).accept(
      'json')
      .json(transactionRequest({ version: 0, taxCategories: [entry(12.345)] }))
    retry.assertStatus(200)
    assert.equal((await raw(f.target.id)).taxes[0].amount, '12.35')
  })

  test('foreign Budget or nonexistent PATCH rejects before mutation').with(['foreign', 'missing'])
    .run(async ({ client, assert }, kind) => {
      const f = await fixture(), foreign = await fixture(), before = await allState()
      const response = await client.patch(`/api/v1/transaction/${kind === 'missing' ? 2147483647 : f
        .target.id}`)
        .loginAs(foreign.user).accept('json').json(transactionRequest({ version: 0, taxCategories: [
          entry(1)] }))
      response.assertStatus(404)
      assert.deepEqual(await allState(), before)
    })

  test('SQL real reports support numeric/string/mixed with unchanged eligibility').with(['numeric',
    'string', 'mixed'])
    .run(async ({ client, assert }, encoding) => {
      const f = await fixture(), foreign = await fixture()
      // Reports historically include deleted/pending/pre-start rows; preserve that policy.
      await db.from('transactions').where('id', f.target.id).update({ deleted: true,
        taxes: JSON.stringify([entry(encoding === 'numeric' ? 1.25 : '1.25'), entry(encoding ===
          'string' ? '-0.50' : -0.5)]) })
      await db.from('accounts').where('id', f.account.id).update({ start_date: '2025-03-01' })
      await db.from('account_transactions').where('transaction_id', f.target.id).update({
        pending: true })
      await db.from('transactions').where('id', foreign.target.id).update({ taxes: JSON.stringify([
        entry('99.00')]) })
      const before = await allState()
      const response = await client.get('/api/v1/taxes/2025').loginAs(f.user).accept('json')
      response.assertStatus(200)
      const february = response.body().data.actuals.find((month: { month: number } | null) => month
        ?.month === 2)
      assert.strictEqual(february.taxes.estimated_tax_payments, '0.75')
      assert.deepEqual(await allState(), before)
    })
})

function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized signal') }
  const promise = new Promise<void>(ready => { resolve = ready })
  return { promise, resolve }
}
async function observeBudgetWait(pid: number) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const result = await db.rawQuery('SELECT cardinality(pg_blocking_pids(?)) AS count', [pid])
    if (Number(result.rows[0].count) > 0) return
    await new Promise<void>(resolve => { globalThis.setImmediate(resolve) })
  }
  throw new Error('Expected Budget waiter not observed')
}

test.group('Transaction tax storage locking (prepared)', () => {
  test('waiter reads fresh committed/rolled-back state using only Budget lock').with(['commit',
    'rollback'])
    .run(async ({ assert }, outcome) => {
      const f = await fixture(), writer = await db.transaction(), attempted = signal()
      let waiter: Promise<void> | undefined, pid = 0
      try {
        await Budget.query({ client: writer }).where('id', f.budget.id).forUpdate().firstOrFail()
        const current = await Transaction.query({ client: writer }).where('id', f.target.id)
          .firstOrFail()
        current.taxes = [entry(1.125)]
        await current.save()
        waiter = db.transaction(async trx => {
          await trx.rawQuery("SET LOCAL lock_timeout = '3s'")
          pid = Number((await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid)
          attempted.resolve()
          await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
          const fresh = await Transaction.query({ client: trx }).where('id', f.target.id)
            .firstOrFail()
          assert.deepEqual(fresh.taxes, outcome === 'commit' ? [entry(1.13)] : [])
          fresh.taxes = [...fresh.taxes, entry(-0.125)]
          await fresh.save()
        })
        await attempted.promise
        await observeBudgetWait(pid)
        if (outcome === 'commit') await writer.commit()
        else await writer.rollback()
        await waiter
      } finally {
        if (!writer.isCompleted) await writer.rollback()
        if (waiter) await waiter
      }
      assert.deepEqual((await raw(f.target.id)).taxes, outcome === 'commit' ? [entry('1.13'), entry(
        '-0.12')] : [entry('-0.12')])
    })

  test('HTTP PATCH waits for Budget and admits against fresh version/state').with(['metadata-first',
    'tax-first', 'stale', 'rollback'])
    .run(async ({ client, assert }, ordering) => {
      const f = await fixture(), owner = await db.transaction()
      let request: Promise<void> | undefined
      try {
        await Budget.query({ client: owner }).where('id', f.budget.id).forUpdate().firstOrFail()
        const pid = Number((await owner.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid)
        const current = await Transaction.query({ client: owner }).where('id', f.target.id)
          .firstOrFail()
        current.version = 1
        current.comment = 'First writer'
        if (ordering === 'tax-first') current.taxes = [entry(1.125)]
        await current.save()
        request = (async () => {
          const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
            .accept('json')
            .json(transactionRequest({ version: ['stale', 'rollback'].includes(ordering) ? 0 : 1,
              ...(ordering === 'tax-first' ? { comment: 'Second metadata' } : { taxCategories: [
                entry(-0.125)] }) }))
          response.assertStatus(ordering === 'stale' ? 409 : 200)
        })()
        const deadline = Date.now() + 5000
        let blocked = false
        while (Date.now() < deadline) {
          const result = await db.rawQuery(
            'SELECT pid FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))', [pid])
          if (result.rows.length) { blocked = true; break }
          await new Promise<void>(resolve => { globalThis.setImmediate(resolve) })
        }
        assert.isTrue(blocked, 'HTTP writer must wait on owning Budget')
        if (ordering === 'rollback') await owner.rollback()
        else await owner.commit()
        await request
      } finally {
        if (!owner.isCompleted) await owner.rollback()
        if (request) await request
      }
      const after = await raw(f.target.id)
      if (ordering === 'stale') assert.deepEqual(after.taxes, [])
      else assert.deepEqual(after.taxes, [entry(ordering === 'tax-first' ? '1.13' : '-0.12')])
      assert.equal(after.comment, ordering === 'tax-first' ? 'Second metadata' : ordering ===
        'rollback' ? null : 'First writer')
    })

  test('different Budget tax writer proceeds independently', async ({ assert }) => {
    const first = await fixture(), second = await fixture(), owner = await db.transaction()
    try {
      await Budget.query({ client: owner }).where('id', first.budget.id).forUpdate().firstOrFail()
      await db.transaction(async trx => {
        await trx.rawQuery("SET LOCAL lock_timeout = '2s'")
        await Budget.query({ client: trx }).where('id', second.budget.id).forUpdate().firstOrFail()
        const fresh = await Transaction.query({ client: trx }).where('id', second.target.id)
          .firstOrFail()
        fresh.taxes = [entry(2.345)]
        await fresh.save()
      })
      assert.equal((await raw(second.target.id)).taxes[0].amount, '2.35')
    } finally { await owner.rollback() }
  })
})


test.group('Expanded tax storage acceptance', () => {
  test('malformed tax arrays and invalid identifier types reject atomically').with([
    {}, [null], [{ amount: 1 }], [{ type: null, amount: 1 }], [{ type: 1, amount: 1 }],
    [{ type: {}, amount: 1 }], [{ type: 'estimated_tax_payments', amount: [] }],
  ]).run(async ({ client, assert }, taxCategories) => {
    const f = await fixture(), before = await allState()
    const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .accept('json')
      .json(transactionRequest({ version: 0, taxCategories }))
    response.assertStatus(422)
    assert.deepEqual(await allState(), before)
  })

  test('optional null array retains existing omitted-field behavior without tax normalization',
    async ({ client, assert }) => {
    const f = await fixture(), taxes = [{ ...entry('1.00'), metadata: { keep: true } }]
    await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify(taxes) })
    const before = await financialState(f.target.id)
    const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .accept('json')
      .json(transactionRequest({ version: 0, taxCategories: null }))
    response.assertStatus(200)
    assert.deepEqual((await raw(f.target.id)).taxes, taxes)
    assert.deepEqual(await financialState(f.target.id), before)
    assert.equal((await raw(f.target.id)).version, 1)
  })

  test('large safe amounts preserve canonical API and storage strings').with([9999999999.99, -
    9999999999.99])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture(), before = await financialState(f.target.id)
      const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, taxCategories: [entry(amount)] }))
      response.assertStatus(200)
      assert.equal((await raw(f.target.id)).taxes[0].amount, amount.toFixed(2))
      assert.strictEqual(response.body().data.transaction.taxes[0].amount, amount.toFixed(2))
      assert.deepEqual(await financialState(f.target.id), before)
    })

  test('soft deletion preserves stored tax metadata without normalization', async ({ client,
    assert }) => {
    const f = await fixture(), taxes = [{ ...entry('1.00'), metadata: { unchanged: true } }, entry(
      '0.30')]
    // Start before Account eligibility so no ambiguous financial reversal is required.
    await db.from('transactions').where('id', f.target.id).update({ date: '2024-12-01', taxes: JSON
      .stringify(taxes) })
    const response = await client.delete(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
    response.assertStatus(200)
    assert.isTrue((await raw(f.target.id)).deleted)
    assert.deepEqual((await raw(f.target.id)).taxes, taxes)
  })
})

test.group('Tax storage lifecycle preservation', () => {
  test('funding/rebalance replacement preserves canonical tax JSON').with([2, 3])
    .run(async ({ client, assert }, type) => {
      const f = await fixture(), pool = await f.budget.getFundingPoolCategory()
      await db.from('categories').where('id', pool.id).update({ balance: 10 })
      const rows = (amount: number) => [{ categoryId: f.category.id, amount }, { categoryId: pool
        .id, amount: -amount }]
      const created = await client.post('/api/v1/category-transfer').loginAs(f.user).accept('json')
        .json(categoryTransferRequest({ type, date: '2025-02-01', categories: rows(1) }))
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const taxes = [{ ...entry('1.00'), metadata: { keep: true } }, entry('0.30')]
      await db.from('transactions').where('id', id).update({ taxes: JSON.stringify(taxes) })
      const response = await client.patch(`/api/v1/category-transfer/${id}`).loginAs(f.user).accept(
        'json')
        .json(categoryTransferRequest({ type, date: '2025-02-01', categories: rows(2) }))
      response.assertStatus(200)
      assert.deepEqual((await raw(id)).taxes, taxes)
      const read = await client.get(`/api/v1/transaction/${id}`).loginAs(f.user)
      read.assertStatus(200)
      assert.deepEqual(read.body().taxes.map((tax: { amount: string }) => tax.amount), ['1.00',
        '0.30'])
    })

  test('startDate/opening maintenance preserves existing tax JSON', async ({ client, assert }) => {
    const f = await fixture(), taxes = [{ ...entry('1.00'), metadata: { keep: true } }, entry(
      '0.30')]
    await db.from('categories').where('id', f.category.id).update({ balance: 10 })
    await db.from('transactions').where('id', f.target.id).update({ taxes: JSON.stringify(taxes) })
    const response = await client.patch(`/api/v1/account/${f.account.id}`).loginAs(f.user).accept(
      'json')
      .json({ startDate: '2025-03-01' })
    response.assertStatus(200)
    assert.deepEqual((await raw(f.target.id)).taxes, taxes)
    assert.equal(Number((await db.from('accounts').where('id', f.account.id).firstOrFail())
      .balance), 10)
  })

  test('parent cascade follows existing deletion while foreign tax state stays untouched').with([
    'account', 'institution'])
    .run(async ({ client, assert }, kind) => {
      const f = await fixture(), foreign = await fixture(), taxes = [entry('1.00'), entry('0.30')]
      await db.from('transactions').whereIn('id', [f.target.id, foreign.target.id]).update({
        taxes: JSON.stringify(taxes) })
      await db.from('transactions').where('id', f.target.id).update({ date: '2024-12-01' })
      const foreignBefore = await raw(foreign.target.id)
      const path = kind === 'account' ? `/api/v1/institution/${f.account.institutionId}/accounts/${f
        .account.id}`
        : `/api/v1/institution/${f.account.institutionId}`
      const response = await client.delete(path).loginAs(f.user).accept('json')
      response.assertStatus(200)
      assert.isNull(await db.from('transactions').where('id', f.target.id).first())
      assert.deepEqual(await raw(foreign.target.id), foreignBefore)
    })
})

test('tax-only PATCH preserves duplicate Category order and metadata in raw JSON', async ({ client,
  assert }) => {
  const f = await fixture()
  const categories = [{ categoryId: f.category.id, amount: '4.00', comment: 'first', extra: {
    keep: 1.005 } },
    { categoryId: f.category.id, amount: '6.00', comment: 'second' }]
  await db.from('transactions').where('id', f.target.id).update({ categories: JSON.stringify(
    categories) })
  const before = await financialState(f.target.id)
  const response = await client.patch(`/api/v1/transaction/${f.target.id}`).loginAs(f.user).accept(
    'json')
    .json(transactionRequest({ version: 0, taxCategories: [entry(12.345)] }))
  response.assertStatus(200)
  assert.deepEqual((await raw(f.target.id)).categories, categories)
  assert.deepEqual(await financialState(f.target.id), before)
})
