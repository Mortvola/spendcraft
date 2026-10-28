import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as cents from '../../../common/moneyCents.ts'
import { inputMoneyCents, decodeAmount } from '../../../client-src/monetary.ts'
import parseEquation from '../../../client-src/EquationParser.ts'
import { AccountType, TransactionType, TrackingType } from '../../../common/ResponseTypes.ts'

// Exercise actual component callbacks using the same offline harness as Statement editors.
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
async function expression(file, name, context = {}) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let value
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) value = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!value) throw new Error(`Missing ${name}`)
  return runInNewContext(ts.transpileModule(`(${value})`, { compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  } }).outputText, { ...cents, inputMoneyCents, decodeAmount, AccountType, TransactionType, TrackingType,
    React: { createElement, Fragment: 'fragment' }, useMemo: callback => callback(), useMediaQuery: () => ({ isMobile: false }),
    FormModal: 'modal', FormField: 'formField', Field: 'field', FormError: 'error', MoneyCentsAmount: 'money',
    AmountInput: 'input', CategorySplits: 'splits', TransactionTaxCategories: 'taxes', PurchaseLocation: 'location', styles: {}, ...context })
}
function find(element, predicate) {
  if (!element || typeof element !== 'object') return undefined
  if (predicate(element)) return element
  for (const child of (element.props?.children ?? []).flat(Infinity)) {
    const found = find(child, predicate)
    if (found) return found
  }
}
const zero = cents.parseMoneyCents('0.00')
let sumSplitCents, sumTaxCents, dialog

