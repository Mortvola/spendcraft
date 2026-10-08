import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Account from '#models/Account'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `creation-isolation-${label}-${++sequence}`,
      email: `creation-isolation-${sequence}@example.com`,
      password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({
      name: `${label} account`, balance: 100, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const category = await group.related('categories').create({
      name: `${label} category`, type: CategoryType.Regular, balance: 20, fundingCategories: [],
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, comment: `${label} private comment`,
      categories: [{ categoryId: category.id, amount: 10 }], taxes: [],
    })
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: `${label} private purchase`, amount: 10,
      provider: 'NONE', pending: false, statementId: null,
    })
    const statement = await account.related('statements').create({
      startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'),
      startingBalance: 90, endingBalance: 100,
    })
    return { budget, user, institution, account, category, transaction, accountTransaction, statement }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const shared = await User.create({
    username: `creation-isolation-shared-${++sequence}`, email: `creation-isolation-${sequence}@example.com`,
    password: 'testPassw0rd', budgetId: own.budget.id,
  })
  return { own, foreign, shared }
}

test.group('Account transaction creation isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    const accounts = [fixture.own.account.id, fixture.foreign.account.id]
    return Promise.all([
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('account_transactions').whereIn('account_id', accounts).orderBy('id'),
      db.from('accounts').whereIn('id', accounts).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('statements').whereIn('account_id', accounts).orderBy('id'),
      db.from('balance_histories').whereIn('account_id', accounts).orderBy('id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
    ])
  }

  test('own and shared-budget users can create a transaction').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const response = await client.post(`/api/v1/account/${fixture.own.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'New purchase', amount: 15, categories: [{ categoryId: fixture.own.category.id, amount: 15 }] })
      .accept('json').loginAs(actor === 'owner' ? fixture.own.user : fixture.shared)
    response.assertStatus(200)
    const row = await Transaction.findOrFail(response.body().transaction.id)
    assert.equal(row.budgetId, fixture.own.budget.id)
    assert.deepEqual(row.categories, [{ categoryId: fixture.own.category.id, amount: 15 }])
    const accountRow = await AccountTransaction.findByOrFail('transactionId', row.id)
    assert.equal(accountRow.accountId, fixture.own.account.id)
    assert.equal(accountRow.amount, 15)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 115)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 35)
    assert.equal((await Account.findOrFail(fixture.foreign.account.id)).balance, 100)
    assert.equal((await Category.findOrFail(fixture.foreign.category.id)).balance, 20)
  })

  const rejected = [
    { name: 'foreign account and own category', account: 'foreign', categories: ['own'] },
    { name: 'own account and foreign category', account: 'own', categories: ['foreign'] },
    { name: 'foreign account and foreign category', account: 'foreign', categories: ['foreign'] },
    { name: 'one foreign category among valid categories', account: 'own', categories: ['own', 'foreign'] },
    { name: 'repeated IDs with a foreign category', account: 'own', categories: ['own', 'own', 'foreign', 'foreign'] },
    { name: 'missing category among valid categories', account: 'own', categories: ['own', 'missing'] },
    { name: 'missing account', account: 'missing', categories: ['own'] },
    { name: 'foreign account with empty categories', account: 'foreign', categories: [] },
  ]
  test('rejects {name} without changing either budget').with(rejected).run(async ({ client, assert }, scenario) => {
    const accountId = scenario.account === 'foreign' ? fixture.foreign.account.id : scenario.account === 'own' ? fixture.own.account.id : 2147483647
    const categories = scenario.categories.map((owner) => ({
      categoryId: owner === 'foreign' ? fixture.foreign.category.id : owner === 'own' ? fixture.own.category.id : 2147483647,
      amount: 5,
    }))
    const before = await state()
    const response = await client.post(`/api/v1/account/${accountId}/transactions`)
      .json({ date: '2025-03-01', name: 'Rejected purchase', amount: 5 * categories.length, categories })
      .accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('repeated own category IDs preserve cumulative balance effects', async ({ client, assert }) => {
    const categories = [{ categoryId: fixture.own.category.id, amount: 5 }, { categoryId: fixture.own.category.id, amount: 10 }]
    const response = await client.post(`/api/v1/account/${fixture.own.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'Split purchase', amount: 15, categories }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.deepEqual((await Transaction.findOrFail(response.body().transaction.id)).categories, categories)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 35)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 115)
  })

  test('empty categories use the budget-scoped unassigned category', async ({ client, assert }) => {
    const unassigned = await fixture.own.budget.getUnassignedCategory()
    const before = unassigned.balance
    const response = await client.post(`/api/v1/account/${fixture.own.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'Unassigned purchase', amount: 15, categories: [] }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.equal((await Category.findOrFail(unassigned.id)).balance, before + 15)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 115)
    assert.equal((await Transaction.findOrFail(response.body().transaction.id)).categories[0].categoryId, unassigned.id)
  })

  test('unsupported relationship fields cannot attach foreign records', async ({ client, assert }) => {
    const response = await client.post(`/api/v1/account/${fixture.own.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'Purchase', amount: 15, categories: [{ categoryId: fixture.own.category.id, amount: 15 }],
        statementId: fixture.foreign.statement.id, transactionId: fixture.foreign.transaction.id,
        duplicateOfTransactionId: fixture.foreign.transaction.id, accountId: fixture.foreign.account.id, budgetId: fixture.foreign.budget.id })
      .accept('json').loginAs(fixture.own.user)
    response.assertStatus(200)
    const row = await Transaction.findOrFail(response.body().transaction.id)
    const accountRow = await AccountTransaction.findByOrFail('transactionId', row.id)
    assert.equal(row.budgetId, fixture.own.budget.id)
    assert.isNull(row.duplicateOfTransactionId)
    assert.equal(accountRow.accountId, fixture.own.account.id)
    assert.isNull(accountRow.statementId)
    assert.notEqual(row.id, fixture.foreign.transaction.id)
  })
})
