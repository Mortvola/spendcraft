import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
import { canonicalCategoryAllocations, categoryAllocationsToCents, encodeMonetaryAmount,
  encodeCategoryAllocations,
  monetaryAmountCents, checkedCentSum } from '#services/categoryAmountCodec'
import { encodeFundingMetadata, decodeFundingMetadata } from '#services/fundingAmountCodec'
// Requires task-specific authorization and the current
// configured/live pg + pgLog + exact execution-connection safeguards before SQL.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { mock } from 'node:test'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Category from '#models/Category'
import Transaction from '#models/Transaction'
import { CategoryType, TransactionType } from '#common/ResponseTypes'
import { fundingForServer as calculateFunding, fundingCategoryEffect, type FundingInputs } from
  '../../fixtures/funding/legacyPreview.js'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `funding-preview-${++sequence}`,
      email: `funding-preview-${sequence}@example.com`, password: 'testPassw0rd' })
    const group = await budget.related('groups').create({ name: 'Preview', type: 'Regular' })
    const categories = []
    for (const name of ['A', 'B', 'C']) categories.push(await group.related('categories').create({
      name, type: CategoryType.Regular, balanceCents: parseMoneyCents('0.00'),
         fundingAmountCents: parseMoneyCents('1.00'),
        useGoal: false,
      recurrence: 1, fundingCategories: [], includeFundingTransfers: false, suspended: false,
    }))
    const pool = await budget.getFundingPoolCategory({ client: trx })
    await pool.merge({ balanceCents: parseMoneyCents('10.00') }).save()
    return { budget, user, categories, pool }
  })
}
const scenarios = ['chain', 'fixed', 'percent', 'mixed', 'residual', 'transfer', 'negative', 'zero',
  'low Pool', 'goal', 'mixed goal', 'duplicate sources']

