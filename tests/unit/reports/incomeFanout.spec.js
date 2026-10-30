import { addMoneyCents, parseMoneyCents, formatMoneyCents } from '../../../common/moneyCents.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { legacyIncomeBody } from '../../fixtures/reports/legacyIncomeBody.js'

// Execute actual old/new method bodies through a small relational adapter.
// It models joins/grouping/filtering, not PostgreSQL precision or query plans.
async function currentBody() {
  const s = ts.createSourceFile('report.ts', await readFile(
    'app/Controllers/Http/ReportController.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const body = s.statements.find(ts.isClassDeclaration).members.find((n) =>
    ts.isMethodDeclaration(n) && n.name.getText(s) === 'incomeVsExpenses').body.getText(s)
  const parser = s.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name.text === 'reportAmountCents').getText(s)
  return `{ ${parser} ${body.slice(1)}`
}
const tx = (id, changes = {}) => ({ id, application_id: 1, type: 5, date: '2025-02-01',
  deleted: false, ...changes })
const link = (id, transactionId, amount, accountId = 1) => ({ id, transaction_id: transactionId,
  account_id: accountId, amount, pending: false })
const transfer = (id, amount, transactionId = 1, categoryId = 99) => ({ id, amount,
  transaction_id: transactionId, category_id: categoryId })
