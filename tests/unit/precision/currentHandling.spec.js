import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { addTransaction } from '../../../app/validation/Validators/transaction.ts'
import { validateTransactionSplits } from '../../../app/validation/transactionSplits.ts'
import { calculateFunding, computeSpread } from '../../../client-src/Funding/calculateFunding.ts'
import { addMoneyCents, formatMoneyCents, parseMoneyCents } from '../../../common/moneyCents.ts'
import { encodeTransferCategories } from '../../../client-src/monetary.ts'
import parseEquation from '../../../client-src/EquationParser.ts'
import { encodeFundingMetadata } from '../../../app/services/fundingAmountCodec.ts'
import { encodeCategoryAllocations } from '../../../app/services/categoryAmountCodec.ts'

// Execute current component expressions without application/DB bootstrap or a DOM.
async function component(name, context) {
  const source = await readFile(`client-src/${name}.tsx`, 'utf8')
  const ast = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const statement = ast.statements.find((s) => ts.isVariableStatement(s)
    && s.declarationList.declarations.some((d) => d.name.getText(ast) === name))
  const expression = statement.declarationList.declarations[0].initializer.getText(ast)
  return runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, context)
}
const React = { createElement: (type, props, ...children) => ({ type, props, children }) }
async function input(props) {
  const state = []; let cursor = 0
  const render = await component('AmountInput', { React, styles: {}, Console: { log: () => undefined },
    parseEquation, Overlay: 'overlay', Popover: 'popover', PopoverHeader: 'header', PopoverBody: 'body',
    useRef: () => ({ current: null }), useState: (initial) => {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], (value) => { state[index] = value }]
    } })
  return { state, render() { cursor = 0; return render(props).children[0].props } }
}

