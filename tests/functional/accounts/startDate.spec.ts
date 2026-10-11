import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Category from '#models/Category'
import Statement from '#models/Statement'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `start-date-${++sequence}`, email: `start-date-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Start-date bank' })
    const account = await institution.related('accounts').create({
      name: 'Start-date account', balance: 100, type: AccountType.Investment, subtype: 'IRA',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    return { budget, user, account }
  })
}

test.group('Account start-date characterization', () => {
  test('boundary movement preserves current balance and ordinary transaction identity')
    .with([TrackingType.Transactions]).run(async ({ client, assert }, tracking) => {
      const f = await createFixture()
      await f.account.merge({ tracking }).save()
      const funding = await f.budget.getFundingPoolCategory()
      const unassigned = await f.budget.getUnassignedCategory()
      const group = await f.budget.related('groups').create({ name: 'Boundary group', type: 'Regular' })
      const category = await group.related('categories').create({
        name: 'Boundary category', type: CategoryType.Regular, balance: 0, fundingCategories: [],
      })
      const movements = [
        { date: '2024-12-31', amount: 20, categories: [{ categoryId: category.id, amount: 20 }] },
        { date: '2025-01-01', amount: 10.25, categories: [{ categoryId: category.id, amount: 10.25 }] },
        { date: '2025-01-15', amount: -3.15, categories: [{ categoryId: category.id, amount: -1.1 }, { categoryId: unassigned.id, amount: -2.05 }] },
        { date: '2025-01-20', amount: 2.35, categories: [] },
        { date: '2025-02-01', amount: 7.05, categories: [{ categoryId: category.id, amount: 7.05 }] },
        { date: '2025-03-01', amount: 0, categories: [{ categoryId: unassigned.id, amount: 0 }] },
      ]
      const ids: number[] = []
      for (const movement of movements) {
        const transaction = await f.budget.related('transactions').create({
          date: DateTime.fromISO(movement.date), type: TransactionType.MANUAL_TRANSACTION,
          version: 0, deleted: false, sortOrder: 0, categories: movement.categories, taxes: [],
        })
        ids.push(transaction.id)
        await f.account.related('accountTransactions').create({
          transactionId: transaction.id, amount: movement.amount, name: 'Boundary movement',
          pending: false, provider: 'NONE', statementId: null,
        })
      }
      // Seed existing allocations consistently with the original inclusive boundary.
      await category.merge({ balance: tracking === TrackingType.Transactions ? 16.2 : 0 }).save()
      await unassigned.merge({ balance: tracking === TrackingType.Transactions ? 0.3 : 0 }).save()
      let initialId: number | undefined
      const originals = await db.from('transactions').whereIn('id', ids).orderBy('id')
      const rows = await db.from('account_transactions').whereIn('transaction_id', ids).orderBy('id')
      for (const date of ['2025-01-01', '2025-02-01', '2025-02-01', '2025-01-01', '2025-02-01', '2025-01-01']) {
        const response = await client.patch(`/api/v1/account/${f.account.id}`)
          .json({ startDate: date }).accept('json').loginAs(f.user)
        response.assertStatus(200)
        const account = await Account.findOrFail(f.account.id)
        assert.equal(account.startDate.toISODate(), date)
        assert.equal(account.balance, 100)
        assert.deepEqual(await db.from('transactions').whereIn('id', ids).orderBy('id'), originals)
        assert.deepEqual(await db.from('account_transactions').whereIn('transaction_id', ids).orderBy('id'), rows)
        const initial = await Transaction.query().where('budgetId', f.budget.id).where('type', TransactionType.STARTING_BALANCE).firstOrFail()
        const initialRow = await AccountTransaction.findByOrFail('transactionId', initial.id)
        if (initialId === undefined) initialId = initial.id
        assert.equal(initial.id, initialId)
        assert.equal((await Category.findOrFail(category.id)).balance, date === '2025-01-01' ? 16.2 : 7.05)
        assert.equal((await Category.findOrFail(unassigned.id)).balance, date === '2025-01-01' ? 0.3 : 0)
        assert.equal(initial.date.toISODate(), date)
        const applicableCents = movements.filter((movement) => movement.date >= date)
          .reduce((sum, movement) => sum + Math.round(movement.amount * 100), 0)
        assert.equal(Math.round(initialRow.amount * 100), 10000 - applicableCents)
        assert.equal(Math.round(initial.categories[0].amount * 100), 10000 - applicableCents)
        assert.equal(Math.round((await Category.findOrFail(funding.id)).balance * 100), 10000 - applicableCents)
        if (tracking === TrackingType.Transactions) {
          const balances = await Category.query().whereIn('id', [funding.id, category.id, unassigned.id])
          const totalCents = balances.reduce((sum, item) => sum + Math.round(item.balance * 100), 0)
          // Crossing allocations and Initial Funding must conserve the preserved account balance.
          assert.equal(totalCents, 10000)
        }
        const visible = await category.transactions(f.budget)
        assert.sameMembers(visible.map((transaction) => transaction.id), tracking === TrackingType.Transactions
          ? ids.filter((_id, index) => movements[index].date >= date && movements[index].categories.some((split) => split.categoryId === category.id && split.amount !== 0)) : [])
      }
    })
  test('late account-save failure rolls back all financial writes and rejects the request', async ({ client, assert }) => {
    const f = await createFixture()
    await db.transaction(async (trx) => {
      f.account.useTransaction(trx)
      const unassigned = await f.budget.getUnassignedCategory({ client: trx })
      unassigned.balance = 10
      await unassigned.save()
      const transaction = await f.budget.related('transactions').create({
        date: DateTime.fromISO('2025-01-15'), type: TransactionType.MANUAL_TRANSACTION,
        categories: [{ categoryId: unassigned.id, amount: 10 }], taxes: [], version: 0, sortOrder: 0, deleted: false,
      }, { client: trx })
      await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 10, name: 'Crossing allocation', pending: false, provider: 'NONE' })
      const funding = await f.budget.getFundingPoolCategory({ client: trx })
      await f.account.updateStartingBalance(f.budget, funding)
      await funding.save()
    })
    const snapshot = () => Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'),
    ])
    const before = await snapshot()
    await db.rawQuery(`ALTER TABLE accounts ADD CONSTRAINT start_date_test_failure CHECK (id <> ${f.account.id} OR start_date <> '2025-02-01') NOT VALID`)
    try {
      const response = await client.patch(`/api/v1/account/${f.account.id}`)
        .json({ startDate: '2025-02-01' }).accept('json').loginAs(f.user)
      response.assertStatus(500)
      assert.deepEqual(await snapshot(), before)
    } finally {
      await db.rawQuery('ALTER TABLE accounts DROP CONSTRAINT start_date_test_failure')
    }
  })

  test('start-date mutation no longer invokes post-commit generic synchronization', async ({ client, assert }) => {
    const f = await createFixture()
    const original = Budget.prototype.syncCategoryBalances
    Budget.prototype.syncCategoryBalances = async function () { throw new Error('Injected post-commit synchronization failure') }
    try {
      const response = await client.patch(`/api/v1/account/${f.account.id}`)
        .json({ startDate: '2025-02-01' }).accept('json').loginAs(f.user)
      response.assertStatus(200)
      assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), '2025-02-01')
      const initial = await Transaction.query().where('budgetId', f.budget.id).where('type', TransactionType.STARTING_BALANCE).firstOrFail()
      assert.equal(initial.date.toISODate(), '2025-02-01')
      assert.equal((await AccountTransaction.findByOrFail('transactionId', initial.id)).amount, 100)
    } finally {
      Budget.prototype.syncCategoryBalances = original
    }
  })

  test('valid balance-tracked account updates its date without transactions or budget effects', async ({ client, assert }) => {
    const f = await createFixture()
    await f.account.merge({ tracking: TrackingType.Balances }).save()
    const statement = await f.account.related('statements').create({
      startDate: DateTime.fromISO('2025-01-01'), endDate: DateTime.fromISO('2025-01-31'), startingBalance: 0, endingBalance: 100, data: null,
    })
    const categories = await db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
      .where('groups.application_id', f.budget.id).orderBy('categories.id')
    for (const startDate of ['2025-02-01', '2025-01-01']) {
      const response = await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate }).accept('json').loginAs(f.user)
      response.assertStatus(200)
      assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
      assert.equal((await Account.findOrFail(f.account.id)).startDate.toISODate(), startDate)
      assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 0)
      assert.lengthOf(await AccountTransaction.query().where('accountId', f.account.id), 0)
      assert.equal((await Statement.findOrFail(statement.id)).endingBalance, 100)
      assert.deepEqual(await db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'), categories)
    }
  })

  test('historical invalid balance-tracked transaction data is preserved without new Initial Funding', async ({ client, assert }) => {
    const f = await createFixture()
    await f.account.merge({ tracking: TrackingType.Balances }).save()
    const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO('2025-01-15'), type: TransactionType.MANUAL_TRANSACTION, categories: [], taxes: [], version: 0, sortOrder: 0, deleted: false })
    await f.account.related('accountTransactions').create({ transactionId: transaction.id, amount: 10, name: 'Invalid historical state', pending: false, provider: 'NONE' })
    const response = await client.patch(`/api/v1/account/${f.account.id}`).json({ startDate: '2025-02-01' }).accept('json').loginAs(f.user)
    response.assertStatus(200)
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 1)
    assert.equal((await AccountTransaction.findByOrFail('transactionId', transaction.id)).amount, 10)
    assert.equal((await Account.findOrFail(f.account.id)).balance, 100)
  })

})
