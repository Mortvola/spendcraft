import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'
import type { ApiClient } from '@japa/api-client'

let sequence = 0

test.group('Net-worth opening snapshots', (group) => {
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
      const user = await budget.related('users').create({ username: `networth-initial-${++sequence}`, email: `networth-initial-${sequence}@example.com`, password: 'testPassw0rd' })
      const institution = await budget.related('institutions').create({ name: 'Initial Funding bank' })
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

  async function observe(client: ApiClient, f: Awaited<ReturnType<typeof fixture>>, status: number) {
    const response = await client.get('/api/v1/reports/networth').accept('json').loginAs(f.user)
    response.assertStatus(status)
    const account = await Account.findOrFail(f.account.id)
    const associations = await account.related('accountTransactions').query().preload('transaction')
    console.log(JSON.stringify({ characterization: 'networth-initial', status: response.status(),
      account: { balance: account.balance, startDate: account.startDate.toISODate() },
      transactions: associations.map((row) => ({ amount: row.amount, date: row.transaction.date.toISODate(), type: row.transaction.type })),
      report: status === 200 ? response.body() : null }))
    return response.body()
  }

  test('Initial Funding provides signed opening snapshots; zero provides no date')
    .with([100, 0, -100]).run(async ({ client, assert }, amount) => {
      const f = await fixture()
      await f.account.merge({ balance: amount }).save()
      await movement(f, f.account.startDate, amount, TransactionType.STARTING_BALANCE)
      assert.deepEqual(await observe(client, f, 200), amount === 0
        ? [['date', 'Transaction account']]
        : [['date', 'Transaction account'], [f.account.startDate.toISODate(), amount]])
      assert.equal((await Account.findOrFail(f.account.id)).balance, amount)
      assert.equal((await f.account.related('accountTransactions').query()).length, 1)
    })

  test('an account with no Initial Funding or ordinary transactions also has no plotted rows', async ({ client, assert }) => {
    const f = await fixture()
    await f.account.merge({ balance: 0 }).save()
    assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account']])
    assert.equal((await f.account.related('accountTransactions').query()).length, 0)
  })

  test('Initial Funding with one ordinary transaction plots only the ordinary date', async ({ client, assert }) => {
    const f = await fixture()
    await movement(f, f.account.startDate, 90, TransactionType.STARTING_BALANCE)
    const date = f.today.minus({ days: 2 })
    await movement(f, date, 10)
    assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [f.account.startDate.toISODate(), 90], [date.toISODate(), 100]])
  })

  test('an ordinary transaction without Initial Funding still plots current balance', async ({ client, assert }) => {
    const f = await fixture()
    const date = f.today.minus({ days: 2 })
    await movement(f, date, 10)
    assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [date.toISODate(), 100]])
  })

  test('an opening-only account carries its balance across other account dates')
    .with([TrackingType.Transactions, TrackingType.Balances]).run(async ({ client, assert }, tracking) => {
      const f = await fixture()
      await movement(f, f.account.startDate, 100, TransactionType.STARTING_BALANCE)
      const other = await f.institution.related('accounts').create({ name: 'Other account', balance: 50,
        type: AccountType.Depository, subtype: 'checking', tracking, startDate: f.account.startDate, rate: 0, closed: false })
      const date = f.today.minus({ days: 2 })
      const later = f.today.minus({ days: 1 })
      if (tracking === TrackingType.Balances) {
        await other.related('statements').create({ startDate: date, endDate: date, startingBalance: 40, endingBalance: 40, data: null })
        await other.related('statements').create({ startDate: later, endDate: later, startingBalance: 40, endingBalance: 50, data: null })
      } else {
        await movement({ ...f, account: other }, date, 10)
        await movement({ ...f, account: other }, later, 10)
      }
      const body = await observe(client, f, 200)
      assert.lengthOf(body, 4)
      assert.sameMembers(body[0], ['date', 'Transaction account', 'Other account'])
      assert.equal(body[1][0], f.account.startDate.toISODate())
      assert.equal(body[1][body[0].indexOf('Transaction account')], 100)
      assert.equal(body[1][body[0].indexOf('Other account')], 0)
      assert.equal(body[2][0], date.toISODate())
      assert.equal(body[2][body[0].indexOf('Transaction account')], 100)
      assert.equal(body[2][body[0].indexOf('Other account')], 40)
      assert.equal(body[3][0], later.toISODate())
      assert.equal(body[3][body[0].indexOf('Transaction account')], 100)
      assert.equal(body[3][body[0].indexOf('Other account')], 50)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    })

  test('old opening dates control grouping and provide opening points')
    .with([{ age: 400, unit: 'week' }, { age: 1000, unit: 'month' }, { age: 4000, unit: 'year' }])
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      await f.account.merge({ startDate: f.today.minus({ days: scenario.age }) }).save()
      await movement(f, f.account.startDate, 90, TransactionType.STARTING_BALANCE)
      const date = f.today.minus({ days: 2 })
      await movement(f, date, 10)
      const bucket = scenario.unit === 'week' ? date.startOf('week')
        : scenario.unit === 'month' ? date.startOf('month') : date.startOf('year')
      const openingBucket = scenario.unit === 'week' ? f.account.startDate.startOf('week')
        : scenario.unit === 'month' ? f.account.startDate.startOf('month') : f.account.startDate.startOf('year')
      assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [openingBucket.toISODate(), 90], [bucket.toISODate(), 100]])
      assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), f.account.startDate.toISODate())
    })

  test('a budget without accounts reaches an empty pivot input', async ({ client, assert }) => {
    const f = await fixture()
    await f.account.delete()
    const response = await client.get('/api/v1/reports/networth').accept('json').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body(), [['date']])
    assert.equal((await f.institution.related('accounts').query()).length, 0)
  })
  test('signed movements evolve the opening balance')
    .with([10, -10]).run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const opening = 100 - amount
      await movement(f, f.account.startDate, opening, TransactionType.STARTING_BALANCE)
      const date = f.today.minus({ days: 2 })
      await movement(f, date, amount)
      assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'],
        [f.account.startDate.toISODate(), opening], [date.toISODate(), 100]])
    })

  test('multiple movements in the opening bucket produce one closing value')
    .with([0, 400, 1000, 4000]).run(async ({ client, assert }, age) => {
      const f = await fixture()
      const date = f.today.minus({ days: age })
      await f.account.merge({ startDate: date }).save()
      await movement(f, date, 90, TransactionType.STARTING_BALANCE)
      await movement(f, date, 15)
      await movement(f, date, -5)
      const bucket = age === 400 ? date.startOf('week') : age === 1000 ? date.startOf('month')
        : age === 4000 ? date.startOf('year') : date
      assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [bucket.toISODate(), 100]])
    })

  test('old zero Initial Funding does not coarsen ordinary transaction dates', async ({ client, assert }) => {
    const f = await fixture()
    await f.account.merge({ startDate: f.today.minus({ days: 4000 }), balance: 10 }).save()
    await movement(f, f.account.startDate, 0, TransactionType.STARTING_BALANCE)
    await movement(f, f.today, 10)
    assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [f.today.toISODate(), 10]])
  })

  test('Loans retain reverse reconstruction without an opening snapshot', async ({ client, assert }) => {
    const f = await fixture()
    await f.account.merge({ type: AccountType.Loan }).save()
    await movement(f, f.account.startDate, 90, TransactionType.STARTING_BALANCE)
    const first = f.today.minus({ days: 2 })
    await movement(f, first, 15)
    await movement(f, f.today, -5)
    assert.deepEqual(await observe(client, f, 200), [['date', 'Transaction account'], [first.toISODate(), 105], [f.today.toISODate(), 100]])
  })

})
