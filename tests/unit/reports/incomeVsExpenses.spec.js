import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { decodeIncomeVsExpensesReport } from '../../../client-src/monetary.ts'
import { formatMoneyCents } from '../../../common/moneyCents.ts'

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
const find = (node, type) => Array.isArray(node) ? node.flatMap(child => find(child, type))
  : !node || typeof node !== 'object' ? []
  : [...(node.type === type ? [node] : []), ...(node.props?.children ?? []).flatMap(child => find(
    child, type))]

async function report(data) {
  const text = await readFile('client-src/Reports/IncomeVsExpenses.tsx', 'utf8')
  const ast = ts.createSourceFile('IncomeVsExpenses.tsx', text, ts.ScriptTarget.Latest, true, ts
    .ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) ===
      'IncomeVsExpenses') expression = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error('Missing report component')
  const view = runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { React: { createElement }, useEffect: () => undefined, useState: () => [data, (
    ) => undefined],
    formatMoneyCents, Chart: 'chart' })
  return find(view(), 'chart')[0]
}

test('Income vs Expenses preserves month ordering and all server amounts as cents', ({ assert }) =>
  {
  const source = [['2026-02', '0.10', '-0.20', '9.99'], ['2026-01', '90071992547409.91', '0.00',
    '-90071992547409.91']]
  const before = globalThis.structuredClone(source)
  const rows = decodeIncomeVsExpensesReport(source)
  assert.deepEqual(rows, [['2026-02', 10, -20, 999], ['2026-01', Number.MAX_SAFE_INTEGER, 0, -Number
    .MAX_SAFE_INTEGER]])
  assert.deepEqual(source, before)
  assert.deepEqual(decodeIncomeVsExpensesReport([]), [])
})

test('Income vs Expenses rejects invalid or unsafe amounts in every monetary column').with([
  1, null, undefined, '', '1.2', '-0.00', 'NaN', 'Infinity', '90071992547409.92',
]).run(({ assert }, value) => {
  for (const column of [1, 2, 3]) {
    const row = ['2026-01', '0.10', '-0.20', '-0.10']
    row[column] = value
    assert.throws(() => decodeIncomeVsExpensesReport([row]))
  }
})

test('Income vs Expenses converts only chart coordinates and supplies exact labels', async ({
  assert }) => {
  const rows = decodeIncomeVsExpensesReport([['2026-02', '0.10', '-0.20', '-0.10'],
    ['2026-01', '90071992547409.91', '0.00', '-90071992547409.91']])
  const before = globalThis.structuredClone(rows)
  const chart = await report(rows)
  assert.deepEqual(Array.from(chart.props.data[0]), ['date', 'income', 'expenses', 'net'])
  assert.strictEqual(chart.props.data[1][0], '2026-02')
  assert.strictEqual(chart.props.data[1][1].v, 0.1)
  assert.strictEqual(chart.props.data[1][1].f, '0.10')
  assert.strictEqual(chart.props.data[1][2].v, -0.2)
  assert.strictEqual(chart.props.data[1][2].f, '-0.20')
  assert.strictEqual(chart.props.data[2][1].v, Number('90071992547409.91'))
  assert.strictEqual(chart.props.data[2][1].f, '90,071,992,547,409.91')
  assert.strictEqual(chart.props.data[2][2].f, '0.00')
  assert.strictEqual(chart.props.data[2][3].f, '-90,071,992,547,409.91')
  assert.strictEqual(chart.props.options.series[2].type, 'line')
  assert.strictEqual(chart.props.options.seriesType, 'bars')
  assert.isTrue(chart.props.options.isStacked)
  assert.deepEqual(rows, before)
  assert.isUndefined(await report(null))
  const empty = await report([])
  assert.lengthOf(empty.props.data, 1)
  assert.strictEqual(empty.props.options.series[2].type, 'line')
})
