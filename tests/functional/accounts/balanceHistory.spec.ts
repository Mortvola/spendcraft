import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import BalanceHistory from '#models/BalanceHistory'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `history-${++sequence}`, email: `history-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'History bank' })
    const account = await institution.related('accounts').create({
      name: 'History account', balance: 0, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Balances, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-01-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
    })
    await account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Unrelated transaction', amount: 0,
      provider: 'NONE', pending: false, statementId: null,
    })
    return { budget, user, account }
  })
}

test.group('Balance history correctness', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function seed(rows: { date: string, balance: number }[]) {
    const histories = []
    for (const row of rows) {
      histories.push(await BalanceHistory.create({ accountId: fixture.account.id,
        date: DateTime.fromISO(row.date), balance: row.balance }))
    }
    await fixture.account.merge({ balance: rows[rows.length - 1]?.balance ?? 0 }).save()
    return histories
  }

  async function financialState() {
    return Promise.all([
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
    ])
  }

  async function historyState() {
    return db.from('balance_histories').where('account_id', fixture.account.id).orderBy('id')
  }

  test('creating first/newer/older history uses chronological latest').with(['first', 'newer', 'older']).run(async ({ client, assert }, scenario) => {
    if (scenario !== 'first') await seed([{ date: '2025-02-01', balance: 200 }])
    const date = scenario === 'older' ? '2025-01-01' : '2025-03-01'
    const before = await financialState()
    const response = await client.post(`/api/v1/account/${fixture.account.id}/balances`)
      .json({ date, amount: 123.45 }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const rows = await BalanceHistory.query().where('accountId', fixture.account.id).orderBy('date')
    assert.equal(rows.length, scenario === 'first' ? 1 : 2)
    assert.isTrue(rows.some((row) => row.date.toISODate() === date && row.balance === 123.45))
    assert.equal((await Account.findOrFail(fixture.account.id)).balance, scenario === 'older' ? 200 : 123.45)
    assert.equal(response.body().data.accountBalance, scenario === 'older' ? 200 : 123.45)
    assert.deepEqual(await financialState(), before)
  })

  test('editing amount/date recomputes chronological latest').with(['latest-amount', 'older-amount', 'latest-earlier', 'older-later']).run(async ({ client, assert }, scenario) => {
    const rows = await seed([{ date: '2025-01-01', balance: 100 }, { date: '2025-02-01', balance: 200 }])
    const index = scenario.startsWith('latest') ? 1 : 0
    const date = scenario === 'latest-earlier' ? '2024-12-01'
      : scenario === 'older-later' ? '2025-03-01' : rows[index].date.toISODate()
    const before = await financialState()
    const response = await client.patch(`/api/v1/account/${fixture.account.id}/balances/${rows[index].id}`)
      .json({ date, amount: 333.33 }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const changed = await BalanceHistory.findOrFail(rows[index].id)
    assert.equal(changed.date.toISODate(), date)
    assert.equal(changed.balance, 333.33)
    const untouched = await BalanceHistory.findOrFail(rows[1 - index].id)
    assert.equal(untouched.balance, rows[1 - index].balance)
    assert.equal(untouched.date.toISODate(), rows[1 - index].date.toISODate())
    const expected = scenario === 'latest-earlier' ? 100 : scenario === 'older-amount' ? 200 : 333.33
    assert.equal((await Account.findOrFail(fixture.account.id)).balance, expected)
    assert.deepEqual(await financialState(), before)
  })

  test('deleting latest/older/last history preserves remaining balance').with(['latest', 'older', 'last']).run(async ({ client, assert }, scenario) => {
    const rows = await seed(scenario === 'last' ? [{ date: '2025-01-01', balance: 100 }]
      : [{ date: '2025-01-01', balance: 100 }, { date: '2025-02-01', balance: 200 }])
    const target = rows[scenario === 'latest' ? 1 : 0]
    const before = await financialState()
    const response = await client.delete(`/api/v1/account/${fixture.account.id}/balances/${target.id}`)
      .accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.isNull(await BalanceHistory.find(target.id))
    assert.equal((await historyState()).length, rows.length - 1)
    assert.equal((await Account.findOrFail(fixture.account.id)).balance,
      scenario === 'last' ? 0 : scenario === 'latest' ? 100 : 200)
    assert.deepEqual(await financialState(), before)
  })

  test('failed account persistence rolls back history mutation').with(['create', 'update', 'delete']).run(async ({ client, assert }, operation) => {
    const rows = await seed([{ date: '2025-01-01', balance: 777 }, { date: '2025-02-01', balance: 888 }])
    const before = await historyState()
    const financialBefore = await financialState()
    await db.rawQuery('ALTER TABLE accounts ADD CONSTRAINT history_test_failure CHECK (balance <> 777) NOT VALID')
    try {
      const url = `/api/v1/account/${fixture.account.id}/balances`
      const response = operation === 'create'
        ? await client.post(url).json({ date: '2025-03-01', amount: 777 }).accept('json').loginAs(fixture.user)
        : operation === 'update'
          ? await client.patch(`${url}/${rows[1].id}`).json({ date: '2025-02-01', amount: 777 }).accept('json').loginAs(fixture.user)
          : await client.delete(`${url}/${rows[1].id}`).accept('json').loginAs(fixture.user)
      response.assertStatus(500)
      assert.deepEqual(await historyState(), before)
      assert.equal((await Account.findOrFail(fixture.account.id)).balance, 888)
      assert.deepEqual(await financialState(), financialBefore)
    } finally {
      await db.rawQuery('ALTER TABLE accounts DROP CONSTRAINT history_test_failure')
    }
  })
})
