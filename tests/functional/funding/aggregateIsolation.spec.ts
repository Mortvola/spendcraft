import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
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
    const user = await budget.related('users').create({
      username: `aggregate-${label}-${++sequence}`,
      email: `aggregate-${sequence}@example.com`, password: 'testPassw0rd' })
    const shared = await budget.related('users').create({
      username: `aggregate-shared-${++sequence}`,
      email: `aggregate-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({ name: `${label} account`,
      balanceCents: parseMoneyCents('100.00'),
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), closed: false })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const first = await group.related('categories').create({ name: `${label} first`,
      type: CategoryType.Regular,
      balanceCents: parseMoneyCents('200.00'), fundingAmount: 300, useGoal: true,
        goalDate: DateTime.fromISO('2025-03-01'),
      recurrence: 1, suspended: false, fundingCategories: [] })
    const second = await group.related('categories').create({ name: `${label} second`,
      type: CategoryType.Regular,
      balanceCents: parseMoneyCents('50.00'), fundingAmount: 120, useGoal: true,
        goalDate: DateTime.fromISO('2025-03-01'),
      recurrence: 1, suspended: false, fundingCategories: [] })
    const transactions = []
    for (const entry of [
      { date: '2025-03-10', amounts: [10, -5], deleted: false },
      { date: '2025-03-20', amounts: [-3, 2], deleted: false },
      { date: '2025-02-10', amounts: [4, 1], deleted: false },
      { date: '2025-03-30', amounts: [80, 90], deleted: true },
    ]) {
      const transaction = await budget.related('transactions').create({ date: DateTime.fromISO(entry
        .date),
        type: TransactionType.MANUAL_TRANSACTION, deleted: entry.deleted, taxes: [],
        categories: [{ categoryId: first.id, amount: entry.amounts[0] }, { categoryId: second.id,
          amount: entry.amounts[1] }] })
      await trx.from('transactions').where('id', transaction.id).update({ categories: JSON
        .stringify([
        { categoryId: first.id, amount: entry.amounts[0].toFixed(2) },
        { categoryId: second.id, amount: entry.amounts[1].toFixed(2) },
      ]) })
      await account.related('accountTransactions').create({ transactionId: transaction.id,
        name: 'Legitimate purchase', amountCents: parseMoneyCents(encodeMonetaryAmount(
          entry.amounts[0] + entry.amounts[1])), pending: false,
          provider: 'NONE' })
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
      db.from('account_transactions').whereIn('account_id', [a.account.id, b.account.id]).orderBy(
        'id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id',
        'categories.group_id')
        .whereIn('groups.application_id', [a.budget.id, b.budget.id]).orderBy('categories.id'),
      db.from('transaction_logs').whereIn('application_id', [a.budget.id, b.budget.id]).orderBy(
        'id'),
    ])
  }

  async function insertHistoricalTransaction(owner: typeof a, target: typeof a) {
    const transaction = await owner.budget.related('transactions').create({ date: DateTime.fromISO(
      '2025-03-15'),
      type: TransactionType.MANUAL_TRANSACTION, deleted: false, taxes: [],
      categories: [{ categoryId: target.first.id, amount: 37 }, { categoryId: target.second.id,
        amount: 11 }] })
    // Deliberately cross-owned splits remain valid canonical storage.
    await db.from('transactions').where('id', transaction.id).update({ categories: JSON.stringify([
      { categoryId: target.first.id, amount: '37.00' }, { categoryId: target.second.id, amount:
        '11.00' },
    ]) })
    await owner.account.related('accountTransactions').create({ transactionId: transaction.id,
      name: 'Historical inconsistent transaction', amountCents: parseMoneyCents('48.00'),
         pending: false, provider: 'NONE' })
    return transaction
  }

  const path = (aggregate: string) => aggregate === 'balances' ? '/api/v1/category-balances' :
    '/api/v1/funding-plans/proposed'
  for (const aggregate of ['balances', 'proposed']) {
    test(
      `${aggregate}: foreign historical splits cannot influence owner/shared results in either \
direction`)
      .with(['A', 'B'].flatMap((target) => ['owner', 'shared'].map((actor) => ({ target, actor }))))
      .run(async ({ client, assert }, scenario) => {
        const own = scenario.target === 'A' ? a : b
        const foreign = scenario.target === 'A' ? b : a
        const user = scenario.actor === 'owner' ? own.user : own.shared
        const baseline = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json')
          .loginAs(user)
        baseline.assertStatus(200)
        const rows: { id?: number, categoryId?: number, balance?: string, amount?: string }[] =
          aggregate === 'balances' ? baseline.body() : baseline.body().data
        const first = rows.find((row) => (row.id ?? row.categoryId) === own.first.id)
        const second = rows.find((row) => (row.id ?? row.categoryId) === own.second.id)
        assert.equal(aggregate === 'balances' ? first?.balance : first?.amount, aggregate ===
          'balances' ? '193.00' : '107.00')
        assert.equal(aggregate === 'balances' ? second?.balance : second?.amount, aggregate ===
          'balances' ? '53.00' : '67.00')
        assert.isFalse(rows.some((row) => (row.id ?? row.categoryId) === foreign.first.id))
        const historical = await insertHistoricalTransaction(foreign, own)
        assert.equal((await Transaction.findOrFail(historical.id)).budgetId, foreign.budget.id)
        const before = await state()
        const response = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json')
          .loginAs(user)
        response.assertStatus(200)
        assert.deepEqual(await state(), before)
        assert.deepEqual(response.body(), baseline.body())
      })

    test(`${aggregate}: ordinary unrelated foreign transactions do not influence the result`,
      async ({ client, assert }) => {
      const baseline = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json')
        .loginAs(a.user)
      baseline.assertStatus(200)
      await insertHistoricalTransaction(b, b)
      const before = await state()
      const response = await client.get(path(aggregate)).qs({ date: '2025-03-01' }).accept('json')
        .loginAs(a.shared)
      response.assertStatus(200)
      assert.deepEqual(response.body(), baseline.body())
      assert.deepEqual(await state(), before)
    })
  }

  test('fractional historical balances remain exact through helper and API')
    .with([1, -1]).run(async ({ client, assert }, sign) => {
      await a.first.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        sign * 0.3)) }).save()
      await a.second.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        -sign * 0.1)) }).save()
      for (const [index, amount] of [[0, sign * 0.1], [1, sign * 0.1]] as const) {
        await db.from('transactions').where('id', a.transactions[index].id).update({
          categories: JSON.stringify([{ categoryId: a.first.id,
            amount: encodeMonetaryAmount(amount) }]),
        })
      }
      const before = await state()
      const rows = await Category.balances(a.budget, '2025-03-01', a.transactions[2].id)
      // Excluding the past transaction also reverses its existing four-dollar split.
      assert.strictEqual(rows.find(row => row.id === a.first.id)?.balanceCents,
        parseMoneyCents(sign > 0 ? '-3.90' : '-4.10'))
      const response = await client.get(path('balances')).qs({ date: '2025-03-01' })
        .loginAs(a.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().find((row: { id: number }) => row.id === a.first.id),
        { id: a.first.id, balance: sign > 0 ? '0.10' : '-0.10' })
      assert.deepEqual(response.body().find((row: { id: number }) => row.id === a.second.id),
        { id: a.second.id, balance: sign > 0 ? '-0.10' : '0.10' })
      assert.deepEqual(await state(), before)
    })

  test('monthly summary preserves exact signed totals and previous-month boundaries')
    .with([1, -1]).run(async ({ client, assert }, sign) => {
      await a.first.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        sign * 0.3)) }).save()
      for (const [index, amount] of [[0, 0.1], [1, 0.1], [2, 0.2], [3, 0.3]] as const) {
        await db.from('transactions').where('id', a.transactions[index].id).update({
          categories: JSON.stringify([{ categoryId: a.first.id,
            amount: encodeMonetaryAmount(sign * amount),
            ...(index === 3 ? { baseAmount: encodeMonetaryAmount(sign * 0.2) } : {}) }]),
          ...(index === 3 ? { date: '2025-02-28', deleted: false,
            type: TransactionType.FUNDING_TRANSACTION } : {}),
        })
      }
      await a.budget.related('transactions').create({ date: DateTime.fromISO('2025-02-01'),
        type: TransactionType.REBALANCE_TRANSACTION, categories: [
          { categoryId: a.first.id, amount: sign * 0.1 },
          { categoryId: a.second.id, amount: -sign * 0.1 }], taxes: [], deleted: false })
      const before = await state()
      const response = await client.get('/api/v1/categories').qs({ date: '2025-03-15' })
        .loginAs(a.user)
      response.assertStatus(200)
      const prefix = sign < 0 ? '-' : ''
      assert.deepEqual(response.body().data.find((row: { id: number }) => row.id === a.first.id),
        { id: a.first.id, name: a.first.name, balance: `${prefix}0.10`,
          previousSum: `${prefix}0.20`, previousFunding: `${prefix}0.30`,
          previousBaseAmount: `${prefix}0.20`, previousCatTransfers: `${prefix}0.10` })
      assert.isFalse(response.body().data.some((row: { id: number }) => row.id === b.first.id))
      assert.deepEqual(await state(), before)
    })

  test('Bill debit totals retain exact strings, nulls and current-month Budget filtering',
    async ({ client, assert }) => {
      await a.first.merge({ type: CategoryType.Bill }).save()
      await a.second.merge({ type: CategoryType.Bill }).save()
      await b.first.merge({ type: CategoryType.Bill }).save()
      const current = DateTime.now().startOf('month')
      const add = async (owner: typeof a, amount: string, date = current, deleted = false) => {
        const transaction = await owner.budget.related('transactions').create({ date,
          type: TransactionType.REBALANCE_TRANSACTION, categories: [], taxes: [], deleted })
        await db.from('transactions').where('id', transaction.id).update({ categories:
          JSON.stringify([{ categoryId: a.first.id, amount }]) })
      }
      await add(a, '-0.10')
      await add(a, '-0.20')
      await add(a, '0.99')
      await add(a, '-0.40', current, true)
      await add(a, '-0.50', current.minus({ days: 1 }))
      await add(b, '-0.99')
      const before = await state()
      const response = await client.get('/api/v1/bills').loginAs(a.shared)
      response.assertStatus(200)
      assert.sameDeepMembers(response.body(), [{ id: a.first.id, debits: '-0.30' },
        { id: a.second.id, debits: null }])
      assert.deepEqual(await state(), before)
    })

  test('balance helper constrains the exclusion OR branch to its own budget', async ({ client,
    assert }) => {
    const baseline = await client.get(path('balances')).qs({ date: '2025-03-01' }).accept('json')
      .loginAs(a.user)
    baseline.assertStatus(200)
    const historical = await insertHistoricalTransaction(b, a)
    await historical.merge({ date: DateTime.fromISO('2025-02-10'), deleted: true }).save()
    const before = await state()
    // The HTTP controller already rejects foreign exclusion IDs. The helper must
    // also enforce ownership when the exclusion is its only matching condition.
    const balances = await Category.balances(a.budget, '2025-03-01', historical.id)
    assert.deepEqual(balances.map((row) => ({ id: row.id,
      balance: formatMoneyCents(row.balanceCents) })), baseline.body())
    assert.deepEqual(await state(), before)
  })

  test(
    'balance exclusion preserves past/future/deleted own transactions without admitting foreign \
splits')
    .with([{ index: 2, balances: [189, 52] }, { index: 0, balances: [193, 53] }, { index: 3,
      balances: [113, -37] }])
    .run(async ({ client, assert }, scenario) => {
      const transaction = a.transactions[scenario.index]
      const query = { date: '2025-03-01', id: transaction.id }
      const baseline = await client.get(path('balances')).qs(query).accept('json').loginAs(a.user)
      baseline.assertStatus(200)
      const rows: { id: number, balance: string }[] = baseline.body()
      assert.equal(rows.find((row) => row.id === a.first.id)?.balance, encodeMonetaryAmount(scenario
        .balances[0]))
      assert.equal(rows.find((row) => row.id === a.second.id)?.balance, encodeMonetaryAmount(
        scenario.balances[1]))
      await insertHistoricalTransaction(b, a)
      const before = await state()
      const response = await client.get(path('balances')).qs(query).accept('json').loginAs(a.shared)
      response.assertStatus(200)
      assert.deepEqual(await state(), before)
      assert.deepEqual(response.body(), baseline.body())
    })
})