test.group('Funding preview/submission persisted equality', () => {
  test('same calculated fields post once and replacement preserves the same net effects').with(
    scenarios)
    .run(async ({ client, assert }, scenario) => {
      const f = await fixture()
      const [a, b, c] = f.categories
      const input = (baseAmount: number, from = f.pool.id, includeFundingTransfers = false) => ({
        baseAmount, fundingCategories: [{ categoryId: from, amount: 100, percentage: true }],
          includeFundingTransfers,
      })
      let inputs: FundingInputs = { [a.id]: input(1) }
      if (scenario === 'chain' || scenario === 'low Pool') inputs = {
        [a.id]: input(1, f.pool.id, true), [b.id]: input(1, a.id, true), [c.id]: input(1, b.id),
      }
      if (scenario === 'fixed') inputs = { [a.id]: { ...input(1), fundingCategories: [{
        categoryId: f.pool.id, amount: 5, percentage: false }] } }
      if (scenario === 'percent' || scenario === 'residual') inputs = { [a.id]: { ...input(
        scenario === 'residual' ? 0.01 : 1),
        fundingCategories: [{ categoryId: f.pool.id, amount: 33.33, percentage: true }, {
          categoryId: b.id, amount: 66.67, percentage: true }] } }
      if (scenario === 'mixed') inputs = { [a.id]: { ...input(10), fundingCategories: [
        { categoryId: f.pool.id, amount: 2, percentage: false }, { categoryId: b.id, amount: 100,
          percentage: true }] } }
      if (scenario === 'transfer') inputs = { [a.id]: input(0.1, f.pool.id, true), [b.id]: input(
        0.2, a.id) }
      if (scenario === 'duplicate sources') inputs = { [a.id]: { ...input(1), fundingCategories: [
        { categoryId: f.pool.id, amount: 50, percentage: true }, { categoryId: f.pool.id,
          amount: 50, percentage: true }] } }
      if (scenario === 'negative' || scenario === 'zero') inputs = { [a.id]: input(scenario ===
        'negative' ? -1 : 0) }
      if (scenario === 'low Pool') await f.pool.merge({ balanceCents: parseMoneyCents(
        '1.00') }).save()
      if (scenario === 'goal' || scenario === 'mixed goal') {
        await a.merge({ useGoal: true, goalDate: DateTime.fromISO('2025-04-01'),
           fundingAmountCents: parseMoneyCents('120.00'),
          recurrence: 3 }).save()
        const proposed = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').loginAs(
          f.user)
        proposed.assertStatus(200)
        const entry = proposed.body().data.find((row: { categoryId: number }) => row
          .categoryId === a.id)
        assert.strictEqual(entry.amount, '60.00')
        inputs = { [a.id]: input(Number(entry.amount)) }
        if (scenario === 'mixed goal') inputs = { [a.id]: { ...input(Number(entry.amount)),
          fundingCategories: [
          { categoryId: f.pool.id, amount: 2, percentage: false }, { categoryId: b.id, amount: 100,
            percentage: true }] } }
      }
      const rows = calculateFunding(inputs, f.pool.id)
      const before = new Map([f.pool, ...f.categories].map((category) => [category.id, Number(
        formatMoneyCents(category.balanceCents))]))
      const snapshot = await db.from('accounts').orderBy('id')
      const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-01', type: TransactionType.FUNDING_TRANSACTION,
        categories: rows })).loginAs(f.user)
      if (scenario === 'residual' || scenario === 'zero') {
        // Individually rounded nonconserving cents / absent Pool are rejected by approved policy.
        response.assertStatus(422)
        assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 0)
        for (const [id, initial] of before) assert.equal((await Category.findOrFail(
          id)).balanceCents, parseMoneyCents(encodeMonetaryAmount(initial)))
        return
      }
      response.assertStatus(200)
      const transaction = await Transaction.findOrFail(response.body().data.transaction.id)
      assert.equal(transaction.type, TransactionType.FUNDING_TRANSACTION)
      assert.deepEqual(transaction.categories, decodeFundingMetadata(encodeFundingMetadata(
        categoryAllocationsToCents(canonicalCategoryAllocations(rows)))))
      const persisted = await db.from('transactions').where('id', transaction.id).first()
      assert.deepEqual(persisted.categories,
        encodeCategoryAllocations(encodeFundingMetadata(categoryAllocationsToCents(rows))))
      assert.lengthOf(await transaction.related('accountTransaction').query(), 0)
      for (const [id, initial] of before) {
        // Existing numeric(12,2) storage; compare the current display/accounting
        // scale, without asserting a future exact representation for JSON.
        const expected = Math.round((initial + fundingCategoryEffect(canonicalCategoryAllocations(
          rows), id)) * 100) / 100
        assert.equal((await Category.findOrFail(id)).balanceCents, parseMoneyCents(
          encodeMonetaryAmount(expected)))
        const rawCategory = await db.from('categories').select('balance').where('id', id).first()
        assert.equal(Number(rawCategory.balance), expected)
        // The API encodes the existing runtime calculation at the response boundary.
        assert.equal(response.body().data.balances.find((row: { id: number }) => row.id === id)
          ?.balance ?? initial.toFixed(2),
          encodeMonetaryAmount(initial + fundingCategoryEffect(canonicalCategoryAllocations(rows),
            id)))
      }
      if (scenario === 'chain' || scenario === 'low Pool') assert.equal(fundingCategoryEffect(
        canonicalCategoryAllocations(rows), f.pool.id), -2)
      if (scenario === 'transfer') assert.equal(Number(formatMoneyCents(
        transaction.categories[0].amountCents)), 0.3)
      const replaced = await client.patch(`/api/v1/category-transfer/${transaction.id}`).json(
        categoryTransferRequest({ date: '2025-03-01',
        type: TransactionType.FUNDING_TRANSACTION, categories: rows })).loginAs(f.user)
      replaced.assertStatus(200)
      for (const [id, initial] of before) assert.equal((await Category.findOrFail(
        id)).balanceCents, parseMoneyCents(encodeMonetaryAmount(Math.round((
          initial + fundingCategoryEffect(canonicalCategoryAllocations(rows), id)) *
          100) / 100)))
      // Report current persisted net rows after the real create/replacement workflow.
      const history = await client.get('/api/v1/reports/funding-history').loginAs(f.user)
      history.assertStatus(200)
      assert.isUndefined(history.body().find((row: { categoryId: number }) => row.categoryId === f
        .pool.id))
      for (const categoryId of new Set(rows.map((row) => row.categoryId))) {
        if (categoryId === f.pool.id) continue
        const reported = history.body().find((row: { categoryId: number }) => row
          .categoryId === categoryId)
        assert.deepEqual(reported.history, [{ year: 2025, month: 3, amount: encodeMonetaryAmount(
          checkedCentSum(rows.filter((row) => row.categoryId === categoryId).map((row) =>
          monetaryAmountCents(row.amount))) / 100) }])
      }
      assert.deepEqual(await db.from('accounts').orderBy('id'), snapshot)
    })

  test('stale form instructions remain submitted instructions while posting uses fresh balances',
    async ({ client, assert }) => {
    const f = await fixture()
    const a = f.categories[0]
    const rows = calculateFunding({ [a.id]: { baseAmount: 2, includeFundingTransfers: false,
      fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }] } }, f.pool.id)
    // Another committed operation changes financial/configuration state after preview.
    await a.merge({ balanceCents: parseMoneyCents('5.00'), fundingAmountCents: parseMoneyCents(
      '99.00') }).save()
    await f.pool.merge({ balanceCents: parseMoneyCents('20.00') }).save()
    const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-01', type: 2, categories: rows })).loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual((await Transaction.findOrFail(response.body().data.transaction.id)).categories,
      categoryAllocationsToCents(rows))
    assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents('7.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('18.00'))
  })

  test('server still rejects unbalanced client funding without partial persistence', async ({
    client, assert }) => {
    const f = await fixture()
    const rows = calculateFunding({ [f.categories[0].id]: { baseAmount: 2,
      includeFundingTransfers: false,
      fundingCategories: [{ categoryId: f.pool.id, amount: 1, percentage: false }] } }, f.pool.id)
    const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-01', type: 2, categories: rows })).loginAs(f.user)
    assert.isAtLeast(response.status(), 400)
    assert.isBelow(response.status(), 500)
    assert.equal((await Category.findOrFail(f.categories[0].id)).balanceCents, parseMoneyCents(
      '0.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('10.00'))
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 0)
  })

  test('late financial failure rolls back all Category/Pool and Transaction state', async ({ client,
    assert }) => {
    const f = await fixture()
    const before = await db.from('categories').select('categories.*').join('groups', 'groups.id',
      'categories.group_id')
      .where('groups.application_id', f.budget.id).orderBy('categories.id')
    const rows = calculateFunding({ [f.categories[0].id]: { baseAmount: 2, fundingCategories: [
      { categoryId: f.pool.id, amount: 100, percentage: true }], includeFundingTransfers: false } },
        f.pool.id)
    const original = Category.prototype.save
    const fault = mock.method(Category.prototype, 'save', async function (this: Category) {
      const result = await original.call(this)
      if (this.id === f.pool.id) throw new Error('Injected funding preview late failure')
      return result
    })
    try {
      const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-01', type: 2, categories: rows })).loginAs(f.user)
      response.assertStatus(500)
    } finally { fault.mock.restore() }
    assert.deepEqual(await db.from('categories').select('categories.*').join('groups', 'groups.id',
      'categories.group_id')
      .where('groups.application_id', f.budget.id).orderBy('categories.id'), before)
    assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), 0)
  })
})

