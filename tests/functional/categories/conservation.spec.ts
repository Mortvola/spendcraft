import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `transfer-conservation-${++sequence}`, email: `transfer-conservation-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Lifecycle bank' })
    const account = await institution.related('accounts').create({
      name: 'Lifecycle account', balance: 110, type: AccountType.Depository, subtype: 'checking',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: 'Lifecycle group', type: 'Regular' })
    const first = await group.related('categories').create({ name: 'First', type: CategoryType.Regular, balance: 10, fundingCategories: [] })
    const second = await group.related('categories').create({ name: 'Second', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [{ categoryId: first.id, amount: 10 }], taxes: [],
    })
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Original purchase', amount: 10, pending: false, provider: 'NONE', statementId: null,
    })
    return { budget, user, account, first, second, transaction, accountTransaction }
  })
}

test.group('Category transfer conservation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    return Promise.all([
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', fixture.budget.id).orderBy('categories.id'),
      db.from('accounts').where('id', fixture.account.id),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('statements').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
    ])
  }

  test('valid POST/PATCH preserve zero signed totals').with(['positive', 'negative', 'multi', 'zero', 'decimal', 'decimal-multi', 'funding']).run(async ({ client, assert }, scenario) => {
    const amount = scenario === 'negative' ? -10 : scenario === 'zero' ? 0 : scenario.startsWith('decimal') ? 0.3 : 10
    const splits = scenario === 'decimal-multi'
      ? [{ categoryId: fixture.first.id, amount: -0.1 }, { categoryId: fixture.first.id, amount: -0.2 }, { categoryId: fixture.second.id, amount: 0.3 }]
      : scenario === 'multi'
      ? [{ categoryId: fixture.first.id, amount: -4 }, { categoryId: fixture.first.id, amount: -6 }, { categoryId: fixture.second.id, amount: 10 }]
      : [{ categoryId: fixture.first.id, amount: amount === 0 ? 0 : -amount }, { categoryId: fixture.second.id, amount }]
    const categories = scenario === 'funding' ? splits.map((split) => split.amount < 0
      ? { ...split, funder: true }
      : { ...split, funder: false, baseAmount: split.amount, includeFundingTransfers: true,
        fundingCategories: [{ categoryId: fixture.first.id, amount: 100, percentage: true }] }) : splits
    const type = scenario === 'funding' ? TransactionType.FUNDING_TRANSACTION : TransactionType.REBALANCE_TRANSACTION
    const before = await state()
    const created = await client.post('/api/v1/category-transfer')
      .json({ date: '2025-03-01', type, categories }).accept('json').loginAs(fixture.user)
    created.assertStatus(200)
    const id = created.body().data.transaction.id
    assert.deepEqual((await Transaction.findOrFail(id)).categories, categories)
    assert.equal((await Category.findOrFail(fixture.first.id)).balance, 10 - amount)
    assert.equal((await Category.findOrFail(fixture.second.id)).balance, amount)
    const updated = await client.patch(`/api/v1/category-transfer/${id}`)
      .json({ date: '2025-03-02', type, categories }).accept('json').loginAs(fixture.user)
    updated.assertStatus(200)
    assert.equal((await Category.findOrFail(fixture.first.id)).balance, 10 - amount)
    assert.equal((await Category.findOrFail(fixture.second.id)).balance, amount)
    assert.equal((await Transaction.findOrFail(id)).date.toISODate(), '2025-03-02')
    const after = await state()
    assert.deepEqual(after.slice(2), before.slice(2))
  })

  test('nonzero totals reject POST/PATCH atomically').with([
    ['post', 'positive'], ['post', 'negative'], ['post', 'multi'], ['patch', 'one-side'], ['patch', 'both-sides'],
  ]).run(async ({ client, assert }, [method, scenario]) => {
    const existing = await fixture.budget.related('transactions').create({
      date: DateTime.fromISO('2025-03-01'), type: TransactionType.REBALANCE_TRANSACTION,
      categories: [{ categoryId: fixture.first.id, amount: -10 }, { categoryId: fixture.second.id, amount: 10 }],
    })
    await fixture.first.merge({ balance: 0 }).save()
    await fixture.second.merge({ balance: 10 }).save()
    const before = await state()
    const categories = scenario === 'multi'
      ? [{ categoryId: fixture.first.id, amount: -4 }, { categoryId: fixture.first.id, amount: -6 }, { categoryId: fixture.second.id, amount: 9 }]
      : scenario === 'negative' ? [{ categoryId: fixture.first.id, amount: 10 }, { categoryId: fixture.second.id, amount: -9 }]
        : scenario === 'both-sides' ? [{ categoryId: fixture.first.id, amount: -12 }, { categoryId: fixture.second.id, amount: 11 }]
          : [{ categoryId: fixture.first.id, amount: -10 }, { categoryId: fixture.second.id, amount: 9 }]
    const request = method === 'post' ? client.post('/api/v1/category-transfer') : client.patch(`/api/v1/category-transfer/${existing.id}`)
    const response = await request.json({ date: '2025-03-02', type: TransactionType.REBALANCE_TRANSACTION, categories }).accept('json').loginAs(fixture.user)
    assert.deepEqual(await state(), before)
    response.assertStatus(422)
  })

  test('PATCH requires a replacement split array rather than merging omitted rows', async ({ client, assert }) => {
    const before = await state()
    const response = await client.patch(`/api/v1/category-transfer/${fixture.transaction.id}`)
      .json({ date: '2025-03-02', type: TransactionType.REBALANCE_TRANSACTION }).accept('json').loginAs(fixture.user)
    response.assertStatus(422)
    assert.deepEqual(await state(), before)
  })

  test('late category-save failure rolls back POST/PATCH').with(['post', 'patch']).run(async ({ client, assert }, method) => {
    const existing = await fixture.budget.related('transactions').create({
      date: DateTime.fromISO('2025-03-01'), type: TransactionType.REBALANCE_TRANSACTION,
      categories: [{ categoryId: fixture.first.id, amount: -5 }, { categoryId: fixture.second.id, amount: 5 }],
    })
    await fixture.first.merge({ balance: 5 }).save()
    await fixture.second.merge({ balance: 5 }).save()
    const before = await state()
    await db.rawQuery('ALTER TABLE categories ADD CONSTRAINT transfer_test_failure CHECK (balance <> 20) NOT VALID')
    try {
      const amount = method === 'post' ? 15 : 20
      const request = method === 'post' ? client.post('/api/v1/category-transfer') : client.patch(`/api/v1/category-transfer/${existing.id}`)
      const response = await request.json({ date: '2025-03-02', type: TransactionType.REBALANCE_TRANSACTION,
        categories: [{ categoryId: fixture.first.id, amount: -amount }, { categoryId: fixture.second.id, amount }] }).accept('json').loginAs(fixture.user)
      response.assertStatus(500)
      assert.deepEqual(await state(), before)
    } finally {
      await db.rawQuery('ALTER TABLE categories DROP CONSTRAINT transfer_test_failure')
    }
  })
})