function domain(transfers = [], changes = {}) {
  const data = { transactions: [tx(1)], account_transactions: [link(1, 1, 50)],
    accounts: [{ id: 1, tracking: 'Transactions', closed: true, start_date: '2026-01-01' }],
    transaction_categories: transfers, ...changes }
  for (const transaction of data.transactions) transaction.categories ??= transfers
    .filter((row) => row.transaction_id === transaction.id)
    .map((row) => ({ categoryId: row.category_id, amount: row.amount }))
  return data
}
function engine(tables) {
  const builders = [], observed = { movements: [], transfers: [], executions: 0 }
  const prefix = (rows, alias) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([
    key, value]) => [`${alias}.${key}`, value])))
  function query() {
    const q = { source: '', alias: '', ctes: new Map(), selections: [], sums: [], groups: [],
      filters: [], joins: [],
      from(name) { this.source = name; return this }, as(name) { this.alias = name; return this },
      with(name, builder) { this.ctes.set(name, builder); return this },
      select(...values) { this.selections.push(...values); return this }, sum(value) { this.sums
        .push(value); return this },
      join(table, a, b) { this.joins.push({ table, a, b }); return this },
      joinRaw(sql) { this.joins.push({ raw: sql }); return this },
      leftJoin(table, a, b) {
        const join = { table, a, b, left: true, extra: [] }
        if (typeof a === 'function') {
          a({ on(x, y) { join.a = x; join.b = y; return this }, andOnVal(key, _op, value) { join
            .extra.push([key, value]); return this } })
        }
        this.joins.push(join); return this
      },
      where(key, op, value) { this.filters.push([key, value === undefined ? '=' : op,
        value === undefined ? op : value]); return this },
      andWhere(...args) { return this.where(...args) }, groupBy(value) { this.groups.push(value);
        return this },
      groupByRaw(value) { this.groups.push(value); return this }, orderBy() { return this },
      rows() {
        const [name, alias = name] = this.source.split(' as ')
        let rows = prefix(tables[name], alias)
        for (const join of this.joins) {
          if (join.raw) {
            if (!join.raw.includes(
              'jsonb_to_recordset(transfer_transaction.categories)')) throw new Error(
              'Unexpected JSON source')
            rows = rows.flatMap((row) => (row['transfer_transaction.categories'] ?? []).map((
              allocation, index) => ({
              ...row, 'transfer.categoryId': allocation.categoryId, 'transfer.amount': allocation
                .amount,
              'transfer.id': `${row['transfer_transaction.id']}:${index}`,
            })))
            continue
          }
          const right = typeof join.table === 'string' ? (() => {
            const [table, as = table] = join.table.split(' as '); return prefix(this.ctes.has(
              table) ? this.ctes.get(table).rows() : tables[table], as)
          })() : prefix(join.table.rows(), join.table.alias)
          rows = rows.flatMap((row) => {
            const matches = right.map((r) => ({ ...row, ...r })).filter((r) => r[join.a] === r[join
              .b]
              && join.extra?.every(([key, value]) => r[key.includes(
                '.') ? key : `tc.${key}`] === value) !== false)
            return matches.length ? matches : join.left ? [row] : []
          })
        }
        rows = rows.filter((row) => this.filters.every(([key, op, value]) => {
          if (!(key in row)) throw new Error(`Unknown filter ${key}`)
          if (op === '=') return row[key] === value
          if (op === '!=') return row[key] !== value
          throw new Error(`Unsupported filter ${op}`)
        }))
        if (this.sums.length) {
          observed.transfers = rows.map((r) => r['transfer.id']).sort()
          const groups = new Map()
          for (const row of rows) {
            const id = row[this.groups[0]]
            const sum = groups.get(id) ?? { transaction_id: id, amount: 0 }
            sum.amount += row['transfer.amount']; groups.set(id, sum)
          }
          return [...groups.values()]
        }
        if (!this.selections.some((s) => s.includes('COALESCE(tc.amount, 0)'))) throw new Error(
          'Unknown report formula')
        observed.movements = [...new Set(rows.map((r) => r['at.id']))].sort((a, b) => a - b)
        if (this.ctes.size === 0) {
          observed.transfers = [...new Set(rows.map((r) => r['tc.id']).filter((id) =>
            id !== undefined))].sort((a, b) => a - b)
        }
        const result = new Map()
        for (const row of rows) {
          const month = row['t.date'].slice(0, 7)
          const total = result.get(month) ?? { month, income: 0, expenses: 0 }
          const amount = row['at.amount'] - (row['tc.amount'] ?? 0)
          total[row['at.amount'] >= 0 ? 'income' : 'expenses'] += amount
          result.set(month, total)
        }
        return [...result.values()].sort((a, b) => a.month.localeCompare(b.month))
          .map(row => ({ ...row, income: row.income.toFixed(2),
            expenses: row.expenses.toFixed(2) }))
      },
      then(resolve, reject) { observed.executions++; return Promise.resolve().then(() => this.rows(
        )).then(resolve, reject) },
    }
    builders.push(q); return q
  }
  return { db: { query, raw: (s) => s }, observed, builders }
}
async function run(tables, old = false) {
  const f = engine(tables)
  const body = old ? legacyIncomeBody : await currentBody()
  const method = runInNewContext(ts.transpileModule(`(async function(budget) ${body})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { db: f.db, addMoneyCents, parseMoneyCents, formatMoneyCents,
      TrackingType: { Transactions: 'Transactions' }, TransactionType: {
      STARTING_BALANCE: 4 } })
  const result = await method({ id: 1, getAccountTransferCategory: async () => ({ id: 99 }) })
  return { ...f, result, body }
}

test.group('Income transfer cardinality without database', () => {
  test('equivalent partitions and legitimate duplicate values').with([
    { amounts: [50], expected: 0 }, { amounts: [20, 30], expected: 0 },
    { amounts: [], expected: 50 }, { amounts: [20], expected: 30 },
    { amounts: [10, 15, 25], expected: 0 }, { amounts: [20, 20], expected: 10 },
    { amounts: [0, 0], expected: 50 }, { amounts: [50, 0], expected: 0 },
  ]).run(async ({ assert }, scenario) => {
    const f = await run(domain(scenario.amounts.map((amount, i) => transfer(i + 1, amount))))
    assert.deepEqual(f.result, [['2025-02', scenario.expected * 100, 0, scenario.expected * 100]])
    assert.equal(f.observed.executions, 1)
  })
  test('original 50 versus20+30 defect is characterized alongside correction', async ({ assert }) =>
    {
    const one = domain([transfer(1, 50)]), split = domain([transfer(1, 20), transfer(2, 30)])
    assert.equal((await run(one, true)).result[0][1], 0)
    assert.equal((await run(split, true)).result[0][1], 50)
    assert.deepEqual((await run(one)).result, (await run(split)).result)
  })
  test('classification uses original movement sign even if subtraction changes net sign').with([
    { amount: -50, transfers: [-20, -30], income: 0, expenses: 0 },
    { amount: -50, transfers: [20, 20], income: 0, expenses: -90 },
    { amount: 50, transfers: [-20, -20], income: 90, expenses: 0 },
    { amount: 50, transfers: [80], income: -30, expenses: 0 },
    { amount: -50, transfers: [-80], income: 0, expenses: 30 },
    { amount: 0, transfers: [20, 20], income: -40, expenses: 0 },
  ]).run(async ({ assert }, s) => {
    const f = await run(domain(s.transfers.map((n, i) => transfer(i + 1, n)), {
      account_transactions: [link(1, 1, s.amount)] }))
    assert.deepEqual(f.result, [['2025-02', s.income * 100, s.expenses * 100,
      (s.income + s.expenses) * 100]])
  })
  test(
    'multiple movements, Accounts and same-Transaction links retain existing per-link subtraction',
    async ({ assert }) => {
    const data = domain([transfer(1, 20), transfer(2, 30), transfer(3, -10, 2)], {
      transactions: [tx(1), tx(2), tx(3, { date: '2025-03-01' })],
      accounts: [{ id: 1, tracking: 'Transactions' }, { id: 2, tracking: 'Transactions' }],
      account_transactions: [link(1, 1, 50), link(2, 1, -50, 2), link(3, 2, -40, 2), link(4, 3, 8)],
    })
    const f = await run(data)
    assert.deepEqual(f.result, [['2025-02', 0, -13000, -13000], ['2025-03', 800, 0, 800]])
    assert.deepEqual(f.observed.movements, [1, 2, 3, 4])
  })
  test('movement selection is unchanged; JSON matching Category/Budget defines deduction', async ({
    assert }) => {
    const data = domain([transfer(1, 20), transfer(2, 30), transfer(3, 99, 2), transfer(4, 999, 1,
      100), transfer(5, 999, 3)], {
      transactions: [tx(1, { deleted: true }), tx(2, { type: 4 }), tx(3, { application_id: 2 }), tx(
        4)],
      accounts: [{ id: 1, tracking: 'Transactions', closed: true }, { id: 2, tracking:
        'Balances' }],
      account_transactions: [{ ...link(1, 1, 50), pending: true }, link(2, 2, 7), link(3, 3, 8),
        link(4, 4, 9, 2)],
    })
    const before = await run(data, true), after = await run(data)
    assert.deepEqual(before.observed.movements, after.observed.movements)
    assert.deepEqual(before.builders.at(-1).filters, after.builders.at(-1).filters)
    assert.deepEqual(before.builders.at(-1).groups, after.builders.at(-1).groups)
    assert.deepEqual(before.builders.at(-1).selections, after.builders.at(-1).selections)
    // JSON allocation identity is Transaction + array index, not legacy row ID.
    assert.deepEqual(after.observed.transfers, ['1:0', '1:1', '2:0'])
    assert.deepEqual(before.observed.transfers, [1, 2])
    assert.deepEqual(after.result, [['2025-02', 0, 0, 0]])
    assert.deepEqual(data.transactions[0].categories, [{ categoryId: 99, amount: 20 }, {
      categoryId: 99, amount: 30 }, { categoryId: 100, amount: 999 }])
  })
  test('empty selected movements keep empty response', async ({ assert }) => {
    assert.deepEqual((await run(domain([], { account_transactions: [] }))).result, [])
  })
  test('Transaction calendar date still controls period and ordering', async ({ assert }) => {
    const f = await run(domain([], { transactions: [tx(1, { date: '2025-01-01' }), tx(2, { date:
      '2024-12-31' })],
      account_transactions: [link(1, 1, 50), link(2, 2, -20)] }))
    assert.deepEqual(f.result, [['2024-12', 0, -2000, -2000], ['2025-01', 5000, 0, 5000]])
  })
  test('current JSON deduction excludes stale/missing/legacy-only attribution').with([
    { json: [50], legacy: [], expected: 0 }, { json: [50], legacy: [20], expected: 0 },
    { json: [50], legacy: [50], expected: 0 }, { json: [], legacy: [50], expected: 50 },
    { json: [], legacy: [], expected: 50 }, { json: [20, 30], legacy: [99], expected: 0 },
  ]).run(async ({ assert }, s) => {
    const f = await run(domain(s.legacy.map((amount, i) => transfer(i + 1, amount)), {
      transactions: [tx(1, { categories: s.json.map((amount) => ({ categoryId: 99, amount })) })],
    }))
    assert.deepEqual(f.result, [['2025-02', s.expected * 100, 0, s.expected * 100]])
  })
  test('source contract uses scoped JSON deduction and retains original selectors/response', async (
    { assert }) => {
    const f = await run(domain())
    const aggregate = f.builders[0]
    assert.equal(aggregate.source, 'transactions as transfer_transaction')
    assert.deepEqual(aggregate.groups, ['transfer_transaction.id'])
    assert.deepEqual(aggregate.sums, ['transfer.amount as amount'])
    assert.deepEqual(aggregate.filters, [['transfer_transaction.application_id', '=', 1], [
      'transfer.categoryId', '=', 99]])
  })
})


async function totals(rows) {
  const query = { from() { return this }, joinRaw() { return this }, select() { return this },
    sum() { return this }, where() { return this }, andWhere() { return this },
    groupBy() { return this }, with() { return this }, join() { return this },
    leftJoin() { return this }, groupByRaw() { return this }, orderBy() { return this },
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject) } }
  const method = runInNewContext(ts.transpileModule(`(async function(budget) ${await currentBody(
    )})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    db: { query: () => query, raw: value => value }, addMoneyCents, parseMoneyCents,
    TrackingType: { Transactions: 'Transactions' }, TransactionType: { STARTING_BALANCE: 4 },
  })
  return method({ id: 1, getAccountTransferCategory: async () => ({ id: 99 }) })
}

