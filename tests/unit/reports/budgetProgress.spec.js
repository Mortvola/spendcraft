import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { parseMoneyCents, formatMoneyCents } from '../../../common/moneyCents.ts'

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
const find = (node, type) => Array.isArray(node) ? node.flatMap(child => find(child, type))
  : !node || typeof node !== 'object' ? []
  : [...(node.type === type ? [node] : []), ...(node.props?.children ?? []).flatMap(child => find(
    child, type))]

async function harness(initialResponse) {
  const text = await readFile('client-src/Reports/BudgetProgress.tsx', 'utf8')
  const ast = ts.createSourceFile('BudgetProgress.tsx', text, ts.ScriptTarget.Latest, true, ts
    .ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'BudgetProgress') expression =
      node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error('Missing Budget Progress component')
  const slots = [], requests = [], errors = [], transactionReads = []
  let cursor = 0, effect, response = initialResponse
  const useState = initial => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [slots[index], value => { slots[index] = value }]
  }
  const view = runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, {
    React: { createElement, useState, useCallback: callback => callback }, useState,
      useEffect: callback => { effect = callback },
    observer: c => c, DateTime, parseMoneyCents, formatMoneyCents, useStores: () => ({}),
    Http: { get: async url => { requests.push(url); return { ok: true, body: async () =>
      ({ data: response }) } } },
    console: { log: error => errors.push(error) },
    Formik: 'form', ReportControls: 'controls', MonthSelector: 'month', Chart: 'chart', PleaseWait:
      'wait',
    RegisterTransactions: 'register', Transaction: 'transaction',
    TransactionContainer: class {
      transactions = []
      constructor(store, url) { this.url = url }
      getData(offset) { transactionReads.push({ url: this.url, offset }) }
    },
  })
  const render = () => { cursor = 0; return view() }
  return { render, requests, errors, transactionReads, get days() { return slots[0] },
    async load(next = response) { response = next; render(); effect(); await setImmediate();
      return render() } }
}

test('Budget Progress fills missing days in cents and retains transaction selection', async ({
  assert }) => {
  const source = [['2024-02-02', '0.10', [1, 2]], ['2024-02-04', '90071992547409.91', [9]]]
  const before = globalThis.structuredClone(source)
  const f = await harness(source)
  assert.lengthOf(find(f.render(), 'chart'), 0)
  find(f.render(), 'month')[0].props.onChange({ target: { value: '2-2024' } })
  const tree = await f.load()
  assert.strictEqual(f.requests[0], '/api/v1/reports/budget-progress?m=2-2024')
  assert.lengthOf(f.days, 29)
  assert.strictEqual(f.days[0][0], 0)
  assert.deepEqual(Array.from(f.days[0][1]), [])
  assert.strictEqual(f.days[1][0], 10)
  assert.strictEqual(f.days[2][0], 10)
  assert.deepEqual(Array.from(f.days[2][1]), [1, 2])
  assert.strictEqual(f.days[28][0], Number.MAX_SAFE_INTEGER)
  const chart = find(tree, 'chart')[0]
  assert.lengthOf(chart.props.data, 30)
  assert.deepEqual(Array.from(chart.props.data[0]), ['date', 'amount'])
  assert.strictEqual(chart.props.data[1][0], 1)
  assert.strictEqual(chart.props.data[1][1].f, '0.00')
  assert.strictEqual(chart.props.data[3][1].v, 0.1)
  assert.strictEqual(chart.props.data[3][1].f, '0.10')
  assert.strictEqual(chart.props.data[4][1].f, '90,071,992,547,409.91')
  chart.props.chartEvents[0].callback({ chartWrapper: { getChart: () => ({ getSelection: () => [{
    row: 2 }] }) } })
  assert.deepEqual(f.transactionReads, [{ url: '/api/v1/transactions?t=1&t=2', offset: 0 }])
  assert.deepEqual(source, before)
  assert.lengthOf(f.errors, 0)
})

test('Budget Progress preserves negative amounts and resets an empty month to zero', async ({
  assert }) => {
  const f = await harness([['2026-01-01', '-0.30', [5]]])
  find(f.render(), 'month')[0].props.onChange({ target: { value: '1-2026' } })
  let tree = await f.load()
  assert.lengthOf(f.days, 31)
  assert.strictEqual(f.days[30][0], -30)
  assert.strictEqual(find(tree, 'chart')[0].props.data[31][1].f, '-0.30')
  find(tree, 'month')[0].props.onChange({ target: { value: '2-2026' } })
  tree = await f.load([])
  assert.lengthOf(f.days, 28)
  assert.isTrue(f.days.every(([amount, ids]) => amount === 0 && ids.length === 0))
  assert.strictEqual(find(tree, 'chart')[0].props.data[1][1].f, '0.00')
})

test('Budget Progress rejects invalid amounts before replacing daily state').with([
  1, null, '', '1.2', '-0.00', 'Infinity', '90071992547409.92',
]).run(async ({ assert }, amount) => {
  const f = await harness([['2026-01-01', '0.30', [5]]])
  find(f.render(), 'month')[0].props.onChange({ target: { value: '1-2026' } })
  await f.load()
  const previous = f.days
  const tree = await f.load([['2026-01-01', '0.10', [6]], ['2026-01-02', amount, [7]]])
  assert.strictEqual(f.days, previous)
  assert.strictEqual(f.days[0][0], 30)
  assert.deepEqual(Array.from(f.days[0][1]), [5])
  assert.lengthOf(f.errors, 1)
  assert.lengthOf(find(tree, 'wait'), 0)
})
