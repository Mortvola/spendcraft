import { test } from '@japa/runner'
import { mock } from 'node:test'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Transaction from '#models/Transaction'
import Category from '#models/Category'
import Handler from '#exceptions/Handler'
import transactionFields from '#app/Controllers/Http/transactionFields'
import { DateTime } from 'luxon'
import { AccountType, TrackingType, TransactionType } from '#common/ResponseTypes'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

let sequence = 0

async function fixture(mode: string) {
  const budget = await Budget.create({})
  await db.transaction(async (trx) => { budget.useTransaction(trx); await budget.initialize() })
  const user = await budget.related('users').create({ username: `statement-response-${++sequence}`,
    email: `statement-response-${sequence}@example.com`, password: 'testPassw0rd' })
  const institution = await budget.related('institutions').create({ name: 'Response bank' })
  const account = await institution.related('accounts').create({ name: 'Checking', balance: 100,
    type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
    startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false })
  const category = await budget.getUnassignedCategory()
  const oldStatement = await account.related('statements').create({ startDate: DateTime.fromISO('2025-01-01'),
    endDate: DateTime.fromISO('2025-01-31'), startingBalance: 90, endingBalance: 100 })
  const target = await account.related('statements').create({ startDate: DateTime.fromISO('2025-02-01'),
    endDate: DateTime.fromISO('2025-02-28'), startingBalance: 90, endingBalance: 100 })
  const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-10'),
    type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id, amount: 10 }],
    taxes: [], version: 0, deleted: false, sortOrder: 0 })
  const association = await account.related('accountTransactions').create({ transactionId: transaction.id,
    amount: 10, name: 'Original', pending: false, provider: 'NONE',
    statementId: mode === 'assign' ? null : oldStatement.id })
  const responseStatement = mode === 'clear' ? oldStatement : target
  for (const [amount, deleted] of [[-4, false], [999, true]] as const) {
    const sibling = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-11'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id, amount }],
      taxes: [], version: 0, deleted, sortOrder: 0 })
    await account.related('accountTransactions').create({ transactionId: sibling.id, amount,
      name: 'Sibling', pending: false, provider: 'NONE', statementId: responseStatement.id })
  }
  return { user, account, category, transaction, association, responseStatement,
    statementId: mode === 'clear' ? null : target.id }
}

// Same relationship scope, aggregates and deletion filter as the production response lookup.
async function responseStatement(account: Account, id: number, trx: TransactionClientContract) {
  const query = account.related('statements').query()
    .withAggregate('accountTransactions', (query) => {
      query.where('amount', '>', 0).sum('amount').as('credits')
        .whereHas('transaction', (transaction) => transaction.where('deleted', false))
    })
    .withAggregate('accountTransactions', (query) => {
      query.where('amount', '<', 0).sum('amount').as('debits')
        .whereHas('transaction', (transaction) => transaction.where('deleted', false))
    })
    .where('id', id)
  if (query.client !== trx) throw new Error('Statement query did not inherit the active transaction')
  return query.firstOrFail()
}

