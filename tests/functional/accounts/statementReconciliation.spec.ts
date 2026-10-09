import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Statement from '#models/Statement'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const oldPeriod = { start: 10, end: 20 }
const periods = [
  { name: 'forward', start: 15, end: 25 },
  { name: 'backward', start: 5, end: 15 },
  { name: 'wider', start: 5, end: 25 },
  { name: 'narrower', start: 12, end: 18 },
]
const date = (day: number) => `2025-02-${String(day).padStart(2, '0')}`

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `period-${++sequence}`, email: `period-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Period bank' })
    const account = await institution.related('accounts').create({
      name: 'Period account', balance: 300, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Balances, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const statement = await account.related('statements').create({
      startDate: DateTime.fromISO(date(oldPeriod.start)), endDate: DateTime.fromISO(date(oldPeriod.end)),
      startingBalance: 100, endingBalance: 200, data: null,
    })
    const neighbor = await account.related('statements').create({
      startDate: DateTime.fromISO(date(21)), endDate: DateTime.fromISO(date(28)),
      startingBalance: 200, endingBalance: 300, data: null,
    })
    const rows: { day: number, row: AccountTransaction }[] = []
    for (let day = 1; day <= 28; day += 1) {
      const transaction = await budget.related('transactions').create({
        date: DateTime.fromISO(date(day)), type: TransactionType.MANUAL_TRANSACTION,
        version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
      })
      const row = await account.related('accountTransactions').create({
        transactionId: transaction.id, name: `Period day ${day}`, amount: day % 2 === 0 ? day : -day,
        provider: 'NONE', pending: false, statementId: day === 10 ? statement.id : day === 16 ? neighbor.id : null,
      })
      rows.push({ day, row })
    }
    return { budget, user, account, statement, neighbor, rows }
  })
}

test.group('Statement reconciliation period characterization', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function state() {
    return Promise.all([
      db.from('accounts').where('id', fixture.account.id),
      db.from('statements').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', fixture.budget.id).orderBy('categories.id'),
    ])
  }

  for (const workflow of ['combined', 'sequential', 'dates-only', 'clear'] as const) {
    test(`${workflow} date/reconciliation PATCH: {name}`).with(periods).run(async ({ client, assert }, period) => {
      const before = await state()
      const dates = { startDate: date(period.start), endDate: date(period.end) }
      const url = `/api/v1/statements/${fixture.statement.id}`
      const body = workflow === 'combined' ? { ...dates, reconcile: 'All' }
        : workflow === 'clear' ? { ...dates, reconcile: 'None' } : dates
      const first = await client.patch(url).json(body).accept('json').loginAs(fixture.user)
      first.assertStatus(200)
      const response = workflow === 'sequential'
        ? await client.patch(url).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user) : first
      response.assertStatus(200)
      const persisted = await Statement.findOrFail(fixture.statement.id)
      assert.equal(persisted.startDate.toISODate(), dates.startDate)
      assert.equal(persisted.endDate.toISODate(), dates.endDate)
      assert.equal(persisted.startingBalance, 100)
      assert.equal(persisted.endingBalance, 200)
      assert.isNull(persisted.data)
      const selectedPeriod = period
      const actualAssignments = await Promise.all(fixture.rows.map(async ({ day, row }) => ({ day, statementId: (await AccountTransaction.findOrFail(row.id)).statementId })))
      const expectedAssignments: { day: number, statementId: number | null }[] = []
      let credits = 0
      let debits = 0
      for (const { day, row } of fixture.rows) {
        const selected = workflow !== 'clear' && (day === 10 ||
          ((workflow === 'combined' || workflow === 'sequential') && day >= selectedPeriod.start && day <= selectedPeriod.end))
        const expected = day === 16 ? fixture.neighbor.id : selected ? fixture.statement.id : null
        expectedAssignments.push({ day, statementId: expected })
        if (expected === fixture.statement.id) {
          if (row.amount > 0) credits += row.amount
          else debits += row.amount
        }
      }
      assert.equal(response.body().startDate, dates.startDate)
      assert.equal(response.body().endDate, dates.endDate)
      assert.equal((await Account.findOrFail(fixture.account.id)).balance, 300)
      const after = await state()
      assert.deepEqual([after[0], after[2], after[4], after[5]], [before[0], before[2], before[4], before[5]])
      assert.deepEqual(after[1].filter((row) => row.id === fixture.neighbor.id), before[1].filter((row) => row.id === fixture.neighbor.id))
      assert.deepEqual(actualAssignments, expectedAssignments, `${workflow}/${period.name}: exact persisted assignments`)
      assert.equal(response.body().credits, credits)
      assert.equal(response.body().debits, debits)
    })
  }

  test('account failure rolls back changed dates and reconciliation without late writes', async ({ client, assert }) => {
    const transaction = await fixture.budget.related('transactions').create({
      date: DateTime.fromISO('2025-03-10'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
    })
    const march = await fixture.account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'New period movement', amount: 20,
      provider: 'NONE', pending: false, statementId: null,
    })
    const before = await state()
    await db.rawQuery('ALTER TABLE accounts ADD CONSTRAINT period_test_failure CHECK (balance <> 777) NOT VALID')
    const connection = db.connection().getWriteClient()
    const pendingWrites = new Set<string>()
    const lateWrites: string[] = []
    const unhandledErrors: unknown[] = []
    let requestCompleted = false
    let reconciledNewPeriod = false
    const started = (query: { sql: string }) => {
      if (/^update "(accounts|statements|account_transactions)"/.test(query.sql)) {
        pendingWrites.add(query.sql)
        if (requestCompleted) lateWrites.push(query.sql)
      }
    }
    const completed = (_result: unknown, query: { sql: string }) => { pendingWrites.delete(query.sql) }
    const succeeded = (result: unknown, query: { sql: string, bindings: unknown[] }) => {
      completed(result, query)
      if (query.sql.startsWith('update "account_transactions"') && query.bindings.at(-1) === march.id) reconciledNewPeriod = true
    }
    const rejected = (reason: unknown) => { unhandledErrors.push(reason) }
    connection.on('query', started)
    connection.on('query-response', succeeded)
    connection.on('query-error', completed)
    process.on('unhandledRejection', rejected)
    try {
      const response = await client.patch(`/api/v1/statements/${fixture.statement.id}`)
        .json({ startDate: '2025-03-01', endDate: '2025-03-20', endingBalance: 777, reconcile: 'All' })
        .accept('json').loginAs(fixture.user)
      requestCompleted = true
      response.assertStatus(500)
      assert.equal(pendingWrites.size, 0)
      assert.deepEqual(await state(), before)
      await new Promise<void>((resolve) => setImmediate(resolve))
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.deepEqual(await state(), before)
      assert.deepEqual(lateWrites, [])
      assert.deepEqual(unhandledErrors, [])
      assert.isTrue(reconciledNewPeriod, 'new-period reconciliation must complete before the account failure')
    } finally {
      connection.off('query', started)
      connection.off('query-response', succeeded)
      connection.off('query-error', completed)
      process.off('unhandledRejection', rejected)
      await db.rawQuery('ALTER TABLE accounts DROP CONSTRAINT period_test_failure')
    }
  })

})
