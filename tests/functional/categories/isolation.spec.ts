import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import Group from '#models/Group'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { CategoryType, GroupType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const missingId = 2147483647

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `category-isolation-${label}-${++sequence}`,
      email: `category-isolation-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const group = await budget.related('groups').create({ name: `${label} group`, type: GroupType.Regular })
    const otherGroup = await budget.related('groups').create({ name: `${label} other group`, type: GroupType.Regular })
    const emptyGroup = await budget.related('groups').create({ name: `${label} empty group`, type: GroupType.Regular })
    const category = await group.related('categories').create({ name: `${label} category`, type: CategoryType.Regular, balance: 100, fundingCategories: [] })
    const otherCategory = await otherGroup.related('categories').create({ name: `${label} other category`, type: CategoryType.Regular, balance: 50, fundingCategories: [] })
    const unusedCategory = await otherGroup.related('categories').create({ name: `${label} unused category`, type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.REBALANCE_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0,
      categories: [{ categoryId: category.id, amount: -10 }, { categoryId: otherCategory.id, amount: 10 }], taxes: [],
    })
    return { budget, user, group, otherGroup, emptyGroup, category, otherCategory, unusedCategory, transaction }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const shared = await User.create({ username: `category-isolation-shared-${++sequence}`,
    email: `category-isolation-${sequence}@example.com`, password: 'testPassw0rd', budgetId: own.budget.id })
  return { own, foreign, shared }
}

test.group('Group/category/transfer isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    // Include all system categories and records in both budgets, plus related financial tables.
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    return Promise.all([
      db.from('groups').whereIn('application_id', budgets).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
      db.from('accounts').orderBy('id'), db.from('account_transactions').orderBy('id'),
      db.from('statements').orderBy('id'), db.from('loans').orderBy('id'),
    ])
  }

  interface Scenario { name: string, method: 'post' | 'patch' | 'delete', path: () => string, body?: () => object }
  const funding = (categoryId: number) => ({ categoryId, amount: 5, percentage: false })
  const categoryBody = (ids: number[] = []) => ({ name: 'New category', useGoal: false, fundingCategories: ids.map(funding) })
  const transferBody = (ids: number[], nestedIds: number[] = []) => ({
    date: '2025-03-01', type: TransactionType.REBALANCE_TRANSACTION,
    categories: ids.map((categoryId, index) => ({ categoryId, amount: index === 0 ? -10 : 10,
      fundingCategories: nestedIds.map(funding) })),
  })
  const scenarios: Scenario[] = [
    { name: 'foreign parent on group creation', method: 'post', path: () => '/groups', body: () => ({ name: 'New group', parentGroupId: fixture.foreign.group.id }) },
    { name: 'missing parent on group creation', method: 'post', path: () => '/groups', body: () => ({ name: 'New group', parentGroupId: missingId }) },
    { name: 'foreign group update', method: 'patch', path: () => `/groups/${fixture.foreign.group.id}`, body: () => ({ name: 'Changed group' }) },
    { name: 'foreign parent on group update', method: 'patch', path: () => `/groups/${fixture.own.group.id}`, body: () => ({ parentGroupId: fixture.foreign.group.id }) },
    { name: 'foreign empty group deletion', method: 'delete', path: () => `/groups/${fixture.foreign.emptyGroup.id}` },
    { name: 'foreign group category creation', method: 'post', path: () => `/groups/${fixture.foreign.group.id}/categories`, body: () => categoryBody() },
    { name: 'foreign funding category creation', method: 'post', path: () => `/groups/${fixture.own.group.id}/categories`, body: () => categoryBody([fixture.own.category.id, fixture.foreign.category.id]) },
    { name: 'missing funding category creation', method: 'post', path: () => `/groups/${fixture.own.group.id}/categories`, body: () => categoryBody([fixture.own.category.id, missingId]) },
    { name: 'foreign category update', method: 'patch', path: () => `/groups/${fixture.foreign.group.id}/categories/${fixture.foreign.category.id}`, body: () => ({ name: 'Changed category' }) },
    { name: 'own group with foreign category update', method: 'patch', path: () => `/groups/${fixture.own.group.id}/categories/${fixture.foreign.category.id}`, body: () => ({ name: 'Changed category' }) },
    { name: 'same-budget move with foreign funding reference', method: 'patch', path: () => `/groups/${fixture.own.otherGroup.id}/categories/${fixture.own.category.id}`, body: () => ({ name: 'Changed category', fundingCategories: [fixture.own.category.id, fixture.foreign.category.id].map(funding) }) },
    { name: 'reparent own category to foreign group', method: 'patch', path: () => `/groups/${fixture.foreign.group.id}/categories/${fixture.own.category.id}`, body: () => ({ name: 'Changed category' }) },
    { name: 'mixed repeated funding references on update', method: 'patch', path: () => `/groups/${fixture.own.group.id}/categories/${fixture.own.category.id}`, body: () => ({ name: 'Changed category', fundingCategories: [fixture.own.category.id, fixture.own.category.id, fixture.foreign.category.id].map(funding) }) },
    { name: 'foreign category deletion', method: 'delete', path: () => `/groups/${fixture.foreign.otherGroup.id}/categories/${fixture.foreign.unusedCategory.id}` },
    { name: 'own group with foreign category deletion', method: 'delete', path: () => `/groups/${fixture.own.group.id}/categories/${fixture.foreign.unusedCategory.id}` },
    { name: 'same-budget wrong parent category deletion', method: 'delete', path: () => `/groups/${fixture.own.group.id}/categories/${fixture.own.unusedCategory.id}` },
    { name: 'mixed category transfer creation', method: 'post', path: () => '/category-transfer', body: () => transferBody([fixture.own.category.id, fixture.foreign.category.id]) },
    { name: 'mixed repeated category transfer creation', method: 'post', path: () => '/category-transfer', body: () => transferBody([fixture.own.category.id, fixture.own.category.id, fixture.foreign.category.id]) },
    { name: 'missing category transfer creation', method: 'post', path: () => '/category-transfer', body: () => transferBody([fixture.own.category.id, missingId]) },
    { name: 'foreign nested funding on transfer creation', method: 'post', path: () => '/category-transfer', body: () => transferBody([fixture.own.category.id, fixture.own.otherCategory.id], [fixture.foreign.category.id]) },
    { name: 'mixed category transfer update', method: 'patch', path: () => `/category-transfer/${fixture.own.transaction.id}`, body: () => transferBody([fixture.own.category.id, fixture.foreign.category.id]) },
    { name: 'foreign nested funding on transfer update', method: 'patch', path: () => `/category-transfer/${fixture.own.transaction.id}`, body: () => transferBody([fixture.own.category.id, fixture.own.otherCategory.id], [fixture.own.category.id, fixture.foreign.category.id]) },
    { name: 'missing nested funding on transfer creation', method: 'post', path: () => '/category-transfer', body: () => transferBody([fixture.own.category.id, fixture.own.otherCategory.id], [missingId]) },
    { name: 'missing nested funding on transfer update', method: 'patch', path: () => `/category-transfer/${fixture.own.transaction.id}`, body: () => transferBody([fixture.own.category.id, fixture.own.otherCategory.id], [missingId]) },
    { name: 'missing group update', method: 'patch', path: () => `/groups/${missingId}`, body: () => ({ name: 'Changed group' }) },
    { name: 'missing group deletion', method: 'delete', path: () => `/groups/${missingId}` },
    { name: 'missing category update', method: 'patch', path: () => `/groups/${fixture.own.group.id}/categories/${missingId}`, body: () => ({ name: 'Changed category' }) },
    { name: 'missing category deletion', method: 'delete', path: () => `/groups/${fixture.own.group.id}/categories/${missingId}` },
    { name: 'missing funding category update', method: 'patch', path: () => `/groups/${fixture.own.group.id}/categories/${fixture.own.category.id}`, body: () => ({ name: 'Changed category', fundingCategories: [fixture.own.category.id, missingId].map(funding) }) },
    { name: 'foreign transfer update', method: 'patch', path: () => `/category-transfer/${fixture.foreign.transaction.id}`, body: () => transferBody([fixture.own.category.id, fixture.own.otherCategory.id]) },
  ]

  test('rejects {name} without changing persisted state').with(scenarios).run(async ({ client, assert }, scenario) => {
    const before = await state()
    const request = client[scenario.method](`/api/v1${scenario.path()}`).accept('json').loginAs(fixture.own.user)
    if (scenario.body) request.json(scenario.body())
    const response = await request
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('rejects inaccessible category reads without disclosing balances').with(['foreign', 'missing']).run(async ({ client, assert }, target) => {
    const id = target === 'foreign' ? fixture.foreign.category.id : missingId
    const response = await client.get(`/api/v1/category/${id}/transactions`).accept('json').loginAs(fixture.own.user)
    response.assertStatus(404)
    assert.notProperty(response.body(), 'data')
  })

  test('rejects inaccessible exclusion transactions without changing state').with(['foreign', 'missing', 'legacy-cross-reference']).run(async ({ client, assert }, target) => {
    if (target === 'legacy-cross-reference') {
      fixture.foreign.transaction.categories = [{ categoryId: fixture.own.category.id, amount: -10 }]
      await fixture.foreign.transaction.save()
    }
    const id = target === 'missing' ? missingId : fixture.foreign.transaction.id
    const ordinary = await client.get('/api/v1/category-balances?date=2025-03-01').accept('json').loginAs(fixture.own.user)
    ordinary.assertStatus(200)
    const before = await state()
    const response = await client.get(`/api/v1/category-balances?date=2025-03-01&id=${id}`).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
    assert.notProperty(response.body(), 'data')
  })

  test('category PATCH treats the URL group as an authorized destination').with([
    { actor: 'owner', move: false },
    { actor: 'owner', move: true },
    { actor: 'shared', move: true },
  ]).run(async ({ client, assert }, scenario) => {
    const destination = scenario.move ? fixture.own.otherGroup : fixture.own.group
    const before = await state()
    const response = await client.patch(`/api/v1/groups/${destination.id}/categories/${fixture.own.category.id}`)
      .json({ name: 'Updated category', fundingCategories: [funding(fixture.own.otherCategory.id)] })
      .accept('json').loginAs(scenario.actor === 'owner' ? fixture.own.user : fixture.shared)
    response.assertStatus(200)
    const category = await Category.findOrFail(fixture.own.category.id)
    assert.equal(category.groupId, destination.id)
    assert.equal(category.name, 'Updated category')
    assert.equal(category.balance, 100)
    assert.deepEqual(category.fundingCategories, [funding(fixture.own.otherCategory.id)])
    assert.equal(response.body().data.groupId, destination.id)
    // Only the updated category's metadata may change; all other persisted state is identical.
    const withoutUpdatedCategory = (snapshot: Awaited<ReturnType<typeof state>>) => snapshot.map((rows, index) => (
      index === 1 ? rows.filter((row: { id: number }) => row.id !== category.id) : rows
    ))
    assert.deepEqual(withoutUpdatedCategory(await state()), withoutUpdatedCategory(before))
  })

  test('shared-budget user retains group and category CRUD and parent references', async ({ client, assert }) => {
    const parent = fixture.own.group.id
    const added = await client.post('/api/v1/groups').json({ name: 'Shared group', parentGroupId: parent }).accept('json').loginAs(fixture.shared)
    added.assertStatus(200)
    const groupId: number = added.body().data.id
    const updated = await client.patch(`/api/v1/groups/${groupId}`).json({ name: 'Renamed shared group', parentGroupId: fixture.own.otherGroup.id }).accept('json').loginAs(fixture.shared)
    updated.assertStatus(200)
    assert.equal((await Group.findOrFail(groupId)).parentGroupId, fixture.own.otherGroup.id)
    const fundingCategories = [fixture.own.category.id, fixture.own.category.id].map(funding)
    const category = await client.post(`/api/v1/groups/${groupId}/categories`).json({ ...categoryBody(), fundingCategories }).accept('json').loginAs(fixture.shared)
    category.assertStatus(200)
    const categoryId: number = category.body().data.id
    assert.deepEqual((await Category.findOrFail(categoryId)).fundingCategories, fundingCategories)
    const changed = await client.patch(`/api/v1/groups/${groupId}/categories/${categoryId}`).json({ name: 'Renamed shared category', fundingCategories }).accept('json').loginAs(fixture.shared)
    changed.assertStatus(200)
    const deleted = await client.delete(`/api/v1/groups/${groupId}/categories/${categoryId}`).accept('json').loginAs(fixture.shared)
    deleted.assertStatus(204)
    const deletedGroup = await client.delete(`/api/v1/groups/${groupId}`).accept('json').loginAs(fixture.shared)
    deletedGroup.assertStatus(204)
  })

  test('shared-budget user retains reads and transfer arithmetic with repeated categories', async ({ client, assert }) => {
    const read = await client.get(`/api/v1/category/${fixture.own.category.id}/transactions`).accept('json').loginAs(fixture.shared)
    read.assertStatus(200)
    assert.equal(read.body().data.balance, 100)
    const balances = await client.get(`/api/v1/category-balances?date=2025-03-01&id=${fixture.own.transaction.id}`).accept('json').loginAs(fixture.shared)
    balances.assertStatus(200)
    assert.deepEqual(balances.body().find((row: { id: number }) => row.id === fixture.own.category.id), { id: fixture.own.category.id, balance: 110 })
    const created = await client.post('/api/v1/category-transfer').json(transferBody([fixture.own.category.id, fixture.own.otherCategory.id], [fixture.own.category.id]))
      .accept('json').loginAs(fixture.shared)
    created.assertStatus(200)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 90)
    assert.equal((await Category.findOrFail(fixture.own.otherCategory.id)).balance, 60)
    const id: number = created.body().data.transaction.id
    const updated = await client.patch(`/api/v1/category-transfer/${id}`).json({ date: '2025-03-02', type: TransactionType.REBALANCE_TRANSACTION,
      categories: [{ categoryId: fixture.own.category.id, amount: -5 }, { categoryId: fixture.own.category.id, amount: -10 }, { categoryId: fixture.own.otherCategory.id, amount: 15 }] })
      .accept('json').loginAs(fixture.shared)
    updated.assertStatus(200)
    assert.equal((await Category.findOrFail(fixture.own.category.id)).balance, 85)
    assert.equal((await Category.findOrFail(fixture.own.otherCategory.id)).balance, 65)
    assert.equal((await Transaction.findOrFail(id)).budgetId, fixture.own.budget.id)
    assert.equal((await Category.findOrFail(fixture.foreign.category.id)).balance, 100)
  })

  test('rejects unsafe stored transfer references before undoing balances').with(['split', 'nested']).run(async ({ client, assert }, reference) => {
    const transaction = fixture.own.transaction
    const categories = reference === 'split'
      ? [{ categoryId: fixture.foreign.category.id, amount: -10 }, { categoryId: fixture.own.otherCategory.id, amount: 10 }]
      : [{ categoryId: fixture.own.category.id, amount: -10, fundingCategories: [funding(fixture.foreign.category.id)] }, { categoryId: fixture.own.otherCategory.id, amount: 10 }]
    transaction.categories = categories
    await transaction.save()
    const before = await state()
    const response = await client.patch(`/api/v1/category-transfer/${transaction.id}`)
      .json(transferBody([fixture.own.category.id, fixture.own.otherCategory.id])).accept('json').loginAs(fixture.own.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(404)
  })

  test('optional split ID cannot select a foreign existing record', async ({ client, assert }) => {
    const response = await client.post('/api/v1/category-transfer').json({ date: '2025-03-01', type: TransactionType.REBALANCE_TRANSACTION,
      categories: [{ id: fixture.foreign.transaction.id, categoryId: fixture.own.category.id, amount: -10 },
        { categoryId: fixture.own.otherCategory.id, amount: 10 }] }).accept('json').loginAs(fixture.shared)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().data.transaction.id)
    assert.equal(transaction.budgetId, fixture.own.budget.id)
    assert.notEqual(transaction.id, fixture.foreign.transaction.id)
    assert.notProperty(transaction.categories[0], 'id')
    assert.equal((await Category.findOrFail(fixture.foreign.category.id)).balance, 100)
  })

  test('legacy transfer tables are absent from the configured schema', async ({ assert }) => {
    assert.isFalse(await db.connection().schema.hasTable('category_transfers'))
    assert.isFalse(await db.connection().schema.hasTable('category_splits'))
  })
})