function signal() {
  let resolve: () => void = () => { throw new Error('Uninitialized signal') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function waitForBudgetWaiter(ownerPid: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const result = await db.rawQuery(`SELECT query FROM pg_stat_activity
      WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`, [ownerPid])
    if (result.rows.some((row: { query: string }) => row.query.includes('applications') &&
      /for update/i.test(row.query))) return
  }
  throw new Error('Funding writer did not wait for Budget gate')
}
test.group('Funding preview/posting serialization', () => {
  test('waiting writer adds to fresh balances; rollback releases the gate').with(['funding',
    'rebalance', 'rollback'])
    .run(async ({ client, assert }, kind) => {
      const f = await fixture()
      const [a, b] = f.categories
      const funding = (amount: number) => calculateFunding({ [a.id]: { baseAmount: amount,
        fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }],
          includeFundingTransfers: false } }, f.pool.id)
      const entered = signal()
      const release = signal()
      let ownerPid = 0
      let held = false
      const original = Category.prototype.save
      const hold = mock.method(Category.prototype, 'save', async function (this: Category) {
        const saved = await original.call(this)
        if (this.id === a.id && !held) {
          held = true
          if (!this.$trx) throw new Error('Missing owning transaction')
          const result = await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')
          ownerPid = result.rows[0].pid
          entered.resolve()
          await release.promise
          if (kind === 'rollback') throw new Error('Injected funding rollback with waiter')
        }
        return saved
      })
      const first = client.post('/api/v1/category-transfer').json(categoryTransferRequest({ date:
        '2025-03-01', type: 2, categories: funding(1) }))
        .loginAs(f.user).then((response) => { response.assertStatus(kind ===
          'rollback' ? 500 : 200) })
      let second: Promise<void> | undefined
      try {
        await entered.promise
        second = client.post('/api/v1/category-transfer').json(categoryTransferRequest({ date:
          '2025-03-01',
          type: kind === 'rebalance' ? 3 : 2,
          categories: kind === 'rebalance' ? [{ categoryId: a.id, amount: -1 }, { categoryId: b.id,
            amount: 1 }] : funding(2),
        })).loginAs(f.user).then((response) => { response.assertStatus(200) })
        await waitForBudgetWaiter(ownerPid)
      } finally {
        release.resolve()
        await Promise.allSettled([first, ...(second ? [second] : [])])
        hold.mock.restore()
      }
      await first
      await second
      assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(kind === 'funding' ? 3 : kind ===
        'rollback' ? 2 : 0)))
      assert.equal((await Category.findOrFail(b.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(kind === 'rebalance' ? 1 : 0)))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(kind ===
        'funding' ? 7 : kind === 'rollback' ? 8 : 9)))
      assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), kind ===
        'rollback' ? 1 : 2)
    })

  test('different Budget funding progresses while another Budget gate is held', async ({ client,
    assert }) => {
    const first = await fixture()
    const second = await fixture()
    const owner = await db.transaction()
    try {
      await Budget.query({ client: owner }).where('id', first.budget.id).forUpdate().firstOrFail()
      const rows = calculateFunding({ [second.categories[0].id]: { baseAmount: 1,
        fundingCategories: [
        { categoryId: second.pool.id, amount: 100, percentage: true }],
          includeFundingTransfers: false } }, second.pool.id)
      const response = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-01', type: 2, categories: rows })).loginAs(second.user)
      response.assertStatus(200)
      assert.equal((await Category.findOrFail(second.pool.id)).balanceCents, parseMoneyCents(
        '9.00'))
      assert.equal((await Category.findOrFail(first.pool.id)).balanceCents, parseMoneyCents(
        '10.00'))
    } finally { await owner.rollback() }
  })
})

