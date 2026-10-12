import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Statement from '#models/Statement'
import Account from '#models/Account'
import BalanceHistory from '#models/BalanceHistory'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
const investmentData = { shortTermCapitalGains: 1, longTermCapitalGains: 2, dividends: 3, taxableInterest: 4 }

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

test.group('Statement and balance-history authority characterization', (group) => {
  let f: Awaited<ReturnType<typeof createFixture>>
  let older: Statement
  let latest: Statement
  group.each.setup(async () => {
    f = await createFixture()
    await f.account.merge({ tracking: TrackingType.Balances }).save()
    older = await f.account.related('statements').create({ startDate: DateTime.fromISO('2025-01-01'), endDate: DateTime.fromISO('2025-01-31'), startingBalance: 0, endingBalance: 50, data: investmentData })
    latest = await f.account.related('statements').create({ startDate: DateTime.fromISO('2025-02-01'), endDate: DateTime.fromISO('2025-02-28'), startingBalance: 50, endingBalance: 100, data: investmentData })
  })

  async function snapshot() {
    return Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('balance_histories').where('account_id', f.account.id).orderBy('id'),
      db.from('statements').where('account_id', f.account.id).orderBy('id'),
      db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'),
      db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
    ])
  }

  async function seedHistory(finalOnly = false) {
    const first = finalOnly ? null : await BalanceHistory.create({ accountId: f.account.id, date: DateTime.fromISO('2025-01-10'), balance: 50 })
    const last = await BalanceHistory.create({ accountId: f.account.id, date: DateTime.fromISO('2025-02-10'), balance: 100 })
    return { first, last }
  }

  // Before enforcement these nine history mutations overwrote Account.balance independently
  // of Statements (including latest deletion -> 50 and final deletion -> 0).
  test('manual history rejects without overriding Statement authority')
    .with(['create-newer', 'create-older', 'edit-latest-zero', 'edit-older', 'move-latest-earlier', 'move-older-later', 'delete-latest', 'delete-older', 'delete-final'])
    .run(async ({ client, assert }, operation) => {
      const rows = await seedHistory(operation === 'delete-final')
      const before = await snapshot()
      const target = operation === 'edit-older' || operation === 'move-older-later' || operation === 'delete-older' ? rows.first : rows.last
      if (!target) throw new Error('Missing characterization history row')
      const path = `/api/v1/account/${f.account.id}/balances`
      const response = operation.startsWith('create')
        ? await client.post(path).json({ date: operation === 'create-newer' ? '2025-03-10' : '2025-01-01', amount: 250 }).accept('json').loginAs(f.user)
        : operation.startsWith('delete')
          ? await client.delete(`${path}/${target.id}`).accept('json').loginAs(f.user)
          : await client.patch(`${path}/${target.id}`).json({
            date: operation === 'move-latest-earlier' ? '2025-01-05' : operation === 'move-older-later' ? '2025-03-10' : target.date.toISODate(),
            amount: operation === 'edit-latest-zero' ? 0 : operation === 'edit-older' ? 80 : target.balance,
          }).accept('json').loginAs(f.user)
      response.assertStatus(422)
      assert.deepEqual(await snapshot(), before)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    })

  test('Statement mutations derive balance without maintaining history')
    .with(['create', 'ending-zero', 'move-earlier', 'delete-latest', 'delete-older', 'delete-only'])
    .run(async ({ client, assert }, operation) => {
      await seedHistory()
      if (operation === 'delete-only') await older.delete()
      const before = await snapshot()
      const response = operation === 'create'
        ? await client.post(`/api/v1/account/${f.account.id}/statements`).json({ startDate: '2025-03-01', endDate: '2025-03-31', startingBalance: 100, endingBalance: 250 }).accept('json').loginAs(f.user)
        : operation.startsWith('delete')
          ? await client.delete(`/api/v1/statements/${operation === 'delete-older' ? older.id : latest.id}`).accept('json').loginAs(f.user)
          : await client.patch(`/api/v1/statements/${latest.id}`).json(operation === 'ending-zero' ? { endingBalance: 0 } : { startDate: '2024-12-01', endDate: '2024-12-31' }).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const expected = operation === 'create' ? 250 : operation === 'ending-zero' || operation === 'delete-only' ? 0 : operation === 'delete-older' ? 100 : 50
      assert.equal((await Account.findOrFail(f.account.id)).balance, expected)
      const after = await snapshot()
      assert.deepEqual(after[1], before[1])
      assert.deepEqual(after.slice(3), before.slice(3))
    })

  test('transaction-tracked history endpoints also overwrite balance although GET derives a transaction series', async ({ client, assert }) => {
    await f.account.merge({ tracking: TrackingType.Transactions }).save()
    const response = await client.post(`/api/v1/account/${f.account.id}/balances`).json({ date: '2025-03-10', amount: 250 }).accept('json').loginAs(f.user)
    response.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 250)
    const history = await BalanceHistory.query().where('accountId', f.account.id).firstOrFail()
    ;(await client.patch(`/api/v1/account/${f.account.id}/balances/${history.id}`).json({ date: '2025-03-10', amount: 0 }).accept('json').loginAs(f.user)).assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 0)
    ;(await client.delete(`/api/v1/account/${f.account.id}/balances/${history.id}`).accept('json').loginAs(f.user)).assertStatus(200)
    assert.lengthOf(await BalanceHistory.query().where('accountId', f.account.id), 0)
    assert.equal((await Statement.findOrFail(latest.id)).endingBalance, 100)
  })

  // Pre-fix characterization: history POST set 250, Statement PATCH set 120,
  // then history PATCH restored 250. History is now rejected throughout.
  test('history cannot override a later Statement mutation', async ({ client, assert }) => {
    const history = await seedHistory()
    ;(await client.post(`/api/v1/account/${f.account.id}/balances`).json({ date: '2025-03-10', amount: 250 }).accept('json').loginAs(f.user)).assertStatus(422)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
    ;(await client.patch(`/api/v1/statements/${latest.id}`).json({ endingBalance: 120 }).accept('json').loginAs(f.user)).assertStatus(200)
    const before = await snapshot()
    ;(await client.patch(`/api/v1/account/${f.account.id}/balances/${history.last.id}`).json({ date: '2025-02-10', amount: 80 }).accept('json').loginAs(f.user)).assertStatus(422)
    assert.deepEqual(await snapshot(), before)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 120)
  })

  test('late account save failure rolls back history mutation', async ({ client, assert }) => {
    await f.account.merge({ tracking: TrackingType.Transactions }).save()
    const rows = await seedHistory()
    const before = await snapshot()
    await db.rawQuery(`ALTER TABLE accounts ADD CONSTRAINT history_authority_failure CHECK (id <> ${f.account.id} OR balance <> 999) NOT VALID`)
    try {
      const response = await client.patch(`/api/v1/account/${f.account.id}/balances/${rows.last.id}`).json({ date: '2025-02-10', amount: 999 }).accept('json').loginAs(f.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    } finally {
      await db.rawQuery('ALTER TABLE accounts DROP CONSTRAINT history_authority_failure')
    }
  })
  test('standalone balance DELETE also overrides Statement authority')
    .with([false, true]).run(async ({ client, assert }, finalOnly) => {
      const rows = await seedHistory(finalOnly)
      const before = await snapshot()
      const response = await client.delete(`/api/v1/balance/${rows.last.id}`).accept('json').loginAs(f.user)
      response.assertStatus(422)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
      const after = await snapshot()
      assert.deepEqual(after.slice(2), before.slice(2))
      assert.deepEqual(after, before)
    })

})
