import { validateFundingPercentages } from '../../../common/fundingPercentages.js'
import * as cents from '../../../common/moneyCents.ts'
import { inputMoneyCents, encodeCentFundingRules, decodeCentFundingRules } from '../../../client-src/monetary.ts'
import { DateTime } from 'luxon'
import { CategoryType } from '../../../common/ResponseTypes.js'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'

async function initializer(path, name, context = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const matches = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) matches.push(node.initializer.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (matches.length !== 1) throw new Error(`Expected one ${name}`)
  return runInNewContext(ts.transpileModule(`(${matches[0]})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText, { validateFundingPercentages, CategoryType, ...cents, inputMoneyCents, exactCents: false, ...context })
}

test.group('Funding configuration client regression', () => {
  test('actual dialog validators reject invalid funding configurations and accept valid ones', async ({ assert }) => {
    const category = await initializer('../../../client-src/Categories/CategoryView/CategoryDialog.tsx', 'handleValidate')
    const funding = await initializer('../../../client-src/Funding/FundingDialog.tsx', 'handleValidate')
    const cases = [
      { percentages: [100], valid: true }, { percentages: [50, 50], valid: true },
      { percentages: [33.33, 33.33, 33.34], valid: true }, { percentages: [0.29, 99.71], valid: true },
      { percentages: ['50', '50'], valid: true }, { percentages: [0, 100], valid: true },
      { percentages: [50, 50], fixed: 10, valid: true }, { percentages: [], fixed: 7, valid: true },
      { percentages: [], valid: true }, { percentages: [-1, 101], valid: false },
      { percentages: [99.99], valid: false }, { percentages: [100.01], valid: false },
      { percentages: [0], valid: false }, { percentages: [0.001, 99.999], valid: true },
      { percentages: [12.345, 87.655], valid: false },
    ]
    for (const scenario of cases) {
      const entries = scenario.percentages.map((amount) => ({ categoryId: 1, amount, percentage: true }))
      const fundingCategories = scenario.fixed === undefined ? entries
        : [{ categoryId: 1, amount: scenario.fixed, percentage: false }, ...entries]
      const categoryErrors = category({ name: 'Category', fundingAmount: '0.00', type: CategoryType.Bill, fundingCategories })
      const fundingErrors = funding({ date: '2025-03-01', categories: { 1: { baseAmount: -10, fundingCategories } } })
      if (scenario.valid) {
        assert.isEmpty(categoryErrors)
        assert.isEmpty(fundingErrors)
      } else {
        assert.isString(categoryErrors.fundingCategories)
        assert.isString(fundingErrors.categories[1].fundingCategories)
      }
    }
    // Non-Bill Category submissions send [], so hidden legacy rules do not block them.
    assert.isEmpty(category({ name: 'Regular', fundingAmount: '0.00', type: CategoryType.Regular,
      fundingCategories: [{ categoryId: 1, amount: -100, percentage: true }] }))
  })

  test('actual input formatting shows hundredth precision while binary scaling need not be integral', async ({ assert }) => {
    const convert = await initializer('../../../client-src/AmountInput.tsx', 'convertAmount')
    assert.equal(convert(33.333), '33.33')
    assert.equal(convert(0.01), '0.01')
    assert.equal(convert(-1), '-1.00')
    assert.isFalse(Number.isInteger(0.29 * 100))
    assert.equal(Math.round(0.29 * 100), 29)
  })
})

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
function find(element, predicate) {
  if (!element || typeof element !== 'object') return undefined
  if (predicate(element)) return element
  for (const child of (element.props?.children ?? []).flat(Infinity)) {
    const found = find(child, predicate)
    if (found) return found
  }
}

test.group('Category fixed-dollar funding cents', () => {
  test('rule codecs keep fixed dollars in cents and percentages numeric', ({ assert }) => {
    const wire = [{ categoryId: 1, amount: '90071992547409.91', percentage: false },
      { categoryId: 2, amount: 12.75, percentage: true }]
    const rules = decodeCentFundingRules(wire)
    assert.strictEqual(rules[0].amountCents, Number.MAX_SAFE_INTEGER)
    assert.notProperty(rules[0], 'amount')
    assert.strictEqual(rules[1].amount, 12.75)
    assert.notProperty(rules[1], 'amountCents')
    assert.deepEqual(encodeCentFundingRules(rules), wire)
    for (const value of ['0.125', '1.2', '-0.00', 'NaN', 1, '90071992547409.92']) {
      assert.throws(() => decodeCentFundingRules([{ categoryId: 1, amount: value, percentage: false }]))
    }
    for (const value of [NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => encodeCentFundingRules([{ categoryId: 1, amountCents: value, percentage: false }]))
    }
    assert.throws(() => decodeCentFundingRules([{ categoryId: 1, amount: '1.00', percentage: null }]))
  })

  test('Category CREATE/edit dialogs preserve text and submit fixed-dollar cents').with([
    ['0.125', 13], ['-0.125', -12], ['0.00', 0], ['-0.00', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ]).run(async ({ assert }, [amount, expected]) => {
    for (const editing of [false, true]) {
      let saved
      const group = { id: 1, name: 'Budget', children: [], fundingPoolCat: { id: 99 },
        addCategory: async values => { saved = values; return null } }
      const category = editing ? { name: 'Bill', type: CategoryType.Bill, group, recurrence: 1, fundingAmountCents: 30,
        fundingCategories: [{ categoryId: 1, amountCents: 10, percentage: false }, { categoryId: 99, amount: 100, percentage: true }],
        update: async values => { saved = values; return null } } : null
      const view = await initializer('../../../client-src/Categories/CategoryView/CategoryDialog.tsx', 'CategoryDialog', {
        React: { createElement, useState: initial => [initial, () => undefined] }, DateTime,
        useStores: () => ({ categoryTree: { budget: group, bills: group, unassignedCat: { id: 0 }, getGroup: () => group } }),
        FormModal: 'modal', FormError: 'error', FormField: 'formField', FormCheckbox: 'checkbox', Field: 'field',
        AmountInput: 'input', CategorySpread: 'spread', isGroup: () => false, styles: {},
      })
      const modal = view({ category, type: CategoryType.Bill, setShow: () => undefined })
      assert.strictEqual(modal.props.initialValues.fundingAmount, editing ? '0.30' : '0.00')
      if (editing) assert.strictEqual(modal.props.initialValues.fundingCategories[0].amount, '0.10')
      const values = { ...modal.props.initialValues, name: 'Bill', fundingAmount: amount,
        fundingCategories: [{ categoryId: 1, amount, percentage: false }, { categoryId: 99, amount: 100, percentage: true }] }
      assert.isEmpty(modal.props.validate(values))
      await modal.props.onSubmit(values, { setErrors: () => undefined })
      assert.strictEqual(saved.fundingAmountCents, expected)
      assert.strictEqual(saved.fundingCategories[0].amountCents, expected)
      assert.strictEqual(saved.fundingCategories[1].amount, 100)
      assert.notProperty(saved, 'fundingAmount')
      assert.strictEqual(values.fundingAmount, amount)
      const body = modal.props.children[0]({ values })
      const field = find(body, element => element.type === 'field' && element.props.name === 'fundingAmount')
      assert.isTrue(field.props.children[0]({ field: { value: amount } }).props.exactCents)
      assert.isTrue(find(body, element => element.type === 'spread').props.centAmounts)
      for (const invalid of ['bad', 'Infinity', '90071992547409.92']) {
        assert.isString(modal.props.validate({ ...values, fundingAmount: invalid }).fundingAmount)
        assert.isString(modal.props.validate({ ...values, fundingCategories: [{ categoryId: 1, amount: invalid, percentage: false }] }).fundingCategories)
      }
    }
  })

  test('shared spread editor toggles money text and numeric percentages without changing other callers', async ({ assert }) => {
    const view = await initializer('../../../client-src/CategorySpread/CategorySpread.tsx', 'CategorySpread', {
      React: { createElement }, useStores: () => ({ categoryTree: { unassignedCat: { id: 0 } } }),
      FieldArray: 'array', Field: 'field', FormField: 'formField', FormCategoryInput: 'category', AmountInput: 'input',
      Button: 'button', LucideButton: 'lucide', Plus: 'plus', Minus: 'minus', styles: {},
    })
    for (const centAmounts of [false, true]) {
      for (const percentage of [false, true]) {
        const rule = { id: 7, categoryId: 1, percentage, amount: percentage || !centAmounts ? 12.75 : '12.75' }
        const element = view({ name: 'rules', categories: [rule], title: 'Rules', centAmounts })
        const rows = find(element, e => e.type === 'array').props.children[0]({})
        let updated
        const percentField = find({ props: { children: rows } }, e => e.type === 'field' && e.props.name.endsWith('.percentage'))
        const button = percentField.props.children[0]({ field: { name: 'rules[0].percentage', value: percentage },
          form: { setFieldValue: (name, value) => { updated = { name, value } } } })
        button.props.onClick()
        if (centAmounts) {
          assert.strictEqual(updated.name, 'rules[0]')
          assert.strictEqual(updated.value.amount, percentage ? '12.75' : 12.75)
          assert.strictEqual(updated.value.percentage, !percentage)
          assert.strictEqual(updated.value.id, 7)
        } else {
          assert.strictEqual(updated.name, 'rules[0].percentage')
          assert.strictEqual(updated.value, !percentage)
        }
        const field = find({ props: { children: rows } }, e => e.type === 'formField')
        assert.strictEqual(field.props.children[0]({ field: { value: rule.amount } }).props.exactCents, centAmounts && !percentage)
      }
    }
  })
})

test.group('Auto-assignment fixed-dollar cents', () => {
  test('CREATE/edit dialogs retain fixed cents, round text and keep percentages numeric').with([
    ['0.125', 13], ['-0.125', -12], ['0.00', 0], ['-0.00', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ]).run(async ({ assert }, [amount, expected]) => {
    for (const editing of [false, true]) {
      let saved
      const save = async values => { saved = values }
      const autoAssignment = editing ? { name: 'Rule', searchStrings: ['Shop'], categories: [
        { id: 7, categoryId: 1, percentage: null, amountCents: -12 },
        { id: 8, categoryId: 2, percentage: true, amount: 12.75 },
      ], update: save } : undefined
      const view = await initializer('../../../client-src/AutoAssignment/AutoAssignmentDialog.tsx', 'AutoAssignmentDialog', {
        observer: component => component, React: { createElement, Fragment: 'fragment' },
        useStores: () => ({ autoAssignments: { add: save }, categoryTree: { unassignedCat: { id: 0 } } }),
        FormModal: 'modal', FormField: 'field', FieldArray: 'array', CategorySpread: 'spread', LucideButton: 'button',
        Plus: 'plus', Minus: 'minus', styles: {},
      })
      const modal = view({ autoAssignment, setShow: () => undefined })
      if (editing) {
        assert.strictEqual(modal.props.initialValues.categories[0].amount, '-0.12')
        assert.isFalse(modal.props.initialValues.categories[0].percentage)
        assert.strictEqual(modal.props.initialValues.categories[1].amount, 12.75)
      }
      const values = { name: 'Updated', searchStrings: ['Shop'], categories: [
        { id: -1, categoryId: 1, percentage: false, amount },
        { id: 8, categoryId: 2, percentage: true, amount: '12.75' },
      ] }
      assert.isEmpty(modal.props.validate(values))
      await modal.props.onSubmit(values)
      assert.strictEqual(saved.categories[0].amountCents, expected)
      assert.notProperty(saved.categories[0], 'amount')
      assert.strictEqual(saved.categories[0].id, -1)
      assert.strictEqual(saved.categories[1].amount, 12.75)
      assert.notProperty(saved.categories[1], 'amountCents')
      assert.strictEqual(saved.name, 'Updated')
      assert.deepEqual(Array.from(saved.searchStrings), ['Shop'])
      assert.strictEqual(values.categories[0].amount, amount)
      const body = modal.props.children[0]({ values })
      assert.isTrue(find(body, e => e.type === 'spread').props.centAmounts)
      for (const invalid of ['bad', 'Infinity', '90071992547409.92']) {
        assert.isString(modal.props.validate({ ...values, categories: [{ id: 1, categoryId: 1, percentage: false, amount: invalid }] }).categories)
      }
      assert.isString(modal.props.validate({ ...values, categories: [{ id: 1, categoryId: 1, percentage: true, amount: 'bad' }] }).categories)
    }
  })
})