test.group('Funding replacement projection', () => {
  test(
    'nominal Total differs from additional withdrawal; available and month-start projections \
account for reversal')
    .with([2, 3]).run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const a = f.categories[0]
      const rows = (baseAmount: number) => calculateFunding({ [a.id]: { baseAmount,
        fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }],
          includeFundingTransfers: false } }, f.pool.id)
      const oldRows = rows(2)
      const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-01', type: 2, categories: oldRows })).loginAs(f.user)
      created.assertStatus(200)
      const currentPool = Number(formatMoneyCents((await Category.findOrFail(
        f.pool.id)).balanceCents))
      assert.equal(currentPool, 8)
      const info = await client.get('/api/v1/categories?date=2025-03-01').loginAs(f.user)
      info.assertStatus(200)
      const initial = Number(info.body().data.find((category: { id: number }) => category.id === a
        .id).balance)
      assert.equal(initial, 0) // The March snapshot excludes the existing March record.
      const newRows = rows(amount)
      const additionalWithdrawal = fundingCategoryEffect(oldRows, f.pool.id) -
        fundingCategoryEffect(newRows, f.pool.id)
      const projectedPool = currentPool - additionalWithdrawal
      const projectedCategory = initial + fundingCategoryEffect(newRows, a.id)
      const rejected = await client.patch(`/api/v1/category-transfer/${created.body().data
        .transaction.id}`)
        .json(categoryTransferRequest({ date: '2025-04-01', type: 2, categories: newRows }))
          .loginAs(f.user)
      rejected.assertStatus(422)
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(currentPool)))
      assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents('2.00'))
      assert.equal((await Transaction.findOrFail(created.body().data.transaction.id)).date
        .toISODate(), '2025-03-01')
      const response = await client.patch(`/api/v1/category-transfer/${created.body().data
        .transaction.id}`)
        .json(categoryTransferRequest({ date: '2025-03-01', type: 2, categories: newRows }))
          .loginAs(f.user)
      response.assertStatus(200)
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(projectedPool)))
      assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(projectedCategory)))
      assert.equal(additionalWithdrawal, amount - 2)
      assert.deepEqual((await Transaction.findOrFail(created.body().data.transaction.id))
        .categories, categoryAllocationsToCents(newRows))
    })
})

