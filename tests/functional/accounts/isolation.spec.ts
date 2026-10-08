import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Account from '#models/Account'
import BalanceHistory from '#models/BalanceHistory'
import Statement from '#models/Statement'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function domain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `account-isolation-${++sequence}`, email: `account-isolation-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({
      name: `${label} private account`, balance: 123.45, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Balances, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const otherAccount = await institution.related('accounts').create({
      name: `${label} second account`, balance: 50, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Balances, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const history = await account.related('balanceHistory').create({ date: DateTime.fromISO('2025-02-01'), balance: 123.45 })
    const otherHistory = await otherAccount.related('balanceHistory').create({ date: DateTime.fromISO('2025-02-01'), balance: 50 })
    const statement = await account.related('statements').create({
      startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'), startingBalance: 100, endingBalance: 123.45,
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-05'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
    })
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: `${label} private purchase`, amount: 23.45, provider: 'NONE', pending: false, statementId: null,
    })
    return { budget, user, account, otherAccount, history, otherHistory, statement, accountTransaction }
  })
}
async function createFixture() {
  const own = await domain('own')
  const foreign = await domain('foreign')
  const shared = await User.create({
    username: `account-isolation-${++sequence}`, email: `account-isolation-${sequence}@example.com`,
    password: 'testPassw0rd', budgetId: own.budget.id,
  })
  return { own, foreign, shared }
}
type Fixture = Awaited<ReturnType<typeof createFixture>>
const historyBody = { date: '2025-03-01', amount: 999 }
const statementBody = { startDate: '2025-03-01', endDate: '2025-03-31', startingBalance: 123.45, endingBalance: 999 }
const rejected = [
  { name: 'foreign account transaction balance disclosure', method: 'GET', path: (f: Fixture) => `/account/${f.foreign.account.id}/transactions` },
  { name: 'foreign balance history disclosure', method: 'GET', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances` },
  { name: 'foreign account update', method: 'PATCH', path: (f: Fixture) => `/account/${f.foreign.account.id}`, body: { name: 'Unauthorized', closed: true } },
  { name: 'foreign balance creation', method: 'POST', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances`, body: historyBody },
  { name: 'foreign parent and history update', method: 'PATCH', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances/${f.foreign.history.id}`, body: historyBody },
  { name: 'own parent and foreign history update', method: 'PATCH', path: (f: Fixture) => `/account/${f.own.account.id}/balances/${f.foreign.history.id}`, body: historyBody },
  { name: 'foreign parent and own history update', method: 'PATCH', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances/${f.own.history.id}`, body: historyBody },
  { name: 'same-budget wrong-parent history update', method: 'PATCH', path: (f: Fixture) => `/account/${f.own.account.id}/balances/${f.own.otherHistory.id}`, body: historyBody },
  { name: 'foreign standalone history deletion', method: 'DELETE', path: (f: Fixture) => `/balance/${f.foreign.history.id}` },
  { name: 'foreign nested history deletion', method: 'DELETE', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances/${f.foreign.history.id}` },
  { name: 'own parent and foreign history deletion', method: 'DELETE', path: (f: Fixture) => `/account/${f.own.account.id}/balances/${f.foreign.history.id}` },
  { name: 'foreign parent and own history deletion', method: 'DELETE', path: (f: Fixture) => `/account/${f.foreign.account.id}/balances/${f.own.history.id}` },
  { name: 'same-budget wrong-parent history deletion', method: 'DELETE', path: (f: Fixture) => `/account/${f.own.account.id}/balances/${f.own.otherHistory.id}` },
  { name: 'foreign statement listing', method: 'GET', path: (f: Fixture) => `/account/${f.foreign.account.id}/statements` },
  { name: 'foreign statement creation', method: 'POST', path: (f: Fixture) => `/account/${f.foreign.account.id}/statements`, body: statementBody },
  { name: 'foreign statement update and reconciliation', method: 'PATCH', path: (f: Fixture) => `/statements/${f.foreign.statement.id}`, body: { startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 999, reconcile: 'All' } },
  { name: 'foreign statement deletion', method: 'DELETE', path: (f: Fixture) => `/statements/${f.foreign.statement.id}` },
]

