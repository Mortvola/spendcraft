import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { parseMoneyCents } from '#common/moneyCents'
import { transactionRequest, categoryTransferRequest } from '../../helpers/transactionRequest.js'
// PREPARED ONLY. Run through the safeguarded application test runner after fresh authorization.
// tests/bootstrap.ts installs independent configured/live pg+pgLog/execution guards on every write.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { requestCategoryStorage } from '#services/categoryStorageBinding'
import { validateStoredCategoryConservation } from '#services/transactionCategoryStorage'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `cent-storage-${++sequence}`,
      email: `cent-storage-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Cent storage' })
    const account = await institution.related('accounts').create({ name: 'Checking',
      balanceCents: parseMoneyCents('10.00'),
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
        startDate: DateTime.fromISO('2025-01-01'),
      rate: 0, closed: false })
    const group = await budget.related('groups').create({ name: 'Cent storage', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'First', type: CategoryType
      .Regular,
      balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    return { budget, user, institution, account, category, pool }
  })
}
async function raw(id: number) { return db.from('transactions').where('id', id).firstOrFail() }
async function snapshot() {
  return Promise.all(['transactions', 'accounts', 'account_transactions', 'categories',
    'statements', 'transaction_logs']
    .map((table) => db.from(table).orderBy('id')))
}

test.group('Transaction Category decimal-string storage (prepared)', () => {
  test('manual HTTP CREATE persists strings and returns canonical API allocations').with([12.34, -
    12.34, 0])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).loginAs(f
        .user).accept('json')
        .json(transactionRequest({ date: '2025-02-01', name: 'Cent storage', amount, categories: [{
          categoryId: f.category.id, amount }] }))
      response.assertStatus(200)
      const row = response.body().transaction
      assert.strictEqual(row.categories[0].amount, amount.toFixed(2))
      assert.strictEqual(row.accountTransaction.amount, amount.toFixed(2))
      assert.strictEqual((await raw(row.id)).categories[0].amount, amount.toFixed(2))
    })

  test('reads require canonical storage, return strings and never rewrite JSON').with(['numeric',
    'string', 'mixed'])
    .run(async ({ client, assert }, encoding) => {
      const f = await fixture()
      const categories = [{ categoryId: f.category.id, amount: encoding === 'numeric' ? 0.1 :
        '0.10' },
        { categoryId: f.category.id, amount: encoding === 'string' ? '0.20' : 0.2 }]
      const target = await Transaction.create({ budgetId: f.budget.id, type: 5, date: DateTime
        .fromISO('2025-02-01'), categories: [] })
      await f.account.related('accountTransactions').create({ transactionId: target.id, name:
        'Mixed', amountCents: parseMoneyCents('0.30'), pending: false })
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify(
        categories) })
      const before = await snapshot()
      const response = await client.get(`/api/v1/transaction/${target.id}`).loginAs(f.user).accept(
        'json')
      if (encoding !== 'string') {
        response.assertStatus(422)
        assert.deepEqual(await snapshot(), before)
        return
      }
      response.assertStatus(200)
      assert.strictEqual(response.body().accountTransaction.amount, '0.30')
      assert.deepEqual(response.body().categories.map((row: { amount: string }) => row.amount), [
        '0.10', '0.20'])
      assert.deepEqual(await snapshot(), before)
    })

  test('HTTP PATCH requires canonical storage and returns canonical allocations').with(['numeric',
    'string', 'mixed'])
    .run(async ({ client, assert }, encoding) => {
      const f = await fixture()
      const target = await Transaction.create({ budgetId: f.budget.id, type: 5, version: 0,
        date: DateTime.fromISO('2025-02-01'), categories: [] })
      await f.account.related('accountTransactions').create({ transactionId: target.id, name:
        'Patch', amountCents: parseMoneyCents('0.30'), pending: false })
      const categories = [{ categoryId: f.category.id, amount: encoding === 'numeric' ? 0.1 :
        '0.10' },
        { categoryId: f.category.id, amount: encoding === 'string' ? '0.20' : 0.2 }]
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify(
        categories) })
      const before = await snapshot()
      const response = await client.patch(`/api/v1/transaction/${target.id}`).loginAs(f.user)
        .accept('json')
        .json(transactionRequest({ version: 0, categories: [{ categoryId: f.category.id,
          amount: 0.2 }, { categoryId: f.category.id, amount: 0.1 }] }))
      if (encoding !== 'string') {
        response.assertStatus(422)
        assert.deepEqual(await snapshot(), before)
        return
      }
      response.assertStatus(200)
      assert.strictEqual(response.body().data.transaction.accountTransaction.amount, '0.30')
      assert.deepEqual(response.body().data.transaction.categories.map((row: { amount: string }) =>
        row.amount), ['0.20', '0.10'])
      assert.deepEqual((await raw(target.id)).categories.map((row: { amount: string }) => row
        .amount), ['0.20', '0.10'])
    })

  test('HTTP negative half-tie posts the encoded nominal amount', async ({ client, assert }) => {
    const f = await fixture()
    const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).loginAs(f
      .user).accept('json')
      .json(transactionRequest({ date: '2025-02-01', name: 'Half tie', amount: -1.12,
        categories: [{ categoryId: f.category.id, amount: -1.125 }] }))
    response.assertStatus(200)
    assert.strictEqual(response.body().transaction.accountTransaction.amount, '-1.12')
    assert.strictEqual(response.body().transaction.categories[0].amount, '-1.12')
    assert.strictEqual((await raw(response.body().transaction.id)).categories[0].amount, '-1.12')
    assert.strictEqual((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
      '-1.12'))
  })

  test('invalid input, overflow and round-after-sum reject atomically').with(['overflow', 'missing',
    'invalid', 'rounding-order', 'accumulation'])
    .run(async ({ client, assert }, shape) => {
      const f = await fixture()
      const values = shape === 'rounding-order' ? [0.005, 0.005] : shape === 'accumulation'
        ? [45035996273704.95, 45035996273704.95, 1, -1] : [shape === 'overflow' ? Number
          .MAX_SAFE_INTEGER : shape === 'invalid' ? 'bad' : undefined]
      const before = await snapshot()
      const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).loginAs(f
        .user).accept('json')
        .json(transactionRequest({ date: '2025-02-01', name: 'Invalid storage', amount: shape ===
          'rounding-order' ? 0.01 : 0,
          categories: values.map((amount) => ({ categoryId: f.category.id, amount })) }))
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
    })

  test('malformed stored string is rejected without read normalization').with(['bad', '12.3',
    'Infinity', 'NaN'])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const target = await Transaction.create({ budgetId: f.budget.id, type: 5,
        date: DateTime.fromISO('2025-02-01'), categories: [] })
      await f.account.related('accountTransactions').create({ transactionId: target.id, name:
        'Malformed', amountCents: parseMoneyCents('1.00') })
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify([{
        categoryId: f.category.id, amount }]) })
      const before = await snapshot()
      const response = await client.get(`/api/v1/transaction/${target.id}`).loginAs(f.user).accept(
        'json')
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
      // Do not leave deliberately malformed JSON to poison unrelated SQL scans.
      // This cleanup independently traverses the centralized execution guard.
      await db.from('transactions').where('id', target.id).update({ categories: '[]' })
    })

  test('all supported types encode approved amounts, preserve unrelated JSON and conserve').with([0,
    5, 2, 3, 4])
    .run(async ({ assert }, type) => {
      const f = await fixture()
      let id = 0
      await db.transaction(async (trx) => {
        await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
        const allocations = [0, 4, 5].includes(type)
          ? [{ categoryId: f.category.id, amount: 0.1, comment: 'first' }, { categoryId: f.category
            .id, amount: 0.2 }]
          : [{ categoryId: f.category.id, amount: 0.1, baseAmount: 1.005, extra: {
            amount: 1.005 } },
            { categoryId: f.category.id, amount: 0.2 }, { categoryId: f.pool.id, amount: -0.3 }]
        const target = await requestCategoryStorage(new Transaction()).useTransaction(trx)
          .fill({ budgetId: f.budget.id, type, date: DateTime.fromISO('2025-02-01'),
            categories: allocations }).save()
        id = target.id
        if ([0, 4, 5].includes(type)) await f.account.related('accountTransactions').create({
          transactionId: id, name: 'Conserved', amountCents: parseMoneyCents('0.30'),
             pending: false }, { client: trx })
        await validateStoredCategoryConservation(target)
      })
      const stored = (await raw(id)).categories
      assert.deepEqual(stored.map((row: { amount: string }) => row.amount), [0, 4, 5].includes(
        type) ? ['0.10', '0.20'] : ['0.10', '0.20', '-0.30'])
      if (type === 2 || type === 3) {
        assert.strictEqual(stored[0].baseAmount, '1.00')
        assert.deepEqual(stored[0].extra, { amount: 1.005 })
        const decoded = await Transaction.findOrFail(id)
        assert.strictEqual(decoded.serialize().categories[0].baseAmount, '1.00')
      }
    })

  test('deleted mismatches survive reads and metadata-only save unchanged').with(['ordinary-empty',
    'funding-empty', 'funding-nine-cents'])
    .run(async ({ assert }, shape) => {
      const f = await fixture()
      const type = shape === 'ordinary-empty' ? 5 : 2
      const categories = shape === 'funding-nine-cents'
        ? [{ categoryId: f.category.id, amount: 1.09 }, { categoryId: f.pool.id, amount: -1 }] : []
      const target = await Transaction.create({ budgetId: f.budget.id, type, deleted: true,
        date: DateTime.fromISO('2025-02-01'), categories })
      if (type === 5) await f.account.related('accountTransactions').create({ transactionId: target
        .id, name: 'Deleted', amountCents: parseMoneyCents('1.00') })
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify(
        categories.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
      ) })
      const before = await raw(target.id)
      await db.transaction(async (trx) => {
        await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
        const fresh = await Transaction.query({ client: trx }).where('id', target.id).firstOrFail()
        await fresh.merge({ comment: 'Metadata only' }).save()
      })
      const after = await raw(target.id)
      assert.deepEqual(after.categories, before.categories)
      assert.isTrue(after.deleted)
    })

  test('invalid CREATE type and no-Pool funding reject before financial writes').with([0, 4, 5, 99,
    'no-pool'])
    .run(async ({ client, assert }, shape) => {
      const f = await fixture()
      const before = await snapshot()
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).accept('json')
        .json(categoryTransferRequest({ type: shape === 'no-pool' ? 2 : shape, date: '2025-02-01',
          categories: [
          { categoryId: f.category.id, amount: 1 }, { categoryId: f.category.id, amount: -1 },
        ] }))
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
    })

  test('string-backed DELETE and parent cascades preserve current eligible reversal').with([
    'transaction', 'account', 'institution'])
    .run(async ({ client, assert }, kind) => {
      const f = await fixture()
      const created = await client.post(`/api/v1/account/${f.account.id}/transactions`).loginAs(f
        .user).accept('json')
        .json(transactionRequest({ date: '2025-02-01', name: 'Eligible deletion', amount: 1,
          categories: [{ categoryId: f.category.id, amount: 1 }] }))
      created.assertStatus(200)
      const id = created.body().transaction.id
      assert.strictEqual((await raw(id)).categories[0].amount, '1.00')
      const path = kind === 'transaction' ? `/api/v1/transaction/${id}` : kind === 'account'
        ? `/api/v1/institution/${f.institution.id}/accounts/${f.account
          .id}` : `/api/v1/institution/${f.institution.id}`
      const removed = await client.delete(path).loginAs(f.user).accept('json')
      removed.assertStatus(200)
      assert.strictEqual((await Category.findOrFail(f.category.id)).balanceCents,
        parseMoneyCents('0.00'))
      if (kind === 'transaction') {
        assert.isTrue((await raw(id)).deleted)
        assert.strictEqual((await raw(id)).categories[0].amount, '1.00')
      } else assert.isNull(await db.from('transactions').where('id', id).first())
    })

  test('late Category failure rolls back allocation storage and financial rows', async ({ client,
    assert }) => {
    const f = await fixture()
    const before = await snapshot()
    const save = mock.method(Category.prototype, 'save', async () => { throw new Error(
      'Late storage failure') })
    try {
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).accept('json')
        .json(categoryTransferRequest({ type: 2, date: '2025-02-01', categories: [
          { categoryId: f.category.id, amount: 1 }, { categoryId: f.pool.id, amount: -1 },
        ] }))
      response.assertStatus(500)
    } finally { save.mock.restore() }
    assert.deepEqual(await snapshot(), before)
  })
})

function deferred() {
  let resolve: () => void = () => { throw new Error('Deferred not initialized') }
  const promise = new Promise<void>((ready) => { resolve = ready })
  return { promise, resolve }
}

// Observe an actual PostgreSQL wait edge; no timing sleeps determine ordering.
async function waitForBudgetBlock(pid: number) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const result = await db.rawQuery('SELECT cardinality(pg_blocking_pids(?)) AS count', [pid])
    if (Number(result.rows[0].count) > 0) return
    await new Promise<void>((resolve) => { globalThis.setImmediate(resolve) })
  }
  throw new Error('Expected Budget lock wait was not observed')
}

test.group('Decimal-string storage concurrency/security (prepared)', () => {
  test('Budget waiter reloads committed or rolled-back allocation state').with(['commit',
    'rollback'])
    .run(async ({ assert }, outcome) => {
      const f = await fixture()
      const target = await Transaction.create({ budgetId: f.budget.id, type: 5,
        date: DateTime.fromISO('2025-02-01'), categories: [{ categoryId: f.category.id,
          amount: 0.3 }] })
      await f.account.related('accountTransactions').create({ transactionId: target.id, name:
        'Waiter', amountCents: parseMoneyCents('0.30') })
      await db.from('transactions').where('id', target.id).update({
        categories: JSON.stringify([{ categoryId: f.category.id, amount: '0.30' }]),
      })
      const writer = await db.transaction()
      const attempting = deferred()
      let pid = 0
      let waiter: Promise<void> | undefined
      try {
        await Budget.query({ client: writer }).where('id', f.budget.id).forUpdate().firstOrFail()
        const fresh = await Transaction.query({ client: writer }).where('id', target.id)
          .firstOrFail()
        fresh.categories = [{ categoryId: f.category.id, amount: 0.1 }, { categoryId: f.category.id,
          amount: 0.2 }]
        await fresh.save()
        await validateStoredCategoryConservation(fresh)
        waiter = db.transaction(async (trx) => {
          pid = Number((await trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid)
          attempting.resolve()
          await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
          const current = await Transaction.query({ client: trx }).where('id', target.id)
            .firstOrFail()
          assert.deepEqual(current.categories.map((row) => row.amount), outcome === 'commit' ? [0.1,
            0.2] : [0.3])
          current.categories = [{ categoryId: f.category.id, amount: 0.15 }, { categoryId: f
            .category.id, amount: 0.15 }]
          await current.save()
          await validateStoredCategoryConservation(current)
        })
        await attempting.promise
        await waitForBudgetBlock(pid)
        if (outcome === 'commit') await writer.commit()
        else await writer.rollback()
        await waiter
      } finally {
        if (!writer.isCompleted) await writer.rollback()
        if (waiter) await waiter
      }
      assert.deepEqual((await raw(target.id)).categories.map((row: { amount: string }) => row
        .amount), ['0.15', '0.15'])
    })

  test('different Budget storage writer proceeds while another Budget is held', async ({
    assert }) => {
    const first = await fixture()
    const second = await fixture()
    const owner = await db.transaction()
    try {
      await Budget.query({ client: owner }).where('id', first.budget.id).forUpdate().firstOrFail()
      await db.transaction(async (trx) => {
        await trx.rawQuery("SET LOCAL lock_timeout = '2s'")
        await Budget.query({ client: trx }).where('id', second.budget.id).forUpdate().firstOrFail()
        const target = await requestCategoryStorage(new Transaction()).useTransaction(trx).fill({
          budgetId: second.budget.id, type: 3, date: DateTime.fromISO('2025-02-01'),
          categories: [{ categoryId: second.category.id, amount: 1 }, { categoryId: second.category
            .id, amount: -1 }],
        }).save()
        await validateStoredCategoryConservation(target)
        assert.isNumber(target.id)
      })
    } finally { await owner.rollback() }
  })

  test('foreign GET and Category attribution reject without state changes', async ({ client,
    assert }) => {
    const first = await fixture()
    const second = await fixture()
    const target = await Transaction.create({ budgetId: first.budget.id, type: 3,
      date: DateTime.fromISO('2025-02-01'), categories: [] })
    const before = await snapshot()
    const foreign = await client.get(`/api/v1/transaction/${target.id}`).loginAs(second.user)
      .accept('json')
    foreign.assertStatus(404)
    const cross = await client.post('/api/v1/category-transfer').loginAs(first.user).accept('json')
      .json(categoryTransferRequest({ type: 3, date: '2025-02-01', categories: [
        { categoryId: second.category.id, amount: 1 }, { categoryId: first.category.id, amount: -
          1 },
      ] }))
    cross.assertStatus(404)
    assert.deepEqual(await snapshot(), before)
  })
})

test.group('Decimal-string SQL membership and report compatibility', () => {
  test('numeric/string/mixed predicates preserve count and Category deletion admission')
    .with(['numeric', 'string', 'mixed'].flatMap((encoding) => [false, true].map((nonzero) => ({
      encoding, nonzero }))))
    .run(async ({ client, assert }, { encoding, nonzero }) => {
      const f = await fixture()
      const target = await Transaction.create({ budgetId: f.budget.id, type: 5,
        date: DateTime.fromISO('2025-02-01'), categories: [] })
      await f.account.related('accountTransactions').create({ transactionId: target.id, name:
        'SQL membership', amountCents: parseMoneyCents(encodeMonetaryAmount(nonzero ? 0.3 : 0)) })
      const values = nonzero ? [0.1, 0.2] : [0, 0]
      const allocations = values.map((amount, i) => ({ categoryId: f.category.id,
        amount: encoding === 'numeric' || (encoding === 'mixed' && i === 0) ? amount : amount
          .toFixed(2) }))
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify(
        allocations) })
      const before = await snapshot()
      const listed = await client.get(`/api/v1/category/${f.category.id}/transactions`).qs({
        limit: 1, offset: 0 }).loginAs(f.user)
      if (nonzero && encoding !== 'string') {
        listed.assertStatus(422)
        assert.deepEqual(await snapshot(), before)
      } else {
        listed.assertStatus(200)
        assert.equal(listed.body().data.transactionsCount, nonzero ? 1 : 0)
        assert.lengthOf(listed.body().data.transactions, nonzero ? 1 : 0)
        if (nonzero) assert.deepEqual(listed.body().data.transactions[0].categories.map((row: {
          amount: string }) => row.amount), values.map((value) => Number(value).toFixed(2)))
      }
      assert.deepEqual(await snapshot(), before)
      const removed = await client.delete(`/api/v1/groups/${f.category.groupId}/categories/${f
        .category.id}`).loginAs(f.user)
      removed.assertStatus(nonzero ? 409 : 204)
      if (nonzero) {
        assert.equal(removed.body().errors[0].status, '409')
        assert.equal(removed.body().errors[0].detail,
          'Unable to delete the category because it contains one or more transactions')
        assert.deepEqual(await snapshot(), before)
      }
      assert.deepEqual((await raw(target.id)).categories, allocations)
    })

  test('SQL reports accept mixed JSON amounts without normalization').with(['category',
    'funding-history', 'income-vs-expenses'])
    .run(async ({ client, assert }, report) => {
      const f = await fixture()
      const transfer = await f.budget.getAccountTransferCategory()
      const type = report === 'funding-history' ? 2 : 5
      const target = await Transaction.create({ budgetId: f.budget.id, type,
        date: DateTime.fromISO('2025-02-01'), categories: [] })
      if (type === 5) await f.account.related('accountTransactions').create({ transactionId: target
        .id, name: 'Mixed report', amountCents: parseMoneyCents('0.30') })
      const allocations = report === 'income-vs-expenses'
        ? [{ categoryId: transfer.id, amount: '0.10' }, { categoryId: transfer.id, amount: 0.2 }]
        : [{ categoryId: f.category.id, amount: '0.10' }, { categoryId: f.category.id,
          amount: 0.2 },
          ...(type === 2 ? [{ categoryId: f.pool.id, amount: '-0.30' }] : [])]
      await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify(
        allocations) })
      const before = await snapshot()
      const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
        .loginAs(f.user)
      response.assertStatus(200)
      if (report === 'income-vs-expenses') assert.deepEqual(response.body(), [['2025-02', '0.00',
        '0.00', '0.00']])
      if (report === 'category') { assert.equal(response.body()[0].sum, '0.30'); assert.equal(
        response.body()[0].count, 2) }
      if (report === 'funding-history') assert.deepEqual(response.body().find((row: {
        categoryId: number }) => row.categoryId === f.category.id).history,
        [{ year: 2025, month: 2, amount: '0.30' }])
      assert.deepEqual(await snapshot(), before)
    })
})

test.group('Decimal-string membership tenant isolation', () => {
  test('foreign cross-linked JSON cannot enter own register or block own Category deletion').with([
    'numeric', 'string', 'mixed'])
    .run(async ({ client, assert }, encoding) => {
    const own = await fixture(), foreign = await fixture()
    const target = await Transaction.create({ budgetId: foreign.budget.id, type: 3,
      date: DateTime.fromISO('2025-02-01'), categories: [] })
    // Malformed cross-tenant relationship, seeded without invoking an authorized writer.
    await db.from('transactions').where('id', target.id).update({ categories: JSON.stringify([
      { categoryId: own.category.id, amount: encoding === 'numeric' ? 1 : '1.00' },
      { categoryId: foreign.category.id, amount: encoding === 'string' ? '-1.00' : -1 },
    ]) })
    const foreignBefore = await raw(target.id)
    const before = await snapshot()
    const register = await client.get(`/api/v1/category/${own.category.id}/transactions`).loginAs(
      own.user)
    register.assertStatus(200)
    assert.lengthOf(register.body().data.transactions, 0)
    assert.equal(register.body().data.transactionsCount, 0)
    const response = await client.delete(`/api/v1/groups/${own.category.groupId}/categories/${own
      .category.id}`).loginAs(own.user)
    response.assertStatus(204)
    assert.deepEqual(await raw(target.id), foreignBefore)
    const after = await snapshot()
    for (const index of [0, 1, 2, 4, 5]) assert.deepEqual(after[index], before[index])
    assert.deepEqual(after[3], before[3].filter((row) => row.id !== own.category.id))
  })
})
