import { parseMoneyCents } from '#common/moneyCents'
import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
// Requires task-specific DB authorization and independent per-operation safeguards.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient } from '@japa/api-client'
import Budget from '#models/Budget'
import Loan from '#models/Loan'
import Category from '#models/Category'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

interface Settings { name: string, rate: number, startDate: string, startingBalance: number }
const original: Settings = { name: 'Original', rate: 5, startDate: '2025-01-01',
  startingBalance: 100 }
const a: Settings = { name: 'Request A', rate: 8, startDate: '2025-02-01', startingBalance: 100 }
const b: Settings = { name: 'Request B', rate: 5, startDate: '2025-03-01', startingBalance: 200 }
let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `loan-settings-${++sequence}`,
      email: `loan-settings-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Loan settings', type: 'Regular' })
    const category = await group.related('categories').create({ name: original.name,
      type: CategoryType.Loan,
      balance: 17, fundingCategories: [] })
    // Legacy loans schema owns user_id, whereas endpoint scope is Category→Budget.
    await trx.table('loans').insert({ user_id: user.id, category_id: category.id, rate: 5,
      start_date: original.startDate, starting_balance: 100, balance: -100 })
    const loan = await Loan.query({ client: trx }).where('categoryId', category.id).firstOrFail()
    const institution = await budget.related('institutions').create({ name:
      'Noninterference bank' })
    const account = await institution.related('accounts').create({ name: 'Noninterference',
      type: AccountType.Credit,
      subtype: 'credit card', balance: 100, plaidBalance: 123, tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO(original.startDate), initialized: true, enabled: true,
        closed: false, rate: 0 })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await account.updateStartingBalance(budget, pool); await pool.save()
    await account.related('statements').create({ startDate: DateTime.fromISO('2025-01-01'),
      endDate: DateTime.fromISO('2025-01-31'), startingBalanceCents: parseMoneyCents('100.00'),
        endingBalanceCents: parseMoneyCents('100.00') })
    const target = await group.related('categories').create({ name: 'Funding recipient',
      type: CategoryType.Regular,
      balance: 0, fundingCategories: [] })
    return { budget, user, group, category, loan, account, pool, target }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function patch(client: ApiClient, f: Fixture, settings: Settings, status = 200, categoryId = f
  .category.id) {
  const response = await client.patch(`/api/v1/loans/${categoryId}`).json({ ...settings,
    startingBalance: encodeMonetaryAmount(settings.startingBalance) }).loginAs(f.user)
  response.assertStatus(status)
  if (status === 200) deepStrictEqual(response.body(), { name: settings.name, loan: { balance:
    '0.00', transactions: [] } })
}
let boundaryRecorded = false
async function fresh(f: Fixture, expected: Settings) {
  // Default independent query AFTER request completion, not the request's model/trx.
  const row = await db.from('loans').select('rate', 'starting_balance', 'balance', 'user_id',
    'category_id')
    .select(db.raw("to_char(start_date, 'YYYY-MM-DD') AS date")).where('id', f.loan.id).firstOrFail(
      )
  equal(Number(row.rate), expected.rate); equal(Number(row.starting_balance), expected
    .startingBalance)
  if (!boundaryRecorded) {
    boundaryRecorded = true
    console.info('Loan raw monetary boundary', JSON.stringify({ startingBalance: row
      .starting_balance, startingBalanceType: typeof row.starting_balance, rate: row.rate,
      rateType: typeof row.rate }))
  }
  equal(row.date, expected.startDate); equal(Number(row.balance), -100)
  equal(row.user_id, f.user.id); equal(row.category_id, f.category.id)
  equal((await Category.findOrFail(f.category.id)).name, expected.name)
}
async function financial() {
  const rows: Record<string, object[]> = {}
  for (const table of ['accounts', 'transactions', 'account_transactions', 'statements',
    'transaction_logs', 'loan_transactions']) {
    rows[table] = await db.from(table).orderBy('id')
  }
  rows.categories = await db.from('categories').select('id', 'balance').orderBy('id')
  rows.loans = await db.from('loans').select('id', 'balance', 'category_id', 'user_id').orderBy(
    'id')
  return rows
}
async function raw() {
  return { financial: await financial(), loans: await db.from('loans').orderBy('id'),
    categories: await db.from('categories').orderBy('id') }
}
function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized barrier') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function deadline(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() =>
    reject(new Error('Barrier not reached')), 10_000) })]) }
  finally { if (timer) clearTimeout(timer) }
}
async function waiter(pid: number) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const result = await db.rawQuery(
      `SELECT query FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type \
