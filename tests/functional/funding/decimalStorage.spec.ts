// Requires explicit authorization for localhost:5432/spendcraft_test
// and the existing configured/live/execution connection safeguards in tests/bootstrap.ts.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { CategoryType } from '#common/ResponseTypes'
import { calculateFunding } from '../../../client-src/Funding/calculateFunding.js'

let sequence = 0
async function fixture() {
  return db.transaction(async trx => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `funding-decimal-${++sequence}`,
      email: `funding-decimal-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Decimal storage', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Destination', type: CategoryType.Bill,
      balance: 0, useGoal: false, fundingCategories: [] })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    return { budget, user, group, category, pool }
  })
}
const balances = async () => Promise.all(['accounts', 'account_transactions', 'categories', 'statements']
  .map(table => db.from(table).orderBy('id')))

test.group('Funding decimal-string PostgreSQL acceptance', () => {
  test('Category CREATE and PATCH store both rule modes as strings and return numeric APIs').with(['create', 'patch'])
    .run(async ({ client, assert }, operation) => {
      const f = await fixture()
      const path = `/api/v1/groups/${f.group.id}/categories`
      const response = await (operation === 'create' ? client.post(path) : client.patch(`${path}/${f.category.id}`))
        .loginAs(f.user).json({ name: 'Rounded', type: CategoryType.Bill, useGoal: false, fundingCategories: [
          { categoryId: f.pool.id, amount: -0.125, percentage: false },
          { categoryId: f.pool.id, amount: 12.344, percentage: true },
          { categoryId: f.pool.id, amount: 87.656, percentage: true },
        ] })
      response.assertStatus(200)
      const id = operation === 'create' ? response.body().data.id : f.category.id
      const stored = await db.from('categories').where('id', id).firstOrFail()
      assert.deepEqual(stored.funding_categories.map((r: { amount: string }) => r.amount), ['-0.12', '12.34', '87.66'])
      assert.deepEqual(response.body().data.fundingCategories.map((r: { amount: number | string }) => r.amount), ['-0.12', 12.34, 87.66])
    })
  test('transfer CREATE and replacement persist base/fixed/percentage strings without changing balances from metadata').with(['create', 'replace'])
    .run(async ({ client, assert }, operation) => {
      const f = await fixture()
      const body = { date: '2026-10-01', type: 2, categories: [
        { categoryId: f.category.id, amount: 1, baseAmount: 1.005, fundingCategories: [
          { categoryId: f.pool.id, amount: -0.125, percentage: false },
          { categoryId: f.pool.id, amount: 100, percentage: true },
        ] }, { categoryId: f.pool.id, amount: -1 },
      ] }
      const created = await client.post('/api/v1/category-transfer').loginAs(f.user).json(body)
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const before = await balances()
      const response = operation === 'replace'
        ? await client.patch(`/api/v1/category-transfer/${id}`).loginAs(f.user).json(body) : created
      response.assertStatus(200)
      const stored = await db.from('transactions').where('id', id).firstOrFail()
      assert.strictEqual(response.body().data.transaction.categories[0].amount, '1.00')
      assert.strictEqual(response.body().data.transaction.categories[1].amount, '-1.00')
      assert.equal(stored.categories[0].baseAmount, '1.00')
      assert.deepEqual(stored.categories[0].fundingCategories.map((r: { amount: string }) => r.amount), ['-0.12', '100.00'])
      assert.strictEqual(response.body().data.transaction.categories[0].baseAmount, '1.00')
      assert.strictEqual(response.body().data.transaction.categories[0].fundingCategories[0].amount, '-0.12')
      assert.deepEqual(await balances(), before)
    })
  test('canonical Category reads and metadata-only saves preserve raw leaves and unrelated JSON', async ({ assert }) => {
    const f = await fixture()
    const raw = [{ categoryId: f.pool.id, amount: '1.00', percentage: false, note: { amount: 2.345 } },
      { categoryId: f.pool.id, amount: '100.00', percentage: true }]
    await db.from('categories').where('id', f.category.id).update({ funding_categories: JSON.stringify(raw) })
    const row = await Category.findOrFail(f.category.id)
    assert.equal(row.fundingCategories[0].amount, 1)
    assert.equal(row.fundingCategories[1].amount, 100)
    assert.isFalse(row.$isDirty)
    row.name = 'Metadata'; await row.save()
    assert.deepEqual((await db.from('categories').where('id', row.id).firstOrFail()).funding_categories, raw)
  })
  test('deleted canonical Transaction metadata remains readable without normalization', async ({ client, assert }) => {
    const f = await fixture()
    const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json({ date: '2026-10-01', type: 2,
      categories: [{ categoryId: f.category.id, amount: 1 }, { categoryId: f.pool.id, amount: -1 }] })
    response.assertStatus(200)
    const id = response.body().data.transaction.id
    const raw = [{ categoryId: f.category.id, amount: '1.00', baseAmount: '54.27',
      fundingCategories: [{ categoryId: f.pool.id, amount: '100.00', percentage: true }], extra: [2, 1, 2] },
      { categoryId: f.pool.id, amount: '-1.00', baseAmount: null, fundingCategories: null }]
    await db.from('transactions').where('id', id).update({ deleted: true, categories: JSON.stringify(raw) })
    const before = await balances(), row = await Transaction.findOrFail(id)
    assert.isTrue(row.deleted); assert.isFalse(row.$isDirty)
    assert.strictEqual(row.serialize().categories[0].baseAmount, '54.27')
    row.comment = 'Metadata'; await row.save()
    assert.deepEqual((await db.from('transactions').where('id', id).firstOrFail()).categories, raw)
    assert.deepEqual(await balances(), before)
  })
  test('actual funding reconstruction, residuals and proposed funding use numeric hydrated rules', async ({ client, assert }) => {
    const f = await fixture()
    await f.category.merge({ fundingAmount: 1, fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }] }).save()
    const loaded = await Category.findOrFail(f.category.id)
    const inputs = { [f.category.id]: { baseAmount: 1, fundingCategories: loaded.fundingCategories, includeFundingTransfers: false } }
    const calculated = calculateFunding(inputs, f.pool.id)
    const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json({ date: '2026-10-01', type: 2, categories: calculated })
    response.assertStatus(200)
    const saved = response.body().data.transaction.categories[0]
    assert.deepEqual(calculateFunding({ [f.category.id]: { baseAmount: Number(saved.baseAmount),
      fundingCategories: saved.fundingCategories.map((rule: { categoryId: number, amount: number | string, percentage: boolean }) => ({ ...rule, amount: Number(rule.amount) })), includeFundingTransfers: false } }, f.pool.id), calculated)
    const proposed = await client.get('/api/v1/funding-plans/proposed?date=2026-10-01').loginAs(f.user)
    proposed.assertStatus(200)
    assert.isNumber(proposed.body().data.find((r: { categoryId: number }) => r.categoryId === f.category.id).fundingCategories[0].amount)
  })
  test('PostgreSQL prior-month decimal extraction accepts numeric/string/mixed bases and nulls', async ({ client, assert }) => {
    const rows = (await db.rawQuery(`SELECT sum(coalesce(x."baseAmount",0))::text AS total
      FROM jsonb_to_recordset(?::jsonb) AS x("categoryId" int, amount decimal, "baseAmount" decimal)`,
    [JSON.stringify([{ categoryId: 1, amount: '1.00', baseAmount: '1.25' }, { categoryId: 1, amount: '1.00', baseAmount: 2.5 },
      { categoryId: 1, amount: '0.00', baseAmount: null }, { categoryId: 1, amount: '0.00' }])])).rows
    assert.equal(Number(rows[0].total), 3.75)
    const own = await fixture(), foreign = await fixture()
    const create = async (f: typeof own, date: string, baseAmount: number, type = 2) => {
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json({ date, type,
        categories: [{ categoryId: f.category.id, amount: 1, baseAmount }, { categoryId: f.pool.id, amount: -1 }] })
      response.assertStatus(200)
      const id = response.body().data.transaction.id
      if (typeof id !== 'number') throw new Error('Expected numeric fixture Transaction ID')
      return id
    }
    const ids = []
    for (let index = 0; index < 4; index++) ids.push(await create(own, '2026-10-10', 0))
    await create(own, '2026-09-10', 111)
    await create(own, '2026-11-10', 222)
    const deleted = await create(own, '2026-10-10', 333)
    const removed = await client.delete(`/api/v1/transaction/${deleted}`).loginAs(own.user)
    removed.assertStatus(200)
    await create(own, '2026-10-10', 444, 3)
    const foreignId = await create(foreign, '2026-10-10', 555)
    const foreignRow = await db.from('transactions').where('id', foreignId).firstOrFail()
    // Deliberately inconsistent, isolated historical fixture: Budget filtering must
    // exclude even a foreign row whose split references the requesting Category.
    foreignRow.categories[0].categoryId = own.category.id
    await db.from('transactions').where('id', foreignId).update({ categories: JSON.stringify(foreignRow.categories) })
    for (const values of [[1.25, 2.5, null, undefined], ['1.25', '2.50', null, undefined], ['1.25', 2.5, null, undefined]]) {
      for (const [index, id] of ids.entries()) {
        const stored = await db.from('transactions').where('id', id).firstOrFail()
        if (values[index] === undefined) delete stored.categories[0].baseAmount
        else stored.categories[0].baseAmount = values[index]
        await db.from('transactions').where('id', id).update({ categories: JSON.stringify(stored.categories) })
      }
      const before = await balances(), transactions = await db.from('transactions').orderBy('id')
      const response = await client.get('/api/v1/categories?date=2026-11-01').loginAs(own.user)
      response.assertStatus(200)
      const entries = response.body().data.filter((r: { id: number }) => r.id === own.category.id)
      assert.lengthOf(entries, 1)
      assert.equal(Number(entries[0].previousBaseAmount), 3.75)
      assert.isFalse(response.body().data.some((r: { id: number }) => r.id === foreign.category.id))
      assert.deepEqual(await balances(), before)
      assert.deepEqual(await db.from('transactions').orderBy('id'), transactions)
    }
  })
  test('foreign Budget rule references reject without configuration or financial changes', async ({ client, assert }) => {
    const own = await fixture(), foreign = await fixture(), before = await balances()
    const response = await client.patch(`/api/v1/groups/${own.group.id}/categories/${own.category.id}`).loginAs(own.user)
      .json({ name: 'Forbidden', fundingCategories: [{ categoryId: foreign.pool.id, amount: 100, percentage: true }] })
    assert.isAtLeast(response.status(), 400); assert.isBelow(response.status(), 500)
    assert.deepEqual(await balances(), before)
  })
  test('late funding failure atomically restores metadata, allocations and balances', async ({ client, assert }) => {
    const f = await fixture(), before = await balances(), transactions = await db.from('transactions').orderBy('id')
    const original = Category.prototype.save
    const fault = mock.method(Category.prototype, 'save', async function (this: Category) {
      const saved = await original.call(this)
      if (this.id === f.pool.id) throw new Error('Injected funding storage acceptance rollback')
      return saved
    })
    try {
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json({ date: '2026-10-01', type: 2,
        categories: [{ categoryId: f.category.id, amount: 1, baseAmount: 1.005 }, { categoryId: f.pool.id, amount: -1 }] })
      response.assertStatus(500)
    } finally { fault.mock.restore() }
    assert.deepEqual(await balances(), before)
    assert.deepEqual(await db.from('transactions').orderBy('id'), transactions)
  })
})
