import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { transactionRequest } from '../../helpers/transactionRequest.js'
import { writeCanonicalTransactionFixture } from '../../helpers/historicalTransactionFixture.js'
// Prepared only. Requires fresh task-specific DB authorization and the accepted
// configured/live pg + pgLog + execution-connection safeguards in test bootstrap.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Account from '#models/Account'
import AccountTransaction from '#models/AccountTransaction'
import Transaction from '#models/Transaction'
import Category from '#models/Category'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `eligibility-${++sequence}`,
      email: `eligibility-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Eligibility' })
    const account = await institution.related('accounts').create({ name: 'Eligibility',
      balanceCents: parseMoneyCents('100.00'),
      type: AccountType.Depository, subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-02-01'), rate: 0, closed: false })
    const group = await budget.related('groups').create({ name: 'Eligibility', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Eligibility',
      type: CategoryType.Regular,
      balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    return { budget, user, account, category }
  })
}
const dates = ['2025-01-31', '2025-02-01', '2025-02-02']
const cases = dates.flatMap((date) => [-10, 0, 10].map((amount) => ({ date, amount })))
test.group('Account/Category eligibility correction (prepared)', () => {
  test('manual CREATE persists nominal state and independently gates effects').with(cases).run(
    async ({ client, assert }, { date, amount }) => {
    const f = await fixture()
    const pool = await f.budget.getFundingPoolCategory()
    const poolBefore = Number(formatMoneyCents(pool.balanceCents))
    const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
      transactionRequest({
      date, amount, name: 'Boundary create', categories: [{ categoryId: f.category.id, amount }],
    })).loginAs(f.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().transaction.id)
    const link = await AccountTransaction.findByOrFail('transactionId', transaction.id)
    assert.equal(link.amount, amount)
    assert.deepEqual(transaction.categories, [{ categoryId: f.category.id, amount }])
    const raw = await db.from('accounts').where('id', f.account.id).firstOrFail()
    assert.equal(Number(raw.balance), 100 + (date >= dates[1] ? amount : 0))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(date >= dates[1] ? amount : 0)))
    assert.equal((await Category.findOrFail(pool.id)).balanceCents, parseMoneyCents(
      encodeMonetaryAmount(poolBefore)))
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id).where('type',
      TransactionType.STARTING_BALANCE), 0)
  })

  test('PATCH date crossings include pending Category effects and preserve nominal state')
    .with([false, true]).run(async ({ client, assert }, pending) => {
      const f = await fixture()
      const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO(
        dates[0]),
        type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: f.category.id,
          amount: -10 }],
        version: 0, deleted: false, sortOrder: 0, taxes: [] })
      await writeCanonicalTransactionFixture(transaction)
      const link = await f.account.related('accountTransactions').create({
        transactionId: transaction.id,
        name: 'Crossing', amount: -10, pending, provider: 'NONE' })
      for (const [version, date] of [dates[1], dates[2], dates[0]].entries()) {
        const response = await client.patch(`/api/v1/transaction/${transaction.id}`).json(
          transactionRequest({ version, date })).loginAs(f.user)
        response.assertStatus(200)
        assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
          encodeMonetaryAmount(100 + (date >= dates[1] &&
          !pending ? -10 : 0))))
        assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
          encodeMonetaryAmount(date >= dates[1] ? -10 : 0)))
        assert.equal((await AccountTransaction.findOrFail(link.id)).amount, -10)
      }
    })

  test('PATCH ineligible nominal replacement, duplicate IDs, and metadata noninterference', async ({
    client, assert }) => {
    const f = await fixture()
    const created = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
      transactionRequest({
      date: dates[0], amount: 10, name: 'Before', categories: [{ categoryId: f.category.id,
        amount: 10 }],
    })).loginAs(f.user)
    created.assertStatus(200)
    const id: number = created.body().transaction.id
    const categories = [{ categoryId: f.category.id, amount: 7 }, { categoryId: f.category.id,
      amount: 13 }]
    const replacement = await client.patch(`/api/v1/transaction/${id}`).json(transactionRequest({
      version: 0, amount: 20, categories })).loginAs(f.user)
    replacement.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('100.00'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('0.00'))
    const crossing = await client.patch(`/api/v1/transaction/${id}`).json(transactionRequest({
      version: 1, date: dates[1] })).loginAs(f.user)
    crossing.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('120.00'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('20.00'))
    assert.deepEqual((await Transaction.findOrFail(id)).categories, categories)
    const metadata = await client.patch(`/api/v1/transaction/${id}`).json(transactionRequest({
      version: 2, name: 'Renamed', comment: 'Only metadata', statementId: null })).loginAs(f.user)
    metadata.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('120.00'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('20.00'))
  })
})

test.group('Additional PATCH effect isolation (prepared)', () => {
  test('provider-linked nonconserving amount-only PATCH rejects without changing allocations',
    async ({ client, assert }) => {
    const f = await fixture()
    const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO(
      dates[1]),
      type: TransactionType.REGULAR_TRANSACTION, categories: [{ categoryId: f.category.id,
        amount: 10 }],
      version: 0, deleted: false, sortOrder: 0, taxes: [] })
    await writeCanonicalTransactionFixture(transaction)
    await f.account.related('accountTransactions').create({ transactionId: transaction.id,
      amount: 10, name: 'Imported', pending: false, provider: 'OFX' })
    await f.account.merge({ balanceCents: parseMoneyCents('110.00') }).save()
    await f.category.merge({ balanceCents: parseMoneyCents('10.00') }).save()
    const response = await client.patch(`/api/v1/transaction/${transaction.id}`).json(
      transactionRequest({ version: 0, amount: 20 })).loginAs(f.user)
    response.assertStatus(422)
    assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('110.00'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('10.00'))
    assert.deepEqual((await Transaction.findOrFail(transaction.id)).categories, [{ categoryId: f
      .category.id, amount: 10 }])
  })

  test('late transaction failure rolls back Account, Category and nominal PATCH state', async ({
    client, assert }) => {
    const f = await fixture()
    const created = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
      transactionRequest({
      date: dates[0], amount: 10, name: 'Late rollback', categories: [{ categoryId: f.category.id,
        amount: 10 }],
    })).loginAs(f.user)
    created.assertStatus(200)
    const id: number = created.body().transaction.id
    const snapshot = () => Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', f.budget.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id',
        'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'),
    ])
    const before = await snapshot()
    const original = Transaction.prototype.save
    Transaction.prototype.save = async function () {
      if (this.id === id && this.version === 1) throw new Error('Injected late eligibility failure')
      return original.call(this)
    }
    try {
      const response = await client.patch(`/api/v1/transaction/${id}`).json(transactionRequest({
        version: 0, date: dates[1],
        amount: 20, categories: [{ categoryId: f.category.id, amount: 20 }] })).loginAs(f.user)
      response.assertStatus(500)
      assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('100.00'))
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('0.00'))
      assert.deepEqual(await snapshot(), before)
      assert.equal((await AccountTransaction.findByOrFail('transactionId', id)).amount, 10)
    } finally { Transaction.prototype.save = original }
  })
})

test.group('Eligibility verification edge cases', () => {
  test('amount-only/categories-only PATCH independently respects the boundary')
    .with(dates.flatMap((date) => ['amount', 'categories'].map((field) => ({ date, field }))))
    .run(async ({ client, assert }, { date, field }) => {
      const f = await fixture()
      const unassigned = await f.budget.getUnassignedCategory()
      const eligible = date >= dates[1]
      const transaction = await f.budget.related('transactions').create({ date: DateTime.fromISO(
        date),
        type: TransactionType.REGULAR_TRANSACTION, categories: [{ categoryId: f.category.id,
          amount: 10 }],
        version: 0, deleted: false, sortOrder: 0, taxes: [] })
      await writeCanonicalTransactionFixture(transaction)
      await f.account.related('accountTransactions').create({ transactionId: transaction.id,
        amount: 10, name: 'Partial edit', pending: false, provider: 'OFX' })
      await f.account.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        eligible ? 110 : 100)) }).save()
      await f.category.merge({ balanceCents: parseMoneyCents(encodeMonetaryAmount(
        eligible ? 10 : 0)) }).save()
      const response = await client.patch(`/api/v1/transaction/${transaction.id}`).json(
        transactionRequest({ version: 0,
        ...(field === 'amount' ? { amount: 20 } : { categories: [{ categoryId: unassigned.id,
          amount: 10 }] }),
      })).loginAs(f.user)
      if (field === 'amount') {
        response.assertStatus(422)
        assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
          encodeMonetaryAmount(eligible ? 110 : 100)))
        assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
          encodeMonetaryAmount(eligible ? 10 : 0)))
        assert.equal((await AccountTransaction.findByOrFail('transactionId', transaction.id))
          .amount, 10)
        return
      }
      response.assertStatus(200)
      assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(eligible ? 110 : 100)))
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(eligible && field ===
        'amount' ? 10 : 0)))
      assert.equal((await Category.findOrFail(unassigned.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(eligible && field ===
        'categories' ? 10 : 0)))
    })

  test('combined date/amount/allocation replacement applies just the final old/new effects')
    .with([true, false]).run(async ({ client, assert }, entering) => {
      const f = await fixture()
      const created = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
        transactionRequest({
        date: entering ? dates[0] : dates[1], name: 'Combined edit', amount: 10,
        categories: [{ categoryId: f.category.id, amount: 10 }],
      })).loginAs(f.user)
      created.assertStatus(200)
      const unassigned = await f.budget.getUnassignedCategory()
      const response = await client.patch(`/api/v1/transaction/${created.body().transaction.id}`)
        .json(transactionRequest({ version: 0,
        date: entering ? dates[1] : dates[0], amount: -20,
        categories: [{ categoryId: unassigned.id, amount: -20 }],
      })).loginAs(f.user)
      response.assertStatus(200)
      assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(entering ? 80 : 100)))
      assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents('0.00'))
      assert.equal((await Category.findOrFail(unassigned.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(entering ? -20 : 0)))
    })

  test('unrelated forward operation does not repair historically inconsistent allocations', async ({
    client, assert }) => {
    const f = await fixture()
    const old = await f.budget.related('transactions').create({ date: DateTime.fromISO(dates[0]),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: f.category.id,
        amount: 10 }],
      version: 0, deleted: false, sortOrder: 0, taxes: [] })
    await writeCanonicalTransactionFixture(old)
    await f.account.related('accountTransactions').create({ transactionId: old.id,
      name: 'Old inconsistent effect', amount: 10, pending: false, provider: 'NONE' })
    await f.category.merge({ balanceCents: parseMoneyCents('999.00') }).save()
    const oldState = await db.from('transactions').where('id', old.id).firstOrFail()
    const response = await client.post(`/api/v1/account/${f.account.id}/transactions`).json(
      transactionRequest({
      date: dates[1], name: 'Unrelated forward event', amount: 5, categories: [{ categoryId: f
        .category.id, amount: 5 }],
    })).loginAs(f.user)
    response.assertStatus(200)
    assert.equal((await Account.findOrFail(f.account.id)).balanceCents, parseMoneyCents('105.00'))
    assert.equal((await Category.findOrFail(f.category.id)).balanceCents, parseMoneyCents(
      '1004.00'))
    assert.deepEqual(await db.from('transactions').where('id', old.id).firstOrFail(), oldState)
  })
})
