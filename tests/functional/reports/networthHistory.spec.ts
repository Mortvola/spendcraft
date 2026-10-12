import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'
import type { ApiClient } from '@japa/api-client'

let sequence = 0

test.group('Net-worth history independence', (group) => {
  let addedTablefunc = false
  group.setup(async () => {
    if (!(await db.from('pg_extension').where('extname', 'tablefunc').first())) {
      await db.rawQuery('CREATE EXTENSION tablefunc')
      addedTablefunc = true
    }
  })
  group.teardown(async () => { if (addedTablefunc) await db.rawQuery('DROP EXTENSION tablefunc') })

  async function fixture() {
    return db.transaction(async (trx) => {
      const budget = await Budget.create({}, { client: trx })
      await budget.initialize()
      const user = await budget.related('users').create({ username: `networth-history-${++sequence}`, email: `networth-history-${sequence}@example.com`, password: 'testPassw0rd' })
      const institution = await budget.related('institutions').create({ name: 'History dependency bank' })
      const today = DateTime.utc().startOf('day')
      const account = await institution.related('accounts').create({ name: 'Transaction account', balance: 100,
        type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
        startDate: today.minus({ days: 6 }), rate: 0, closed: false })
      return { budget, user, institution, today, account }
    })
  }

  async function movement(f: Awaited<ReturnType<typeof fixture>>, date: DateTime, amount: number, type = TransactionType.MANUAL_TRANSACTION) {
    const transaction = await f.budget.related('transactions').create({ date, type, categories: [], taxes: [], version: 0, sortOrder: 0, deleted: false })
    await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount, name: 'Report movement', provider: 'NONE', pending: false })
  }

  async function report(client: ApiClient, f: Awaited<ReturnType<typeof fixture>>) {
    const response = await client.get('/api/v1/reports/networth').accept('json').loginAs(f.user)
    response.assertStatus(200)
    const account = await Account.findOrFail(f.account.id)
    const history = await account.related('balanceHistory').query().orderBy('date')
    const transactions = await account.related('accountTransactions').query().preload('transaction')
    console.log(JSON.stringify({ characterization: 'networth-history', tracking: account.tracking,
      startDate: account.startDate.toISODate(), currentBalance: account.balance,
      history: history.map((row) => ({ date: row.date.toISODate(), balance: row.balance })),
      transactions: transactions.map((row) => ({ date: row.transaction.date.toISODate(), amount: row.amount, type: row.transaction.type })),
      report: response.body() }))
    return response.body()
  }

  test('transactions without stored history produce daily closing balances', async ({ client, assert }) => {
    const f = await fixture()
    await movement(f, f.today.minus({ days: 5 }), 10)
    await movement(f, f.today.minus({ days: 2 }), -5)
    assert.deepEqual(await report(client, f), [['date', 'Transaction account'],
      [f.today.minus({ days: 5 }).toISODate(), 105], [f.today.minus({ days: 2 }).toISODate(), 100]])
  })

  test('later or OFX-style snapshots do not supply new chart points or change balances')
    .with([4, 1, 0]).run(async ({ client, assert }, daysAgo) => {
      const f = await fixture()
      await movement(f, f.today.minus({ days: 5 }), 10)
      await movement(f, f.today.minus({ days: 2 }), -5)
      const before = await report(client, f)
      const history = await f.account.related('balanceHistory').create({ date: f.today.minus({ days: daysAgo }), balance: 999999 })
      assert.deepEqual(await report(client, f), before)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
      await history.delete()
      assert.deepEqual(await report(client, f), before)
    })

  test('old pre-start history dates cannot change grouping or financial values')
    .with([{ age: 400, unit: 'week' }, { age: 1000, unit: 'month' }, { age: 4000, unit: 'year' }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      const first = f.today.minus({ days: 5 })
      const second = f.today.minus({ days: 2 })
      await movement(f, first, 10)
      await movement(f, second, -5)
      const before = await report(client, f)
      const history = await f.account.related('balanceHistory').create({ date: f.today.minus({ days: scenario.age }), balance: 999999 })
      // These ages previously forced weekly, monthly, and yearly rebucketing.
      assert.deepEqual(await report(client, f), before)
      await history.delete()
      assert.deepEqual(await report(client, f), before)
    })

  test('authoritative transaction dates still determine grouping without history')
    .with([{ age: 400, unit: 'week' }, { age: 1000, unit: 'month' }, { age: 4000, unit: 'year' }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      const date = f.today.minus({ days: scenario.age })
      await movement(f, date, 10)
      const bucket = scenario.unit === 'week' ? date.startOf('week')
        : scenario.unit === 'month' ? date.startOf('month') : date.startOf('year')
      assert.deepEqual(await report(client, f), [['date', 'Transaction account'], [bucket.toISODate(), 100]])
    })

  test('authoritative Statement dates still determine grouping without history')
    .with([{ age: 400, unit: 'week' }, { age: 1000, unit: 'month' }, { age: 4000, unit: 'year' }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      await f.account.merge({ tracking: TrackingType.Balances }).save()
      const date = f.today.minus({ days: scenario.age })
      await f.account.related('statements').create({ startDate: date, endDate: date, startingBalance: 100, endingBalance: 100, data: null })
      const bucket = scenario.unit === 'week' ? date.startOf('week')
        : scenario.unit === 'month' ? date.startOf('month') : date.startOf('year')
      assert.deepEqual(await report(client, f), [['date', 'Transaction account'], [bucket.toISODate(), 100]])
    })

  test('Initial Funding affects grouping but does not generate its own plotted baseline', async ({ client, assert }) => {
    const f = await fixture()
    await f.account.merge({ startDate: f.today.minus({ days: 4000 }) }).save()
    await movement(f, f.account.startDate, 105, TransactionType.STARTING_BALANCE)
    await movement(f, f.today.minus({ days: 2 }), -5)
    assert.deepEqual(await report(client, f), [['date', 'Transaction account'], [f.today.startOf('year').toISODate(), 100]])
  })

  test('an Initial-Funding-only account currently has no report data row', async ({ client }) => {
    const f = await fixture()
    await movement(f, f.account.startDate, 100, TransactionType.STARTING_BALANCE)
    const response = await client.get('/api/v1/reports/networth').accept('json').loginAs(f.user)
    response.assertStatus(500)
  })

  test('Statement-only balance history ignores stale stored history')
    .with([false, true]).run(async ({ client, assert }, mixed) => {
      const f = await fixture()
      await f.account.merge({ tracking: TrackingType.Balances }).save()
      const date = f.today.minus({ days: 3 })
      await f.account.related('statements').create({ startDate: date, endDate: date, startingBalance: 100, endingBalance: 100, data: null })
      if (mixed) {
        const account = await f.institution.related('accounts').create({ name: 'Second transaction account', balance: 50,
          type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
          startDate: f.today.minus({ days: 6 }), rate: 0, closed: false })
        const transaction = await f.budget.related('transactions').create({ date, type: TransactionType.MANUAL_TRANSACTION, categories: [], taxes: [], version: 0, sortOrder: 0, deleted: false })
        await account.related('accountTransactions').create({ transactionId: transaction.id, amount: 5, name: 'Mixed report movement', provider: 'NONE', pending: false })
      }
      const before = await report(client, f)
      assert.lengthOf(before, 2)
      assert.sameMembers(before[0], mixed ? ['date', 'Second transaction account', 'Transaction account'] : ['date', 'Transaction account'])
      assert.equal(before[1][0], date.toISODate())
      assert.equal(before[1][before[0].indexOf('Transaction account')], 100)
      if (mixed) assert.equal(before[1][before[0].indexOf('Second transaction account')], 50)
      await f.account.related('balanceHistory').create({ date: f.today.minus({ days: 4000 }), balance: 999999 })
      assert.deepEqual(await report(client, f), before)
    })
})
