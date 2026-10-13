import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import Category from '#models/Category'
import CategoriesController from '#controllers/CategoriesController'
import { CategoryType } from '#common/ResponseTypes'
import { DateTime, Settings } from 'luxon'

let sequence = 0

async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `recurrence-${++sequence}`,
      email: `recurrence-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Recurrence group', type: 'Regular' })
    const category = await group.related('categories').create({ name: 'Existing goal', type: CategoryType.Goal,
      balance: 0, fundingAmount: 120, useGoal: true, goalDate: DateTime.fromISO('2025-01-01'),
      recurrence: 3, suspended: false, fundingCategories: [] })
    return { budget, user, group, category }
  })
}

// Inject a legacy hydrated Category at the read boundary without violating the new database CHECK.
function legacyRead(category: Category) {
  const query = Category.query.bind(Category)
  return mock.method(Category, 'query', () => {
    const builder = query()
    const join = builder.joinRaw.bind(builder)
    mock.method(builder, 'joinRaw', (...args: Parameters<typeof join>) => {
      mock.method(builder, 'exec', async () => [category])
      return join(...args)
    })
    return builder
  })
}

test.group('Funding recurrence characterization', () => {
  // API contracts preserve coercion and optional-field behavior while enforcing the business domain.
  test('positive-integer API contract and past-goal proposal for each writer')
    .with(['create', 'patch', 'funding'])
    .run(async ({ client, assert }, path) => {
      const f = await fixture()
      const values = [1, 3, 360, 0, -1, -3, 1.5, '2', '1.5', 'abc', 361, 2147483647, 2147483648, undefined, null]
      for (const [index, recurrence] of values.entries()) {
        await f.category.refresh()
        await f.category.merge({ recurrence: 3 }).save()
        const beforeWrite = (await Category.findOrFail(f.category.id)).serialize()
        const name = `Probe ${path} ${index}`
        const payload = { name, fundingAmount: 120, useGoal: true, goalDate: '2025-01-01',
          fundingCategories: [], ...(recurrence === undefined ? {} : { recurrence }) }
        const request = path === 'create'
          ? client.post(`/api/v1/groups/${f.group.id}/categories`).json(payload)
          : path === 'patch'
            ? client.patch(`/api/v1/groups/${f.group.id}/categories/${f.category.id}`).json(payload)
            : client.put(`/api/v1/funding-plans/item/${f.category.id}`).json({ amount: 120,
              useGoal: true, goalDate: '2025-01-01', ...(recurrence === undefined ? {} : { recurrence }) })
        const response = await request.accept('json').loginAs(f.user)
        const absent = recurrence === undefined || recurrence === null
        const accepted = recurrence === 1 || recurrence === 3 || recurrence === 360 || recurrence === '2' || (absent && path !== 'funding')
        response.assertStatus(accepted ? 200 : 422)
        const stored = path === 'create'
          ? await Category.query().where('groupId', f.group.id).where('name', name).first()
          : await Category.findOrFail(f.category.id)
        if (response.status() >= 400) {
          if (path === 'create') assert.isNull(stored)
          else assert.deepEqual(stored?.serialize(), beforeWrite)
        }
        if (recurrence === 1 || recurrence === 3 || recurrence === 360) {
          response.assertStatus(200)
          assert.equal(stored?.recurrence, recurrence)
        }
        if (accepted) {
          const expected = absent ? (path === 'create' ? 1 : 3) : Number(recurrence)
          assert.equal(stored?.recurrence, expected)
        }
        let proposal: unknown = null
        let calculationError: string | null = null
        let calculationErrorType: string | null = null
        let proposalStatus: number | null = null
        if (response.status() === 200 && stored) {
          const beforeCalculation = stored.serialize()
          try {
            proposal = (await f.budget.getProposedFunding('2025-03-01')).find((row) => row.categoryId === stored.id)
          } catch (error) {
            calculationError = error instanceof Error ? error.message : String(error)
            calculationErrorType = error instanceof Error ? error.constructor.name : typeof error
          }
          const proposed = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').accept('json').loginAs(f.user)
          proposalStatus = proposed.status()
          assert.deepEqual((await Category.findOrFail(stored.id)).serialize(), beforeCalculation)
          if (recurrence === 1 || recurrence === 3 || recurrence === 360) {
            proposed.assertStatus(200)
            const row = proposed.body().data.find((item: { categoryId: number }) => item.categoryId === stored.id)
            assert.equal(row.amount, recurrence === 1 ? 120 : recurrence === 3 ? 60 : 0.33)
            assert.equal(row.adjusted, recurrence === 3)
            if (recurrence === 3) assert.equal(row.adjustedReason, 'The funding amount was adjusted from a planned amount of 40.00 to 60.00 for the goal of 120 due 4-2025.')
          }
        }
        console.log(JSON.stringify({ path, input: recurrence === undefined ? 'omitted' : recurrence,
          status: response.status(), persisted: stored?.recurrence ?? null, proposal, calculationError,
          calculationErrorType, proposalStatus,
          failure: response.status() >= 400 ? response.body().message ?? response.body().errors : null }))
        // Keep malformed probes from contaminating subsequent proposal controls.
        if (path === 'create' && stored) await stored.delete()
      }
    })

  // Legacy-data controls inject hydrated values at the read boundary, without invalid database writes.
  test('legacy zero recurrence with a future goal and without a goal records branch-specific behavior', async ({ client, assert, cleanup }) => {
    const f = await fixture()
    const read = legacyRead(f.category)
    cleanup(() => read.mock.restore())
    for (const useGoal of [true, false]) {
      f.category.merge({ recurrence: 0, useGoal, goalDate: DateTime.fromISO('2025-04-01') })
      const response = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').accept('json').loginAs(f.user)
      response.assertStatus(200)
      const row = response.body().data.find((item: { categoryId: number }) => item.categoryId === f.category.id)
      assert.equal(row.amount, useGoal ? 60 : 120)
      console.log(JSON.stringify({ scenario: 'zero recurrence branch', useGoal, proposal: row }))
    }
  })

  test('legacy out-of-domain storage maximum documents invalid dates', async ({ assert, cleanup }) => {
    const now = Settings.now
    Settings.now = () => Date.UTC(2025, 2, 1, 12)
    cleanup(() => { Settings.now = now })
    const f = await fixture()
    f.category.merge({ recurrence: 2147483647 })
    const read = legacyRead(f.category)
    cleanup(() => read.mock.restore())
    const past = DateTime.fromISO('2025-01-01')
    const helper = CategoriesController.getGoalDate(past, 2147483647)
    const fundingMonth = DateTime.fromISO('2025-03-01').startOf('month')
    let monthDiff = past.startOf('month').diff(fundingMonth, 'months').months
    monthDiff += Math.ceil(-monthDiff / 2147483647) * 2147483647
    const proposedGoal = fundingMonth.plus({ months: monthDiff })
    const amount = (await f.budget.getProposedFunding('2025-03-01')).find((row) => row.categoryId === f.category.id)
    assert.isDefined(amount)
    console.log(JSON.stringify({ scenario: 'storage maximum date arithmetic', helperValid: helper?.isValid,
      invalidReason: helper?.invalidReason, invalidExplanation: helper?.invalidExplanation ?? null,
      goalDate: helper?.toISODate(), proposedGoalValid: proposedGoal.isValid,
      proposedGoalDate: proposedGoal.toISODate(), serializedProposal: JSON.stringify(amount), proposal: amount }))
  })

  test('negative recurrence with a goal one month overdue records non-finite arithmetic and JSON behavior', async ({ client, assert, cleanup }) => {
    const f = await fixture()
    f.category.merge({ recurrence: -3, goalDate: DateTime.fromISO('2025-02-01') })
    const read = legacyRead(f.category)
    cleanup(() => read.mock.restore())
    const before = (await Category.findOrFail(f.category.id)).serialize()
    const direct = (await f.budget.getProposedFunding('2025-03-01')).find((row) => row.categoryId === f.category.id)
    assert.isDefined(direct)
    const response = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').accept('json').loginAs(f.user)
    const row = response.body().data?.find((item: { categoryId: number }) => item.categoryId === f.category.id)
    console.log(JSON.stringify({ scenario: 'overdue negative recurrence', directAmount: String(direct?.amount),
      status: response.status(), proposal: row }))
    assert.deepEqual((await Category.findOrFail(f.category.id)).serialize(), before)
  })

  test('date advancement helper records valid, zero, negative and fractional arithmetic without a recurrence loop', async ({ assert, cleanup }) => {
    const now = Settings.now
    Settings.now = () => Date.UTC(2025, 2, 1, 12)
    cleanup(() => { Settings.now = now })
    const past = DateTime.now().startOf('month').minus({ months: 2 })
    for (const recurrence of [1, 3, 360, 0, -1, -3, 0.5, 1.5]) {
      let date: string | null = null
      let error: string | null = null
      try { date = CategoriesController.getGoalDate(past, recurrence)?.toISODate() ?? null }
      catch (failure) { error = failure instanceof Error ? failure.message : String(failure) }
      if (recurrence === 1 || recurrence === 3 || recurrence === 360) assert.isNotNull(date)
      if (recurrence === 360) assert.equal(date, '2055-01-01')
      console.log(JSON.stringify({ scenario: 'date helper', recurrence, past: past.toISODate(), date, error }))
    }
  })
})
