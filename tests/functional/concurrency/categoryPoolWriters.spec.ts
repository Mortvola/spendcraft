import { transactionRequest } from '../../helpers/transactionRequest.js'
// Requires task-specific DB authorization and independent per-statement safeguards.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import { equal, deepStrictEqual, ok } from 'node:assert/strict'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { ApiClient } from '@japa/api-client'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Account from '#models/Account'
import Transaction from '#models/Transaction'
import PlaidWrapper from '#providers/Plaid/Plaid'
import * as Plaid from 'plaid'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized signal') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function deadline(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Barrier not reached')), 10_000) })]) }
  finally { if (timer) clearTimeout(timer) }
}
async function waitForGate(pid: number) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const result = await db.rawQuery(`SELECT query FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`, [pid])
    if (result.rows.some((row: { query: string }) => row.query.includes('applications') && /for update/i.test(row.query))) return
  }
  throw new Error('Budget waiter not observed')
}
type Operation = () => Promise<void>
async function contend(categoryId: number, remove: boolean, first: Operation, second: Operation,
  options: { rollback?: boolean, independent?: boolean } = {}) {
  const entered = signal(); const release = signal()
  let pid = 0; let held = false
  const key = remove ? 'delete' : 'save'
  const originalSave = Category.prototype.save
  const originalDelete = Category.prototype.delete
  const interception = mock.method(Category.prototype, key, async function (this: Category) {
    const result = remove ? await originalDelete.call(this) : await originalSave.call(this)
    if (this.id === categoryId && !held) {
      held = true
      if (!this.$trx) throw new Error('Financial work escaped owning transaction')
      pid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
      entered.resolve(); await release.promise
      if (options.rollback) throw new Error('Injected late bounded writer failure')
    }
    return result
  })
  const a = first(); void a.catch(() => undefined)
  let b: Promise<void> | undefined
  try {
    await deadline(entered.promise)
    b = second(); void b.catch(() => undefined)
    if (options.independent) await deadline(b)
    else await waitForGate(pid)
  } finally {
    release.resolve(); await Promise.allSettled([a, ...(b ? [b] : [])]); interception.mock.restore()
  }
  await a; await b
}
async function poolReadContention(f: { budget: Budget }, first: Operation, second: Operation) {
  const entered = signal(); const release = signal()
  let pid = 0; let held = false
  const reads: number[] = []
  const original = Budget.prototype.getFundingPoolCategory
  const interception = mock.method(Budget.prototype, 'getFundingPoolCategory', async function (this: Budget, ...args: Parameters<Budget['getFundingPoolCategory']>) {
    const value = await original.apply(this, args)
    if (this.id === f.budget.id) {
      ok(value.$trx, 'Pool hydration must use owning transaction')
      reads.push(value.balance)
    }
    if (this.id === f.budget.id && !held) {
      held = true
      if (!value.$trx) throw new Error('Pool read escaped transaction')
      pid = (await value.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
      entered.resolve(); await release.promise
    }
    return value
  })
  const a = first(); void a.catch(() => undefined)
  let b: Promise<void> | undefined
  try {
    await deadline(entered.promise); b = second(); void b.catch(() => undefined)
    await waitForGate(pid)
  } finally {
    release.resolve(); await Promise.allSettled([a, ...(b ? [b] : [])]); interception.mock.restore()
  }
  await a; await b
  deepStrictEqual(reads, [100, 110]) // Initialization, then the required-Pool funding preflight after waiting.
}
let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `pool-gate-${++sequence}`,
      email: `pool-gate-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Existing bank' })
    const account = await institution.related('accounts').create({ name: 'Existing', balance: 100,
      type: AccountType.Credit, subtype: 'credit card', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), initialized: true, enabled: true, closed: false, rate: 0 })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await account.updateStartingBalance(budget, pool); await pool.save()
    const group = await budget.related('groups').create({ name: 'Targets', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Target', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const other = await group.related('categories').create({ name: 'Other', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    return { budget, user, institution, account, pool, group, category, other }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function offlineBody(amount = 10, tracking = TrackingType.Transactions) {
  return { institution: { name: 'New offline bank' }, startDate: '2025-01-01',
    accounts: [{ name: 'New offline', balance: amount, type: AccountType.Depository, subtype: 'checking', tracking }] }
}
async function initialize(client: ApiClient, f: Fixture, amount = 10, status = 200) {
  const response = await client.post('/api/v1/institution').json(offlineBody(amount)).loginAs(f.user)
  response.assertStatus(status)
}
async function funding(client: ApiClient, f: Fixture, type = 2, amount = 20, status = 200) {
  const response = await client.post('/api/v1/category-transfer').json({ type, date: '2025-02-10',
    categories: [{ categoryId: f.category.id, amount }, { categoryId: f.pool.id, amount: -amount }] }).loginAs(f.user)
  response.assertStatus(status)
}
async function create(client: ApiClient, f: Fixture, categoryId = f.category.id, status = 200) {
  const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(transactionRequest({ date: '2025-02-10', name: 'Gate posting',
    amount: 10, categories: [{ categoryId, amount: 10 }] })).loginAs(f.user)
  response.assertStatus(status)
}
async function remove(client: ApiClient, f: Fixture, status: number, id = f.category.id) {
  const response = await client.delete(`/api/v1/groups/${f.group.id}/categories/${id}`).loginAs(f.user)
  response.assertStatus(status)
}
async function state() {
  const result: Record<string, { id: number }[]> = {}
  for (const table of ['institutions', 'accounts', 'categories', 'transactions', 'account_transactions', 'statements', 'transaction_logs']) {
    result[table] = await db.from(table).orderBy('id')
  }
  return result
}
async function pool(f: Fixture, expected: number) { equal((await Category.findOrFail(f.pool.id)).balance, expected) }
async function openings(f: Fixture, count: number) {
  const rows = await Transaction.query().where('budgetId', f.budget.id).where('type', 4)
  equal(rows.length, count)
  for (const row of rows) {
    equal(row.date.toISODate(), '2025-01-01')
    const links = await row.related('accountTransaction').query().firstOrFail()
    equal(row.categories[0].amount, links.amount)
  }
}
function ofx() {
  return 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><SIGNONMSGSRSV1><SONRS><FI><FID>123</FI></SONRS></SIGNONMSGSRSV1>'
    + '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>gate</CCACCTFROM>'
    + '<BANKTRANLIST><STMTTRN><DTPOSTED>20250210120000[0:GMT]<TRNAMT>10<FITID>gate-new<NAME>Gate posting</STMTTRN></BANKTRANLIST>'
    + '<LEDGERBAL><BALAMT>999</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>'
}

// New OFX imports use Unassigned, not Plaid auto-assignment. Restore an
// explicitly allocated OFX record to exercise a real named-Category path.
async function restorableOfx(client: ApiClient, f: Fixture) {
  ;(await client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(ofx()).type('text/plain').loginAs(f.user)).assertStatus(200)
  const target = await f.budget.related('transactions').query().where('type', 0).firstOrFail()
  ;(await client.patch(`/api/v1/transaction/${target.id}`).json(transactionRequest({ version: target.version,
    categories: [{ categoryId: f.category.id, amount: 10 }] })).loginAs(f.user)).assertStatus(200)
  ;(await client.delete(`/api/v1/transaction/${target.id}`).loginAs(f.user)).assertStatus(200)
  equal((await Category.findOrFail(f.category.id)).balance, 0)
}

function providerTransaction(accountId: string, id: string, overrides: Partial<Plaid.Transaction> = {}): Plaid.Transaction {
  return {
    account_id: accountId, transaction_id: id, amount: 10, date: '2025-02-10', name: 'Provider purchase', merchant_name: null,
    iso_currency_code: 'USD', unofficial_currency_code: null, location: { address: null, city: null, region: null, postal_code: null, country: null, lat: null, lon: null, store_number: null },
    payment_meta: { reference_number: null, ppd_id: null, payee: null, by_order_of: null, payer: null, payment_method: null, payment_processor: null, reason: null },
    pending: false, pending_transaction_id: null, account_owner: null, authorized_date: null,
    authorized_datetime: null, datetime: null, payment_channel: Plaid.TransactionPaymentChannelEnum.Online,
    transaction_code: null, ...overrides,
  }
}

function providerAccount(id: string): Plaid.AccountBase {
  return {
    account_id: id, name: 'Provider checking', official_name: null, mask: '1234',
    type: Plaid.AccountType.Depository, subtype: Plaid.AccountSubtype.Checking,
    balances: { available: 100, current: 100, limit: null, iso_currency_code: 'USD', unofficial_currency_code: null },
  }
}

function page(accounts: Plaid.AccountBase[], cursor: string, overrides: Partial<Plaid.TransactionsSyncResponse> = {}): Plaid.TransactionsSyncResponse {
  return {
    accounts, added: [], modified: [], removed: [], next_cursor: cursor, has_more: false,
    transactions_update_status: Plaid.TransactionsUpdateStatus.HistoricalUpdateComplete, request_id: 'fake-sync', ...overrides,
  }
}

class GateProvider extends PlaidWrapper {
  response: Plaid.TransactionsSyncResponse | undefined
  async syncTransactions() {
    if (!this.response) throw new Error('No provider page')
    return this.response
  }
}
async function provider(f: Fixture, category = true, initial = false) {
  await f.institution.merge({ accessToken: 'fake', institutionId: 'gate-bank', plaidItemId: 'gate-item' }).save()
  const id = `pool-provider-${f.account.id}`
  await f.account.merge({ plaidAccountId: id, initialized: !initial }).save()
  if (category) {
    const rule = await f.budget.related('autoAssignment').create({ name: 'Gate rule', searchStrings: ['Gate posting'] })
    await rule.related('categories').create({ categoryId: f.category.id, amount: 100, percentage: true })
  }
  const fake = new GateProvider(app.config.get('plaid'))
  const account = providerAccount(id)
  account.balances.current = initial ? -120 : -110 // Credit provider balance is negated by existing lifecycle.
  fake.response = page([account], 'c1', { added: [providerTransaction(id, `gate-new-${f.account.id}`, {
    amount: initial ? 10 : -10, name: 'Gate posting' })] })
  app.container.swap(PlaidWrapper, () => fake)
  return () => app.container.restore(PlaidWrapper)
}
async function sync(client: ApiClient, f: Fixture, status = 200) {
  const response = await client.post(`/api/v1/institution/${f.institution.id}/accounts/${f.account.id}/transactions/sync`).loginAs(f.user)
  response.assertStatus(status)
}

test.group('Bounded offline Pool concurrency', (group) => {
  group.each.timeout(30_000)
  test('initialization and funding preserve100+10−20=90 in both orders').with([true, false])
    .run(async ({ client }, initFirst) => {
      const f = await fixture()
      const a = () => initialize(client, f); const b = () => funding(client, f)
      if (initFirst) await poolReadContention(f, a, b)
      else await contend(f.pool.id, false, b, a)
      await pool(f, 90); equal((await Category.findOrFail(f.category.id)).balance, 20)
      await openings(f, 2)
      equal((await Account.query().whereHas('institution', (q) => q.where('budgetId', f.budget.id)).where('name', 'New offline').firstOrFail()).balance, 10)
      equal((await f.budget.related('transactions').query().where('type', 2)).length, 1)
      equal((await f.institution.related('accounts').query().firstOrFail()).balance, 100)
    })
  test('waiting initialization hydrates committed Pool80 through its owning transaction', async ({ client }) => {
    const f = await fixture()
    const original = Budget.prototype.getFundingPoolCategory
    const reads: number[] = []
    const hook = mock.method(Budget.prototype, 'getFundingPoolCategory', async function (this: Budget, ...args: Parameters<Budget['getFundingPoolCategory']>) {
      const value = await original.apply(this, args)
      if (this.id === f.budget.id) {
        equal(value.$trx, this.$trx)
        ok(value.$trx)
        reads.push(value.balance)
      }
      return value
    })
    try {
      await contend(f.pool.id, false, () => funding(client, f), () => initialize(client, f))
      deepStrictEqual(reads, [100, 80]); await pool(f, 90)
    } finally { hook.mock.restore() }
  })
  test('separate initializations both compose', async ({ client }) => {
    const f = await fixture()
    await contend(f.pool.id, false, () => initialize(client, f, 10), () => initialize(client, f, 20))
    await pool(f, 130); await openings(f, 3)
    deepStrictEqual((await Account.query().whereHas('institution', (q) => q.where('budgetId', f.budget.id)).where('name', 'New offline').orderBy('balance')).map((row) => row.balance), [10, 20])
  })
  test('initialization composes with startDate opening change', async ({ client }) => {
    const f = await fixture(); await create(client, f)
    // Current balance110; moving start past+10 changes opening100→110 (Pool+10).
    await contend(f.pool.id, false, () => initialize(client, f), async () => {
      const response = await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-03-01' }).loginAs(f.user)
      response.assertStatus(200)
    })
    await pool(f, 120); equal((await Account.findOrFail(f.account.id)).balance, 110)
    equal((await Category.findOrFail(f.category.id)).balance, 0)
    const opening = await f.account.related('accountTransactions').query().whereHas('transaction', (q) => q.where('type', 4)).preload('transaction').firstOrFail()
    equal(opening.amount, 110); equal(opening.transaction.date.toISODate(), '2025-03-01')
  })
  test('offline and provider first opening both survive', async ({ client }) => {
    const f = await fixture(); const restore = await provider(f, false, true)
    try {
      await contend(f.pool.id, false, () => initialize(client, f), () => sync(client, f))
      await pool(f, 140) // initial provider Account120; posted−10; opening130 replaces100, plus offline10.
      equal((await Account.findOrFail(f.account.id)).balance, 120)
      equal((await f.institution.refresh()).cursor, 'c1')
      equal((await f.budget.getUnassignedCategory()).balance, -10)
    } finally { restore() }
  })
  test('late initialization rollback releases gate; funding reloads original Pool', async ({ client }) => {
    const f = await fixture()
    await contend(f.pool.id, false, () => initialize(client, f, 10, 500), () => funding(client, f), { rollback: true })
    await pool(f, 80); await openings(f, 1)
    equal((await f.budget.related('institutions').query()).length, 1)
    equal((await Account.query().whereHas('institution', (q) => q.where('budgetId', f.budget.id))).length, 1)
    equal((await Category.findOrFail(f.category.id)).balance, 20)
  })
  test('different Budgets initialize independently', async ({ client }) => {
    const a = await fixture(); const b = await fixture()
    await contend(a.pool.id, false, () => initialize(client, a), () => initialize(client, b), { independent: true })
    await pool(a, 110); await pool(b, 110); await openings(a, 2); await openings(b, 2)
  })
  test('mixed batch and all-Balances initialization preserve their own lifecycles').with([false, true])
    .run(async ({ client }, allBalances) => {
      const f = await fixture()
      const body = offlineBody()
      body.accounts = (allBalances ? [10, 20] : [10, 20, -5, 7]).map((balance, i) => ({
        ...offlineBody(balance).accounts[0], tracking: allBalances || i === 3 ? TrackingType.Balances : TrackingType.Transactions }))
      const response = await client.post('/api/v1/institution').json(body).loginAs(f.user)
      response.assertStatus(200)
      await pool(f, allBalances ? 100 : 125); await openings(f, allBalances ? 1 : 4)
      equal((await db.from('statements').whereIn('account_id', db.from('accounts').select('id').whereIn('institution_id', db.from('institutions').select('id').where('application_id', f.budget.id)))).length, allBalances ? 2 : 1)
    })
  test('existing-Institution creation keeps no-opening/no-Pool behavior', async ({ client }) => {
    const f = await fixture()
    const response = await client.post(`/api/v1/institution/${f.institution.id}/accounts`).json({
      ...offlineBody().accounts[0], startDate: '2025-01-01', rate: 0 }).loginAs(f.user)
    response.assertStatus(200); await pool(f, 100); await openings(f, 1)
  })
})

test.group('Category deletion admission vs protected writers', (group) => {
  group.each.timeout(30_000)
  test('fresh membership query and Category deletion share the Budget-owning execution transaction', async ({ client }) => {
    const f = await fixture()
    const originalQuery = db.query.bind(db)
    const originalDelete = Category.prototype.delete
    let membershipTrx: TransactionClientContract | undefined
    let membershipSeen = false
    const queryHook = mock.method(db, 'query', () => {
      const query = originalQuery()
      const originalUse = query.useTransaction.bind(query)
      const originalFirst = query.first.bind(query)
      let owner: TransactionClientContract | undefined
      query.useTransaction = (trx) => { owner = trx; return originalUse(trx) }
      query.first = async () => {
        if (query.toSQL().sql.includes('jsonb_array_elements')) {
          ok(owner, 'Membership query must bind owning transaction')
          membershipTrx = owner
          const locks = await owner.rawQuery(`SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid()
            AND relation = 'applications'::regclass AND mode = 'RowShareLock' AND granted`)
          ok(locks.rows.length, 'Budget FOR UPDATE must precede membership admission')
          membershipSeen = true
        }
        return originalFirst()
      }
      return query
    })
    const deleteHook = mock.method(Category.prototype, 'delete', async function (this: Category) {
      if (this.id === f.category.id) { ok(membershipSeen); equal(this.$trx, membershipTrx) }
      return originalDelete.call(this)
    })
    try {
      await remove(client, f, 204)
      ok(membershipSeen); equal(await Category.find(f.category.id), null)
    } finally { deleteHook.mock.restore(); queryHook.mock.restore() }
  })
  const writers = ['create', 'patch', 'funding', 'rebalance', 'ofx', 'plaid'] as const
  test('posting wins gate; delete waiter observes usage and rejects').with([...writers]).run(async ({ client }, writer) => {
    const f = await fixture()
    let targetId = 0
    if (writer === 'patch') {
      await create(client, f, f.other.id)
      targetId = (await f.budget.related('transactions').query().where('type', 5).firstOrFail()).id
    }
    let restore: () => void = () => undefined
    if (writer === 'plaid') restore = await provider(f)
    if (writer === 'ofx') {
      await restorableOfx(client, f)
    }
    const post = async () => {
      if (writer === 'create') return create(client, f)
      if (writer === 'funding' || writer === 'rebalance') return funding(client, f, writer === 'funding' ? 2 : 3, 10)
      if (writer === 'plaid') return sync(client, f)
      const response = writer === 'ofx'
        ? await client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(ofx()).type('text/plain').loginAs(f.user)
        : await client.patch(`/api/v1/transaction/${targetId}`).json(transactionRequest({ version: 0, categories: [{ categoryId: f.category.id, amount: 10 }] })).loginAs(f.user)
      response.assertStatus(200)
    }
    try {
      await contend(f.category.id, false, post, () => remove(client, f, 409))
      equal((await Category.findOrFail(f.category.id)).balance, 10)
      const rows = await f.budget.related('transactions').query().where('deleted', false)
      ok(rows.some((row) => row.categories.some((split) => split.categoryId === f.category.id && split.amount === 10)))
      await pool(f, writer === 'funding' || writer === 'rebalance' ? 90 : 100)
    } finally { restore() }
  })
  test('delete wins; waiting writer fails without orphan JSON or partial financial state')
    .with(['create', 'patch', 'funding', 'rebalance'] as const).run(async ({ client }, writer) => {
      const f = await fixture(); let id = 0
      if (writer === 'patch') { await create(client, f, f.other.id); id = (await f.budget.related('transactions').query().where('type', 5).firstOrFail()).id }
      const before = await state(); before.categories = before.categories.filter((row) => row.id !== f.category.id)
      await contend(f.category.id, true, () => remove(client, f, 204), async () => {
        if (writer === 'create') return create(client, f, f.category.id, 404)
        if (writer === 'funding' || writer === 'rebalance') return funding(client, f, writer === 'funding' ? 2 : 3, 10, 404)
        const response = await client.patch(`/api/v1/transaction/${id}`).json(transactionRequest({ version: 0, categories: [{ categoryId: f.category.id, amount: 10 }] })).loginAs(f.user)
        response.assertStatus(404)
      })
      deepStrictEqual(await state(), before)
    })
  test('delete precedes provider allocation; provider rolls back without orphan usage')
    .with(['ofx', 'plaid']).run(async ({ client }, writer) => {
      const f = await fixture()
      let restore: () => void = () => undefined
      if (writer === 'plaid') restore = await provider(f)
      else {
        await restorableOfx(client, f)
      }
      const before = await state(); before.categories = before.categories.filter((row) => row.id !== f.category.id)
      try {
        await contend(f.category.id, true, () => remove(client, f, 204), async () => {
          if (writer === 'plaid') return sync(client, f, 404)
          const response = await client.post(`/api/v1/account/${f.account.id}/ofx`).unsafeJson(ofx()).type('text/plain').loginAs(f.user)
          // Preserve the existing HTTP OFX catch/500 contract, not a new error architecture.
          response.assertStatus(500)
        })
        deepStrictEqual(await state(), before)
      } finally { restore() }
    })
  test('PATCH removes final usage; waiter deletes now-unused Category', async ({ client }) => {
    const f = await fixture(); await create(client, f)
    const target = await f.budget.related('transactions').query().where('type', 5).firstOrFail()
    await contend(f.category.id, false, async () => {
      const response = await client.patch(`/api/v1/transaction/${target.id}`).json(transactionRequest({ version: 0, categories: [{ categoryId: f.other.id, amount: 10 }] })).loginAs(f.user)
      response.assertStatus(200)
    }, () => remove(client, f, 204))
    equal(await Category.find(f.category.id), null); equal((await Category.findOrFail(f.other.id)).balance, 10)
    deepStrictEqual((await target.refresh()).categories, [{ categoryId: f.other.id, amount: 10 }]); equal(target.version, 1)
    await pool(f, 100)
  })
  test('startDate crossing changes effect but active nominal membership still blocks deletion', async ({ client }) => {
    const f = await fixture(); await create(client, f)
    await contend(f.category.id, false, async () => {
      const response = await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-03-01' }).loginAs(f.user)
      response.assertStatus(200)
    }, () => remove(client, f, 409))
    equal((await Category.findOrFail(f.category.id)).balance, 0); equal((await Account.findOrFail(f.account.id)).balance, 110)
    await pool(f, 110)
  })
  test('same/different Category deletes serialize in one Budget').with([false, true]).run(async ({ client }, different) => {
    const f = await fixture()
    await contend(f.category.id, true, () => remove(client, f, 204), () => remove(client, f, different ? 204 : 404, different ? f.other.id : f.category.id))
    equal(await Category.find(f.category.id), null)
    equal(Boolean(await Category.find(f.other.id)), !different)
  })
  test('late deletion rollback restores Category for waiting CREATE', async ({ client }) => {
    const f = await fixture()
    await contend(f.category.id, true, () => remove(client, f, 500), () => create(client, f), { rollback: true })
    equal((await Category.findOrFail(f.category.id)).balance, 10)
    equal((await Account.findOrFail(f.account.id)).balance, 110); await pool(f, 100)
    equal((await f.budget.related('transactions').query().where('type', 5)).length, 1)
  })
  test('different-Budget Category deletion does not wait', async ({ client }) => {
    const a = await fixture(); const b = await fixture()
    await contend(a.category.id, true, () => remove(client, a, 204), () => remove(client, b, 204), { independent: true })
    equal(await Category.find(a.category.id), null); equal(await Category.find(b.category.id), null)
  })
  test('foreign Group/Category rejects without financial mutation').with(['group', 'category']).run(async ({ client }, scope) => {
    const own = await fixture(); const foreign = await fixture(); const before = await state()
    const response = await client.delete(`/api/v1/groups/${scope === 'group' ? foreign.group.id : own.group.id}/categories/${foreign.category.id}`).loginAs(own.user)
    response.assertStatus(404); deepStrictEqual(await state(), before)
  })
})