test.group('Income report exact SQL totals without a database', () => {
  test('SQL totals stay in cents through exact net addition', async ({ assert }) => {
    const result = await totals([
      { month: '2025-01', income: '0.10', expenses: '0.2' },
      { month: '2025-02', income: '0.30', expenses: '-0.20' },
      { month: '2025-03', income: '0.10', expenses: '-0.10' },
      { month: '2025-04', income: '0', expenses: '-1' },
      { month: '2025-05', income: '90071992547409.91', expenses: '-90071992547409.91' },
    ])
    assert.deepEqual(result, [['2025-01', 10, 20, 30], ['2025-02', 30, -20, 10],
      ['2025-03', 10, -10, 0], ['2025-04', 0, -100, -100],
      ['2025-05', Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0]])
    assert.deepEqual(await totals([]), [])
  })

  test('invalid totals and unsafe net results reject').with([
    { income: '0.001', expenses: '0' }, { income: 'NaN', expenses: '0' },
    { income: 0.1, expenses: '0' }, { income: null, expenses: '0' },
    { income: '90071992547409.92', expenses: '0' },
    { income: '90071992547409.91', expenses: '0.01' },
  ]).run(async ({ assert }, values) => {
    await assert.rejects(() => totals([{ month: '2025-01', ...values }]))
  })
})