test.group('Immutable funding date verification', () => {
  test('CREATE chooses date; replacement retains it across rule and month-sensitive cases')
    .with(['fixed', 'percentage', 'goal', 'mixed goal', 'transfer']).run(async ({ client, assert },
      rule) => {
      const f = await fixture()
      const [a, b] = f.categories
      let base = 2
      if (rule.includes('goal')) {
        await a.merge({ useGoal: true, fundingAmountCents: parseMoneyCents('120.00'),
           goalDate: DateTime.fromISO('2025-04-01'),
          recurrence: 3 }).save()
        const march = await client.get('/api/v1/funding-plans/proposed?date=2025-03-01').loginAs(f
          .user)
        const april = await client.get('/api/v1/funding-plans/proposed?date=2025-04-01').loginAs(f
          .user)
        march.assertStatus(200); april.assertStatus(200)
        base = Number(march.body().data.find((row: { categoryId: number }) => row.categoryId === a
          .id).amount)
        assert.equal(base, 60)
        assert.notEqual(Number(april.body().data.find((row: { categoryId: number }) => row
          .categoryId === a.id).amount), base)
      }
      const input = (amount: number): FundingInputs => ({ [a.id]: { baseAmount: amount,
        includeFundingTransfers: rule === 'transfer', fundingCategories: rule === 'fixed'
          ? [{ categoryId: f.pool.id, amount: 1, percentage: false }, { categoryId: b.id, amount: 1,
            percentage: false }]
          : rule === 'mixed goal'
          ? [{ categoryId: f.pool.id, amount: 2, percentage: false }, { categoryId: b.id,
            amount: 100, percentage: true }]
          : [{ categoryId: f.pool.id, amount: 100, percentage: true }] },
      ...(rule === 'transfer' ? { [b.id]: { baseAmount: 0.2, includeFundingTransfers: false,
        fundingCategories: [{ categoryId: a.id, amount: 100, percentage: true }] } } : {}) })
      if (rule === 'transfer') base = 0.1
      const rows = calculateFunding(input(base), f.pool.id)
      const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-17', type: 2, categories: rows })).loginAs(f.user)
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const read = () => db.from('transactions').where('id', id).select(db.raw(
        'date::text as date'), 'type', 'categories').first()
      const original = await read()
      assert.equal(original.date, '2025-03-17')
      assert.equal(original.type, 2)
      assert.deepEqual(original.categories,
        encodeCategoryAllocations(encodeFundingMetadata(categoryAllocationsToCents(rows))))
      const balances = () => db.from('categories').select('categories.*').join('groups',
        'groups.id', 'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id')
      const before = await balances()
      // Even changing the request type must not bypass an existing funding date.
      for (const type of [2, 3]) {
        const rejected = await client.patch(`/api/v1/category-transfer/${id}`).json(
          categoryTransferRequest({ date: '2025-04-17', type, categories: rows })).accept('json')
          .loginAs(f.user)
        rejected.assertStatus(422)
        assert.include(JSON.stringify(rejected.body()), type === 2
          ? 'The date of a funding transaction cannot be changed.'
          : 'This transaction is not a supported funding or rebalance replacement target.')
        assert.deepEqual(await read(), original)
        assert.deepEqual(await balances(), before)
      }
      const info = await client.get('/api/v1/categories?date=2025-03-01').loginAs(f.user)
      info.assertStatus(200)
      const initial = Number(info.body().data.find((row: { id: number }) => row.id === a.id)
        .balance)
      // The existing float-based projection can retain a sub-cent binary residue.
      assert.equal(Math.round(initial * 100), 0)
      const replaced = await client.patch(`/api/v1/category-transfer/${id}`).json(
        categoryTransferRequest({ date: original.date, type: 2, categories: rows })).loginAs(f.user)
      replaced.assertStatus(200)
      assert.deepEqual(await read(), original)
      assert.deepEqual(await balances(), before)
      assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(Math.round((initial +
        fundingCategoryEffect(canonicalCategoryAllocations(rows), a.id)) * 100) / 100)))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents(
        encodeMonetaryAmount(Math.round((10 +
        fundingCategoryEffect(canonicalCategoryAllocations(rows), f.pool.id)) * 100) / 100)))
      assert.equal(rows[0].baseAmount, base)
      if (rule === 'transfer') assert.equal(original.categories[0].amount, '0.30')
    })

  test('replacement late failure restores original date, metadata, Categories and Pool', async ({
    client, assert }) => {
    const f = await fixture()
    const rows = (baseAmount: number) => calculateFunding({ [f.categories[0].id]: { baseAmount,
      includeFundingTransfers: false, fundingCategories: [{ categoryId: f.pool.id, amount: 100,
        percentage: true }] } }, f.pool.id)
    const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-17', type: 2, categories: rows(2) })).loginAs(f.user)
    created.assertStatus(200)
    const id = created.body().data.transaction.id
    const snapshot = async () => ({ transaction: await db.from('transactions').where('id', id)
      .first(),
      categories: await db.from('categories').select('categories.*').join('groups', 'groups.id',
        'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id') })
    const before = await snapshot()
    const original = Category.prototype.save
    const fault = mock.method(Category.prototype, 'save', async function (this: Category) {
      const saved = await original.call(this)
      if (this.id === f.pool.id) throw new Error('Injected immutable-date replacement rollback')
      return saved
    })
    try {
      const response = await client.patch(`/api/v1/category-transfer/${id}`).json(
        categoryTransferRequest({ date: '2025-03-17', type: 2, categories: rows(3) })).loginAs(f
        .user)
      response.assertStatus(500)
    } finally { fault.mock.restore() }
    assert.deepEqual(await snapshot(), before)
  })

  test('type3 rebalance still permits date changes', async ({ client, assert }) => {
    const f = await fixture()
    const categories = [{ categoryId: f.categories[0].id, amount: 1 }, { categoryId: f.pool.id,
      amount: -1 }]
    const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-01', type: 3, categories })).loginAs(f.user)
    created.assertStatus(200)
    const id = created.body().data.transaction.id
    const response = await client.patch(`/api/v1/category-transfer/${id}`).json(
      categoryTransferRequest({ date: '2025-04-01', type: 3, categories })).loginAs(f.user)
    response.assertStatus(200)
    assert.equal((await Transaction.findOrFail(id)).date.toISODate(), '2025-04-01')
    assert.equal((await Category.findOrFail(f.categories[0].id)).balanceCents, parseMoneyCents(
      '1.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('9.00'))
  })
})

