import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Statement from '#models/Statement'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const investmentData = { shortTermCapitalGains: 1, longTermCapitalGains: 2, dividends: 3, taxableInterest: 4 }
const february = { startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 200 }

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

test.group('Manual statement correctness', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function seedStatement(startDate: string, endDate: string, endingBalance: number) {
    return fixture.account.related('statements').create({
      startDate: DateTime.fromISO(startDate), endDate: DateTime.fromISO(endDate),
      startingBalance: 100, endingBalance, data: investmentData,
    })
  }

  async function seedTransaction(date: string, amount: number, options: { pending?: boolean, deleted?: boolean, statementId?: number } = {}) {
    const transaction = await fixture.budget.related('transactions').create({
      date: DateTime.fromISO(date), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: options.deleted ?? false, sortOrder: 0, categories: [], taxes: [],
    })
    return fixture.account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Statement movement', amount, provider: 'NONE',
      pending: options.pending ?? false, statementId: options.statementId ?? null,
    })
  }

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

  test('create first/after/between/before statement preserves supplied balances and existing rows')
    .with(['first', 'after', 'between', 'before']).run(async ({ client, assert }, position) => {
      const neighbors: Statement[] = []
      if (position === 'after' || position === 'between') neighbors.push(await seedStatement('2025-01-01', '2025-01-31', 150))
      if (position === 'before' || position === 'between') neighbors.push(await seedStatement('2025-03-01', '2025-03-31', 300))
      const before = await state()
      const response = await client.post(`/api/v1/account/${fixture.account.id}/statements`)
        .json(february).accept('json').loginAs(fixture.user)
      response.assertStatus(200)
      const rows = await Statement.query().where('accountId', fixture.account.id).orderBy('endDate')
      const created = rows.find((row) => !neighbors.some((neighbor) => neighbor.id === row.id))
      assert.exists(created)
      assert.equal(created?.startingBalance, 100)
      assert.equal(created?.endingBalance, 200)
      assert.equal(created?.startDate.toISODate(), february.startDate)
      assert.equal(created?.endDate.toISODate(), february.endDate)
      const after = await state()
      assert.deepEqual(after[1].filter((row) => neighbors.some((neighbor) => neighbor.id === row.id)), before[1])
      assert.deepEqual([after[0], ...after.slice(2)], [before[0], ...before.slice(2)])
      assert.equal(response.body().credits, 0)
      assert.equal(response.body().debits, 0)
    })

  test('balance-tracked creation copies the latest statement ending balance')
    .with(['first', 'newer', 'older', 'between', 'zero']).run(async ({ client, assert }, position) => {
      await fixture.account.merge({ tracking: TrackingType.Balances }).save()
      if (position === 'newer') { await seedStatement('2025-01-01', '2025-01-31', 100) }
      if (position === 'older' || position === 'between') {
        await seedStatement('2025-03-01', '2025-03-31', 300)
        await fixture.account.merge({ balance: 300 }).save()
      }
      if (position === 'between') await seedStatement('2025-01-01', '2025-01-31', 100)
      const response = await client.post(`/api/v1/account/${fixture.account.id}/statements`)
        .json({ ...february, endingBalance: position === 'zero' ? 0 : 200 }).accept('json').loginAs(fixture.user)
      const rows = await Statement.query().where('accountId', fixture.account.id).orderBy('endDate', 'desc')
      assert.equal(rows.length, position === 'between' ? 3 : position === 'older' || position === 'newer' ? 2 : 1,
        `HTTP ${response.status()}: statement creation must persist`)
      assert.equal((await Account.findOrFail(fixture.account.id)).balance, rows[0].endingBalance)
      response.assertStatus(200)
    })

  test('creation reconciles inclusive date boundaries without reassigning existing links', async ({ client, assert }) => {
    const previous = await seedStatement('2025-01-01', '2025-01-31', 100)
    const before = await seedTransaction('2025-01-31', 9)
    const start = await seedTransaction('2025-02-01', 10)
    const end = await seedTransaction('2025-02-28', -4)
    const after = await seedTransaction('2025-03-01', 8)
    const linked = await seedTransaction('2025-02-10', 7, { statementId: previous.id })
    const snapshot = await state()
    const response = await client.post(`/api/v1/account/${fixture.account.id}/statements`)
      .json(february).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const statement = await Statement.query().where('accountId', fixture.account.id).where('endDate', '2025-02-28').firstOrFail()
    for (const row of [start, end]) assert.equal((await AccountTransaction.findOrFail(row.id)).statementId, statement.id)
    for (const row of [before, after]) assert.isNull((await AccountTransaction.findOrFail(row.id)).statementId)
    assert.equal((await AccountTransaction.findOrFail(linked.id)).statementId, previous.id)
    assert.equal(response.body().credits, 10)
    assert.equal(response.body().debits, -4)
    const result = await state()
    assert.deepEqual([result[0], result[2], result[4]], [snapshot[0], snapshot[2], snapshot[4]])
  })
  test('creation currently links pending and deleted transactions whereas listed totals exclude deleted', async ({ client, assert }) => {
    const pending = await seedTransaction('2025-02-10', 10, { pending: true })
    const deleted = await seedTransaction('2025-02-11', 20, { deleted: true })
    const response = await client.post(`/api/v1/account/${fixture.account.id}/statements`)
      .json(february).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const statement = await Statement.query().where('accountId', fixture.account.id).firstOrFail()
    for (const row of [pending, deleted]) assert.equal((await AccountTransaction.findOrFail(row.id)).statementId, statement.id)
    assert.equal(response.body().credits, 30)
    const listed = await client.get(`/api/v1/account/${fixture.account.id}/statements`).accept('json').loginAs(fixture.user)
    listed.assertStatus(200)
    assert.equal(listed.body()[0].credits, 10)
  })

  test('partial PATCH preserves omitted dates and balances')
    .with(['ending-balance', 'starting-balance', 'start-date', 'end-date', 'data', 'reconcile-all', 'reconcile-none']).run(async ({ client, assert }, field) => {
      const statement = await seedStatement(february.startDate, february.endDate, 200)
      const row = await seedTransaction('2025-02-10', 10, field === 'reconcile-none' ? { statementId: statement.id } : {})
      const body = field === 'starting-balance' ? { startingBalance: 90 }
        : field === 'start-date' ? { startDate: '2025-01-01' }
          : field === 'ending-balance' ? { endingBalance: 250 }
            : field === 'end-date' ? { endDate: '2025-03-31' }
              : field === 'data' ? { data: { ...investmentData, dividends: 9 } }
                : { reconcile: field === 'reconcile-all' ? 'All' : 'None' }
      const before = await state()
      const response = await client.patch(`/api/v1/statements/${statement.id}`).json(body).accept('json').loginAs(fixture.user)
      const persisted = await Statement.findOrFail(statement.id)
      assert.equal(persisted.startDate.toISODate(), field === 'start-date' ? '2025-01-01' : february.startDate)
      assert.equal(persisted.endDate.toISODate(), field === 'end-date' ? '2025-03-31' : february.endDate)
      assert.equal(persisted.startingBalance, field === 'starting-balance' ? 90 : 100)
      assert.equal(persisted.endingBalance, field === 'ending-balance' ? 250 : 200)
      assert.equal((await AccountTransaction.findOrFail(row.id)).statementId, field === 'reconcile-all' ? statement.id : null)
      const after = await state()
      assert.deepEqual([after[0], after[2], after[4], after[5]], [before[0], before[2], before[4], before[5]])
      response.assertStatus(200)
      assert.deepEqual(persisted.data, field === 'data' ? { ...investmentData, dividends: 9 } : investmentData)
      assert.equal(response.body().startDate, persisted.startDate.toISODate())
      assert.equal(response.body().endDate, persisted.endDate.toISODate())
      assert.equal(response.body().startingBalance, persisted.startingBalance)
      assert.equal(response.body().endingBalance, persisted.endingBalance)
      assert.deepEqual(response.body().data, persisted.data)
      assert.equal(response.body().credits, field === 'reconcile-all' ? 10 : 0)
      assert.equal(response.body().debits, 0)
    })


  test('partial PATCH preserves null investment data when omitted', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    await statement.merge({ data: null }).save()
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ endingBalance: 250 }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const persisted = await Statement.findOrFail(statement.id)
    assert.isNull(persisted.data)
    assert.equal(persisted.endingBalance, 250)
    assert.equal(response.body().startDate, february.startDate)
    assert.equal(response.body().endDate, february.endDate)
    assert.deepEqual(response.body().data, { shortTermCapitalGains: 0, longTermCapitalGains: 0, dividends: 0, taxableInterest: 0 })
  })

  test('partial PATCH accepts explicit zero balances and investment resets', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    const data = { shortTermCapitalGains: 0, longTermCapitalGains: 0, dividends: 0, taxableInterest: 0 }
    const before = await state()
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ startingBalance: 0, endingBalance: 0, data }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const persisted = await Statement.findOrFail(statement.id)
    assert.equal(persisted.startingBalance, 0)
    assert.equal(persisted.endingBalance, 0)
    assert.deepEqual(persisted.data, data)
    assert.equal(persisted.startDate.toISODate(), february.startDate)
    assert.equal(persisted.endDate.toISODate(), february.endDate)
    assert.equal(response.body().startingBalance, 0)
    assert.equal(response.body().endingBalance, 0)
    assert.deepEqual(response.body().data, data)
    const after = await state()
    assert.deepEqual([after[0], ...after.slice(2)], [before[0], ...before.slice(2)])
  })

  test('full client PATCH preserves dates and assigns the supplied balances', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    const before = await state()
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ ...february, endingBalance: 250, data: investmentData }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.equal((await Statement.findOrFail(statement.id)).endingBalance, 250)
    const after = await state()
    assert.deepEqual([after[0], ...after.slice(2)], [before[0], ...before.slice(2)])
  })

  test('moving a statement does not implicitly reassign transactions or change neighboring statements', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    await seedStatement('2025-03-01', '2025-03-31', 300)
    await seedTransaction('2025-02-10', 10, { statementId: statement.id })
    await seedTransaction('2025-03-10', 20)
    const before = await state()
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ ...february, startDate: '2025-03-01', endDate: '2025-03-31', data: investmentData }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const after = await state()
    assert.deepEqual(after[1].filter((row) => row.id !== statement.id), before[1].filter((row) => row.id !== statement.id))
    assert.deepEqual([after[0], ...after.slice(2)], [before[0], ...before.slice(2)])
  })


  test('balance-tracked full PATCH recomputes current balance from the resulting latest statement')
    .with(['latest-amount', 'older-amount', 'latest-earlier', 'older-later']).run(async ({ client, assert }, scenario) => {
      await fixture.account.merge({ tracking: TrackingType.Balances, balance: 300 }).save()
      const older = await seedStatement('2025-01-01', '2025-01-31', 100)
      const latest = await seedStatement('2025-03-01', '2025-03-31', 300)
      const target = scenario.startsWith('latest') ? latest : older
      const startDate = scenario === 'latest-earlier' ? '2024-12-01' : scenario === 'older-later' ? '2025-04-01' : target.startDate.toISODate()
      const endDate = scenario === 'latest-earlier' ? '2024-12-31' : scenario === 'older-later' ? '2025-04-30' : target.endDate.toISODate()
      const before = await state()
      const response = await client.patch(`/api/v1/statements/${target.id}`)
        .json({ startDate, endDate, startingBalance: 100, endingBalance: 250, data: investmentData }).accept('json').loginAs(fixture.user)
      response.assertStatus(200)
      const changed = await Statement.findOrFail(target.id)
      assert.equal(changed.endDate.toISODate(), endDate)
      assert.equal(changed.endingBalance, 250)
      const current = await Statement.query().where('accountId', fixture.account.id).orderBy('endDate', 'desc').firstOrFail()
      const after = await state()
      assert.deepEqual(after[1].filter((row) => row.id !== target.id), before[1].filter((row) => row.id !== target.id))
      assert.deepEqual(after.slice(2), before.slice(2))
      assert.equal((await Account.findOrFail(fixture.account.id)).balance, current.endingBalance)
    })

  test('omitting investment data in an otherwise full PATCH preserves it', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ ...february, endingBalance: 250 }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.deepEqual((await Statement.findOrFail(statement.id)).data, investmentData)
  })

  test('combined date change currently reconciles the pre-edit period', async ({ client, assert }) => {
    const statement = await seedStatement(february.startDate, february.endDate, 200)
    const feb = await seedTransaction('2025-02-10', 10)
    const march = await seedTransaction('2025-03-10', 20)
    const response = await client.patch(`/api/v1/statements/${statement.id}`)
      .json({ ...february, startDate: '2025-03-01', endDate: '2025-03-31', data: investmentData, reconcile: 'All' }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.equal((await Statement.findOrFail(statement.id)).endDate.toISODate(), '2025-03-31')
    assert.equal((await AccountTransaction.findOrFail(feb.id)).statementId, statement.id)
    assert.isNull((await AccountTransaction.findOrFail(march.id)).statementId)
  })

  test('late persistence failure rolls back statement and reconciliation writes')
    .with(['create', 'patch', 'account-patch', 'account-create', 'late-create-balance']).run(async ({ client, assert }, operation) => {
      const creation = operation === 'create' || operation === 'account-create' || operation === 'late-create-balance'
      const statement = await seedStatement(creation ? '2025-01-01' : february.startDate, creation ? '2025-01-31' : february.endDate, 200)
      await seedTransaction('2025-02-01', 10)
      const last = await seedTransaction('2025-02-28', -4)
      if (operation !== 'create') await fixture.account.merge({ tracking: TrackingType.Balances, balance: 200 }).save()
      const before = await state()
      const table = operation === 'create' || operation === 'late-create-balance' ? 'account_transactions' : operation === 'patch' ? 'statements' : 'accounts'
      const constraint = operation === 'create' || operation === 'late-create-balance'
        ? `ALTER TABLE account_transactions ADD CONSTRAINT statement_test_failure CHECK (id <> ${last.id} OR statement_id IS NULL) NOT VALID`
        : operation === 'patch' ? 'ALTER TABLE statements ADD CONSTRAINT statement_test_failure CHECK (ending_balance <> 777) NOT VALID'
          : 'ALTER TABLE accounts ADD CONSTRAINT statement_test_failure CHECK (balance <> 777) NOT VALID'
      await db.rawQuery(constraint)
      const connection = db.connection().getWriteClient()
      const pendingWrites = new Set<string>()
      const lateWrites: string[] = []
      const unhandledErrors: unknown[] = []
      let requestCompleted = false
      let successfulAccountWrites = 0
      const started = (query: { sql: string }) => {
        if (/^(insert into|update|delete from) "(accounts|statements|account_transactions)"/.test(query.sql)) {
          pendingWrites.add(query.sql)
          if (requestCompleted) lateWrites.push(query.sql)
        }
      }
      const completed = (_result: unknown, query: { sql: string }) => { pendingWrites.delete(query.sql) }
      const succeeded = (result: unknown, query: { sql: string }) => {
        completed(result, query)
        if (query.sql.startsWith('update "accounts"')) successfulAccountWrites += 1
      }
      const rejected = (reason: unknown) => { unhandledErrors.push(reason) }
      connection.on('query', started)
      connection.on('query-response', succeeded)
      connection.on('query-error', completed)
      process.on('unhandledRejection', rejected)
      try {
        const response = creation
          ? await client.post(`/api/v1/account/${fixture.account.id}/statements`).json({ ...february, endingBalance: 777 }).accept('json').loginAs(fixture.user)
          : await client.patch(`/api/v1/statements/${statement.id}`)
            .json({ ...february, endingBalance: 777, data: investmentData, reconcile: 'All' }).accept('json').loginAs(fixture.user)
        requestCompleted = true
        response.assertStatus(500)
        assert.equal(pendingWrites.size, 0, 'persistence must finish before the response')
        if (operation === 'late-create-balance') {
          assert.equal(successfulAccountWrites, 1, 'the account update must succeed before reconciliation fails')
        }
        assert.deepEqual(await state(), before)
        await new Promise<void>((resolve) => setImmediate(resolve))
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.deepEqual(await state(), before)
        assert.deepEqual(lateWrites, [], 'no persistence may start after the response')
        assert.deepEqual(unhandledErrors, [], 'no detached persistence rejection may follow rollback')
      } finally {
        connection.off('query', started)
        connection.off('query-response', succeeded)
        connection.off('query-error', completed)
        process.off('unhandledRejection', rejected)
        await db.rawQuery(`ALTER TABLE ${table} DROP CONSTRAINT statement_test_failure`)
      }
    })
})
