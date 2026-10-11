import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Statement from '#models/Statement'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const investmentData = { shortTermCapitalGains: 1, longTermCapitalGains: 2, dividends: 3, taxableInterest: 4 }

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `statement-${++sequence}`, email: `statement-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Statement bank' })
    const account = await institution.related('accounts').create({
      name: 'Statement account', balance: 100, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    return { budget, user, account }
  })
}

test.group('Statement DELETE persisted-state characterization', () => {
  test('DELETE atomically unassigns transactions and maintains the authoritative balance')
    .with([
      { tracking: TrackingType.Balances, position: 'only', count: 0, amount: 0 },
      { tracking: TrackingType.Balances, position: 'only', count: 1, amount: 10 },
      { tracking: TrackingType.Balances, position: 'latest', count: 2, amount: -10 },
      { tracking: TrackingType.Balances, position: 'older', count: 2, amount: 0 },
      { tracking: TrackingType.Balances, position: 'latest-zero', count: 1, amount: 10 },
      { tracking: TrackingType.Transactions, position: 'only', count: 0, amount: 0 },
      { tracking: TrackingType.Transactions, position: 'only', count: 1, amount: 10 },
      { tracking: TrackingType.Transactions, position: 'latest', count: 2, amount: -10 },
      { tracking: TrackingType.Transactions, position: 'older', count: 2, amount: 0 },
    ]).run(async ({ client, assert }, scenario) => {
      const f = await createFixture()
      await f.account.merge({ tracking: scenario.tracking, balance: 300 }).save()
      const target = await f.account.related('statements').create({
        startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'),
        startingBalance: 100, endingBalance: scenario.position === 'older' ? 200 : 300, data: investmentData,
      })
      const neighbor = scenario.position === 'only' ? null : await f.account.related('statements').create({
        startDate: DateTime.fromISO(scenario.position.startsWith('latest') ? '2025-01-01' : '2025-03-01'),
        endDate: DateTime.fromISO(scenario.position.startsWith('latest') ? '2025-01-31' : '2025-03-31'),
        startingBalance: 100, endingBalance: scenario.position === 'latest-zero' ? 0 : scenario.position === 'latest' ? 150 : 300, data: investmentData,
      })
      for (let index = 0; index < scenario.count + 2; index++) {
        const transaction = await f.budget.related('transactions').create({
          date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION,
          version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
        })
        await f.account.related('accountTransactions').create({
          transactionId: transaction.id, name: 'DELETE characterization', amount: scenario.amount,
          provider: 'NONE', pending: false,
          statementId: index < scenario.count ? target.id : index === scenario.count ? neighbor?.id ?? null : null,
        })
      }
      const snapshot = async () => Promise.all([
        db.from('accounts').where('id', f.account.id),
        db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
        db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
        db.from('statements').where('account_id', f.account.id).orderBy('id'),
        db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
      ])
      const before = await snapshot()
      const response = await client.delete(`/api/v1/statements/${target.id}`).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const after = await snapshot()
      assert.deepEqual(after[2], before[2])
      assert.deepEqual(after[1], before[1].map((row) => row.statement_id === target.id
        ? { ...row, statement_id: null } : row))
      assert.equal(Number(after[0][0].balance), scenario.tracking === TrackingType.Balances
        ? neighbor?.endingBalance ?? 0 : 300)
      assert.deepEqual(after[4], before[4])
      assert.deepEqual(after[3], before[3].filter((row) => row.id !== target.id))
      assert.lengthOf(after[1].filter((row) => row.statement_id === target.id), 0)
      assert.isNull(await Statement.find(target.id))
      const listed = await client.get(`/api/v1/account/${f.account.id}/statements`).accept('json').loginAs(f.user)
      listed.assertStatus(200)
      assert.lengthOf(listed.body(), neighbor ? 1 : 0)
      const register = await client.get(`/api/v1/account/${f.account.id}/transactions`)
        .qs({ limit: 50, offset: 0, pending: false }).accept('json').loginAs(f.user)
      register.assertStatus(200)
      assert.sameMembers(register.body().data.transactions.map((row: { id: number }) => row.id),
        after[2].map((row) => row.id))
      // Statement creation/reconcile-All eligibility requires a null statement_id.
      const eligible = await db.from('account_transactions').where('account_id', f.account.id).whereNull('statement_id')
      assert.lengthOf(eligible, scenario.count + (neighbor ? 1 : 2))
      const repeat = await client.delete(`/api/v1/statements/${target.id}`).accept('json').loginAs(f.user)
      repeat.assertStatus(404)
      assert.deepEqual(await snapshot(), after)
    })
  test('late account persistence failure rolls back unassignment and deletion', async ({ client, assert }) => {
    const f = await createFixture()
    await f.account.merge({ tracking: TrackingType.Balances, balance: 300 }).save()
    const statement = await f.account.related('statements').create({
      startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'),
      startingBalance: 100, endingBalance: 300, data: investmentData,
    })
    const transaction = await f.budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-10'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [], taxes: [],
    })
    await f.account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Rollback', amount: 10, provider: 'NONE', pending: false, statementId: statement.id,
    })
    const snapshot = () => Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('statements').where('account_id', f.account.id),
      db.from('account_transactions').where('account_id', f.account.id),
    ])
    const before = await snapshot()
    await db.rawQuery(`ALTER TABLE accounts ADD CONSTRAINT statement_delete_failure CHECK (id <> ${f.account.id} OR balance <> 0) NOT VALID`)
    try {
      const response = await client.delete(`/api/v1/statements/${statement.id}`).accept('json').loginAs(f.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    } finally {
      await db.rawQuery('ALTER TABLE accounts DROP CONSTRAINT statement_delete_failure')
    }
  })

})