test.group('Immutable funding replacement serialization', () => {
  test('waiter reloads the existing same-date record after a replacement commits or rolls back')
    .with(['replacement', 'rollback', 'other writer']).run(async ({ client, assert }, kind) => {
      const f = await fixture()
      const a = f.categories[0]
      const rows = (baseAmount: number) => calculateFunding({ [a.id]: { baseAmount,
        includeFundingTransfers: false,
        fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }] } }, f.pool
          .id)
      const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
        date: '2025-03-17', type: 2, categories: rows(2) })).loginAs(f.user)
      created.assertStatus(200)
      const id = created.body().data.transaction.id
      const entered = signal()
      const release = signal()
      let held = false
      let ownerPid = 0
      const original = Category.prototype.save
      const hold = mock.method(Category.prototype, 'save', async function (this: Category) {
        const saved = await original.call(this)
        if (this.id === a.id && !held) {
          held = true
          if (!this.$trx) throw new Error('Missing replacement transaction')
          ownerPid = (await this.$trx.rawQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
          entered.resolve()
          await release.promise
          if (kind === 'rollback') throw new Error('Injected immutable-date owner rollback')
        }
        return saved
      })
      const first = client.patch(`/api/v1/category-transfer/${id}`).json(categoryTransferRequest({
        date: '2025-03-17', type: 2, categories: rows(3) }))
        .loginAs(f.user).then((response) => { response.assertStatus(kind ===
          'rollback' ? 500 : 200) })
      let second: Promise<void> | undefined
      try {
        await entered.promise
        second = (kind === 'other writer'
          ? client.post('/api/v1/category-transfer').json(categoryTransferRequest({ date:
            '2025-04-01', type: 2, categories: rows(1) }))
          : client.patch(`/api/v1/category-transfer/${id}`).json(categoryTransferRequest({ date:
            '2025-03-17', type: 2, categories: rows(4) })))
          .loginAs(f.user).then((response) => { response.assertStatus(200) })
        await waitForBudgetWaiter(ownerPid)
      } finally {
        release.resolve()
        await Promise.allSettled([first, ...(second ? [second] : [])])
        hold.mock.restore()
      }
      await first
      await second
      const transaction = await Transaction.findOrFail(id)
      assert.equal(transaction.date.toISODate(), '2025-03-17')
      assert.deepEqual(transaction.categories,
        categoryAllocationsToCents(rows(kind === 'other writer' ? 3 : 4)))
      assert.equal((await Category.findOrFail(a.id)).balanceCents, parseMoneyCents('4.00'))
      assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('6.00'))
      assert.lengthOf(await Transaction.query().where('budgetId', f.budget.id), kind ===
        'other writer' ? 2 : 1)
    })
})