test.group('Transaction split cents', group => {
  group.setup(async () => {
    sumSplitCents = await expression('client-src/CategorySplits.tsx', 'sumSplitCents')
    sumTaxCents = await expression('client-src/Transactions/TransactionTaxCategories.tsx', 'sumTaxCents')
    dialog = await expression('client-src/Transactions/TransactionDialog.tsx', 'TransactionDialog', { sumSplitCents, sumTaxCents })
  })
  const split = (amount, categoryId = 20) => ({ id: categoryId, categoryId, amount, comment: 'Retain memo' })
  const account = sign => ({ sign, type: AccountType.Depository, tracking: TrackingType.Transactions })
  const values = (modal, amount, amounts) => ({ ...modal.props.initialValues, amount, splits: amounts.map(value => split(value)) })
  const splitView = (modal, value) => find(modal, e => e.type === 'field' && e.props.name === 'splits').props.children[0]({
    field: { name: 'splits', value: value.splits }, form: { values: value, setFieldValue: () => undefined },
  })

  test('sum, validation and remainder are exact').with([
    ['0.30', ['0.10', '0.20'], 0], ['-0.30', ['0.10', '0.20'], 0],
    ['0.30', ['0.10'], 20], ['0.10', ['0.20'], -10], ['0.00', ['0.00'], 0],
    ['0.30', ['0.40', '-0.10'], 0], ['0.13', ['0.125'], 0],
    ['0.12', ['0.125'], -1], ['0.30', [], 0],
    ['0.18', ['0.30', '-0.125'], 0], ['-0.00', ['0.00'], 0],
  ]).run(({ assert }, [total, amounts, remaining]) => {
    const modal = dialog({ account: account(1), setShow: () => undefined })
    const formValues = values(modal, total, amounts)
    const errors = modal.props.validate(formValues)
    assert.strictEqual(Boolean(errors.splits), remaining !== 0)
    const view = splitView(modal, formValues)
    assert.strictEqual(find(view, e => e.type === 'money').props.amount, remaining)
  })

  test('invalid and overflowing amounts return form errors').with([
    ['garbage', ['0.00'], 'amount'], ['Infinity', ['0.00'], 'amount'],
    ['90071992547409.92', ['0.00'], 'amount'], ['0.00', ['bad'], 'splits'],
    ['0.00', ['90071992547409.92'], 'splits'],
    ['0.00', ['90071992547409.91', '0.01'], 'splits'],
  ]).run(({ assert }, [total, amounts, field]) => {
    const modal = dialog({ account: account(1), setShow: () => undefined })
    const formValues = values(modal, total, amounts)
    assert.isString(modal.props.validate(formValues)[field])
    const view = splitView(modal, formValues)
    assert.isUndefined(find(view, e => e.type === 'money'))
  })

  test('edit initialization reads retained cents rather than dollar properties', ({ assert }) => {
    const transaction = { date: { toISODate: () => '2025-01-01' }, amount: 999, amountCents: -30,
      categories: [{ id: 0, categoryId: 20, amount: 999, comment: 'Keep', funder: true }],
      getCategoryAmountCents: () => -30, taxCategories: [], type: TransactionType.MANUAL_TRANSACTION }
    const modal = dialog({ account: account(-1), transaction, setShow: () => undefined })
    assert.strictEqual(modal.props.initialValues.amount, '0.30')
    assert.strictEqual(modal.props.initialValues.splits[0].amount, '0.30')
    assert.strictEqual(modal.props.initialValues.splits[0].comment, 'Keep')
    assert.isTrue(modal.props.initialValues.splits[0].funder)
    assert.deepEqual(Object.keys(modal.props.validate(modal.props.initialValues)), [])
    assert.strictEqual(transaction.categories[0].amount, 999)
  })

  test('creation and updates preserve signs and numeric state boundaries without mutating edits').with([1, -1])
    .run(async ({ assert }, sign) => {
      let created, updated
      const acct = { ...account(sign), addTransaction: async value => { created = value; return null } }
      const add = dialog({ account: acct, setShow: () => undefined })
      const formValues = values(add, '0.30', ['0.10', '0.20'])
      await add.props.onSubmit(formValues, { setErrors: () => undefined })
      assert.strictEqual(created.amount, sign * 0.3)
      assert.deepEqual(Array.from(created.categories, c => c.amount), [sign * 0.1, sign * 0.2])
      assert.strictEqual(formValues.splits[0].amount, '0.10')
      assert.strictEqual(created.categories[0].comment, 'Retain memo')
      const transaction = { date: { toISODate: () => '2025-01-01' }, amountCents: sign * 30,
        categories: [], taxCategories: [], type: TransactionType.MANUAL_TRANSACTION,
        updateTransaction: async value => { updated = value; return null } }
      const edit = dialog({ account: acct, transaction, setShow: () => undefined })
      await edit.props.onSubmit({ ...formValues, taxCategories: [{ type: 'test', amount: '0.20' }] }, { setErrors: () => undefined })
      assert.strictEqual(updated.amount, sign * 0.3)
      assert.deepEqual(Array.from(updated.categories, c => c.amount), [sign * 0.1, sign * 0.2])
      assert.strictEqual(updated.taxCategories[0].amount, 0.2)
    })

  test('split add/remove/edit uses exact remainder and preserves metadata', async ({ assert }) => {
    let edited, callback
    const render = await expression('client-src/CategorySplits.tsx', 'CategorySplits', { sumSplitCents,
      nextId: () => -1, CategorySplitItem: 'item', useStores: () => ({ categoryTree: { unassignedCat: { id: 99 } } }),
      useEffect: () => undefined, useState: initial => [edited ?? initial, value => { edited = value }],
    })
    const props = { splits: [split('0.10')], total: cents.parseMoneyCents('0.30'), onChange: value => { callback = value } }
    let view = render(props)
    find(view, e => e.type === 'item').props.onAddItem(20)
    assert.strictEqual(callback[1].amount, '0.20')
    view = render(props)
    find(view, e => e.type === 'item').props.onAmountChange(20, '0.20')
    view = render(props)
    find(view, e => e.type === 'item').props.onAddItem(20)
    assert.strictEqual(callback[1].amount, '-0.10')
    assert.strictEqual(callback[0].comment, 'Retain memo')
    view = render(props)
    find(view, e => e.type === 'item').props.onDeleteItem(-1)
    assert.lengthOf(callback, 2)
    view = render(props)
    find(view, e => e.type === 'item').props.onAmountChange(20, 'bad')
    view = render(props)
    assert.doesNotThrow(() => find(view, e => e.type === 'item').props.onAddItem(20))
    assert.lengthOf(callback, 2)
  })

  test('tax-attribution totals and validation use exact cents without a matching rule').with([
    [['0.10', '0.20'], 30], [['-0.10', '0.20'], 10], [['0.00', '-0.00'], 0],
    [['0.125', '-0.125'], 1], [[], 0], [['-0.30'], -30],
  ]).run(({ assert }, [amounts, expected]) => {
    const modal = dialog({ account: account(1), setShow: () => undefined })
    const field = find(modal, e => e.type === 'field' && e.props.name === 'taxCategories')
    const taxes = amounts.map(amount => ({ type: 'test', amount }))
    assert.isUndefined(field.props.validate(taxes))
    const view = field.props.children[0]({ field: { name: 'taxCategories', value: taxes }, form: { setFieldValue: () => undefined } })
    assert.strictEqual(find(view, e => e.type === 'money').props.amount, expected)
    assert.strictEqual(sumTaxCents(taxes), expected)
  })

  test('invalid and overflowing tax amounts fail validation').with([
    ['bad'], ['Infinity'], ['90071992547409.92'], ['90071992547409.91', '0.01'],
  ]).run(({ assert }, amounts) => {
    const modal = dialog({ account: account(1), setShow: () => undefined })
    const field = find(modal, e => e.type === 'field' && e.props.name === 'taxCategories')
    const taxes = amounts.map(amount => ({ type: 'test', amount }))
    assert.isString(field.props.validate(taxes))
    const view = field.props.children[0]({ field: { name: 'taxCategories', value: taxes }, form: { setFieldValue: () => undefined } })
    assert.isUndefined(find(view, e => e.type === 'money'))
  })

  test('tax edits initialize from retained cents and submit numeric state values without changing signs', async ({ assert }) => {
    let saved
    const transaction = { date: { toISODate: () => '2025-01-01' }, amountCents: -30,
      categories: [], taxCategories: [{ type: 'test', amount: 999 }], getTaxAmountCents: () => -12,
      type: TransactionType.MANUAL_TRANSACTION, updateTransaction: async value => { saved = value; return null } }
    const modal = dialog({ account: account(-1), transaction, setShow: () => undefined })
    assert.strictEqual(modal.props.initialValues.taxCategories[0].amount, '-0.12')
    const edits = { ...modal.props.initialValues, taxCategories: [{ type: 'test', amount: '-0.125' }] }
    await modal.props.onSubmit(edits, { setErrors: () => undefined })
    assert.strictEqual(saved.taxCategories[0].amount, -0.12)
    assert.strictEqual(saved.taxCategories[0].type, 'test')
    assert.strictEqual(edits.taxCategories[0].amount, '-0.125')
    assert.strictEqual(transaction.taxCategories[0].amount, 999)
  })

  test('tax rows preserve exact edited text and existing add/delete/category behavior', async ({ assert }) => {
    let edited, changed
    let nextId = -1
    const render = await expression('client-src/Transactions/TransactionTaxCategories.tsx', 'TransactionTaxCategories', {
      nextId: () => nextId--, TransactionTaxCategory: 'taxRow',
      useStores: () => ({ categoryTree: { unassignedCat: { id: 99 } } }), useEffect: () => undefined,
      useState: initial => [edited ?? initial, value => { edited = value }],
    })
    const props = { taxCategories: [{ id: 1, type: 'test', amount: '0.10' }], onChange: value => { changed = value } }
    const row = () => find(render(props), e => e.type === 'taxRow')
    row().props.onAmountChange(1, '0.20')
    assert.strictEqual(changed[0].amount, '0.20')
    row().props.onCategoryChange(1, 'other')
    assert.strictEqual(changed[0].type, 'other')
    row().props.onAddItem(1)
    assert.strictEqual(changed[1].amount, '0.00')
    row().props.onDeleteItem(1)
    const remainingId = changed[0].id
    row().props.onDeleteItem(remainingId)
    assert.lengthOf(changed, 1)
    assert.strictEqual(changed[0].amount, '0.00')
    assert.strictEqual(changed[0].type, '')
    const item = await expression('client-src/Transactions/TransactionTaxCategory.tsx', 'TransactionTaxCategory', {
      useStores: () => ({ taxCategories: { taxCategories: [] } }), LucideButton: 'button', Plus: 'plus', Minus: 'minus',
    })
    const view = item({ split: { id: 1, type: '', amount: '0.10' }, onAmountChange: (_id, amount) => { changed = amount } })
    const input = find(view, e => e.type === 'input')
    assert.isTrue(input.props.exactCents)
    input.props.onValueChange('0.125')
    assert.strictEqual(changed, '0.125')
  })

  test('shared transfer editors preserve numeric callbacks and mode', async ({ assert }) => {
    const view = await expression('client-src/CategoryTransferDialog.tsx', 'CategoryTransferDialog', {
      Formik: 'formik', Form: 'form', Modal: { Header: 'header' }, Header: 'header', Footer: 'footer',
      ErrorMessage: 'error', Http: {}, encodeTransferCategories: value => value,
    })
    const modal = view({ setShow: () => undefined })
    const body = modal.props.children[0]({ isSubmitting: false })
    const child = find(body, e => e.type === 'field' && e.props.name === 'fromCategories')
    let updated
    const editor = child.props.children[0]({ field: { value: [split(-0.3)], name: 'fromCategories' },
      form: { setFieldValue: (_name, value) => { updated = value } } })
    assert.isTrue(editor.props.numericInput)
    assert.strictEqual(editor.props.splits[0].amount, '0.30')
    editor.props.onChange([split('0.20')])
    assert.strictEqual(updated[0].amount, -0.2)
    const itemView = await expression('client-src/CategorySplitItem.tsx', 'CategorySplitItem', {
      useStores: () => ({ categoryTree: { unassignedCat: { id: 99 } } }),
      CategoryInput: 'category', LucideButton: 'button', Plus: 'plus', Minus: 'minus',
    })
    const item = itemView({ split: split('0.10'), numericInput: true, onAmountChange: (_id, amount) => { updated = amount } })
    const input = find(item, e => e.type === 'input')
    assert.isFalse(input.props.exactCents)
    input.props.onDeltaChange(0.2, 0.1)
    assert.strictEqual(updated, '0.20')
  })

  test('exact AmountInput preserves canonical cents and invalid text', async ({ assert }) => {
    let slots, cursor
    const render = await expression('client-src/AmountInput.tsx', 'AmountInput', {
      React: { createElement, Fragment: 'fragment', useRef: () => ({ current: null }) },
      useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value }] },
      useRef: () => ({ current: null }), parseEquation, Console: { log: error => { throw error } }, Overlay: 'overlay', Popover: 'popover', PopoverHeader: 'header', PopoverBody: 'body',
    })
    for (const value of ['90071992547409.91', '0.30', '-0.12', 'bad']) {
      slots = []; cursor = 0
      let changed
      const view = render({ exactCents: true, value, onValueChange: value => { changed = value } })
      const input = find(view, e => e.type === 'input')
      assert.strictEqual(input.props.value, value)
      input.props.onChange({ target: { value: '0.20' } })
      assert.strictEqual(changed, '0.20')
      const equation = find(view, e => e.type === 'input' && e.props.onChange !== input.props.onChange)
      equation.props.onChange({ target: { value: '0.10+0.20' } })
      assert.strictEqual(changed, '0.30')
    }
    assert.strictEqual(sumSplitCents([split('0.10'), split('0.20')]), 30)
    assert.strictEqual(cents.subtractMoneyCents(zero, sumSplitCents([split('0.10'), split('-0.10')])), 0)
  })
})
