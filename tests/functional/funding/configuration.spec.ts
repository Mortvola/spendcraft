import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import { CategoryType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `funding-config-${++sequence}`,
      email: `funding-config-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Configuration', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Destination', type: CategoryType.Bill,
      balance: 0, useGoal: false, fundingCategories: [] })
    const source = await group.related('categories').create({ name: 'Source', type: CategoryType.Regular,
      balance: 100, useGoal: false, fundingCategories: [] })
    const categories = [{ categoryId: category.id, amount: 10, fundingCategories: [{ categoryId: source.id, amount: 100, percentage: true }] }, { categoryId: source.id, amount: -10 }]
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-03-01'), type: TransactionType.FUNDING_TRANSACTION, categories,
    })
    return { budget, user, group, category, source, transaction }
  })
}

// Funding-specific failures must reject before any financial or configuration mutation.
const cases = [
  { name: 'full', percentages: [100] },
  { name: 'halves', percentages: [50, 50] },
  { name: 'thirds', percentages: [33.33, 33.33, 33.34] },
  { name: 'tenths', percentages: [33.3, 33.3, 33.4] },
  { name: 'zero plus full', percentages: [0, 100] },
  { name: 'hundredth', percentages: [0.01, 99.99] },
  { name: 'tenth', percentages: [0.1, 99.9] },
  { name: 'binary scaling control', percentages: [0.29, 99.71] },
  { name: 'negative but total 100', percentages: [-1, 101] },
  { name: 'negative single', percentages: [-100] },
  { name: 'negative fractional but total 100', percentages: [-0.01, 100.01] },
  { name: 'below hundred', percentages: [99.99] },
  { name: 'above hundred', percentages: [100.01] },
  { name: 'below pair', percentages: [50, 49] },
  { name: 'above pair', percentages: [50, 51] },
  { name: 'zero percentage total', percentages: [0] },
  { name: 'finer precision', percentages: [0.001, 99.999] },
  { name: 'nonnumeric', percentages: ['abc'] },
  { name: 'numeric strings', percentages: ['50', '50'] },
  { name: 'mixed', percentages: [50, 50], fixed: 10 },
  { name: 'fixed only', percentages: [], fixed: 7 },
  { name: 'empty', percentages: [] },
]

test.group('Funding configuration validation regression', (group) => {
  group.teardown(() => testUtils.db().truncate())
  for (const writer of ['category create', 'category update', 'funding create', 'funding update']) {
    test(`${writer}: supplied configurations enforce validation and persistence`, async ({ client, assert }) => {
      const f = await fixture()
      for (const [index, scenario] of cases.entries()) {
        const spread = scenario.percentages.map((amount) => ({ categoryId: f.source.id, amount, percentage: true }))
        const configuration = scenario.fixed === undefined ? spread
          : [{ categoryId: f.source.id, amount: scenario.fixed, percentage: false }, ...spread]
        const categoryPath = `/api/v1/groups/${f.group.id}/categories`
        const request = writer === 'category create' ? client.post(categoryPath)
          : writer === 'category update' ? client.patch(`${categoryPath}/${f.category.id}`)
          : writer === 'funding create' ? client.post('/api/v1/category-transfer')
          : client.patch(`/api/v1/category-transfer/${f.transaction.id}`)
        const body = writer.startsWith('category')
          ? { name: `Configuration ${index}`, type: CategoryType.Bill, useGoal: false, fundingCategories: configuration }
          : { date: '2025-03-01', type: TransactionType.FUNDING_TRANSACTION,
            categories: [{ categoryId: f.category.id, amount: 10, fundingCategories: configuration },
              { categoryId: f.source.id, amount: -10 }] }
        const before = await Promise.all([db.from('categories').where('group_id', f.group.id).orderBy('id'),
          db.from('transactions').where('application_id', f.budget.id).orderBy('id')])
        const response = await request.json(body).accept('json').loginAs(f.user)
        if (['negative but total 100', 'negative single', 'negative fractional but total 100',
          'below hundred', 'above hundred', 'below pair', 'above pair', 'zero percentage total',
          'finer precision', 'nonnumeric'].includes(scenario.name)) {
          response.assertStatus(422)
          const rule = scenario.name.startsWith('negative') ? 'fundingPercentageNonnegative'
            : scenario.name === 'finer precision' ? 'fundingPercentagePrecision'
            : scenario.name === 'nonnumeric' ? 'number' : 'fundingPercentageTotal'
          const field = writer.startsWith('category') ? 'fundingCategories' : 'categories.*.fundingCategories'
          assert.deepEqual(response.body().errors.map((error: { code: string, source: { pointer: string } }) => ({ rule: error.code, field: error.source.pointer })),
            [{ rule, field: scenario.name === 'nonnumeric' ? `${field}.*.amount` : field }])
          assert.deepEqual(await Promise.all([db.from('categories').where('group_id', f.group.id).orderBy('id'),
            db.from('transactions').where('application_id', f.budget.id).orderBy('id')]), before)
          continue
        }
        response.assertStatus(200)
        const expected = configuration.map((entry) => ({ ...entry, amount: Number(entry.amount) }))
        const stored = writer.startsWith('category')
          ? (await Category.findOrFail(writer === 'category create' ? response.body().data.id : f.category.id)).fundingCategories
          : (await db.from('transactions').where('id', writer === 'funding create' ? response.body().data.transaction.id : f.transaction.id).first()).categories[0].fundingCategories
        assert.deepEqual(stored, expected, `${writer}: ${scenario.name}`)
        const after = await db.from('categories').where('group_id', f.group.id).orderBy('id')
        if (writer === 'category create') {
          assert.deepEqual(after.filter((row) => row.id !== response.body().data.id), before[0])
        } else if (writer === 'category update') {
          assert.deepEqual(after.map((row) => row.id === f.category.id
            ? { ...row, name: before[0].find((original) => original.id === row.id).name,
              funding_categories: before[0].find((original) => original.id === row.id).funding_categories,
              updated_at: before[0].find((original) => original.id === row.id).updated_at }
            : row), before[0])
        } else {
          for (const row of after) {
            const original = before[0].find((entry) => entry.id === row.id)
            const delta = writer === 'funding create' ? (row.id === f.category.id ? 10 : -10) : 0
            assert.equal(Number(row.balance), Number(original.balance) + delta)
            assert.deepEqual({ ...row, balance: original.balance, updated_at: original.updated_at }, original)
          }
        }

      }
    })
  }

  test('Category POST requires configuration even when empty is allowed', async ({ client, assert }) => {
    const f = await fixture()
    const before = await db.from('categories').where('group_id', f.group.id).orderBy('id')
    for (const extra of [{}, { fundingCategories: null }]) {
      const response = await client.post(`/api/v1/groups/${f.group.id}/categories`)
        .json({ name: 'Missing configuration', useGoal: false, ...extra }).accept('json').loginAs(f.user)
      response.assertStatus(422)
      assert.deepEqual(await db.from('categories').where('group_id', f.group.id).orderBy('id'), before)
    }
  })

  test('Category PATCH omission and null preserve legacy configuration; explicit arrays replace it', async ({ client, assert }) => {
    const f = await fixture()
    const legacy = [{ categoryId: f.source.id, amount: -1, percentage: true }, { categoryId: f.source.id, amount: 101, percentage: true }]
    await f.category.merge({ fundingCategories: legacy }).save()
    const path = `/api/v1/groups/${f.group.id}/categories/${f.category.id}`
    for (const extra of [{}, { fundingCategories: null }]) {
      const before = await db.from('categories').where('id', f.category.id).first()
      const response = await client.patch(path).json({ name: 'Unrelated update', hidden: true, ...extra }).accept('json').loginAs(f.user)
      response.assertStatus(200)
      assert.deepEqual((await Category.findOrFail(f.category.id)).fundingCategories, legacy)
      const after = await db.from('categories').where('id', f.category.id).first()
      assert.equal(after.name, 'Unrelated update')
      assert.isTrue(after.hidden)
      assert.deepEqual({ ...after, name: before.name, hidden: before.hidden, updated_at: before.updated_at }, before)
    }
    const before = await db.from('categories').where('id', f.category.id).first()
    const rejected = await client.patch(path).json({ name: 'Must not change', fundingCategories: legacy }).accept('json').loginAs(f.user)
    rejected.assertStatus(422)
    assert.deepEqual(await db.from('categories').where('id', f.category.id).first(), before)
    const valid = [{ categoryId: f.source.id, amount: 100, percentage: true }]
    const response = await client.patch(path).json({ name: 'Replaced', fundingCategories: valid }).accept('json').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual((await Category.findOrFail(f.category.id)).fundingCategories, valid)
  })

  test('transfer PATCH requires split replacement; omitted or null embedded configuration is removed', async ({ client, assert }) => {
    const f = await fixture()
    const path = `/api/v1/category-transfer/${f.transaction.id}`
    const body = { date: '2025-03-02', type: TransactionType.FUNDING_TRANSACTION }
    const before = await db.from('transactions').where('id', f.transaction.id).first()
    const balances = await db.from('categories').where('group_id', f.group.id).orderBy('id')
    const missing = await client.patch(path).json(body).accept('json').loginAs(f.user)
    missing.assertStatus(422)
    assert.deepEqual(await db.from('transactions').where('id', f.transaction.id).first(), before)
    assert.deepEqual(await db.from('categories').where('group_id', f.group.id).orderBy('id'), balances)
    for (const extra of [{}, { fundingCategories: null }]) {
      await db.from('transactions').where('id', f.transaction.id).update({ categories: JSON.stringify(before.categories) })
      const response = await client.patch(path).json({ ...body, categories: [
        { categoryId: f.category.id, amount: 10, ...extra }, { categoryId: f.source.id, amount: -10 },
      ] }).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const stored = await db.from('transactions').where('id', f.transaction.id).first()
      assert.deepEqual(stored.categories, [{ categoryId: f.category.id, amount: 10 }, { categoryId: f.source.id, amount: -10 }])
    }
  })
})
