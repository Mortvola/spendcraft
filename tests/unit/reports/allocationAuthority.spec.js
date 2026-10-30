import { addMoneyCents, parseMoneyCents, formatMoneyCents } from '../../../common/moneyCents.ts'
import { encodeMonetaryAmount } from '../../../app/services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { TransactionType, CategoryType, TrackingType } from '../../../common/ResponseTypes.ts'

// Execute actual report methods with an inert adapter for their current
// JSON/relational join/filter/aggregate subset. This is NOT PostgreSQL execution.
const file = 'app/Controllers/Http/ReportController.ts'
async function sourceMethod(name, context = {}) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  const declaration = source.statements.find(ts.isClassDeclaration).members.find((node) => ts
    .isMethodDeclaration(node) && node.name.getText(source) === name)
  const body = declaration.body.getText(source)
  const expression = `(async function(${declaration.parameters.map((p) => p.getText(source)).join(
    ',')}) ${body})`
  return { body, run: runInNewContext(ts.transpileModule(expression, { compilerOptions: { target: ts
    .ScriptTarget.ES2022 } }).outputText,
    { TransactionType, CategoryType, TrackingType, DateTime, addMoneyCents, parseMoneyCents,
      formatMoneyCents, ...context }) }
}
function adapter({ categories = [{ id: 10, name: 'Food', groupName: 'Living', budgetId: 1 }],
  transaction = { id: 1, type: 5, date: '2026-02-10', budgetId: 1, amount: 50, categories: [{
    categoryId: 10, amount: 50 }] } } = {}) {
  const queries = []
  function query() {
    const q = { source: '', selects: [], filters: [], joins: [], transferId: undefined,
      select(...values) { this.selects.push(...values); return this },
      from(value) { this.source = value; return this },
      join(...values) { this.joins.push(values); return this },
      joinRaw(value) { this.joins.push([value]); return this },
      leftJoin(table, callback) {
        this.joins.push([table])
        if (typeof callback !== 'function') return this
        const join = { on() { return this }, andOnVal: (_column, _op, value) => { this.transferId =
          value; return join } }
        callback(join); return this
      },
      where(column, operator, value) {
        this.filters.push({ column, operator: value === undefined ? '=' : operator,
          value: value === undefined ? operator : value }); return this
      },
      andWhere(...values) { return this.where(...values) },
      whereIn(column, value) { this.filters.push({ column, operator: 'in', value }); return this },
      andWhereIn(...values) { return this.whereIn(...values) },
      with(_name, table) { this.transferId = table.filters.find((filter) => filter.column ===
        'transfer.categoryId')?.value; return this },
      sum() { return this }, as() { return this }, groupBy() { return this }, groupByRaw() {
        return this }, orderBy() { return this },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const accepts = (row) => this.filters.every(({ column, operator, value }) => {
            if (!(column in row)) throw new Error(`Unsupported inert column ${column}`)
            switch (operator) {
              case '=': return row[column] === value
              case '!=': return row[column] !== value
              case 'in': return value.includes(row[column])
              case '>=': return row[column] >= value
              case '<=': return row[column] <= value
              default: throw new Error(`Unsupported inert operator ${operator}`)
            }
          })
          if (this.source === 'transactions as t' && this.joins.some(([value]) => typeof value ===
            'string' && value.includes('jsonb_to_recordset'))) {
            const result = new Map()
            for (const split of transaction.categories ?? []) {
              const category = categories.find((c) => c.id === split.categoryId)
              if (!category) continue // Current INNER JOIN semantics.
              const row = { 'g.application_id': category.budgetId, 'c.id': category.id,
                't.type': transaction.type, 't.date': transaction.date,
                  't.application_id': transaction.budgetId }
              if (!accepts(row)) continue
              const key = `${category.groupName}:${category.name}`
              const item = result.get(key) ?? { groupName: category.groupName,
                categoryName: category.name, sum: 0, count: 0 }
              item.sum += split.amount; item.count++; result.set(key, item)
            }
            return [...result.values()]
          }
          if (this.source === 'transactions as t') {
            if (!this.selects.some((sql) => sql.includes(
              'at.amount - COALESCE(tc.amount, 0)'))) throw new Error('Income algorithm changed')
            const row = { 't.application_id': transaction.budgetId, 'a.tracking': TrackingType
              .Transactions, 't.type': transaction.type }
            if (!accepts(row)) return []
            const splits = (transaction.categories ?? []).filter((s) => s.categoryId === this
              .transferId)
            const net = transaction.amount - splits.reduce((sum, s) => sum + s.amount, 0)
            return [{ month: '2026-02', income: transaction.amount >= 0 ? String(net) : '0',
              expenses: transaction.amount < 0 ? String(net) : '0' }]
          }
          throw new Error(`Unsupported inert source ${this.source}`)
        }).then(resolve, reject)
      },
    }
    queries.push(q); return q
  }
  return { db: { query, raw: (value) => value }, queries }
}

