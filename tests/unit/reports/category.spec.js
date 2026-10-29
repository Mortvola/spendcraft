import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { CategoryType } from '../../../common/ResponseTypes.ts'
import { decodeCategoryReport } from '../../../client-src/monetary.ts'
import { formatMoneyCents } from '../../../common/moneyCents.ts'

const row = { rowNumber: '1', groupName: 'Group', categoryName: 'Category', count: 3 }
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
const find = (node, type) => Array.isArray(node) ? node.flatMap(child => find(child, type))
  : !node || typeof node !== 'object' ? []
  : [...(node.type === type ? [node] : []), ...(node.props?.children ?? []).flatMap(child => find(child, type))]

async function component(context) {
  const text = await readFile('client-src/Reports/Category.tsx', 'utf8')
  const ast = ts.createSourceFile('Category.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'Category') expression = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error('Missing Category report component')
  return runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { React: { createElement }, DateTime, CategoryType, decodeCategoryReport, styles: {},
    Formik: 'form', MoneyCentsAmount: 'money', ...context })
}

test('Category report retains exact cents, counts and grouping metadata', ({ assert }) => {
  const source = ['0.10', '0.20', '-0.30', '0.00', '90071992547409.91', '-90071992547409.91'].map(sum => ({ ...row, sum }))
  const before = globalThis.structuredClone(source)
  const decoded = decodeCategoryReport(source)
  assert.deepEqual(decoded.map(r => r.sumCents), [10, 20, -30, 0, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])
  for (const result of decoded) {
    const { sumCents, ...metadata } = result
    assert.deepEqual(metadata, row)
    assert.notProperty(result, 'sum')
    assert.isString(formatMoneyCents(sumCents))
  }
  assert.strictEqual(formatMoneyCents(decoded[4].sumCents), '90071992547409.91')
  assert.deepEqual(source, before)
  assert.deepEqual(decodeCategoryReport([]), [])
})

test('Category report rejects invalid and unsafe monetary responses').with([
  1, null, undefined, '', '1.2', '-0.00', 'Infinity', '90071992547409.92',
]).run(({ assert }, sum) => {
  assert.throws(() => decodeCategoryReport([{ ...row, sum }]))
})

test('Category report preserves filters and counts while sorting and displaying cents', async ({ assert }) => {
  let keys, data
  let response = [{ ...row, sum: '90071992547409.91' }]
  const Table = Object.assign(() => null, { Header: 'header', Column: 'column', Body: 'body' })
  const Report = await component({
    useStores: () => ({ categoryTree: { budget: { children: [
      { isGroup: true, children: [{ id: 10, type: CategoryType.Regular }, { id: 11, type: CategoryType.Bill }] }, { id: 20 },
    ] } } }),
    isGroup: value => value.isGroup === true,
    useSortableTable: precedence => { keys = precedence; return { setData: value => { data = value }, SortableTable: Table } },
    Http: { get: async url => {
      assert.strictEqual(url, '/api/v1/reports/category?startDate=2026-01-01&endDate=2026-01-31&c=10')
      return { ok: true, body: async () => response }
    } },
  })
  const tree = Report()
  assert.deepEqual(Array.from(keys), ['groupName', 'categoryName', 'sumCents', 'count'])
  const form = find(tree, 'form')[0]
  assert.deepEqual(Array.from(form.props.initialValues.category, c => c.id), [10, 20])
  const values = { startDate: '2026-01-01', endDate: '2026-01-31', category: [{ id: 10, value: true }, { id: 20, value: false }] }
  await form.props.onSubmit(values)
  assert.strictEqual(data[0].sumCents, Number.MAX_SAFE_INTEGER)
  assert.strictEqual(response[0].sum, '90071992547409.91')
  assert.isTrue(find(tree, 'column').some(column => column.props.column === 'sumCents'))
  const rendered = find(tree, 'body')[0].props.children[0](data[0])
  assert.strictEqual(find(rendered, 'money')[0].props.amount, Number.MAX_SAFE_INTEGER)
  assert.strictEqual(rendered.props.children[3].props.children[0], 3)
  response = [{ ...row, sum: '1.2' }]
  await assert.rejects(() => form.props.onSubmit(values))
  assert.strictEqual(data[0].sumCents, Number.MAX_SAFE_INTEGER)
  response = []
  await form.props.onSubmit(values)
  assert.deepEqual(Array.from(data), [])
})
