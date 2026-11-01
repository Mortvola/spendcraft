import { parseMoneyCents } from '#common/moneyCents'
import { categoryTransferRequest } from '../../helpers/transactionRequest.js'
import { categoryAllocationsToCents, encodeMonetaryAmount } from '#services/categoryAmountCodec'
import { writeCanonicalTransactionFixture, writeHistoricalTransactionFixture } from
  '../../helpers/historicalTransactionFixture.js'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

// Requires task-specific DB authorization and the guarded standard bootstrap.
// No local teardown or direct destructive cleanup is introduced.
let sequence = 0

async function createDomain(label: string, existingBudget?: Budget) {
  return db.transaction(async (trx) => {
    const budget = existingBudget?.useTransaction(trx) ?? await Budget.create({}, { client: trx })
    if (!existingBudget) await budget.initialize()
    const user = await budget.related('users').create({
      username: `report-${label}-${++sequence}`,
      email: `report-${sequence}@example.com`,
      password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({
      name: `${label} account`,
      balanceCents: parseMoneyCents('100.00'), type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const category = await group.related('categories').create({
      name: `${label} category`, type: CategoryType.Regular,
      balanceCents: parseMoneyCents('20.00'), fundingCategories: [],
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, comment: `${label} private comment`,
      categories: categoryAllocationsToCents([{ categoryId: category.id, amount: 10 }]), taxes: [],
    })
    await writeCanonicalTransactionFixture(transaction)
    await account.related('accountTransactions').create({
      transactionId: transaction.id, name: `${label} private purchase`,
         amountCents: parseMoneyCents('10.00'),
      provider: 'NONE', pending: false, statementId: null,
    })
    return { budget, user, institution, account, group, category, transaction }
  })
}


test.group('Exclusive Category and Funding History JSON authority', () => {
  test('Budget Progress uses JSON only, deduplicates IDs and preserves exact scoped totals',
    async ({ client, assert }) => {
      const own = await createDomain('progress'), foreign = await createDomain('progress-other')
      await db.from('categories').whereIn('id', [own.category.id, foreign.category.id])
        .update({ monthly_expenses: true })
      await writeHistoricalTransactionFixture(own.transaction, { categories: [] })
      const empty = await client.get('/api/v1/reports/budget-progress').qs({ m: '2-2025' })
        .loginAs(own.user)
      empty.assertStatus(200)
      assert.deepEqual(empty.body().data, [])
      const add = async (domain: typeof own, amount: number, type: number, date: string,
        categories = [{ categoryId: domain.category.id, amount: encodeMonetaryAmount(amount) }]) =>
        {
        const transaction = await domain.budget.related('transactions').create({
          date: DateTime.fromISO(date), type, categories: [], taxes: [], deleted: false })
        await writeHistoricalTransactionFixture(transaction, { categories })
        return transaction.id
      }
      const funding = await add(own, 0.1, TransactionType.FUNDING_TRANSACTION, '2025-02-01')
      const first = await add(own, 0.2, TransactionType.MANUAL_TRANSACTION, '2025-02-02', [
        { categoryId: own.category.id, amount: '0.10' },
        { categoryId: own.category.id, amount: '0.10' }])
      const zero = await add(own, 0, TransactionType.MANUAL_TRANSACTION, '2025-02-02')
      const second = await add(own, -0.4, TransactionType.MANUAL_TRANSACTION, '2025-02-03')
      const third = await add(own, 0.1, TransactionType.MANUAL_TRANSACTION, '2025-02-04')
      const legacyOnly = await add(own, 0, TransactionType.MANUAL_TRANSACTION, '2025-02-02', [])
      // Stale legacy rows must neither supply amounts nor add transaction IDs.
      for (const id of [funding, first, legacyOnly]) {
        await db.table('transaction_categories').insert({ transaction_id: id,
          category_id: own.category.id, amount: 99 })
      }
      await add(own, 99, TransactionType.REBALANCE_TRANSACTION, '2025-02-02')
      await add(own, 99, TransactionType.STARTING_BALANCE, '2025-02-02')
      await add(own, 99, TransactionType.MANUAL_TRANSACTION, '2025-03-01')
      await add(own, 99, TransactionType.FUNDING_TRANSACTION, '2025-01-31')
      await add(foreign, 99, TransactionType.FUNDING_TRANSACTION, '2025-02-01', [
        { categoryId: own.category.id, amount: '99.00' }])
      await add(own, 99, TransactionType.FUNDING_TRANSACTION, '2025-02-01', [
        { categoryId: foreign.category.id, amount: '99.00' }])
      await add(foreign, 99, TransactionType.MANUAL_TRANSACTION, '2025-02-02', [
        { categoryId: own.category.id, amount: '99.00' }])
      await add(own, 99, TransactionType.MANUAL_TRANSACTION, '2025-02-02', [
        { categoryId: foreign.category.id, amount: '99.00' }])
      const transfer = await own.budget.getAccountTransferCategory()
      await db.from('categories').where('id', transfer.id).update({ monthly_expenses: true })
      for (const type of [TransactionType.FUNDING_TRANSACTION, TransactionType.MANUAL_TRANSACTION])
        {
        await add(own, 99, type, '2025-02-02', [
          { categoryId: transfer.id, amount: '99.00' }])
      }
      const pool = await own.budget.getFundingPoolCategory()
      await add(own, 99, TransactionType.MANUAL_TRANSACTION, '2025-02-02', [
        { categoryId: pool.id, amount: '99.00' }])
      const before = await snapshot(own.budget.id)
      const response = await client.get('/api/v1/reports/budget-progress').qs({ m: '2-2025' })
        .loginAs(own.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().data, [['2025-02-02', '0.30', [first, zero]],
        ['2025-02-03', '-0.10', [second]], ['2025-02-04', '0.00', [third]]])
      assert.deepEqual(await snapshot(own.budget.id), before)
    })

  test('Payee and Category fractional totals preserve exact strings and report metadata')
    .with([1, -1]).run(async ({ client, assert }, sign) => {
      const f = await createDomain('exact')
      await writeHistoricalTransactionFixture(f.transaction, { categories: [
        { categoryId: f.category.id, amount: sign > 0 ? '0.10' : '-0.10' }] })
      await db.from('account_transactions').where('account_id', f.account.id).update({
        amount: sign * 0.1, name: 'Exact shop', payment_channel: 'online' })
      for (const amount of [sign * 0.2, -sign * 0.2]) {
        const transaction = await f.budget.related('transactions').create({
          date: DateTime.fromISO('2025-02-15'), type: TransactionType.MANUAL_TRANSACTION,
          categories: categoryAllocationsToCents([{ categoryId: f.category.id, amount }]),
            taxes: [], deleted: false })
        await writeHistoricalTransactionFixture(transaction, { categories: [
          { categoryId: f.category.id, amount: encodeMonetaryAmount(amount) }] })
        await f.account.related('accountTransactions').create({ transactionId: transaction.id,
          name: 'Exact shop', paymentChannel: 'online', amountCents: parseMoneyCents(
            encodeMonetaryAmount(amount)), pending: false, provider: 'NONE' })
      }
      const before = await snapshot(f.budget.id)
      for (const report of ['payee', 'category']) {
        const filters = report === 'payee' ? { a: f.account.id, pc: 'online' }
          : { c: f.category.id }
        const response = await client.get(`/api/v1/reports/${report}`).qs({ ...filters,
          startDate: '2025-02-01', endDate: '2025-02-28' }).loginAs(f.user)
        response.assertStatus(200)
        assert.deepEqual(response.body().data, [{ rowNumber: '1', count: 3,
          sum: sign > 0 ? '0.10' : '-0.10', ...(report === 'payee' ? { name: 'Exact shop',
            paymentChannel: 'online' } : { groupName: f.group.name, categoryName: f.category.name })
        }])
        const empty = await client.get(`/api/v1/reports/${report}`).qs({ ...filters,
          startDate: '2025-03-01', endDate: '2025-03-31' }).loginAs(f.user)
        empty.assertStatus(200)
        assert.deepEqual(empty.body().data, [])
      }
      assert.deepEqual(await snapshot(f.budget.id), before)
    })

  test('Funding History preserves fractional totals, null histories and Budget isolation',
    async ({ client, assert }) => {
      const own = await createDomain('history-exact'), foreign = await createDomain('history-other')
      const empty = await own.group.related('categories').create({ name: 'Empty history',
        type: CategoryType.Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
      for (const [date, amount] of [['2025-02-01', 0.1], ['2025-02-28', 0.2],
        ['2025-02-15', -0.2], ['2025-01-31', -0.1]] as const) {
        const transaction = await own.budget.related('transactions').create({
          date: DateTime.fromISO(date), type: TransactionType.FUNDING_TRANSACTION,
          categories: categoryAllocationsToCents([{ categoryId: own.category.id, amount }]),
            taxes: [], deleted: false })
        await writeHistoricalTransactionFixture(transaction, { categories: [
          { categoryId: own.category.id, amount: encodeMonetaryAmount(amount) }] })
      }
      await writeHistoricalTransactionFixture(foreign.transaction, {
        type: TransactionType.FUNDING_TRANSACTION, categories: [
          { categoryId: own.category.id, amount: '99.00' }] })
      const before = await snapshot(own.budget.id)
      const response = await client.get('/api/v1/reports/funding-history').loginAs(own.user)
      response.assertStatus(200)
      const row = response.body().data.find((item: { categoryId: number }) => item.categoryId ===
        own.category.id)
      assert.sameDeepMembers(row.history, [{ year: 2025, month: 1, amount: '-0.10' },
        { year: 2025, month: 2, amount: '0.10' }])
      assert.strictEqual(row.groupId, own.group.id)
      assert.strictEqual(row.groupName, own.group.name)
      assert.strictEqual(row.categoryName, own.category.name)
      assert.isNull(response.body().data.find((item: { categoryId: number }) => item.categoryId ===
        empty.id).history)
      assert.isFalse(response.body().data.some((item: { categoryId: number }) => item.categoryId ===
        foreign.category.id))
      assert.deepEqual(await snapshot(own.budget.id), before)
    })

  for (const report of ['category', 'funding-history'] as const) {
    test(`${report}: exclusive JSON cases`).with([
      { json: [50], legacy: null, amount: 50, count: 1 },
      { json: [50], legacy: 20, amount: 50, count: 1 },
      { json: [50], legacy: 50, amount: 50, count: 1 },
      { json: [], legacy: 50, amount: 0, count: 0 },
      { json: [], legacy: null, amount: 0, count: 0 },
      { json: [20, 30], legacy: 99, amount: 50, count: 2 },
    ]).run(async ({ client, assert }, scenario) => {
      const f = await createDomain('authority')
      // Fixture updates/inserts are individually protected by the installed driver guard.
      await writeHistoricalTransactionFixture(f.transaction, { type: report ===
        'category' ? TransactionType.MANUAL_TRANSACTION : 2,
        categories: scenario.json.map((amount) => ({ categoryId: f.category.id, amount })) })
      if (scenario.legacy !== null) await db.table('transaction_categories').insert({
        transaction_id: f.transaction.id, category_id: f.category.id, amount: scenario.legacy,
      })
      const before = await snapshot(f.budget.id)
      const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
        .loginAs(f.user)
      response.assertStatus(200)
      if (report === 'category') {
        if (!scenario.count) assert.deepEqual(response.body().data, [])
        else { assert.equal(response.body().data[0].sum,
          encodeMonetaryAmount(scenario.amount)); assert
          .equal(response.body().data[0].count, scenario.count) }
      } else {
        const row = response.body().data
          .find((item: { categoryId: number }) => item.categoryId === f
          .category.id)
        if (!scenario.count) assert.isNull(row.history)
        else assert.deepEqual(row.history, [{ year: 2025, month: 2, amount: encodeMonetaryAmount(
          scenario.amount) }])
      }
      assert.deepEqual(await snapshot(f.budget.id), before)
    })

    test(`${report}: nominal status/date/type selection`).with([
      { type: 0, deleted: false, expected: true }, { type: 5, deleted: true, expected: true },
      { type: 2, deleted: false, expected: true }, { type: 3, deleted: false, expected: false },
      { type: 4, deleted: false, expected: false },
    ]).run(async ({ client, assert }, scenario) => {
      const f = await createDomain('selection')
      await f.account.merge({ startDate: DateTime.fromISO('2026-01-01') }).save()
      await f.account.related('accountTransactions').query().update({ pending: true })
      await writeHistoricalTransactionFixture(f.transaction, { type: scenario.type,
        deleted: scenario.deleted })
      const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
        .loginAs(f.user)
      response.assertStatus(200)
      const included = report === 'category' ? [0, 5].includes(scenario.type) : scenario.type === 2
      if (report === 'category') assert.equal(response.body().data.length, included ? 1 : 0)
      else assert.equal(response.body().data.find((r: { categoryId: number }) => r.categoryId === f
        .category.id).history !== null, included)
    })

    test(`${report}: foreign Transaction and Category JSON cannot cross scope`, async ({ client,
      assert }) => {
      const own = await createDomain('owner'), foreign = await createDomain('foreign')
      await writeHistoricalTransactionFixture(own.transaction, { type: report ===
        'category' ? 5 : 2,
        categories: [{ categoryId: foreign.category.id, amount: 999 }] })
      await writeHistoricalTransactionFixture(foreign.transaction, { type: report ===
        'category' ? 5 : 2,
        categories: [{ categoryId: own.category.id, amount: 888 }] })
      const before = await Promise.all([snapshot(own.budget.id), snapshot(foreign.budget.id)])
      const response = await client.get(`/api/v1/reports/${report}`).qs({ c: own.category.id })
        .loginAs(own.user)
      response.assertStatus(200)
      if (report === 'category') assert.deepEqual(response.body().data, [])
      else assert.isNull(response.body().data
        .find((r: { categoryId: number }) => r.categoryId === own
        .category.id).history)
      assert.notInclude(response.text(), foreign.category.name)
      assert.deepEqual(await Promise.all([snapshot(own.budget.id), snapshot(foreign.budget.id)]),
        before)
    })
  }

  for (const report of ['category', 'funding-history'] as const) {
    test(`${report}: unresolved JSON IDs never fallback and valid siblings survive`, async ({
      client, assert }) => {
      const f = await createDomain('missing')
      await writeHistoricalTransactionFixture(f.transaction, { type: report === 'category' ? 5 : 2,
        categories: [
        { categoryId: 2147483647, amount: 999 }, { categoryId: f.category.id, amount: 7 },
      ] })
      await db.table('transaction_categories').insert({ transaction_id: f.transaction.id,
        category_id: f.category.id, amount: 80 })
      const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
        .loginAs(f.user)
      response.assertStatus(200)
      if (report === 'category') { assert
        .equal(response.body().data[0].sum, encodeMonetaryAmount(7));
        assert.equal(response.body().data[0].count, 1) }
      else assert.equal(response.body().data.find((r: { categoryId: number }) => r.categoryId === f
        .category.id).history[0].amount, encodeMonetaryAmount(7))
    })

    test(`${report}: actual SQL is JSON-only, read-only and one aggregate query`, async ({ client,
      assert }) => {
      const f = await createDomain('observe')
      await writeHistoricalTransactionFixture(f.transaction, { type: report ===
        'category' ? 5 : 2 })
      const transactions = await f.budget.related('transactions').createMany(Array.from(
        { length: 25 }, () => ({
        date: DateTime.fromISO('2025-02-01'), type: report === 'category' ? 5 : 2,
        version: 0, deleted: false, sortOrder: 0,
          categories: categoryAllocationsToCents([{ categoryId: f.category.id,
          amount: 10 }]), taxes: [],
      })))
      for (const transaction of transactions) await writeCanonicalTransactionFixture(transaction)
      const before = await snapshot(f.budget.id)
      const queries: { sql: string, bindings?: readonly unknown[] }[] = []
      const listener = (event: { sql: string, bindings?: readonly unknown[] }) => queries.push(
        event)
      const connection = db.connection().getWriteClient()
      connection.on('query', listener)
      let elapsed: number
      try {
        const started = performance.now()
        const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
          .loginAs(f.user)
        elapsed = performance.now() - started
        response.assertStatus(200)
        const rows = response.body().data
        if (report === 'category') { assert.equal(rows[0].sum, encodeMonetaryAmount(260)); assert
          .equal(rows[0].count, 26) }
        else assert.equal(rows.find((r: { categoryId: number }) => r.categoryId === f.category.id)
          .history[0].amount, encodeMonetaryAmount(260))
      } finally { connection.removeListener('query', listener) }
      const aggregates = queries.filter((q) => q.sql.includes('jsonb_to_recordset'))
      assert.lengthOf(aggregates, 1)
      assert.isFalse(queries.some((q) => q.sql.includes('transaction_categories')))
      assert.isFalse(queries.some((q) => /^\s*(insert|update|delete|alter|drop|create|truncate)\b/i
        .test(q.sql)))
      assert.deepEqual(await snapshot(f.budget.id), before)
      // Read-only EXPLAIN ANALYZE of the exact captured, bound report SELECT.
      // Knex emits PostgreSQL $n placeholders; rawQuery accepts ? bindings.
      const explainSql = aggregates[0].sql.replace(/\$\d+/g, '?')
      const plan = await db.rawQuery(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${explainSql}`, [
        ...aggregates[0].bindings ?? []])
      const details = plan.rows[0]['QUERY PLAN'][0]
      console.info('Report performance sanity', JSON.stringify({ report, transactions: 26,
        httpMs: elapsed,
        executionMs: details['Execution Time'], planningMs: details['Planning Time'] }))
    })

    test(`${report}: before/equal/after startDate remains nominal`).with(['2024-12-31',
      '2025-01-01', '2025-01-02'])
      .run(async ({ client, assert }, date) => {
        const f = await createDomain('boundary')
        await writeHistoricalTransactionFixture(f.transaction, { date: DateTime.fromISO(date),
          type: report === 'category' ? 5 : 2 })
        const response = await client.get(`/api/v1/reports/${report}`).qs({ c: f.category.id })
          .loginAs(f.user)
        response.assertStatus(200)
        if (report === 'category') assert
          .equal(response.body().data[0].sum, encodeMonetaryAmount(10))
        else assert.equal(response.body().data
          .find((r: { categoryId: number }) => r.categoryId === f
          .category.id).history[0].amount, encodeMonetaryAmount(10))
      })
  }

  test(
    'Category preserves current name ordering, allocation counts across Transactions and \
accountless nominal rows', async ({ client, assert }) => {
    const f = await createDomain('names')
    await f.category.merge({ name: 'B current' }).save()
    const other = await f.group.related('categories').create({ name: 'A current', type: CategoryType
      .Regular, balanceCents: parseMoneyCents('0.00'), fundingCategories: [] })
    await writeHistoricalTransactionFixture(f.transaction, { categories: [{ categoryId: f.category
      .id, amount: 20 }, { categoryId: f.category.id, amount: 30 }, { categoryId: other.id,
      amount: 4 }] })
    const accountless = await f.budget.related('transactions').create({
      date: f.transaction.date, type: 5, version: 0,
      sortOrder: 0, deleted: false,
      categories: categoryAllocationsToCents([{ categoryId: f.category.id, amount: 5 }]),
        taxes: [] })
    await writeCanonicalTransactionFixture(accountless)
    const response = await client.get('/api/v1/reports/category').qs({ c: [f.category.id, other
      .id] }).loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body().data.map((r: { categoryName: string, sum: string,
      count: number }) => [r.categoryName, r.sum, r.count]),
      [['A current', '4.00', 1], ['B current', '55.00', 3]])
    for (const row of response.body().data) {
      assert.deepEqual(Object.keys(row).sort(), ['categoryName', 'count', 'groupName', 'rowNumber',
        'sum'])
      assert.isString(row.sum); assert.isNumber(row.count)
    }
  })

  test(
    'Funding History uses current replacement net JSON at immutable date and supports Unassigned',
    async ({ client, assert }) => {
    const f = await createDomain('replacement')
    const pool = await f.budget.getFundingPoolCategory()
    const unassigned = await f.budget.getUnassignedCategory()
    await pool.merge({ balanceCents: parseMoneyCents('100.00') }).save()
    const first = await client.post('/api/v1/category-transfer').json(categoryTransferRequest({
      date: '2025-01-31', type: 2,
      categories: [{ categoryId: f.category.id, amount: 3 }, { categoryId: pool.id, amount: -
        3 }] })).loginAs(f.user)
    first.assertStatus(200)
    const id = first.body().data.transaction.id
    const replacement = await client.patch(`/api/v1/category-transfer/${id}`).json(
      categoryTransferRequest({ date: '2025-01-31', type: 2,
      categories: [{ categoryId: f.category.id, amount: 2, baseAmount: 7 }, { categoryId: unassigned
        .id, amount: 1 }, { categoryId: pool.id, amount: -3 }] })).loginAs(f.user)
    replacement.assertStatus(200)
    const rejected = await client.patch(`/api/v1/category-transfer/${id}`).json(
      categoryTransferRequest({ date: '2025-02-01', type: 2,
      categories: [{ categoryId: f.category.id, amount: 2 }, { categoryId: pool.id, amount: -
        2 }] })).loginAs(f.user)
    rejected.assertStatus(422)
    const before = await snapshot(f.budget.id)
    const response = await client.get('/api/v1/reports/funding-history').loginAs(f.user)
    response.assertStatus(200)
    assert.deepEqual(response.body().data
      .find((r: { categoryId: number }) => r.categoryId === f.category
      .id).history, [{ year: 2025, month: 1, amount: encodeMonetaryAmount(2) }])
    assert.deepEqual(response.body().data
      .find((r: { categoryId: number }) => r.categoryId === unassigned
      .id).history, [{ year: 2025, month: 1, amount: encodeMonetaryAmount(1) }])
    assert.deepEqual(await snapshot(f.budget.id), before)
  })

  test(
    'Category preserves inclusive date range, current names, multiple Categories and explicit \
Unassigned', async ({ client, assert }) => {
    const f = await createDomain('range')
    const unassigned = await f.budget.getUnassignedCategory()
    await writeHistoricalTransactionFixture(f.transaction, { categories: [
      { categoryId: f.category.id, amount: 20 }, { categoryId: f.category.id, amount: 30 },
      { categoryId: unassigned.id, amount: -5 },
    ] })
    const response = await client.get('/api/v1/reports/category').qs({
      c: [f.category.id, unassigned.id], startDate: '2025-02-01', endDate: '2025-02-01',
    }).loginAs(f.user)
    response.assertStatus(200)
    assert.equal(response.body().data
      .find((r: { categoryName: string }) => r.categoryName === f.category
      .name).count, 2)
    assert.equal(response.body().data
      .find((r: { categoryName: string }) => r.categoryName === unassigned
      .name).sum, encodeMonetaryAmount(-5))
    const excluded = await client.get('/api/v1/reports/category').qs({ c: f.category.id, startDate:
      '2025-02-02' }).loginAs(f.user)
    excluded.assertStatus(200); assert.deepEqual(excluded.body().data, [])
  })

  test('Funding History reads generated net rows without recalculating rules').with([
    { rule: 'fixed', amount: 12 }, { rule: 'percentage', amount: 2.55 },
    { rule: 'goal', amount: 7 }, { rule: 'mixed', amount: 21.55 },
    { rule: 'transfer-inclusive', amount: 0.30000000000000004 },
  ]).run(async ({ client, assert }, scenario) => {
    const f = await createDomain(scenario.rule)
    await writeHistoricalTransactionFixture(f.transaction, { type: 2, categories: [{ categoryId: f
      .category.id, amount: encodeMonetaryAmount(scenario.amount) }] })
    const response = await client.get('/api/v1/reports/funding-history').loginAs(f.user)
    response.assertStatus(200)
    assert.equal(response.body().data
      .find((r: { categoryId: number }) => r.categoryId === f.category.id)
      .history[0].amount, encodeMonetaryAmount(scenario.amount))
  })

  test('Funding History reads replacement net rows at persisted date, never baseAmount or Pool',
    async ({ client, assert }) => {
    const f = await createDomain('net')
    const pool = await f.budget.getFundingPoolCategory()
    const netRow = { categoryId: f.category.id, amount: 2, baseAmount: 3 }
    await writeHistoricalTransactionFixture(f.transaction, { type: 2, categories: [
      netRow,
      { categoryId: pool.id, amount: -2 },
    ] })
    const response = await client.get('/api/v1/reports/funding-history').loginAs(f.user)
    response.assertStatus(200)
    assert.isUndefined(response.body().data
      .find((r: { categoryId: number }) => r.categoryId === pool
      .id))
    assert.deepEqual(response.body().data
      .find((r: { categoryId: number }) => r.categoryId === f.category
      .id).history,
      [{ year: 2025, month: 2, amount: encodeMonetaryAmount(2) }])
  })
})

async function snapshot(budgetId: number) {
  return Promise.all([
    db.from('transactions').where('application_id', budgetId).orderBy('id'),
    db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
      .where('groups.application_id', budgetId).orderBy('categories.id'),
    db.from('transaction_categories').orderBy('id'),
    db.from('accounts').orderBy('id'), db.from('account_transactions').orderBy('id'),
    db.from('statements').orderBy('id'), db.from('transaction_logs').orderBy('id'),
  ])
}
