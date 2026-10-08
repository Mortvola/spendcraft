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
      username: `isolation-${label}-${++sequence}`,
      email: `isolation-${sequence}@example.com`,
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
    username: `isolation-shared-${++sequence}`, email: `isolation-${sequence}@example.com`,
    password: 'testPassw0rd', budgetId: own.budget.id,
  })
  return { own, foreign, shared }
}

test.group('Transaction budget isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    const accounts = [fixture.own.account.id, fixture.foreign.account.id]
    return Promise.all([
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('accounts').whereIn('id', accounts).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('account_transactions').whereIn('account_id', accounts).orderBy('id'),
      db.from('statements').whereIn('account_id', accounts).orderBy('id'),
      db.from('balance_histories').whereIn('account_id', accounts).orderBy('id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
    ])
  }

  test('owner and shared-budget user can read a transaction').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const response = await client.get(`/api/v1/transaction/${fixture.own.transaction.id}`).accept('json').loginAs(user)
    response.assertStatus(200)
    assert.equal(response.body().id, fixture.own.transaction.id)
    assert.equal(response.body().accountTransaction.name, 'own private purchase')
  })

  test('foreign transaction read returns not found without financial data', async ({ client, assert }) => {
    const response = await client.get(`/api/v1/transaction/${fixture.foreign.transaction.id}`).accept('json').loginAs(fixture.own.user)
    response.assertStatus(404)
    assert.notInclude(response.text(), 'foreign private purchase')
    assert.notInclude(response.text(), 'foreign private comment')
  })

  test('unknown transaction has the same not-found contract', async ({ client }) => {
    const response = await client.get('/api/v1/transaction/2147483647').accept('json').loginAs(fixture.own.user)
    response.assertStatus(404)
  })

  test('owner and shared-budget user can update a transaction').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const response = await client.patch(`/api/v1/transaction/${fixture.own.transaction.id}`)
      .json({ version: 0, name: 'Updated purchase', amount: 15, categories: [{ categoryId: fixture.own.category.id, amount: 15 }] })
      .accept('json').loginAs(user)
    response.assertStatus(200)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 105)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 25)
    assert.equal((await Transaction.findOrFail(fixture.own.transaction.id)).version, 1)
    assert.equal((await AccountTransaction.findOrFail(fixture.own.accountTransaction.id)).name, 'Updated purchase')
  })

  test('foreign transaction update leaves both budgets unchanged', async ({ client, assert }) => {
    const before = await state()
    const response = await client.patch(`/api/v1/transaction/${fixture.foreign.transaction.id}`)
      .json({ version: 0, name: 'Unauthorized update', amount: 999 }).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('foreign category rejects the whole own-transaction update', async ({ client, assert }) => {
    const before = await state()
    const response = await client.patch(`/api/v1/transaction/${fixture.own.transaction.id}`)
      .json({ version: 0, amount: 999, categories: [
        { categoryId: fixture.own.category.id, amount: 10 },
        { categoryId: fixture.foreign.category.id, amount: 989 },
      ] }).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('foreign statement rejects the whole own-transaction update', async ({ client, assert }) => {
    const before = await state()
    const response = await client.patch(`/api/v1/transaction/${fixture.own.transaction.id}`)
      .json({ version: 0, amount: 999, statementId: fixture.foreign.statement.id }).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('own statement can be assigned and cleared', async ({ client, assert }) => {
    for (const statementId of [fixture.own.statement.id, null]) {
      const transaction = await Transaction.findOrFail(fixture.own.transaction.id)
      const response = await client.patch(`/api/v1/transaction/${transaction.id}`)
        .json({ version: transaction.version, statementId }).accept('json').loginAs(fixture.shared)
      response.assertStatus(200)
      assert.equal((await AccountTransaction.findOrFail(fixture.own.accountTransaction.id)).statementId, statementId)
    }
  })

  test('owner and shared-budget user can delete a transaction').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const response = await client.delete(`/api/v1/transaction/${fixture.own.transaction.id}`).accept('json').loginAs(user)
    response.assertStatus(200)
    assert.isTrue((await Transaction.findOrFail(fixture.own.transaction.id)).deleted)
    assert.equal((await Account.findOrFail(fixture.own.account.id)).balance, 90)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 10)
  })

  test('stored foreign categories cannot participate in update or deletion').with(['patch', 'delete']).run(async ({ client, assert }, operation) => {
    await fixture.own.transaction.merge({ categories: [
      { categoryId: fixture.own.category.id, amount: 5 },
      { categoryId: fixture.foreign.category.id, amount: 5 },
    ] }).save()
    const before = await state()
    const url = `/api/v1/transaction/${fixture.own.transaction.id}`
    const response = operation === 'patch'
      ? await client.patch(url).json({ version: 0, categories: [{ categoryId: fixture.own.category.id, amount: 10 }] }).accept('json').loginAs(fixture.own.user)
      : await client.delete(url).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('stored foreign account cannot participate in update or deletion').with(['patch', 'delete']).run(async ({ client, assert }, operation) => {
    await fixture.own.accountTransaction.merge({ accountId: fixture.foreign.account.id }).save()
    const before = await state()
    const url = `/api/v1/transaction/${fixture.own.transaction.id}`
    const response = operation === 'patch'
      ? await client.patch(url).json({ version: 0, amount: 999 }).accept('json').loginAs(fixture.own.user)
      : await client.delete(url).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('foreign transaction deletion leaves both budgets unchanged', async ({ client, assert }) => {
    const before = await state()
    const response = await client.delete(`/api/v1/transaction/${fixture.foreign.transaction.id}`).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('bulk read rejects mixed-budget IDs without disclosing records', async ({ client, assert }) => {
    const response = await client.get('/api/v1/transactions')
      .qs({ t: [fixture.own.transaction.id, fixture.foreign.transaction.id] }).accept('json').loginAs(fixture.shared)
    response.assertStatus(404)
    assert.notInclude(response.text(), 'foreign private purchase')
  })

  test('bulk read preserves shared-budget access', async ({ client, assert }) => {
    const response = await client.get('/api/v1/transactions')
      .qs({ t: [fixture.own.transaction.id] }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.deepEqual(response.body().data.transactions.map((row: { id: number }) => row.id), [fixture.own.transaction.id])
  })

  test('foreign dedup leaves both budgets unchanged', async ({ client, assert }) => {
    await fixture.foreign.transaction.merge({ duplicateOfTransactionId: fixture.foreign.transaction.id }).save()
    const before = await state()
    const response = await client.post(`/api/v1/transaction/${fixture.foreign.transaction.id}/dedup`).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('shared-budget user can clear own duplicate marker', async ({ client, assert }) => {
    await fixture.own.transaction.merge({ duplicateOfTransactionId: fixture.own.transaction.id }).save()
    const response = await client.post(`/api/v1/transaction/${fixture.own.transaction.id}/dedup`).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    assert.isNull((await Transaction.findOrFail(fixture.own.transaction.id)).duplicateOfTransactionId)
  })
})
