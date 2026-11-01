import { taxForecastFields, taxEstimatedFields } from '../../../app/services/taxMonetaryCodec.ts'
import { encodeTaxAttributions } from '../../../app/services/taxAmountCodec.ts'
import { calculateFunding, fundingCalculationInputs } from
  '../../../client-src/Funding/calculateFunding.ts'
import { test } from '@japa/runner'
import { parseMoneyCents, formatMoneyCents } from '../../../common/moneyCents.ts'
import { inputMoneyCents, encodeTransferCategories } from '../../../client-src/monetary.ts'
import { File } from 'node:buffer'
import NetworthContent from '../../../client-src/Reports/NetworthContent.js'
import { build } from 'vite'
import babel from '@rolldown/plugin-babel'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

let state
let directory
let storageDescriptor

test.group('Client financial state consistency', (group) => {
  group.setup(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () =>
      null, setItem: () => { /* This harness does not persist UI preferences. */ } } })
    directory = await mkdtemp(join(tmpdir(), 'spendcraft-client-financial-'))
    const entry = join(directory, 'entry.js')
    const source = (file) => JSON.stringify(resolve(file))
    await writeFile(entry, `
export { store, StoreContext } from ${source('client-src/State/Store.ts')};
export { default as AccountsToolbar } from ${source('client-src/AccountView/AccountsToolbar.tsx')};
export { default as AccountBalanceChart } from ${source(
  'client-src/AccountView/AccountBalanceChart.tsx')};
export { default as InstitutionAccounts } from ${source(
  'client-src/Categories/CategoryView/Institution.tsx')};
export { default as AccountHeading } from ${source('client-src/AccountView/Account.tsx')};
export { default as CategoryHeading } from ${source(
  'client-src/Categories/CategoryView/Category.tsx')};
export { default as SystemCategoryHeading } from ${source(
  'client-src/Categories/CategoryView/SystemCategory.tsx')};
export { default as GroupHeading } from ${source('client-src/Categories/CategoryView/Group.tsx')};
export { createElement } from ${source('node_modules/react/index.js')};
export { renderToStaticMarkup } from ${source('node_modules/react-dom/server.node.js')};
export { default as Http } from '@mortvola/http';
export { default as Institution } from ${source('client-src/State/Institution.ts')};
export { default as Category } from ${source('client-src/State/Category.ts')};
export { default as Group } from ${source('client-src/State/Group.ts')};
export { default as PostedRegister } from ${source('client-src/Transactions/PostedRegister.tsx')};
export { default as PendingRegister } from ${source('client-src/Transactions/PendingRegister.tsx')};
export { default as Transaction } from ${source('client-src/State/Transaction.ts')};
export { worksheet2_1_2026, getCurrentPeriod } from ${source(
  'client-src/State/Taxes/Estimated.ts')};
export { default as TransactionRow } from ${source('client-src/Transactions/Transaction.tsx')};
export { default as Bill } from ${source('client-src/State/Bill.ts')};
export { default as Statement } from ${source('client-src/State/Statement.ts')};
export { default as StatementView } from ${source('client-src/AccountView/StatementView.tsx')};
export { runInAction } from 'mobx';
export * from ${source('common/ResponseTypes.ts')};
`)
    // Chart loading requires a browser; these checks exercise the surrounding Statement controls.
    await writeFile(join(directory, 'chart.js'),
      'export default function Chart({ data }) { return JSON.stringify(data) }\n')
    await build({ configFile: false, logLevel: 'error', plugins: [babel({ plugins: [[
      '@babel/plugin-proposal-decorators', { version: '2023-11' }]] })], resolve: { alias: [{ find:
      'react-google-charts', replacement: join(directory, 'chart.js') }, { find: '@mortvola/http',
      replacement: resolve('node_modules/@mortvola/http/dist/index.js') }, { find: 'mobx',
      replacement: resolve('node_modules/mobx/dist/mobx.esm.js') }, { find: /^react$/,
      replacement: resolve('node_modules/react/index.js') }, { find: /^react\/jsx-runtime$/,
      replacement: resolve('node_modules/react/jsx-runtime.js') }, { find: /^react-dom$/,
      replacement: resolve('node_modules/react-dom/index.js') }] }, build: { rolldownOptions: {
      output: { banner:
      ("import { createRequire } from 'node:module'; " +
"const require = createRequire(import.meta.url);") },
      external: (id) => id.startsWith(
        `${resolve('node_modules/react')}/`)
        || id.startsWith(`${resolve('node_modules/react-dom')}/`) },
      target: 'esnext', minify: false, outDir: join(directory, 'out'),
      lib: { entry, formats: ['es'], fileName: () => 'state.mjs' } } })
    state = await import(pathToFileURL(join(directory, 'out/state.mjs')).href)
  })
  group.teardown(async () => {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  test('header-only net worth renders an empty state without a chart', ({ assert }) => {
    for (const data of [[['date']], [['date', 'Checking']]]) {
      const html = state.renderToStaticMarkup(state.createElement(NetworthContent, { data }))
      assert.include(html, 'No net worth data available.')
    }
  })

  let f
  let routes
  let calls
  let originals
  group.each.setup(() => {
    const store = new state.store.constructor()
    const accountProps = { id: 10, plaidId: null, name: 'Checking', closed: false, type: state
      .AccountType.Depository, subtype: 'checking', tracking: state.TrackingType.Transactions,
      balance: '100.00', pendingBalance: '0.00', plaidBalance: null, startDate: '2025-01-01',
      rate: 0 }
    const institutionProps = { id: 1, plaidInstitutionId: null, name: 'Offline bank',
      syncDate: null, accounts: [accountProps] }
    const institution = new state.Institution(store, institutionProps)
    const account = institution.accounts[0]
    const props = (id) => ({ id, groupId: -1, name: `Category ${id}`, type: state.CategoryType
      .Regular, balance: '0.00', fundingAmount: '0.00', fundingCategories: [],
      includeFundingTransfers: true, goalDate: null, useGoal: false, recurrence: 1,
      suspended: false, hidden: false })
    const category = new state.Category(props(20), store)
    const other = new state.Category(props(21), store)
    state.runInAction(() => {
      store.accounts.institutions = [institution]
      store.categoryTree.budget.children = [category, other]
      category.group = store.categoryTree.budget; other.group = store.categoryTree.budget
      store.categoryTree.unassignedCat = category
      store.uiState.selectedAccount = account
      store.uiState.selectedCategory = category
    })
    const statementProps = { id: 30, startDate: '2025-02-01', endDate: '2025-02-28',
      startingBalance: '100.00', endingBalance: '90.00', credits: '0.00', debits: '0.00', data: {} }
    const statement = new state.Statement(statementProps, account.statements)
    state.runInAction(() => { account.statements.statements = [statement]; store.uiState
      .selectedStatement = statement })
    const transactionProps = (amount = -10, statementId = null) => ({ id: 40, date: '2025-02-10',
      type: state.TransactionType.MANUAL_TRANSACTION, sortOrder: 0, comment: '', version: 0,
      duplicateOfTransactionId: null, categories: [{ categoryId: 20, amount: amount.toFixed(2) }],
      taxes: [], accountTransaction: { name: 'Purchase', amount: amount.toFixed(2), principle: null,
      statementId, pending: false, accountOwner: null, paymentChannel: null, location: null,
      account: { id: 10, name: 'Checking', institution: { name: 'Offline bank' } } } })
    routes = new Map(); calls = []
    originals = new Map(['get', 'post', 'put', 'patch', 'delete', 'fetch'].map((method) => [method,
      state.Http[method]]))
    for (const method of originals.keys()) state.Http[method] = async (url, payload) => {
      calls.push({ method, url, payload })
      const handler = routes.get(`${method} ${url}`)
      if (!handler) throw new Error(`Unexpected ${method} ${url}`)
      const result = await handler(payload)
      return { ok: result.ok ?? true, body: async () => result.body }
    }
    f = { store, institution, account, accountProps, institutionProps, category, other, statement,
      statementProps, transactionProps }
    return () => { for (const [method, original] of originals) state.Http[method] = original }
  })

  test('register operands retain exact API cents through load and refresh', ({ assert }) => {
    const props = f.transactionProps(0.1)
    props.accountTransaction.amount = '90071992547409.91'
    props.accountTransaction.principle = '-0.20'
    props.taxes = [{ type: 'test', amount: '-0.12' }, { type: 'other', amount: '0.00' }]
    props.categories = [{ categoryId: 20, amount: '0.10' }, { categoryId: 20, amount: '0.20' }, {
      categoryId: 21, amount: '-0.30' }]
    const transaction = new state.Transaction(f.store, props)
    assert.strictEqual(transaction.amountCents, Number.MAX_SAFE_INTEGER)
    assert.strictEqual(transaction.principleCents, -20)
    assert.strictEqual(transaction.getTaxAmountCents(0), -12)
    assert.strictEqual(transaction.getTaxAmountCents(1), 0)
    assert.strictEqual(transaction.taxCategories[0].amountCents, -12)
    assert.throws(() => transaction.getTaxAmountCents(9))
    assert.strictEqual(transaction.getCategoryAmountCents(0), 10)
    assert.strictEqual(transaction.getCategoryAmountCents(1), 20)
    assert.throws(() => transaction.getCategoryAmountCents(99))
    assert.strictEqual(transaction.getRegisterAmountCents(20), 30)
    assert.strictEqual(transaction.getRegisterAmountCents(undefined, true), 30)
    assert.strictEqual(transaction.getRegisterAmountCents(999), Number.MAX_SAFE_INTEGER)
    assert.notProperty(transaction, 'amount')
    assert.notProperty(transaction, 'principle')
    assert.notProperty(transaction.categories[0], 'amount')
    assert.notProperty(transaction.taxCategories[0], 'amount')
    assert.strictEqual(transaction.categories[0].amountCents, 10)
    const overflow = { ...props, categories: [{ categoryId: 20, amount: '90071992547409.91' }, {
      categoryId: 20, amount: '0.01' }] }
    assert.throws(() => new state.Transaction(f.store, overflow).getRegisterAmountCents(20))
    transaction.refresh(f.transactionProps(-0.2))
    assert.strictEqual(transaction.amountCents, -20)
    assert.isNull(transaction.principleCents)
    assert.throws(() => transaction.getTaxAmountCents(0))
    assert.strictEqual(transaction.getCategoryAmountCents(0), -20)
    assert.strictEqual(transaction.getRegisterAmountCents(20), -20)
    assert.strictEqual(transaction.amountCents, -20)
    const invalid = f.transactionProps()
    invalid.accountTransaction.amount = '90071992547409.92'
    assert.throws(() => transaction.refresh(invalid))
    assert.strictEqual(transaction.amountCents, -20)
    invalid.accountTransaction.amount = '0.001'
    assert.throws(() => new state.Transaction(f.store, invalid))
  })

  test('posted registers preserve ordering, signs, category splits and loan principal in cents', ({
    assert }) => {
    const render = (type, category, account, transactions) => {
      const trxContainer = { transactions, isComplete: () => true, state: () => 'IDLE' }
      const html = state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider,
        { value: f.store }, state.createElement(state.PostedRegister, { type, category, account,
          trxContainer })))
      return [...html.matchAll(
        /class="[^"]*_amount_[^"]*dollar-amount[^"]*"[^>]*>[^<]*<\/div><div[^>]*>([^<]*)/g)].map(
        match => match[1])
    }
    const transactions = [0.1, 0.2, 0].map((amount, index) => new state.Transaction(f.store, { ...f
      .transactionProps(amount), id: 40 + index }))
    state.runInAction(() => { f.account.balanceCents = parseMoneyCents('0.30') })
    assert.deepEqual(render('account', null, f.account, transactions), ['0.30', '0.20', '0.00'])
    const creditAccount = { sign: -1, type: state.AccountType.Credit, balanceCents: parseMoneyCents(
      '-0.30') }
    assert.deepEqual(render('account', null, creditAccount, transactions), ['0.30', '0.40', '0.60'])
    state.runInAction(() => { f.category.balanceCents = parseMoneyCents('0.30') })
    assert.deepEqual(render('category', f.category, null, transactions), ['0.30', '0.20', '0.00'])
    const loan = { sign: -1, type: state.AccountType.Loan, balanceCents: parseMoneyCents('-0.30') }
    const loanProps = f.transactionProps(0.3)
    loanProps.accountTransaction.principle = '0.10'
    const loanTransaction = new state.Transaction(f.store, loanProps)
    assert.deepEqual(render('account', null, loan, [loanTransaction, transactions[2]]), ['0.30',
      '0.40'])
    const rebalance = f.transactionProps()
    rebalance.type = state.TransactionType.REBALANCE_TRANSACTION
    rebalance.categories = [{ categoryId: 20, amount: '0.10' }, { categoryId: 21, amount: '0.20' },
      { categoryId: 22, amount: '-0.30' }]
    assert.deepEqual(render('rebalances', null, null, [new state.Transaction(f.store, rebalance),
      transactions[2]]), ['0.00', '-0.30'])
    const pendingProps = { ...f.transactionProps(0.1), accountTransaction: { ...f.transactionProps(
      0.1).accountTransaction, pending: true } }
    const pending = new state.Transaction(f.store, pendingProps)
    const pendingHtml = state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider,
      { value: f.store },
      state.createElement(state.PendingRegister, { trxContainer: { transactions: [pending],
        isComplete: () => true, state: () => 'IDLE' } })))
    assert.include(pendingHtml, 'dollar-amount">0.00</div>')
    assert.isTrue(pending.pending)
    state.runInAction(() => { f.account.balanceCents = parseMoneyCents('90071992547409.91') })
    assert.deepEqual(render('account', null, f.account, [transactions[2]]), [
      '90,071,992,547,409.91'])
    assert.throws(() => render('account', null, f.account, [new state.Transaction(f.store, f
      .transactionProps(-0.01))]))
  })

  test('invalid request values reject before HTTP').with([NaN, Infinity, -Infinity, Number
    .MAX_SAFE_INTEGER])
    .run(async ({ assert }, value) => {
      await assert.rejects(() => f.statement.update({ endingBalanceCents: value === Number
        .MAX_SAFE_INTEGER ? value + 1 : value }))
      await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28',
        value === Number.MAX_SAFE_INTEGER ? value + 1 : value, parseMoneyCents('90.00'), 0, 0, 0,
        0))
    })

  test('Statement requests and responses use strings while balance and income state use cents',
    async ({ assert }) => {
    const response = { ...f.statementProps, startingBalance: '0.10', endingBalance: '0.30',
      credits: '0.20', debits: '-0.01',
      data: { shortTermCapitalGains: '-0.12', longTermCapitalGains: null, dividends: '0.30',
        taxableInterest: '12.35' } }
    routes.set('patch /api/v1/statements/30', async payload => {
      assert.strictEqual(payload.endingBalance, '0.30')
      assert.strictEqual(payload.data.dividends, '0.30')
      return { body: { data: response } }
    })
    await f.statement.update({ endingBalanceCents: parseMoneyCents('0.30'), data: {
      shortTermCapitalGainsCents: -12, longTermCapitalGainsCents: 0, dividendsCents: 30,
      taxableInterestCents: 1235 } })
    assert.strictEqual(f.statement.startingBalanceCents, 10)
    assert.strictEqual(f.statement.endingBalanceCents, 30)
    assert.strictEqual(f.statement.creditsCents, 20)
    assert.strictEqual(f.statement.debitsCents, -1)
    assert.strictEqual(f.statement.shortTermGainsCents, -12)
    assert.strictEqual(f.statement.longTermGainsCents, 0)
    assert.strictEqual(f.statement.dividendsCents, 30)
    assert.strictEqual(f.statement.taxableInterestCents, 1235)
    for (const field of ['startingBalance', 'endingBalance', 'credits', 'debits']) assert
      .notProperty(f.statement, field)
  })

  test('Statement income CREATE/PATCH requests preserve every cent').with([
    '90071992547409.91', '-90071992547409.91', '0.00',
  ]).run(async ({ assert }, wire) => {
    const cents = parseMoneyCents(wire)
    const data = { shortTermCapitalGains: wire, longTermCapitalGains: wire, dividends: wire,
      taxableInterest: wire }
    const input = { shortTermCapitalGainsCents: cents, longTermCapitalGainsCents: cents,
      dividendsCents: cents, taxableInterestCents: cents }
    routes.set('patch /api/v1/statements/30', async payload => {
      assert.deepEqual(payload.data, data)
      return { body: { data: { ...f.statementProps, data } } }
    })
    await f.statement.update({ data: input })
    assert.strictEqual(f.statement.shortTermGainsCents, cents)
    assert.strictEqual(f.statement.longTermGainsCents, cents)
    assert.strictEqual(f.statement.dividendsCents, cents)
    assert.strictEqual(f.statement.taxableInterestCents, cents)
    for (const field of ['shortTermGains', 'longTermGains', 'dividends', 'taxableInterest']) assert
      .notProperty(f.statement, field)
    routes.set('post /api/v1/account/10/statements', async payload => {
      assert.deepEqual(payload.data, data)
      return { ok: false }
    })
    await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28',
      parseMoneyCents('0.00'), parseMoneyCents('0.00'), cents, cents, cents, cents))
  })

  test('Statement missing and null income values retain the existing zero defaults', ({ assert }) =>
    {
    for (const data of [undefined, null, {}, { shortTermCapitalGains: null,
      longTermCapitalGains: null, dividends: null, taxableInterest: null }]) {
      const statement = new state.Statement({ ...f.statementProps, data }, f.account.statements)
      assert.deepEqual([statement.shortTermGainsCents, statement.longTermGainsCents, statement
        .dividendsCents, statement.taxableInterestCents], [0, 0, 0, 0])
    }
  })

  test('Statement unsafe income cents reject before HTTP').with([NaN, Infinity, 0.1, Number
    .MAX_SAFE_INTEGER + 1])
    .run(async ({ assert }, value) => {
      routes.set('patch /api/v1/statements/30', () => assert.fail('Invalid cents reached HTTP'))
      routes.set('post /api/v1/account/10/statements', () => assert.fail(
        'Invalid cents reached HTTP'))
      for (const field of ['shortTermCapitalGainsCents', 'longTermCapitalGainsCents',
        'dividendsCents', 'taxableInterestCents']) {
        const data = { shortTermCapitalGainsCents: 0, longTermCapitalGainsCents: 0,
          dividendsCents: 0, taxableInterestCents: 0, [field]: value }
        await assert.rejects(() => f.statement.update({ data }))
      }
      await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28',
        parseMoneyCents('0.00'), parseMoneyCents('0.00'), 0, 0, 0, value))
    })

  test('invalid Statement monetary responses cannot partially update the client').with([
    1, '', '1.2', '1e2', '01.00', '-0.00', 'NaN', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const before = f.statement.endingBalanceCents
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      endingBalance: '75.00', data: { dividends: amount } } } }))
    await assert.rejects(() => f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') }))
    assert.strictEqual(f.statement.endingBalanceCents, before)
  })

  test('invalid category allocation responses cannot mutate cached Transactions or balances').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const before = [f.account.balanceCents, f.category.balanceCents]
    const response = { ...f.transactionProps(), categories: [{ categoryId: 20, amount }],
      version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: response, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10,
        balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amountCents: parseMoneyCents(
      '-99.00') }))
    assert.strictEqual(cached.account.categories[0].amountCents, -1000)
    assert.strictEqual(cached.category.categories[0].amountCents, -1000)
    assert.strictEqual(cached.account.version, 0)
    assert.deepEqual([f.account.balanceCents, f.category.balanceCents], before)
  })

  test(
    'Statement reconciliation retains exact API cents through load, PATCH and transaction totals',
    async ({ assert }) => {
    const props = { ...f.statementProps, startingBalance: '0.10', credits: '0.20', debits: '0.00',
      endingBalance: '0.30' }
    const before = globalThis.structuredClone(props)
    f.statement.apply(props)
    assert.strictEqual(f.statement.startingBalanceCents, 10)
    assert.strictEqual(f.statement.creditsCents, 20)
    assert.strictEqual(f.statement.calculatedEndingBalanceCents, 30)
    assert.strictEqual(f.statement.reconciliationDifferenceCents, 0)
    assert.strictEqual(f.statement.startingBalanceCents, 10)
    assert.strictEqual(f.statement.creditsCents, 20)
    assert.strictEqual(f.statement.endingBalanceCents, 30)
    assert.deepEqual(props, before)
    routes.set('patch /api/v1/statements/30', async payload => {
      assert.strictEqual(payload.endingBalance, '0.29')
      return { body: { data: { ...props, endingBalance: '0.29' } } }
    })
    await f.statement.update({ endingBalanceCents: parseMoneyCents('0.29') })
    assert.strictEqual(f.statement.reconciliationDifferenceCents, 1)
    assert.strictEqual(f.statement.endingBalanceCents, 29)
    // Transaction responses update totals only, preserving balances and dates.
    f.account.statements.updateStatement({ ...props, startingBalance: '99.00', credits: '0.25',
      debits: '-0.01' })
    assert.strictEqual(f.statement.calculatedEndingBalanceCents, 34)
    assert.strictEqual(f.statement.reconciliationDifferenceCents, 5)
    assert.strictEqual(f.statement.startingBalanceCents, 10)
    assert.strictEqual(f.statement.creditsCents, 25)
    assert.strictEqual(f.statement.debitsCents, -1)
    assert.strictEqual(f.statement.creditsCents, 25)
    assert.strictEqual(f.statement.debitsCents, -1)
    f.statement.apply(props)
    assert.strictEqual(f.statement.reconciliationDifferenceCents, 0)
    for (const value of [1, '1.2', '-0.00', '90071992547409.92']) {
      assert.throws(() => f.statement.apply({ ...props, endingBalance: value }))
      assert.throws(() => f.account.statements.updateStatement({ ...props, credits: '1.00',
        debits: value }))
      assert.strictEqual(f.statement.creditsCents, 20)
      assert.strictEqual(f.statement.endingBalanceCents, 30)
      assert.strictEqual(f.statement.creditsCents, 20)
      assert.strictEqual(f.statement.reconciliationDifferenceCents, 0)
    }
    const loaded = new state.Statement(props, f.account.statements)
    assert.strictEqual(loaded.calculatedEndingBalanceCents, 30)
    assert.strictEqual(loaded.reconciliationDifferenceCents, 0)
  })

  test('Statement reconciliation rejects unsafe totals instead of rounding them', ({ assert }) => {
    f.statement.apply({ ...f.statementProps, startingBalance: '45035996273704.96', credits:
      '45035996273704.96',
      debits: '0.00', endingBalance: '0.00' })
    assert.throws(() => f.statement.calculatedEndingBalanceCents, 'Unsafe monetary cents')
    f.statement.apply({ ...f.statementProps, startingBalance: '45035996273704.96', credits: '0.00',
      debits: '0.00', endingBalance: '-45035996273704.96' })
    assert.throws(() => f.statement.reconciliationDifferenceCents, 'Unsafe monetary cents')
  })

  test('Statement reconciliation renders exact signed cents with existing separators and classes')
    .with([
    { credit: false, start: '0.10', credits: '0.20', debits: '0.00', target: '0.30', ending: '0.30',
      difference: '0.00', negative: false },
    { credit: true, start: '0.10', credits: '0.20', debits: '0.00', target: '0.30', ending: '-0.30',
      difference: '0.00', negative: true },
    { credit: false, start: '-1000.10', credits: '0.20', debits: '-0.01', target: '-999.90',
      ending: '-999.91', difference: '-0.01', negative: true },
    { credit: true, start: '-1000.10', credits: '0.20', debits: '-0.01', target: '-999.90', ending:
      '999.91', difference: '0.01', negative: false },
    { credit: false, start: '45035996273704.96', credits: '45035996273704.94', debits: '0.00',
      target: '0.00', ending: '90,071,992,547,409.90', difference: '90,071,992,547,409.90',
      negative: false },
    { credit: false, start: '1234.50', credits: '0.00', debits: '0.00', target: '1234.50', ending:
      '1,234.50', difference: '0.00', negative: false },
  ]).run(({ assert }, scenario) => {
    state.runInAction(() => { f.account.type = scenario.credit ? state.AccountType.Credit : state
      .AccountType.Depository })
    f.statement.apply({ ...f.statementProps, startingBalance: scenario.start, credits: scenario
      .credits,
      debits: scenario.debits, endingBalance: scenario.target })
    const html = state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider, {
      value: f.store },
      state.createElement(state.StatementView, { statement: f.statement })))
    const ending = html.match(/<label>Ending Balance:<div class="([^"]*)">([^<]+)<\/div><\/label>/)
    const difference = html.match(
      /<label>Ending Balance Difference:<div class="([^"]*)">([^<]+)<\/div><\/label>/)
    assert.isNotNull(ending)
    assert.isNotNull(difference)
    assert.strictEqual(ending[2], scenario.ending)
    assert.strictEqual(difference[2], scenario.difference)
    assert.strictEqual(ending[1].includes('negative'), scenario.negative)
    assert.strictEqual(ending[1].includes('reverse'), scenario.credit)
    assert.notInclude(difference[2], '-0.00')
    assert.include(html, 'Reconcile All')
    assert.include(html, 'Reconcile None')
  })

  test('AccountTransaction response amounts become cents in cached client state').with([
    ['12.50', 12.5], ['-12.50', -12.5], ['0.00', 0], ['0.30', 0.3],
  ]).run(async ({ assert }, [amount, expected]) => {
    const cached = transactions()
    const props = f.transactionProps(expected)
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.strictEqual(payload.amount, amount)
      return { body: { data: { transaction: props, categories: [], acctBalances: [] } } }
    })
    assert.strictEqual(props.accountTransaction.amount, amount)
    await cached.account.updateTransaction({ amountCents: inputMoneyCents(String(expected)) })
    assert.strictEqual(cached.account.amountCents, inputMoneyCents(String(expected)))
    assert.strictEqual(cached.category.amountCents, inputMoneyCents(String(expected)))
    assert.isNumber(cached.account.amountCents)
  })

  test('invalid AccountTransaction wire amounts cannot mutate cached state').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const props = f.transactionProps()
    props.accountTransaction.amount = amount
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: props, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10,
        balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amountCents: parseMoneyCents(
      '-99.00') }))
    assert.strictEqual(cached.account.amountCents, -1000)
    assert.strictEqual(cached.category.amountCents, -1000)
    assert.strictEqual(f.account.balanceCents, 9000)
    assert.strictEqual(f.category.balanceCents, -1000)
  })

  test('invalid tax response amounts cannot mutate financial caches').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const props = { ...f.transactionProps(), taxes: [{ type: 'estimated_tax_payments', amount }],
      version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: props, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10,
        balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ taxCategories: [{ type:
      'estimated_tax_payments', amountCents: parseMoneyCents('1.00') }] }))
    assert.deepEqual(cached.account.taxCategories, [])
    assert.deepEqual(cached.category.taxCategories, [])
    assert.strictEqual(cached.account.version, 0)
    assert.strictEqual(f.account.balanceCents, 9000)
    assert.strictEqual(f.category.balanceCents, -1000)
  })

  test('Account cents preserve exact totals, nullable Plaid balances and atomic response updates', (
    { assert }) => {
    const props = { ...f.accountProps, balance: '0.10', pendingBalance: '0.20', plaidBalance: null }
    const original = globalThis.structuredClone(props)
    f.account.update(props)
    assert.strictEqual(f.account.balanceCents, 10)
    assert.strictEqual(f.account.pendingBalanceCents, 20)
    assert.strictEqual(f.account.totalBalanceCents, 30)
    assert.isNull(f.account.plaidBalanceCents)
    assert.deepEqual(props, original)
    for (const field of ['balance', 'pendingBalance', 'plaidBalance']) assert.notProperty(f.account,
      field)
    for (const field of ['balance', 'pendingBalance', 'plaidBalance']) {
      assert.throws(() => f.account.update({ ...props, [field]: '1.2' }))
      assert.strictEqual(f.account.totalBalanceCents, 30)
    }
    assert.throws(() => f.store.accounts.updateBalances([{ id: f.account.id, balance: '1.00' }, {
      id: 999, balance: 'bad' }]))
    assert.strictEqual(f.account.balanceCents, 10)
    f.account.update({ ...props, balance: '90071992547409.91', pendingBalance: '0.00',
      plaidBalance: '90071992547409.91' })
    assert.strictEqual(f.account.balanceCents, Number.MAX_SAFE_INTEGER)
    assert.strictEqual(f.account.totalBalanceCents, Number.MAX_SAFE_INTEGER)
    f.account.update({ ...props, balance: '90071992547409.91', pendingBalance: '0.01' })
    assert.throws(() => f.account.totalBalanceCents, 'Unsafe monetary cents')
    f.account.update({ ...props, balance: '-0.10', pendingBalance: '-0.20', plaidBalance: '0.00' })
    assert.strictEqual(f.account.totalBalanceCents, -30)
    assert.strictEqual(f.account.plaidBalanceCents, 0)
  })

  test('account and institution balances render exact cents with existing account signs').with([
    false, true])
    .run(({ assert }, credit) => {
      f.account.update({ ...f.accountProps, type: credit ? state.AccountType.Credit : state
        .AccountType.Depository,
        balance: '-1234.50', pendingBalance: '0.20', plaidBalance: '-1234.49' })
      const render = (component, props) => state.renderToStaticMarkup(state.createElement(state
        .StoreContext.Provider,
        { value: f.store }, state.createElement(component, props)))
      const heading = render(state.AccountHeading, { account: f.account, selected: false,
        onAccountSelected: () => undefined, onAccountStateChange: () => undefined,
          showAccountDialog: () => undefined })
      assert.include(heading, credit ? '>1,234.50<' : '>-1,234.50<')
      assert.include(heading, credit ? '>1,234.49<' : '>-1,234.49<')
      assert.notInclude(heading, 'reverse')
      const expanded = render(state.InstitutionAccounts, { institution: f.institution })
      assert.include(expanded, '>-1,234.30<')
      state.runInAction(() => { f.store.uiState.accountState.set(f.institution.id, false) })
      const collapsed = render(state.InstitutionAccounts, { institution: f.institution })
      assert.include(collapsed, '>-1,234.30<')
      f.account.update({ ...f.accountProps, balance: '90071992547409.91', pendingBalance: '0.00' })
      const large = render(state.InstitutionAccounts, { institution: f.institution })
      assert.include(large, '>90,071,992,547,409.91<')
    })

  test('institution totals use checked cents and preserve account eligibility', ({ assert }) => {
    const institution = new state.Institution(f.store, { ...f.institutionProps, accounts: [
      { ...f.accountProps, id: 11, balance: '0.10', pendingBalance: '0.00' },
      { ...f.accountProps, id: 12, balance: '0.20', pendingBalance: '0.00' },
      { ...f.accountProps, id: 13, balance: '100.00', closed: true },
      { ...f.accountProps, id: 14, balance: '100.00', tracking: state.TrackingType.Balances },
    ] })
    state.runInAction(() => { f.store.uiState.accountState.set(institution.id, false) })
    const render = () => state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider,
      { value: f.store }, state.createElement(state.InstitutionAccounts, { institution })))
    assert.include(render(), '>0.30<')
    institution.accounts.find(account => account.id === 11).update({ ...f.accountProps, id: 11,
      balance: '90071992547409.91', pendingBalance: '0.00' })
    assert.throws(render, 'Unsafe monetary cents')
  })

  test('Category and nested Group totals use checked cents without changing membership semantics', (
    { assert }) => {
    f.category.updateBalance({ id: 20, balance: '0.10' })
    f.other.updateBalance({ id: 21, balance: '0.20' })
    assert.strictEqual(f.store.categoryTree.budget.childrenBalanceCents(), 30)
    assert.notProperty(f.category, 'balance')
    const nested = new state.Group({ id: 101, name: 'Nested', type: state.GroupType.Regular }, f
      .store)
    state.runInAction(() => { nested.children = [f.other]; f.store.categoryTree.budget.children = [f
      .category, nested] })
    assert.strictEqual(f.store.categoryTree.budget.childrenBalanceCents(), 30)
    f.category.subcategories = [f.other]
    assert.strictEqual(f.category.getTotalBalanceCents(), 30)
    // Group totals historically use the Category's own balance, not its subcategory total.
    assert.strictEqual(f.store.categoryTree.budget.childrenBalanceCents(), 30)
    assert.throws(() => f.store.categoryTree.updateBalances([{ id: 20, balance: '1.00' }, { id: 21,
      balance: 'bad' }]))
    assert.strictEqual(f.category.balanceCents, 10)
    assert.strictEqual(f.other.balanceCents, 20)
    assert.strictEqual(f.category.fundingAmountCents, 0)
    f.category.updateBalance({ id: 20, balance: '90071992547409.91' })
    assert.strictEqual(f.category.balanceCents, Number.MAX_SAFE_INTEGER)
    assert.throws(() => f.category.getTotalBalanceCents(), 'Unsafe monetary cents')
    assert.throws(() => f.store.categoryTree.budget.childrenBalanceCents(), 'Unsafe monetary cents')
    f.category.updateBalance({ id: 20, balance: '-0.20' })
    assert.strictEqual(f.category.getTotalBalanceCents(), 0)
    assert.strictEqual(f.store.categoryTree.budget.childrenBalanceCents(), 0)
  })

  test('Category, System Category and Group displays retain exact decimal amounts', ({ assert }) =>
    {
    f.category.updateBalance({ id: 20, balance: '-1234.50' })
    const render = (component, props) => state.renderToStaticMarkup(state.createElement(state
      .StoreContext.Provider,
      { value: f.store }, state.createElement(component, props)))
    const category = render(state.CategoryHeading, { category: f.category, onCategorySelected: () =>
      undefined,
      selectedCategory: null, level: 0 })
    assert.include(category, '>-1,234.50<')
    const system = render(state.SystemCategoryHeading, { category: f.category, onCategorySelected: (
      ) => undefined })
    assert.include(system, '>-1,234.50<')
    state.runInAction(() => { f.store.uiState.groupState.set(f.store.categoryTree.budget.id,
      false) })
    const group = render(state.GroupHeading, { group: f.store.categoryTree.budget,
      onCategorySelected: () => undefined, onGroupSelected: () => undefined, selectedGroup: null,
        selectedCategory: null, level: 0 })
    assert.include(group, '>-1,234.50<')
  })

  test('Account balance updates retain exact cents without changing Category balances', async ({
    assert }) => {
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
      .institutionProps,
      accounts: [{ ...f.accountProps, balance: '-12.34', pendingBalance: '-0.37', plaidBalance:
        '0.30' }],
    }] } }))
    await f.store.accounts.load()
    assert.strictEqual(f.account.balanceCents, -1234)
    assert.strictEqual(f.account.plaidBalanceCents, 30)
    assert.strictEqual(f.account.pendingBalanceCents, -37)
    assert.strictEqual(f.category.balanceCents, 0)
    f.store.accounts.updateBalances([{ id: f.account.id, balance: '12.50' }])
    assert.strictEqual(f.account.balanceCents, 1250)
    f.account.transactions.transactionResponseHandler({ transactions: [], balance: '0.30' }, 0, 20)
    assert.strictEqual(f.account.balanceCents, 30)
    f.category.transactions.transactionResponseHandler({ transactions: [], balance: '2.50' }, 0, 20)
    assert.strictEqual(f.category.balanceCents, 250)
  })

  test('transaction response balances reject noncanonical values before changing state', ({
    assert }) => {
    for (const balance of [0, null, '', '0', '-0.00', '1.2', 'Infinity', '90071992547409.92']) {
      assert.throws(() => f.account.transactions.transactionResponseHandler({ transactions: [],
        balance }, 0, 20))
      assert.strictEqual(f.account.balanceCents, 10000)
      assert.throws(() => f.category.transactions.transactionResponseHandler({ transactions: [],
        balance }, 0, 20))
      assert.strictEqual(f.category.balanceCents, 0)
    }
    f.category.transactions.transactionResponseHandler({ transactions: [], balance: '0.00' }, 0, 20)
    assert.strictEqual(f.category.balanceCents, 0)
  })

  test('Category CREATE/PATCH format cents while keeping percentages numeric').with([
    { operation: 'create', fundingAmountCents: 1235, expected: '12.35' },
    { operation: 'patch', fundingAmountCents: 1235, expected: '12.35' },
    { operation: 'create', fundingAmountCents: Number.MAX_SAFE_INTEGER, expected:
      '90071992547409.91' },
    { operation: 'patch', fundingAmountCents: Number.MAX_SAFE_INTEGER, expected:
      '90071992547409.91' },
  ]).run(async ({ assert }, { operation, fundingAmountCents, expected }) => {
      const group = f.category.group
      const rules = [{ categoryId: 20, amountCents: -12, percentage: false },
        { categoryId: 20, amount: 12.75, percentage: true }, { categoryId: 21, amount: 87.25,
          percentage: true }]
      const path = `/api/v1/groups/${group.id}/categories${operation === 'patch' ? '/20' : ''}`
      routes.set(`${operation === 'patch' ? 'patch' : 'post'} ${path}`, async payload => {
        assert.strictEqual(payload.fundingAmount, expected)
        assert.notProperty(payload, 'fundingAmountCents')
        assert.deepEqual(payload.fundingCategories, [{ categoryId: 20, amount: '-0.12',
          percentage: false },
          { categoryId: 20, amount: 12.75, percentage: true }, { categoryId: 21, amount: 87.25,
            percentage: true }])
        return { body: { data: { id: operation === 'patch' ? 20 : 25, groupId: group.id, name:
          'Bill', type: state.CategoryType.Bill,
          balance: '0.00', fundingAmount: expected, fundingCategories: payload.fundingCategories,
            goalDate: null,
          useGoal: false, includeFundingTransfers: false, recurrence: 1, hidden: false,
            suspended: false } } }
      })
      const input = { group, name: 'Bill', type: state.CategoryType.Bill, fundingAmountCents,
        useGoal: false, hidden: false, fundingCategories: rules }
      if (operation === 'patch') await f.category.update(input)
      else await group.addCategory(input)
      const category = operation === 'patch' ? f.category : group.children.find(row => row
        .id === 25)
      assert.strictEqual(category.fundingAmountCents, fundingAmountCents)
      assert.deepEqual(category.fundingCategories.map(rule => rule.percentage ? rule.amount : rule
        .amountCents), [-12, 12.75, 87.25])
      assert.strictEqual(rules[0].amountCents, -12)
    })

  test('Category and Transaction funding metadata retain cents with numeric percentages', ({
    assert }) => {
    const category = new state.Category({ ...({ id: 25, groupId: -1, name: "Funding", type: state
      .CategoryType.Regular, balance: "0.00", suspended: false, includeFundingTransfers: true,
      recurrence: 1, hidden: false }), fundingAmount: '12.50',
      fundingCategories: [{ categoryId: 20, amount: '-0.12', percentage: false },
        { categoryId: 21, amount: 12.75, percentage: true }],
    }, f.store)
    assert.strictEqual(category.fundingAmountCents, 1250)
    assert.deepEqual(category.fundingCategories.map((row) => row.percentage ? row.amount : row
      .amountCents), [-12, 12.75])
    const transaction = new state.Transaction(f.store, { ...f.transactionProps(), categories: [
      { categoryId: 20, amount: '1.00', baseAmount: '0.30',
        fundingCategories: [{ categoryId: 21, amount: '2.50', percentage: false },
          { categoryId: 22, amount: 100, percentage: true }] },
    ] })
    assert.strictEqual(transaction.categories[0].baseAmountCents, 30)
    assert.deepEqual(transaction.categories[0].fundingCategories.map((row) => row.percentage ? row
      .amount : row.amountCents), [250, 100])
    for (const amount of [1, '', '1.2', '-0.00', 'Infinity']) {
      assert.throws(() => new state.Transaction(f.store, { ...f.transactionProps(), categories: [
        { categoryId: 20, amount: '1.00', baseAmount: amount },
      ] }))
    }
  })

  test(
    'Transaction funding metadata preserves exact cents, missing/null values and refresh atomicity',
    ({ assert }) => {
    const props = { ...f.transactionProps(), categories: [
      { categoryId: 20, amount: '0.30', baseAmount: '90071992547409.91', comment: 'keep',
        funder: false,
        includeFundingTransfers: true, fundingCategories: [{ id: 7, categoryId: 21,
          percentage: false, amount: '-0.12', note: 'keep' },
          { categoryId: 22, percentage: true, amount: 12.75 }] },
      { categoryId: 21, amount: '0.00' },
      { categoryId: 22, amount: '0.00', baseAmount: null, fundingCategories: null },
    ] }
    const before = globalThis.structuredClone(props)
    const transaction = new state.Transaction(f.store, props)
    assert.strictEqual(transaction.categories[0].baseAmountCents, Number.MAX_SAFE_INTEGER)
    assert.deepEqual(transaction.categories[0].fundingCategories[0], { id: 7, categoryId: 21,
      percentage: false, amountCents: -12, note: 'keep' })
    assert.strictEqual(transaction.categories[0].fundingCategories[1].amount, 12.75)
    assert.strictEqual(transaction.categories[0].comment, 'keep')
    assert.isTrue(transaction.categories[0].includeFundingTransfers)
    assert.isUndefined(transaction.categories[1].baseAmountCents)
    assert.isUndefined(transaction.categories[1].fundingCategories)
    assert.isNull(transaction.categories[2].baseAmountCents)
    assert.isNull(transaction.categories[2].fundingCategories)
    assert.notProperty(transaction.categories[0], 'baseAmount')
    assert.notProperty(transaction.categories[0].fundingCategories[0], 'amount')
    assert.deepEqual(props, before)
    for (const amount of [1, '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => transaction.refresh({ ...props, categories: [props.categories[0],
        { categoryId: 21, amount: '1.00', fundingCategories: [{ categoryId: 22, percentage: false,
          amount }] }] }))
      assert.strictEqual(transaction.categories[0].baseAmountCents, Number.MAX_SAFE_INTEGER)
      assert.strictEqual(transaction.categories[0].fundingCategories[0].amountCents, -12)
    }
  })

  test(
    'Transaction PATCH and transfer CREATE/PATCH encode retained cent metadata without leaking \
cent fields', async ({ assert }) => {
    const transaction = new state.Transaction(f.store, f.transactionProps())
    const category = { categoryId: 20, amountCents: 30, baseAmountCents: Number.MAX_SAFE_INTEGER,
      comment: 'keep', fundingCategories: [{ categoryId: 21, percentage: false, amountCents: -12 },
        { categoryId: 22, percentage: true, amount: 12.75 }] }
    const expected = { categoryId: 20, amount: '0.30', baseAmount: '90071992547409.91', comment:
      'keep',
      fundingCategories: [{ categoryId: 21, percentage: false, amount: '-0.12' },
        { categoryId: 22, percentage: true, amount: 12.75 }] }
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.deepEqual(payload.categories, [expected])
      return { body: { errors: [{ field: 'name', message: 'Test rejection' }] } }
    })
    await transaction.updateTransaction({ categories: [category] })
    const { amountCents, ...metadata } = category
    const transfer = { ...metadata, amount: '0.30' }
    assert.strictEqual(amountCents, 30)
    routes.set('patch /api/v1/category-transfer/40', async payload => {
      assert.deepEqual(payload.categories, [expected])
      return { ok: false }
    })
    routes.set('post /api/v1/category-transfer', async payload => {
      assert.deepEqual(payload.categories, [expected])
      return { ok: false }
    })
    await assert.rejects(() => transaction.updateCategoryTransfer({ date: '2026-10-01',
      categories: [transfer] }))
    await assert.rejects(() => f.store.register.addCategoryTransfer({ date: '2026-10-01',
      categories: [transfer] }, state.TransactionType.FUNDING_TRANSACTION))
    assert.strictEqual(category.baseAmountCents, Number.MAX_SAFE_INTEGER)
    assert.strictEqual(category.fundingCategories[0].amountCents, -12)
  })

  test('Loan register payment, principal and interest displays use retained cents', ({ assert }) =>
    {
    const props = f.transactionProps()
    props.accountTransaction.amount = '90071992547409.91'
    props.accountTransaction.principle = '0.01'
    const transaction = new state.Transaction(f.store, props)
    const render = () => state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider,
      { value: f.store },
      state.createElement(state.TransactionRow, { transaction, account: { type: state.AccountType
        .Loan, sign: -1 },
        amountCents: 1, runningBalanceCents: 0 })))
    const html = render()
    assert.include(html, '>90,071,992,547,409.91</div>')
    assert.include(html, '>90,071,992,547,409.90</div>')
    assert.include(html, '>0.01</div>')
    transaction.refresh({ ...props, accountTransaction: { ...props.accountTransaction, amount:
      '0.30', principle: null } })
    assert.include(render(), '>0.30</div>')
    assert.include(render(), '>0.00</div>')
    transaction.refresh({ ...props, type: state.TransactionType.STARTING_BALANCE })
    assert.notInclude(render(), '>90,071,992,547,409.90</div>')
  })

  test('report state decodes monetary cells without changing counts, dates or response data',
    async ({ assert }) => {
    const networth = [['date', 'Cash', 'Credit'], ['2026-10-01', '12.50', '-0.30']]
    routes.set('get /api/v1/reports/networth', async () => ({ body: networth }))
    await f.store.reports.loadReport('netWorth')
    assert.deepEqual(f.store.reports.data, [['date', 'Cash', 'Credit'], ['2026-10-01', 1250, -30]])
    assert.strictEqual(networth[1][1], '12.50')
    routes.set('get /api/v1/reports/networth', async () => ({ body: [['date', 'Cash'], [
      '2026-10-02', '0.10']] }))
    await f.store.reports.loadReport('netWorth')
    assert.deepEqual(f.store.reports.data, [['date', 'Cash'], ['2026-10-02', 10]])
    routes.set('get /api/v1/reports/networth', async () => ({ body: [['date', 'Cash'], [
      '2026-10-03', '1.2']] }))
    await assert.rejects(() => f.store.reports.loadReport('netWorth'))
    assert.deepEqual(f.store.reports.data, [['date', 'Cash'], ['2026-10-02', 10]])
    const payee = [{ rowNumber: '1', name: 'Shop', paymentChannel: 'online', sum: '-12.50',
      count: 3 }]
    routes.set('get /api/v1/reports/payee', async () => ({ body: payee }))
    await f.store.reports.loadReport('payee')
    assert.deepEqual(f.store.reports.data, [{ rowNumber: '1', name: 'Shop', paymentChannel:
      'online', sumCents: -1250, count: 3 }])
    assert.strictEqual(payee[0].sum, '-12.50')
    routes.set('get /api/v1/reports/payee', async () => ({ body: [{ ...payee[0], sum:
      '90071992547409.91' }] }))
    await f.store.reports.loadReport('payee')
    assert.strictEqual(f.store.reports.data[0].sumCents, Number.MAX_SAFE_INTEGER)
    routes.set('get /api/v1/reports/payee', async () => ({ body: [{ ...payee[0], sum: '1.2' }] }))
    await assert.rejects(() => f.store.reports.loadReport('payee'))
    assert.strictEqual(f.store.reports.data[0].sumCents, Number.MAX_SAFE_INTEGER)
    routes.set('get /api/v1/reports/payee', async () => ({ body: [] }))
    await f.store.reports.loadReport('payee')
    assert.deepEqual(f.store.reports.data, [])
  })

  test('Transaction principal strings decode into cents and preserve null', ({ assert }) => {
    for (const [principle, expected] of [['12.50', 12.5], ['-0.12', -0.12], ['0.00', 0], [null,
      null]]) {
      const props = f.transactionProps()
      const transaction = new state.Transaction(f.store, { ...props, accountTransaction: { ...props
        .accountTransaction, principle } })
      assert.strictEqual(transaction.principleCents, expected === null ? null : inputMoneyCents(
        String(expected)))
    }
    for (const principle of [1, '', '1.2', '-0.00', 'Infinity']) {
      const props = f.transactionProps()
      assert.throws(() => new state.Transaction(f.store, { ...props, accountTransaction: { ...props
        .accountTransaction, principle } }))
    }
  })

  test('offline institution and account requests encode balances and keep rates numeric').with([
    [12.345, '12.35'], [-0.125, '-0.12'], [0.125, '0.13'], [1.005, '1.01'], [0.1 + 0.2, '0.30'], [-
      0, '0.00'],
    ['90071992547409.91', '90071992547409.91'],
  ]).run(async ({ assert }, [balance, expected]) => {
    const rate = 3.125
    const account = { name: 'Offline', balance: expected, type: 'depository', subtype: 'checking',
      tracking: state.TrackingType.Balances, rate }
    let calls = 0
    routes.set('post /api/v1/institution', async payload => {
      calls++
      assert.deepEqual(payload, { institution: { name: 'Bank' }, accounts: [account], startDate:
        '2025-03-01' })
      return { ok: false, body: {} }
    })
    routes.set('post /api/v1/institution/1/accounts', async payload => {
      calls++
      assert.deepEqual(payload, { ...account, startDate: '2025-03-01' })
      return { ok: false, body: {} }
    })
    await f.store.accounts.addOfflineAccount('Bank', 'Offline', inputMoneyCents(String(balance)),
      '2025-03-01', 'depository', 'checking', state.TrackingType.Balances, rate)
    await f.institution.addOfflineAccount('Offline', inputMoneyCents(String(balance)), '2025-03-01',
      'depository', 'checking', state.TrackingType.Balances, rate)
    assert.strictEqual(calls, 2)
  })
  test('invalid offline cent balances fail before HTTP').with([NaN, Infinity, -Infinity, 0.1, Number
    .MAX_SAFE_INTEGER + 1])
    .run(async ({ assert }, balance) => {
      routes.set('post /api/v1/institution', () => assert.fail('Invalid balance reached HTTP'))
      routes.set('post /api/v1/institution/1/accounts', () => assert.fail(
        'Invalid balance reached HTTP'))
      await assert.rejects(() => f.store.accounts.addOfflineAccount('Bank', 'Offline', balance,
        '2025-03-01', 'depository', 'checking', state.TrackingType.Balances, 0))
      await assert.rejects(() => f.institution.addOfflineAccount('Offline', balance, '2025-03-01',
        'depository', 'checking', state.TrackingType.Balances, 0))
    })

  test(
    'Tax forecasts and actuals retain cents while requests and worksheet calculations keep their \
formats', async ({ assert }) => {
    const forecast = { filingStatus: state.FilingStatus.Single,
      ...Object.fromEntries(taxForecastFields.map(field => [field, '0.30'])),
      estimated: { expectedAgi: '100000.00', priorYearAgi: '150000.00', priorYearTotalTax:
        '10000.01' } }
    const response = { year: 2026, forecast, actuals: [null, null,
      { month: 3, taxableInterest: '0.30', ordinaryDividends: '-0.12', shortTermCapitalGains:
        '1.00',
        longTermCapitalGains: '0.00', taxes: { taxable_social_security_benefits: '0.30',
          estimated_tax_payments: '12.50' } },
      { month: 4, taxes: { estimated_tax_payments: '0.05' } },
    ] }
    const before = globalThis.structuredClone(response)
    routes.set('get /api/v1/taxes/2026', async () => ({ body: { data: response } }))
    const taxes = f.store.taxes
    await taxes.load()
    assert.strictEqual(taxes.income.taxableInterestCents, 30)
    assert.strictEqual(taxes.qualifiedBusinessIncomeDeductionCents, 30)
    assert.strictEqual(taxes.income.actuals[0].oridinaryDividendsCents, -12)
    assert.strictEqual(taxes.income.actuals[0].estimatedTaxPaymentsCents, 1250)
    assert.strictEqual(taxes.income.actuals[1].estimatedTaxPaymentsCents, 1255)
    assert.strictEqual(taxes.income.actuals[0].taxableSocialSecurityBenefitsCents, 30)
    assert.strictEqual(taxes.worksheet2_1.result.firstInstallment, 2500.0025)
    const expected = state.worksheet2_1_2026({ filingStatus: state.FilingStatus.Single,
      adjustedGrossIncome: 100000, deductions: taxes.standardDeduction,
      priorYearAdjustedGrossIncome: 150000, priorYearTotalTax: 10000.01 })
    assert.deepEqual(taxes.worksheet2_1.result, expected)
    taxes.updateValues({ ...response, forecast: { ...forecast,
      estimated: { ...forecast.estimated, priorYearAgi: '150000.01' } } })
    assert.deepEqual(taxes.worksheet2_1.result, state.worksheet2_1_2026({ filingStatus: state
      .FilingStatus.Single,
      adjustedGrossIncome: 100000, deductions: taxes.standardDeduction,
      priorYearAdjustedGrossIncome: 150000.01, priorYearTotalTax: 10000.01 }))
    routes.set('post /api/v1/taxes', async request => {
      for (const field of taxForecastFields) assert.match(request.forecast[field], /^-?\d+\.\d{2}$/)
      for (const field of taxEstimatedFields) assert.match(request.forecast.estimated[field],
        /^-?\d+\.\d{2}$/)
      return { body: { data: response } }
    })
    await taxes.save()
    assert.deepEqual(response, before)
    for (const invalid of [1, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => taxes.updateValues({ ...response, forecast: { ...forecast,
        taxableInterest: invalid } }))
      assert.throws(() => taxes.updateValues({ ...response, actuals: [{ month: 1, taxes: {
        estimated_tax_payments: invalid } }] }))
      assert.strictEqual(taxes.income.taxableInterestCents, 30)
      assert.strictEqual(taxes.income.actuals[0].estimatedTaxPaymentsCents, 1250)
      assert.strictEqual(taxes.worksheet2_1.priorYearAgi, 150000)
    }
  })

  test('Tax income totals and deductions use checked cents with existing period and loss rules', ({
    assert }) => {
    const taxes = f.store.taxes
    taxes.updateValues({ year: 2026, forecast: { filingStatus: state.FilingStatus.Single,
      taxableInterest: '0.10', ordinaryDividends: '0.20' }, actuals: [] })
    const period = state.getCurrentPeriod()
    assert.strictEqual(taxes.income.getTotalIncomeCents(period), 30)
    assert.strictEqual(taxes.income.getAdjustedGrossIncomeCents(period), 30)
    assert.strictEqual(taxes.income.getAdjustedGrossIncome(period), 0.3)
    assert.strictEqual(taxes.income.getTotalIncomeCents((period + 1) % 4), 0)
    taxes.income.shortTermCapitalGainsCents = parseMoneyCents('-4000.00')
    taxes.income.longTermCapitalGainsCents = parseMoneyCents('0.20')
    assert.strictEqual(taxes.income.getCapitalGainsCents(period), -300000)
    taxes.filingStatus = state.FilingStatus.MarriedFilingSeparate
    assert.strictEqual(taxes.income.getCapitalGainsCents(period), -150000)
    taxes.income.shortTermCapitalGainsCents = parseMoneyCents('-0.30')
    assert.strictEqual(taxes.income.getCapitalGainsCents(period), -10)
    assert.strictEqual(taxes.income.getTotalIncomeCents(period), 20)
    taxes.income.shortTermCapitalGainsCents = parseMoneyCents('0.00')
    taxes.income.longTermCapitalGainsCents = parseMoneyCents('0.00')
    taxes.income.additionalTaxableIncomeCents = parseMoneyCents('15000.00')
    taxes.qualifiedBusinessIncomeDeductionCents = parseMoneyCents('0.20')
    assert.strictEqual(taxes.getTaxableIncomeCents(period), 10)
    taxes.qualifiedBusinessIncomeDeductionCents = parseMoneyCents('1.00')
    assert.strictEqual(taxes.getTaxableIncomeCents(period), 0)
    const totalIncome = Object.getPrototypeOf(taxes.income).getTotalIncomeCents
    assert.throws(() => totalIncome.call({ ...taxes.income,
      actuals: taxes.income.actuals, getCapitalGainsCents: () => 0,
      taxableInterestCents: 10, ordinaryDividendsCents: 20, taxableIraDistributionsCents: 0,
      taxablePensionAndAnnuitiesCents: 0, taxableSocialSecurityBenefitsCents: 0,
      additionalTaxableIncomeCents: Number.MAX_SAFE_INTEGER }, period))
  })

  test('Tax period aggregation is exact and overflow cannot partially mutate cached state', ({
    assert }) => {
    const taxes = f.store.taxes
    taxes.updateValues({ year: 2026, forecast: { taxableInterest: '0.10' }, actuals: [
      { month: 1, taxableInterest: '0.10', taxes: { estimated_tax_payments: '0.10' } },
      { month: 2, taxableInterest: '0.20', taxes: { estimated_tax_payments: '0.20' } },
      { month: 4, taxableInterest: '-0.10', taxes: {} },
    ] })
    assert.deepEqual(taxes.income.actuals.map(p => p.taxableInterestCents), [30, 20, 20, 20])
    assert.deepEqual(taxes.income.actuals.map(p => p.estimatedTaxPaymentsCents), [30, 30, 30, 30])
    assert.throws(() => taxes.updateValues({ year: 2026, forecast: { taxableInterest: '9.99' },
      actuals: [
      { month: 1, taxableInterest: '90071992547409.91', taxes: {} },
      { month: 2, taxableInterest: '0.01', taxes: {} },
    ] }))
    assert.strictEqual(taxes.income.taxableInterestCents, 10)
    assert.strictEqual(taxes.income.actuals[0].taxableInterestCents, 30)
  })

  test('Tax requests format retained cents exactly before HTTP', async ({ assert }) => {
    const taxes = f.store.taxes
    taxes.updateValues({ year: 2026, forecast: { taxableInterest: '90071992547409.91',
      additionalTaxableIncome: '-0.12', estimated: { expectedAgi: '0.00', priorYearAgi: '0.00',
        priorYearTotalTax: '0.00' } } })
    routes.set('post /api/v1/taxes', async request => {
      assert.strictEqual(request.forecast.taxableInterest, '90071992547409.91')
      assert.strictEqual(request.forecast.additionalTaxableIncome, '-0.12')
      assert.strictEqual(request.forecast.estimated.expectedAgi, '0.00')
      return { ok: false }
    })
    await taxes.save()
    routes.set('post /api/v1/taxes', () => assert.fail('Unsafe cents reached HTTP'))
    const save = Object.getPrototypeOf(taxes).save
    await assert.rejects(() => save.call({ year: 2026, filingStatus: taxes.filingStatus,
      income: { taxableInterestCents: Number.MAX_SAFE_INTEGER + 1 } }))
  })

  test('ordinary income tax uses cent thresholds without per-bracket rounding', ({ assert }) => {
    const taxes = f.store.taxes
    const cases = [
      [state.FilingStatus.Single, '11925.00', 1192.5],
      [state.FilingStatus.MarriedFilingSeparate, '11925.00', 1192.5],
      [state.FilingStatus.MarriedFilingJointly, '23850.00', 2385],
      [state.FilingStatus.QualifyingSurvivingSpouse, '23850.00', 2385],
      [state.FilingStatus.HeadOfHousehold, '17000.00', 1700],
    ]
    for (const [filingStatus, income, expected] of cases) {
      state.runInAction(() => { taxes.filingStatus = filingStatus })
      const brackets = taxes.taxBrackets()
      assert.isTrue(brackets.every(bracket => Number.isSafeInteger(bracket.startAmountCents)))
      const map = new Map()
      assert.strictEqual(taxes.computeOrdinaryTax(parseMoneyCents(income), map), expected)
      assert.deepEqual([...map], [[10, { amountCents: parseMoneyCents(income), tax: expected }]])
      const above = new Map()
      assert.strictEqual(taxes.computeOrdinaryTax(parseMoneyCents(income) + 1, above), expected +
        0.01 * 0.12)
      assert.strictEqual(above.get(12).amountCents, 1)
      assert.strictEqual(above.get(12).tax, 0.0012)
    }
    state.runInAction(() => { taxes.filingStatus = state.FilingStatus.Single })
    const fractions = new Map()
    assert.strictEqual(taxes.computeOrdinaryTax(parseMoneyCents('0.05'), fractions), 0.05 * 0.10)
    assert.strictEqual(fractions.get(10).tax, 0.05 * 0.10)
    for (const income of ['0.00', '-0.01']) {
      const map = new Map()
      assert.strictEqual(taxes.computeOrdinaryTax(parseMoneyCents(income), map), 0)
      assert.strictEqual(map.size, 0)
    }
    for (const invalid of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const map = new Map()
      assert.throws(() => taxes.computeOrdinaryTax(invalid, map))
      assert.strictEqual(map.size, 0)
    }
  })

  test('capital-gains allocations cross each filing-status threshold in exact cents', ({
    assert }) => {
    const taxes = f.store.taxes
    const printTaxes = taxes.constructor.printTaxes
    let captured
    taxes.constructor.printTaxes = map => {
      captured = new Map(map)
      return printTaxes(map)
    }
    try {
      const statuses = [
        [state.FilingStatus.Single, '48350.00', '533400.00'],
        [state.FilingStatus.MarriedFilingSeparate, '48350.00', '300000.00'],
        [state.FilingStatus.MarriedFilingJointly, '96700.00', '600050.00'],
        [state.FilingStatus.QualifyingSurvivingSpouse, '96700.00', '600050.00'],
        [state.FilingStatus.HeadOfHousehold, '64750.00', '566700.00'],
      ]
      for (const [filingStatus, zeroLimit, fifteenLimit] of statuses) {
        state.runInAction(() => { taxes.filingStatus = filingStatus })
        assert.strictEqual(taxes.maxZeroPctTaxableIncomeCents(), parseMoneyCents(zeroLimit))
        assert.strictEqual(taxes.maxFifteenPctTaxableIncomeCents(), parseMoneyCents(fifteenLimit))
        for (const [ordinary, gains, expected] of [
          [parseMoneyCents(zeroLimit) - 1, 3, [[0, 1], [15, 2]]],
          [parseMoneyCents(fifteenLimit) - 1, 3, [[15, 1], [20, 2]]],
        ]) {
          for (const useGains of [false, true]) {
            taxes.updateValues({ year: 2026, forecast: { filingStatus,
              taxableInterest: formatMoneyCents(ordinary + parseMoneyCents(taxes.standardDeduction
                .toFixed(2))),
              ordinaryDividends: useGains ? '0.00' : formatMoneyCents(gains),
              qualifiedDividends: useGains ? '0.00' : formatMoneyCents(gains),
              longTermCapitalGains: useGains ? formatMoneyCents(gains) : '0.00',
            }, actuals: [] })
            const result = taxes.run
            const allocations = result.brackets.filter(([rate]) => [0, 15, 20].includes(rate))
            assert.deepEqual(allocations.map(([rate, entry]) => [rate, entry.amountCents]),
              expected)
            assert.strictEqual(allocations.reduce((sum, [, entry]) => sum + entry.amountCents, 0),
              gains)
            for (const [rate, cents] of expected) {
              assert.strictEqual(captured.get(rate).tax, (cents / 100) * (rate / 100))
            }
            const rawTotal = [...captured.values()].reduce((sum, entry) => sum + entry.tax, 0)
            assert.strictEqual(result.totalTaxesCents, inputMoneyCents(rawTotal.toFixed(2)))
          }
        }
      }
      taxes.updateValues({ year: 2026, forecast: { filingStatus: state.FilingStatus.Single,
        taxableInterest: '15750.00', ordinaryDividends: '0.10', qualifiedDividends: '0.10',
      }, actuals: [] })
      assert.deepEqual(taxes.run.brackets, [[0, { amountCents: 10, taxCents: 0 }]])
      taxes.updateValues({ year: 2026, forecast: { filingStatus: state.FilingStatus.Single,
        taxableInterest: '15750.00', longTermCapitalGains: '-0.01',
      }, actuals: [] })
      assert.deepEqual(taxes.run.brackets, [])
    } finally {
      taxes.constructor.printTaxes = printTaxes
    }
  })

  test('Tax result outputs round only after raw bracket totals and rates are calculated', ({
    assert }) => {
    const printTaxes = f.store.taxes.constructor.printTaxes
    const brackets = new Map([[10, { tax: 0.005, amountCents: 10 }], [20, { tax: 0.005,
      amountCents: 20 }]])
    const before = globalThis.structuredClone([...brackets])
    const result = printTaxes(brackets)
    assert.deepEqual(result.brackets, [[10, { taxCents: 1, amountCents: 10 }], [20, { taxCents: 1,
      amountCents: 20 }]])
    // Preserve rounding the unrounded total rather than adding rounded bracket displays.
    assert.strictEqual(result.totalTaxesCents, 1)
    assert.strictEqual(result.totalTaxedAmountCents, 30)
    assert.strictEqual(result.marginalTaxRate, 20)
    assert.strictEqual(result.effectiveTaxRate, (0.005 + 0.005) / 0.3 * 100)
    assert.deepEqual([...brackets], before)
    assert.deepEqual(printTaxes(new Map()), { brackets: [], totalTaxesCents: 0,
      totalTaxedAmountCents: 0,
      marginalTaxRate: 0, effectiveTaxRate: 0 })
    assert.throws(() => printTaxes(new Map([[10, { tax: Infinity, amountCents: 100 }]])))
    assert.throws(() => printTaxes(new Map([[10, { tax: 1, amountCents: Number.MAX_SAFE_INTEGER +
      1 }]])))
  })

  test('taxable summary amounts preserve exact cents and reject overflow', ({ assert }) => {
    const printTaxes = f.store.taxes.constructor.printTaxes
    const brackets = new Map([[0, { tax: 0, amountCents: 10 }],
      [15, { tax: 0.003, amountCents: 2 }], [20, { tax: 0.004, amountCents: 2 }]])
    const before = globalThis.structuredClone([...brackets])
    const result = printTaxes(brackets)
    assert.strictEqual(result.totalTaxedAmountCents, 4)
    assert.strictEqual(result.totalTaxesCents, 1)
    assert.strictEqual(result.effectiveTaxRate, (0.003 + 0.004) / 0.14 * 100)
    assert.deepEqual(result.brackets.map(([rate, entry]) => [rate, entry.amountCents]), [[0, 10], [
      15, 2], [20, 2]])
    assert.deepEqual([...brackets], before)
    assert.strictEqual(printTaxes(new Map([[0, { tax: 0, amountCents: Number.MAX_SAFE_INTEGER }]]))
      .brackets[0][1].amountCents, Number.MAX_SAFE_INTEGER)
    assert.throws(() => printTaxes(new Map([[10, { tax: 1, amountCents: Number.MAX_SAFE_INTEGER }],
      [20, { tax: 1, amountCents: 1 }]])))
    for (const amountCents of [NaN, Infinity, 0.1]) {
      assert.throws(() => printTaxes(new Map([[0, { tax: 0, amountCents }]])))
    }
  })

  test(
    'auto-assignment load, CREATE and PATCH decode fixed dollars and encode fixed-dollar requests')
    .with([
    { fixedCents: 250, fixedWire: '2.50' },
    { fixedCents: Number.MAX_SAFE_INTEGER, fixedWire: '90071992547409.91' },
  ]).run(async ({ assert }, { fixedCents, fixedWire }) => {
    const props = { id: 1, name: 'Rule', searchStrings: ['Shop'], categories: [
      { id: 1, categoryId: 20, amount: '-0.12', percentage: false },
      { id: 2, categoryId: 21, amount: 12.75, percentage: true },
      { id: 3, categoryId: 20, amount: '0.00', percentage: null },
    ] }
    routes.set('get /api/v1/auto-assignments', async () => ({ body: { data: [props] } }))
    await f.store.autoAssignments.load()
    const rule = f.store.autoAssignments.autoAssignemnts[0]
    assert.deepEqual(rule.categories.map(row => row.percentage ? row.amount : row.amountCents), [-
      12, 12.75, 0])
    assert.isNull(rule.categories[2].percentage)
    const input = { name: 'Updated', searchStrings: ['Shop'], categories: [
      { id: 1, categoryId: 20, amountCents: fixedCents, percentage: false },
      { id: 2, categoryId: 21, amount: 12.75, percentage: true },
    ] }
    routes.set('patch /api/v1/auto-assignments/1', async payload => {
      assert.deepEqual(payload, { ...input, categories: [
        { id: 1, categoryId: 20, amount: fixedWire, percentage: false },
        { id: 2, categoryId: 21, amount: 12.75, percentage: true },
      ] })
      return { body: { data: { ...props, name: 'Updated', categories: [{ id: 1, categoryId: 20,
        percentage: false, amount: fixedWire }] } } }
    })
    await rule.update(input)
    assert.strictEqual(rule.categories[0].amountCents, fixedCents)
    assert.strictEqual(rule.categories[0].id, 1)
    routes.set('post /api/v1/auto-assignments', async payload => {
      assert.deepEqual(payload, { ...input, categories: [
        { id: 1, categoryId: 20, amount: fixedWire, percentage: false },
        { id: 2, categoryId: 21, amount: 12.75, percentage: true },
      ] })
      return { body: { data: { ...props, id: 2 } } }
    })
    await f.store.autoAssignments.add(input)
    assert.strictEqual(f.store.autoAssignments.autoAssignemnts.find(row => row.id === 2).categories[
      0].amountCents, -12)
    for (const amount of [1, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      routes.set('patch /api/v1/auto-assignments/1', async () => ({ body: { data: { ...props, name:
        'Invalid',
        categories: [{ ...props.categories[0], amount }] } } }))
      await assert.rejects(() => rule.update(input))
      assert.strictEqual(rule.name, 'Updated')
      assert.strictEqual(rule.categories[0].amountCents, fixedCents)
    }
  })

  test('auto-assignment list accepts an empty wrapped collection', async ({ assert }) => {
    routes.set('get /api/v1/auto-assignments', async () => ({ body: { data: [] } }))
    await f.store.autoAssignments.load()
    assert.isTrue(f.store.autoAssignments.initialized)
    assert.lengthOf(f.store.autoAssignments.autoAssignemnts, 0)
  })

  test('bare auto-assignment responses reject without changing cached rules')
    .with(['load', 'add', 'update']).run(async ({ assert }, action) => {
      const props = { id: 1, name: 'Rule', searchStrings: [], categories: [{ id: 1,
        categoryId: 20, percentage: false, amount: '0.10' }] }
      routes.set('get /api/v1/auto-assignments', async () => ({ body: { data: [props] } }))
      await f.store.autoAssignments.load()
      const rule = f.store.autoAssignments.autoAssignemnts[0]
      const input = { name: 'Changed', searchStrings: [], categories: rule.categories }
      routes.set('get /api/v1/auto-assignments', async () => ({ body: [props] }))
      routes.set('post /api/v1/auto-assignments', async () => ({ body: props }))
      routes.set('patch /api/v1/auto-assignments/1', async () => ({ body: props }))
      await assert.rejects(() => action === 'load' ? f.store.autoAssignments.load()
        : action === 'add' ? f.store.autoAssignments.add(input) : rule.update(input))
      assert.lengthOf(f.store.autoAssignments.autoAssignemnts, 1)
      assert.strictEqual(f.store.autoAssignments.autoAssignemnts[0], rule)
      assert.strictEqual(rule.name, 'Rule')
      assert.strictEqual(rule.categories[0].amountCents, 10)
    })

  test('invalid fixed-dollar auto-assignment cents reject before HTTP').with([NaN, Infinity, 0.1,
    Number.MAX_SAFE_INTEGER + 1])
    .run(async ({ assert }, amountCents) => {
      routes.set('get /api/v1/auto-assignments', async () => ({ body: {
        data: [{ id: 1, name: 'Rule',
        searchStrings: [],
        categories: [{ id: 1, categoryId: 20, amount: '0.10', percentage: false }] }] } }))
      await f.store.autoAssignments.load()
      routes.set('post /api/v1/auto-assignments', () => assert.fail('Invalid rule reached HTTP'))
      routes.set('patch /api/v1/auto-assignments/1', () => assert.fail('Invalid rule reached HTTP'))
      const input = { name: 'Changed', searchStrings: [], categories: [{ id: 1, categoryId: 20,
        percentage: false, amountCents }] }
      const rule = f.store.autoAssignments.autoAssignemnts[0]
      await assert.rejects(() => rule.update(input))
      await assert.rejects(() => f.store.autoAssignments.add(input))
      assert.strictEqual(rule.categories[0].amountCents, 10)
      assert.strictEqual(rule.name, 'Rule')
      assert.lengthOf(f.store.autoAssignments.autoAssignemnts, 1)
    })

  test('bill debit strings retain exact cents and preserve null', ({ assert }) => {
    for (const [debits, expected] of [['-12.50', -1250], ['0.00', 0], ['0.30', 30], ['0.01', 1], [
      '90071992547409.91', Number.MAX_SAFE_INTEGER], ['-90071992547409.91', -Number
      .MAX_SAFE_INTEGER], [null, null]]) {
      const bill = new state.Bill({ id: 20, debits }, f.category)
      assert.strictEqual(bill.debitsCents, expected)
      assert.strictEqual(bill.category, f.category)
    }
    for (const debits of [1, undefined, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => new state.Bill({ id: 20, debits }, f.category))
    }
  })

  test('Overview bill reloads decode cents before replacing cached bills', async ({ assert }) => {
    const response = [{ id: 20, debits: '-0.30' }]
    routes.set('get /api/v1/bills', async () => ({ body: { data: response } }))
    await f.store.overview.load()
    assert.strictEqual(f.store.overview.bills[0].debitsCents, -30)
    assert.strictEqual(f.store.overview.bills[0].category, f.category)
    assert.strictEqual(response[0].debits, '-0.30')
    assert.isTrue(f.store.overview.initialized)
    routes.set('get /api/v1/bills', async () => ({ body: { data: [{ id: 20, debits: '0.10' }] } }))
    await f.store.overview.load()
    assert.strictEqual(f.store.overview.bills[0].debitsCents, 10)
    routes.set('get /api/v1/bills', async () => ({ body: {
      data: [{ id: 20, debits: '0.20' }, { id: 20,
      debits: '1.2' }] } }))
    await assert.rejects(() => f.store.overview.load())
    assert.lengthOf(f.store.overview.bills, 1)
    assert.strictEqual(f.store.overview.bills[0].debitsCents, 10)
    routes.set('get /api/v1/bills', async () => ({ body: { data: [{ id: 20, debits: null }] } }))
    await f.store.overview.load()
    assert.isNull(f.store.overview.bills[0].debitsCents)
  })

  test('bills accept an empty wrapper and reject a bare collection', async ({ assert }) => {
    routes.set('get /api/v1/bills', async () => ({ body: { data: [] } }))
    await f.store.overview.load()
    assert.lengthOf(f.store.overview.bills, 0)
    assert.isTrue(f.store.overview.initialized)
    routes.set('get /api/v1/bills', async () => ({ body: [{ id: 20, debits: '0.10' }] }))
    await assert.rejects(() => f.store.overview.load(), 'Invalid bills response')
    assert.lengthOf(f.store.overview.bills, 0)
  })

  test('account chart rejects a bare collection without changing cached state', async ({
    assert }) => {
    routes.set('get /api/v1/account/10/balances', async () => ({ body: [] }))
    await assert.rejects(() => f.store.accountBalanceSeries.load(f.account),
      'Invalid account chart response')
    assert.isNull(f.store.accountBalanceSeries.account)
    assert.lengthOf(f.store.accountBalanceSeries.points, 0)
  })

  test('Category balance strings decode before updating cached balances', ({ assert }) => {
    f.store.categoryTree.updateBalances([{ id: 20, balance: '-12.34' }])
    assert.strictEqual(f.category.balanceCents, -1234)
    assert.throws(() => f.store.categoryTree.updateBalances([
      { id: 20, balance: '99.00' }, { id: 21, balance: '1.2' },
    ]))
    assert.strictEqual(f.category.balanceCents, -1234)
    for (const balance of [1, null, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => f.category.updateBalance({ id: 20, balance }))
      assert.strictEqual(f.category.balanceCents, -1234)
    }
  })

  test('invalid account balance data cannot partially update cached accounts').with([
    1, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, value) => {
    for (const field of ['balance', 'pendingBalance', 'plaidBalance']) {
      routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
        .institutionProps,
        accounts: [{ ...f.accountProps, name: 'changed', balance: '25.00', [field]: value }],
      }] } }))
      await assert.rejects(() => f.store.accounts.load())
      assert.strictEqual(f.account.name, 'Checking')
      assert.strictEqual(f.account.balanceCents, 10000)
      assert.isNull(f.account.plaidBalanceCents)
      assert.strictEqual(f.account.pendingBalanceCents, 0)
      assert.throws(() => f.account.update({ ...f.accountProps, name: 'changed', [field]: value }))
      assert.strictEqual(f.account.name, 'Checking')
    }
    assert.throws(() => f.store.accounts.updateBalances([{ id: 10, balance: '25.00' }, { id: 999,
      balance: value }]))
    assert.strictEqual(f.account.balanceCents, 10000)
  })

  function transactions(props = f.transactionProps()) {
    state.runInAction(() => {
      f.account.transactions.setTransactions([props])
      f.category.transactions.setTransactions([props])
      f.account.balanceCents = parseMoneyCents('90.00'); f.category.balanceCents = parseMoneyCents(
        '-10.00')
    })
    return { account: f.account.transactions.transactions[0], category: f.category.transactions
      .transactions[0] }
  }

  test('OFX refreshes independent balances and financial caches without history', async ({
    assert }) => {
    routes.set('fetch /api/v1/account/10/ofx', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
      .institutionProps, accounts: [{ ...f.accountProps, balance: '95.00', plaidBalance:
      '1500.00' }] }] } }))
    routes.set('get /api/v1/groups', async () => ({ body: { data: { categories: [{ id: 20, balance:
      '-5.00' }] } } }))
    const refreshes = []
    f.account.transactions.getData = async () => { refreshes.push('transactions') }
    f.account.pendingTransactions.getData = async () => { refreshes.push('pending') }
    assert.notProperty(f.store, 'balances')
    await f.account.uploadOfx(new File(['OFX'], 'test.ofx'))
    assert.equal(f.account.balanceCents, 9500); assert.equal(f.account.plaidBalanceCents, 150000)
    assert.equal(f.category.balanceCents, -500)
    assert.deepEqual(refreshes, ['transactions', 'pending'])
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('rejected OFX does not refresh or mutate caches', async ({ assert }) => {
    routes.set('fetch /api/v1/account/10/ofx', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.uploadOfx(new File(['OFX'], 'test.ofx')),
      /OFX upload failed/)
    assert.equal(f.account.balanceCents, 10000); assert.equal(f.account.plaidBalanceCents, null)
    assert.equal(f.category.balanceCents, 0); assert.lengthOf(calls, 1)
  })

  test('transaction edit applies returned statement totals', async ({ assert }) => {
    const trx = transactions().account
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f
      .transactionProps(-10, 30), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{
      id: 10, balance: '90.00' }], statement: { ...f.statementProps, debits: '-10.00' } } } }))
    await trx.updateTransaction({ statementId: 30 })
    assert.equal(trx.statementId, 30)
    assert.equal(f.statement.debitsCents, -1000)
  })

  test('amount edits keep separately loaded account and category transaction caches consistent')
    .with([-12.25, -5.75]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(amount), version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned,
      categories: [{ id: 20, balance: amount.toFixed(2) }], acctBalances: [{ id: 10, balance: (100 +
      amount).toFixed(2) }] } } }))
    await cached.account.updateTransaction({ amountCents: inputMoneyCents(String(amount)) })
    assert.equal(f.account.balanceCents, 10000 + Math.round(amount * 100)); assert.equal(f.category
      .balanceCents, Math.round(amount * 100))
    assert.equal(cached.account.amountCents, inputMoneyCents(String(amount)))
    assert.equal(cached.category.amountCents, inputMoneyCents(String(amount)))
    assert.equal(cached.category.version, 1)
  })

  test(
    ("tax editor response refreshes cent attribution " +
"across financial caches without balance changes"), async ({ assert }) => {
    const cached = transactions()
    const submitted = [{ type: 'estimated_tax_payments', amount: 12.345 }, { type:
      'estimated_tax_payments', amount: -0.125 }]
    const returned = { ...f.transactionProps(), version: 1, taxes: encodeTaxAttributions(
      submitted) }
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.deepEqual(payload.taxCategories, encodeTaxAttributions(submitted))
      return { body: { data: { transaction: returned, categories: [], acctBalances: [] } } }
    })
    const balances = [f.account.balanceCents, f.category.balanceCents]
    await cached.account.updateTransaction({ taxCategories: submitted.map(({ amount, ...tax }) => ({
      ...tax, amountCents: inputMoneyCents(String(amount)) })) })
    for (const transaction of [cached.account, cached.category]) {
      assert.deepEqual(transaction.taxCategories.map(tax => tax.amountCents), [1235, -12])
      assert.isTrue(transaction.taxCategories.every(tax => Number.isSafeInteger(tax.amountCents)))
      assert.deepEqual(transaction.categories.map(category => category.amountCents), [-1000])
    }
    assert.deepEqual([f.account.balanceCents, f.category.balanceCents], balances)
  })

  test('statement editing refreshes authoritative current balance for balance-tracked accounts',
    async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account
      .balanceCents = parseMoneyCents('90.00') })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      endingBalance: '75.00' } } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
      .institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances,
      balance: '75.00' }] }] } }))
    await f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') })
    assert.equal(f.statement.endingBalanceCents, 7500)
    assert.equal(f.account.balanceCents, 7500)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('bulk reconciliation refreshes loaded transaction statement membership', async ({
    assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { ...f.statementProps, debits:
      '-10.00' } } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f
      .transactionProps(-10, 30)], balance: '0.00' } } }))
    await f.statement.update({ reconcile: 'All' })
    assert.equal(cached.account.statementId, 30)
    assert.equal(cached.category.statementId, 30)
  })

  test('split edits remove stale membership from inactive category lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    const returned = { ...f.transactionProps(), version: 1, categories: [{ categoryId: 21, amount:
      '-10.00' }] }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned,
      categories: [{ id: 20, balance: '0.00' }, { id: 21, balance: '-10.00' }], acctBalances: [{
      id: 10, balance: '90.00' }] } } }))
    await cached.account.updateTransaction({ categories: returned.categories.map(({ amount,
      ...category }) => ({ ...category, amountCents: parseMoneyCents(amount) })) })
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.category.balanceCents, 0); assert.equal(f.other.balanceCents, -1000)
    assert.equal(cached.account.categories[0].categoryId, 21)
  })

  test('date edits update and reorder both cached copies', async ({ assert }) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(), date: '2025-02-20', version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned,
      categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10, balance:
      '90.00' }] } } }))
    await cached.account.updateTransaction({ date: returned.date })
    assert.equal(cached.category.date.toISODate(), returned.date)
    assert.strictEqual(f.category.transactions.transactions[0], cached.category)
    assert.strictEqual(f.account.transactions.transactions[0], cached.account)
  })

  test('deletion removes copies from inactive transaction lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{
      id: 20, balance: '0.00' }], acctBalances: [{ id: 10, balance: '100.00' }] } } }))
    await cached.account.delete()
    assert.lengthOf(f.account.transactions.transactions, 0)
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.account.balanceCents, 10000); assert.equal(f.category.balanceCents, 0)
  })

  test('transfer CREATE and PATCH encode money while keeping percentage rules numeric').with([
    [12.345, '12.35'], [-0.125, '-0.12'], [0.1 + 0.2, '0.30'], [-0, '0.00'],
  ]).run(async ({ assert }, [amount, expected]) => {
    const cached = transactions()
    const categories = [{ categoryId: 20, amount: formatMoneyCents(inputMoneyCents(String(amount))),
      baseAmountCents: inputMoneyCents(String(amount)), comment: 'keep',
      fundingCategories: [{ categoryId: 21, amountCents: inputMoneyCents(String(amount)),
        percentage: false },
        { categoryId: 20, amount: 100, percentage: true }] }]
    const before = globalThis.structuredClone(categories)
    const wire = [{ categoryId: 20, comment: 'keep', amount: expected, baseAmount: expected,
      fundingCategories: [{ categoryId: 21, amount: expected, percentage: false }, categories[0]
        .fundingCategories[1]] }]
    routes.set('post /api/v1/category-transfer', async payload => {
      assert.deepEqual(payload.categories, wire)
      return { ok: false, body: {} }
    })
    routes.set('patch /api/v1/category-transfer/40', async payload => {
      assert.deepEqual(payload.categories, wire)
      return { ok: false, body: {} }
    })
    await assert.rejects(() => f.store.register.addCategoryTransfer({ date: '2025-03-01',
      categories }, state.TransactionType.FUNDING_TRANSACTION))
    await assert.rejects(() => cached.account.updateCategoryTransfer({ date: '2025-03-01',
      categories }))
    assert.deepEqual(categories, before)
  })

  test('transfer editing updates date/version and every loaded copy').with([12.25, -12.25]).run(
    async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION,
      accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) },
      { categoryId: 21, amount: amount.toFixed(2) }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([
        props])
      f.category.balanceCents = parseMoneyCents((-amount).toFixed(2)); f.other.balanceCents =
        parseMoneyCents(amount.toFixed(2))
    })
    const cached = { source: f.category.transactions.transactions[0], destination: f.other
      .transactions.transactions[0] }
    const returned = { ...props, date: '2025-02-20', version: 2 }
    routes.set('patch /api/v1/category-transfer/40', async () => ({ body: { data: {
      transaction: returned, balances: [{ id: 20, balance: (-amount).toFixed(2) }, { id: 21,
      balance: amount.toFixed(2) }] } } }))
    await cached.source.updateCategoryTransfer({ date: returned.date, categories: returned
      .categories })
    assert.equal(cached.source.date.toISODate(), returned.date)
    assert.equal(cached.destination.version, 2)
    assert.equal(f.category.balanceCents, -Math.round(amount * 100)); assert.equal(f.other
      .balanceCents, Math.round(amount * 100))
    assert.equal(f.store.categoryTree.budget.childrenBalanceCents(), 0)
  })

  test('successful transfer creation applies authoritative source/destination balances').with([
    12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION,
      accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) },
      { categoryId: 21, amount: amount.toFixed(2) }] }
    routes.set('post /api/v1/category-transfer', async () => ({ body: { data: { transaction: props,
      balances: [{ id: 20, balance: (-amount).toFixed(2) }, { id: 21, balance: amount.toFixed(
      2) }] } } }))
    await f.store.register.addCategoryTransfer({ date: props.date, categories: props.categories },
      props.type)
    assert.equal(f.category.balanceCents, -Math.round(amount * 100)); assert.equal(f.other
      .balanceCents, Math.round(amount * 100))
    assert.equal(f.category.transactions.transactions[0].id, 40)
    assert.equal(f.store.categoryTree.budget.childrenBalanceCents(), 0)
  })

  test('Transaction CREATE and PATCH format cents directly without leaking state fields').with([
    ['12.35', 1235], ['-0.12', -12], ['0.30', 30], ['0.00', 0], ['90071992547409.91', Number
      .MAX_SAFE_INTEGER],
  ]).run(async ({ assert }, [expected, amountCents]) => {
    const cached = transactions()
    const values = { date: '2025-02-10', name: 'Encoded', amountCents, principleCents: amountCents,
      categories: [{ categoryId: 20, amountCents, comment: 'keep' }] }
    const wire = { date: values.date, name: values.name, amount: expected, principle: expected,
      categories: [{ categoryId: 20, amount: expected, comment: 'keep' }] }
    routes.set('post /api/v1/account/10/transactions', async payload => {
      assert.deepEqual(payload, wire)
      return { ok: false, body: { errors: [] } }
    })
    await f.account.addTransaction(values)
    const update = { ...values, taxCategories: [{ type: 'estimated_tax_payments', amountCents }] }
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.deepEqual(payload, { ...wire, version: 0,
        taxCategories: [{ type: 'estimated_tax_payments', amount: expected }] })
      return { ok: false, body: { errors: [] } }
    })
    await cached.account.updateTransaction(update)
    assert.strictEqual(values.amountCents, amountCents)
    assert.strictEqual(values.categories[0].amountCents, amountCents)
    assert.strictEqual(update.taxCategories[0].amountCents, amountCents)
  })

  test('invalid Transaction request cents fail before HTTP').with([NaN, Infinity, -Infinity, 0.1,
    Number.MAX_SAFE_INTEGER + 1])
    .run(async ({ assert }, amountCents) => {
      const cached = transactions()
      routes.set('post /api/v1/account/10/transactions', () => { assert.fail(
        'Invalid CREATE reached HTTP') })
      routes.set('patch /api/v1/transaction/40', () => { assert.fail(
        'Invalid PATCH reached HTTP') })
      await assert.rejects(() => f.account.addTransaction({ amountCents, categories: [] }))
      await assert.rejects(() => f.account.addTransaction({ amountCents: 100,
        principleCents: amountCents, categories: [] }))
      await assert.rejects(() => f.account.addTransaction({ amountCents: 100, categories: [{
        categoryId: 20, amountCents }] }))
      await assert.rejects(() => cached.account.updateTransaction({ amountCents }))
      await assert.rejects(() => cached.account.updateTransaction({ principleCents: amountCents }))
      await assert.rejects(() => cached.account.updateTransaction({ categories: [{ categoryId: 20,
        amountCents }] }))
      await assert.rejects(() => cached.account.updateTransaction({ taxCategories: [{ type:
        'estimated_tax_payments', amountCents }] }))
    })

  test('Transaction CREATE rejects a bare response without changing cached state', async ({
    assert }) => {
    const before = [f.account.balanceCents, f.category.balanceCents]
    const transactions = f.account.transactions.transactions.slice()
    routes.set('post /api/v1/account/10/transactions', async () => ({ body: {
      transaction: f.transactionProps(), categories: [{ id: 20, balance: '-10.00' }],
      acctBalances: [{ id: 10, balance: '90.00' }],
    } }))
    await assert.rejects(() => f.account.addTransaction({ date: '2025-02-10',
      amountCents: parseMoneyCents('-10.00'), name: 'Purchase', categories: [
        { categoryId: 20, amountCents: parseMoneyCents('-10.00') }] }))
    assert.deepEqual([f.account.balanceCents, f.category.balanceCents], before)
    assert.deepEqual(f.account.transactions.transactions, transactions)
  })

  test('account creation applies returned balances and inserts transaction', async ({ assert }) => {
    routes.set('post /api/v1/account/10/transactions', async () => ({ body: { data: { transaction: f
      .transactionProps(), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10,
      balance: '90.00' }] } } }))
    await f.account.addTransaction({ date: '2025-02-10', amountCents: parseMoneyCents('-10.00'),
      name: 'Purchase', categories: [{ categoryId: 20, amountCents: parseMoneyCents('-10.00') }] })
    assert.equal(f.account.balanceCents, 9000); assert.equal(f.category.balanceCents, -1000)
    assert.equal(f.account.transactions.transactions[0].id, 40)
  })

  test('statement creation updates membership in both loaded transaction caches', async ({
    assert }) => {
    const cached = transactions()
    routes.set('post /api/v1/account/10/statements', async payload => {
      assert.strictEqual(payload.startingBalance, '100.00')
      assert.strictEqual(payload.endingBalance, '90.00')
      assert.deepEqual(payload.data, { shortTermCapitalGains: '0.00', longTermCapitalGains: '0.00',
        dividends: '0.00', taxableInterest: '0.00' })
      return { body: { data: { ...f.statementProps, id: 31, transactions: [40] } } }
    })
    await f.account.statements.addStatement('2025-02-01', '2025-02-28', parseMoneyCents('100.00'),
      parseMoneyCents('90.00'), 0, 0, 0, 0)
    assert.equal(cached.account.statementId, 31)
    assert.equal(cached.category.statementId, 31)
  })

  test('statement deletion refreshes authoritative membership and balance', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account
      .balanceCents = parseMoneyCents('90.00') })
    routes.set('delete /api/v1/statements/30', async () => ({ body: {} }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f
      .transactionProps(-10, null)], balance: '0.00' } } }))
    accountsResponse(0)
    await f.statement.delete()
    assert.isNull(cached.account.statementId); assert.isNull(cached.category.statementId)
    assert.lengthOf(f.account.statements.statements, 0)
    assert.equal(f.account.balanceCents, 0)
    assert.equal(f.store.uiState.selectedStatement, null)
  })

  test('rejected statement deletion preserves cached financial state', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('delete /api/v1/statements/30', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.delete())
    assert.equal(cached.account.statementId, 30)
    assert.equal(cached.category.statementId, 30)
    assert.equal(f.store.uiState.selectedStatement, f.statement)
    assert.lengthOf(f.account.statements.statements, 1)
    assert.equal(f.account.balanceCents, 9000)
  })

  test('post-delete refresh failure retains confirmed deletion without inventing membership',
    async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('delete /api/v1/statements/30', async () => ({ body: {} }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.delete())
    assert.lengthOf(f.account.statements.statements, 0)
    assert.equal(f.store.uiState.selectedStatement, null)
    assert.equal(cached.account.statementId, 30)
    assert.equal(f.account.balanceCents, 9000)
  })

  test('start-date success refreshes shared account/category state without replacing objects',
    async ({ assert }) => {
    const cached = transactions()
    const funding = f.category
    state.runInAction(() => { funding.balanceCents = parseMoneyCents('85.85'); f.account
      .balanceCents = parseMoneyCents('100.00') })
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
      .institutionProps, accounts: [{ ...f.accountProps, startDate: '2025-02-01', balance:
      '100.00' }] }] } }))
    routes.set('get /api/v1/groups', async () => ({ body: { data: { categories: [{ id: 20, balance:
      '92.95' }] } } }))
    let refreshed = false
    f.category.transactions.getData = async () => { refreshed = true }
    const startDate = f.statement.startDate
    await f.account.setSettings({ startDate })
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balanceCents, 10000)
    assert.equal(funding.balanceCents, 9295)
    assert.equal(cached.account.statementId, null)
    assert.equal(cached.category.statementId, null)
    assert.isTrue(refreshed)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
    assert.strictEqual(f.store.categoryTree.getCategory(20), funding)
  })

  test('HTTP-rejected start-date edit leaves shared financial state unchanged', async ({
    assert }) => {
    const before = f.account.startDate
    routes.set('patch /api/v1/account/10', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.setSettings({ startDate: f.statement.startDate }))
    assert.equal(f.account.startDate, before)
    assert.equal(f.account.balanceCents, 10000)
    assert.equal(f.category.balanceCents, 0)
  })

  test('valid balance-tracked start-date change does not refresh transaction or category stores',
    async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances })
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    await f.account.setSettings({ startDate: f.statement.startDate })
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balanceCents, 10000)
    assert.lengthOf(calls, 1)
  })

  test('start-date refresh failure propagates while retaining the confirmed date', async ({
    assert }) => {
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.setSettings({ startDate: f.statement.startDate }))
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balanceCents, 10000)
    assert.equal(f.category.balanceCents, 0)
  })

  function accountsResponse(balance) {
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f
      .institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances,
      balance: balance.toFixed(2) }] }] } }))
  }

  test('balance-tracked toolbar and history use Statements for ordinary and investment accounts')
    .with([state => state.AccountType.Depository, state => state.AccountType.Investment])
    .run(async ({ assert }, getType) => {
      state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.type =
        getType(state) })
      const render = (component) => state.renderToStaticMarkup(state.createElement(state
        .StoreContext.Provider,
        { value: f.store }, state.createElement(component)))
      const toolbar = render(state.AccountsToolbar)
      assert.include(toolbar, 'Add Statement')
      assert.notInclude(toolbar, 'Add Balance')
      let historyReads = 0
      f.store.accountBalanceSeries.load = async () => { historyReads++ }
      const history = render(state.AccountBalanceChart)
      assert.include(history, '02/28/25')
      assert.include(history,
        '&quot;2025-02-28&quot;,{&quot;v&quot;:90,&quot;f&quot;:&quot;90.00&quot;}')
      assert.include(history,
        '&quot;2025-02-01&quot;,{&quot;v&quot;:100,&quot;f&quot;:&quot;100.00&quot;}')
      assert.include(history, '>90.00<')
      assert.notInclude(history, 'Add Balance')
      assert.equal(historyReads, 0)
    })

  test('read-only transaction chart loads points without observation IDs or Account mutation',
    async ({ assert }) => {
    routes.set('get /api/v1/account/10/balances', async () => ({ body: {
      data: [{ date: '2025-02-10',
      balance: '95.00' }] } }))
    await f.store.accountBalanceSeries.load(f.account)
    const point = f.store.accountBalanceSeries.points[0]
    assert.equal(point.balanceCents, 9500); assert.equal(point.date.toISODate(), '2025-02-10')
    assert.equal(f.account.balanceCents, 10000); assert.equal(f.account.plaidBalanceCents, null)
    assert.notProperty(point, 'id')
    for (const method of ['addBalance', 'insertBalance', 'removeBalance']) assert.notProperty(f
      .store.accountBalanceSeries, method)
    assert.notProperty(f.store, 'balances')
  })

  test(
    'account chart cache retains exact cents and rejects malformed replacement points atomically',
    async ({ assert }) => {
    const source = [{ date: '2025-02-10', balance: '90071992547409.91' }, { date: '2025-02-09',
      balance: '-0.30' }]
    routes.set('get /api/v1/account/10/balances', async () => ({ body: { data: source } }))
    await f.store.accountBalanceSeries.load(f.account)
    assert.deepEqual(f.store.accountBalanceSeries.points.map(p => p.balanceCents), [Number
      .MAX_SAFE_INTEGER, -30])
    assert.strictEqual(source[0].balance, '90071992547409.91')
    assert.notProperty(f.store.accountBalanceSeries.points[0], 'balance')
    const account = new f.account.constructor(f.store, f.institution, { id: 11, plaidId: null,
      name: 'Other', closed: false,
      type: state.AccountType.Depository, subtype: 'checking', tracking: state.TrackingType
        .Transactions,
      balance: '0.00', pendingBalance: '0.00', plaidBalance: null, startDate: '2025-01-01',
        rate: 0 })
    for (const balance of [1, '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      routes.set('get /api/v1/account/11/balances', async () => ({ body: {
      data: [{ date: '2025-02-10',
        balance: '0.10' }, { date: '2025-02-09', balance }] } }))
      await assert.rejects(() => f.store.accountBalanceSeries.load(account))
      assert.strictEqual(f.store.accountBalanceSeries.points[0].balanceCents, Number
        .MAX_SAFE_INTEGER)
      assert.strictEqual(f.store.accountBalanceSeries.account, f.account)
    }
    routes.set('get /api/v1/account/11/balances', async () => ({ body: { data: [] } }))
    await f.store.accountBalanceSeries.load(account)
    assert.lengthOf(f.store.accountBalanceSeries.points, 0)
    assert.strictEqual(f.store.accountBalanceSeries.account, account)
  })

  test('rejected or malformed chart request leaves cache and Account unchanged')
    .with(['rejected', 'malformed']).run(async ({ assert }, result) => {
      routes.set('get /api/v1/account/10/balances', async () => ({ ok: result !== 'rejected',
        body: { data: [null] } }))
      await assert.rejects(() => f.store.accountBalanceSeries.load(f.account))
      assert.lengthOf(f.store.accountBalanceSeries.points, 0)
      assert.isNull(f.store.accountBalanceSeries.account)
      assert.equal(f.account.balanceCents, 10000)
    })

  test('rejected transaction edit leaves cached financial state unchanged', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/transaction/40', async () => ({ ok: false, body: { errors: [{
      message: 'Rejected' }] } }))
    assert.isArray(await cached.account.updateTransaction({ amountCents: parseMoneyCents(
      '-75.00') }))
    assert.equal(cached.account.amountCents, -1000); assert.equal(cached.category.amountCents, -
      1000)
    assert.equal(f.account.balanceCents, 9000); assert.equal(f.category.balanceCents, -1000)
  })

  test('rejected statement mutation leaves existing state unchanged', async ({ assert }) => {
    routes.set('patch /api/v1/statements/30', async () => ({ ok: false, body: {} }))
    await f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') })
    assert.equal(f.statement.endingBalanceCents, 9000); assert.equal(f.account.balanceCents, 10000)
    assert.lengthOf(calls, 1)
  })

  test(
    'authoritative refresh failure after statement success propagates without inventing a balance',
    async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account
      .balanceCents = parseMoneyCents('90.00') })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      endingBalance: '75.00' } } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') }))
    assert.equal(f.statement.endingBalanceCents, 7500); assert.equal(f.account.balanceCents, 9000)
  })

  test('Statement endpoints reject bare responses without mutating cached state', async ({
    assert }) => {
    const before = f.account.statements.statements.slice()
    const endingBalance = f.statement.endingBalanceCents
    routes.set('get /api/v1/account/10/statements', async () => ({ body: [f.statementProps] }))
    await assert.rejects(() => f.account.statements.load(), 'Invalid statements response')
    routes.set('patch /api/v1/statements/30', async () => ({ body: f.statementProps }))
    await assert.rejects(() => f.statement.update({ endingBalanceCents: parseMoneyCents('1.00') }))
    routes.set('post /api/v1/account/10/statements', async () => ({ body: { ...f.statementProps,
      id: 31, transactions: [40] } }))
    await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28',
      parseMoneyCents('0.00'), parseMoneyCents('0.00'), 0, 0, 0, 0))
    assert.deepEqual(f.account.statements.statements, before)
    assert.strictEqual(f.statement.endingBalanceCents, endingBalance)
  })

  test('statement refresh preserves selected shared statement identity', async ({ assert }) => {
    routes.set('get /api/v1/account/10/statements', async () => ({ body: {
      data: [{ ...f.statementProps,
      debits: '-25.00' }] } }))
    await f.account.statements.load()
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.strictEqual(f.store.uiState.selectedStatement, f.statement)
    assert.equal(f.statement.debitsCents, -2500)
  })

  test('amount edit on an assigned transaction refreshes missing statement totals', async ({
    assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f
      .transactionProps(-12.25, 30), version: 1 }, categories: [{ id: 20, balance: '-12.25' }],
      acctBalances: [{ id: 10, balance: '87.75' }] } } }))
    routes.set('get /api/v1/account/10/statements', async () => ({ body: {
      data: [{ ...f.statementProps,
      debits: '-12.25' }] } }))
    await cached.account.updateTransaction({ amountCents: parseMoneyCents('-12.25') })
    assert.equal(f.statement.debitsCents, -1225)
    assert.equal(cached.category.amountCents, -1225)
  })

  test('clearing assignment applies returned statement totals to all loaded copies', async ({
    assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f
      .transactionProps(-10, null), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{
      id: 10, balance: '90.00' }], statement: { ...f.statementProps, debits: '0.00' } } } }))
    await cached.account.updateTransaction({ statementId: null })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.statement.debitsCents, 0)
  })

  test('bulk reconciliation None uses authoritative membership', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { ...f.statementProps, debits:
      '0.00' } } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f
      .transactionProps(-10, null)], balance: '0.00' } } }))
    await f.statement.update({ reconcile: 'None' })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
  })

  test('reconciliation refresh rejection propagates and leaves cached membership intact', async ({
    assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { ...f.statementProps, debits:
      '-10.00' } } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.update({ reconcile: 'All' }))
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.statement.debitsCents, -1000)
  })

  test('malformed statement success cannot partially mutate financial state', async ({ assert }) =>
    {
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { id: 30, credits: 200 } } }))
    await assert.rejects(() => f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') }))
    assert.equal(f.statement.creditsCents, 0); assert.equal(f.statement.endingBalanceCents, 9000)
  })

  test('malformed transaction success cannot partially mutate financial state', async ({
    assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f
      .transactionProps(), date: 'invalid' }, categories: [{ id: 20, balance: '-75.00' }],
      acctBalances: [{ id: 10, balance: '25.00' }] } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amountCents: parseMoneyCents(
      '-75.00') }))
    assert.equal(cached.account.amountCents, -1000); assert.equal(cached.category.amountCents, -
      1000)
    assert.equal(f.account.balanceCents, 9000); assert.equal(f.category.balanceCents, -1000)
  })

  test('HTTP-rejected transfer creation cannot apply a success-shaped body', async ({ assert }) => {
    routes.set('post /api/v1/category-transfer', async () => ({ ok: false, body: { data: {
      transaction: f.transactionProps(), balances: [{ id: 20, balance: '-75.00' }] } } }))
    await assert.rejects(() => f.store.register.addCategoryTransfer({ date: '2025-02-10',
      categories: [] }, state.TransactionType.FUNDING_TRANSACTION))
    assert.equal(f.category.balanceCents, 0); assert.lengthOf(f.category.transactions.transactions,
      0)
  })

  test('same-budget category movement preserves identity and changes computed group balances',
    async ({ assert }) => {
    const destination = new state.Group({ id: 2, name: 'Destination', type: state.GroupType.Regular,
      parentGroupId: -1 }, f.store)
    state.runInAction(() => { f.category.balanceCents = parseMoneyCents('12.25'); f.store
      .categoryTree.budget.insertChild(destination) })
    routes.set('patch /api/v1/groups/2/categories/20', async () => ({ body: { data: { id: 20,
      name: f.category.name, type: f.category.type, suspended: false, fundingAmount: '0.00',
      includeFundingTransfers: true, recurrence: 1, goalDate: null, fundingCategories: [],
      hidden: false } } }))
    await f.category.update({ group: destination, name: f.category.name, fundingCategories: [] })
    assert.strictEqual(destination.children[0], f.category)
    assert.strictEqual(f.category.group, destination)
    assert.equal(destination.childrenBalanceCents(), 1225)
    assert.equal(f.store.categoryTree.budget.childrenBalanceCents(), 1225)
  })

  test('combined statement date change and reconciliation uses server-returned membership', async ({
    assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      startDate: '2025-01-01', debits: '-10.00' } } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f
      .transactionProps(-10, 30)], balance: '0.00' } } }))
    await f.statement.update({ startDate: '2025-01-01', reconcile: 'All' })
    assert.equal(f.statement.startDate.toISODate(), '2025-01-01')
    assert.equal(cached.category.statementId, 30)
  })

  test('date-only statement edit preserves existing assignment semantics', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      startDate: '2025-02-15', debits: '-10.00' } } }))
    await f.statement.update({ startDate: '2025-02-15' })
    assert.equal(cached.account.statementId, 30); assert.equal(cached.category.statementId, 30)
    assert.lengthOf(calls, 1)
  })

  test('malformed authoritative accounts refresh is an error after a successful statement mutation',
    async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account
      .balanceCents = parseMoneyCents('90.00') })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { data: { ...f.statementProps,
      endingBalance: '75.00' } } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalanceCents: parseMoneyCents('75.00') }))
    assert.equal(f.statement.endingBalanceCents, 7500); assert.equal(f.account.balanceCents, 9000)
  })

  test('statement date editing reorders the shared history used for latest-statement display',
    async ({ assert }) => {
    const newer = new state.Statement({ ...f.statementProps, id: 31, startDate: '2025-03-01',
      endDate: '2025-03-31', endingBalance: '120.00' }, f.account.statements)
    state.runInAction(() => { f.account.statements.statements = [newer, f.statement]; f.account
      .tracking = state.TrackingType.Balances; f.account.balanceCents = parseMoneyCents('120.00') })
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { ...f.statementProps, endDate:
      '2025-04-30' } } }))
    accountsResponse(90)
    await f.statement.update({ endDate: '2025-04-30' })
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.equal(f.account.balanceCents, 9000)
  })

  test('statement creation on balance-tracked account refreshes authoritative account', async ({
    assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account
      .balanceCents = parseMoneyCents('90.00') })
    routes.set('post /api/v1/account/10/statements', async () => ({ body: {
      data: { ...f.statementProps,
      id: 31, startDate: '2025-03-01', endDate: '2025-03-31', endingBalance: '75.00',
      transactions: [] } } }))
    accountsResponse(75)
    await f.account.statements.addStatement('2025-03-01', '2025-03-31', parseMoneyCents('90.00'),
      parseMoneyCents('75.00'), 0, 0, 0, 0)
    assert.equal(f.account.balanceCents, 7500)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('malformed statement creation does not partially insert a financial record', async ({
    assert }) => {
    routes.set('post /api/v1/account/10/statements', async () => ({ body: {
      data: { ...f.statementProps,
      id: 31 } } }))
    transactions()
    await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28',
      parseMoneyCents('100.00'), parseMoneyCents('90.00'), 0, 0, 0, 0))
    assert.lengthOf(f.account.statements.statements, 1)
    assert.strictEqual(f.store.uiState.selectedStatement, f.statement)
  })

  test('transfer deletion applies authoritative reversal to both cached categories').with([12.25, -
    12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION,
      accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) },
      { categoryId: 21, amount: amount.toFixed(2) }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([
        props])
      f.category.balanceCents = parseMoneyCents((-amount).toFixed(2)); f.other.balanceCents =
        parseMoneyCents(amount.toFixed(2))
    })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{
      id: 20, balance: '0.00' }, { id: 21, balance: '0.00' }], acctBalances: [] } } }))
    await f.category.transactions.transactions[0].delete()
    assert.lengthOf(f.category.transactions.transactions, 0); assert.lengthOf(f.other.transactions
      .transactions, 0)
    assert.equal(f.category.balanceCents, 0); assert.equal(f.other.balanceCents, 0)
  })

  test('malformed deletion success does not partially apply returned financial balances', async ({
    assert }) => {
    const cached = transactions()
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{
      id: 20, balance: '0.00' }] } } }))
    await assert.rejects(() => cached.account.delete())
    assert.equal(f.category.balanceCents, -1000); assert.equal(f.account.balanceCents, 9000)
    assert.lengthOf(f.category.transactions.transactions, 1); assert.lengthOf(f.account.transactions
      .transactions, 1)
  })

  test('transaction edits update the loaded search cache as well as account/category copies',
    async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.searcher.transactions.setTransactions([f.transactionProps(
      )]) })
    const search = f.store.searcher.transactions.transactions[0]
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f
      .transactionProps(-12.25), version: 1 }, categories: [{ id: 20, balance: '-12.25' }],
      acctBalances: [{ id: 10, balance: '87.75' }] } } }))
    await cached.account.updateTransaction({ amountCents: parseMoneyCents('-12.25') })
    assert.equal(search.amountCents, -1225); assert.equal(search.version, 1)
    assert.strictEqual(f.store.searcher.transactions.transactions[0], search)
  })

  test('reconciliation rejects incomplete or duplicate batch responses before applying membership')
    .with(['missing', 'duplicate']).run(async ({ assert }, failure) => {
    const cached = transactions()
    state.runInAction(() => { f.account.transactions.appendTransactions([{ ...f.transactionProps(),
      id: 41 }]) })
    routes.set('patch /api/v1/statements/30', async () => ({ body: {
      data: { ...f.statementProps, debits:
      '-20.00' } } }))
    const returned = f.transactionProps(-10, 30)
    routes.set('get /api/v1/transactions?t=40&t=41', async () => ({ body: { data: {
      transactions: failure === 'missing' ? [returned] : [returned, returned], balance:
      '0.00' } } }))
    await assert.rejects(() => f.statement.update({ reconcile: 'All' }))
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.account.transactions.transactions[1].statementId, null)
  })
  test('funding calculation reaches real State/cache boundaries unchanged').with([false, true]).run(
    async ({ assert }, rejected) => {
    const allocations = calculateFunding(fundingCalculationInputs({ 21: { baseAmount: '2.00',
      includeFundingTransfers: false,
      fundingCategories: [{ categoryId: 20, amount: 100, percentage: true }] } }), 20)
    const rows = allocations.map(({ amountCents, ...row }) => ({ ...row, amount: formatMoneyCents(
      amountCents) }))
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION,
      accountTransaction: undefined, categories: encodeTransferCategories(rows) }

    routes.set('post /api/v1/category-transfer', async (payload) => {
      assert.deepEqual(payload.categories, props.categories)
      return rejected ? { ok: false, body: {} }
        : { body: { data: { transaction: props, balances: [{ id: 20, balance: '-2.00' }, { id: 21,
          balance: '2.00' }] } } }
    })
    const submit = () => f.store.register.addCategoryTransfer({ date: '2025-03-01',
      categories: rows }, props.type)
    if (rejected) {
      await assert.rejects(submit)
      assert.equal(f.category.balanceCents, 0)
      assert.equal(f.other.balanceCents, 0)
      assert.lengthOf(f.category.transactions.transactions, 0)
    } else {
      await submit()
      assert.equal(f.category.balanceCents, -200)
      assert.equal(f.other.balanceCents, 200)
      assert.deepEqual(f.category.transactions.transactions[0].categories, allocations.map((row,
        id) => ({ id, comment: undefined, funder: row.funder, ...row })))
    }
  })

  test('rejected funding/rebalance replacement preserves every cached financial value').with([2, 3])
    .run(async ({ assert }, type) => {
    const props = { ...f.transactionProps(), type, accountTransaction: undefined,
      categories: [{ categoryId: 20, amount: '-2.00' }, { categoryId: 21, amount: '2.00' }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([
        props])
      f.category.balanceCents = parseMoneyCents('-2.00'); f.other.balanceCents = parseMoneyCents(
        '2.00')
    })
    const cached = f.category.transactions.transactions[0]
    const before = { date: cached.date.toISODate(), categories: cached.categories.map((row) => ({
      ...row })) }
    routes.set('patch /api/v1/category-transfer/40', async () => ({ ok: false, body: {
      errors: [{ status: '422', detail: 'Unsupported replacement target' }],
      data: { transaction: { ...props, date: '2025-04-01' }, balances: [{ id: 20, balance:
        '999.00' }] },
    } }))
    await assert.rejects(() => cached.updateCategoryTransfer({ date: '2025-04-01', categories: [
      ] }))
    assert.equal(cached.date.toISODate(), before.date)
    assert.deepEqual(cached.categories, before.categories)
    assert.equal(f.category.balanceCents, -200); assert.equal(f.other.balanceCents, 200)
    assert.equal(f.other.transactions.transactions[0].date.toISODate(), before.date)
  })

  test('Category in-use rejection preserves cache; successful delete removes only its Category',
    async ({ assert }) => {
    const path = `/api/v1/groups/${f.category.group.id}/categories/${f.category.id}`
    const error = { code: 'HAS_CHILDREN', status: '409', detail: 'Category is in use' }
    routes.set(`delete ${path}`, async () => ({ ok: false, body: { errors: [error] } }))
    const before = [...f.store.categoryTree.budget.children]
    assert.deepEqual(await f.category.delete(), [error])
    assert.deepEqual([...f.store.categoryTree.budget.children], before)
    routes.set(`delete ${path}`, async () => ({ body: {} }))
    await f.category.delete()
    assert.notInclude(f.store.categoryTree.budget.children, f.category)
    assert.include(f.store.categoryTree.budget.children, f.other)
  })

})
