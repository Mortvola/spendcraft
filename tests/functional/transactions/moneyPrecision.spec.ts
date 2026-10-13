import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Category from '#models/Category'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Account from '#models/Account'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `precision-${++sequence}`,
      email: `precision-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Precision bank' })
    const account = await institution.related('accounts').create({ name: 'Checking', balance: 0,
      type: AccountType.Depository, subtype: 'checking', rate: 0, closed: false,
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01') })
    const group = await budget.related('groups').create({ name: 'Precision categories', type: 'Regular' })
    const categories = []
    for (const name of ['Fixed', 'First percentage', 'Last percentage']) {
      categories.push(await group.related('categories').create({ name, type: CategoryType.Regular,
        balance: 0, fundingAmount: 0, useGoal: false, recurrence: 1, fundingCategories: [] }))
    }
    return { budget, user, account, categories }
  })
}

function provider(amount: number): Plaid.Transaction {
  return { account_id: 'precision-account', transaction_id: `precision-${sequence}`, amount: -amount,
    date: '2025-02-10', name: 'Precision match', merchant_name: null, iso_currency_code: 'USD',
    unofficial_currency_code: null, pending: false, pending_transaction_id: null, account_owner: null,
    authorized_date: null, authorized_datetime: null, datetime: null,
    payment_channel: Plaid.TransactionPaymentChannelEnum.Online, transaction_code: null,
    location: { address: null, city: null, region: null, postal_code: null, country: null, lat: null, lon: null, store_number: null },
    payment_meta: { reference_number: null, ppd_id: null, payee: null, by_order_of: null, payer: null, payment_method: null, payment_processor: null, reason: null } }
}

test.group('Monetary precision characterization', () => {
  // Regression expectations preserve existing sign, rounding, ordering and residual semantics.
  test('mixed-unit correction preserves individual allocations, conservation and balance effects')
    .with([
      { amount: 100, fixed: [10], percentages: [50, 50], expected: [10, 45, 45] },
      { amount: -100, fixed: [-10], percentages: [50, 50], expected: [-10, -45, -45] },
      { amount: -100, fixed: [10], percentages: [50, 50], expected: [10, -55, -55] },
      { amount: 100, fixed: [10, 10], percentages: [], expected: [10, 90] },
      { amount: 0.01, fixed: [], percentages: [50, 50], expected: [0.01, 0] },
      { amount: 0.03, fixed: [], percentages: [50, 50], expected: [0.02, 0.01] },
      { amount: -0.03, fixed: [], percentages: [50, 50], expected: [-0.01, -0.02] },
      { amount: 100, fixed: [10, 10], percentages: [100], expected: [10, 10, 80] },
      { amount: 100, fixed: [100], percentages: [50, 50], expected: [100, 0, 0] },
      { amount: 100, fixed: [110], percentages: [50, 50], expected: [110, -5, -5] },
      { amount: 100, fixed: [10], percentages: [20, 20], expected: [10, 18, 72] },
      { amount: 100, fixed: [10], percentages: [80, 80], expected: [10, 72, 18] },
    ])
    .run(async ({ assert }, scenario) => {
      const f = await fixture()
      let transactionId = 0
      await db.transaction(async (trx) => {
        f.budget.useTransaction(trx)
        f.account.useTransaction(trx)
        const rule = await f.budget.related('autoAssignment').create({ name: 'Mixed-unit regression', searchStrings: ['Precision match'] })
        // Equal values in each ordering group avoid assuming an unspecified tie order.
        for (const [index, amount] of scenario.fixed.entries()) {
          await rule.related('categories').create({ categoryId: f.categories[index].id, amount, percentage: false })
        }
        for (const [index, amount] of scenario.percentages.entries()) {
          await rule.related('categories').create({ categoryId: f.categories[scenario.fixed.length + index].id, amount, percentage: true })
        }
        await f.account.addOrUpdateTransaction(provider(scenario.amount), f.budget)
        transactionId = (await f.account.related('accountTransactions').query().firstOrFail()).transactionId
      })
      const transaction = await Transaction.findOrFail(transactionId)
      assert.deepEqual(transaction.categories.map((split) => split.amount), scenario.expected)
      assert.equal(transaction.categories.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), Math.round(scenario.amount * 100))
      for (const split of transaction.categories) {
        assert.equal((await Category.findOrFail(split.categoryId)).balance, split.amount)
      }
    })

  test('repeated sub-cent writes record JSON totals against persisted balances', async ({ client }) => {
    const f = await fixture()
    for (let i = 0; i < 3; i++) {
      const response = await client.post(`/api/v1/account/${f.account.id}/transactions`)
        .json({ date: '2025-02-10', name: `Repeated sub-cent ${i}`, amount: 0.004,
          categories: [{ categoryId: f.categories[0].id, amount: 0.004 }] }).accept('json').loginAs(f.user)
      response.assertStatus(200)
    }
    const transactions = await f.budget.related('transactions').query()
    const rawSplitTotal = transactions.reduce((sum, transaction) => sum + transaction.categories.reduce((subtotal, split) => subtotal + split.amount, 0), 0)
    const associationTotal = (await f.account.related('accountTransactions').query()).reduce((sum, row) => sum + row.amount, 0)
    console.log(JSON.stringify({ scenario: 'repeated sub-cent', rawSplitTotal, roundedSplitTotal: Math.round(rawSplitTotal * 100) / 100,
      associationTotal, accountBalance: (await Account.findOrFail(f.account.id)).balance,
      categoryBalance: (await Category.findOrFail(f.categories[0].id)).balance }))
  })

  test('fractional-cent HTTP inputs record decimal-column versus JSON allocation behavior')
    .with([0.01, 0.005, -0.005, 0.004, 0.1 + 0.2])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const response = await client.post(`/api/v1/account/${f.account.id}/transactions`)
        .json({ date: '2025-02-10', name: 'Fractional cent', amount,
          categories: [{ categoryId: f.categories[0].id, amount }] }).accept('json').loginAs(f.user)
      const association = await f.account.related('accountTransactions').query().first()
      const transaction = association ? await Transaction.findOrFail(association.transactionId) : null
      const category = await Category.findOrFail(f.categories[0].id)
      const account = await Account.findOrFail(f.account.id)
      const database = association ? await db.from('account_transactions').where('id', association.id).select('amount').first() : null
      assert.isAtLeast(response.status(), 200)
      console.log(JSON.stringify({ scenario: 'fractional cent', input: amount, status: response.status(),
        persistedAmount: association?.amount, persistedSplits: transaction?.categories,
        categoryBalance: category.balance, accountBalance: account.balance,
        rawDecimalAmount: database?.amount, body: response.body() }))
    })

  test('fixed-plus-percentage and percentage-only allocation record conservation and individual shares')
    .with([{ amount: 100, fixed: 10 }, { amount: -100, fixed: -10 }, { amount: 0.01, fixed: 0 }])
    .run(async ({ assert }, scenario) => {
      const f = await fixture()
      let transactionId = 0
      await db.transaction(async (trx) => {
        f.budget.useTransaction(trx)
        f.account.useTransaction(trx)
        const rule = await f.budget.related('autoAssignment').create({ name: 'Precision rule', searchStrings: ['Precision match'] })
        if (scenario.fixed !== 0) await rule.related('categories').create({ categoryId: f.categories[0].id, amount: scenario.fixed, percentage: false })
        for (const category of f.categories.slice(1)) await rule.related('categories').create({ categoryId: category.id, amount: 50, percentage: true })
        await f.account.addOrUpdateTransaction(provider(scenario.amount), f.budget)
        transactionId = (await f.account.related('accountTransactions').query().firstOrFail()).transactionId
      })
      const transaction = await Transaction.findOrFail(transactionId)
      const association = await AccountTransaction.findByOrFail('transactionId', transactionId)
      const balances = await Promise.all(f.categories.map(async (category) => (await Category.findOrFail(category.id)).balance))
      const cents = transaction.categories.reduce((total, split) => total + Math.round(split.amount * 100), 0)
      assert.equal(cents, Math.round(association.amount * 100))
      console.log(JSON.stringify({ scenario: 'allocation', input: scenario, persistedAmount: association.amount,
        splits: transaction.categories, balances, conservedCents: cents }))
    })

  test('large fixed auto-assignment configuration records real-column precision')
    .with([65536.01, 131072.01, 1000000.01])
    .run(async ({ assert }, amount) => {
    const f = await fixture()
    const rule = await f.budget.related('autoAssignment').create({ name: 'Large fixed rule', searchStrings: ['Large fixed'] })
    const entry = await rule.related('categories').create({ categoryId: f.categories[0].id,
      amount, percentage: false })
    await rule.related('categories').create({ categoryId: f.categories[1].id, amount: 0.01, percentage: false })
    const persisted = await rule.related('categories').query().where('id', entry.id).firstOrFail()
    const storage = await db.from('auto_assignment_categories').where('id', entry.id)
      .select(db.raw('amount::double precision as binary_value')).first()
    let transactionId = 0
    await db.transaction(async (trx) => {
      f.budget.useTransaction(trx)
      f.account.useTransaction(trx)
      await f.account.addOrUpdateTransaction({ ...provider(amount + 0.01), name: 'Large fixed' }, f.budget)
      transactionId = (await f.account.related('accountTransactions').query().firstOrFail()).transactionId
    })
    const transaction = await Transaction.findOrFail(transactionId)
    assert.isNumber(persisted.amount)
    console.log(JSON.stringify({ scenario: 'real-column precision', configuredAmount: amount,
      storedBinaryValue: storage.binary_value, persistedAmount: persisted.amount, splits: transaction.categories }))
  })
})
