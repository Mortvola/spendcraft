import { parseMoneyCents } from '#common/moneyCents'
import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
import {
  writeCanonicalTransactionFixture, writeHistoricalTransactionFixture,
} from '../../helpers/historicalTransactionFixture.js'
// DB-backed verification requires fresh task-specific authorization and current safeguards.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function fixture(type = TransactionType.FUNDING_TRANSACTION) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `admission-${++sequence}`,
      email: `admission-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Admission', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Destination',
      type: CategoryType.Regular, balanceCents: parseMoneyCents('2.00'), fundingCategories: [] })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await pool.merge({ balanceCents: parseMoneyCents('8.00') }).save()
    const rows = (amount: number) => [{ categoryId: category.id, amount, baseAmount: amount,
      fundingCategories: [{ categoryId: pool.id, amount: 100, percentage: true }],
        includeFundingTransfers: false },
    { categoryId: pool.id, amount: -amount, funder: true }]
    const target = await budget.related('transactions').create({ date: DateTime.fromISO(
      '2025-03-01'),
      type, deleted: false, version: 0, categories: rows(2) })
    await writeCanonicalTransactionFixture(target)
    return { budget, user, group, category, pool, target, rows }
  })
}
async function state() {
  return Promise.all(['transactions', 'categories', 'accounts', 'account_transactions',
    'transaction_logs',
    'loans', 'loan_transactions', 'transaction_categories'].map((table) => db.from(table).orderBy(
      'id')))
}
const invalid = ['deleted funding', 'deleted rebalance', 'funding as rebalance',
  'rebalance as funding',
  'manual', 'provider', 'opening', 'transfer', 'unknown type', 'unknown request', 'one link',
    'multiple links',
  'Loan Account', 'null allocations', 'object allocations', 'empty allocations',
    'string money']

test.group('Replacement admission persisted noninterference (prepared)', () => {
  test('unsupported targets reject before any financial save').with(invalid).run(async ({ client,
    assert }, shape) => {
    const f = await fixture(shape === 'deleted rebalance' || shape === 'rebalance as funding'
      ? TransactionType.REBALANCE_TRANSACTION : TransactionType.FUNDING_TRANSACTION)
    let type: number = shape === 'deleted rebalance' || shape === 'funding as rebalance' ? 3 : 2
    if (shape.startsWith('deleted')) await writeHistoricalTransactionFixture(f.target, {
      deleted: true })
    const unrelated: Record<string, TransactionType> = { manual: TransactionType.MANUAL_TRANSACTION,
      provider: TransactionType.REGULAR_TRANSACTION, opening: TransactionType.STARTING_BALANCE,
      transfer: TransactionType.TRANSFER_TRANSACTION }
    if (shape in unrelated) await writeHistoricalTransactionFixture(f.target, { type: unrelated[
      shape] })
    if (shape === 'unknown type') await db.from('transactions').where('id', f.target.id).update({
      type: 99 })
    if (shape === 'unknown request') type = 99
    if (['one link', 'multiple links', 'Loan Account'].includes(shape)) {
      const institution = await f.budget.related('institutions').create({ name:
        'Linked institution' })
      for (let i = 0; i < (shape === 'multiple links' ? 2 : 1); i++) {
        const account = await institution.related('accounts').create({ name: `Linked${i}`,
          balanceCents: parseMoneyCents('100.00'),
          subtype: '', type: shape === 'Loan Account' ? AccountType.Loan : AccountType.Depository,
            tracking: TrackingType.Transactions,
          startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
        await account.related('accountTransactions').create({ transactionId: f.target.id, amount: 2,
          name: 'Unsupported link', pending: false })
      }
    }
    const malformed: Record<string, unknown> = { 'null allocations': null, 'object allocations': {},
      'empty allocations': [], 'string money': [{ categoryId: f.category.id, amount: '2' }] }
    if (shape in malformed) await db.from('transactions').where('id', f.target.id).update({
      categories: JSON.stringify(malformed[shape]) })
    const before = await state()
    const saves = mock.method(Category.prototype, 'save', async () => { throw new Error(
      'Admission failure reached Category/Pool save') })
    try {
      const response = await client.patch(`/api/v1/category-transfer/${f.target.id}`)
        .json(categoryTransferRequest({ type, date: '2025-03-01', categories: f.rows(3) })).accept(
          'json').loginAs(f.user)
      response.assertStatus(shape.startsWith('deleted') ? 404 : 422)
      assert.equal(saves.mock.callCount(), 0)
    } finally { saves.mock.restore() }
    assert.deepEqual(await state(), before)
  })

  test('foreign and nonexistent target scope wins before shape/date errors').with(['foreign',
    'missing'])
    .run(async ({ client, assert }, target) => {
      const own = await fixture()
      const foreign = await fixture()
      const before = await state()
      const response = await client.patch(`/api/v1/category-transfer/${target ===
        'foreign' ? foreign.target.id : 2147483647}`)
        .json(categoryTransferRequest({ type: 99, date: '2025-04-01', categories: own.rows(3) }))
          .accept('json').loginAs(own.user)
      response.assertStatus(404)
      assert.deepEqual(await state(), before)
    })

  test('optional metadata is not required and funding date rejection is inert', async ({ client,
    assert }) => {
    const f = await fixture()
    await writeHistoricalTransactionFixture(f.target, { categories: [{ categoryId: f.category.id,
      amount: 2 }, { categoryId: f.pool.id, amount: -2 }] })
    await writeCanonicalTransactionFixture(f.target)
    const before = await state()
    const rejected = await client.patch(`/api/v1/category-transfer/${f.target.id}`)
      .json(categoryTransferRequest({ type: 2, date: '2025-04-01', categories: f.rows(3) })).accept(
        'json').loginAs(f.user)
    rejected.assertStatus(422)
    assert.deepEqual(await state(), before)
    const accepted = await client.patch(`/api/v1/category-transfer/${f.target.id}`)
      .json(categoryTransferRequest({ type: 2, date: '2025-03-01', categories: f.rows(3) })).accept(
        'json').loginAs(f.user)
    accepted.assertStatus(200)
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('3.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('7.00'))
    assert.equal((await Transaction.findOrFail(f.target.id)).date.toISODate(), '2025-03-01')
  })

  test('valid lifecycle replacement and dates remain distinct').with([2, 3]).run(async ({ client,
    assert }, type) => {
    const f = await fixture(type)
    // Legacy Category types use the same canonical storage contract.
    await f.category.merge({ type: CategoryType.Loan }).save()
    await writeHistoricalTransactionFixture(f.target, { categories: f.rows(2) })
    await writeCanonicalTransactionFixture(f.target)
    const date = type === 2 ? '2025-03-01' : '2025-04-01'
    const response = await client.patch(`/api/v1/category-transfer/${f.target.id}`)
      .json(categoryTransferRequest({ type, date, categories: f.rows(3) })).accept('json').loginAs(f
        .user)
    response.assertStatus(200)
    const target = await Transaction.findOrFail(f.target.id)
    assert.equal(target.date.toISODate(), date); assert.equal(target.type, type)
    assert.deepEqual(target.categories, f.rows(3))
    const stored = await db.from('transactions').where('id', target.id).firstOrFail()
    assert.isTrue(stored.categories.every((row: { amount: unknown }) =>
      typeof row.amount === 'string'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('3.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('7.00'))
  })
})

function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized barrier') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function waitForGate(ownerPid: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const result = await db.rawQuery(
      `SELECT query FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type \
