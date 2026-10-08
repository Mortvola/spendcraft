import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import { CategoryType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const missingId = 2147483647

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: 'assignment-isolation-' + label + '-' + ++sequence,
      email: 'assignment-isolation-' + sequence + '@example.com', password: 'testPassw0rd' })
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
  const shared = await User.create({ username: 'assignment-isolation-shared-' + ++sequence,
    email: 'assignment-isolation-' + sequence + '@example.com', password: 'testPassw0rd', budgetId: own.budget.id })
  return { own, foreign, shared }
}

test.group('Auto-assignment isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  let ownId: number
  let foreignId: number
  let ownChild: number
  let foreignChild: number
  let otherId: number
  let otherChild: number
  group.each.setup(async () => {
    fixture = await createFixture()
    const own = await fixture.own.budget.related('autoAssignment').create({ name: 'Own rule', searchStrings: ['own'] })
    const foreign = await fixture.foreign.budget.related('autoAssignment').create({ name: 'Foreign rule', searchStrings: ['foreign'] })
    const other = await fixture.own.budget.related('autoAssignment').create({ name: 'Other own rule', searchStrings: ['other'] })
    ownId = own.id
    foreignId = foreign.id
    otherId = other.id
    ownChild = (await own.related('categories').create({ categoryId: fixture.own.category.id, amount: 10, percentage: false })).id
    foreignChild = (await foreign.related('categories').create({ categoryId: fixture.foreign.category.id, amount: 15, percentage: false })).id
    otherChild = (await other.related('categories').create({ categoryId: fixture.own.category.id, amount: 20, percentage: false })).id
  })

  async function state() {
    return Promise.all([db.from('auto_assignments').orderBy('id'), db.from('auto_assignment_categories').orderBy('id'),
      db.from('categories').orderBy('id'), db.from('transactions').orderBy('id'),
      db.from('accounts').orderBy('id'), db.from('transaction_logs').orderBy('id')])
  }
  const split = (id: number, categoryId: number) => ({ id, categoryId, amount: 5, percentage: false })
  interface Scenario { name: string, method: 'post' | 'patch' | 'delete', id: () => number, categories: () => ReturnType<typeof split>[] }
  const cases: Scenario[] = [
    { name: 'creation with foreign category', method: 'post', id: () => ownId, categories: () => [split(-1, fixture.foreign.category.id)] },
    { name: 'creation with mixed repeated references', method: 'post', id: () => ownId, categories: () => [split(-1, fixture.own.category.id), split(-2, fixture.own.category.id), split(-3, fixture.foreign.category.id)] },
    { name: 'creation with missing category', method: 'post', id: () => ownId, categories: () => [split(-1, missingId)] },
    { name: 'foreign assignment PATCH', method: 'patch', id: () => foreignId, categories: () => [split(-1, fixture.own.category.id)] },
    { name: 'missing assignment PATCH', method: 'patch', id: () => missingId, categories: () => [] },
    { name: 'foreign child PATCH', method: 'patch', id: () => ownId, categories: () => [split(ownChild, fixture.own.category.id), split(foreignChild, fixture.own.category.id)] },
    { name: 'same-budget wrong-parent child PATCH', method: 'patch', id: () => ownId, categories: () => [split(otherChild, fixture.own.category.id)] },
    { name: 'missing child PATCH', method: 'patch', id: () => ownId, categories: () => [split(ownChild, fixture.own.category.id), split(missingId, fixture.own.category.id)] },
    { name: 'foreign category on existing child PATCH', method: 'patch', id: () => ownId, categories: () => [split(ownChild, fixture.foreign.category.id)] },
    { name: 'mixed category PATCH', method: 'patch', id: () => ownId, categories: () => [split(ownChild, fixture.own.category.id), split(-1, fixture.foreign.category.id)] },
    { name: 'missing category PATCH', method: 'patch', id: () => ownId, categories: () => [split(ownChild, missingId)] },
    { name: 'foreign DELETE', method: 'delete', id: () => foreignId, categories: () => [] },
    { name: 'missing DELETE', method: 'delete', id: () => missingId, categories: () => [] },
  ]
  test('rejects {name} before any persisted change').with(cases).run(async ({ client, assert }, scenario) => {
    const before = await state()
    const path = scenario.method === 'post' ? '/api/v1/auto-assignments' : `/api/v1/auto-assignments/${scenario.id()}`
    const request = client[scenario.method](path).accept('json').loginAs(fixture.own.user)
    if (scenario.method !== 'delete') request.json({ name: 'Changed rule', searchStrings: ['changed'], categories: scenario.categories() })
    const response = await request
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('owner and shared-budget users retain child update/create/removal semantics').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const created = await client.post('/api/v1/auto-assignments').json({ name: 'New rule', searchStrings: ['new'],
      categories: [split(foreignChild, fixture.own.category.id), split(-1, fixture.own.category.id)] }).accept('json').loginAs(user)
    created.assertStatus(200)
    // POST ignores supplied child IDs and creates new children; it cannot select the foreign child.
    assert.notEqual(created.body().categories[0].id, foreignChild)
    const updated = await client.patch(`/api/v1/auto-assignments/${ownId}`).json({ name: 'Updated rule', searchStrings: ['first', 'second'],
      categories: [split(ownChild, fixture.own.category.id), split(-1, fixture.own.category.id)] }).accept('json').loginAs(user)
    updated.assertStatus(200)
    assert.lengthOf(updated.body().categories, 2)
    assert.deepEqual(updated.body().searchStrings, ['first', 'second'])
    assert.equal(updated.body().categories[0].id, ownChild)
    const cleared = await client.patch(`/api/v1/auto-assignments/${ownId}`).json({ name: 'Cleared rule', searchStrings: [], categories: [] }).accept('json').loginAs(user)
    cleared.assertStatus(200)
    assert.lengthOf(await db.from('auto_assignment_categories').where('auto_assignment_id', ownId), 0)
    const deleted = await client.delete(`/api/v1/auto-assignments/${ownId}`).accept('json').loginAs(user)
    deleted.assertStatus(200)
    assert.isNull(await db.from('auto_assignments').where('id', ownId).first())
    assert.equal((await db.from('auto_assignment_categories').where('id', foreignChild).first()).amount, 15)
    assert.exists(await db.from('auto_assignments').where('id', otherId).first())
  })

  test('assignment reads are budget-scoped', async ({ client, assert }) => {
    const own = await client.get(`/api/v1/auto-assignments/${ownId}`).accept('json').loginAs(fixture.shared)
    own.assertStatus(200)
    const foreign = await client.get(`/api/v1/auto-assignments/${foreignId}`).accept('json').loginAs(fixture.own.user)
    foreign.assertStatus(404)
    const list = await client.get('/api/v1/auto-assignments').accept('json').loginAs(fixture.shared)
    list.assertStatus(200)
    const ids = list.body().map((row: { id: number }) => row.id)
    assert.include(ids, ownId)
    assert.notInclude(ids, foreignId)
  })
})