test.group('Account, history and statement budget isolation', (group) => {
  let fixture: Fixture
  group.each.setup(async () => { fixture = await createFixture() })
  async function state() {
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    const accounts = [fixture.own.account.id, fixture.own.otherAccount.id, fixture.foreign.account.id, fixture.foreign.otherAccount.id]
    return Promise.all([
      db.from('accounts').whereIn('id', accounts).orderBy('id'),
      db.from('balance_histories').whereIn('account_id', accounts).orderBy('id'),
      db.from('statements').whereIn('account_id', accounts).orderBy('id'),
      db.from('account_transactions').whereIn('account_id', accounts).orderBy('id'),
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
    ])
  }
  test('rejects {name} without changing either budget').with(rejected).run(async ({ client, assert }, scenario) => {
    const before = await state()
    const request = client.request(`/api/v1${scenario.path(fixture)}`, scenario.method).qs({ limit: 20, offset: 0 }).accept('json').loginAs(fixture.own.user)
    if (scenario.body) request.json(scenario.body)
    const response = await request
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
    assert.notInclude(response.text(), 'foreign private')
    assert.notProperty(response.body(), 'data')
  })

  test('foreign OFX account is rejected before parsing/import', async ({ client, assert, cleanup }) => {
    const original = Account.prototype.processOfx
    let calls = 0
    Account.prototype.processOfx = async function () { calls++ }
    cleanup(() => { Account.prototype.processOfx = original })
    const before = await state()
    const response = await client.post(`/api/v1/account/${fixture.foreign.account.id}/ofx`)
      .json({ invalid: 'not an OFX document' }).accept('json').loginAs(fixture.own.user)
    assert.equal(calls, 0)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('shared-budget user can read account resources').with(['transactions', 'balances', 'statements']).run(async ({ client, assert }, resource) => {
    const response = await client.get(`/api/v1/account/${fixture.own.account.id}/${resource}`).qs({ limit: 20, offset: 0 }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    if (resource === 'transactions') assert.equal(response.body().data.balance, 123.45)
    if (resource === 'balances') assert.equal(response.body()[0].id, fixture.own.history.id)
    if (resource === 'statements') assert.equal(response.body()[0].id, fixture.own.statement.id)
  })

  test('shared-budget user can update an account', async ({ client, assert }) => {
    const response = await client.patch(`/api/v1/account/${fixture.own.account.id}`).json({ name: 'Shared rename' }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).name, 'Shared rename')
  })
  test('shared-budget user can create and update balance history', async ({ client, assert }) => {
    const url = `/api/v1/account/${fixture.own.account.id}/balances`
    const created = await client.post(url).json({ date: '2025-03-01', amount: 200 }).accept('json').loginAs(fixture.shared)
    created.assertStatus(200)
    const id = created.body().data.id
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 200)
    const updated = await client.patch(`${url}/${id}`).json({ date: '2025-03-01', amount: 250 }).accept('json').loginAs(fixture.shared)
    updated.assertStatus(200)
    assert.equal((await BalanceHistory.findOrFail(id)).balance, 250)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 250)
  })
  test('shared-budget user can delete history through either route').with(['nested', 'standalone']).run(async ({ client, assert }, route) => {
    const path = route === 'nested' ? `/account/${fixture.own.account.id}/balances/${fixture.own.history.id}` : `/balance/${fixture.own.history.id}`
    const response = await client.delete(`/api/v1${path}`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.isNull(await BalanceHistory.find(fixture.own.history.id))
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 0)
  })
  test('shared-budget user can create a statement', async ({ client, assert }) => {
    const response = await client.post(`/api/v1/account/${fixture.own.account.id}/statements`).json(statementBody).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    const statement = await Statement.findOrFail(response.body().id)
    assert.equal(statement.accountId, fixture.own.account.id)
    assert.equal(statement.endingBalance, 999)
  })
  test('shared-budget user can update and reconcile a statement', async ({ client, assert }) => {
    const response = await client.patch(`/api/v1/statements/${fixture.own.statement.id}`).json({ startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 150, reconcile: 'All' }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.equal((await Statement.findOrFail(fixture.own.statement.id)).endingBalance, 150)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 150)
    assert.equal((await AccountTransaction.findOrFail(fixture.own.accountTransaction.id)).statementId, fixture.own.statement.id)
  })
  test('statement reconciliation does not mutate a wrong-parent account transaction').with(['foreign', 'same-budget']).run(async ({ client, assert }, owner) => {
    const row = owner === 'foreign' ? fixture.foreign.accountTransaction : fixture.own.accountTransaction
    if (owner === 'same-budget') row.accountId = fixture.own.otherAccount.id
    row.statementId = fixture.own.statement.id
    await row.save()
    const before = (await AccountTransaction.findOrFail(row.id)).serialize()
    const response = await client.patch(`/api/v1/statements/${fixture.own.statement.id}`)
      .json({ startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 123.45, reconcile: 'None' })
      .accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.deepEqual((await AccountTransaction.findOrFail(row.id)).serialize(), before)
  })
  test('shared-budget user can delete a statement', async ({ client, assert }) => {
    const response = await client.delete(`/api/v1/statements/${fixture.own.statement.id}`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.isNull(await Statement.find(fixture.own.statement.id))
  })
})
