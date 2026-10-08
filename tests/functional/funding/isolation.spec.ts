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
    const user = await budget.related('users').create({ username: 'funding-isolation-' + label + '-' + ++sequence,
      email: 'funding-isolation-' + sequence + '@example.com', password: 'testPassw0rd' })
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
  const shared = await User.create({ username: 'funding-isolation-shared-' + ++sequence,
    email: 'funding-isolation-' + sequence + '@example.com', password: 'testPassw0rd', budgetId: own.budget.id })
  return { own, foreign, shared }
}

test.group('Funding configuration isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    return Promise.all([db.from('categories').orderBy('id'), db.from('transactions').orderBy('id'),
      db.from('funding_plans').orderBy('id'), db.from('funding_plan_categories').orderBy('id')])
  }

  test('foreign and missing funding categories reject updates without mutation').with(['foreign', 'missing']).run(async ({ client, assert }, target) => {
    const before = await state()
    const id = target === 'foreign' ? fixture.foreign.category.id : missingId
    const response = await client.put(`/api/v1/funding-plans/item/${id}`)
      .json({ amount: 25, useGoal: true, goalDate: '2025-12-01', recurrence: 2 }).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('owner and shared-budget users can update own funding configuration').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const response = await client.put(`/api/v1/funding-plans/item/${fixture.own.category.id}`)
      .json({ amount: 25, useGoal: true, goalDate: '2025-12-01', recurrence: 2 }).accept('json').loginAs(actor === 'owner' ? fixture.own.user : fixture.shared)
    response.assertStatus(200)
    const category = await Category.findOrFail(fixture.own.category.id)
    assert.equal(category.fundingAmount, 25)
    assert.isTrue(category.useGoal)
    assert.equal(category.recurrence, 2)
    assert.equal(category.balance, 100)
    assert.equal((await Category.findOrFail(fixture.foreign.category.id)).fundingAmount, 99)
  })

  test('funding plan and proposed reads contain only budget categories', async ({ client, assert }) => {
    const plan = await client.get('/api/v1/funding-plans').accept('json').loginAs(fixture.shared)
    plan.assertStatus(200)
    const ids = plan.body().categories.map((row: { categoryId: number }) => row.categoryId)
    assert.include(ids, fixture.own.category.id)
    assert.notInclude(ids, fixture.foreign.category.id)
    const proposed = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').accept('json').loginAs(fixture.shared)
    proposed.assertStatus(200)
    const proposedIds = proposed.body().data.map((row: { categoryId: number }) => row.categoryId)
    assert.include(proposedIds, fixture.own.category.id)
    assert.notInclude(proposedIds, fixture.foreign.category.id)
  })
})
