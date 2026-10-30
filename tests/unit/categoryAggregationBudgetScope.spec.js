import {
  addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, moneyCentsFromInteger,
} from
  '../../common/moneyCents.ts'
import { encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { TransactionType, CategoryType } from '../../common/ResponseTypes.ts'

// Evaluate the actual production SQL templates and binding expressions, without
// bootstrapping Adonis or connecting to a database.
async function aggregates(file, methodName, budgetId) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  let method
  function find(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === methodName) method = node
    ts.forEachChild(node, find)
  }
  find(source)
  if (!method) throw new Error(`Missing ${methodName}`)
  const calls = []
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'joinRaw') {
      const expression = `[${node.arguments.map((arg) => arg.getText(source)).join(',')}]`
      const [sql, bindings] = runInNewContext(ts.transpileModule(expression,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
        budget: { id: budgetId }, TransactionType,
        firstDayOfMonth: DateTime.fromISO('2025-03-01'),
        firstDayOfPreviousMonth: DateTime.fromISO('2025-02-01'),
      })
      calls.push({ sql, bindings: Array.from(bindings ?? []) })
    }
    ts.forEachChild(node, visit)
  }
  visit(method)
  // Chained calls are visited from the outermost (last) join inward.
  return calls.reverse()
}

function assertScope(assert, { sql, bindings }, budgetId) {
  const match = /\band t\.application_id = \?/.exec(sql)
  assert.isNotNull(match, 'Transaction aggregation must filter its owning Budget')
  const budgetIndex = (sql.slice(0, match.index).match(/\?/g) ?? []).length
  assert.equal(bindings[budgetIndex], budgetId)
  assert.equal((sql.match(/\?/g) ?? []).length, bindings.length)
  assert.include(sql, 'and t.deleted = false')
  assert.include(sql, 'group by transCats."categoryId"')
}

test.group('Category allocation aggregation Budget scoping (no database)', () => {
  test('all four month summary aggregates bind the authorized Budget').with([7, 19])
    .run(async ({ assert }, budgetId) => {
      const calls = await aggregates('app/Controllers/Http/CategoriesController.ts', 'get',
        budgetId)
      assert.lengthOf(calls, 4)
      for (const call of calls) assertScope(assert, call, budgetId)
      assert.deepEqual(calls.map((call) => call.bindings), [
        ['2025-03-01', budgetId],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.FUNDING_TRANSACTION, TransactionType
          .REBALANCE_TRANSACTION],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.FUNDING_TRANSACTION],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.REBALANCE_TRANSACTION],
      ])
    })

  test('balance check aggregates only the Budget currently being examined').with([7, 19])
    .run(async ({ assert }, budgetId) => {
      const calls = await aggregates('commands/CheckBalances.ts', 'checkCategoryBalances', budgetId)
      assert.lengthOf(calls, 1)
      assertScope(assert, calls[0], budgetId)
      assert.deepEqual(calls[0].bindings, [budgetId])
      assert.include(calls[0].sql, '(a.start_date is null OR t.date >= a.start_date)')
    })
})


