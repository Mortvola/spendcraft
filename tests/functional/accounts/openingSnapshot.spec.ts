import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Statement from '#models/Statement'
import Account from '#models/Account'
import BalanceHistory from '#models/BalanceHistory'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `history-authority-${++sequence}`, email: `history-authority-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Statement bank' })
    const account = await institution.related('accounts').create({
      name: 'Statement account', balance: 100, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    return { budget, user, account }
  })
}

test.group('Opening snapshot Statements', (group) => {
  let addedTablefunc = false
  group.setup(async () => {
    const existing = await db.from('pg_extension').where('extname', 'tablefunc').first()
    if (!existing) {
      await db.rawQuery('CREATE EXTENSION tablefunc')
      addedTablefunc = true
    }
  })
  group.teardown(async () => {
    if (addedTablefunc) await db.rawQuery('DROP EXTENSION tablefunc')
  })
  test('both offline onboarding paths preserve the supplied date and signed/zero balance')
    .with(['institution', 'account'].flatMap((path) => [0, -125.25, 100].map((balance) => ({ path, balance }))))
    .run(async ({ client, assert }, scenario) => {
      const f = await createFixture()
      const startDate = '2001-07-19'
      const account = { name: 'Opening snapshot', balance: scenario.balance, type: AccountType.Depository,
        subtype: 'checking', tracking: TrackingType.Balances, startDate, rate: 0 }
      const response = scenario.path === 'institution'
        ? await client.post('/api/v1/institution').json({ institution: { name: 'Opening bank' }, accounts: [account], startDate }).accept('json').loginAs(f.user)
        : await client.post(`/api/v1/institution/${f.account.institutionId}/accounts`).json(account).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const id: number = scenario.path === 'institution' ? response.body().data.accounts[0].id : response.body().data.account.id
      const created = await Account.findOrFail(id)
      const statements = await Statement.query().where('accountId', id)
      assert.lengthOf(statements, 1)
      assert.equal(statements[0].startDate.toISODate(), startDate)
      assert.equal(statements[0].endDate.toISODate(), startDate)
      assert.equal(statements[0].startingBalance, scenario.balance)
      assert.equal(statements[0].endingBalance, scenario.balance)
      assert.equal(created.balance, scenario.balance)
      assert.lengthOf(await BalanceHistory.query().where('accountId', id), 0)
      assert.lengthOf(await created.related('accountTransactions').query(), 0)
    })

  test('transaction-tracked onboarding does not create an opening Statement or history')
    .with(['institution', 'account']).run(async ({ client, assert }, path) => {
      const f = await createFixture()
      const startDate = '2001-07-19'
      const account = { name: 'Transaction control', balance: 100, type: AccountType.Depository,
        subtype: 'checking', tracking: TrackingType.Transactions, startDate, rate: 0 }
      const response = path === 'institution'
        ? await client.post('/api/v1/institution').json({ institution: { name: 'Transaction bank' }, accounts: [account], startDate }).accept('json').loginAs(f.user)
        : await client.post(`/api/v1/institution/${f.account.institutionId}/accounts`).json(account).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const id: number = path === 'institution' ? response.body().data.accounts[0].id : response.body().data.account.id
      assert.equal((await Account.findOrFail(id)).balance, 100)
      assert.lengthOf(await Statement.query().where('accountId', id), 0)
      assert.lengthOf(await BalanceHistory.query().where('accountId', id), 0)
    })

  test('snapshot insertion failure rolls back onboarding')
    .with(['institution', 'account']).run(async ({ client, assert }, path) => {
      const f = await createFixture()
      const snapshot = () => Promise.all(['institutions', 'accounts', 'statements', 'balance_histories'].map((table) => db.from(table).orderBy('id')))
      const before = await snapshot()
      const startDate = '2001-07-19'
      const account = { name: 'Rollback snapshot', balance: -999, type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Balances, startDate, rate: 0 }
      await db.rawQuery('ALTER TABLE statements ADD CONSTRAINT opening_snapshot_failure CHECK (ending_balance <> -999) NOT VALID')
      try {
        const response = path === 'institution'
          ? await client.post('/api/v1/institution').json({ institution: { name: 'Rollback bank' }, accounts: [account], startDate }).accept('json').loginAs(f.user)
          : await client.post(`/api/v1/institution/${f.account.institutionId}/accounts`).json(account).accept('json').loginAs(f.user)
        response.assertStatus(500)
        assert.deepEqual(await snapshot(), before)
      } finally {
        await db.rawQuery('ALTER TABLE statements DROP CONSTRAINT opening_snapshot_failure')
      }
    })

  test('net-worth chooses a Statement-based window without stored history', async ({ client, assert }) => {
    const f = await createFixture()
    const response = await client.post(`/api/v1/institution/${f.account.institutionId}/accounts`).json({
      name: 'Statement-only report account', balance: 125.25, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Balances, startDate: '2001-07-19', rate: 0,
    }).accept('json').loginAs(f.user)
    response.assertStatus(200)
    const id: number = response.body().data.account.id
    assert.lengthOf(await BalanceHistory.query().where('accountId', id), 0)
    const report = await client.get('/api/v1/reports/networth').accept('json').loginAs(f.user)
    report.assertStatus(200)
    const data: (string | number | null)[][] = report.body()
    const column = data[0].indexOf('Statement-only report account')
    assert.isAbove(column, 0)
    assert.isTrue(data.slice(1).some((row) => row[0] === '2001-01-01' && row[column] === 125.25))
  })
})
