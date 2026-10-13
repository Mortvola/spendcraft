import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Transaction from '#models/Transaction'
import Handler from '#exceptions/Handler'
import { DateTime } from 'luxon'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

let sequence = 0

test.group('Post-commit rollback characterization', () => {
  test('rollback after commit and repeated rollback record installed behavior without undoing commit', async ({ assert }) => {
    const trx = await db.transaction()
    try {
      const budget = await Budget.create({}, { client: trx })
      await trx.commit()
      const results: string[] = []
      for (let i = 0; i < 2; i++) {
        try { await trx.rollback(); results.push('resolved') }
        catch (error) { results.push(error instanceof Error ? error.message : String(error)) }
        assert.isTrue(trx.isCompleted)
      }
      assert.isNotNull(await Budget.find(budget.id))
      console.log(JSON.stringify({ scenario: 'rollback-after-commit', results }))
    } finally { if (!trx.isCompleted) await trx.rollback() }
    const rolledBack = await db.transaction()
    await rolledBack.rollback()
    let repeated: string
    try { await rolledBack.rollback(); repeated = 'resolved' }
    catch (error) { repeated = error instanceof Error ? error.message : String(error) }
    assert.isTrue(rolledBack.isCompleted)
    console.log(JSON.stringify({ scenario: 'rollback-after-rollback', result: repeated }))
  })

  test('Statement response lookup failure occurs after a durable transaction update', async ({ client, assert, cleanup }) => {
    const budget = await Budget.create({})
    await db.transaction(async (trx) => { budget.useTransaction(trx); await budget.initialize() })
    const user = await budget.related('users').create({ username: `post-commit-${++sequence}`,
      email: `post-commit-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Post-commit bank' })
    const account = await institution.related('accounts').create({ name: 'Checking', balance: 100,
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
    const unassigned = await budget.getUnassignedCategory()
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: unassigned.id, amount: 10 }],
      taxes: [], version: 0, deleted: false, sortOrder: 0 })
    const association = await account.related('accountTransactions').create({ transactionId: transaction.id,
      amount: 10, name: 'Original', pending: false, provider: 'NONE' })
    const statement = await account.related('statements').create({ startDate: DateTime.fromISO('2025-02-01'),
      endDate: DateTime.fromISO('2025-02-28'), startingBalance: 90, endingBalance: 100 })
    const captured: TransactionClientContract[] = []
    const events: string[] = []
    const rollbackResults: string[] = []
    const acquire = db.transaction.bind(db)
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await acquire(); captured.push(trx)
      const commit = trx.commit.bind(trx)
      mock.method(trx, 'commit', async () => {
        await commit()
        assert.isTrue(trx.isCompleted)
        events.push('commit completed')
      })
      const rollback = trx.rollback.bind(trx)
      mock.method(trx, 'rollback', async () => {
        assert.isTrue(trx.isCompleted)
        events.push('rollback attempted on completed transaction')
        try { await rollback(); rollbackResults.push('resolved') }
        catch (error) { rollbackResults.push(error instanceof Error ? error.message : String(error)); throw error }
      })
      return trx
    })
    cleanup(() => capture.mock.restore())
    const failure = new Error('Injected post-commit Statement query failure')
    const related = Account.prototype.related
    const injection = mock.method(Account.prototype, 'related', function (this: Account, ...args: Parameters<typeof related>) {
      if (this.id === account.id && args[0] === 'statements' && captured[0]?.isCompleted) {
        events.push('post-commit Statement dependency failed')
        throw failure
      }
      return related.apply(this, args)
    })
    cleanup(() => injection.mock.restore())
    const handled: unknown[] = []
    const handle = Handler.prototype.handle
    const observer = mock.method(Handler.prototype, 'handle', async function (this: Handler, ...args: Parameters<typeof handle>) {
      handled.push(args[0]); events.push('global handler received error'); return handle.apply(this, args)
    })
    cleanup(() => observer.mock.restore())
    const response = await client.patch(`/api/v1/transaction/${transaction.id}`).json({ version: 0,
      name: 'Committed name', statementId: statement.id }).accept('json').loginAs(user)
    assert.isAtLeast(response.status(), 400)
    assert.lengthOf(rollbackResults, 1)
    assert.isTrue(captured[0].isCompleted)
    const persisted = await account.related('accountTransactions').query().where('id', association.id).firstOrFail()
    assert.equal(persisted.name, 'Committed name')
    assert.equal(persisted.statementId, statement.id)
    assert.equal((await Transaction.findOrFail(transaction.id)).version, 1)
    console.log(JSON.stringify({ scenario: 'post-commit-query', status: response.status(), rollbackResults,
      events, body: response.body(), originalErrorReachedHandler: handled.includes(failure),
      committedName: persisted.name, statementId: persisted.statementId }))
  })
})
