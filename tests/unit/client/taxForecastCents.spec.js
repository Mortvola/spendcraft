import { taxResultCents } from '../../../client-src/State/Taxes/taxResultCents.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { formatMoneyCents, parseMoneyCents } from '../../../common/moneyCents.ts'
import { inputMoneyCents } from '../../../client-src/monetary.ts'

async function component(file, name, context) {
  const source = await readFile(`client-src/Taxes/${file}.tsx`, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error(`Missing component ${name}`)
  return runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { formatMoneyCents, inputMoneyCents, ...context })
}

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
const find = (node, type) => Array.isArray(node) ? node.flatMap(child => find(child, type)) : !node || typeof node !== 'object' ? []
  : [...(node.type === type ? [node] : []), ...(node.props?.children ?? []).flatMap(child => find(child, type))]

test('Tax monetary controls receive cents and update cents without dollar decoding').with([
  ['Income', 'Income', 7], ['CapitalGains', 'CapitalGains', 2],
  ['TaxAndCredits', 'TaxAndCredits', 1], ['Worksheet2-1', 'Worksheet2_1', 3],
]).run(async ({ assert }, [file, name, count]) => {
  const actual = { taxableInterestCents: 0, oridinaryDividendsCents: 0, taxableSocialSecurityBenefitsCents: 0,
    shortTermCapitalGainsCents: 0, longTermCapitalGainsCents: 0 }
  const taxes = { income: { actuals: [actual], taxableInterestCents: 0, qualifiedDividendsCents: 0,
    ordinaryDividendsCents: 0, taxableIraDistributionsCents: 0, taxablePensionAndAnnuitiesCents: 0,
    taxableSocialSecurityBenefitsCents: 0, additionalTaxableIncomeCents: 0,
    shortTermCapitalGainsCents: 0, longTermCapitalGainsCents: 0,
    getTotalIncomeCents: () => 0, getCapitalGainsCents: () => 0, getAdjustedGrossIncomeCents: () => 0 },
  standardDeductionCents: 0, qualifiedBusinessIncomeDeductionCents: 0, getTaxableIncomeCents: () => 0,
  worksheet2_1: { expectedAgiCents: 0, priorYearAgiCents: 0, priorYearTotalTaxCents: 0, result: null } }
  const Component = await component(file, name, { React: { createElement }, observer: c => c,
    runInAction: callback => callback(), TaxAmountInput: 'input', TaxResultAmount: 'tax-money', MoneyCentsAmount: 'money', Amount: 'amount',
    getCurrentPeriod: () => 0, style: {} })
  const inputs = find(Component({ taxes }), 'input')
  assert.lengthOf(inputs, count)
  for (const input of inputs) {
    assert.strictEqual(input.props.value, 0)
    input.props.onChange(parseMoneyCents('90071992547409.91'))
  }
  const updated = find(Component({ taxes }), 'input')
  assert.isTrue(updated.every(input => input.props.value === Number.MAX_SAFE_INTEGER))
})

