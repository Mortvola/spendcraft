// Prepared only: requires fresh authorization and current independent DB safeguards.
// Old tests encoded history->Account writes. Product deprecation removes that API
// rather than correcting it; retain legacy rows to prove noninterference.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture(tracking = TrackingType.Transactions) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `deprecated-history-${++sequence}`,
      email: `deprecated-history-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Legacy evidence bank' })
    const account = await institution.related('accounts').create({ name: 'Supported account', balance: 100,
      type: AccountType.Depository, subtype: 'checking', tracking, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
    if (tracking === TrackingType.Transactions) {
      const pool = await budget.getFundingPoolCategory({ client: trx })
      await account.updateStartingBalance(budget, pool); await pool.save()
    }
    const history = await account.related('balanceHistory').create({ date: DateTime.fromISO('2025-02-01'), balance: 98765.43 })
    return { budget, user, institution, account, history }
  })
}
type Fixture = Awaited<ReturnType<typeof fixture>>
const history = (f: Fixture) => db.from('balance_histories').where('account_id', f.account.id).orderBy('id')
async function financial(f: Fixture) {
  return Promise.all([
    db.from('accounts').where('institution_id', f.institution.id).orderBy('id'), history(f),
    db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
    db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
    db.from('statements').where('account_id', f.account.id).orderBy('id'),
    db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id').where('groups.application_id', f.budget.id).orderBy('categories.id'),
    db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
  ])
}

test.group('BalanceHistory runtime deprecation (prepared)', () => {
  test('removed mutation endpoints cannot change history or financial state')
    .with([TrackingType.Transactions, TrackingType.Balances].flatMap((tracking) =>
      ['create', 'update', 'nested-delete', 'standalone-delete'].map((operation) => ({ tracking, operation }))))
    .run(async ({ client, assert }, { tracking, operation }) => {
      const f = await fixture(tracking)
      const before = await financial(f)
      const path = `/api/v1/account/${f.account.id}/balances`
      const response = operation === 'create' ? await client.post(path).json({ date: '2025-03-01', amount: 999 }).loginAs(f.user)
        : operation === 'update' ? await client.patch(`${path}/${f.history.id}`).json({ date: '2025-03-01', amount: 999 }).loginAs(f.user)
          : await client.delete(operation === 'nested-delete' ? `${path}/${f.history.id}` : `/api/v1/balance/${f.history.id}`).loginAs(f.user)
      response.assertStatus(404)
      assert.deepEqual(await financial(f), before)
    })

  test('manual CREATE PATCH DELETE and chart ignore historical observations', async ({ client, assert }) => {
    const f = await fixture()
    const before = await history(f)
    const unassigned = await f.budget.getUnassignedCategory()
    const create = await client.post(`/api/v1/account/${f.account.id}/transactions`)
      .json({ date: '2025-02-10', name: 'Ordinary', amount: 10, categories: [] }).loginAs(f.user)
    create.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 110)
    const chart = await client.get(`/api/v1/account/${f.account.id}/balances`).loginAs(f.user)
    chart.assertStatus(200)
    assert.strictEqual(chart.body()[0].balance, '110.00')
    assert.notProperty(chart.body()[0], 'id')
    const target = await f.account.related('accountTransactions').query().whereHas('transaction', (query) => query.where('type', 5)).firstOrFail()
    ;(await client.patch(`/api/v1/transaction/${target.transactionId}`).json({ version: 0, amount: 7,
      categories: [{ categoryId: unassigned.id, amount: 7 }] }).loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 107)
    ;(await client.delete(`/api/v1/transaction/${target.transactionId}`).loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    assert.deepEqual(await history(f), before)
  })

  test('balance-tracked GET does not expose stored history', async ({ client, assert }) => {
    const f = await fixture(TrackingType.Balances)
    const before = await financial(f)
    ;(await client.get(`/api/v1/account/${f.account.id}/balances`).loginAs(f.user)).assertStatus(422)
    assert.deepEqual(await financial(f), before)
  })

  test('startDate and opening use accounting balance without touching history', async ({ client, assert }) => {
    const f = await fixture()
    const before = await history(f)
    ;(await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-02-01' }).loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    assert.deepEqual(await history(f), before)
    const pool = await f.budget.getFundingPoolCategory()
    assert.equal(pool.balance, 100)
  })

  test('offline initialization creates no history and preserves route-specific financial state')
    .with([TrackingType.Transactions, TrackingType.Balances].flatMap((tracking) =>
      ['new', 'existing'].map((route) => ({ tracking, route }))))
    .run(async ({ client, assert }, { tracking, route }) => {
      const f = await fixture()
      const before = await db.from('balance_histories').orderBy('id')
      const input = { name: 'New account', balance: 12, type: AccountType.Depository, subtype: 'checking', tracking }
      const response = route === 'new'
        ? await client.post('/api/v1/institution').json({ institution: { name: 'New offline' }, startDate: '2025-01-01', accounts: [input] }).loginAs(f.user)
        : await client.post(`/api/v1/institution/${f.institution.id}/accounts`).json({ ...input, startDate: '2025-01-01' }).loginAs(f.user)
      response.assertStatus(200)
      const id = route === 'new' ? response.body().data.accounts[0].id : response.body().data.account.id
      const account = await Account.findOrFail(id)
      assert.equal(account.balance, 12)
      const statements = await account.related('statements').query()
      assert.lengthOf(statements, tracking === TrackingType.Balances ? 1 : 0)
      if (statements[0]) assert.equal(statements[0].endingBalance, 12)
      const openings = await account.related('accountTransactions').query().whereHas('transaction', (query) => query.where('type', 4))
      assert.lengthOf(openings, route === 'new' && tracking === TrackingType.Transactions ? 1 : 0)
      assert.equal((await f.budget.getFundingPoolCategory()).balance, route === 'new' && tracking === TrackingType.Transactions ? 112 : 100)
      assert.deepEqual(await db.from('balance_histories').orderBy('id'), before)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    })

  test('last-user Budget destruction retains only parent-cleanup history deletion', async ({ client, assert }) => {
    const f = await fixture()
    const foreign = await fixture()
    const foreignBefore = await history(foreign)
    ;(await client.delete('/api/v1/user').loginAs(f.user)).assertStatus(200)
    assert.isNull(await Account.find(f.account.id))
    assert.isNull(await Budget.find(f.budget.id))
    assert.lengthOf(await history(f), 0)
    assert.deepEqual(await history(foreign), foreignBefore)
    assert.equal((await Account.findOrFail(foreign.account.id)).balance, 100)
  })
})
