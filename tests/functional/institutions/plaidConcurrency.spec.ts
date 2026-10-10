import { mock } from 'node:test'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import PlaidWrapper from '#providers/Plaid/Plaid'
import Budget from '#models/Budget'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Institution from '#models/Institution'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0

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

async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `plaid-concurrent-${++sequence}`, email: `plaid-concurrent-${sequence}@example.com`, password: 'testPassw0rd' })
    const shared = await budget.related('users').create({ username: `plaid-concurrent-shared-${sequence}`, email: `plaid-concurrent-shared-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Sync bank', institutionId: `sync-${sequence}`, accessToken: 'fake-token', plaidItemId: `sync-item-${sequence}`, cursor: null })
    const createAccount = (suffix: string) => institution.related('accounts').create({
      name: `Checking ${suffix}`, plaidAccountId: `sync-account-${sequence}-${suffix}`, balance: 100,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, enabled: true, closed: false, initialized: true,
    })
    const account = await createAccount('A')
    const other = await createAccount('B')
    const unassigned = await budget.getUnassignedCategory({ client: trx })
    const statement = await account.related('statements').create({ startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'), startingBalance: 100, endingBalance: 90 })
    return { budget, user, shared, institution, account, other, unassigned, statement }
  })
}

function barrier() {
  let resolve: () => void = () => { throw new Error('Uninitialized barrier') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

class ConcurrentFake extends PlaidWrapper {
  plans = new Map<Institution, (Plaid.TransactionsSyncResponse | Error)[]>()
  fallbackResponse: Plaid.TransactionsSyncResponse | undefined
  calls: { institutionId: number, cursor: string | null }[] = []
  entered = barrier()
  release = barrier()
  hold = true
  active = 0
  maximumActive = 0

  async syncTransactions(institution: Institution, cursor: string | null) {
    this.calls.push({ institutionId: institution.id, cursor })
    this.active++
    this.maximumActive = Math.max(this.maximumActive, this.active)
    try {
      if (this.hold) { this.entered.resolve(); await this.release.promise }
      const response = this.plans.has(institution) ? this.plans.get(institution)?.shift() : this.fallbackResponse
      if (!response) throw new Error('Unexpected concurrent provider request')
      if (response instanceof Error) throw response
      return response
    } finally { this.active-- }
  }
}

test.group('Concurrent Plaid synchronization', (group) => {
  let f: Awaited<ReturnType<typeof fixture>>
  let fake: ConcurrentFake
  group.each.setup(async () => {
    f = await fixture()
    fake = new ConcurrentFake(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => fake)
    return () => { fake.release.resolve(); app.container.restore(PlaidWrapper) }
  })
  function providerId() {
    if (!f.account.plaidAccountId) throw new Error('Missing fixture provider ID')
    return f.account.plaidAccountId
  }
  const purchase = (id = 'purchase', overrides: Partial<Plaid.Transaction> = {}) => providerTransaction(providerId(), id, overrides)
  const response = (cursor: string, overrides: Partial<Plaid.TransactionsSyncResponse> = {}) => page([providerAccount(providerId())], cursor, overrides)

  async function prepare(id = f.institution.id) {
    const trx = await db.transaction()
    const institution = await Institution.findOrFail(id, { client: trx })
    const pid = await trx.rawQuery('SELECT pg_backend_pid() AS pid, current_setting(\'transaction_isolation\') AS isolation')
    return { institution, trx, pid: pid.rows[0].pid, isolation: pid.rows[0].isolation }
  }
  async function execute(operation: Awaited<ReturnType<typeof prepare>>) {
    try { await operation.institution.syncUpdate(); await operation.trx.commit(); return 'committed' }
    catch (error) { await operation.trx.rollback(); throw error }
  }
  async function blocked(pid?: number) {
    for (let i = 0; i < 200; i++) {
      const result = pid === undefined
        ? await db.rawQuery("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%applications%'")
        : await db.rawQuery("SELECT wait_event_type, query FROM pg_stat_activity WHERE pid=? AND wait_event_type='Lock'", [pid])
      if (result.rows[0]?.query.includes('applications')) return
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('Second genuine sync did not wait on the budget lock')
  }
  async function overlap(first: (Plaid.TransactionsSyncResponse | Error)[], second = first, failure?: 'persistence' | 'cursor', failing: 'first' | 'second' = 'first') {
    // Both models are loaded from the same persisted cursor before either sync starts.
    const a = await prepare()
    const b = await prepare()
    fake.plans.set(a.institution, [...first]); fake.plans.set(b.institution, [...second])
    const saveTransaction = Transaction.prototype.save
    const saveInstitution = Institution.prototype.save
    const fault = failure === 'persistence'
      ? mock.method(Transaction.prototype, 'save', async function (this: Transaction) {
        if (this.$trx === (failing === 'first' ? a.trx : b.trx)) throw new Error('Synthetic financial persistence failure')
        return saveTransaction.call(this)
      })
      : failure === 'cursor' ? mock.method(Institution.prototype, 'save', async function (this: Institution) {
        if (this.$trx === (failing === 'first' ? a.trx : b.trx)) throw new Error('Synthetic cursor persistence failure')
        return saveInstitution.call(this)
      }) : undefined
    const runningA = execute(a).then((value) => value, (error: unknown) => error)
    await fake.entered.promise
    const runningB = execute(b).then((value) => value, (error: unknown) => error)
    try {
      await blocked(b.pid)
      if (fake.calls.length !== 1) throw new Error('Blocked sync called the provider early')
      if (a.isolation !== 'read committed' || b.isolation !== 'read committed') throw new Error('Unexpected test isolation')
    } finally { fake.hold = false; fake.release.resolve() }
    try { return await Promise.all([runningA, runningB]) }
    finally { fault?.mock.restore() }
  }
  async function local() {
    const at = await AccountTransaction.query().where('accountId', f.account.id).where('providerTransactionId', 'purchase').firstOrFail()
    return { at, transaction: await Transaction.findOrFail(at.transactionId) }
  }
  async function seed(pending = false) {
    const operation = await prepare()
    fake.hold = false
    fake.plans.set(operation.institution, [response('seed', { added: [purchase('purchase', { pending })] })])
    await execute(operation)
    fake.hold = true; fake.entered = barrier(); fake.release = barrier(); fake.calls = []; fake.maximumActive = 0
  }

  test('same original cursor and duplicate page apply one logical purchase', async ({ assert }) => {
    const results = await overlap([response('c1', { added: [purchase()] })])
    assert.deepEqual(results, ['committed', 'committed'])
    assert.equal(fake.maximumActive, 1)
    assert.deepEqual(fake.calls.map((call) => call.cursor), [null, null])
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 1)
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 1)
    const { at, transaction } = await local()
    assert.equal(at.providerTransactionId, 'purchase'); assert.equal(transaction.version, 0)
    assert.lengthOf(await transaction.related('transactionLog').query(), 1)
    assert.equal((await f.account.refresh()).balance, 90)
    assert.equal((await f.unassigned.refresh()).balance, -10)
    assert.equal((await f.institution.refresh()).cursor, 'c1'); assert.isNotNull(f.institution.syncDate)
  })

  test('two-page overlap commits complete pagination once', async ({ assert }) => {
    const results = await overlap([response('c1', { added: [purchase()], has_more: true }), response('c2', { added: [purchase('second', { amount: 2.25 })] })])
    assert.deepEqual(results, ['committed', 'committed'])
    assert.deepEqual(fake.calls.map((call) => call.cursor), [null, 'c1', null, 'c1'])
    assert.equal(fake.maximumActive, 1)
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 2)
    assert.equal((await f.account.refresh()).balance, 87.75)
    assert.equal((await f.unassigned.refresh()).balance, -12.25)
    assert.equal((await f.institution.refresh()).cursor, 'c2')
  })

  test('concurrent modifications apply the financial delta and log once').with(['amount', 'date', 'pending replacement']).run(async ({ assert }, kind) => {
    await seed(kind === 'pending replacement')
    const before = await local()
    const logs = await before.transaction.related('transactionLog').query()
    const overrides: Partial<Plaid.Transaction> = kind === 'amount' ? { amount: 12.25 }
      : kind === 'date' ? { date: '2024-12-31' }
      : { transaction_id: 'posted', pending_transaction_id: 'purchase', pending: false }
    assert.deepEqual(await overlap([response('c2', { modified: [purchase('purchase', overrides)] })]), ['committed', 'committed'])
    const at = await AccountTransaction.findOrFail(before.at.id)
    const transaction = await Transaction.findOrFail(before.transaction.id)
    const expected = kind === 'amount' ? -12.25 : kind === 'date' ? 0 : -10
    assert.equal((await f.account.refresh()).balance, 100 + expected)
    assert.equal((await f.unassigned.refresh()).balance, expected)
    assert.equal(transaction.version, before.transaction.version + 1)
    assert.lengthOf(await transaction.related('transactionLog').query(), logs.length + 1)
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 1)
    assert.equal(at.providerTransactionId, kind === 'pending replacement' ? 'posted' : 'purchase')
  })

  test('concurrent removal reverses once and preserves statement linkage and identity', async ({ assert }) => {
    await seed()
    const before = await local()
    before.at.statementId = f.statement.id; await before.at.save()
    const logs = await before.transaction.related('transactionLog').query()
    assert.deepEqual(await overlap([response('c2', { removed: [{ account_id: providerId(), transaction_id: 'purchase' }] })]), ['committed', 'committed'])
    const after = await local()
    assert.equal(after.at.id, before.at.id); assert.equal(after.at.statementId, f.statement.id)
    assert.isTrue(after.transaction.deleted)
    assert.equal(after.transaction.version, before.transaction.version)
    assert.lengthOf(await after.transaction.related('transactionLog').query(), logs.length + 1)
    assert.equal((await f.account.refresh()).balance, 100)
    assert.equal((await f.unassigned.refresh()).balance, 0)
  })

  test('later delta from the original cursor converges to newer provider data', async ({ assert }) => {
    assert.deepEqual(await overlap([response('c1', { added: [purchase()] })], [response('c2', { added: [purchase('purchase', { amount: 15.75 }), purchase('second', { amount: 1.25 })] })]), ['committed', 'committed'])
    assert.equal((await f.account.refresh()).balance, 83)
    assert.equal((await f.unassigned.refresh()).balance, -17)
    assert.equal((await f.institution.refresh()).cursor, 'c2')
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 2)
  })

  test('a failed overlapping sync cannot corrupt the successful sync').with(['provider', 'persistence', 'cursor']).run(async ({ assert }, failure) => {
    const good = [response('c1', { added: [purchase()] })]
    const results = await overlap(failure === 'provider' ? [new Error('Synthetic provider failure')] : good, good, failure === 'persistence' ? 'persistence' : failure === 'cursor' ? 'cursor' : undefined)
    assert.instanceOf(results[0], Error); assert.equal(results[1], 'committed')
    assert.equal((await f.account.refresh()).balance, 90)
    assert.equal((await f.unassigned.refresh()).balance, -10)
    assert.equal((await f.institution.refresh()).cursor, 'c1')
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 1)
  })

  test('successful commit survives failure of the second overlapping sync').with(['provider', 'persistence', 'cursor']).run(async ({ assert }, failure) => {
    const good = [response('c1', { added: [purchase()] })]
    const results = await overlap(good, failure === 'provider' ? [new Error('Synthetic second provider failure')] : [response('c2', { added: [purchase('uncommitted')] })], failure === 'persistence' ? 'persistence' : failure === 'cursor' ? 'cursor' : undefined, 'second')
    assert.equal(results[0], 'committed'); assert.instanceOf(results[1], Error)
    assert.equal((await f.account.refresh()).balance, 90)
    assert.equal((await f.unassigned.refresh()).balance, -10)
    assert.equal((await f.institution.refresh()).cursor, 'c1')
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 1)
    const { transaction } = await local()
    assert.equal(transaction.version, 0)
    assert.lengthOf(await transaction.related('transactionLog').query(), 1)
  })

  test('different budgets can synchronize concurrently', async ({ assert }) => {
    const other = await fixture()
    const a = await prepare()
    const b = await prepare(other.institution.id)
    fake.plans.set(a.institution, [response('c1')])
    fake.plans.set(b.institution, [page([], 'other-c1')])
    const results = [execute(a), execute(b)]
    try {
      for (let i = 0; i < 200 && fake.maximumActive < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5))
      assert.equal(fake.maximumActive, 2)
    } finally { fake.hold = false; fake.release.resolve() }
    assert.deepEqual(await Promise.all(results), ['committed', 'committed'])
    assert.equal((await f.institution.refresh()).cursor, 'c1')
    assert.equal((await other.institution.refresh()).cursor, 'other-c1')
  })

  test('different institutions sharing a budget also serialize on its financial lock', async ({ assert }) => {
    const institution = await f.budget.related('institutions').create({ name: 'Second bank', institutionId: `second-${sequence}`, accessToken: 'fake-token', plaidItemId: `second-item-${sequence}`, cursor: null })
    const a = await prepare()
    const b = await prepare(institution.id)
    fake.plans.set(a.institution, [response('c1')]); fake.plans.set(b.institution, [page([], 'other-c1')])
    const runningA = execute(a)
    await fake.entered.promise
    const runningB = execute(b)
    try { await blocked(b.pid); assert.equal(fake.calls.length, 1) }
    finally { fake.hold = false; fake.release.resolve() }
    assert.deepEqual(await Promise.all([runningA, runningB]), ['committed', 'committed'])
    assert.equal(fake.maximumActive, 1)
  })


  test('HTTP manual synchronization shares the lock with another entry point').with(['manual HTTP', 'worker transaction']).run(async ({ client, assert }, entry) => {
    fake.fallbackResponse = response('c1', { added: [purchase()] })
    const worker = entry === 'worker transaction' ? await prepare() : undefined
    const url = `/api/v1/institution/${f.institution.id}/accounts/${f.account.id}/transactions/sync`
    const first = client.post(url).loginAs(f.user).then((result) => { result.assertStatus(200) })
    await fake.entered.promise
    const second = worker ? execute(worker) : client.post(url).loginAs(f.shared).then((result) => { result.assertStatus(200); return 'committed' })
    try { await blocked(worker?.pid); assert.equal(fake.calls.length, 1) }
    finally { fake.hold = false; fake.release.resolve() }
    await Promise.all([first, second])
    assert.equal(fake.maximumActive, 1)
    assert.equal((await f.account.refresh()).balance, 90)
    assert.equal((await f.unassigned.refresh()).balance, -10)
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 1)
    assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 1)
  })

})