test('Tax amount editing retains decimal text and applies approved rounding').with([
  ['0.10', 10], ['0.20', 20], ['0.125', 13], ['-0.125', -12], ['1.005', 101],
  ['-0.00', 0], ['0.00', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
]).run(async ({ assert }, [text, expected]) => {
  let draft = { value: 0, text: '0.00' }
  let emitted
  let validity
  const Input = await component('TaxAmountInput', 'TaxAmountInput', { React: { createElement },
    useState: () => [draft, next => { draft = next }],
    useRef: () => ({ current: { querySelector: () => ({ setCustomValidity: value => { validity = value } }) } }),
    useEffect: callback => callback(), AmountInput: 'input' })
  const [input] = find(Input({ value: 0, onChange: cents => { emitted = cents } }), 'input')
  assert.isTrue(input.props.exactCents)
  input.props.onValueChange(text)
  assert.strictEqual(emitted, expected)
  assert.strictEqual(draft.text, text)
  assert.strictEqual(draft.value, expected)
  assert.strictEqual(validity, '')
})

test('Invalid tax draft text cannot replace monetary state').with([
  '', 'NaN', 'Infinity', 'garbage', '90071992547409.92', '-90071992547409.92',
]).run(async ({ assert }, text) => {
  let validity
  let draft
  const Input = await component('TaxAmountInput', 'TaxAmountInput', { React: { createElement },
    useState: () => [{ value: 30, text: '0.30' }, next => { draft = next }],
    useRef: () => ({ current: { querySelector: () => ({ setCustomValidity: value => { validity = value } }) } }),
    useEffect: callback => callback(), AmountInput: 'input' })
  const [input] = find(Input({ value: 30, onChange: () => assert.fail('Invalid draft changed monetary state') }), 'input')
  input.props.onValueChange(text)
  assert.strictEqual(draft.text, text)
  assert.strictEqual(draft.value, 30)
  assert.isNotEmpty(validity)
})


test('Tax result cents preserve existing final-display rounding').with([
  [0.005, 1], [-0.005, -1], [0.125, 13], [-0.125, -13], [1.005, 100],
  [0.1 + 0.2, 30], [0, 0], [-0, 0], [-0.0001, 0], [null, 0], [undefined, 0],
]).run(({ assert }, [value, expected]) => {
  assert.strictEqual(taxResultCents(value), expected)
})

test('Tax result cents reject nonfinite and unsafe outputs').with([
  NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
]).run(({ assert }, value) => {
  assert.throws(() => taxResultCents(value))
})

test('Tax result display passes cents to the exact formatter', async ({ assert }) => {
  const Display = await component('TaxResultAmount', 'TaxResultAmount', {
    React: { createElement }, MoneyCentsAmount: 'money', taxResultCents,
  })
  assert.strictEqual(Display({ amount: -0.125 }).props.amount, -13)
  assert.strictEqual(Display({}).props.amount, 0)
})

test('Tax summary keeps rates numeric and displays monetary result cents', async ({ assert }) => {
  const Display = await component('TaxComputation', 'TaxComputation', { React: { createElement }, Fragment: 'fragment',
    observer: c => c, MoneyCentsAmount: 'money', Amount: 'amount', style: {} })
  const tree = Display({ taxes: { run: { brackets: [[10, { amountCents: 123, taxCents: 12 }]],
    totalTaxedAmountCents: 123, totalTaxesCents: 12, marginalTaxRate: 10, effectiveTaxRate: 9.756 } } })
  assert.deepEqual(find(tree, 'money').map(node => node.props.amount), [123, 12, 123, 12])
  assert.deepEqual(find(tree, 'amount').map(node => node.props.amount), [10, 9.756])
})

test('Worksheet monetary displays retain raw intermediates and numeric factors').with([
  ['Worksheet2-1', 'Worksheet2_1'], ['Worksheet2-9', 'Worksheet2_9'], ['Worksheet2-10', 'Worksheet2_10'],
]).run(async ({ assert }, [file, name]) => {
  const lines = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), 0.005]))
  lines['2a'] = 0.005
  lines['2b'] = 0.005
  const raw = { lines, worksheet2_10: { lines } }
  const taxes = { worksheet2_1: { result: raw, expectedAgiCents: 0, priorYearAgiCents: 0, priorYearTotalTaxCents: 0 },
    worksheet2_9: { result: [raw] } }
  const before = globalThis.structuredClone(raw)
  const Display = await component(file, name, { React: { createElement }, observer: c => c, style: {},
    TaxResultAmount: 'tax-money', TaxAmountInput: 'input', Amount: 'amount', runInAction: callback => callback() })
  const tree = Display({ taxes })
  assert.isAbove(find(tree, 'tax-money').length, 0)
  if (file === 'Worksheet2-9') {
    assert.deepEqual(find(tree, 'amount').map(node => node.props.amount), [0.005, 0.005, 0.5])
  } else assert.lengthOf(find(tree, 'amount'), 0)
  assert.deepEqual(raw, before)
})
