import { encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { parseMoneyCents } from '#common/moneyCents'
import { writeCanonicalTransactionFixture } from '../../helpers/historicalTransactionFixture.js'
import { categoryRequest } from '../../helpers/categoryRequest.js'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { mock } from 'node:test'
import Budget from '#models/Budget'
import Category from '#models/Category'
import CategoriesController from '#controllers/CategoriesController'
import { CategoryType, TransactionType } from '#common/ResponseTypes'
import { DateTime, Settings } from 'luxon'

let sequence = 0

async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `recurrence-${++sequence}`,
      email: `recurrence-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Recurrence group', type:
      'Regular' })
    const category = await group.related('categories').create({ name: 'Existing goal',
      type: CategoryType.Goal,
      balanceCents: parseMoneyCents('0.00'), fundingAmount: 120, useGoal: true,
        goalDate: DateTime.fromISO('2025-01-01'),
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
  test('fractional proposed funding uses integer-cent differences and period rounding')
    .with([
      { fundingAmount: 0.29, balance: 0, expected: 0.15 },
      { fundingAmount: 0.2, balance: -0.1, expected: 0.15 },
      { fundingAmount: 0.01, balance: 0, expected: 0.01 },
      { fundingAmount: -0.01, balance: -0.03, expected: 0.01 },
      { fundingAmount: 0.3, balance: 0.1, future: 0.1, expected: 0.15 },
    ]).run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      await f.category.merge({ fundingAmount: scenario.fundingAmount,
        balanceCents: parseMoneyCents(encodeMonetaryAmount(scenario.balance)),
        recurrence: 2, goalDate: DateTime.fromISO('2025-04-01') }).save()
      if (scenario.future !== undefined) {
        const pool = await f.budget.getFundingPoolCategory()
        const transaction = await f.budget.related('transactions').create({
          date: DateTime.fromISO('2025-03-10'),
          type: TransactionType.REBALANCE_TRANSACTION, categories: [
            { categoryId: f.category.id, amount: scenario.future },
            { categoryId: pool.id, amount: -scenario.future }], taxes: [], deleted: false })
        await writeCanonicalTransactionFixture(transaction)
      }
      const before = await db.from('categories').where('id', f.category.id).firstOrFail()
      const proposal = (await f.budget.getProposedFunding('2025-03-01')).find(row =>
        row.categoryId === f.category.id)
      assert.strictEqual(proposal?.amount, scenario.expected)
      const response = await client.get('/api/v1/funding-plans/proposed').qs({ date: '2025-03-01' })
        .loginAs(f.user)
      response.assertStatus(200)
      assert.strictEqual(response.body().data.find((row: { categoryId: number }) => row.categoryId
        === f.category.id).amount, scenario.expected.toFixed(2))
      assert.deepEqual(await db.from('categories').where('id', f.category.id).firstOrFail(), before)
    })

  // API contracts preserve coercion and optional-field behavior while enforcing the business
  // domain.
  test('positive-integer recurrence and past-goal proposal for supported Category create/PATCH')
    .with(['create', 'patch'])
    .run(async ({ client, assert }, path) => {
      const f = await fixture()
      const values = [1, 3, 360, 0, -1, -3, 1.5, '2', '1.5', 'abc', 361, 2147483647, 2147483648,
        undefined, null]
      for (const [index, recurrence] of values.entries()) {
        await f.category.refresh()
        await f.category.merge({ recurrence: 3 }).save()
        const beforeWrite = (await Category.findOrFail(f.category.id)).serialize()
        const name = `Probe ${path} ${index}`
        const payload = { name, fundingAmount: 120, useGoal: true, goalDate: '2025-01-01',
          fundingCategories: [], ...(recurrence === undefined ? {} : { recurrence }) }
        const request = path === 'create'
          ? client.post(`/api/v1/groups/${f.group.id}/categories`).json(categoryRequest(payload))
          : client.patch(`/api/v1/groups/${f.group.id}/categories/${f.category.id}`).json(
            categoryRequest(payload))
        const response = await request.accept('json').loginAs(f.user)
        const absent = recurrence === undefined || recurrence === null
        const accepted = recurrence === 1 || recurrence === 3 || recurrence === 360 ||
          recurrence === '2' || absent
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
            proposal = (await f.budget.getProposedFunding('2025-03-01')).find((row) => row
              .categoryId === stored.id)
          } catch (error) {
            calculationError = error instanceof Error ? error.message : String(error)
            calculationErrorType = error instanceof Error ? error.constructor.name : typeof error
          }
          const proposed = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01')
            .accept('json').loginAs(f.user)
          proposalStatus = proposed.status()
          assert.deepEqual((await Category.findOrFail(stored.id)).serialize(), beforeCalculation)
          if (recurrence === 1 || recurrence === 3 || recurrence === 360) {
            proposed.assertStatus(200)
            const row = proposed.body().data.find((item: { categoryId: number }) => item
              .categoryId === stored.id)
            assert.strictEqual(row.amount, recurrence === 1 ? '120.00' : recurrence === 3 ?
              '60.00' : '0.33')
            assert.equal(row.adjusted, recurrence === 3)
            if (recurrence === 3) assert.equal(row.adjustedReason,
              'The funding amount was adjusted from a planned amount of 40.00 to 60.00 for the \
goal of 120 due 4-2025.')
          }
        }
        console.log(JSON.stringify({ path, input: recurrence === undefined ? 'omitted' : recurrence,
          status: response.status(), persisted: stored?.recurrence ?? null, proposal,
            calculationError,
          calculationErrorType, proposalStatus,
          failure: response.status() >= 400 ? response.body().message ?? response.body()
            .errors : null }))
        // Keep malformed probes from contaminating subsequent proposal controls.
        if (path === 'create' && stored) await stored.delete()
      }
    })

  // Legacy-data controls inject hydrated values at the read boundary, without invalid database
  // writes.
  test(
    'legacy zero recurrence rejects nonfinite goal arithmetic but preserves the no-goal branch',
    async ({ client, assert, cleanup }) => {
    const f = await fixture()
    const read = legacyRead(f.category)
    cleanup(() => read.mock.restore())
    for (const useGoal of [true, false]) {
      f.category.merge({ recurrence: 0, useGoal, goalDate: DateTime.fromISO('2025-04-01') })
      const response = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').accept(
        'json').loginAs(f.user)
      response.assertStatus(useGoal ? 500 : 200)
      if (useGoal) continue
      const row = response.body().data.find((item: { categoryId: number }) => item.categoryId === f
        .category.id)
      assert.strictEqual(row.amount, '120.00')
      console.log(JSON.stringify({ scenario: 'zero recurrence branch', useGoal, proposal: row }))
    }
  })

  test('legacy out-of-domain storage maximum documents invalid dates', async ({ assert,
    cleanup }) => {
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
    const amount = (await f.budget.getProposedFunding('2025-03-01')).find((row) => row
      .categoryId === f.category.id)
    assert.isDefined(amount)
    console.log(JSON.stringify({ scenario: 'storage maximum date arithmetic', helperValid: helper
      ?.isValid,
      invalidReason: helper?.invalidReason, invalidExplanation: helper?.invalidExplanation ?? null,
      goalDate: helper?.toISODate(), proposedGoalValid: proposedGoal.isValid,
      proposedGoalDate: proposedGoal.toISODate(), serializedProposal: JSON.stringify(amount),
        proposal: amount }))
  })

  test('legacy negative recurrence rejects nonfinite funding without modifying storage',
    async ({ client, assert, cleanup }) => {
    const f = await fixture()
    f.category.merge({ recurrence: -3, goalDate: DateTime.fromISO('2025-02-01') })
    const read = legacyRead(f.category)
    cleanup(() => read.mock.restore())
    const before = await db.from('categories').where('id', f.category.id).firstOrFail()
    await assert.rejects(() => f.budget.getProposedFunding('2025-03-01'),
      'Invalid monetary cents')
    const response = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01')
      .accept('json').loginAs(f.user)
    response.assertStatus(500)
    assert.deepEqual(await db.from('categories').where('id', f.category.id).firstOrFail(), before)
  })

  test(
    'date advancement helper records valid, zero, negative and fractional arithmetic without a \
recurrence loop', async ({ assert, cleanup }) => {
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
      console.log(JSON.stringify({ scenario: 'date helper', recurrence, past: past.toISODate(),
        date, error }))
    }
  })
})
