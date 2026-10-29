import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { AccountType, TrackingType } from '../../../common/ResponseTypes.ts'
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents } from
  '../../../common/moneyCents.ts'

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
const find = (node, type) => Array.isArray(node) ? node.flatMap(child => find(child, type))
  : !node || typeof node !== 'object' ? []
  : [...(node.type === type ? [node] : []), ...(node.props?.children ?? []).flatMap(child => find(
    child, type))]

async function chart(selectedAccount, points = []) {
  const source = await readFile('client-src/AccountView/AccountBalanceChart.tsx', 'utf8')
  const ast = ts.createSourceFile('AccountBalanceChart.tsx', source, ts.ScriptTarget.Latest, true,
    ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) ===
      'AccountBalanceChart') expression = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error('Missing account chart component')
  const view = runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, {
    React: { createElement, useEffect: () => undefined }, observer: c => c,
    useState: () => [null, () => undefined], useStores: () => ({ accountBalanceSeries: { points },
      uiState: { selectedAccount } }),
    useStatementDialog: () => ['dialog', () => undefined], formatMoneyCents, parseMoneyCents,
      subtractMoneyCents,
    AccountType, TrackingType, Chart: 'chart', Balance: 'balance', styles: {},
  })
  return find(view(), 'chart')[0].props.data
}

test('account chart applies signs in cents and preserves transaction date filling').with([1, -1])
  .run(async ({ assert }, sign) => {
    const points = [{ date: DateTime.fromISO('2026-01-03'), balanceCents: parseMoneyCents(
      '12.34') },
      { date: DateTime.fromISO('2026-01-01'), balanceCents: parseMoneyCents('-0.12') }]
    const data = await chart({ type: AccountType.Depository, tracking: TrackingType.Transactions,
      sign }, points)
    assert.deepEqual(Array.from(data, row => row[0]), ['date', '2026-01-01', '2026-01-02',
      '2026-01-03'])
    assert.deepEqual(Array.from(data.slice(1), row => row[1].f), sign === 1 ? ['-0.12', '-0.12',
      '12.34'] : ['0.12', '0.12', '-12.34'])
    assert.deepEqual(Array.from(data.slice(1), row => row[1].v), sign === 1 ? [-0.12, -0.12,
      12.34] : [0.12, 0.12, -12.34])
    assert.strictEqual(points[0].balanceCents, 1234)
    assert.strictEqual(points[1].balanceCents, -12)
  })

test('account chart preserves exact large-value labels and normalizes zero').with([1, -1])
  .run(async ({ assert }, sign) => {
    const data = await chart({ type: AccountType.Depository, tracking: TrackingType.Transactions,
      sign }, [
      { date: DateTime.fromISO('2026-01-03'), balanceCents: Number.MAX_SAFE_INTEGER },
      { date: DateTime.fromISO('2026-01-02'), balanceCents: 0 },
    ])
    assert.strictEqual(data.at(-1)[1].f, `${sign === -1 ? '-' : ''}90,071,992,547,409.91`)
    assert.strictEqual(data.at(-1)[1].v, Number(`${sign === -1 ? '-' : ''}90071992547409.91`))
    assert.strictEqual(data[1][1].f, '0.00')
    assert.strictEqual(data[1][1].v, 0)
  })

test('Statement-backed charts retain existing dates and do not apply account sign a second time')
  .with([
  [TrackingType.Balances, AccountType.Depository], [TrackingType.Transactions, AccountType
    .Investment],
]).run(async ({ assert }, [tracking, type]) => {
  const statement = { id: 1, startDate: DateTime.fromISO('2026-01-01'), endDate: DateTime.fromISO(
    '2026-01-03'),
    startingBalanceCents: parseMoneyCents('0.10'), endingBalanceCents: Number.MAX_SAFE_INTEGER }
  const data = await chart({ tracking, type, sign: -1, statements: { statements: [statement] } })
  assert.deepEqual(Array.from(data, row => row[0]), ['date', '2026-01-01', '2026-01-03',
    '2026-01-03'])
  assert.strictEqual(data[1][1].f, '0.10')
  assert.strictEqual(data.at(-1)[1].f, '90,071,992,547,409.91')
  assert.strictEqual(statement.endingBalanceCents, Number.MAX_SAFE_INTEGER)
})

test('empty account chart retains its header without fabricated points', async ({ assert }) => {
  assert.deepEqual(Array.from(await chart(null), row => Array.from(row)), [['date', 'balance']])
})
