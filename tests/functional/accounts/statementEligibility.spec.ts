import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Transaction from '#models/Transaction'
import AccountTransaction from '#models/AccountTransaction'
import Statement from '#models/Statement'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
const period = { startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 130 }

async function createFixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({
      username: `eligibility-${++sequence}`, email: `eligibility-${sequence}@example.com`, password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: 'Eligibility bank' })
    const account = await institution.related('accounts').create({
      name: 'Eligibility account', balance: 100, type: AccountType.Depository, subtype: 'checking',
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    return { budget, user, account }
  })
}

test.group('Statement transaction eligibility', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  async function createTransaction(client: ApiClient, amount: number, date = '2025-02-10') {
    const response = await client.post(`/api/v1/account/${fixture.account.id}/transactions`)
      .json({ date, name: 'Eligibility movement', amount, categories: [] }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(response.body().transaction.id)
    const row = await AccountTransaction.findByOrFail('transactionId', transaction.id)
    return { transaction, row }
  }

  async function createStatement(client: ApiClient) {
    const response = await client.post(`/api/v1/account/${fixture.account.id}/statements`)
      .json(period).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    return { response, statement: await Statement.findOrFail(response.body().id) }
  }

  async function totals(client: ApiClient, id: number) {
    const response = await client.get(`/api/v1/account/${fixture.account.id}/statements`).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    return response.body().find((row: { id: number }) => row.id === id)
  }

  async function register(client: ApiClient, pending = false): Promise<number[]> {
    const response = await client.get(`/api/v1/account/${fixture.account.id}/transactions`)
      .qs({ limit: 50, offset: 0, pending }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    return response.body().data.transactions.map((row: { id: number }) => row.id)
  }

  async function state() {
    return Promise.all([
      db.from('accounts').where('id', fixture.account.id),
      db.from('transactions').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('account_transactions').where('account_id', fixture.account.id).orderBy('id'),
      db.from('transaction_logs').where('application_id', fixture.budget.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .where('groups.application_id', fixture.budget.id).orderBy('categories.id'),
    ])
  }

  test('creation excludes normally soft-deleted credits/debits').with([90, -90]).run(async ({ client, assert }, amount) => {
    const credit = await createTransaction(client, 40, period.startDate)
    const debit = await createTransaction(client, -10, period.endDate)
    const deleted = await createTransaction(client, amount)
    const removal = await client.delete(`/api/v1/transaction/${deleted.transaction.id}`).accept('json').loginAs(fixture.user)
    removal.assertStatus(200)
    assert.isTrue((await Transaction.findOrFail(deleted.transaction.id)).deleted)
    const before = await state()
    const { response, statement } = await createStatement(client)
    const listed = await totals(client, statement.id)
    assert.equal(listed.credits, 40)
    assert.equal(listed.debits, -10)
    assert.equal(listed.startingBalance + listed.credits + listed.debits, 130)
    assert.sameMembers(await register(client), [credit.transaction.id, debit.transaction.id])
    const after = await state()
    assert.deepEqual([after[0], after[1], after[3], after[4]], [before[0], before[1], before[3], before[4]])
    assert.equal((await AccountTransaction.findOrFail(credit.row.id)).statementId, statement.id)
    assert.equal((await AccountTransaction.findOrFail(debit.row.id)).statementId, statement.id)
    assert.deepEqual(after[2].find((row) => row.id === deleted.row.id), before[2].find((row) => row.id === deleted.row.id))
    assert.isNull((await AccountTransaction.findOrFail(deleted.row.id)).statementId)
    assert.equal(response.body().credits, 40)
    assert.equal(response.body().debits, -10)
    assert.equal(response.body().startingBalance + response.body().credits + response.body().debits, 130)
    const reconciled = await client.patch(`/api/v1/statements/${statement.id}`).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user)
    reconciled.assertStatus(200)
    assert.isNull((await AccountTransaction.findOrFail(deleted.row.id)).statementId)
    assert.equal(reconciled.body().credits, 40)
    assert.equal(reconciled.body().debits, -10)
  })

  test('a period containing only deleted transactions has zero create/list totals', async ({ client, assert }) => {
    const deleted = await createTransaction(client, 90)
    const removal = await client.delete(`/api/v1/transaction/${deleted.transaction.id}`).accept('json').loginAs(fixture.user)
    removal.assertStatus(200)
    const before = await state()
    const { response, statement } = await createStatement(client)
    const listed = await totals(client, statement.id)
    assert.equal(listed.credits, 0)
    assert.equal(listed.debits, 0)
    assert.deepEqual(await state(), before)
    assert.equal(response.body().credits, 0)
    assert.equal(response.body().debits, 0)
  })

  test('soft deletion preserves an existing link but removes its accounting contribution', async ({ client, assert }) => {
    const active = await createTransaction(client, 40)
    const deleted = await createTransaction(client, -10)
    const { statement } = await createStatement(client)
    const removal = await client.delete(`/api/v1/transaction/${deleted.transaction.id}`).accept('json').loginAs(fixture.user)
    removal.assertStatus(200)
    assert.isTrue((await Transaction.findOrFail(deleted.transaction.id)).deleted)
    assert.equal((await AccountTransaction.findOrFail(deleted.row.id)).statementId, statement.id)
    const listed = await totals(client, statement.id)
    assert.equal(listed.credits, 40)
    assert.equal(listed.debits, 0)
    assert.equal(listed.startingBalance + listed.credits + listed.debits, 140)
    assert.sameMembers(await register(client), [active.transaction.id])
    const before = await state()
    const response = await client.patch(`/api/v1/statements/${statement.id}`).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.deepEqual(await state(), before)
    assert.equal(response.body().credits, 40)
    assert.equal(response.body().debits, 0)
  })

  test('creation includes assigned pending amounts and posting preserves their links/totals', async ({ client, assert }) => {
    const active = await createTransaction(client, 40)
    const pending = await createTransaction(client, -10)
    // Isolate statement eligibility from the separate provider matching/financial lifecycle.
    await pending.row.merge({ pending: true }).save()
    const { response, statement } = await createStatement(client)
    assert.equal((await AccountTransaction.findOrFail(pending.row.id)).statementId, statement.id)
    assert.equal(response.body().credits, 40)
    assert.equal(response.body().debits, -10)
    const listed = await totals(client, statement.id)
    assert.equal(listed.credits, 40)
    assert.equal(listed.debits, -10)
    assert.sameMembers(await register(client), [active.transaction.id])
    assert.sameMembers(await register(client, true), [pending.transaction.id])
    await pending.row.refresh()
    await pending.row.merge({ pending: false }).save()
    assert.sameMembers(await register(client), [active.transaction.id, pending.transaction.id])
    assert.sameMembers(await register(client, true), [])
    assert.equal((await AccountTransaction.findOrFail(pending.row.id)).statementId, statement.id)
    const posted = await totals(client, statement.id)
    assert.equal(posted.credits, 40)
    assert.equal(posted.debits, -10)
  })

  test('bulk reconciliation skips pending but selects it after posting', async ({ client, assert }) => {
    const { statement } = await createStatement(client)
    const active = await createTransaction(client, 40)
    const pending = await createTransaction(client, -10)
    await pending.row.merge({ pending: true }).save()
    const first = await client.patch(`/api/v1/statements/${statement.id}`).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user)
    first.assertStatus(200)
    assert.equal((await AccountTransaction.findOrFail(active.row.id)).statementId, statement.id)
    assert.isNull((await AccountTransaction.findOrFail(pending.row.id)).statementId)
    assert.equal(first.body().credits, 40)
    assert.equal(first.body().debits, 0)
    await pending.row.merge({ pending: false }).save()
    const posted = await client.patch(`/api/v1/statements/${statement.id}`).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user)
    posted.assertStatus(200)
    assert.equal((await AccountTransaction.findOrFail(pending.row.id)).statementId, statement.id)
    assert.equal(posted.body().credits, 40)
    assert.equal(posted.body().debits, -10)
  })

  test('manual reconciliation supports a pending recipient independently of bulk All', async ({ client, assert }) => {
    const { statement } = await createStatement(client)
    const pending = await createTransaction(client, 20)
    await pending.row.merge({ pending: true }).save()
    const response = await client.patch(`/api/v1/transaction/${pending.transaction.id}`)
      .json({ version: pending.transaction.version, statementId: statement.id }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.equal((await AccountTransaction.findOrFail(pending.row.id)).statementId, statement.id)
    const listed = await totals(client, statement.id)
    assert.equal(listed.credits, 20)
    assert.equal(listed.debits, 0)
  })

  test('an assigned transaction becoming pending retains its link and contribution', async ({ client, assert }) => {
    const assigned = await createTransaction(client, 20)
    const { statement } = await createStatement(client)
    await assigned.row.refresh()
    await assigned.row.merge({ pending: true }).save()
    const before = await state()
    const response = await client.patch(`/api/v1/statements/${statement.id}`).json({ reconcile: 'All' }).accept('json').loginAs(fixture.user)
    response.assertStatus(200)
    assert.deepEqual(await state(), before)
    assert.equal((await AccountTransaction.findOrFail(assigned.row.id)).statementId, statement.id)
    assert.equal(response.body().credits, 20)
    assert.sameMembers(await register(client), [])
    assert.sameMembers(await register(client, true), [assigned.transaction.id])
  })
})