async function monthlySummary(balance, extras) {
  const file = 'app/Controllers/Http/CategoriesController.ts'
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  let method
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'get') method = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  const query = { whereHas() { return this }, joinRaw() { return this },
    then(resolve, reject) { return Promise.resolve([{ id: 1, name: 'Summary', balance,
      $extras: extras }]).then(resolve, reject) } }
  const get = runInNewContext(ts.transpileModule(`(async function(${method.parameters.map(p =>
    p.getText(source)).join(',')}) ${method.body.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { DateTime, Category: { query: () => query }, TransactionType,
    encodeMonetaryAmount,
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents })
  return get({ request: { qs: () => ({ date: '2025-03-15' }) }, auth: { user: { related: () => ({
    query: () => ({ firstOrFail: async () => ({ id: 7 }) }),
  }) } } })
}

test.group('Monthly Category summary cents without a database', () => {
  test('exact subtraction and aggregate formatting preserve signed decimal text')
    .with([1, -1]).run(async ({ assert }, sign) => {
      const prefix = sign < 0 ? '-' : ''
      const result = await monthlySummary(sign * 0.3, { sum: `${prefix}0.20`,
        previousSum: `${prefix}0.10`, previousFunding: `${prefix}0.2`,
        previousBaseAmount: `${prefix}1`, previousCatTransfers: `${prefix}0.30` })
      assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [{ id: 1, name: 'Summary',
        balance: `${prefix}0.10`, previousSum: `${prefix}0.10`, previousFunding: `${prefix}0.20`,
        previousBaseAmount: `${prefix}1.00`, previousCatTransfers: `${prefix}0.30` }])
    })

  test('missing and null aggregates and SQL whole-number zero format as zero', async ({ assert }) =>
    {
    const result = await monthlySummary(0, { sum: null, previousSum: '0',
      previousBaseAmount: null })
    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [{ id: 1, name: 'Summary',
      balance: '0.00', previousSum: '0.00', previousFunding: '0.00', previousBaseAmount: '0.00',
      previousCatTransfers: '0.00' }])
  })

  test('unsafe, malformed and subcent SQL totals reject instead of rounding')
    .with(['90071992547409.92', 'NaN', '0.001', '1.2.3', 0.2])
    .run(async ({ assert }, total) => {
      await assert.rejects(() => monthlySummary(0.3, { sum: total }))
    })
})


async function fundingProposal(changes = {}) {
  const file = 'app/Models/Budget.ts'
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  let method
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'getProposedFunding') {
      method = node
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  const category = { id: 1, balance: 0, fundingAmount: 0.29, useGoal: true, suspended: false,
    goalDate: DateTime.fromISO('2025-04-01'), recurrence: 2, $extras: {}, fundingCategories: [],
    includeFundingTransfers: false, ...changes }
  const before = JSON.stringify(category)
  const query = { whereHas() { return this }, joinRaw: async () => [category] }
  const calculate = runInNewContext(ts.transpileModule(`(async function(date) ${method.body
    .getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    DateTime, Category: { query: () => query }, parseMoneyCents, encodeMonetaryAmount,
    subtractMoneyCents, formatMoneyCents, moneyCentsFromInteger,
  })
  const result = await calculate.call({ id: 7 }, '2025-03-01')
  if (JSON.stringify(category) !== before) throw new Error('Proposal mutated Category')
  return result[0]
}

test.group('Proposed funding checked cents without a database', () => {
  test('fractional goals, negative balances and half ties round cents at the period boundary')
    .with([
      { changes: {}, amount: 0.15, adjusted: false },
      { changes: { fundingAmount: 0.2, balance: -0.1 }, amount: 0.15, adjusted: true },
      { changes: { fundingAmount: 0.3, balance: 0.1, $extras: { sum: '0.10' } },
        amount: 0.15, adjusted: false },
      { changes: { fundingAmount: 0.01 }, amount: 0.01, adjusted: false },
      { changes: { fundingAmount: -0.01, balance: -0.03 }, amount: 0.01, adjusted: true },
      { changes: { fundingAmount: 0, balance: 0.1 }, amount: 0, adjusted: false },
      { changes: { fundingAmount: 0.1, balance: 0.3, $extras: { sum: '-0.10' } },
        amount: 0, adjusted: true },
      { changes: { goalDate: DateTime.fromISO('2025-01-01'), recurrence: 3, fundingAmount: 120 },
        amount: 60, adjusted: true },
      { changes: { goalDate: DateTime.fromISO('2025-03-01'), recurrence: 1 },
        amount: 0.29, adjusted: false },
      { changes: { suspended: true }, amount: 0, adjusted: false },
      { changes: { useGoal: false }, amount: 0.29, adjusted: false },
    ]).run(async ({ assert }, { changes, amount, adjusted }) => {
      const proposal = await fundingProposal(changes)
      assert.strictEqual(proposal.amount, amount)
      assert.strictEqual(proposal.adjusted, adjusted)
    })

  test('adjustment message keeps its existing format without dollar formatting arithmetic',
    async ({ assert }) => {
      const proposal = await fundingProposal({ fundingAmount: 0.2, balance: -0.1 })
      assert.strictEqual(proposal.adjustedReason,
        'The funding amount was adjusted from a planned amount of 0.10 to 0.15 for the goal of '
        + '0.2 due 4-2025.')
    })

  test('invalid or unsafe monetary results reject').with([
    { fundingAmount: Infinity }, { balance: Number.MAX_SAFE_INTEGER },
    { balance: -1, $extras: { sum: '90071992547409.91' } },
    { recurrence: 0 }, { recurrence: -3, goalDate: DateTime.fromISO('2025-02-01') },
  ]).run(async ({ assert }, changes) => {
    await assert.rejects(() => fundingProposal(changes))
  })
})


async function billTotals(values) {
  const file = 'app/Controllers/Http/CategoriesController.ts'
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  const method = source.statements.find(ts.isClassDeclaration).members.find(node =>
    ts.isMethodDeclaration(node) && node.name.getText(source) === 'getBills')
  const bills = values.map((_, index) => ({ id: index + 1, $extras: {} }))
  let index = 0
  const budget = { id: 7, related: () => ({ query: () => ({ joinRaw() { return this },
    where() { return this }, sum: async () => [{ $extras: { debits: values[index++] } }],
  }) }) }
  const run = runInNewContext(ts.transpileModule(`(async function(${method.parameters.map(p =>
    p.getText(source)).join(',')}) ${method.body.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { DateTime, CategoryType, parseMoneyCents, formatMoneyCents,
    Category: { query: () => ({ whereHas() { return this }, where: async () => bills }) } })
  return run({ auth: { user: { related: () => ({ query: () => ({
    firstOrFail: async () => budget,
  }) }) } } })
}

test('Bill debit totals format exact cents and preserve nulls, IDs and empty results',
  async ({ assert }) => {
    assert.deepEqual(await billTotals(['-0.10', '-0.30', '-90071992547409.91', null, undefined]),
      [{ id: 1, debits: '-0.10' }, { id: 2, debits: '-0.30' },
        { id: 3, debits: '-90071992547409.91' }, { id: 4, debits: null },
        { id: 5, debits: '0.00' }])
    assert.deepEqual(await billTotals([]), [])
  })

test('Bill debit totals reject invalid or unsafe SQL values')
  .with([0.1, 'NaN', 'Infinity', '-0.001', '-90071992547409.92'])
  .run(async ({ assert }, value) => {
    await assert.rejects(() => billTotals([value]))
  })