test.group('Transaction Statement response commit boundary', () => {
  test('stale version retains the existing 409 response and rolls back without mutation', async ({ client, assert, cleanup }) => {
    const data = await fixture('assign')
    const before = (await Transaction.findOrFail(data.transaction.id)).serialize()
    const acquire = db.transaction.bind(db)
    let captured: TransactionClientContract | undefined
    let commitCalls = 0
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await acquire(); captured = trx
      const commit = trx.commit.bind(trx)
      mock.method(trx, 'commit', async () => { commitCalls++; await commit() })
      return trx
    })
    cleanup(() => capture.mock.restore())
    const response = await client.patch(`/api/v1/transaction/${data.transaction.id}`).json({ version: 99,
      name: 'Updated', statementId: data.statementId }).accept('json').loginAs(data.user)
    response.assertStatus(409)
    assert.equal(response.body().errors[0].detail, 'The version of the transaction does not match the version stored in the database.')
    assert.equal(commitCalls, 0)
    assert.isTrue(captured?.isCompleted)
    assert.deepEqual((await Transaction.findOrFail(data.transaction.id)).serialize(), before)
    const persisted = await data.account.related('accountTransactions').query().where('id', data.association.id).firstOrFail()
    assert.equal(persisted.name, 'Original')
    assert.isNull(persisted.statementId)
  })

  test('successful response matches equivalent active-transaction preparation')
    .with(['assign', 'reassign', 'clear'])
    .run(async ({ client, assert, cleanup }, mode) => {
    const data = await fixture(mode)
    const acquire = db.transaction.bind(db)
    let preparedStatement: ReturnType<Account['serialize']> | undefined
    let preparedTransaction: ReturnType<Transaction['serialize']> | undefined
    let captured: TransactionClientContract | undefined
    const events: string[] = []
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await acquire()
      captured = trx
      const commit = trx.commit.bind(trx)
      mock.method(trx, 'commit', async () => {
        assert.isFalse(trx.isCompleted)
        assert.include(events, 'production Statement query completed')
        const account = await Account.findOrFail(data.account.id, { client: trx })
        assert.strictEqual(account.$trx, trx)
        preparedStatement = (await responseStatement(account, data.responseStatement.id, trx)).serialize()
        const transaction = await Transaction.findOrFail(data.transaction.id, { client: trx })
        await transaction.load('accountTransaction', (query) => query.preload('account', (accountQuery) => accountQuery.preload('institution')))
        preparedTransaction = transaction.serialize(transactionFields)
        events.push('response prepared before commit')
        await commit()
        events.push('commit completed')
      })
      return trx
    })
    cleanup(() => capture.mock.restore())
    const related = Account.prototype.related
    const lookup = mock.method(Account.prototype, 'related', function (this: Account, ...args: Parameters<typeof related>) {
      if (this.id === data.account.id && args[0] === 'statements') {
        const relation = (related<'statements'>).call(this, 'statements')
        assert.strictEqual(this.$trx, captured)
        const query = relation.query.bind(relation)
        mock.method(relation, 'query', () => {
          const builder = query()
          assert.strictEqual(builder.client, captured)
          const first = builder.first.bind(builder)
          mock.method(builder, 'first', async () => {
            const result = await first()
            assert.isFalse(captured?.isCompleted)
            events.push('production Statement query completed')
            return result
          })
          return builder
        })
        return relation
      }
      return related.apply(this, args)
    })
    cleanup(() => lookup.mock.restore())
    const response = await client.patch(`/api/v1/transaction/${data.transaction.id}`).json({ version: 0,
      name: 'Updated', statementId: data.statementId }).accept('json').loginAs(data.user)
    response.assertStatus(200)
    events.push('successful response observed')
    assert.isBelow(events.indexOf('production Statement query completed'), events.indexOf('commit completed'))
    assert.isBelow(events.indexOf('commit completed'), events.indexOf('successful response observed'))
    const body = response.body().data
    assert.deepEqual(body.statement, preparedStatement)
    assert.deepEqual(body.transaction, preparedTransaction)
    assert.equal(body.statement.id, data.responseStatement.id)
    assert.equal(body.statement.startDate, mode === 'clear' ? '2025-01-01' : '2025-02-01')
    assert.equal(body.statement.endDate, mode === 'clear' ? '2025-01-31' : '2025-02-28')
    assert.equal(body.statement.startingBalance, 90)
    assert.equal(body.statement.endingBalance, 100)
    assert.isNull(body.statement.data)
    assert.equal(body.statement.credits, mode === 'clear' ? 0 : 10)
    assert.equal(body.statement.debits, -4)
    assert.equal(body.transaction.version, 1)
    assert.equal(body.transaction.accountTransaction.name, 'Updated')
    assert.equal(body.transaction.accountTransaction.statementId, data.statementId)
    assert.deepEqual(body.categories, [])
    assert.deepEqual(body.acctBalances, [{ id: data.account.id, balance: 100 }])
    const persisted = await data.account.related('accountTransactions').query().where('id', data.association.id).firstOrFail()
    assert.equal(persisted.statementId, data.statementId)
    console.log(JSON.stringify({ scenario: mode, events, statement: body.statement, transaction: body.transaction }))
  })

  test('production Statement query failure rolls back all update effects before propagation', async ({ client, assert, cleanup }) => {
    const data = await fixture('assign')
    const before = (await Transaction.findOrFail(data.transaction.id)).serialize()
    const beforeCategory = (await Category.findOrFail(data.category.id)).serialize()
    const beforeLogs = (await data.transaction.related('transactionLog').query()).map((log) => log.serialize())
    const failure = new Error('Injected active-transaction Statement dependency failure')
    const acquire = db.transaction.bind(db)
    let captured: TransactionClientContract | undefined
    let commitCalls = 0
    const events: string[] = []
    const capture = mock.method(db, 'transaction', async () => {
      const trx = await acquire(); captured = trx
      const rollback = trx.rollback.bind(trx)
      mock.method(trx, 'rollback', async () => {
        events.push('rollback began')
        await rollback()
        assert.isTrue(trx.isCompleted)
        events.push('rollback completed')
      })
      const commit = trx.commit.bind(trx)
      mock.method(trx, 'commit', async () => { commitCalls++; await commit() })
      return trx
    })
    cleanup(() => capture.mock.restore())
    const related = Account.prototype.related
    const injection = mock.method(Account.prototype, 'related', function (this: Account, ...args: Parameters<typeof related>) {
      if (this.id === data.account.id && args[0] === 'statements') {
        assert.strictEqual(this.$trx, captured)
        assert.isFalse(captured?.isCompleted)
        events.push('Statement response preparation attempted')
        events.push('failure')
        throw failure
      }
      return related.apply(this, args)
    })
    cleanup(() => injection.mock.restore())
    const handled: unknown[] = []
    const handle = Handler.prototype.handle
    const observer = mock.method(Handler.prototype, 'handle', async function (this: Handler, ...args: Parameters<typeof handle>) {
      assert.isTrue(captured?.isCompleted)
      events.push('global handler received error')
      handled.push(args[0]); return handle.apply(this, args)
    })
    cleanup(() => observer.mock.restore())
    const response = await client.patch(`/api/v1/transaction/${data.transaction.id}`).json({ version: 0,
      name: 'Updated', amount: 20, categories: [{ categoryId: data.category.id, amount: 20 }], statementId: data.statementId }).accept('json').loginAs(data.user)
    response.assertStatus(500)
    assert.equal(commitCalls, 0)
    assert.isTrue(captured?.isCompleted)
    assert.include(handled, failure)
    assert.deepEqual((await Transaction.findOrFail(data.transaction.id)).serialize(), before)
    const persisted = await data.account.related('accountTransactions').query().where('id', data.association.id).firstOrFail()
    assert.equal(persisted.name, 'Original')
    assert.isNull(persisted.statementId)
    assert.equal((await Account.findOrFail(data.account.id)).balance, 100)
    assert.deepEqual((await data.transaction.related('transactionLog').query()).map((log) => log.serialize()), beforeLogs)
    assert.deepEqual((await Category.findOrFail(data.category.id)).serialize(), beforeCategory)
    assert.deepEqual(events, ['Statement response preparation attempted', 'failure', 'rollback began', 'rollback completed', 'global handler received error'])
    console.log(JSON.stringify({ scenario: 'production preparation failure', events,
      status: response.status(), originalErrorReachedHandler: handled.includes(failure) }))
  })
})