test.group('Allocation report authority characterization without DB', () => {
  test('Category report exclusively consumes current JSON, including duplicates').with([
    { legacyAmount: 50, json: [50], expected: 50, count: 1 },
    { legacyAmount: null, json: [50], expected: 50, count: 1 },
    { legacyAmount: 50, json: [], expected: null, count: 0 },
    { legacyAmount: 20, json: [50], expected: 50, count: 1 },
    { legacyAmount: null, json: [20, 30], expected: 50, count: 2 },
    { legacyAmount: null, json: [], expected: null, count: 0 },
  ]).run(async ({ assert }, scenario) => {
    const f = adapter({ legacy: scenario.legacyAmount === null ? [] : [{ transactionId: 1,
      categoryId: 10, amount: scenario.legacyAmount }],
      transaction: { id: 1, type: 5, date: '2026-02-10', budgetId: 1, categories: scenario.json.map(
        (amount) => ({ categoryId: 10, amount })) } })
    const { run } = await sourceMethod('category', { db: f.db })
    const result = await run({ id: 1 }, '2026-01-01', '2026-12-31', [10])
    if (scenario.expected === null) assert.deepEqual(result, [])
    else { assert.equal(result[0].sum, scenario.expected); assert.equal(result[0].count, scenario
      .count) }
    assert.equal(f.queries[0].source, 'transactions as t')
  })
  test('Category report does not establish applied-effect eligibility', async ({ assert }) => {
    const f = adapter({ legacy: [{ transactionId: 1, categoryId: 10, amount: 50 }], transaction: {
      id: 1, type: 5, date: '2026-02-10', budgetId: 1, categories: [{ categoryId: 10, amount: 50 }],
        deleted: true, pending: true, startDate: '2026-03-01' } })
    const { run } = await sourceMethod('category', { db: f.db })
    assert.equal((await run({ id: 1 }, '2026-01-01', '2026-12-31', [10]))[0].sum, 50)
  })
  test('conceptual missing Category INNER JOIN drops even a legacy allocation', async ({
    assert }) => {
    const f = adapter({ categories: [], legacy: [{ transactionId: 1, categoryId: 10,
      amount: 50 }] })
    const { run } = await sourceMethod('category', { db: f.db })
    assert.deepEqual(await run({ id: 1 }, '', '', [10]), [])
  })
  test('Category query rejects foreign Transaction despite owned Category filter', async ({
    assert }) => {
    const f = adapter({ legacy: [{ transactionId: 1, categoryId: 10, amount: 90 }],
      transaction: { id: 1, type: 5, date: '2026-02-10', budgetId: 2, categories: [{ categoryId: 10,
        amount: 90 }] } })
    const { run } = await sourceMethod('category', { db: f.db })
    assert.deepEqual(await run({ id: 1 }, '', '', [10]), [])
    assert.isTrue(f.queries[0].filters.some((filter) => filter.column === 't.application_id'))
  })
  test('Income movement source stays linked amounts; JSON alone defines transfer deduction').with([
    { legacy: [], json: [50], expected: 0 },
    { legacy: [{ transactionId: 1, categoryId: 99, amount: 50 }], json: [], expected: 50 },
    { legacy: [{ transactionId: 1, categoryId: 99, amount: 20 }], json: [50], expected: 0 },
    { legacy: [{ transactionId: 1, categoryId: 99, amount: 50 }], json: [20, 30], expected: 0 },
    { legacy: [{ transactionId: 1, categoryId: 99, amount: 50 }], json: [20], expected: 30 },
    { legacy: [{ transactionId: 1, categoryId: 99, amount: 50 }], json: [50], expected: 0 },
  ]).run(async ({ assert }, scenario) => {
    const f = adapter({ legacy: scenario.legacy, transaction: { id: 1, type: 5, budgetId: 1,
      amount: 50,
      categories: scenario.json.map((amount) => ({ categoryId: 99, amount })) } })
    const { run } = await sourceMethod('incomeVsExpenses', { db: f.db })
    const rows = await run({ id: 1, getAccountTransferCategory: async () => ({ id: 99 }) })
    assert.equal(rows[0][1], scenario.expected * 100)
  })
  test('Funding History exclusively expands net JSON, with no fallback').with([
    { json: [50], legacy: null, expected: 50 }, { json: [50], legacy: 20, expected: 50 },
    { json: [50], legacy: 50, expected: 50 }, { json: [], legacy: 50, expected: null },
    { json: [], legacy: null, expected: null }, { json: [20, 30], legacy: 99, expected: 50 },
  ]).run(async ({ assert }, scenario) => {
    let sql = ''
    const { run } = await sourceMethod('fundingHistory', { db: {
      raw(value) { sql = value; return value },
      query() { return { select() { return this }, from() { return this }, join() { return this },
        where() { return this }, andWhere() { return this }, orderBy() { return this },
        then(resolve) {
          if (!sql.includes('sum(allocation.amount)') || !sql.includes(
            'jsonb_to_recordset(t.categories)')) throw new Error('Unexpected funding source')
          return Promise.resolve([{ categoryId: 10, history: scenario.json.length
            ? [{ year: 2026, month: 2, amount: scenario.json.reduce((sum, n) => sum + n,
              0) }] : null }]).then(resolve)
        } }
      },
    } })
    const rows = await run({ id: 1 })
    assert.equal(rows[0].history?.[0].amount ?? null, scenario.expected)
    assert.include(sql, 't.type = 2'); assert.include(sql, 't.application_id = g.application_id')
  })
  test('Category sums multiple Categories and explicit Unassigned without multiplication', async ({
    assert }) => {
    const f = adapter({ categories: [{ id: 10, name: 'Food', groupName: 'Living', budgetId: 1 },
      { id: 11, name: 'Unassigned', groupName: 'System', budgetId: 1 }],
      transaction: { id: 1, type: 0, budgetId: 1, date: '2026-02-10', categories: [
        { categoryId: 10, amount: 20 }, { categoryId: 10, amount: 30 }, { categoryId: 11, amount: -
          7 },
        { categoryId: 999, amount: 99 },
      ] } })
    const { run } = await sourceMethod('category', { db: f.db })
    const rows = await run({ id: 1 }, '', '', [10, 11])
    assert.deepEqual(rows.map(({ sum, count }) => [sum, count]), [[50, 2], [-7, 1]])
  })

})


