import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import PlaidWrapper from '#providers/Plaid/Plaid'
import Budget from '#models/Budget'
import Account from '#models/Account'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Institution from '#models/Institution'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

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

class SyncFake extends PlaidWrapper {
  responses: (Plaid.TransactionsSyncResponse | Error)[] = []
  cursors: (string | null)[] = []

  async syncTransactions(_institution: Institution, cursor: string | null): Promise<Plaid.TransactionsSyncResponse> {
    this.cursors.push(cursor)
    const response = this.responses.shift()
    if (!response) throw new Error('Unexpected sync call: fake responses exhausted')
    if (response instanceof Error) throw response
    return response
  }
}

async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `plaid-sync-${++sequence}`, email: `plaid-sync-${sequence}@example.com`, password: 'testPassw0rd' })
    const shared = await budget.related('users').create({ username: `plaid-shared-${sequence}`, email: `plaid-shared-${sequence}@example.com`, password: 'testPassw0rd' })
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

// Capture raw persisted rows, including identities, local fields, logs and cursor. A failed sync must restore all of them.
async function snapshot() {
  const tables = ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs', 'institutions']
  const result: Record<string, unknown[]> = {}
  for (const table of tables) result[table] = await db.from(table).orderBy('id')
  return result
}

test.group('Plaid sync characterization', (group) => {
  let f: Awaited<ReturnType<typeof fixture>>
  let fake: SyncFake
  group.each.setup(async () => {
    f = await fixture()
    fake = new SyncFake(app.config.get('plaid'))
    app.container.swap(PlaidWrapper, () => fake)
    return () => app.container.restore(PlaidWrapper)
  })

  function providerId(account: Account): string {
    if (!account.plaidAccountId) throw new Error('Fixture lacks provider account ID')
    return account.plaidAccountId
  }

  const accounts = () => [providerAccount(providerId(f.account)), providerAccount(providerId(f.other))]
  const purchase = (id = 'purchase', overrides: Partial<Plaid.Transaction> = {}) => providerTransaction(providerId(f.account), id, overrides)
  const url = () => `/api/v1/institution/${f.institution.id}/accounts/${f.account.id}/transactions/sync`
  async function local(id = 'purchase') {
    const at = await AccountTransaction.query().where('accountId', f.account.id).where('providerTransactionId', id).firstOrFail()
    const transaction = await Transaction.findOrFail(at.transactionId)
    return { at, transaction }
  }

  test('first sync applies posted purchases once to account and unassigned category').with([1, 3]).run(async ({ client, assert }, count) => {
    fake.responses = [page(accounts(), 'c1', { added: Array.from({ length: count }, (_, i) => purchase(`purchase-${i}`)) })]
    const response = await client.post(url()).loginAs(f.user)
    response.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - count * 10)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -count * 10)
    assert.lengthOf(await f.account.related('accountTransactions').query(), count)
    for (let i = 0; i < count; i++) {
      const { at, transaction } = await local(`purchase-${i}`)
      assert.equal(at.amount, -10)
      assert.isFalse(at.pending)
      assert.isNull(at.statementId)
      assert.isFalse(transaction.deleted)
      assert.deepEqual(transaction.categories, [{ categoryId: f.unassigned.id, amount: -10 }])
    }
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c1')
    assert.deepEqual(fake.cursors, [null])
  })

  test('pending addition allocates categories without changing the posted account balance', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('pending', { pending: true })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const { at } = await local('pending')
    assert.isTrue(at.pending)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -10)
  })

  test('multiple accounts and pages use the requested cursor and intended account identities', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()], has_more: true }), page(accounts(), 'c2', { added: [providerTransaction(providerId(f.other), 'other', { amount: -20 })] })]
    ;(await client.post(url()).loginAs(f.shared)).assertStatus(200)
    assert.deepEqual(fake.cursors, [null, 'c1'])
    assert.equal((await Account.findOrFail(f.account.id)).balance, 90)
    assert.equal((await Account.findOrFail(f.other.id)).balance, 120)
    assert.equal((await AccountTransaction.query().where('providerTransactionId', 'other').firstOrFail()).accountId, f.other.id)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, 10)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')
  })

  test('same-cursor replay is a complete persisted no-op', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await snapshot()
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.deepEqual(await snapshot(), before)
  })

  test('identical logical data with an advancing cursor does not duplicate identity or money', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    fake.responses = [page(accounts(), 'c2', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.lengthOf(await f.account.related('accountTransactions').query(), 1)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 90)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -10)
  })

  test('identical advancing-cursor replay does not create a modification version or log', async ({ client, assert }) => {
    const provider = purchase('purchase', {
      merchant_name: 'Replay merchant', account_owner: 'Replay owner',
      payment_channel: Plaid.TransactionPaymentChannelEnum.InStore,
      location: { ...purchase().location, city: 'Replay city', country: 'US' },
    })
    fake.responses = [page(accounts(), 'c1', { added: [provider] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    const userGroup = await f.budget.related('groups').create({ name: 'Replay allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'Replay category', type: CategoryType.Regular, balance: -10, fundingCategories: [] })
    before.transaction.categories = [{ categoryId: userCategory.id, amount: -10, comment: 'Replay split' }]
    before.transaction.comment = 'Replay memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    const state = await snapshot()
    const logs = await before.transaction.related('transactionLog').query()
    fake.responses = [page(accounts(), 'c2', { modified: [provider] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    const afterState = await snapshot()
    for (const table of ['account_transactions', 'accounts', 'categories', 'statements']) assert.deepEqual(afterState[table], state[table])
    assert.deepEqual({ ...after.transaction.$attributes, version: before.transaction.version }, before.transaction.$attributes)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')
    assert.isNotNull(f.institution.syncDate)
    assert.equal(after.transaction.version, before.transaction.version)
    assert.lengthOf(await after.transaction.related('transactionLog').query(), logs.length)
    assert.deepEqual(afterState.transactions, state.transactions)
    assert.deepEqual(afterState.transaction_logs, state.transaction_logs)
  })

  test('a genuine provider mutation increments version and logs once; replay does neither').with([
    { field: 'amount', changes: { amount: 15 }, pending: false, expected: { old: -10, new: -15 } },
    { field: 'date', changes: { date: '2025-02-12' }, pending: false, expected: undefined },
    { field: 'merchantName', changes: { merchant_name: 'Changed merchant' }, pending: false, expected: { old: null, new: 'Changed merchant' } },
    { field: 'name', changes: { name: 'Changed payee' }, pending: false, expected: { old: 'Provider purchase', new: 'Changed payee' } },
    { field: 'pending', changes: { pending: false, transaction_id: 'posted', pending_transaction_id: 'purchase' }, pending: true, expected: { old: true, new: false } },
  ]).run(async ({ client, assert }, { field, changes, pending, expected }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { pending })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    const logs = await before.transaction.related('transactionLog').query()
    const modified = purchase('purchase', changes)
    fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local(modified.transaction_id)
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.equal(after.at.amount, -modified.amount)
    assert.equal(after.at.pending, modified.pending)
    assert.equal(after.at.name, modified.name)
    assert.equal(after.at.merchantName, modified.merchant_name)
    assert.equal(after.transaction.date.toISODate(), modified.date)
    assert.equal(after.transaction.version, before.transaction.version + 1)
    const newLogs = await after.transaction.related('transactionLog').query().orderBy('id')
    assert.lengthOf(newLogs, logs.length + 1)
    assert.include(newLogs[newLogs.length - 1].message, 'modified a transaction')
    // The existing date-diff formatter omits date details; dirty-state detection must not.
    assert.deepEqual(newLogs[newLogs.length - 1].changes[field], expected)
    const state = await snapshot()
    fake.responses = [page(accounts(), 'c3', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const replayState = await snapshot()
    for (const table of ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs']) assert.deepEqual(replayState[table], state[table])
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c3')
  })

  test('posted amount modifications conserve account and category effects, including zero').with([
    { oldAmount: 10, newAmount: 15 },
    { oldAmount: 10, newAmount: 5 },
    { oldAmount: 10, newAmount: -5 },
    { oldAmount: -10, newAmount: -15 },
    { oldAmount: -10, newAmount: 5 },
    { oldAmount: 10, newAmount: 0 },
    { oldAmount: -10, newAmount: 0 },
    { oldAmount: 0, newAmount: 10 },
    { oldAmount: 0, newAmount: -5 },
    { oldAmount: 10, newAmount: 10 },
    { oldAmount: 10.01, newAmount: 15.02 },
  ]).run(async ({ client, assert }, { oldAmount, newAmount }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { amount: oldAmount })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    before.at.statementId = f.statement.id
    await before.at.save()
    const statements = (await snapshot()).statements
    const logs = await before.transaction.related('transactionLog').query()
    const modified = purchase('purchase', { amount: newAmount })
    fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const { at, transaction } = await local()
    assert.equal(at.id, before.at.id)
    assert.equal(transaction.id, before.transaction.id)
    assert.equal(at.providerTransactionId, 'purchase')
    assert.equal(at.statementId, f.statement.id)
    assert.equal(at.amount, -newAmount)
    assert.equal(Math.round(transaction.categories.reduce((sum, category) => sum + category.amount, 0) * 100), Math.round(-newAmount * 100))
    await f.unassigned.refresh()
    assert.equal(Math.round(f.unassigned.balance * 100), Math.round(-newAmount * 100))
    assert.equal(Math.round((await Account.findOrFail(f.account.id)).balance * 100), Math.round((100 - newAmount) * 100))
    assert.equal(transaction.version, before.transaction.version + (oldAmount === newAmount ? 0 : 1))
    assert.lengthOf(await transaction.related('transactionLog').query(), logs.length + (oldAmount === newAmount ? 0 : 1))
    assert.deepEqual((await snapshot()).statements, statements)

    // Replay preserves both financial state and mutation bookkeeping.
    const financial = await snapshot()
    fake.responses = [page(accounts(), 'c3', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const replay = await local()
    assert.equal(replay.at.id, at.id)
    assert.equal(replay.transaction.id, transaction.id)
    assert.equal(replay.at.amount, at.amount)
    assert.deepEqual(replay.transaction.categories, transaction.categories)
    assert.equal(replay.transaction.version, transaction.version)
    assert.lengthOf(await replay.transaction.related('transactionLog').query(), logs.length + (oldAmount === newAmount ? 0 : 1))
    const replayState = await snapshot()
    for (const table of ['account_transactions', 'accounts', 'categories', 'statements']) assert.deepEqual(replayState[table], financial[table])
  })

  test('modified amounts preserve user allocations and local fields while adjusting unassigned').with([15, 0, -5]).run(async ({ client, assert }, amount) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    const userGroup = await f.budget.related('groups').create({ name: 'Local allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'User category', type: CategoryType.Regular, balance: -10, fundingCategories: [] })
    before.transaction.categories = [{ categoryId: userCategory.id, amount: -10, comment: 'User split' }]
    before.transaction.comment = 'User memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { amount })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.deepEqual(after.transaction.categories, [
      { categoryId: userCategory.id, amount: -10, comment: 'User split' },
      { categoryId: f.unassigned.id, amount: 10 - amount },
    ])
    assert.equal(after.transaction.comment, 'User memo')
    assert.deepEqual(after.transaction.taxes, [{ type: 'local', amount: 3 }])
    assert.equal(after.at.statementId, f.statement.id)
    await userCategory.refresh()
    await f.unassigned.refresh()
    assert.equal(userCategory.balance, -10)
    assert.equal(f.unassigned.balance, 10 - amount)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - amount)
  })

  test('failure after modified-amount writes restores the full state and retry applies the delta once', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    before.at.statementId = f.statement.id
    await before.at.save()
    const state = await snapshot()
    const constraint = 'plaid_modified_cursor_failure'
    await db.rawQuery(`ALTER TABLE institutions ADD CONSTRAINT ${constraint} CHECK (cursor IS DISTINCT FROM 'c2') NOT VALID`)
    try {
      fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { amount: 15 })] })]
      ;(await client.post(url()).loginAs(f.user)).assertStatus(500)
      assert.deepEqual(await snapshot(), state)
    } finally {
      await db.rawQuery(`ALTER TABLE institutions DROP CONSTRAINT ${constraint}`)
    }
    fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { amount: 15 })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.at.amount, -15)
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.transaction.version, before.transaction.version + 1)
    assert.lengthOf(await after.transaction.related('transactionLog').query(), 2)
    assert.deepEqual(after.transaction.categories, [{ categoryId: f.unassigned.id, amount: -15 }])
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -15)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 85)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')
  })

  test('provider metadata updates preserve local comment, taxes, category comments and statement', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    before.transaction.comment = 'Local memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    before.transaction.categories[0].comment = 'Local split'
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { date: '2025-02-12', name: 'Updated payee', merchant_name: 'Merchant', account_owner: 'Owner', payment_channel: Plaid.TransactionPaymentChannelEnum.InStore })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.transaction.date.toISODate(), '2025-02-12')
    assert.equal(after.at.name, 'Updated payee')
    assert.equal(after.at.merchantName, 'Merchant')
    assert.equal(after.at.accountOwner, 'Owner')
    assert.equal(after.transaction.comment, 'Local memo')
    assert.deepEqual(after.transaction.taxes, [{ type: 'local', amount: 3 }])
    assert.equal(after.transaction.categories[0].comment, 'Local split')
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.transaction.version, before.transaction.version + 1)
  })

  test('removal reverses posted financial effects and retains soft-deleted identity; replay is harmless').with([10, -10]).run(async ({ client, assert }, amount) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { amount })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - amount)
    const before = await local()
    before.at.statementId = f.statement.id
    await before.at.save()
    const removed = [{ account_id: providerId(f.account), transaction_id: 'purchase' }]
    fake.responses = [page(accounts(), 'c2', { removed })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.at.transactionId, before.transaction.id)
    assert.equal(after.at.providerTransactionId, 'purchase')
    assert.equal(after.at.amount, -amount)
    assert.equal(after.at.statementId, f.statement.id)
    assert.isTrue(after.transaction.deleted)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, 0)
    const state = await snapshot()
    fake.responses = [page(accounts(), 'c3', { removed })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const replay = await snapshot()
    for (const table of ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs']) assert.deepEqual(replay[table], state[table])
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
  })

  test('pending replacement keeps local identities and fields and posts its financial effect once').with([10, 15, -5]).run(async ({ client, assert }, amount) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('pending', { pending: true })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local('pending')
    before.transaction.comment = 'Pending local memo'
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    const posted = purchase('posted', { amount, date: '2025-02-12', pending_transaction_id: 'pending' })
    fake.responses = [page(accounts(), 'c2', { added: [posted], removed: [{ account_id: providerId(f.account), transaction_id: 'pending' }] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local('posted')
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.isFalse(after.transaction.deleted)
    assert.isFalse(after.at.pending)
    assert.equal(after.transaction.comment, 'Pending local memo')
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.transaction.categories.reduce((sum, category) => sum + category.amount, 0), -amount)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - amount)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -amount)
    fake.responses = [page(accounts(), 'c3', { added: [posted] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - amount)
    assert.lengthOf(await f.account.related('accountTransactions').query(), 1)
  })

  test('optional merchant metadata preserves omission semantics without suppressing real updates').with([
    { label: 'omitted', changes: {}, expectedMerchant: 'Original merchant' },
    { label: 'null', changes: { merchant_name: null }, expectedMerchant: null },
    { label: 'unchanged', changes: { merchant_name: 'Original merchant' }, expectedMerchant: 'Original merchant' },
    { label: 'changed', changes: { merchant_name: 'New merchant' }, expectedMerchant: 'New merchant' },
    { label: 'omitted with amount', changes: { amount: 15 }, expectedMerchant: 'Original merchant' },
    { label: 'omitted with date', changes: { date: '2025-02-12' }, expectedMerchant: 'Original merchant' },
    { label: 'omitted with payee', changes: { name: 'Updated payee' }, expectedMerchant: 'Original merchant' },
  ]).run(async ({ client, assert }, { label, changes, expectedMerchant }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { merchant_name: 'Original merchant' })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    const userGroup = await f.budget.related('groups').create({ name: 'Metadata allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'Metadata category', type: CategoryType.Regular, balance: -10, fundingCategories: [] })
    before.transaction.categories = [{ categoryId: userCategory.id, amount: -10, comment: 'Metadata split' }]
    before.transaction.comment = 'Local metadata memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    const oldState = await snapshot()
    const oldLogs = await before.transaction.related('transactionLog').query()
    const modified = purchase('purchase', changes)
    if (!('merchant_name' in changes)) delete modified.merchant_name
    fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
    const response = await client.post(url()).loginAs(f.user)
    if (response.status() !== 200) assert.deepEqual(await snapshot(), oldState)
    response.assertStatus(200)
    const after = await local()
    assert.equal(after.at.merchantName, expectedMerchant)
    assert.equal(after.at.name, modified.name)
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.equal(after.at.providerTransactionId, 'purchase')
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.at.amount, -modified.amount)
    assert.equal(after.transaction.date.toISODate(), modified.date)
    assert.equal(after.transaction.comment, 'Local metadata memo')
    assert.deepEqual(after.transaction.taxes, [{ type: 'local', amount: 3 }])
    const expectedCategories: Transaction['categories'] = [{ categoryId: userCategory.id, amount: -10, comment: 'Metadata split' }]
    if (modified.amount !== 10) expectedCategories.push({ categoryId: f.unassigned.id, amount: 10 - modified.amount })
    assert.deepEqual(after.transaction.categories, expectedCategories)
    await userCategory.refresh()
    await f.unassigned.refresh()
    assert.equal(userCategory.balance, -10)
    assert.equal(f.unassigned.balance, 10 - modified.amount)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 - modified.amount)
    assert.deepEqual((await snapshot()).statements, oldState.statements)
    const changeCount = label === 'omitted' || label === 'unchanged' ? 0 : 1
    assert.equal(after.transaction.version, before.transaction.version + changeCount)
    assert.lengthOf(await after.transaction.related('transactionLog').query(), oldLogs.length + changeCount)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')

    const financial = await snapshot()
    fake.responses = [page(accounts(), 'c3', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const replay = await local()
    assert.equal(replay.at.id, after.at.id)
    assert.equal(replay.transaction.id, after.transaction.id)
    assert.deepEqual(replay.transaction.categories, after.transaction.categories)
    assert.equal(replay.transaction.version, after.transaction.version)
    assert.lengthOf(await replay.transaction.related('transactionLog').query(), oldLogs.length + changeCount)
    const replayState = await snapshot()
    for (const table of ['account_transactions', 'accounts', 'categories', 'statements']) assert.deepEqual(replayState[table], financial[table])
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c3')
  })

  test('omitted optional merchant metadata does not prevent an otherwise identical update', async ({ client, assert }) => {
    const data = purchase()
    delete data.merchant_name
    fake.responses = [page(accounts(), 'c1', { added: [data] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    fake.responses = [page(accounts(), 'c2', { modified: [data] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.equal((await local()).at.id, before.at.id)
  })

  test('initial additions persist allocations but apply balances only on or after the inclusive start date').with([
    { date: '2024-12-31', amount: 10 }, { date: '2025-01-01', amount: 10 }, { date: '2025-02-10', amount: 10 },
    { date: '2024-12-31', amount: -10 }, { date: '2025-01-01', amount: -10 }, { date: '2025-02-10', amount: -10 },
  ]).run(async ({ client, assert }, { date, amount }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date, amount })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const { at, transaction } = await local()
    assert.equal(at.amount, -amount)
    assert.isFalse(transaction.deleted)
    assert.equal(transaction.date.toISODate(), date)
    assert.deepEqual(transaction.categories, [{ categoryId: f.unassigned.id, amount: -amount }])
    const applied = date >= '2025-01-01' ? -amount : 0
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 + applied)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, applied)
  })

  test('date and amount modifications apply the complete old-to-new eligibility transition').with([
    { oldDate: '2024-12-30', newDate: '2024-12-31', oldAmount: 10, newAmount: 15 },
    { oldDate: '2024-12-31', newDate: '2025-01-01', oldAmount: 10, newAmount: 10 },
    { oldDate: '2024-12-31', newDate: '2025-02-10', oldAmount: 10, newAmount: 15 },
    { oldDate: '2025-01-01', newDate: '2024-12-31', oldAmount: 10, newAmount: 10 },
    { oldDate: '2025-02-10', newDate: '2024-12-31', oldAmount: 10, newAmount: 15 },
    { oldDate: '2025-01-01', newDate: '2025-02-10', oldAmount: 10, newAmount: 15 },
    { oldDate: '2025-02-10', newDate: '2025-01-01', oldAmount: 10, newAmount: 10 },
    { oldDate: '2024-12-31', newDate: '2025-01-01', oldAmount: -10, newAmount: -10 },
    { oldDate: '2025-01-01', newDate: '2024-12-31', oldAmount: -10, newAmount: -10 },
    { oldDate: '2024-12-31', newDate: '2025-01-01', oldAmount: 10, newAmount: -5 },
    { oldDate: '2025-01-01', newDate: '2024-12-31', oldAmount: -10, newAmount: 5 },
    { oldDate: '2024-12-31', newDate: '2025-01-01', oldAmount: 0, newAmount: 10 },
    { oldDate: '2025-01-01', newDate: '2024-12-31', oldAmount: 10, newAmount: 0 },
    { oldDate: '2024-12-30', newDate: '2024-12-31', oldAmount: 10, newAmount: 0 },
  ]).run(async ({ client, assert }, { oldDate, newDate, oldAmount, newAmount }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date: oldDate, amount: oldAmount })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    before.transaction.comment = 'Boundary local memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    before.transaction.categories[0].comment = 'Boundary split'
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    const oldApplied = oldDate >= '2025-01-01' ? -oldAmount : 0
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 + oldApplied)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, oldApplied)
    const modified = purchase('purchase', { date: newDate, amount: newAmount })
    fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.equal(after.at.providerTransactionId, 'purchase')
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.at.amount, -newAmount)
    assert.equal(after.transaction.date.toISODate(), newDate)
    assert.equal(after.transaction.comment, 'Boundary local memo')
    assert.deepEqual(after.transaction.taxes, [{ type: 'local', amount: 3 }])
    assert.deepEqual(after.transaction.categories, [{ categoryId: f.unassigned.id, amount: newAmount === 0 ? 0 : -newAmount, comment: 'Boundary split' }])
    const applied = newDate >= '2025-01-01' ? -newAmount : 0
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100 + applied)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, applied)
    const financial = await snapshot()
    fake.responses = [page(accounts(), 'c3', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const replay = await local()
    assert.equal(replay.transaction.id, before.transaction.id)
    assert.deepEqual(replay.transaction.categories, after.transaction.categories)
    const replayState = await snapshot()
    for (const table of ['account_transactions', 'accounts', 'categories', 'statements']) assert.deepEqual(replayState[table], financial[table])
  })

  test('crossing the boundary preserves custom allocations and applies their balances only when eligible').with([true, false]).run(async ({ client, assert }, entering) => {
    const oldDate = entering ? '2024-12-31' : '2025-01-01'
    const newDate = entering ? '2025-01-01' : '2024-12-31'
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date: oldDate })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    const userGroup = await f.budget.related('groups').create({ name: 'Boundary allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'Boundary category', type: CategoryType.Regular, balance: entering ? 0 : -10, fundingCategories: [] })
    before.transaction.categories = [{ categoryId: userCategory.id, amount: -10, comment: 'Custom split' }]
    before.transaction.comment = 'Custom memo'
    before.transaction.taxes = [{ type: 'local', amount: 3 }]
    await before.transaction.save()
    before.at.statementId = f.statement.id
    await before.at.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { date: newDate, amount: 15 })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.deepEqual(after.transaction.categories, [{ categoryId: userCategory.id, amount: -10, comment: 'Custom split' }, { categoryId: f.unassigned.id, amount: -5 }])
    assert.equal(after.transaction.id, before.transaction.id)
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.transaction.comment, 'Custom memo')
    assert.deepEqual(after.transaction.taxes, [{ type: 'local', amount: 3 }])
    await userCategory.refresh()
    await f.unassigned.refresh()
    assert.equal(userCategory.balance, entering ? -10 : 0)
    assert.equal(f.unassigned.balance, entering ? -5 : 0)
    assert.equal((await Account.findOrFail(f.account.id)).balance, entering ? 85 : 100)
  })

  test('automatic allocations obey start-date eligibility before and after a provider date modification').with([true, false]).run(async ({ client, assert }, entering) => {
    const userGroup = await f.budget.related('groups').create({ name: 'Automatic boundary allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'Automatic category', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const assignment = await f.budget.related('autoAssignment').create({ name: 'Boundary rule', searchStrings: ['Provider purchase'] })
    await assignment.related('categories').create({ categoryId: userCategory.id, amount: 100, percentage: true })
    const oldDate = entering ? '2024-12-31' : '2025-01-01'
    const newDate = entering ? '2025-01-01' : '2024-12-31'
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date: oldDate })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    assert.deepEqual(before.transaction.categories, [{ categoryId: userCategory.id, amount: -10 }])
    await userCategory.refresh()
    assert.equal(userCategory.balance, entering ? 0 : -10)
    fake.responses = [page(accounts(), 'c2', { modified: [purchase('purchase', { date: newDate, amount: 15 })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.id, before.transaction.id)
    assert.deepEqual(after.transaction.categories, [{ categoryId: userCategory.id, amount: -10 }, { categoryId: f.unassigned.id, amount: -5 }])
    await userCategory.refresh()
    await f.unassigned.refresh()
    assert.equal(userCategory.balance, entering ? -10 : 0)
    assert.equal(f.unassigned.balance, entering ? -5 : 0)
    assert.equal((await Account.findOrFail(f.account.id)).balance, entering ? 85 : 100)
  })

  test('failed boundary crossing restores date, amount, financial state and cursor; retry converges').with([true, false]).run(async ({ client, assert }, entering) => {
    const oldDate = entering ? '2024-12-31' : '2025-01-01'
    const newDate = entering ? '2025-01-01' : '2024-12-31'
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date: oldDate })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    before.at.statementId = f.statement.id
    await before.at.save()
    const userGroup = await f.budget.related('groups').create({ name: 'Rollback allocations', type: 'Regular' })
    const userCategory = await userGroup.related('categories').create({ name: 'Rollback category', type: CategoryType.Regular, balance: entering ? 0 : -10, fundingCategories: [] })
    before.transaction.categories = [{ categoryId: userCategory.id, amount: -10, comment: 'Rollback split' }]
    await before.transaction.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    const state = await snapshot()
    const constraint = 'plaid_boundary_cursor_failure'
    await db.rawQuery(`ALTER TABLE institutions ADD CONSTRAINT ${constraint} CHECK (cursor IS DISTINCT FROM 'c2') NOT VALID`)
    const modified = purchase('purchase', { date: newDate, amount: 15 })
    try {
      fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
      ;(await client.post(url()).loginAs(f.user)).assertStatus(500)
      assert.deepEqual(await snapshot(), state)
    } finally {
      await db.rawQuery(`ALTER TABLE institutions DROP CONSTRAINT ${constraint}`)
    }
    fake.responses = [page(accounts(), 'c2', { modified: [modified] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.transaction.id, before.transaction.id)
    assert.equal(after.at.id, before.at.id)
    assert.equal(after.transaction.date.toISODate(), newDate)
    assert.equal(after.at.amount, -15)
    assert.equal(after.at.statementId, f.statement.id)
    assert.equal(after.transaction.version, before.transaction.version + 1)
    assert.lengthOf(await after.transaction.related('transactionLog').query(), 2)
    assert.equal((await Account.findOrFail(f.account.id)).balance, entering ? 85 : 100)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, entering ? -5 : 0)
    await userCategory.refresh()
    assert.equal(userCategory.balance, entering ? -10 : 0)
    assert.deepEqual(after.transaction.categories, [{ categoryId: userCategory.id, amount: -10, comment: 'Rollback split' }, { categoryId: f.unassigned.id, amount: -5 }])
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')
  })

  test('removal before the start boundary retains identity without reversing an unapplied amount', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('purchase', { date: '2024-12-31' })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local()
    fake.responses = [page(accounts(), 'c2', { removed: [{ account_id: providerId(f.account), transaction_id: 'purchase' }] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local()
    assert.equal(after.at.id, before.at.id)
    assert.isTrue(after.transaction.deleted)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, 0)
  })

  test('removing pending data reverses category effects without changing the posted balance', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('pending', { pending: true })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    fake.responses = [page(accounts(), 'c2', { removed: [{ account_id: providerId(f.account), transaction_id: 'pending' }] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.isTrue((await local('pending')).transaction.deleted)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, 0)
  })

  test('replayed addition after removal does not resurrect a deleted provider identity', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    fake.responses = [page(accounts(), 'c2', { removed: [{ account_id: providerId(f.account), transaction_id: 'purchase' }] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await snapshot()
    fake.responses = [page(accounts(), 'c3', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await snapshot()
    for (const table of ['transactions', 'account_transactions', 'accounts', 'categories', 'statements', 'transaction_logs']) assert.deepEqual(after[table], before[table])
  })

  test('initializing an account uses provider balance and derives a starting-balance transaction', async ({ client, assert }) => {
    f.account.initialized = false
    await f.account.save()
    fake.responses = [page(accounts(), 'c1', { added: [purchase()] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    await f.account.refresh()
    assert.isTrue(f.account.initialized)
    assert.equal(f.account.balance, 100)
    const records = await f.account.related('accountTransactions').query()
    assert.lengthOf(records, 2)
    assert.equal(records.reduce((sum, row) => sum + row.amount, 0), 100)
    const fundingPool = await f.budget.getFundingPoolCategory()
    assert.equal(fundingPool.balance, 110)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -10)
  })

  test('pending posting preserves a user allocation and adds only its amount adjustment to unassigned', async ({ client, assert }) => {
    fake.responses = [page(accounts(), 'c1', { added: [purchase('pending', { pending: true })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const before = await local('pending')
    const fundingPool = await f.budget.getFundingPoolCategory()
    before.transaction.categories = [{ categoryId: fundingPool.id, amount: -10, comment: 'User allocation' }]
    await before.transaction.save()
    fundingPool.balance = -10
    await fundingPool.save()
    await f.unassigned.refresh()
    f.unassigned.balance = 0
    await f.unassigned.save()
    fake.responses = [page(accounts(), 'c2', { added: [purchase('posted', { amount: 15, pending_transaction_id: 'pending' })] })]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    const after = await local('posted')
    assert.deepEqual(after.transaction.categories, [{ categoryId: fundingPool.id, amount: -10, comment: 'User allocation' }, { categoryId: f.unassigned.id, amount: -5 }])
    await fundingPool.refresh()
    await f.unassigned.refresh()
    assert.equal(fundingPool.balance, -10)
    assert.equal(f.unassigned.balance, -5)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 85)
  })

  test('page/API and persistence failures roll back all financial state and cursor, and retry converges').with(['page1', 'api2', 'page2', 'cursor']).run(async ({ client, assert }, failure) => {
    const first = page(accounts(), 'c1', { added: [purchase('first')], has_more: true })
    const second = page(accounts(), 'c2', { added: [purchase('second', { amount: 20 })] })
    const constraint = 'plaid_sync_characterization_failure'
    if (failure !== 'api2') {
      if (failure === 'cursor') await db.rawQuery(`ALTER TABLE institutions ADD CONSTRAINT ${constraint} CHECK (cursor IS DISTINCT FROM 'c2') NOT VALID`)
      else await db.rawQuery(`ALTER TABLE account_transactions ADD CONSTRAINT ${constraint} CHECK (provider_transaction_id <> '${failure === 'page1' ? 'first' : 'second'}') NOT VALID`)
    }
    const before = await snapshot()
    try {
      fake.responses = [first, failure === 'api2' ? new Error('Controlled page two API failure') : second]
      ;(await client.post(url()).loginAs(f.user)).assertStatus(500)
      assert.deepEqual(await snapshot(), before)
      await f.institution.refresh()
      assert.isNull(f.institution.cursor)
    } finally {
      if (failure !== 'api2') await db.rawQuery(`ALTER TABLE ${failure === 'cursor' ? 'institutions' : 'account_transactions'} DROP CONSTRAINT ${constraint}`)
    }
    fake.cursors = []
    fake.responses = [first, second]
    ;(await client.post(url()).loginAs(f.user)).assertStatus(200)
    assert.deepEqual(fake.cursors, [null, 'c1'])
    assert.lengthOf(await f.account.related('accountTransactions').query(), 2)
    for (const [id, amount] of [['first', -10], ['second', -20]] as const) {
      const { at, transaction } = await local(id)
      assert.equal(at.amount, amount)
      assert.isFalse(at.pending)
      assert.isNull(at.statementId)
      assert.isFalse(transaction.deleted)
      assert.equal(transaction.version, 0)
      assert.deepEqual(transaction.categories, [{ categoryId: f.unassigned.id, amount }])
      assert.lengthOf(await transaction.related('transactionLog').query(), 1)
    }
    assert.deepEqual((await snapshot()).statements, before.statements)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 70)
    await f.unassigned.refresh()
    assert.equal(f.unassigned.balance, -30)
    await f.institution.refresh()
    assert.equal(f.institution.cursor, 'c2')
  })
})
