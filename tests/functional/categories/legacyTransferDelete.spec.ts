import { parseMoneyCents } from '#common/moneyCents'
import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
// Requires fresh task-specific database authorization and current safeguards.
import { test } from '@japa/runner'
import { mock } from 'node:test'
import CategoriesController from '#controllers/CategoriesController'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Category from '#models/Category'
import { CategoryType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `legacy-delete-${++sequence}`,
      email: `legacy-delete-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Legacy deletion boundary', type:
      'Regular' })
    const category = await group.related('categories').create({ name: 'Destination',
      type: CategoryType.Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await pool.merge({ balanceCents: parseMoneyCents('100.00') }).save()
    return { budget, user, group, category, pool }
  })
}
async function history() {
  const result: Record<string, unknown> = {}
  for (const table of ['category_transfers', 'category_splits']) {
    result[table] = await db.connection().schema.hasTable(table) ? await db.from(table).orderBy(
      'id') : null
  }
  return result
}
async function seedRetainedHistory(categoryId: number, poolId: number) {
  // Current migration chain has neither legacy table. Never recreate or migrate it.
  // This branch prepares retention coverage only for an already-retained original schema.
  if (!await db.connection().schema.hasTable('category_transfers')
    || !await db.connection().schema.hasTable('category_splits')) return undefined
  const [row] = await db.table('category_transfers').insert({ date: '2020-01-01' }).returning('id')
  await db.table('category_splits').insert([{ transaction_id: -row.id, category_id: categoryId,
    amount: 98765.43 },
    { transaction_id: -row.id, category_id: poolId, amount: -98765.43 }])
  return Number(row.id)
}
async function financialState() {
  return Promise.all(['transactions', 'categories', 'accounts', 'account_transactions',
    'transaction_logs']
    .map((table) => db.from(table).orderBy('id')))
}

test.group('Legacy CategoryTransfer DELETE removed', (group) => {
  group.setup(async () => {
    console.info('Legacy CategoryTransfer table applicability', JSON.stringify({
      category_transfers: await db.connection().schema.hasTable('category_transfers'),
      category_splits: await db.connection().schema.hasTable('category_splits'),
    }))
  })
  test('own/foreign/guessed and alternate paths cannot reach legacy mutation')
    .with(['own', 'foreign', 'missing', 'collection', 'plural', 'nested'])
    .run(async ({ client, assert }, kind) => {
      const own = await fixture(); const foreign = await fixture()
      await foreign.category.merge({ balanceCents: parseMoneyCents('100.00') }).save()
      const ownId = await seedRetainedHistory(own.category.id, own.pool.id)
      const foreignId = await seedRetainedHistory(foreign.category.id, foreign.pool.id)
      const id = kind === 'foreign' ? foreignId ?? foreign.category.id : kind ===
        'missing' ? 2147483647 : ownId ?? own.category.id
      const path = kind === 'collection' ? '/api/v1/category-transfer'
        : kind === 'plural' ? `/api/v1/category-transfers/${id}`
        : kind === 'nested' ? `/api/v1/category/${own.category.id}/category-transfer/${id}`
        : `/api/v1/category-transfer/${id}`
      const before = await financialState(); const legacy = await history()
      assert.isUndefined(Reflect.get(CategoriesController.prototype, 'transferDelete'))
      const saves = mock.method(Category.prototype, 'save', async () => { throw new Error(
        'Removed route reached financial save') })
      try {
        const response = await client.delete(path).accept('json').loginAs(own.user)
        response.assertStatus(404)
        assert.equal(saves.mock.callCount(), 0)
      } finally { saves.mock.restore() }
      assert.equal((await Category.findOrFail(foreign.category.id)).balanceCents,
        parseMoneyCents('100.00'))
      assert.deepEqual(await financialState(), before)
      assert.deepEqual(await history(), legacy)
    })

  test('funding and rebalance create/replace/delete remain Transaction-based; history inert')
    .with([2, 3]).run(async ({ client, assert }, type) => {
      const f = await fixture()
      await seedRetainedHistory(f.category.id, f.pool.id)
      const legacy = await history()
      const rows = (amount: number) => [{ categoryId: f.category.id, amount }, { categoryId: f.pool
        .id, amount: -amount }]
      const created = await client.post('/api/v1/category-transfer')
        .json(categoryTransferRequest({ type, date: '2025-03-01', categories: rows(10) })).loginAs(f
          .user)
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
        '10.00'))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('90.00'))
      const changed = await client.patch(`/api/v1/category-transfer/${id}`)
        .json(categoryTransferRequest({ type, date: type === 2 ? '2025-03-01' : '2025-04-01',
          categories: rows(20) })).loginAs(f.user)
      changed.assertStatus(200)
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
        '20.00'))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('80.00'))
      const removed = await client.delete(`/api/v1/transaction/${id}`).loginAs(f.user)
      removed.assertStatus(200)
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('0.00'))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('100.00'))
      assert.deepEqual(await history(), legacy)
    })

  test('Category parent deletion retains the existing no-legacy-cleanup contract', async ({ client,
    assert }) => {
    const f = await fixture()
    await seedRetainedHistory(f.category.id, f.pool.id)
    const legacy = await history()
    const response = await client.delete(`/api/v1/groups/${f.group.id}/categories/${f.category.id}`)
      .loginAs(f.user)
    response.assertStatus(204)
    assert.isNull(await Category.find(f.category.id))
    // The original legacy schemas define plain integer references, not FKs/cascades.
    assert.deepEqual(await history(), legacy)
  })

  test('last-user Budget cleanup has no legacy-table runtime dependency', async ({ client,
    assert }) => {
    const f = await fixture()
    await seedRetainedHistory(f.category.id, f.pool.id)
    const legacy = await history()
    const response = await client.delete('/api/v1/user').loginAs(f.user)
    response.assertStatus(200)
    assert.isNull(await Budget.find(f.budget.id))
    assert.deepEqual(await history(), legacy)
  })
})