test('report endpoints encode only monetary values without changing calculation results').with([
  { report: 'networth', method: 'networth',
    rows: [['date', 'Account'], ['2026-10-01', -0.125], ['2026-10-02', 0]],
    expected: [['date', 'Account'], ['2026-10-01', '-0.12'], ['2026-10-02', '0.00']] },
  { report: 'payee', method: 'payee', rows: [{ rowNumber: '1', name: 'Shop', paymentChannel:
    'online', sum: 0.1 + 0.2, count: 3 }],
    expected: [{ rowNumber: '1', name: 'Shop', paymentChannel: 'online', sum: '0.30', count: 3 }] },
  { report: 'category', method: 'category', rows: [{ rowNumber: '1', groupName: 'Group',
    categoryName: 'Food', sum: 1.005, count: 2 }],
    expected: [{ rowNumber: '1', groupName: 'Group', categoryName: 'Food', sum: '1.00',
      count: 2 }] },
  { report: 'income-vs-expenses', method: 'incomeVsExpenses', rows: [['2026-10', 1025, -12, 1013]],
    expected: [['2026-10', '10.25', '-0.12', '10.13']] },
  { report: 'funding-history', method: 'fundingHistory', rows: [{ categoryId: 10, history: [{
    year: 2026, month: 10, amount: 0.125 }] },
    { categoryId: 11, history: null }], expected: [{ categoryId: 10, history: [{ year: 2026,
      month: 10, amount: '0.13' }] },
    { categoryId: 11, history: null }] },
  { report: 'budget-progress', method: 'budgetProgress', rows: [['2026-10-01', 0.1 + 0.2, [1, 2]]],
    expected: [['2026-10-01', '0.30', [1, 2]]] },
]).run(async ({ assert }, scenario) => {
  const before = globalThis.structuredClone(scenario.rows)
  const { run } = await sourceMethod('get', { encodeMonetaryAmount, DateTime,
    parseReportIds: () => undefined,
    ReportController: { [scenario.method]: async () => scenario.rows },
  })
  const rows = await run({ request: { params: () => ({ report: scenario.report }), qs: () => ({ m:
    '10-2026' }) },
    auth: { user: { related: () => ({ query: () => ({ firstOrFail: async () => ({
      id: 1 }) }) }) } } })
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), scenario.expected)
  assert.deepEqual(scenario.rows, before)
})
