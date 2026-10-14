import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Category from '#models/Category'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Account from '#models/Account'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

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
    .with([0, 0.01, -0.01, 0.004, 0.005, 0.006, -0.004, -0.005, -0.006, 1.234, -1.234, '0.005', '-0.005', '1.23', '0.01', '1.234', 0.1 + 0.2])
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
      response.assertStatus(200)
      assert.equal(transaction?.categories[0].amount, Number(amount))
      console.log(JSON.stringify({ scenario: 'fractional cent', input: amount, status: response.status(),
        persistedAmount: association?.amount, persistedSplits: transaction?.categories,
        categoryBalance: category.balance, accountBalance: account.balance,
        rawDecimalAmount: database?.amount, body: response.body() }))
    })

  test('numeric scale-two cast records signed rounding without creating schema objects', async ({ assert }) => {
    const values = ['0.004', '0.005', '0.006', '-0.004', '-0.005', '-0.006',
      '1.004', '1.005', '1.006', '-1.004', '-1.005', '-1.006']
    const expected = ['0.00', '0.01', '0.01', '0.00', '-0.01', '-0.01',
      '1.00', '1.01', '1.01', '-1.00', '-1.01', '-1.01']
    for (const [index, value] of values.entries()) {
      const result = await db.rawQuery('SELECT CAST(? AS numeric(12,2))::text AS amount', [value])
      assert.equal(result.rows[0].amount, expected[index])
      console.log(JSON.stringify({ scenario: 'numeric scale-two rounding', input: value, storedScaleValue: result.rows[0].amount }))
    }
  })

  test('transaction PATCH and transfer POST/PATCH record JSON, balance and response precision')
    .with([0, 0.01, -0.01, 0.004, 0.005, 0.006, -0.004, -0.005, -0.006, 1.234, -1.234, '0.005', '-0.005', '0.01', '1.234', 0.1 + 0.2])
    .run(async ({ client, assert }, input) => {
      const amount = Number(input)
      const f = await fixture()
      const transaction = await f.budget.related('transactions').create({
        date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION,
        version: 0, categories: [{ categoryId: f.categories[0].id, amount: 0 }], taxes: [],
      })
      const association = await f.account.related('accountTransactions').create({
        transactionId: transaction.id, name: 'Precision update', amount: 0, pending: false, provider: 'NONE',
      })
      const response = await client.patch(`/api/v1/transaction/${transaction.id}`)
        .json({ version: 0, amount: input, categories: [{ categoryId: f.categories[0].id, amount: input }] })
        .accept('json').loginAs(f.user)
      response.assertStatus(200)
      assert.equal((await Transaction.findOrFail(transaction.id)).categories[0].amount, amount)
      console.log(JSON.stringify({ scenario: 'fractional PATCH', input, amount: (await AccountTransaction.findOrFail(association.id)).amount,
        splits: (await Transaction.findOrFail(transaction.id)).categories,
        categoryBalance: (await Category.findOrFail(f.categories[0].id)).balance,
        accountBalance: (await Account.findOrFail(f.account.id)).balance, body: response.body() }))
      const splits = [{ categoryId: f.categories[1].id, amount: input }, { categoryId: f.categories[2].id, amount: -amount }]
      const created = await client.post('/api/v1/category-transfer').json({ date: '2025-02-10', type: TransactionType.REBALANCE_TRANSACTION,
        categories: splits }).accept('json').loginAs(f.user)
      // Negative half ties can fail this sign-asymmetric rounded zero-sum check.
      created.assertStatus(Math.abs(amount) === 0.005 ? 422 : 200)
      if (created.status() === 200) {
        const id = created.body().data.transaction.id
        const updated = await client.patch(`/api/v1/category-transfer/${id}`).json({ date: '2025-02-11',
          type: TransactionType.REBALANCE_TRANSACTION, categories: splits }).accept('json').loginAs(f.user)
        updated.assertStatus(200)
        console.log(JSON.stringify({ scenario: 'fractional transfer', input, status: created.status(),
          splits: (await Transaction.findOrFail(id)).categories,
          categoryBalances: await Promise.all(f.categories.slice(1).map(async c => (await Category.findOrFail(c.id)).balance)),
          createBody: created.body(), updateBody: updated.body() }))
      } else {
        assert.equal((await Category.findOrFail(f.categories[1].id)).balance, 0)
        assert.equal((await Category.findOrFail(f.categories[2].id)).balance, 0)
        assert.equal((await f.budget.related('transactions').query()).length, 1)
        const control = await client.post('/api/v1/category-transfer').json({ date: '2025-02-10', type: TransactionType.REBALANCE_TRANSACTION,
          categories: splits.map(split => ({ ...split, amount: 0 })) }).accept('json').loginAs(f.user)
        control.assertStatus(200)
        const id = control.body().data.transaction.id
        const before = await Promise.all([db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
          db.from('categories').whereIn('id', f.categories.map(c => c.id)).orderBy('id')])
        const rejected = await client.patch(`/api/v1/category-transfer/${id}`).json({ date: '2025-02-11',
          type: TransactionType.REBALANCE_TRANSACTION, categories: splits }).accept('json').loginAs(f.user)
        rejected.assertStatus(422)
        assert.deepEqual(await Promise.all([db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
          db.from('categories').whereIn('id', f.categories.map(c => c.id)).orderBy('id')]), before)
        console.log(JSON.stringify({ scenario: 'fractional transfer rejected', input, createBody: created.body(), patchBody: rejected.body() }))
      }
    })

  test('funding currency and Statement writers record decimal versus JSON response precision')
    .with([0, 0.01, -0.01, 0.004, 0.005, 0.006, -0.004, -0.005, -0.006, 1.234, -1.234, '0.005', '0.01', '1.234', 0.1 + 0.2])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const config = await client.patch(`/api/v1/groups/${f.categories[0].groupId}/categories/${f.categories[0].id}`)
        .json({ name: 'Currency configuration', fundingAmount: amount }).accept('json').loginAs(f.user)
      config.assertStatus(200)
      const plan = await client.put(`/api/v1/funding-plans/item/${f.categories[1].id}`)
        .json({ amount, recurrence: 1 }).accept('json').loginAs(f.user)
      plan.assertStatus(200)
      const data = { shortTermCapitalGains: amount, longTermCapitalGains: 0, dividends: 0, taxableInterest: 0 }
      const statement = await client.post(`/api/v1/account/${f.account.id}/statements`)
        .json({ startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: amount, endingBalance: amount, data })
        .accept('json').loginAs(f.user)
      statement.assertStatus(200)
      const storedStatement = await db.from('statements').where('account_id', f.account.id).first()
      assert.equal(storedStatement.data.shortTermCapitalGains, Number(amount))
      const updated = await client.patch(`/api/v1/statements/${storedStatement.id}`)
        .json({ startingBalance: amount, endingBalance: amount, data }).accept('json').loginAs(f.user)
      updated.assertStatus(200)
      console.log(JSON.stringify({ scenario: 'currency config and statement', input: amount,
        category: (await Category.findOrFail(f.categories[0].id)).fundingAmount,
        planAmount: (await Category.findOrFail(f.categories[1].id)).fundingAmount,
        storedStatement: await db.from('statements').where('id', storedStatement.id)
          .select('starting_balance', 'ending_balance', 'data').first(),
        categoryBody: config.body(), planBody: plan.body(), statementBody: statement.body(), updateBody: updated.body() }))
    })

  test('balance-tracked Statement raw response and persisted current balance record separate precision')
    .with([0.004, 0.005, -0.005, 0.1 + 0.2])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      await f.account.merge({ tracking: TrackingType.Balances }).save()
      const response = await client.post(`/api/v1/account/${f.account.id}/statements`)
        .json({ startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: amount, endingBalance: amount })
        .accept('json').loginAs(f.user)
      response.assertStatus(200)
      const stored = await db.from('statements').where('account_id', f.account.id).first()
      const postBalance = (await Account.findOrFail(f.account.id)).balance
      const updated = await client.patch(`/api/v1/statements/${stored.id}`)
        .json({ endingBalance: amount }).accept('json').loginAs(f.user)
      updated.assertStatus(200)
      assert.equal((await Account.findOrFail(f.account.id)).balance, Number(stored.ending_balance))
      console.log(JSON.stringify({ scenario: 'balance-tracked statement', input: amount, postBody: response.body(), patchBody: updated.body(),
        storedStatement: await db.from('statements').where('id', stored.id).select('starting_balance', 'ending_balance').first(),
        postBalance, patchBalance: (await Account.findOrFail(f.account.id)).balance }))
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
