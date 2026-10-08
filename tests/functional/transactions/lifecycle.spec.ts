import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import AccountTransaction from '#models/AccountTransaction'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `lifecycle-${++sequence}`, email: `lifecycle-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Lifecycle bank' })
    const account = await institution.related('accounts').create({
      name: 'Lifecycle account', balance: 110, type: AccountType.Depository, subtype: 'checking',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: 'Lifecycle group', type: 'Regular' })
    const first = await group.related('categories').create({ name: 'First', type: CategoryType.Regular, balance: 10, fundingCategories: [] })
    const second = await group.related('categories').create({ name: 'Second', type: CategoryType.Regular, balance: 0, fundingCategories: [] })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, categories: [{ categoryId: first.id, amount: 10 }], taxes: [],
    })
    const accountTransaction = await account.related('accountTransactions').create({
      transactionId: transaction.id, name: 'Original purchase', amount: 10, pending: false, provider: 'NONE', statementId: null,
    })
    return { budget, user, account, first, second, transaction, accountTransaction }
  })
}

test.group('Ordinary transaction lifecycle', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function snapshot() {
    return Promise.all([
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('accounts').where('id', fixture.account.id),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', fixture.budget.id).orderBy('categories.id'),
      db.from('statements').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
    ])
  }

  test('creation applies signed one-category/multi-split amounts').with(['single', 'multiple', 'negative', 'zero']).run(async ({ client, assert }, scenario) => {
    const amount = scenario === 'negative' ? -20 : scenario === 'zero' ? 0 : 20
    const categories = scenario === 'multiple'
      ? [{ categoryId: fixture.first.id, amount: 7 }, { categoryId: fixture.second.id, amount: 13 }]
      : [{ categoryId: fixture.first.id, amount }]
    const response = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json({ date: '2025-03-01', name: 'Created purchase', amount, categories }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().transaction.id)
    const accountTransaction = await AccountTransaction.findByOrFail('transactionId', transaction.id)
    assert.deepEqual(transaction.categories, categories)
    assert.equal(accountTransaction.amount, amount)
    assert.equal(accountTransaction.accountId, fixture.account.id)
    assert.equal(transaction.budgetId, fixture.budget.id)
    assert.equal((await Account.findOrFail(fixture.account.id)).balance, 110 + amount)
    assert.equal((await Category.findOrFail(fixture.first.id)).balance, 10 + categories[0].amount)
    assert.equal((await Category.findOrFail(fixture.second.id)).balance, scenario === 'multiple' ? 13 : 0)
  })

  test('updates reverse old splits and apply replacement state').with(['amount', 'category', 'single-to-multiple', 'multiple-to-single', 'metadata', 'date']).run(async ({ client, assert }, scenario) => {
    if (scenario === 'multiple-to-single') {
      await fixture.transaction.merge({ categories: [{ categoryId: fixture.first.id, amount: 4 }, { categoryId: fixture.second.id, amount: 6 }] }).save()
      await fixture.first.merge({ balance: 4 }).save()
      await fixture.second.merge({ balance: 6 }).save()
    }
    const amount = scenario === 'amount' ? 25 : 10
    const categories = scenario === 'category' || scenario === 'multiple-to-single'
      ? [{ categoryId: fixture.second.id, amount }]
      : scenario === 'single-to-multiple'
        ? [{ categoryId: fixture.first.id, amount: 4 }, { categoryId: fixture.second.id, amount: 6 }]
        : [{ categoryId: fixture.first.id, amount }]
    const payload = scenario === 'metadata' ? { name: 'New payee', comment: 'New description' }
      : scenario === 'date' ? { date: '2025-03-01' } : { amount, categories }
    const response = await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
      .json({ version: 0, ...payload }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(fixture.transaction.id)
    const accountTransaction = await AccountTransaction.findOrFail(fixture.accountTransaction.id)
    assert.equal(transaction.version, 1)
    assert.deepEqual(transaction.categories, categories)
    assert.equal(accountTransaction.amount, amount)
    assert.equal((await Account.findOrFail(fixture.account.id)).balance, 100 + amount)
    assert.equal((await Category.findOrFail(fixture.first.id)).balance, categories.filter((c) => c.categoryId === fixture.first.id).reduce((sum, c) => sum + c.amount, 0))
    assert.equal((await Category.findOrFail(fixture.second.id)).balance, categories.filter((c) => c.categoryId === fixture.second.id).reduce((sum, c) => sum + c.amount, 0))
    if (scenario === 'date') assert.equal(transaction.date.toISODate(), '2025-03-01')
    if (scenario === 'metadata') {
      assert.equal(accountTransaction.name, 'New payee')
      assert.equal(transaction.comment, 'New description')
    }
    assert.lengthOf(await db.from('transaction_logs').where('transaction_id', transaction.id), 1)
  })

  test('deletion reverses ordinary financial effects without destroying linkage', async ({ client, assert }) => {
    const response = await client.delete(`/api/v1/transaction/${fixture.transaction.id}`).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.isTrue((await Transaction.findOrFail(fixture.transaction.id)).deleted)
    assert.equal((await Account.findOrFail(fixture.account.id)).balance, 100)
    assert.equal((await Category.findOrFail(fixture.first.id)).balance, 0)
    assert.equal((await AccountTransaction.findOrFail(fixture.accountTransaction.id)).transactionId, fixture.transaction.id)
  })

  test('deleted transactions cannot apply financial effects again').with(['delete', 'update']).run(async ({ client, assert }, operation) => {
    const url = `/api/v1/transaction/${fixture.transaction.id}`
    const deleted = await client.delete(url).accept('json').loginAs(fixture.user)
    deleted.assertStatus(200)
    const before = await snapshot()
    const response = operation === 'delete'
      ? await client.delete(url).accept('json').loginAs(fixture.user)
      : await client.patch(url).json({ version: 0, amount: 25,
        categories: [{ categoryId: fixture.second.id, amount: 25 }] }).accept('json').loginAs(fixture.user)
    assert.deepEqual(await snapshot(), before)
    response.assertStatus(404)
  })

  test('late persistence failure rolls back the entire mutation').with(['create', 'update', 'delete']).run(async ({ client, assert }, operation) => {
    const before = await snapshot()
    const constraint = operation === 'create'
      ? "CHECK (balance <> 30) NOT VALID" : operation === 'update'
        ? "CHECK (version <> 1) NOT VALID" : "CHECK (deleted = false) NOT VALID"
    const table = operation === 'create' ? 'categories' : 'transactions'
    await db.rawQuery(`ALTER TABLE ${table} ADD CONSTRAINT lifecycle_test_failure ${constraint}`)
    const pendingWrites = new Set<string>()
    const startedWrites: string[] = []
    const lateWrites: string[] = []
    const unhandledErrors: unknown[] = []
    let requestCompleted = false
    const connection = db.connection().getWriteClient()
    const isFinancialWrite = (sql: string) => /^update "(categories|accounts|transactions)"/.test(sql)
    const started = (query: { sql: string }) => {
      if (isFinancialWrite(query.sql)) {
        startedWrites.push(query.sql)
        pendingWrites.add(query.sql)
        if (requestCompleted) lateWrites.push(query.sql)
      }
    }
    const completed = (_result: unknown, query: { sql: string }) => { pendingWrites.delete(query.sql) }
    const rejected = (reason: unknown) => { unhandledErrors.push(reason) }
    connection.on('query', started)
    connection.on('query-response', completed)
    connection.on('query-error', completed)
    process.on('unhandledRejection', rejected)
    try {
      const response = operation === 'create'
        ? await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
          .json({ date: '2025-03-01', name: 'Rejected purchase', amount: 20,
            categories: [{ categoryId: fixture.first.id, amount: 20 }] }).accept('json').loginAs(fixture.user)
        : operation === 'update'
          ? await client.patch(`/api/v1/transaction/${fixture.transaction.id}`)
            .json({ version: 0, amount: 25, categories: [{ categoryId: fixture.second.id, amount: 25 }] }).accept('json').loginAs(fixture.user)
          : await client.delete(`/api/v1/transaction/${fixture.transaction.id}`).accept('json').loginAs(fixture.user)
      requestCompleted = true
      response.assertStatus(500)
      assert.equal(pendingWrites.size, 0, 'financial writes must finish before the response')
      if (operation === 'delete') {
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "categories"')))
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "accounts"')))
        assert.isTrue(startedWrites.some((sql) => sql.startsWith('update "transactions"')))
      }
      assert.deepEqual(await snapshot(), before)
      // Let queued promise callbacks and rejection notifications run, without a timed sleep.
      await new Promise<void>((resolve) => setImmediate(resolve))
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(lateWrites, [], 'no financial write may start after the response')
      assert.deepEqual(unhandledErrors, [], 'no detached persistence rejection may follow rollback')
    } finally {
      connection.off('query', started)
      connection.off('query-response', completed)
      connection.off('query-error', completed)
      process.off('unhandledRejection', rejected)
      await db.rawQuery(`ALTER TABLE ${table} DROP CONSTRAINT lifecycle_test_failure`)
    }
  })
})
