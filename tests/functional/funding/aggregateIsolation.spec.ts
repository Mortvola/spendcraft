import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `aggregate-${label}-${++sequence}`,
      email: `aggregate-${sequence}@example.com`, password: 'testPassw0rd' })
    const shared = await budget.related('users').create({ username: `aggregate-shared-${++sequence}`,
      email: `aggregate-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({ name: `${label} account`, balance: 100,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), closed: false })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const first = await group.related('categories').create({ name: `${label} first`, type: CategoryType.Regular,
      balance: 200, fundingAmount: 300, useGoal: true, goalDate: DateTime.fromISO('2025-03-01'),
      recurrence: 1, suspended: false, fundingCategories: [] })
    const second = await group.related('categories').create({ name: `${label} second`, type: CategoryType.Regular,
      balance: 50, fundingAmount: 120, useGoal: true, goalDate: DateTime.fromISO('2025-03-01'),
      recurrence: 1, suspended: false, fundingCategories: [] })
    const transactions = []
    for (const entry of [
      { date: '2025-03-10', amounts: [10, -5], deleted: false },
      { date: '2025-03-20', amounts: [-3, 2], deleted: false },
      { date: '2025-02-10', amounts: [4, 1], deleted: false },
      { date: '2025-03-30', amounts: [80, 90], deleted: true },
    ]) {
      const transaction = await budget.related('transactions').create({ date: DateTime.fromISO(entry.date),
        type: TransactionType.MANUAL_TRANSACTION, deleted: entry.deleted, taxes: [],
        categories: [{ categoryId: first.id, amount: entry.amounts[0] }, { categoryId: second.id, amount: entry.amounts[1] }] })
      await account.related('accountTransactions').create({ transactionId: transaction.id,
        name: 'Legitimate purchase', amount: entry.amounts[0] + entry.amounts[1], pending: false, provider: 'NONE' })
      transactions.push(transaction)
    }
    return { budget, user, shared, account, first, second, transactions }
  })
}

test.group('Historical aggregate isolation', (group) => {
  let a: Awaited<ReturnType<typeof createDomain>>
  let b: Awaited<ReturnType<typeof createDomain>>
  group.each.setup(async () => {
    a = await createDomain('A')
    b = await createDomain('B')
  })

  async function state() {
    return Promise.all([
      db.from('transactions').whereIn('application_id', [a.budget.id, b.budget.id]).orderBy('id'),
      db.from('accounts').whereIn('id', [a.account.id, b.account.id]).orderBy('id'),
      db.from('account_transactions').whereIn('account_id', [a.account.id, b.account.id]).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', [a.budget.id, b.budget.id]).orderBy('categories.id'),
      db.from('transaction_logs').whereIn('application_id', [a.budget.id, b.budget.id]).orderBy('id'),
    ])
  }

  async function insertHistoricalTransaction(owner: typeof a, target: typeof a) {
    const transaction = await owner.budget.related('transactions').create({ date: DateTime.fromISO('2025-03-15'),
      type: TransactionType.MANUAL_TRANSACTION, deleted: false, taxes: [],
      categories: [{ categoryId: target.first.id, amount: 37 }, { categoryId: target.second.id, amount: 11 }] })
    await owner.account.related('accountTransactions').create({ transactionId: transaction.id,
      name: 'Historical inconsistent transaction', amount: 48, pending: false, provider: 'NONE' })
    return transaction
  }

  const path = (aggregate: string) => aggregate === 'balances' ? '/api/v1/category-balances' : '/api/v1/funding-plans/proposed'
  for (const aggregate of ['balances', 'proposed']) {
    test(`${aggregate}: foreign historical splits cannot influence owner/shared results in either direction`)
      .with(['A', 'B'].flatMap((target) => ['owner', 'shared'].map((actor) => ({ target, actor }))))
      .run(async ({ client, assert }, scenario) => {
        const own = scenario.target === 'A' ? a : b
        const foreign = scenario.target === 'A' ? b : a
        const user = scenario.actor === 'owner' ? own.user : own.shared
        const baseline = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json').loginAs(user)
        baseline.assertStatus(200)
        const rows: { id?: number, categoryId?: number, balance?: number, amount?: number }[] = aggregate === 'balances' ? baseline.body() : baseline.body().data
        const first = rows.find((row) => (row.id ?? row.categoryId) === own.first.id)
        const second = rows.find((row) => (row.id ?? row.categoryId) === own.second.id)
        assert.equal(aggregate === 'balances' ? first?.balance : first?.amount, aggregate === 'balances' ? 193 : 107)
        assert.equal(aggregate === 'balances' ? second?.balance : second?.amount, aggregate === 'balances' ? 53 : 67)
        assert.isFalse(rows.some((row) => (row.id ?? row.categoryId) === foreign.first.id))
        const historical = await insertHistoricalTransaction(foreign, own)
        assert.equal((await Transaction.findOrFail(historical.id)).budgetId, foreign.budget.id)
        const before = await state()
        const response = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json').loginAs(user)
        response.assertStatus(200)
        assert.deepEqual(await state(), before)
        assert.deepEqual(response.body(), baseline.body())
      })

    test(`${aggregate}: ordinary unrelated foreign transactions do not influence the result`, async ({ client, assert }) => {
      const baseline = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json').loginAs(a.user)
      baseline.assertStatus(200)
      await insertHistoricalTransaction(b, b)
      const before = await state()
      const response = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json').loginAs(a.shared)
      response.assertStatus(200)
      assert.deepEqual(response.body(), baseline.body())
      assert.deepEqual(await state(), before)
    })
  }

  test('balance helper constrains the exclusion OR branch to its own budget', async ({ client, assert }) => {
    const baseline = await client.get(path('balances')).qs({ date: '2025-03-01' }).accept('json').loginAs(a.user)
    baseline.assertStatus(200)
    const historical = await insertHistoricalTransaction(b, a)
    await historical.merge({ date: DateTime.fromISO('2025-02-10'), deleted: true }).save()
    const before = await state()
    // The HTTP controller already rejects foreign exclusion IDs. The helper must
    // also enforce ownership when the exclusion is its only matching condition.
    const balances = await Category.balances(a.budget, '2025-03-01', historical.id)
    assert.deepEqual(balances, baseline.body())
    assert.deepEqual(await state(), before)
  })

  test('balance exclusion preserves past/future/deleted own transactions without admitting foreign splits')
    .with([{ index: 2, balances: [189, 52] }, { index: 0, balances: [193, 53] }, { index: 3, balances: [113, -37] }])
    .run(async ({ client, assert }, scenario) => {
      const transaction = a.transactions[scenario.index]
      const query = { date: '2025-03-01', id: transaction.id }
      const baseline = await client.get(path('balances')).qs(query).accept('json').loginAs(a.user)
      baseline.assertStatus(200)
      const rows: { id: number, balance: number }[] = baseline.body()
      assert.equal(rows.find((row) => row.id === a.first.id)?.balance, scenario.balances[0])
      assert.equal(rows.find((row) => row.id === a.second.id)?.balance, scenario.balances[1])
      await insertHistoricalTransaction(b, a)
      const before = await state()
      const response = await client.get(path('balances')).qs(query).accept('json').loginAs(a.shared)
      response.assertStatus(200)
      assert.deepEqual(await state(), before)
      assert.deepEqual(response.body(), baseline.body())
    })
})