test.group('Current monetary handling without database', () => {
  test('Amount formats but does not normalize its input, including negative zero', async ({ assert }) => {
    const render = await component('Amount', { React })
    for (const [value, expected] of [[0.1 + 0.2, '0.30'], [1.005, '1.00'], [-0.001, '0.00'], [-0, '0.00'], [-1234.567, '-1,234.57'], ['12abc', '12.00']]) {
      assert.equal(render({ amount: value }).children[0], expected)
    }
    assert.equal(0.1 + 0.2, 0.30000000000000004)
  })
  test('controlled AmountInput forwards raw change/blur even when its display rounds', async ({ assert }) => {
    let changed, blurred
    const f = await input({ value: '1.239', onChange: (event) => { changed = event.target.value },
      onBlur: (event) => { blurred = event.target.value } })
    assert.equal(f.render().value, '1.24')
    f.render().onChange({ target: { value: '1.239' } })
    f.render().onBlur({ target: { value: '1.239' } })
    assert.equal(changed, '1.239'); assert.equal(blurred, '1.239')
    assert.equal(f.state[0], '1.24')
  })
  test('delta input rounds locally, emits number delta with binary arithmetic', async ({ assert }) => {
    let result
    const f = await input({ value: 0.1, onDeltaChange: (...values) => { result = values } })
    f.render().onFocus({ target: { value: '0.10' } })
    f.render().onBlur({ target: { value: '0.30' } })
    assert.equal(result[0], 0.3); assert.equal(result[1], 0.3 - 0.1)
    assert.notEqual(result[1], 0.2)
  })
  test('invalid blur silently becomes local zero; Infinity is not rejected locally', async ({ assert }) => {
    const f = await input({ value: 1 })
    f.render().onBlur({ target: { value: '-' } }); assert.equal(f.state[0], '0.00')
    f.render().onBlur({ target: { value: 'Infinity' } }); assert.equal(f.state[0], 'Infinity')
  })
  test('actual input blur differs from toFixed at a negative half tie', async ({ assert }) => {
    let value
    const f = await input({ value: 1, onDeltaChange: (amount) => { value = amount } })
    f.render().onBlur({ target: { value: '-0.125' } })
    assert.equal(value, -0.12); assert.equal((-0.125).toFixed(2), '-0.13')
    assert.isTrue(Object.is(Math.round(-0.005 * 100) / 100, -0))
    assert.equal(Math.round(1.005 * 100) / 100, 1)
  })
  test('Transaction requests require canonical strings and decode without intermediate rounding', async ({ assert }) => {
    for (const amount of ['1.00', '-0.12', '0.30', '0.00']) {
      const value = await addTransaction.validate({ date: '2025-01-01', name: 'Precision', amount, categories: [] })
      assert.equal(value.amount, Number(amount))
    }
    for (const amount of ['1.005', '1e-2', 0.1 + 0.2, '', ' ', false, true, '0x10', '12abc', null, Infinity, NaN]) {
      await assert.rejects(() => addTransaction.validate({ date: '2025-01-01', name: 'Precision', amount, categories: [] }))
    }
  })
  test('rounded conservation accepts subcent rows without modifying them', ({ assert }) => {
    const rows = [{ amount: 1.234 }]
    validateTransactionSplits(1.234, rows)
    assert.equal(rows[0].amount, 1.234)
    validateTransactionSplits(0, [{ amount: 0.004 }])
    assert.throws(() => validateTransactionSplits(0.01, [{ amount: 0.005 }, { amount: 0.005 }]))
  })
  test('actual calculator uses floating arithmetic and permits nonfinite results', ({ assert }) => {
    assert.equal(parseEquation('0.1+0.2'), 0.30000000000000004)
    assert.equal(parseEquation('1/0'), Infinity)
    assert.isNaN(parseEquation('0/0'))
    assert.throws(() => parseEquation('1.2.3'))
  })
  test('funding calculations retain exact cents through request and persistence encoding', ({ assert }) => {
    const row = (baseAmount, from, includeFundingTransfers = false) => ({ baseAmountCents: parseMoneyCents(baseAmount), includeFundingTransfers,
      fundingCategories: [{ categoryId: from, amount: 100, percentage: true }] })
    const inputs = { 10: row('0.10', 99, true), 20: row('0.20', 10) }
    const before = globalThis.structuredClone(inputs)
    const rows = calculateFunding(inputs, 99)
    assert.strictEqual(rows[0].amountCents, 30)
    assert.strictEqual(rows[0].baseAmountCents, 10)
    assert.strictEqual(addMoneyCents(...rows.map(row => row.amountCents)), 0)
    assert.deepEqual(inputs, before)
    const transmitted = JSON.parse(JSON.stringify(encodeTransferCategories(rows.map(({ amountCents, ...row }) => ({
      ...row, amount: formatMoneyCents(amountCents),
    })))))
    assert.strictEqual(transmitted[0].amount, '0.30')
    assert.strictEqual(transmitted[0].baseAmount, '0.10')
    assert.strictEqual(transmitted[0].fundingCategories[0].amount, 100)
    const stored = encodeCategoryAllocations(encodeFundingMetadata(transmitted))
    assert.strictEqual(stored[0].amount, '0.30')
    assert.strictEqual(stored[0].baseAmount, '0.10')
    assert.strictEqual(stored[0].fundingCategories[0].amount, '100.00')
    assert.strictEqual(rows[0].amountCents, 30)
  })

  test('percentage funding rounds to cents and assigns the residual to the last rule', ({ assert }) => {
    const amountCents = parseMoneyCents('0.05')
    const rules = [{ categoryId: 10, amount: 50, percentage: true },
      { categoryId: 20, amount: 50, percentage: true }]
    const before = globalThis.structuredClone(rules)
    const spread = computeSpread(amountCents, rules)
    assert.deepEqual([...spread], [[10, 3], [20, 2]])
    assert.strictEqual(addMoneyCents(...spread.values()), amountCents)
    assert.deepEqual(rules, before)
  })
})
