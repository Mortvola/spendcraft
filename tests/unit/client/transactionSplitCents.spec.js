import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as cents from '../../../common/moneyCents.ts'
import { inputMoneyCents, decodeAmount, encodeTransferCategories } from '../../../client-src/monetary.ts'
import parseEquation from '../../../client-src/EquationParser.ts'
import { DateTime } from 'luxon'
import { setImmediate } from 'node:timers'
import { URL, URLSearchParams } from 'node:url'
import { AccountType, TransactionType, TrackingType, CategoryType, isCategoryTreeBalanceResponse } from '../../../common/ResponseTypes.ts'

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

  test('creation and updates retain signed cents without mutating edits').with([1, -1])
    .run(async ({ assert }, sign) => {
      let created, updated
      const acct = { ...account(sign), addTransaction: async value => { created = value; return null } }
      const add = dialog({ account: acct, setShow: () => undefined })
      const formValues = values(add, '0.30', ['0.10', '0.20'])
      await add.props.onSubmit(formValues, { setErrors: () => undefined })
      assert.strictEqual(created.amountCents, sign * 30)
      assert.deepEqual(Array.from(created.categories, c => c.amountCents), [sign * 10, sign * 20])
      assert.strictEqual(formValues.splits[0].amount, '0.10')
      assert.strictEqual(created.categories[0].comment, 'Retain memo')
      const transaction = { date: { toISODate: () => '2025-01-01' }, amountCents: sign * 30,
        categories: [], taxCategories: [], type: TransactionType.MANUAL_TRANSACTION,
        updateTransaction: async value => { updated = value; return null } }
      const edit = dialog({ account: acct, transaction, setShow: () => undefined })
      await edit.props.onSubmit({ ...formValues, taxCategories: [{ type: 'test', amount: '0.20' }] }, { setErrors: () => undefined })
      assert.strictEqual(updated.amountCents, sign * 30)
      assert.deepEqual(Array.from(updated.categories, c => c.amountCents), [sign * 10, sign * 20])
      assert.strictEqual(updated.taxCategories[0].amountCents, 20)
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

  test('Loan dialog retains principal cents and derives interest from current inputs').with([1, -1])
    .run(async ({ assert }, sign) => {
      let saved
      const transaction = { date: { toISODate: () => '2025-01-01' }, amountCents: 30, principleCents: 10,
        amount: 999, principle: 999, categories: [], taxCategories: [], type: TransactionType.MANUAL_TRANSACTION,
        updateTransaction: async value => { saved = value; return null } }
      const modal = dialog({ account: { ...account(sign), type: AccountType.Loan }, transaction, setShow: () => undefined })
      assert.strictEqual(modal.props.initialValues.principle, '0.10')
      assert.strictEqual(modal.props.initialValues.interest, '0.20')
      const field = find(modal, e => e.type === 'formField' && e.props.name === 'interest')
      const interest = values => field.props.children[0]({ form: { values } })
      assert.strictEqual(interest(modal.props.initialValues).props.amount, 20)
      const edits = { ...modal.props.initialValues, amount: sign === -1 ? '-0.30' : '0.30', principle: '0.20' }
      assert.strictEqual(interest(edits).props.amount, 10)
      edits.principle = '-0.125'
      assert.strictEqual(interest(edits).props.amount, 42)
      await modal.props.onSubmit(edits, { setErrors: () => undefined })
      assert.strictEqual(saved.principleCents, -12)
      assert.strictEqual(saved.amountCents, 30)
      assert.strictEqual(transaction.principle, 999)
      const principalField = find(modal, e => e.type === 'formField' && e.props.name === 'principle')
      const input = principalField.props.children[0]({ field: { value: '0.10' } })
      assert.isTrue(input.props.exactCents)
      for (const principal of ['bad', 'Infinity', '90071992547409.92']) {
        assert.isString(modal.props.validate({ ...edits, principle: principal }).principle)
      }
      const overflow = { ...edits, amount: sign === -1 ? '-90071992547409.91' : '90071992547409.91', principle: '-0.01' }
      assert.isString(modal.props.validate(overflow).principle)
      assert.isUndefined(interest(overflow).props.amount)
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

  test('tax edits initialize and submit retained cents without changing signs', async ({ assert }) => {
    let saved
    const transaction = { date: { toISODate: () => '2025-01-01' }, amountCents: -30,
      categories: [], taxCategories: [{ type: 'test', amount: 999 }], getTaxAmountCents: () => -12,
      type: TransactionType.MANUAL_TRANSACTION, updateTransaction: async value => { saved = value; return null } }
    const modal = dialog({ account: account(-1), transaction, setShow: () => undefined })
    assert.strictEqual(modal.props.initialValues.taxCategories[0].amount, '-0.12')
    const edits = { ...modal.props.initialValues, taxCategories: [{ type: 'test', amount: '-0.125' }] }
    await modal.props.onSubmit(edits, { setErrors: () => undefined })
    assert.strictEqual(saved.taxCategories[0].amountCents, -12)
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

  test('duplicate comparison retains canonical API amounts as cents', async ({ assert }) => {
    let loaded
    const effects = []
    const view = await expression('client-src/Transactions/DuplicateDialog.tsx', 'DuplicateDialog', {
      React: { createElement, Fragment: 'fragment', useState: () => [null, value => { loaded = value }],
        useEffect: callback => effects.push(callback) }, DateTime, TransactionFields: 'duplicateFields',
      ModalHeader: 'header', ModalBody: 'body', ModalFooter: 'footer',
      Http: { get: async () => ({ ok: true, body: async () => ({ date: '2025-01-01',
        accountTransaction: { name: 'Peer', amount: '90071992547409.91' } }) }) },
    })
    const modal = view({ transaction: { duplicateOfTransactionId: 8, amountCents: 30 }, setShow: () => undefined })
    assert.strictEqual(find(modal, element => element.type === 'duplicateFields').props.amountCents, 30)
    effects[0]()
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(loaded.amountCents, Number.MAX_SAFE_INTEGER)
    assert.notProperty(loaded, 'amount')
  })

  test('offline opening-balance dialogs pass exact cents without changing account signs').with([
    ['0.10', 10], ['-0.30', -30], ['0.125', 13], ['-0.125', -12], ['-0.00', 0],
    ['0.00', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ]).run(async ({ assert }, [balance, expected]) => {
    for (const type of [AccountType.Depository, AccountType.Credit, AccountType.Loan]) {
      for (const existingInstitution of [false, true]) {
        let saved, closed
        const add = async (...args) => { saved = args; return null }
        const view = await expression('client-src/AccountView/OfflineAccountDialog.tsx', 'OfflineAccountDialog', {
          useStores: () => ({ accounts: { addOfflineAccount: add } }),
          FormTextField: 'textField', AccountTypeField: 'accountType', AccountSubtypeField: 'subtype', APRField: 'apr',
        })
        const modal = view({ institution: existingInstitution ? { name: 'Bank', addOfflineAccount: add } : undefined,
          setShow: value => { closed = value } })
        assert.strictEqual(modal.props.initialValues.balance, '0.00')
        const values = { ...modal.props.initialValues, institute: 'Bank', account: 'Checking', startDate: '2025-01-01',
          balance, type, rate: '3.125' }
        assert.deepEqual(Object.keys(modal.props.validate(values)), [])
        await modal.props.onSubmit(values, { setErrors: () => undefined })
        assert.strictEqual(saved[existingInstitution ? 1 : 2], expected)
        assert.strictEqual(saved[existingInstitution ? 3 : 4], type)
        assert.strictEqual(saved.at(-1), 3.125)
        assert.strictEqual(closed, false)
        assert.strictEqual(values.balance, balance)
        const field = find(modal, element => element.type === 'formField' && element.props.name === 'balance')
        const input = field.props.children[0]({ field: { value: balance } })
        assert.isTrue(input.props.exactCents)
        assert.strictEqual(input.props.value, balance)
      }
    }
  })

  test('invalid opening balances fail dialog validation').with([
    '', ' ', '-', 'garbage', '1.00junk', 'NaN', 'Infinity', '-Infinity', '90071992547409.92',
  ]).run(async ({ assert }, balance) => {
    const view = await expression('client-src/AccountView/OfflineAccountDialog.tsx', 'OfflineAccountDialog', {
      useStores: () => ({ accounts: {} }), FormTextField: 'textField', AccountTypeField: 'accountType',
      AccountSubtypeField: 'subtype', APRField: 'apr',
    })
    const modal = view({ setShow: () => undefined })
    const errors = modal.props.validate({ ...modal.props.initialValues, institute: 'Bank', account: 'Checking',
      startDate: '2025-01-01', balance })
    assert.isString(errors.balance)
  })

  test('offline account metadata edits preserve existing balances', async ({ assert }) => {
    let updated
    const view = await expression('client-src/AccountView/OfflineAccountDialog.tsx', 'OfflineAccountDialog', {
      useStores: () => ({ accounts: {} }), FormTextField: 'textField', AccountTypeField: 'accountType',
      AccountSubtypeField: 'subtype', APRField: 'apr',
    })
    const account = { name: 'Checking', type: AccountType.Credit, subtype: 'credit card', balanceCents: Number.MAX_SAFE_INTEGER,
      updateOfflineAccount: async (...values) => { updated = values } }
    const modal = view({ institution: { name: 'Bank' }, account, setShow: () => undefined })
    assert.strictEqual(modal.props.initialValues.balance, '90071992547409.91')
    const edits = { ...modal.props.initialValues, account: 'Renamed', balance: 'unused invalid balance' }
    assert.deepEqual(Object.keys(modal.props.validate(edits)), [])
    await modal.props.onSubmit(edits, { setErrors: () => undefined })
    assert.deepEqual(Array.from(updated), ['Renamed', AccountType.Credit, 'credit card'])
    assert.strictEqual(account.balanceCents, Number.MAX_SAFE_INTEGER)
    assert.isUndefined(find(modal, element => element.type === 'formField' && element.props.name === 'balance'))
  })

  const rebalanceDialog = context => expression('client-src/Rebalance/RebalanceDialog.tsx', 'RebalanceDialog', {
    sumSplitCents, DateTime, CategoryRebalance: 'rebalance', useStores: () => ({ register: {} }),
    useState: initial => [initial, () => undefined], useCallback: callback => callback, useEffect: () => undefined,
    ...context,
  })

  test('Rebalance zero-sum validation and unassigned display use checked cents').with([
    [['0.10', '0.20', '-0.30'], 0], [['0.30', '-0.10'], -20], [['0.00'], 0],
    [['0.125', '-0.13'], 0], [['bad'], null], [['Infinity'], null],
    [['90071992547409.92'], null], [['90071992547409.91', '0.01'], null],
  ]).run(async ({ assert }, [amounts, remaining]) => {
    const view = await rebalanceDialog()
    const modal = view({ setShow: () => undefined })
    const values = { date: '2025-01-01', categories: amounts.map(value => split(value)) }
    assert.strictEqual(Boolean(modal.props.validate(values).categories), remaining !== 0)
    const field = find(modal, e => e.type === 'field' && e.props.name === 'categories')
    const result = field.props.children[0]({ field: { value: values.categories } })
    assert.strictEqual(result.props.amount ?? null, remaining)
    assert.isString(modal.props.validate({ date: '', categories: [] }).date)
    assert.isString(modal.props.validate({ date: '2025-01-01', categories: [] }).categories)
  })

  test('Rebalance edit loads retained cents and submits unchanged canonical requests').with([false, true])
    .run(async ({ assert }, editing) => {
      let saved, type
      const submit = async (request, transactionType) => { saved = { ...request, categories: encodeTransferCategories(request.categories) }; type = transactionType; return null }
      const transaction = editing ? { date: DateTime.fromISO('2025-01-01'), categories: [{ categoryId: 20, amount: 999 }],
        getCategoryAmountCents: () => -30, updateCategoryTransfer: submit } : undefined
      const view = await rebalanceDialog({ useStores: () => ({ register: { addCategoryTransfer: submit } }) })
      const modal = view({ transaction, setShow: () => undefined })
      if (editing) assert.strictEqual(modal.props.initialValues.categories[0].amount, '-0.30')
      const values = { date: '2025-01-01', categories: [split('0.125'), split('-0.13', 21)] }
      await modal.props.onSubmit(values)
      assert.deepEqual(Array.from(saved.categories, category => category.amount), ['0.13', '-0.13'])
      assert.strictEqual(saved.categories[0].comment, 'Retain memo')
      assert.strictEqual(values.categories[0].amount, '0.125')
      if (!editing) assert.strictEqual(type, TransactionType.REBALANCE_TRANSACTION)
    })

  test('Rebalance snapshot decodes raw API balances directly into cents', async ({ assert }) => {
    let loaded, url
    const view = await expression('client-src/Rebalance/RebalanceDialog.tsx', 'fetchCategoryBalances', {
      useCallback: callback => callback, transaction: { id: 7 }, URL, URLSearchParams,
      window: { location: { href: 'https://example.test/' } }, isCategoryTreeBalanceResponse,
      setBalances: value => { loaded = value },
      Http: { get: async value => { url = value; return { ok: true, body: async () => [{ id: 20, balance: '90071992547409.91' }] } } },
    })
    view('2025-01-01')
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(loaded[0].balanceCents, Number.MAX_SAFE_INTEGER)
    assert.notProperty(loaded[0], 'balance')
    assert.strictEqual(new URL(url).searchParams.get('id'), '7')
    assert.strictEqual(new URL(url).searchParams.get('date'), '2025-01-01')
  })

  test('Rebalance projected balance and amount input stay exact').with([
    [10, '0.20', 30], [-20, '0.20', 0], [30, '-0.10', 20],
    [Number.MAX_SAFE_INTEGER, '0.00', Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, '0.01', null], [0, '-', null],
  ]).run(async ({ assert }, [balanceCents, adjustment, expected]) => {
    let changed
    const view = await expression('client-src/Rebalance/CategoryRebalanceItem.tsx', 'CategoryRebalanceItem')
    const row = view({ category: { name: 'Keep', balanceCents, adjustment }, onChange: value => { changed = value } })
    const amounts = row.props.children.filter(child => child.type === 'money')
    assert.strictEqual(amounts[0].props.amount, balanceCents)
    assert.strictEqual(amounts[1]?.props.amount ?? null, expected)
    const input = find(row, e => e.type === 'input')
    assert.isTrue(input.props.exactCents)
    input.props.onValueChange('0.125')
    assert.strictEqual(changed, '0.125')
  })

  test('Rebalance edits preserve metadata, remove zero adjustments and retain incomplete input', async ({ assert }) => {
    const category = { id: 20, type: CategoryType.Regular, name: 'A', subcategories: [] }
    const tree = { budget: { children: [category] }, bills: { children: [] } }
    const view = await expression('client-src/Rebalance/CategoryRebalance.tsx', 'CategoryRebalance', {
      CategoryRebalanceItem: 'item', useStores: () => ({ categoryTree: tree }), CategoryType, isGroup: () => false,
    })
    let categories = [split('0.10')]
    const row = () => find(view({ balances: [{ id: 20, balanceCents: 10 }], trxCategories: categories,
      onChange: value => { categories = value } }), e => e.type === 'item')
    row().props.onChange('0.20')
    assert.strictEqual(categories[0].comment, 'Retain memo')
    assert.strictEqual(row().props.category.adjustment, '0.20')
    assert.strictEqual(row().props.category.balanceCents, 10)
    row().props.onChange('0.00')
    assert.lengthOf(categories, 0)
    row().props.onChange('-')
    assert.strictEqual(categories[0].amount, '-')
    row().props.onChange('-0.20')
    assert.strictEqual(categories[0].amount, '-0.20')
  })

  const transferDialog = () => expression('client-src/CategoryTransferDialog.tsx', 'CategoryTransferDialog', {
    Formik: 'formik', Form: 'form', Header: 'header', Footer: 'footer', ErrorMessage: 'error', sumSplitCents,
    encodeTransferCategories,
  })

  test('transfer totals, difference and validation are exact').with([
    [['0.10', '0.20'], ['0.30'], 30, 30, 0], [['0.30'], ['0.10'], 30, 10, 20],
    [['0.10'], ['0.30'], 10, 30, -20], [['0.00'], ['-0.00'], 0, 0, 0],
    [['0.40', '-0.10'], ['0.30'], 30, 30, 0], [['0.125'], ['0.13'], 13, 13, 0],
    [['-0.125'], ['-0.12'], -12, -12, 0],
  ]).run(async ({ assert }, [from, to, fromTotal, toTotal, difference]) => {
    const view = await transferDialog()
    const modal = view({ setShow: () => undefined })
    const values = { date: '2025-01-01', fromCategories: from.map(amount => split(amount)), toCategories: to.map(amount => split(amount)) }
    assert.strictEqual(Boolean(modal.props.validate(values).fromCategories), difference !== 0)
    const body = modal.props.children[0]({ isSubmitting: false, values })
    const displays = []
    function visit(element) {
      if (!element || typeof element !== 'object') return
      if (element.type === 'money') displays.push(element.props.amount)
      for (const child of (element.props?.children ?? []).flat(Infinity)) visit(child)
    }
    visit(body)
    assert.deepEqual(displays, [fromTotal, toTotal, difference])
    const field = find(body, e => e.type === 'field' && e.props.name === 'fromCategories')
    assert.isString(field.props.validate([]))
    assert.isString(field.props.validate([{ id: -1, amount: '0.00' }]))
    let edited
    const editor = field.props.children[0]({ field: { name: 'fromCategories', value: values.fromCategories },
      form: { setFieldValue: (_name, value) => { edited = value } } })
    assert.notProperty(editor.props, 'numericInput')
    editor.props.onChange([split('0.20')])
    assert.strictEqual(edited[0].amount, '0.20')
  })

  test('unsafe transfer totals and invalid inputs fail validation').with([
    [['bad'], ['0.00']], [['Infinity'], ['0.00']], [['90071992547409.92'], ['0.00']],
    [['90071992547409.91', '0.01'], ['0.00']], [['90071992547409.91'], ['-0.01']],
  ]).run(async ({ assert }, [from, to]) => {
    const view = await transferDialog()
    const modal = view({ setShow: () => undefined })
    const values = { fromCategories: from.map(amount => split(amount)), toCategories: to.map(amount => split(amount)) }
    assert.isString(modal.props.validate(values).fromCategories)
    const body = modal.props.children[0]({ isSubmitting: false, values })
    assert.isUndefined(find(body, e => e.type === 'money'))
  })

  test('transfer editing initializes exact API cents and preserves request signs and metadata').with([false, true])
    .run(async ({ assert }, editing) => {
      let sent
      const view = await expression('client-src/CategoryTransferDialog.tsx', 'CategoryTransferDialog', {
        Formik: 'formik', Form: 'form', Header: 'header', Footer: 'footer', ErrorMessage: 'error', sumSplitCents,
        encodeTransferCategories, Http: { [editing ? 'patch' : 'post']: async (url, body) => { sent = { url, body }; return { ok: true } } },
      })
      const transaction = editing ? { id: 7, date: { toISODate: () => '2025-01-01' },
        categories: [{ id: 0, categoryId: 20, amount: 999 }, { id: 1, categoryId: 21, amount: 999 }],
        getCategoryAmountCents: index => index === 0 ? -30 : 30 } : null
      const modal = view({ transaction, setShow: () => undefined })
      if (editing) {
        assert.strictEqual(modal.props.initialValues.fromCategories[0].amount, '0.30')
        assert.strictEqual(modal.props.initialValues.toCategories[0].amount, '0.30')
      }
      const values = { date: '2025-01-01', fromCategories: [{ ...split('0.125'), id: -1, baseAmountCents: 13,
        fundingCategories: [{ categoryId: 30, amount: 12.75, percentage: true }] }], toCategories: [split('0.13', 21)] }
      await modal.props.onSubmit(values)
      assert.strictEqual(sent.url, editing ? '/api/v1/category-transfer/7' : '/api/v1/category-transfer')
      assert.strictEqual(sent.body.categories[0].amount, '-0.13')
      assert.strictEqual(sent.body.categories[1].amount, '0.13')
      assert.strictEqual(sent.body.categories[0].baseAmount, '0.13')
      assert.strictEqual(sent.body.categories[0].fundingCategories[0].amount, 12.75)
      assert.strictEqual(sent.body.categories[0].comment, 'Retain memo')
      assert.notProperty(sent.body.categories[0], 'id')
      assert.strictEqual(sent.body.categories[1].id, 21)
      assert.strictEqual(values.fromCategories[0].amount, '0.125')
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