test.group('Immutable funding date ownership and lifecycle isolation', () => {
  test('foreign and nonexistent funding targets reject without mutation', async ({ client,
    assert }) => {
    const own = await fixture()
    const foreign = await fixture()
    const rows = calculateFunding({ [foreign.categories[0].id]: { baseAmount: 2,
      includeFundingTransfers: false,
      fundingCategories: [{ categoryId: foreign.pool.id, amount: 100, percentage: true }] } },
        foreign.pool.id)
    const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-17', type: 2, categories: rows })).loginAs(foreign.user)
    created.assertStatus(200)
    const snapshot = async () => ({ transactions: await db.from('transactions').orderBy('id'),
      categories: await db.from('categories').orderBy('id') })
    const before = await snapshot()
    for (const id of [created.body().data.transaction.id, 2147483647]) {
      const response = await client.patch(`/api/v1/category-transfer/${id}`).json(
        categoryTransferRequest({ date: '2025-04-17', type: 2, categories: rows }))
        .accept('json').loginAs(own.user)
      response.assertStatus(404)
      assert.deepEqual(await snapshot(), before)
    }
  })

  test(
    ("normal funding DELETE retains its original date " +
"and reverses only existing accountless effects"), async ({ client, assert }) => {
    const f = await fixture()
    const rows = calculateFunding({ [f.categories[0].id]: { baseAmount: 2,
      includeFundingTransfers: false,
      fundingCategories: [{ categoryId: f.pool.id, amount: 100, percentage: true }] } }, f.pool.id)
    const created = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-03-17', type: 2, categories: rows })).loginAs(f.user)
    created.assertStatus(200)
    const id = created.body().data.transaction.id
    const response = await client.delete(`/api/v1/transaction/${id}`).loginAs(f.user)
    response.assertStatus(200)
    const transaction = await Transaction.findOrFail(id)
    assert.isTrue(transaction.deleted)
    assert.equal(transaction.date.toISODate(), '2025-03-17')
    assert.deepEqual(transaction.categories, decodeFundingMetadata(encodeFundingMetadata(
      categoryAllocationsToCents(canonicalCategoryAllocations(rows)))))
    assert.equal((await Category.findOrFail(f.categories[0].id)).balanceCents, parseMoneyCents(
      '0.00'))
    assert.equal((await Category.findOrFail(f.pool.id)).balanceCents, parseMoneyCents('10.00'))
  })
})
