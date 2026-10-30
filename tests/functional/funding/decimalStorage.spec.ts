import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
import { categoryRequest } from '../../helpers/categoryRequest.js'
// Requires explicit authorization for localhost:5432/spendcraft_test
// and the existing configured/live/execution connection safeguards in tests/bootstrap.ts.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { CategoryType, TransactionType } from '#common/ResponseTypes'
import { fundingForServer as calculateFunding } from '../../fixtures/funding/legacyPreview.js'

let sequence = 0
async function fixture() {
  return db.transaction(async trx => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `funding-decimal-${++sequence}`,
      email: `funding-decimal-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Decimal storage', type:
      'Regular' })
    const category = await group.related('categories').create({ name: 'Destination',
      type: CategoryType.Bill,
      balance: 0, useGoal: false, fundingCategories: [] })
    const pool = await budget.getFundingPoolCategory({ client: trx })
    return { budget, user, group, category, pool }
  })
}
const balances = async () => Promise.all(['accounts', 'account_transactions', 'categories',
  'statements']
  .map(table => db.from(table).orderBy('id')))

test.group('Funding decimal-string PostgreSQL acceptance', () => {
  test('transfer and funding replacements retain exact signed duplicate-ID balance effects')
    .with([TransactionType.FUNDING_TRANSACTION, TransactionType.REBALANCE_TRANSACTION]
      .flatMap(type => [1, -1].map(sign => ({ type, sign }))))
    .run(async ({ client, assert }, { type, sign }) => {
      const f = await fixture()
      const foreign = await fixture()
      const foreignBefore = await db.from('categories').whereIn('id', [foreign.category.id,
        foreign.pool.id]).orderBy('id')
      await f.category.merge({ balance: sign * 0.1 }).save()
      await f.pool.merge({ balance: sign * 0.1 }).save()
      const body = (replacement: boolean) => categoryTransferRequest({ type, date: '2025-02-01',
        categories: [{ categoryId: f.category.id, amount: sign * 0.1 },
          { categoryId: f.category.id, amount: sign * (replacement ? 0.3 : 0.1) },
          { categoryId: f.pool.id, amount: -sign * (replacement ? 0.4 : 0.2) }] })
      const created = await client.post('/api/v1/category-transfer').json(body(false))
        .loginAs(f.user)
      created.assertStatus(200)
      const id: number = created.body().data.transaction.id
      for (const replacement of [true, true, false]) {
        const response = await client.patch(`/api/v1/category-transfer/${id}`)
          .json(body(replacement)).loginAs(f.user)
        response.assertStatus(200)
        assert.strictEqual((await Category.findOrFail(f.category.id)).balance,
          sign * (replacement ? 0.5 : 0.3))
        assert.strictEqual((await Category.findOrFail(f.pool.id)).balance,
          sign * (replacement ? -0.3 : -0.1))
        assert.strictEqual(response.body().data.balances.find((row: { id: number }) => row.id ===
          f.category.id).balance, sign < 0 ? (replacement ? '-0.50' : '-0.30')
            : (replacement ? '0.50' : '0.30'))
      }
      const raw = await db.from('transactions').where('id', id).firstOrFail()
      assert.deepEqual(raw.categories.map((row: { amount: string }) => row.amount),
        sign > 0 ? ['0.10', '0.10', '-0.20'] : ['-0.10', '-0.10', '0.20'])
      assert.deepEqual(await db.from('categories').whereIn('id', [foreign.category.id,
        foreign.pool.id]).orderBy('id'), foreignBefore)
    })

  test('out-of-range resulting balance rolls back funding and all financial writes', async ({
    client, assert }) => {
    const f = await fixture()
    await f.category.merge({ balance: 9999999999.99 }).save()
    const before = await balances()
    const transactions = await db.from('transactions').orderBy('id')
    const response = await client.post('/api/v1/category-transfer').loginAs(f.user)
      .json(categoryTransferRequest({ type: TransactionType.FUNDING_TRANSACTION,
        date: '2025-02-01', categories: [{ categoryId: f.category.id, amount: 0.01 },
          { categoryId: f.pool.id, amount: -0.01 }] }))
    response.assertStatus(500)
    assert.deepEqual(await balances(), before)
    assert.deepEqual(await db.from('transactions').orderBy('id'), transactions)
  })

  test('Category CREATE and PATCH store both rule modes as strings and return numeric APIs').with([
    'create', 'patch'])
    .run(async ({ client, assert }, operation) => {
      const f = await fixture()
      const path = `/api/v1/groups/${f.group.id}/categories`
      const response = await (operation === 'create' ? client.post(path) : client.patch(`${path}/${f
        .category.id}`))
        .loginAs(f.user).json(categoryRequest({ name: 'Rounded', type: CategoryType.Bill,
          useGoal: false, fundingAmount: 12.345, fundingCategories: [
          { categoryId: f.pool.id, amount: -0.125, percentage: false },
          { categoryId: f.pool.id, amount: 12.344, percentage: true },
          { categoryId: f.pool.id, amount: 87.656, percentage: true },
        ] }))
      response.assertStatus(200)
      const id = operation === 'create' ? response.body().data.id : f.category.id
      const stored = await db.from('categories').where('id', id).firstOrFail()
      assert.strictEqual(stored.funding_amount, '12.35')
      assert.strictEqual(response.body().data.fundingAmount, '12.35')
      assert.strictEqual((await Category.findOrFail(id)).fundingAmount, 12.35)
      assert.deepEqual(stored.funding_categories.map((r: { amount: string }) => r.amount), ['-0.12',
        '12.34', '87.66'])
      assert.deepEqual(response.body().data.fundingCategories.map((r: {
        amount: number | string }) => r.amount), ['-0.12', 12.34, 87.66])
    })
  test('Category money/percentage wire types reject atomically').with(['create', 'patch'].flatMap(
    operation =>
    ['fundingAmount', 'fixed', 'percentage'].map(field => ({ operation, field }))))
    .run(async ({ client, assert }, { operation, field }) => {
      const f = await fixture(), before = await balances()
      const categories = await db.from('categories').where('group_id', f.category.groupId).orderBy(
        'id')
      const values = field === 'percentage' ? ['100', '100.00', null, 'Infinity'] : [0, '1.2',
        '-0.00', '90071992547409.92']
      for (const amount of values) {
        const payload = { name: 'Rejected', type: CategoryType.Bill, useGoal: false,
          fundingAmount: '0.00', fundingCategories: [{ categoryId: f.pool.id, amount: '1.00',
            percentage: false }] }
        if (field === 'fundingAmount') Reflect.set(payload, 'fundingAmount', amount)
        else {
          Reflect.set(payload.fundingCategories[0], 'amount', amount)
          payload.fundingCategories[0].percentage = field === 'percentage'
        }
        const path = `/api/v1/groups/${f.category.groupId}/categories`
        const request = operation === 'create' ? client.post(path) : client.patch(`${path}/${f
          .category.id}`)
        const response = await request.loginAs(f.user).accept('json').json(payload)
        response.assertStatus(422)
        assert.deepEqual(await balances(), before)
        assert.deepEqual(await db.from('categories').where('group_id', f.category.groupId).orderBy(
          'id'), categories)
      }
    })
  test('transfer money wire types reject before mutation on CREATE and PATCH').with(['create',
    'patch'])
    .run(async ({ client, assert }, operation) => {
      const f = await fixture()
      const body = { date: '2026-10-01', type: 2, categories: [
        { categoryId: f.category.id, amount: '1.00', baseAmount: '1.00', fundingCategories: [
          { categoryId: f.pool.id, amount: '1.00', percentage: false },
        ] }, { categoryId: f.pool.id, amount: '-1.00' },
      ] }
      const created = await client.post('/api/v1/category-transfer').json(body).accept('json')
        .loginAs(f.user)
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const before = await balances(), transactions = await db.from('transactions').orderBy('id')
      for (const field of ['amount', 'baseAmount', 'fixed', 'percentage']) {
        const values = field === 'percentage' ? ['100', '100.00'] : [1, '1.005', '-0.00',
          '90071992547409.92']
        for (const amount of values) {
          const payload = structuredClone(body)
          if (field === 'fixed' || field === 'percentage') {
            const rule = payload.categories[0].fundingCategories?.[0]
            if (!rule) throw new Error('Expected fixture funding rule')
            Reflect.set(rule, 'amount', amount)
            rule.percentage = field === 'percentage'
          } else Reflect.set(payload.categories[0], field, amount)
          const request = operation === 'create' ? client.post('/api/v1/category-transfer') : client
            .patch(`/api/v1/category-transfer/${id}`)
          const response = await request.json(payload).accept('json').loginAs(f.user)
          response.assertStatus(422)
          assert.deepEqual(await balances(), before)
          assert.deepEqual(await db.from('transactions').orderBy('id'), transactions)
        }
      }
    })
  test(
    'transfer CREATE and replacement persist base/fixed/percentage strings without changing \
balances from metadata').with(['create', 'replace'])
    .run(async ({ client, assert }, operation) => {
      const f = await fixture()
      const body = { date: '2026-10-01', type: 2, categories: [
        { categoryId: f.category.id, amount: 1, baseAmount: 1.005, fundingCategories: [
          { categoryId: f.pool.id, amount: -0.125, percentage: false },
          { categoryId: f.pool.id, amount: 100, percentage: true },
        ] }, { categoryId: f.pool.id, amount: -1 },
      ] }
      const created = await client.post('/api/v1/category-transfer').loginAs(f.user).json(
        categoryTransferRequest(body))
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const before = await balances()
      const response = operation === 'replace'
        ? await client.patch(`/api/v1/category-transfer/${id}`).loginAs(f.user).json(
          categoryTransferRequest(body)) : created
      response.assertStatus(200)
      const stored = await db.from('transactions').where('id', id).firstOrFail()
      assert.strictEqual(response.body().data.transaction.categories[0].amount, '1.00')
      assert.strictEqual(response.body().data.transaction.categories[1].amount, '-1.00')
      assert.equal(stored.categories[0].baseAmount, '1.00')
      assert.deepEqual(stored.categories[0].fundingCategories.map((r: { amount: string }) => r
        .amount), ['-0.12', '100.00'])
      assert.strictEqual(response.body().data.transaction.categories[0].baseAmount, '1.00')
      assert.strictEqual(response.body().data.transaction.categories[0].fundingCategories[0].amount,
        '-0.12')
      assert.deepEqual(await balances(), before)
    })
  test('canonical Category reads and metadata-only saves preserve raw leaves and unrelated JSON',
    async ({ assert }) => {
    const f = await fixture()
    const raw = [{ categoryId: f.pool.id, amount: '1.00', percentage: false, note: {
      amount: 2.345 } },
      { categoryId: f.pool.id, amount: '100.00', percentage: true }]
    await db.from('categories').where('id', f.category.id).update({ funding_categories: JSON
      .stringify(raw) })
    const row = await Category.findOrFail(f.category.id)
    assert.equal(row.fundingCategories[0].amount, 1)
    assert.equal(row.fundingCategories[1].amount, 100)
    assert.isFalse(row.$isDirty)
    row.name = 'Metadata'; await row.save()
    assert.deepEqual((await db.from('categories').where('id', row.id).firstOrFail())
      .funding_categories, raw)
  })
  test('deleted canonical Transaction metadata remains readable without normalization', async ({
    client, assert }) => {
    const f = await fixture()
    const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json(
      categoryTransferRequest({ date: '2026-10-01', type: 2,
      categories: [{ categoryId: f.category.id, amount: 1 }, { categoryId: f.pool.id, amount: -
        1 }] }))
    response.assertStatus(200)
    const id = response.body().data.transaction.id
    const raw = [{ categoryId: f.category.id, amount: '1.00', baseAmount: '54.27',
      fundingCategories: [{ categoryId: f.pool.id, amount: '100.00', percentage: true }], extra: [2,
        1, 2] },
      { categoryId: f.pool.id, amount: '-1.00', baseAmount: null, fundingCategories: null }]
    await db.from('transactions').where('id', id).update({ deleted: true, categories: JSON
      .stringify(raw) })
    const before = await balances(), row = await Transaction.findOrFail(id)
    assert.isTrue(row.deleted); assert.isFalse(row.$isDirty)
    assert.strictEqual(row.serialize().categories[0].baseAmount, '54.27')
    row.comment = 'Metadata'; await row.save()
    assert.deepEqual((await db.from('transactions').where('id', id).firstOrFail()).categories, raw)
    assert.deepEqual(await balances(), before)
  })
  test('actual funding reconstruction, residuals and proposed funding use numeric hydrated rules',
    async ({ client, assert }) => {
    const f = await fixture()
    await f.category.merge({ fundingAmount: 1, fundingCategories: [{ categoryId: f.pool.id,
      amount: 100, percentage: true }] }).save()
    const loaded = await Category.findOrFail(f.category.id)
    const inputs = { [f.category.id]: { baseAmount: 1, fundingCategories: loaded.fundingCategories,
      includeFundingTransfers: false } }
    const calculated = calculateFunding(inputs, f.pool.id)
    const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json(
      categoryTransferRequest({ date: '2026-10-01', type: 2, categories: calculated }))
    response.assertStatus(200)
    const saved = response.body().data.transaction.categories[0]
    assert.deepEqual(calculateFunding({ [f.category.id]: { baseAmount: Number(saved.baseAmount),
      fundingCategories: saved.fundingCategories.map((rule: { categoryId: number,
        amount: number | string, percentage: boolean }) => ({ ...rule, amount: Number(rule
        .amount) })), includeFundingTransfers: false } }, f.pool.id), calculated)
    const proposed = await client.get('/api/v1/funding-plans/proposed?date=2026-10-01').loginAs(f
      .user)
    proposed.assertStatus(200)
    assert.isNumber(proposed.body().data.find((r: { categoryId: number }) => r.categoryId === f
      .category.id).fundingCategories[0].amount)
  })
  test('PostgreSQL prior-month decimal extraction accepts numeric/string/mixed bases and nulls',
    async ({ client, assert }) => {
    const rows = (await db.rawQuery(`SELECT sum(coalesce(x."baseAmount",0))::text AS total
      FROM jsonb_to_recordset(?::jsonb) AS x("categoryId" int, amount decimal, "baseAmount" \
decimal)`,
    [JSON.stringify([{ categoryId: 1, amount: '1.00', baseAmount: '1.25' }, { categoryId: 1,
      amount: '1.00', baseAmount: 2.5 },
      { categoryId: 1, amount: '0.00', baseAmount: null }, { categoryId: 1, amount: '0.00' }])]))
        .rows
    assert.equal(Number(rows[0].total), 3.75)
    const own = await fixture(), foreign = await fixture()
    const create = async (f: typeof own, date: string, baseAmount: number, type = 2) => {
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json(
        categoryTransferRequest({ date, type,
        categories: [{ categoryId: f.category.id, amount: 1, baseAmount }, { categoryId: f.pool.id,
          amount: -1 }] }))
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
    await db.from('transactions').where('id', foreignId).update({ categories: JSON.stringify(
      foreignRow.categories) })
    for (const values of [[1.25, 2.5, null, undefined], ['1.25', '2.50', null, undefined], ['1.25',
      2.5, null, undefined]]) {
      for (const [index, id] of ids.entries()) {
        const stored = await db.from('transactions').where('id', id).firstOrFail()
        if (values[index] === undefined) delete stored.categories[0].baseAmount
        else stored.categories[0].baseAmount = values[index]
        await db.from('transactions').where('id', id).update({ categories: JSON.stringify(stored
          .categories) })
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
  test('foreign Budget rule references reject without configuration or financial changes', async ({
    client, assert }) => {
    const own = await fixture(), foreign = await fixture(), before = await balances()
    const response = await client.patch(`/api/v1/groups/${own.group.id}/categories/${own.category
      .id}`).loginAs(own.user)
      .json(categoryRequest({ name: 'Forbidden', fundingCategories: [{ categoryId: foreign.pool.id,
        amount: 100, percentage: true }] }))
    assert.isAtLeast(response.status(), 400); assert.isBelow(response.status(), 500)
    assert.deepEqual(await balances(), before)
  })
  test('late funding failure atomically restores metadata, allocations and balances', async ({
    client, assert }) => {
    const f = await fixture(), before = await balances(), transactions = await db.from(
      'transactions').orderBy('id')
    const original = Category.prototype.save
    const fault = mock.method(Category.prototype, 'save', async function (this: Category) {
      const saved = await original.call(this)
      if (this.id === f.pool.id) throw new Error('Injected funding storage acceptance rollback')
      return saved
    })
    try {
      const response = await client.post('/api/v1/category-transfer').loginAs(f.user).json(
        categoryTransferRequest({ date: '2026-10-01', type: 2,
        categories: [{ categoryId: f.category.id, amount: 1, baseAmount: 1.005 }, { categoryId: f
          .pool.id, amount: -1 }] }))
      response.assertStatus(500)
    } finally { fault.mock.restore() }
    assert.deepEqual(await balances(), before)
    assert.deepEqual(await db.from('transactions').orderBy('id'), transactions)
  })
})
