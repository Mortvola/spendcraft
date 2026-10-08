import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import { CategoryType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createDomain(label: string) {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: 'actual-isolation-' + label + '-' + ++sequence,
      email: 'actual-isolation-' + sequence + '@example.com', password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: label + ' group', type: 'Regular' })
    const category = await group.related('categories').create({ name: label + ' category', type: CategoryType.Regular,
      balance: 100, fundingAmount: label === 'own' ? 10 : 99, useGoal: false, recurrence: 1, fundingCategories: [] })
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2025-02-01'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [{ categoryId: category.id, amount: 10 }], taxes: [], deleted: false })
    return { budget, user, category, transaction }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const shared = await User.create({ username: 'actual-isolation-shared-' + ++sequence,
    email: 'actual-isolation-' + sequence + '@example.com', password: 'testPassw0rd', budgetId: own.budget.id })
  return { own, foreign, shared }
}

test.group('Tax actual isolation', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  test('foreign transaction taxes cannot contaminate budget actuals').with(['owner', 'shared']).run(async ({ client, assert }, actor) => {
    await fixture.own.transaction.merge({ taxes: [{ type: 'wages', amount: 120 }, { type: 'withholding', amount: 20 }] }).save()
    const user = actor === 'owner' ? fixture.own.user : fixture.shared
    const before = await client.get('/api/v1/taxes/2025').accept('json').loginAs(user)
    before.assertStatus(200)
    assert.deepEqual(before.body().data.actuals[1].taxes, { wages: 120, withholding: 20 })
    await fixture.foreign.transaction.merge({ taxes: [{ type: 'wages', amount: 900 }, { type: 'foreignOnly', amount: 75 }] }).save()
    await fixture.foreign.budget.related('transactions').create({ date: DateTime.fromISO('2025-04-01'), type: TransactionType.MANUAL_TRANSACTION,
      categories: [], taxes: [{ type: 'wages', amount: 800 }], deleted: false })
    const after = await client.get('/api/v1/taxes/2025').accept('json').loginAs(user)
    after.assertStatus(200)
    assert.deepEqual(after.body().data.actuals, before.body().data.actuals)
    const foreign = await client.get('/api/v1/taxes/2025').accept('json').loginAs(fixture.foreign.user)
    foreign.assertStatus(200)
    assert.deepEqual(foreign.body().data.actuals[1].taxes, { wages: 900, foreignOnly: 75 })
    assert.deepEqual(foreign.body().data.actuals[3].taxes, { wages: 800 })
  })
})
