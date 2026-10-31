import { parseMoneyCents } from '#common/moneyCents'
import {
  writeCanonicalTransactionFixture, writeHistoricalTransactionFixture,
} from '../../helpers/historicalTransactionFixture.js'
import { categoryAllocationsToCents, encodeMonetaryAmount } from '#services/categoryAmountCodec'
// Run only with fresh task-specific PostgreSQL authorization.
// Standard bootstrap independently guards pg/pgLog/execution before every
// destructive fixture statement and returned cleanup; no local teardown/DDL.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `income-fanout-${++sequence}`,
      email: `income-fanout-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Report Accounts' })
    const account = await institution.related('accounts').create({ name: 'Closed pre-start Account',
      type: AccountType.Depository,
      subtype: 'checking', balanceCents: parseMoneyCents('100.00'),
        tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2026-01-01'), rate: 0, closed: true })
    const category = await budget.getAccountTransferCategory({ client: trx })
    return { budget, user, institution, account, category }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function movement(f: Fixture, amount: number, transfers: number[], options: {
  account?: Fixture['account'], type?: number, date?: string, pending?: boolean, deleted?: boolean,
} = {}) {
  const transaction = await f.budget.related('transactions').create({
    date: DateTime.fromISO(options.date ?? '2025-02-01'), type: options.type ?? 5, version: 0,
    deleted: options.deleted ?? false, sortOrder: 0,
    categories: categoryAllocationsToCents(transfers.map((amount) => ({
      categoryId: f.category.id, amount }))), taxes: [],
  })
  await writeCanonicalTransactionFixture(transaction)
  const at = await (options.account ?? f.account).related('accountTransactions').create({
    transactionId: transaction.id, amountCents: parseMoneyCents(encodeMonetaryAmount(amount)),
       name: 'Report movement', provider: 'NONE',
    pending: options.pending ?? false, statementId: null,
  })
  return { transaction, at }
}
async function snapshot() {
  return Promise.all(['accounts', 'categories', 'transactions', 'account_transactions',
    'transaction_categories', 'statements', 'transaction_logs'].map((table) => db.from(table)
      .orderBy('id')))
}
async function selected(f: Fixture) {
  const links = await db.from('transactions as t').join('account_transactions as at',
    'at.transaction_id', 't.id')
    .join('accounts as a', 'a.id', 'at.account_id').where('t.application_id', f.budget.id)
    .where('a.tracking', TrackingType.Transactions).where('t.type', '!=', 4).select('at.id',
      't.id as transactionId').orderBy('at.id')
  const transactions = await f.budget.related('transactions').query().whereIn('id', links.map((
    row) => row.transactionId)).orderBy('id')
  const transfers = transactions.flatMap((transaction) => transaction.categories
    .map((row, index) => ({ transactionId: transaction.id, index, ...row }))
    .filter((row) => row.categoryId === f.category.id))
  return { links, transfers }
}

test.group('Income Vs Expenses transfer fan-out PostgreSQL acceptance', () => {
  test('fractional SQL totals and net preserve exact strings, empty results and Budget isolation',
    async ({ client, assert }) => {
      const own = await fixture(), foreign = await fixture()
      const empty = await client.get('/api/v1/reports/income-vs-expenses').loginAs(own.user)
      empty.assertStatus(200)
      assert.deepEqual(empty.body(), [])
      await movement(own, 0.1, [], { date: '2025-01-01' })
      await movement(own, 0.2, [], { date: '2025-01-31' })
      await movement(own, -0.2, [], { date: '2025-01-15' })
      await movement(own, -0.1, [], { date: '2025-02-01' })
      await movement(own, 0.3, [0.1, 0.2], { date: '2025-03-01' })
      await movement(foreign, 99, [], { date: '2025-01-01' })
      const before = await snapshot()
      const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(own.user)
      response.assertStatus(200)
      assert.deepEqual(response.body(), [['2025-01', '0.30', '-0.20', '0.10'],
        ['2025-02', '0.00', '-0.10', '-0.10'], ['2025-03', '0.00', '0.00', '0.00']])
      assert.deepEqual(await snapshot(), before)
    })

  test('movement50: JSON transfer partitions, repeated equal values and zero').with([
    { values: [50], expected: 0 }, { values: [20, 30], expected: 0 },
    { values: [10, 15, 25], expected: 0 }, { values: [20, 20], expected: 10 },
    { values: [20], expected: 30 }, { values: [], expected: 50 },
    { values: [0, 0], expected: 50 }, { values: [50, 0], expected: 0 },
    { values: [0], expected: 50 },
  ]).run(async ({ client, assert }, scenario) => {
    const f = await fixture()
    await movement(f, 50, scenario.values)
    const before = await snapshot(), ids = await selected(f)
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(scenario.expected),
      encodeMonetaryAmount(0), encodeMonetaryAmount(scenario.expected)]])
    assert.deepEqual(await selected(f), ids)
    assert.deepEqual(await snapshot(), before)
  })

  test('JSON transfer deduction never consults legacy attribution').with([
    { json: [50], legacy: null, expected: 0 }, { json: [50], legacy: 20, expected: 0 },
    { json: [50], legacy: 50, expected: 0 }, { json: [], legacy: 50, expected: 50 },
    { json: [], legacy: null, expected: 50 }, { json: [20, 30], legacy: 99, expected: 0 },
  ]).run(async ({ client, assert }, s) => {
    const f = await fixture()
    const m = await movement(f, 50, s.json)
    if (s.legacy !== null) await db.table('transaction_categories').insert({ transaction_id: m
      .transaction.id,
      category_id: f.category.id, amount: s.legacy })
    const before = await snapshot()
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(s.expected),
      encodeMonetaryAmount(0), encodeMonetaryAmount(s.expected)]])
    assert.deepEqual(await snapshot(), before)
  })

  test('original sign classification is retained').with([
    { amount: -50, transfers: [-20, -30], income: 0, expenses: 0 },
    { amount: -50, transfers: [20, 20], income: 0, expenses: -90 },
    { amount: 50, transfers: [-20, -20], income: 90, expenses: 0 },
    { amount: 50, transfers: [80], income: -30, expenses: 0 },
    { amount: -50, transfers: [-80], income: 0, expenses: 30 },
    { amount: 0, transfers: [20, 20], income: -40, expenses: 0 },
  ]).run(async ({ client, assert }, s) => {
    const f = await fixture(); await movement(f, s.amount, s.transfers)
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(s.income),
      encodeMonetaryAmount(s.expenses), encodeMonetaryAmount(s.income + s.expenses)]])
  })

  test('multiple Accounts, movements and same-Transaction links use existing per-link semantics',
    async ({ client, assert }) => {
    const f = await fixture()
    const second = await f.institution.related('accounts').create({ name: 'Second',
      type: AccountType.Depository,
      subtype: 'checking', balanceCents: parseMoneyCents('0.00'),
        tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2026-01-01'), rate: 0, closed: false })
    const first = await movement(f, 50, [20, 30])
    await second.related('accountTransactions').create({ transactionId: first.transaction.id, name:
      'Other link', amountCents: parseMoneyCents('-50.00'),
      provider: 'NONE', pending: false, statementId: null })
    await movement(f, -40, [-10], { account: second }); await movement(f, 8, [], { date:
      '2025-03-01' })
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(0), encodeMonetaryAmount(-
      130), encodeMonetaryAmount(-130)], ['2025-03', encodeMonetaryAmount(8), encodeMonetaryAmount(
      0), encodeMonetaryAmount(8)]])
  })

  test('selection stays nominal across type/status/date and tracking').with([
    { type: 0, pending: true, deleted: true, tracking: TrackingType.Transactions, included: true },
    { type: 1, pending: false, deleted: false, tracking: TrackingType.Transactions,
      included: true },
    { type: 2, pending: false, deleted: false, tracking: TrackingType.Transactions,
      included: true },
    { type: 3, pending: false, deleted: false, tracking: TrackingType.Transactions,
      included: true },
    { type: 4, pending: false, deleted: false, tracking: TrackingType.Transactions,
      included: false },
    { type: 5, pending: false, deleted: false, tracking: TrackingType.Balances, included: false },
  ]).run(async ({ client, assert }, s) => {
    const f = await fixture(); await f.account.merge({ tracking: s.tracking }).save()
    await movement(f, 50, [20, 20], s)
    const response = await client.get('/api/v1/reports/income-vs-expenses').qs({ startDate:
      '2030-01-01', endDate: '2030-12-31' }).loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), s.included ? [['2025-02', encodeMonetaryAmount(10),
      encodeMonetaryAmount(0), encodeMonetaryAmount(10)]] : [])
  })

  test('calendar dates/order and accountless Transaction exclusion remain unchanged', async ({
    client, assert }) => {
    const f = await fixture()
    await movement(f, 50, [], { date: '2025-01-01' })
    await movement(f, -20, [], { date: '2024-12-31' })
    await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-01-01'), type: 2,
      categories: categoryAllocationsToCents([{ categoryId: f.category.id, amount: 999 }]),
        taxes: [], version: 0,
        deleted: false, sortOrder: 0 })
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2024-12', encodeMonetaryAmount(0), encodeMonetaryAmount(-
      20), encodeMonetaryAmount(-20)], ['2025-01', encodeMonetaryAmount(50), encodeMonetaryAmount(
      0), encodeMonetaryAmount(50)]])
  })

  test('no Account movements still returns empty report', async ({ client, assert }) => {
    const f = await fixture()
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200); assert.deepEqual(response.body(), [])
  })

  test('foreign Transaction, foreign Category and other Category never enter transfer aggregate',
    async ({ client, assert }) => {
    const own = await fixture(), foreign = await fixture()
    await movement(own, 50, [20, 20])
    const other = await movement(foreign, 999, [])
    await writeHistoricalTransactionFixture(other.transaction, { categories: [{ categoryId: own
      .category.id, amount: 999 }] })
    const ownTransaction = await own.budget.related('transactions').query().firstOrFail()
    await writeHistoricalTransactionFixture(ownTransaction, { categories: [...ownTransaction
      .categories, { categoryId: foreign.category.id, amount: 999 }] })
    const before = await snapshot()
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(own.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(10), encodeMonetaryAmount(
      0), encodeMonetaryAmount(10)]])
    assert.deepEqual(await snapshot(), before)
  })

  test('Unassigned, ordinary and nonexistent Category IDs do not qualify for transfer deduction',
    async ({ client, assert }) => {
    const f = await fixture()
    const unassigned = await f.budget.getUnassignedCategory()
    const pool = await f.budget.getFundingPoolCategory()
    const m = await movement(f, 50, [20])
    await writeHistoricalTransactionFixture(m.transaction, { categories: [...m.transaction
      .categories,
      { categoryId: unassigned.id, amount: 999 }, { categoryId: pool.id, amount: 999 },
      { categoryId: 2147483647, amount: 999 }] })
    const before = await snapshot()
    const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['2025-02', encodeMonetaryAmount(30), encodeMonetaryAmount(
      0), encodeMonetaryAmount(30)]])
    assert.deepEqual(await snapshot(), before)
  })

  test('JSON transfer deduction is one read-only scoped aggregate, EXPLAIN sanity', async ({ client,
    assert }) => {
    const f = await fixture()
    const first = await movement(f, 50, [])
    await writeHistoricalTransactionFixture(first.transaction, { categories: [{ categoryId: f
      .category.id, amount: 50 }] })
    await writeCanonicalTransactionFixture(first.transaction)
    for (let i = 0; i < 25; i++) await movement(f, 50, [20, 30])
    const before = await snapshot(), ids = await selected(f)
    const queries: { sql: string, bindings?: readonly unknown[] }[] = []
    const listener = (event: { sql: string, bindings?: readonly unknown[] }) => { queries.push(
      event) }
    const connection = db.connection().getWriteClient()
    connection.on('query', listener)
    try {
      const response = await client.get('/api/v1/reports/income-vs-expenses').loginAs(f.user)
      response.assertStatus(200); assert.deepEqual(response.body(), [['2025-02',
        encodeMonetaryAmount(0), encodeMonetaryAmount(0), encodeMonetaryAmount(0)]])
    } finally { connection.removeListener('query', listener) }
    const reportQueries = queries.filter((q) => q.sql.includes('jsonb_to_recordset'))
    assert.lengthOf(reportQueries, 1)
    const query = reportQueries[0]
    assert.include(query.sql, 'group by "transfer_transaction"."id"')
    assert.include(query.sql, '"transfer_transaction"."application_id"')
    assert.include(query.bindings ?? [], f.budget.id); assert.include(query.bindings ?? [], f
      .category.id)
    assert.notInclude(query.sql.toLowerCase(), 'distinct'); assert.include(query.sql,
      'jsonb_to_recordset')
    assert.isFalse(queries.some((q) => q.sql.includes('transaction_categories')))
    assert.isFalse(queries.some((q) => /\b(insert|update|delete|alter|drop|create|truncate)\b/i
      .test(q.sql)))
    assert.deepEqual(await selected(f), ids); assert.deepEqual(await snapshot(), before)
    const plan = await db.rawQuery(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql.replace(
      /\$\d+/g, '?')}`, [...query.bindings ?? []])
    console.info('Income query sanity', JSON.stringify(plan.rows[0]['QUERY PLAN'][0]))
  })
})
