import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Category from '#models/Category'
import { CategoryType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const missingId = 2147483647

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: 'loan-isolation-' + label + '-' + ++sequence,
      email: 'loan-isolation-' + sequence + '@example.com', password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: label + ' group', type: 'Regular' })
    const category = await group.related('categories').create({ name: label + ' category', type: CategoryType.Regular,
      balance: 100, fundingAmount: label === 'own' ? 10 : 99, useGoal: false, recurrence: 1, fundingCategories: [] })
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-01'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id, amount: 10 }], taxes: [], deleted: false })
    return { budget, user, category, transaction }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const shared = await User.create({ username: 'loan-isolation-shared-' + ++sequence,
    email: 'loan-isolation-' + sequence + '@example.com', password: 'testPassw0rd', budgetId: own.budget.id })
  return { own, foreign, shared }
}

test.group('Loan isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => {
    fixture = await createFixture()
    for (const domain of [fixture.own, fixture.foreign]) {
      await domain.category.merge({ type: CategoryType.Loan }).save()
      await db.table('loans').insert({ user_id: domain.user.id, category_id: domain.category.id,
        rate: 5, start_date: '2025-01-01', starting_balance: 100, balance: -100 })
    }
  })

  async function state() {
    return Promise.all([db.from('loans').orderBy('id'), db.from('categories').orderBy('id'),
      db.from('transactions').orderBy('id'), db.from('loan_transactions').orderBy('id')])
  }

  test('foreign and missing loans reject reads and updates without mutation').with([
    { method: 'get', suffix: '', target: 'foreign' }, { method: 'patch', suffix: '', target: 'foreign' },
    { method: 'get', suffix: '/transactions', target: 'foreign' },
    { method: 'get', suffix: '', target: 'missing' }, { method: 'patch', suffix: '', target: 'missing' },
    { method: 'get', suffix: '/transactions', target: 'missing' },
  ]).run(async ({ client, assert }, scenario) => {
    const id = scenario.target === 'foreign' ? fixture.foreign.category.id : missingId
    const before = await state()
    const response = scenario.method === 'patch'
      ? await client.patch(`/api/v1/loans/${id}`).json({ name: 'Changed loan', rate: 8, startDate: '2025-02-01', startingBalance: 200 }).accept('json').loginAs(fixture.own.user)
      : await client.get(`/api/v1/loans/${id}${scenario.suffix}`).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('owner and shared-budget users retain the current loan behavior').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const prefix = `/api/v1/loans/${fixture.own.category.id}`
    const loan = await client.get(prefix).accept('json').loginAs(user)
    loan.assertStatus(200)
    assert.equal(loan.body().balance, -100)
    const transactions = await client.get(`${prefix}/transactions`).accept('json').loginAs(user)
    transactions.assertStatus(200)
    assert.deepEqual(transactions.body(), { balance: 0, transactions: [] })
    const before = await db.from('loans').orderBy('id')
    const updated = await client.patch(prefix).json({ name: 'Renamed loan', rate: 8, startDate: '2025-02-01', startingBalance: 200 }).accept('json').loginAs(user)
    updated.assertStatus(200)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).name, 'Renamed loan')
    // updateBalance is currently inert; this security fix must not implement it.
    assert.deepEqual(await db.from('loans').orderBy('id'), before)
    assert.equal((await Category.findOrFail(fixture.foreign.category.id)).name, 'foreign category')
  })
})
