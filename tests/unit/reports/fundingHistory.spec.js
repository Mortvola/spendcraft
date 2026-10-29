import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { GroupType } from '../../../common/ResponseTypes.ts'
import { decodeFundingHistoryReport, fundingHistoryTotals } from '../../../client-src/monetary.ts'
import { formatMoneyCents } from '../../../common/moneyCents.ts'

const row = (history, categoryId = 1) => ({ groupId: 3, groupName: 'Group', groupType: GroupType.NoGroup,
  categoryId, categoryName: `Category ${categoryId}`, history })
const entry = (amount, year = 2026, month = 1) => ({ year, month, amount })

async function expression(name, context = {}) {
  const source = await readFile('client-src/Reports/FundingHistory.tsx', 'utf8')
  const ast = ts.createSourceFile('FundingHistory.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!found) throw new Error(`Missing production ${name}`)
  return runInNewContext(ts.transpileModule(`(${found})`, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, context)
}

test('Funding History retains exact cents, metadata and null/empty histories', ({ assert }) => {
  const source = [row([entry('0.10'), entry('-0.20', 2025, 12), entry('0.00', 2025, 11)]), row(null, 2), row([], 3)]
  const before = globalThis.structuredClone(source)
  const rows = decodeFundingHistoryReport(source)
  assert.deepEqual(rows[0], { ...source[0], history: [
    { year: 2026, month: 1, amountCents: 10 }, { year: 2025, month: 12, amountCents: -20 },
    { year: 2025, month: 11, amountCents: 0 },
  ] })
  assert.isNull(rows[1].history)
  assert.deepEqual(rows[2].history, [])
  assert.notProperty(rows[0].history[0], 'amount')
  assert.deepEqual(source, before)
  assert.deepEqual(decodeFundingHistoryReport([]), [])
})

test('Funding History monthly totals use checked cents and separate years', ({ assert }) => {
  const rows = decodeFundingHistoryReport([
    row([entry('0.10'), entry('-0.20', 2025, 1)]),
    row([entry('0.20'), entry('0.20', 2025, 1)], 2), row(null, 3), row([], 4),
  ])
  const before = globalThis.structuredClone(rows)
  assert.deepEqual(fundingHistoryTotals(rows), [
    { year: 2026, month: 1, amountCents: 30 }, { year: 2025, month: 1, amountCents: 0 },
  ])
  assert.deepEqual(rows, before)
  assert.deepEqual(fundingHistoryTotals([]), [])
  const large = decodeFundingHistoryReport([row([entry('90071992547409.91')])])
  assert.strictEqual(formatMoneyCents(fundingHistoryTotals(large)[0].amountCents), '90071992547409.91')
  large.push(...decodeFundingHistoryReport([row([entry('0.01')], 2)]))
  const baseline = globalThis.structuredClone(large)
  assert.throws(() => fundingHistoryTotals(large))
  assert.deepEqual(large, baseline)
})

test('Funding History rejects noncanonical and unsafe response amounts').with([
  1, null, undefined, '', '1.2', '-0.00', 'NaN', 'Infinity', '90071992547409.92',
]).run(({ assert }, amount) => {
  assert.throws(() => decodeFundingHistoryReport([row([entry(amount)])]))
})

test('Funding History preserves month ordering, missing-month blanks and change highlighting', async ({ assert }) => {
  const subtractMonth = await expression('subtractMonth')
  const render = await expression('renderHistory', {
    DateTime: { now: () => DateTime.fromISO('2026-01-01') }, subtractMonth, maxDisplayedMonths: 12,
    styles: { historyItem: 'history', change: 'changed' }, MoneyCentsAmount: 'money',
    React: { createElement: (type, props) => ({ type, props }) },
  })
  const history = decodeFundingHistoryReport([row([
    entry('0.30'), entry('0.30', 2025, 12), entry('0.20', 2025, 11), entry('0.00', 2025, 9),
    entry('1.00', 2025, 2), entry('2.00', 2025, 1),
  ])])[0].history
  const cells = render(history)
  assert.lengthOf(cells, 12)
  assert.strictEqual(cells[0].props.amount, 30)
  assert.strictEqual(cells[0].props.className, 'history')
  assert.strictEqual(cells[1].props.className, 'history changed')
  assert.strictEqual(cells[2].props.className, 'history changed')
  assert.strictEqual(cells[3].type, 'div')
  assert.strictEqual(cells[3].props.className, 'history changed')
  assert.strictEqual(cells[4].type, 'money')
  assert.strictEqual(cells[4].props.amount, 0)
  assert.strictEqual(cells[11].props.amount, 100)
  assert.strictEqual(cells[11].props.className, 'history')
  assert.isNull(render(null))
  assert.isTrue(render([]).every(cell => cell.type === 'div'))
})