= 'Lock'`, [ownerPid])
    if (result.rows.some((row: { query: string }) => row.query.includes('applications') &&
      /for update/i.test(row.query))) return
  }
  throw new Error('Replacement did not wait for Budget')
}

test.group('Replacement admission freshness and rollback (prepared)', () => {
  test('waiter reloads deleted/type/link state after Budget acquisition').with(['deleted', 'type',
    'link'])
    .run(async ({ client, assert }, change) => {
      const f = await fixture()
      const owner = await db.transaction()
      let request: Promise<void> | undefined
      try {
        await Budget.query({ client: owner }).where('id', f.budget.id).forUpdate().firstOrFail()
        const pid = (await owner.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
        request = client.patch(`/api/v1/category-transfer/${f.target.id}`).json(
          categoryTransferRequest({ type: 2, date: '2025-03-01', categories: f.rows(3) }))
          .accept('json').loginAs(f.user).then((response) => { response.assertStatus(change ===
            'deleted' ? 404 : 422) })
        await waitForGate(pid)
        // Controlled persisted changes; no supported public type-conversion endpoint is invented.
        if (change === 'deleted') await Transaction.query({ client: owner }).where('id', f.target
          .id).update({ deleted: true })
        if (change === 'type') await Transaction.query({ client: owner }).where('id', f.target.id)
          .update({ type: TransactionType.MANUAL_TRANSACTION })
        if (change === 'link') {
          const institution = await f.budget.related('institutions').create({ name:
            'Shape institution' }, { client: owner })
          const account = await institution.related('accounts').create({ name: 'Shape account',
            balanceCents: parseMoneyCents('100.00'),
            subtype: '', type: AccountType.Depository, tracking: TrackingType.Transactions,
              startDate: DateTime.fromISO('2025-01-01'), rate: 0 }, { client: owner })
          await account.related('accountTransactions').create({ name: 'Shape link', amount: 2,
            transactionId: f.target.id }, { client: owner })
        }
        await owner.commit()
        const committed = await state()
        await request
        assert.deepEqual(await state(), committed)
        assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
          '2.00'))
        assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('8.00'))
      } finally {
        if (!owner.isCompleted) await owner.rollback()
        if (request) await Promise.allSettled([request])
      }
    })

  test('public accountless DELETE commits before a waiting replacement rejects').with([2, 3]).run(
    async ({ client, assert }, type) => {
    const f = await fixture(type)
    const entered = signal(); const release = signal()
    let held = false; let pid = 0; let writes = 0
    const original = Category.prototype.save
    const hold = mock.method(Category.prototype, 'save', async function (this: Category) {
      const result = await original.call(this)
      if (this.id === f.category.id) {
        writes++
        if (!held) {
          held = true
          if (!this.$trx) throw new Error('Missing deleting transaction')
          pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
          entered.resolve(); await release.promise
        }
      }
      return result
    })
    const deleting = client.delete(`/api/v1/transaction/${f.target.id}`).loginAs(f.user)
      .then((response) => { response.assertStatus(200) })
    let replacing: Promise<void> | undefined
    try {
      await entered.promise
      replacing = client.patch(`/api/v1/category-transfer/${f.target.id}`)
        .json(categoryTransferRequest({ type, date: '2025-03-01', categories: f.rows(3) })).loginAs(
          f.user)
        .then((response) => { response.assertStatus(404) })
      await waitForGate(pid)
    } finally {
      release.resolve(); await Promise.allSettled([deleting, ...(replacing ? [replacing] : [])]);
        hold.mock.restore()
    }
    await deleting; await replacing
    assert.equal(writes, 1)
    const target = await Transaction.findOrFail(f.target.id)
    assert.isTrue(target.deleted); assert.equal(target.date.toISODate(), '2025-03-01')
    assert.deepEqual(target.categories, f.rows(2))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('0.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('10.00'))
  })

  test('valid concurrent replacements compose, or roll back late, for each lifecycle')
    .with([{ type: 2, rollback: false }, { type: 3, rollback: false }, { type: 2, rollback: true },
      { type: 3, rollback: true }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture(scenario.type)
      const entered = signal(); const release = signal()
      let pid = 0; let held = false
      const original = Category.prototype.save
      const hold = mock.method(Category.prototype, 'save', async function (this: Category) {
        const result = await original.call(this)
        if (this.id === f.category.id && !held) {
          held = true
          if (!this.$trx) throw new Error('Missing replacement transaction')
          pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
          entered.resolve(); await release.promise
          if (scenario.rollback) throw new Error('Injected admission replacement rollback')
        }
        return result
      })
      const first = client.patch(`/api/v1/category-transfer/${f.target.id}`).json(
        categoryTransferRequest({ type: scenario.type,
        date: scenario.type === 2 ? '2025-03-01' : '2025-04-01', categories: f.rows(3) }))
        .loginAs(f.user).then((response) => { response.assertStatus(scenario
          .rollback ? 500 : 200) })
      let second: Promise<void> | undefined
      try {
        await entered.promise
        second = client.patch(`/api/v1/category-transfer/${f.target.id}`).json(
          categoryTransferRequest({ type: scenario.type,
          date: scenario.type === 2 ? '2025-03-01' : '2025-05-01', categories: f.rows(4) }))
          .loginAs(f.user).then((response) => { response.assertStatus(200) })
        await waitForGate(pid)
      } finally {
        release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); hold.mock
          .restore()
      }
      await first; await second
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('4.00'))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('6.00'))
      const target = await Transaction.findOrFail(f.target.id)
      assert.deepEqual(target.categories, f.rows(4))
      assert.equal(target.date.toISODate(), scenario.type === 2 ? '2025-03-01' : '2025-05-01')
    })

  test('late failure after valid admission restores all raw financial state').with([2, 3]).run(
    async ({ client, assert }, type) => {
    const f = await fixture(type)
    const before = await state()
    const original = Category.prototype.save
    const fault = mock.method(Category.prototype, 'save', async function (this: Category) {
      const result = await original.call(this)
      if (this.id === f.pool.id) throw new Error('Injected late admitted-target failure')
      return result
    })
    try {
      const response = await client.patch(`/api/v1/category-transfer/${f.target.id}`).json(
        categoryTransferRequest({ type,
        date: type === 2 ? '2025-03-01' : '2025-04-01', categories: f.rows(3) })).loginAs(f.user)
      response.assertStatus(500)
    } finally { fault.mock.restore() }
    assert.deepEqual(await state(), before)
  })

  test('another Budget replaces independently while a gate is held', async ({ client, assert }) => {
    const first = await fixture(); const second = await fixture()
    const owner = await db.transaction()
    try {
      await Budget.query({ client: owner }).where('id', first.budget.id).forUpdate().firstOrFail()
      const response = await client.patch(`/api/v1/category-transfer/${second.target.id}`)
        .json(categoryTransferRequest({ type: 2, date: '2025-03-01', categories: second.rows(3) }))
          .loginAs(second.user)
      response.assertStatus(200)
      assert.equal((await Category.findOrFail(second.category.id)).balanceCents,
        parseMoneyCents('3.00'))
      assert.equal((await Category.findOrFail(first.category.id)).balanceCents, parseMoneyCents(
        '2.00'))
    } finally { await owner.rollback() }
  })
})
