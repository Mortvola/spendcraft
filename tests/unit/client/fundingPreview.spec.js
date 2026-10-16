import { validateTransactionSplits } from '../../../app/validation/transactionSplits.ts'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { calculateFunding, computeSpread, fundingCategoryEffect } from '../../../client-src/Funding/calculateFunding.ts'
import { legacyPreview } from '../../fixtures/funding/legacyPreview.ts'

const row = (baseAmount, from = 99, includeFundingTransfers = false) => ({ baseAmount,
  includeFundingTransfers, fundingCategories: [{ categoryId: from, amount: 100, percentage: true }] })
const chain = () => ({ 10: row(1, 99, true), 20: row(1, 10, true), 30: row(1, 20) })
async function expression(file, name) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast)
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = `(async function(${node.parameters.map((p) => p.getText(ast)).join(',')}) ${node.body.getText(ast)})`
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!found) throw new Error(`Missing production ${file}:${name}`)
  return ts.transpileModule(`(${found})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
}

async function dialog(values, { balance = 10, reject = false, editing = false, previousCategories, previousDate } = {}) {
  let submitted
  let closed = false
  let modal
  let fundingDate
  let stateIndex = 0
  const effect = { calculateFunding, fundingCategoryEffect }
  const submit = async (request, type) => {
    submitted = { request, type }
    if (reject) throw new Error('Rejected funding')
    return null
  }
  const pool = { id: 99, balance }
  const stores = { categoryTree: { budget: { fundingPoolCat: pool, forEachCatgory: () => false },
    bills: { forEachCatgory: () => false }, getCategory: () => ({ getFundingPool: () => pool }) },
  register: { addCategoryTransfer: submit } }
  const transaction = editing ? { date: DateTime.fromISO(previousDate ?? values.date),
    categories: previousCategories ?? calculateFunding(values.categories, 99),
    updateCategoryTransfer: (request) => submit(request, 2) } : undefined
  const Amount = ({ amount }) => React.createElement('output', { 'data-amount': String(amount) }, String(amount))
  const Field = ({ children }) => children({ field: { value: values.date }, form: { values } })
  const context = { ...effect, React: { ...React, useState: () => [stateIndex++ === 0 ? false : values.categories, () => false],
    useCallback: (callback) => callback, useEffect: () => false }, DateTime, useStores: () => stores,
    Field, Amount, FormModal: (props) => { modal = props; return props.children },
    FormError: () => null, Funding: (props) => { fundingDate = props.date; return null }, styles: {}, CategoryType: {}, TransactionType: { FUNDING_TRANSACTION: 2 } }
  const component = runInNewContext(await expression('client-src/Funding/FundingDialog.tsx', 'FundingDialog'), context)
  // Execute actual JSX/Field preview expressions and the captured FormModal submit.
  const html = renderToStaticMarkup(component({ transaction, setShow: () => { closed = true } }))
  return { html, get initialDate() { return modal.initialValues.date }, get fundingDate() { return fundingDate }, async submit() { await modal.onSubmit(values) }, get submitted() { return submitted }, get closed() { return closed } }
}

test.group('Funding same-state preview and submission without DB', () => {
  test('editing disables the date field and submits the persisted date even if form state changes', async ({ assert }) => {
    const f = await dialog({ date: '2025-04-01', categories: chain() }, { editing: true, previousDate: '2025-03-01' })
    assert.include(f.html, 'disabled=""')
    await f.submit()
    assert.equal(f.submitted.request.date, '2025-03-01')
  })

  test('normal edit displays and projects the original month and submits the same calendar date', async ({ assert }) => {
    const values = { date: '2025-03-17', categories: { 10: row(60) } }
    const f = await dialog(values, { editing: true, previousDate: '2025-03-17' })
    assert.equal(f.initialDate, '2025-03-17')
    assert.equal(f.fundingDate, '2025-03-01')
    assert.include(f.html, 'value="2025-03-17"')
    assert.include(f.html, 'disabled=""')
    await f.submit()
    assert.equal(f.submitted.request.date, f.initialDate)
    assert.equal(f.submitted.request.categories[0].baseAmount, 60)
  })

  test('server rejects funding date edits after scoped reload and before financial mutation', async ({ assert }) => {
    let rolledBack = false
    const trx = { rollback: async () => { rolledBack = true } }
    const existing = { type: 2, date: DateTime.fromISO('2025-03-01') }
    const budget = { related: () => ({ query: () => ({ where() { return this }, firstOrFail: async () => existing }) }) }
    const user = { useTransaction: () => undefined, related: () => ({ query: () => ({ forUpdate: () => ({ firstOrFail: async () => budget }) }) }) }
    const transfer = runInNewContext(await expression('app/Controllers/Http/CategoriesController.ts', 'transfer'), {
      db: { transaction: async () => trx }, updateCategoryTransfer: {}, DateTime,
      TransactionType: { FUNDING_TRANSACTION: 2 }, Exception: class extends Error {},
    })
    await assert.rejects(() => transfer({ request: { params: () => ({ tfrId: 1 }),
      validateUsing: async () => ({ date: '2025-04-01', type: 2, categories: [] }) },
    auth: { user }, logger: { error: () => undefined } }), 'The date of a funding transaction cannot be changed.')
    assert.isTrue(rolledBack)
  })
  test('known recursive3 / submission2 defect becomes preview2 / submission2 with identical posted fields', async ({ assert }) => {
    const inputs = chain()
    assert.equal(legacyPreview(inputs, 99), 3)
    const expected = calculateFunding(inputs, 99)
    assert.deepEqual(expected.map(({ categoryId, amount }) => ({ categoryId, amount })), [
      { categoryId: 10, amount: 2 }, { categoryId: 20, amount: 2 }, { categoryId: 30, amount: 1 },
      { categoryId: 99, amount: -2 }, { categoryId: 10, amount: -2 }, { categoryId: 20, amount: -1 },
    ])
    const f = await dialog({ date: '2025-03-01', categories: inputs })
    assert.include(f.html, 'data-amount="2"')
    assert.include(f.html, 'data-amount="8"')
    await f.submit()
    assert.deepEqual(f.submitted.request, { date: '2025-03-01', categories: expected })
    assert.equal(f.submitted.type, 2)
    assert.isTrue(f.closed)
    assert.equal(-fundingCategoryEffect(expected, 99), 2)
    assert.deepEqual([10, 20, 30].map((id) => fundingCategoryEffect(expected, id)), [0, 1, 1])
  })

  const scenarios = [
    { name: 'no transfer', inputs: { 10: row(10) } },
    { name: 'transfer chain', inputs: chain() },
    { name: 'reverse-ID chain', inputs: { 10: row(1, 20), 20: row(1, 30, true), 30: row(1, 99, true) } },
    { name: 'negative', inputs: { 10: row(-1) } },
    { name: 'zero', inputs: { 10: row(0) } },
    { name: 'string form input', inputs: { 10: row('1.25') } },
    { name: 'fixed cap', inputs: { 10: { ...row(1), fundingCategories: [{ categoryId: 99, amount: 5, percentage: false }] } } },
    { name: 'percent residual', inputs: { 10: { ...row(0.01), fundingCategories: [
      { categoryId: 99, amount: 33.33, percentage: true }, { categoryId: 20, amount: 66.67, percentage: true }] } } },
    { name: 'fixed plus percentage', inputs: { 10: { ...row(10), fundingCategories: [
      { categoryId: 99, amount: 2, percentage: false }, { categoryId: 20, amount: 100, percentage: true }] } } },
    { name: 'duplicate funder IDs', inputs: { 10: { ...row(1), fundingCategories: [
      { categoryId: 99, amount: 50, percentage: true }, { categoryId: 99, amount: 50, percentage: true }] } } },
    { name: 'cycle retains finite submission pass', inputs: { 10: row(1, 20, true), 20: row(1, 10, true) } },
  ]
  test('actual preview and CREATE/update submit share all calculated fields').with(scenarios)
    .run(async ({ assert }, { inputs }) => {
      const original = globalThis.structuredClone(inputs)
      const calculated = calculateFunding(inputs, 99)
      for (const editing of [false, true]) {
        const f = await dialog({ date: '2025-03-01', categories: inputs }, { editing })
        assert.include(f.html, `data-amount="${-fundingCategoryEffect(calculated, 99)}"`)
        await f.submit()
        assert.deepEqual(f.submitted.request.categories, calculated)
        assert.deepEqual(inputs, original)
      }
    })

  test('insufficient Pool is displayed as negative available; existing submission has no Pool clamp', async ({ assert }) => {
    const f = await dialog({ date: '2025-03-01', categories: chain() }, { balance: 1 })
    assert.include(f.html, 'data-amount="-1"')
    await f.submit()
    assert.equal(fundingCategoryEffect(f.submitted.request.categories, 99), -2)
  })
  test('binary transfer artifact remains request evidence, with base snapshot preserved', ({ assert }) => {
    const inputs = { 10: row(0.1, 99, true), 20: row(0.2, 10) }
    const calculated = calculateFunding(inputs, 99)
    assert.equal(calculated[0].amount, 0.30000000000000004)
    assert.equal(calculated[0].baseAmount, 0.1)
    assert.equal(fundingCategoryEffect(calculated, 99), -0.3)
  })
  test('fixed ordering and positive/negative half rounding are unchanged', ({ assert }) => {
    assert.deepEqual([...computeSpread(1, [{ categoryId: 1, amount: 1, percentage: false },
      { categoryId: 2, amount: 1, percentage: false }])], [[2, 100]])
    assert.equal(computeSpread(0.005, [{ categoryId: 99, amount: 100, percentage: true }]).get(99), 1)
    assert.equal(computeSpread(-0.005, [{ categoryId: 99, amount: 100, percentage: true }]).size, 0)
  })
  test('underfunded fixed-only splits retain existing server rejection rather than inventing a remainder', ({ assert }) => {
    const calculated = calculateFunding({ 10: { ...row(2), fundingCategories: [
      { categoryId: 99, amount: 1, percentage: false }] } }, 99)
    assert.equal(fundingCategoryEffect(calculated, 99), -1)
    assert.throws(() => validateTransactionSplits(0, calculated), 'The sum of the categories does not match the transaction amount.')
  })
  test('rejected actual submit does not close dialog or mutate proposal inputs', async ({ assert }) => {
    const values = { date: '2025-03-01', categories: chain() }
    const original = globalThis.structuredClone(values)
    const f = await dialog(values, { reject: true })
    await assert.rejects(() => f.submit(), 'Rejected funding')
    assert.isFalse(f.closed)
    assert.deepEqual(values, original)
  })
  test('actual Category projected Balance uses net posted effect while Requested remains the input', async ({ assert }) => {
    const values = { date: '2025-03-01', categories: chain() }
    const component = runInNewContext(await expression('client-src/Funding/FundingItem.tsx', 'FundingItem'), {
      React, DateTime, calculateFunding, fundingCategoryEffect,
      useStores: () => ({ categoryTree: { budget: { fundingPoolCat: { id: 99 } } } }),
      useFormikContext: () => ({ values }), useField: () => [{ value: 1 }], styles: {},
      Field: ({ children }) => children({ field: { value: 1 } }),
      VerticalTitled: ({ title, children }) => React.createElement('section', { 'data-title': title }, children),
      Amount: ({ amount }) => React.createElement('output', {}, String(amount)),
      AmountInput: () => null, FormCheckbox: () => null, CategorySpread: () => null, FormError: () => null,
    })
    const html = renderToStaticMarkup(component({ fundingInfo: { initialAmount: 50 }, groupName: null,
      category: { id: 10, name: 'A' }, date: DateTime.fromISO(values.date), diffOnly: false }))
    assert.include(html, 'data-title="Requested"')
    assert.include(html, 'data-title="Balance"><output>50</output>')
  })
  test('actual replacement preview reverses old Pool effects; unchanged replacement has no additional withdrawal', async ({ assert }) => {
    const values = { date: '2025-03-01', categories: chain() }
    const f = await dialog(values, { editing: true, balance: 8 })
    assert.include(f.html, 'Additional Pool withdrawal:')
    assert.include(f.html, 'data-amount="8"')
    assert.include(f.html, 'data-amount="2"')
    assert.include(f.html, 'data-amount="0"')
    await f.submit()
    assert.equal(fundingCategoryEffect(f.submitted.request.categories, 99), -2)
    const changed = await dialog({ date: values.date, categories: { 10: row(3), 20: row(0), 30: row(0) } }, {
      editing: true, balance: 8, previousCategories: calculateFunding(chain(), 99),
    })
    assert.include(changed.html, 'data-amount="7"')
    assert.include(changed.html, 'data-amount="1"')
    await changed.submit()
    assert.equal(fundingCategoryEffect(changed.submitted.request.categories, 99), -3)
  })
  test('actual server goal calculation supplies base60; spread uses that same base without a second goal algorithm', async ({ assert }) => {
    const category = { id: 10, useGoal: true, suspended: false, goalDate: DateTime.fromISO('2025-04-01'),
      fundingAmount: 120, balance: 0, recurrence: 3, $extras: { sum: '0' },
      fundingCategories: row(0).fundingCategories, includeFundingTransfers: false }
    const getProposed = runInNewContext(await expression('app/Models/Budget.ts', 'getProposedFunding'), {
      DateTime, Category: { query: () => ({ whereHas() { return this }, async joinRaw() { return [category] } }) },
    })
    const [proposed] = await getProposed.call({ id: 1 }, '2025-03-01')
    assert.equal(proposed.amount, 60)
    const f = await dialog({ date: '2025-03-01', categories: { 10: row(proposed.amount) } })
    assert.include(f.html, 'data-amount="60"')
    await f.submit()
    assert.equal(f.submitted.request.categories[0].baseAmount, 60)
    assert.equal(fundingCategoryEffect(f.submitted.request.categories, 99), -60)
  })
})