= 'Lock'`, [pid])
    if (result.rows.some((row: { query: string }) => row.query.includes('applications') &&
      /for update/i.test(row.query))) return
  }
  throw new Error('Budget waiter not observed')
}
async function contend(f: Fixture, first: () => Promise<void>, second: () => Promise<void>,
  independent = false, rollback = false) {
  const entered = signal(); const release = signal()
  let held = false; let pid = 0
  const originalSave = Loan.prototype.save
  const hook = mock.method(Loan.prototype, 'save', async function (this: Loan) {
    const result = await originalSave.call(this)
    if (this.id === f.loan.id && !held) {
      held = true; ok(this.$trx)
      pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
      entered.resolve(); await release.promise
      if (rollback) throw new Error('Injected Loan save failure')
    }
    return result
  })
  const firstRequest = first(); void firstRequest.catch(() => undefined)
  let secondRequest: Promise<void> | undefined
  try {
    await deadline(entered.promise)
    secondRequest = second(); void secondRequest.catch(() => undefined)
    if (independent) await deadline(secondRequest)
    else await waiter(pid)
  } finally {
    release.resolve(); await Promise.allSettled([firstRequest, ...(secondRequest ? [
      secondRequest] : [])]); hook.mock.restore()
  }
  await firstRequest; await secondRequest
}

interface Observation { events: string[], rate?: unknown, base?: unknown, date?: unknown,
  name?: unknown }
function record(value: unknown): value is Record<string, unknown> { return typeof value ===
  'object' && value !== null }
// Observe the real driver execution connection while leaving the installed
// per-statement safety wrapper in place. No direct connection or SQL bypass.
async function observeQueries(f: Fixture, operation: () => Promise<void>) {
  const prototype: object | null = Reflect.getPrototypeOf(db.connection('pg').getWriteClient()
    .client)
  ok(prototype)
  const originalQuery: unknown = Reflect.get(prototype, 'query')
  ok(typeof originalQuery === 'function')
  const active = new Map<unknown, Observation>()
  const observations: Observation[] = []
  Reflect.set(prototype, 'query', async function (this: object, connection: unknown,
    query: unknown) {
    const sql: unknown = typeof query === 'string' ? query : record(query) ? query.sql : undefined
    ok(typeof sql === 'string')
    const result: unknown = await Reflect.apply(originalQuery, this, [connection, query])
    if (sql.includes('"applications"') && /for update/i.test(sql)) {
      const observation = { events: ['gate'] }
      active.set(connection, observation); observations.push(observation)
    }
    const observation = active.get(connection)
    const table = /^select.*?from "(\w+)"/i.exec(sql)?.[1]
    if (table === 'loans' || table === 'categories') {
      // Only a target Loan/Category hydration counts, not existence subqueries.
      if (record(result) && record(result.response) && Array.isArray(result.response.rows)) {
        for (const row of result.response.rows) {
          if (!record(row)) continue
          if (row.id === f.loan.id && table === 'loans') {
            ok(observation, 'Loan hydration escaped acquired Budget execution transaction')
            observation.events.push('loan.read'); observation.rate = row.rate
            observation.base = row.starting_balance; observation.date = row.start_date
          }
          if (row.id === f.category.id && table === 'categories') {
            ok(observation, 'Category hydration escaped acquired Budget execution transaction')
            observation.events.push('category.read'); observation.name = row.name
          }
        }
      }
    }
    if (/^update "(?:loans|categories)"/i.test(sql)) {
      ok(observation, 'Save escaped acquired Budget execution transaction')
      ok(observation.events.includes('loan.read')); ok(observation.events.includes('category.read'))
      observation.events.push(sql.startsWith('update "loans"') ? 'loan.write' : 'category.write')
    }
    if (/^commit/i.test(sql) && observation) { observation.events.push('commit'); active.delete(
      connection) }
    if (/^rollback/i.test(sql)) active.delete(connection)
    return result
  })
  try { await operation() }
  finally { Reflect.set(prototype, 'query', originalQuery) }
  return observations
}

test.group('Loan settings serialization and persistence', (group) => {
  group.each.timeout(30_000)
  test(
    'complete request persists independently freshly read settings/name without financial effects')
    .with([
    original, { ...original, rate: 8 }, { ...original, startingBalance: 200 },
    { ...original, startDate: '2025-02-01' }, { ...original, name: 'Name only' }, b,
    { name: 'Zero', rate: 0, startDate: '2025-04-01', startingBalance: 0 },
    { name: 'Negative', rate: -2, startDate: '2025-04-01', startingBalance: -20 },
  ]).run(async ({ client }, settings) => {
    const f = await fixture(); const before = await financial()
    await patch(client, f, settings); await fresh(f, settings)
    const get = await client.get(`/api/v1/loans/${f.category.id}`).loginAs(f.user)
    get.assertStatus(200); equal(get.body().rate, settings.rate); equal(get.body().startingBalance,
      settings.startingBalance.toFixed(2))
    equal(get.body().startDate, settings.startDate)
    deepStrictEqual(await financial(), before)
  })
  test('client-rounded canonical PATCH persists exact cents without financial effects').with([
    [12.345, 12.35], [-0.125, -0.12], [0.125, 0.13], [1.005, 1], [0.1 + 0.2, 0.3], [-0.005, 0],
  ]).run(async ({ client }, [input, expected]) => {
    const f = await fixture(), before = await financial()
    await patch(client, f, { ...original, rate: 5.125, startingBalance: input })
    await fresh(f, { ...original, rate: 5.125, startingBalance: expected })
    deepStrictEqual(await financial(), before)
  })
  test('Loan CREATE/PATCH invalid monetary values reject before mutation').with(['create', 'patch'])
    .run(async ({ client }, operation) => {
      const f = await fixture(), before = await raw()
      for (const value of [1, '1.005', '1e2', '-0.00', '90071992547409.92', null]) {
        const request = operation === 'create' ? client.post('/api/v1/loans') : client.patch(
          `/api/v1/loans/${f.category.id}`)
        const response = await request.json(operation === 'create'
          ? { name: 'Rejected', rate: 5.125, startDate: '2025-01-01', amount: value }
          : { ...b, startingBalance: value }).accept('json').loginAs(f.user)
        response.assertStatus(422)
        deepStrictEqual(await raw(), before)
      }
    })
  test('concurrent complete requests cannot synthesize mixed settings/name/date').with([false,
    true])
    .run(async ({ client }, reverse) => {
      const f = await fixture(); const before = await financial()
      const observations = await observeQueries(f, () => contend(f, () => patch(client, f,
        reverse ? b : a), () => patch(client, f, reverse ? a : b)))
      equal(observations.length, 2)
      for (const observation of observations) deepStrictEqual(observation.events, ['gate',
        'loan.read', 'category.read', 'loan.write', 'category.write', 'commit'])
      equal(Number(observations[0].rate), 5); equal(Number(observations[0].base), 100)
      equal(Number(observations[1].rate), reverse ? b.rate : a.rate)
      equal(Number(observations[1].base), reverse ? b.startingBalance : a.startingBalance)
      equal(observations[1].name, reverse ? b.name : a.name)
      const date = observations[1].date
      equal(date instanceof Date ? DateTime.fromJSDate(date).toISODate() : date, reverse ? b
        .startDate : a.startDate)
      await fresh(f, reverse ? a : b); deepStrictEqual(await financial(), before)
    })
  test('identical and original-value requests still produce complete serial state').with([original,
    b])
    .run(async ({ client }, last) => {
      const f = await fixture(); const before = await financial()
      await contend(f, () => patch(client, f, b), () => patch(client, f, last))
      await fresh(f, last); deepStrictEqual(await financial(), before)
    })
  test('different Loans in same Budget serialize', async ({ client }) => {
    const f = await fixture()
    const category = await f.group.related('categories').create({ name: original.name,
      type: CategoryType.Loan, balance: 0, fundingCategories: [] })
    await db.table('loans').insert({ user_id: f.user.id, category_id: category.id, rate: 5,
      start_date: original.startDate, starting_balance: 100, balance: -100 })
    const other = { ...f, category, loan: await Loan.findByOrFail('categoryId', category.id) }
    const before = await financial()
    await contend(f, () => patch(client, f, a), () => patch(client, other, b))
    await fresh(f, a); await fresh(other, b); deepStrictEqual(await financial(), before)
  })
  test('different Budgets progress independently', async ({ client }) => {
    const f = await fixture(); const other = await fixture(); const before = await financial()
    await contend(f, () => patch(client, f, a), () => patch(client, other, b), true)
    await fresh(f, a); await fresh(other, b); deepStrictEqual(await financial(), before)
  })
  test('rollback after Loan save releases gate and waiter reloads original state', async ({
    client }) => {
    const f = await fixture(); const before = await financial()
    await contend(f, () => patch(client, f, a, 500), () => patch(client, f, b), false, true)
    await fresh(f, b); deepStrictEqual(await financial(), before)
  })
  test('late failure after either save rolls back both models; retry works').with(['loan',
    'category'])
    .run(async ({ client }, failure) => {
      const f = await fixture(); const before = await raw()
      const originalLoanSave = Loan.prototype.save; const originalCategorySave = Category.prototype
        .save
      const loanHook = mock.method(Loan.prototype, 'save', async function (this: Loan) {
        const result = await originalLoanSave.call(this)
        if (failure === 'loan' && this.id === f.loan.id) throw new Error(
          'Injected Loan save failure')
        return result
      })
      const categoryHook = mock.method(Category.prototype, 'save', async function (this: Category) {
        const result = await originalCategorySave.call(this)
        if (failure === 'category' && this.id === f.category.id) throw new Error(
          'Injected Category save failure')
        return result
      })
      try { await patch(client, f, b, 500); deepStrictEqual(await raw(), before) }
      finally { categoryHook.mock.restore(); loanHook.mock.restore() }
      await patch(client, f, b); await fresh(f, b)
    })
  test('both saves use same transaction that already holds owning Budget gate', async ({
    client }) => {
    const f = await fixture()
    const originalLoanSave = Loan.prototype.save; const originalCategorySave = Category.prototype
      .save
    let owner: Loan['$trx']; let saves = 0
    const loanHook = mock.method(Loan.prototype, 'save', async function (this: Loan) {
      if (this.id === f.loan.id) {
        ok(this.$trx); owner = this.$trx
        const locks = await owner.rawQuery(`SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid()
          AND relation = 'applications'::regclass AND mode = 'RowShareLock' AND granted`)
        ok(locks.rows.length); saves++
      }
      return originalLoanSave.call(this)
    })
    const categoryHook = mock.method(Category.prototype, 'save', async function (this: Category) {
      if (this.id === f.category.id) { equal(this.$trx, owner); saves++ }
      return originalCategorySave.call(this)
    })
    try { await patch(client, f, b); equal(saves, 2); await fresh(f, b) }
    finally { categoryHook.mock.restore(); loanHook.mock.restore() }
  })
  test('same-Budget funding waits and preserves its own effects', async ({ client }) => {
    const f = await fixture(); const before = await financial()
    await contend(f, () => patch(client, f, b), async () => {
      const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        type: 2, date: '2025-02-01',
        categories: [{ categoryId: f.target.id, amount: 10 }, { categoryId: f.pool.id, amount: -
          10 }] })).loginAs(f.user)
      response.assertStatus(200)
    })
    await fresh(f, b); equal((await Category.findOrFail(f.pool.id)).balance, 90)
    equal((await Category.findOrFail(f.target.id)).balance, 10); equal((await Category.findOrFail(f
      .category.id)).balance, 17)
    deepStrictEqual(await db.from('accounts').orderBy('id'), before.accounts)
    deepStrictEqual(await db.from('statements').orderBy('id'), before.statements)
  })
  test('foreign/missing/non-Loan Category target rejects without mutation').with(['foreign',
    'missing', 'not-loan'])
    .run(async ({ client }, target) => {
      const f = await fixture(); const foreign = await fixture(); const before = await raw()
      const id = target === 'foreign' ? foreign.category.id : target === 'missing' ? 2147483647 : f
        .target.id
      await patch(client, f, b, 404, id); deepStrictEqual(await raw(), before)
    })
  test('each required field omission rejects without mutation').with(['name', 'rate', 'startDate',
    'startingBalance'])
    .run(async ({ client }, field) => {
      const f = await fixture(); const before = await raw()
      const body = Object.fromEntries(Object.entries({ ...b, startingBalance: encodeMonetaryAmount(b
        .startingBalance) }).filter(([key]) => key !== field))
      const response = await client.patch(`/api/v1/loans/${f.category.id}`).json(body).accept(
        'json').loginAs(f.user)
      response.assertStatus(422); deepStrictEqual(await raw(), before)
    })
  test('canonical balances preserve existing rate coercion and numeric persistence').with([
    { rate: '8.25', startingBalance: '200.75', expectedRate: 8.25, expectedBase: 200.75 },
    { rate: false, startingBalance: '0.00', expectedRate: 0, expectedBase: 0 },
  ]).run(async ({ client }, input) => {
    const f = await fixture(); const before = await financial()
    const response = await client.patch(`/api/v1/loans/${f.category.id}`).json({ ...b, rate: input
      .rate, startingBalance: input.startingBalance }).accept('json').loginAs(f.user)
    response.assertStatus(200)
    await fresh(f, { ...b, rate: input.expectedRate, startingBalance: input.expectedBase })
    deepStrictEqual(await financial(), before)
  })
  test('invalid complete/partial request rejects before mutation').with([
    { ...b, startingBalance: '200.00', rate: null }, { ...b, startingBalance: '200.00', startDate:
      'invalid' }, { name: 'Partial' }, { ...b, startingBalance: '200.00', name: '' },
  ]).run(async ({ client }, body) => {
    const f = await fixture(); const before = await raw()
    const response = await client.patch(`/api/v1/loans/${f.category.id}`).json(body).accept('json')
      .loginAs(f.user)
    response.assertStatus(422); deepStrictEqual(await raw(), before)
  })
})
