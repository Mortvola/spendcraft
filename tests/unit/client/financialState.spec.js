import { encodeTaxAttributions } from '../../../app/services/taxAmountCodec.ts'
import { calculateFunding } from '../../../client-src/Funding/calculateFunding.ts'
import { test } from '@japa/runner'
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
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { /* This harness does not persist UI preferences. */ } } })
    directory = await mkdtemp(join(tmpdir(), 'spendcraft-client-financial-'))
    const entry = join(directory, 'entry.js')
    const source = (file) => JSON.stringify(resolve(file))
    await writeFile(entry, `
export { store, StoreContext } from ${source('client-src/State/Store.ts')};
export { default as AccountsToolbar } from ${source('client-src/AccountView/AccountsToolbar.tsx')};
export { default as AccountBalanceChart } from ${source('client-src/AccountView/AccountBalanceChart.tsx')};
export { createElement } from ${source('node_modules/react/index.js')};
export { renderToStaticMarkup } from ${source('node_modules/react-dom/server.node.js')};
export { default as Http } from '@mortvola/http';
export { default as Institution } from ${source('client-src/State/Institution.ts')};
export { default as Category } from ${source('client-src/State/Category.ts')};
export { default as Group } from ${source('client-src/State/Group.ts')};
export { default as Transaction } from ${source('client-src/State/Transaction.ts')};
export { decodeAmount } from ${source('client-src/monetary.ts')};
export { default as Bill } from ${source('client-src/State/Bill.ts')};
export { default as Statement } from ${source('client-src/State/Statement.ts')};
export { runInAction } from 'mobx';
export * from ${source('common/ResponseTypes.ts')};
`)
    // Chart loading requires a browser; these checks exercise the surrounding Statement controls.
    await writeFile(join(directory, 'chart.js'), 'export default function Chart() { return null }\n')
    await build({ configFile: false, logLevel: 'error', plugins: [babel({ plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]] })], resolve: { alias: [{ find: 'react-google-charts', replacement: join(directory, 'chart.js') }, { find: '@mortvola/http', replacement: resolve('node_modules/@mortvola/http/dist/index.js') }, { find: 'mobx', replacement: resolve('node_modules/mobx/dist/mobx.esm.js') }, { find: /^react$/, replacement: resolve('node_modules/react/index.js') }, { find: /^react\/jsx-runtime$/, replacement: resolve('node_modules/react/jsx-runtime.js') }, { find: /^react-dom$/, replacement: resolve('node_modules/react-dom/index.js') }] }, build: { rolldownOptions: { output: { banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, external: (id) => id.startsWith(`${resolve('node_modules/react')}/`) || id.startsWith(`${resolve('node_modules/react-dom')}/`) }, target: 'esnext', minify: false, outDir: join(directory, 'out'), lib: { entry, formats: ['es'], fileName: () => 'state.mjs' } } })
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
    const accountProps = { id: 10, plaidId: null, name: 'Checking', closed: false, type: state.AccountType.Depository, subtype: 'checking', tracking: state.TrackingType.Transactions, balance: '100.00', pendingBalance: '0.00', plaidBalance: null, startDate: '2025-01-01', rate: 0 }
    const institutionProps = { id: 1, plaidInstitutionId: null, name: 'Offline bank', syncDate: null, accounts: [accountProps] }
    const institution = new state.Institution(store, institutionProps)
    const account = institution.accounts[0]
    const props = (id) => ({ id, groupId: -1, name: `Category ${id}`, type: state.CategoryType.Regular, balance: '0.00', fundingAmount: '0.00', fundingCategories: [], includeFundingTransfers: true, goalDate: null, useGoal: false, recurrence: 1, suspended: false, hidden: false })
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
    const statementProps = { id: 30, startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: '100.00', endingBalance: '90.00', credits: '0.00', debits: '0.00', data: {} }
    const statement = new state.Statement(statementProps, account.statements)
    state.runInAction(() => { account.statements.statements = [statement]; store.uiState.selectedStatement = statement })
    const transactionProps = (amount = -10, statementId = null) => ({ id: 40, date: '2025-02-10', type: state.TransactionType.MANUAL_TRANSACTION, sortOrder: 0, comment: '', version: 0, duplicateOfTransactionId: null, categories: [{ categoryId: 20, amount: amount.toFixed(2) }], taxes: [], accountTransaction: { name: 'Purchase', amount: amount.toFixed(2), principle: null, statementId, pending: false, accountOwner: null, paymentChannel: null, location: null, account: { id: 10, name: 'Checking', institution: { name: 'Offline bank' } } } })
    routes = new Map(); calls = []
    originals = new Map(['get', 'post', 'put', 'patch', 'delete', 'fetch'].map((method) => [method, state.Http[method]]))
    for (const method of originals.keys()) state.Http[method] = async (url, payload) => {
      calls.push({ method, url, payload })
      const handler = routes.get(`${method} ${url}`)
      if (!handler) throw new Error(`Unexpected ${method} ${url}`)
      const result = await handler(payload)
      return { ok: result.ok ?? true, body: async () => result.body }
    }
    f = { store, institution, account, accountProps, institutionProps, category, other, statement, statementProps, transactionProps }
    return () => { for (const [method, original] of originals) state.Http[method] = original }
  })

  test('Statement strings decode to numeric UI values while update requests remain numeric', async ({ assert }) => {
    const response = { ...f.statementProps, startingBalance: '0.10', endingBalance: '0.30', credits: '0.20', debits: '-0.01',
      data: { shortTermCapitalGains: '-0.12', longTermCapitalGains: null, dividends: '0.30', taxableInterest: '12.35' } }
    routes.set('patch /api/v1/statements/30', async payload => {
      assert.strictEqual(payload.endingBalance, 0.3)
      assert.strictEqual(payload.data.dividends, 0.3)
      return { body: response }
    })
    await f.statement.update({ endingBalance: 0.3, data: { shortTermCapitalGains: -0.12, longTermCapitalGains: 0, dividends: 0.3, taxableInterest: 12.35 } })
    assert.strictEqual(f.statement.startingBalance, 0.1)
    assert.strictEqual(f.statement.endingBalance, 0.3)
    assert.strictEqual(f.statement.credits, 0.2)
    assert.strictEqual(f.statement.debits, -0.01)
    assert.strictEqual(f.statement.shortTermGains, -0.12)
    assert.strictEqual(f.statement.longTermGains, 0)
    assert.strictEqual(f.statement.dividends, 0.3)
    assert.strictEqual(f.statement.taxableInterest, 12.35)
  })

  test('invalid Statement monetary responses cannot partially update the client').with([
    1, '', '1.2', '1e2', '01.00', '-0.00', 'NaN', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const before = f.statement.endingBalance
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: '75.00', data: { dividends: amount } } }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.strictEqual(f.statement.endingBalance, before)
  })

  test('shared API decoder handles exact strings and rejects invalid amounts').with([
    ['0.00', 0], ['-0.12', -0.12], ['12.34', 12.34], ['0.30', 0.3],
  ]).run(({ assert }, [value, expected]) => assert.strictEqual(state.decodeAmount(value), expected))

  test('invalid category allocation responses cannot mutate cached Transactions or balances').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const before = [f.account.balance, f.category.balance]
    const response = { ...f.transactionProps(), categories: [{ categoryId: 20, amount }], version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: response, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10, balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amount: -99 }))
    assert.strictEqual(cached.account.categories[0].amount, -10)
    assert.strictEqual(cached.category.categories[0].amount, -10)
    assert.strictEqual(cached.account.version, 0)
    assert.deepEqual([f.account.balance, f.category.balance], before)
  })

  test('AccountTransaction response amounts become numbers in cached client state').with([
    ['12.50', 12.5], ['-12.50', -12.5], ['0.00', 0], ['0.30', 0.3],
  ]).run(async ({ assert }, [amount, expected]) => {
    const cached = transactions()
    const props = f.transactionProps(expected)
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.strictEqual(payload.amount, expected)
      return { body: { data: { transaction: props, categories: [], acctBalances: [] } } }
    })
    assert.strictEqual(props.accountTransaction.amount, amount)
    await cached.account.updateTransaction({ amount: expected })
    assert.strictEqual(cached.account.amount, expected)
    assert.strictEqual(cached.category.amount, expected)
    assert.isNumber(cached.account.amount)
  })

  test('invalid AccountTransaction wire amounts cannot mutate cached state').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const props = f.transactionProps()
    props.accountTransaction.amount = amount
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: props, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10, balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amount: -99 }))
    assert.strictEqual(cached.account.amount, -10)
    assert.strictEqual(cached.category.amount, -10)
    assert.strictEqual(f.account.balance, 90)
    assert.strictEqual(f.category.balance, -10)
  })

  test('invalid tax response amounts cannot mutate financial caches').with([
    1, null, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const props = { ...f.transactionProps(), taxes: [{ type: 'estimated_tax_payments', amount }], version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: {
      transaction: props, categories: [{ id: 20, balance: '-99.00' }], acctBalances: [{ id: 10, balance: '1.00' }],
    } } }))
    await assert.rejects(() => cached.account.updateTransaction({ taxCategories: [{ type: 'estimated_tax_payments', amount: 1 }] }))
    assert.deepEqual(cached.account.taxCategories, [])
    assert.deepEqual(cached.category.taxCategories, [])
    assert.strictEqual(cached.account.version, 0)
    assert.strictEqual(f.account.balance, 90)
    assert.strictEqual(f.category.balance, -10)
  })

  test('account balance updates decode exact strings without changing Category balances', async ({ assert }) => {
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps,
      accounts: [{ ...f.accountProps, balance: '-12.34', pendingBalance: '-0.37', plaidBalance: '0.30' }],
    }] } }))
    await f.store.accounts.load()
    assert.strictEqual(f.account.balance, -12.34)
    assert.strictEqual(f.account.plaidBalance, 0.3)
    assert.strictEqual(f.account.pendingBalance, -0.37)
    assert.strictEqual(f.category.balance, 0)
    f.store.accounts.updateBalances([{ id: f.account.id, balance: '12.50' }])
    assert.strictEqual(f.account.balance, 12.5)
    f.account.transactions.transactionResponseHandler({ transactions: [], balance: '0.30' }, 0, 20)
    assert.strictEqual(f.account.balance, 0.3)
    f.category.transactions.transactionResponseHandler({ transactions: [], balance: '2.50' }, 0, 20)
    assert.strictEqual(f.category.balance, 2.5)
  })

  test('transaction response balances reject noncanonical values before changing state', ({ assert }) => {
    for (const balance of [0, null, '', '0', '-0.00', '1.2', 'Infinity', '90071992547409.92']) {
      assert.throws(() => f.account.transactions.transactionResponseHandler({ transactions: [], balance }, 0, 20))
      assert.strictEqual(f.account.balance, 100)
      assert.throws(() => f.category.transactions.transactionResponseHandler({ transactions: [], balance }, 0, 20))
      assert.strictEqual(f.category.balance, 0)
    }
    f.category.transactions.transactionResponseHandler({ transactions: [], balance: '0.00' }, 0, 20)
    assert.strictEqual(f.category.balance, 0)
  })

  test('funding metadata becomes numeric client state without changing requests or percentages', ({ assert }) => {
    const category = new state.Category({ ...({ id: 25, groupId: -1, name: "Funding", type: state.CategoryType.Regular, balance: "0.00", suspended: false, includeFundingTransfers: true, recurrence: 1, hidden: false }), fundingAmount: '12.50',
      fundingCategories: [{ categoryId: 20, amount: '-0.12', percentage: false },
        { categoryId: 21, amount: 12.75, percentage: true }],
    }, f.store)
    assert.strictEqual(category.fundingAmount, 12.5)
    assert.deepEqual(category.fundingCategories.map((row) => row.amount), [-0.12, 12.75])
    const transaction = new state.Transaction(f.store, { ...f.transactionProps(), categories: [
      { categoryId: 20, amount: '1.00', baseAmount: '0.30',
        fundingCategories: [{ categoryId: 21, amount: '2.50', percentage: false },
          { categoryId: 22, amount: 100, percentage: true }] },
    ] })
    assert.strictEqual(transaction.categories[0].baseAmount, 0.3)
    assert.deepEqual(transaction.categories[0].fundingCategories.map((row) => row.amount), [2.5, 100])
    for (const amount of [1, '', '1.2', '-0.00', 'Infinity']) {
      assert.throws(() => new state.Transaction(f.store, { ...f.transactionProps(), categories: [
        { categoryId: 20, amount: '1.00', baseAmount: amount },
      ] }))
    }
  })

  test('auto-assignment load, CREATE and PATCH decode fixed dollars and preserve numeric requests', async ({ assert }) => {
    const props = { id: 1, name: 'Rule', searchStrings: ['Shop'], categories: [
      { id: 1, categoryId: 20, amount: '-0.12', percentage: false },
      { id: 2, categoryId: 21, amount: 12.75, percentage: true },
      { id: 3, categoryId: 20, amount: '0.00', percentage: null },
    ] }
    routes.set('get /api/v1/auto-assignments', async () => ({ body: [props] }))
    await f.store.autoAssignments.load()
    const rule = f.store.autoAssignments.autoAssignemnts[0]
    assert.deepEqual(rule.categories.map(row => row.amount), [-0.12, 12.75, 0])
    assert.isNull(rule.categories[2].percentage)
    const input = { name: 'Updated', searchStrings: ['Shop'], categories: [
      { id: 1, categoryId: 20, amount: 2.5, percentage: false },
    ] }
    routes.set('patch /api/v1/auto-assignments/1', async payload => {
      assert.deepEqual(payload, input)
      return { body: { ...props, name: 'Updated', categories: [{ ...input.categories[0], amount: '2.50' }] } }
    })
    await rule.update(input)
    assert.strictEqual(rule.categories[0].amount, 2.5)
    assert.strictEqual(rule.categories[0].id, 1)
    routes.set('post /api/v1/auto-assignments', async payload => {
      assert.deepEqual(payload, input)
      return { body: { ...props, id: 2 } }
    })
    await f.store.autoAssignments.add(input)
    assert.strictEqual(f.store.autoAssignments.autoAssignemnts.find(row => row.id === 2).categories[0].amount, -0.12)
    for (const amount of [1, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      routes.set('patch /api/v1/auto-assignments/1', async () => ({ body: { ...props, name: 'Invalid',
        categories: [{ ...props.categories[0], amount }] } }))
      await assert.rejects(() => rule.update(input))
      assert.strictEqual(rule.name, 'Updated')
      assert.strictEqual(rule.categories[0].amount, 2.5)
    }
  })

  test('bill debit strings become numeric client values and preserve null', ({ assert }) => {
    for (const [debits, expected] of [['-12.50', -12.5], ['0.00', 0], ['0.30', 0.3], [null, null]]) {
      const bill = new state.Bill({ id: 20, debits }, f.category)
      assert.strictEqual(bill.debits, expected)
      assert.strictEqual(bill.category, f.category)
    }
    for (const debits of [1, undefined, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => new state.Bill({ id: 20, debits }, f.category))
    }
  })

  test('Category balance strings decode before updating cached balances', ({ assert }) => {
    f.store.categoryTree.updateBalances([{ id: 20, balance: '-12.34' }])
    assert.strictEqual(f.category.balance, -12.34)
    assert.throws(() => f.store.categoryTree.updateBalances([
      { id: 20, balance: '99.00' }, { id: 21, balance: '1.2' },
    ]))
    assert.strictEqual(f.category.balance, -12.34)
    for (const balance of [1, null, '', '1.2', '-0.00', 'Infinity', '90071992547409.92']) {
      assert.throws(() => f.category.updateBalance({ id: 20, balance }))
      assert.strictEqual(f.category.balance, -12.34)
    }
  })

  test('invalid account balance data cannot partially update cached accounts').with([
    1, '', '1.2', '1e2', '-0.00', 'Infinity', '90071992547409.92',
  ]).run(async ({ assert }, value) => {
    for (const field of ['balance', 'pendingBalance', 'plaidBalance']) {
      routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps,
        accounts: [{ ...f.accountProps, name: 'changed', balance: '25.00', [field]: value }],
      }] } }))
      await assert.rejects(() => f.store.accounts.load())
      assert.strictEqual(f.account.name, 'Checking')
      assert.strictEqual(f.account.balance, 100)
      assert.isNull(f.account.plaidBalance)
      assert.strictEqual(f.account.pendingBalance, 0)
      assert.throws(() => f.account.update({ ...f.accountProps, name: 'changed', [field]: value }))
      assert.strictEqual(f.account.name, 'Checking')
    }
    assert.throws(() => f.store.accounts.updateBalances([{ id: 10, balance: '25.00' }, { id: 999, balance: value }]))
    assert.strictEqual(f.account.balance, 100)
  })

  function transactions(props = f.transactionProps()) {
    state.runInAction(() => {
      f.account.transactions.setTransactions([props])
      f.category.transactions.setTransactions([props])
      f.account.balance = 90; f.category.balance = -10
    })
    return { account: f.account.transactions.transactions[0], category: f.category.transactions.transactions[0] }
  }

  test('OFX refreshes independent balances and financial caches without history', async ({ assert }) => {
    routes.set('fetch /api/v1/account/10/ofx', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, balance: '95.00', plaidBalance: '1500.00' }] }] } }))
    routes.set('get /api/v1/groups', async () => ({ body: { data: { categories: [{ id: 20, balance: '-5.00' }] } } }))
    const refreshes = []
    f.account.transactions.getData = async () => { refreshes.push('transactions') }
    f.account.pendingTransactions.getData = async () => { refreshes.push('pending') }
    assert.notProperty(f.store, 'balances')
    await f.account.uploadOfx(new File(['OFX'], 'test.ofx'))
    assert.equal(f.account.balance, 95); assert.equal(f.account.plaidBalance, 1500)
    assert.equal(f.category.balance, -5)
    assert.deepEqual(refreshes, ['transactions', 'pending'])
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('rejected OFX does not refresh or mutate caches', async ({ assert }) => {
    routes.set('fetch /api/v1/account/10/ofx', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.uploadOfx(new File(['OFX'], 'test.ofx')), /OFX upload failed/)
    assert.equal(f.account.balance, 100); assert.equal(f.account.plaidBalance, null)
    assert.equal(f.category.balance, 0); assert.lengthOf(calls, 1)
  })

  test('transaction edit applies returned statement totals', async ({ assert }) => {
    const trx = transactions().account
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f.transactionProps(-10, 30), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10, balance: '90.00' }], statement: { ...f.statementProps, debits: '-10.00' } } } }))
    await trx.updateTransaction({ statementId: 30 })
    assert.equal(trx.statementId, 30)
    assert.equal(f.statement.debits, -10)
  })

  test('amount edits keep separately loaded account and category transaction caches consistent').with([-12.25, -5.75]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(amount), version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: amount.toFixed(2) }], acctBalances: [{ id: 10, balance: (100 + amount).toFixed(2) }] } } }))
    await cached.account.updateTransaction({ amount })
    assert.equal(f.account.balance, 100 + amount); assert.equal(f.category.balance, amount)
    assert.equal(cached.account.amount, amount)
    assert.equal(cached.category.amount, amount)
    assert.equal(cached.category.version, 1)
  })

  test('tax editor response refreshes numeric attribution across financial caches without balance changes', async ({ assert }) => {
    const cached = transactions()
    const submitted = [{ type: 'estimated_tax_payments', amount: 12.345 }, { type: 'estimated_tax_payments', amount: -0.125 }]
    const returned = { ...f.transactionProps(), version: 1, taxes: encodeTaxAttributions(submitted) }
    routes.set('patch /api/v1/transaction/40', async payload => {
      assert.deepEqual(payload.taxCategories, submitted)
      return { body: { data: { transaction: returned, categories: [], acctBalances: [] } } }
    })
    const balances = [f.account.balance, f.category.balance]
    await cached.account.updateTransaction({ taxCategories: submitted })
    for (const transaction of [cached.account, cached.category]) {
      assert.deepEqual(transaction.taxCategories.map(tax => tax.amount), [12.35, -0.12])
      assert.isTrue(transaction.taxCategories.every(tax => typeof tax.amount === 'number'))
      assert.deepEqual(transaction.categories.map(category => category.amount), [-10])
    }
    assert.deepEqual([f.account.balance, f.category.balance], balances)
  })

  test('statement editing refreshes authoritative current balance for balance-tracked accounts', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: '75.00' } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances, balance: '75.00' }] }] } }))
    await f.statement.update({ endingBalance: 75 })
    assert.equal(f.statement.endingBalance, 75)
    assert.equal(f.account.balance, 75)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('bulk reconciliation refreshes loaded transaction statement membership', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: '-10.00' } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, 30)], balance: '0.00' } } }))
    await f.statement.update({ reconcile: 'All' })
    assert.equal(cached.account.statementId, 30)
    assert.equal(cached.category.statementId, 30)
  })

  test('split edits remove stale membership from inactive category lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    const returned = { ...f.transactionProps(), version: 1, categories: [{ categoryId: 21, amount: '-10.00' }] }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: '0.00' }, { id: 21, balance: '-10.00' }], acctBalances: [{ id: 10, balance: '90.00' }] } } }))
    await cached.account.updateTransaction({ categories: returned.categories.map(category => ({ ...category, amount: Number(category.amount) })) })
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.category.balance, 0); assert.equal(f.other.balance, -10)
    assert.equal(cached.account.categories[0].categoryId, 21)
  })

  test('date edits update and reorder both cached copies', async ({ assert }) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(), date: '2025-02-20', version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10, balance: '90.00' }] } } }))
    await cached.account.updateTransaction({ date: returned.date })
    assert.equal(cached.category.date.toISODate(), returned.date)
    assert.strictEqual(f.category.transactions.transactions[0], cached.category)
    assert.strictEqual(f.account.transactions.transactions[0], cached.account)
  })

  test('deletion removes copies from inactive transaction lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: '0.00' }], acctBalances: [{ id: 10, balance: '100.00' }] } } }))
    await cached.account.delete()
    assert.lengthOf(f.account.transactions.transactions, 0)
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.account.balance, 100); assert.equal(f.category.balance, 0)
  })

  test('transfer editing updates date/version and every loaded copy').with([12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) }, { categoryId: 21, amount: amount.toFixed(2) }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([props])
      f.category.balance = -amount; f.other.balance = amount
    })
    const cached = { source: f.category.transactions.transactions[0], destination: f.other.transactions.transactions[0] }
    const returned = { ...props, date: '2025-02-20', version: 2 }
    routes.set('patch /api/v1/category-transfer/40', async () => ({ body: { data: { transaction: returned, balances: [{ id: 20, balance: (-amount).toFixed(2) }, { id: 21, balance: amount.toFixed(2) }] } } }))
    await cached.source.updateCategoryTransfer({ date: returned.date, categories: returned.categories.map(category => ({ ...category, amount: Number(category.amount) })) })
    assert.equal(cached.source.date.toISODate(), returned.date)
    assert.equal(cached.destination.version, 2)
    assert.equal(f.category.balance, -amount); assert.equal(f.other.balance, amount)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 0)
  })

  test('successful transfer creation applies authoritative source/destination balances').with([12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) }, { categoryId: 21, amount: amount.toFixed(2) }] }
    routes.set('post /api/v1/category-transfer', async () => ({ body: { data: { transaction: props, balances: [{ id: 20, balance: (-amount).toFixed(2) }, { id: 21, balance: amount.toFixed(2) }] } } }))
    await f.store.register.addCategoryTransfer({ date: props.date, categories: props.categories.map(category => ({ ...category, amount: Number(category.amount) })) }, props.type)
    assert.equal(f.category.balance, -amount); assert.equal(f.other.balance, amount)
    assert.equal(f.category.transactions.transactions[0].id, 40)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 0)
  })

  test('account creation applies returned balances and inserts transaction', async ({ assert }) => {
    routes.set('post /api/v1/account/10/transactions', async () => ({ body: { transaction: f.transactionProps(), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10, balance: '90.00' }] } }))
    await f.account.addTransaction({ date: '2025-02-10', amount: -10, name: 'Purchase', categories: [{ categoryId: 20, amount: -10 }] })
    assert.equal(f.account.balance, 90); assert.equal(f.category.balance, -10)
    assert.equal(f.account.transactions.transactions[0].id, 40)
  })

  test('statement creation updates membership in both loaded transaction caches', async ({ assert }) => {
    const cached = transactions()
    routes.set('post /api/v1/account/10/statements', async () => ({ body: { ...f.statementProps, id: 31, transactions: [40] } }))
    await f.account.statements.addStatement('2025-02-01', '2025-02-28', 100, 90, 0, 0, 0, 0)
    assert.equal(cached.account.statementId, 31)
    assert.equal(cached.category.statementId, 31)
  })

  test('statement deletion refreshes authoritative membership and balance', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('delete /api/v1/statements/30', async () => ({ body: {} }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, null)], balance: '0.00' } } }))
    accountsResponse(0)
    await f.statement.delete()
    assert.isNull(cached.account.statementId); assert.isNull(cached.category.statementId)
    assert.lengthOf(f.account.statements.statements, 0)
    assert.equal(f.account.balance, 0)
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
    assert.equal(f.account.balance, 90)
  })

  test('post-delete refresh failure retains confirmed deletion without inventing membership', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('delete /api/v1/statements/30', async () => ({ body: {} }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.delete())
    assert.lengthOf(f.account.statements.statements, 0)
    assert.equal(f.store.uiState.selectedStatement, null)
    assert.equal(cached.account.statementId, 30)
    assert.equal(f.account.balance, 90)
  })

  test('start-date success refreshes shared account/category state without replacing objects', async ({ assert }) => {
    const cached = transactions()
    const funding = f.category
    state.runInAction(() => { funding.balance = 85.85; f.account.balance = 100 })
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, startDate: '2025-02-01', balance: '100.00' }] }] } }))
    routes.set('get /api/v1/groups', async () => ({ body: { data: { categories: [{ id: 20, balance: '92.95' }] } } }))
    let refreshed = false
    f.category.transactions.getData = async () => { refreshed = true }
    const startDate = f.statement.startDate
    await f.account.setSettings({ startDate })
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balance, 100)
    assert.equal(funding.balance, 92.95)
    assert.equal(cached.account.statementId, null)
    assert.equal(cached.category.statementId, null)
    assert.isTrue(refreshed)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
    assert.strictEqual(f.store.categoryTree.getCategory(20), funding)
  })

  test('HTTP-rejected start-date edit leaves shared financial state unchanged', async ({ assert }) => {
    const before = f.account.startDate
    routes.set('patch /api/v1/account/10', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.setSettings({ startDate: f.statement.startDate }))
    assert.equal(f.account.startDate, before)
    assert.equal(f.account.balance, 100)
    assert.equal(f.category.balance, 0)
  })

  test('valid balance-tracked start-date change does not refresh transaction or category stores', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances })
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    await f.account.setSettings({ startDate: f.statement.startDate })
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balance, 100)
    assert.lengthOf(calls, 1)
  })

  test('start-date refresh failure propagates while retaining the confirmed date', async ({ assert }) => {
    routes.set('patch /api/v1/account/10', async () => ({ body: {} }))
    routes.set('get /api/v1/connected-accounts', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.account.setSettings({ startDate: f.statement.startDate }))
    assert.equal(f.account.startDate.toISODate(), '2025-02-01')
    assert.equal(f.account.balance, 100)
    assert.equal(f.category.balance, 0)
  })

  function accountsResponse(balance) {
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances, balance: balance.toFixed(2) }] }] } }))
  }

  test('balance-tracked toolbar and history use Statements for ordinary and investment accounts')
    .with([state => state.AccountType.Depository, state => state.AccountType.Investment])
    .run(async ({ assert }, getType) => {
      state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.type = getType(state) })
      const render = (component) => state.renderToStaticMarkup(state.createElement(state.StoreContext.Provider,
        { value: f.store }, state.createElement(component)))
      const toolbar = render(state.AccountsToolbar)
      assert.include(toolbar, 'Add Statement')
      assert.notInclude(toolbar, 'Add Balance')
      let historyReads = 0
      f.store.accountBalanceSeries.load = async () => { historyReads++ }
      const history = render(state.AccountBalanceChart)
      assert.include(history, '02/28/25')
      assert.notInclude(history, 'Add Balance')
      assert.equal(historyReads, 0)
    })

  test('read-only transaction chart loads points without observation IDs or Account mutation', async ({ assert }) => {
    routes.set('get /api/v1/account/10/balances', async () => ({ body: [{ date: '2025-02-10', balance: '95.00' }] }))
    await f.store.accountBalanceSeries.load(f.account)
    const point = f.store.accountBalanceSeries.points[0]
    assert.equal(point.balance, 95); assert.equal(point.date.toISODate(), '2025-02-10')
    assert.equal(f.account.balance, 100); assert.equal(f.account.plaidBalance, null)
    assert.notProperty(point, 'id')
    for (const method of ['addBalance', 'insertBalance', 'removeBalance']) assert.notProperty(f.store.accountBalanceSeries, method)
    assert.notProperty(f.store, 'balances')
  })

  test('rejected or malformed chart request leaves cache and Account unchanged')
    .with(['rejected', 'malformed']).run(async ({ assert }, result) => {
      routes.set('get /api/v1/account/10/balances', async () => ({ ok: result !== 'rejected', body: [null] }))
      await assert.rejects(() => f.store.accountBalanceSeries.load(f.account))
      assert.lengthOf(f.store.accountBalanceSeries.points, 0)
      assert.isNull(f.store.accountBalanceSeries.account)
      assert.equal(f.account.balance, 100)
    })

  test('rejected transaction edit leaves cached financial state unchanged', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/transaction/40', async () => ({ ok: false, body: { errors: [{ message: 'Rejected' }] } }))
    assert.isArray(await cached.account.updateTransaction({ amount: -75 }))
    assert.equal(cached.account.amount, -10); assert.equal(cached.category.amount, -10)
    assert.equal(f.account.balance, 90); assert.equal(f.category.balance, -10)
  })

  test('rejected statement mutation leaves existing state unchanged', async ({ assert }) => {
    routes.set('patch /api/v1/statements/30', async () => ({ ok: false, body: {} }))
    await f.statement.update({ endingBalance: 75 })
    assert.equal(f.statement.endingBalance, 90); assert.equal(f.account.balance, 100)
    assert.lengthOf(calls, 1)
  })

  test('authoritative refresh failure after statement success propagates without inventing a balance', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: '75.00' } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.equal(f.statement.endingBalance, 75); assert.equal(f.account.balance, 90)
  })

  test('statement refresh preserves selected shared statement identity', async ({ assert }) => {
    routes.set('get /api/v1/account/10/statements', async () => ({ body: [{ ...f.statementProps, debits: '-25.00' }] }))
    await f.account.statements.load()
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.strictEqual(f.store.uiState.selectedStatement, f.statement)
    assert.equal(f.statement.debits, -25)
  })

  test('amount edit on an assigned transaction refreshes missing statement totals', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(-12.25, 30), version: 1 }, categories: [{ id: 20, balance: '-12.25' }], acctBalances: [{ id: 10, balance: '87.75' }] } } }))
    routes.set('get /api/v1/account/10/statements', async () => ({ body: [{ ...f.statementProps, debits: '-12.25' }] }))
    await cached.account.updateTransaction({ amount: -12.25 })
    assert.equal(f.statement.debits, -12.25)
    assert.equal(cached.category.amount, -12.25)
  })

  test('clearing assignment applies returned statement totals to all loaded copies', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f.transactionProps(-10, null), categories: [{ id: 20, balance: '-10.00' }], acctBalances: [{ id: 10, balance: '90.00' }], statement: { ...f.statementProps, debits: '0.00' } } } }))
    await cached.account.updateTransaction({ statementId: null })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.statement.debits, 0)
  })

  test('bulk reconciliation None uses authoritative membership', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: '0.00' } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, null)], balance: '0.00' } } }))
    await f.statement.update({ reconcile: 'None' })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
  })

  test('reconciliation refresh rejection propagates and leaves cached membership intact', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: '-10.00' } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.update({ reconcile: 'All' }))
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.statement.debits, -10)
  })

  test('malformed statement success cannot partially mutate financial state', async ({ assert }) => {
    routes.set('patch /api/v1/statements/30', async () => ({ body: { id: 30, credits: 200 } }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.equal(f.statement.credits, 0); assert.equal(f.statement.endingBalance, 90)
  })

  test('malformed transaction success cannot partially mutate financial state', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(), date: 'invalid' }, categories: [{ id: 20, balance: '-75.00' }], acctBalances: [{ id: 10, balance: '25.00' }] } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amount: -75 }))
    assert.equal(cached.account.amount, -10); assert.equal(cached.category.amount, -10)
    assert.equal(f.account.balance, 90); assert.equal(f.category.balance, -10)
  })

  test('HTTP-rejected transfer creation cannot apply a success-shaped body', async ({ assert }) => {
    routes.set('post /api/v1/category-transfer', async () => ({ ok: false, body: { data: { transaction: f.transactionProps(), balances: [{ id: 20, balance: '-75.00' }] } } }))
    await assert.rejects(() => f.store.register.addCategoryTransfer({ date: '2025-02-10', categories: [] }, state.TransactionType.FUNDING_TRANSACTION))
    assert.equal(f.category.balance, 0); assert.lengthOf(f.category.transactions.transactions, 0)
  })

  test('same-budget category movement preserves identity and changes computed group balances', async ({ assert }) => {
    const destination = new state.Group({ id: 2, name: 'Destination', type: state.GroupType.Regular, parentGroupId: -1 }, f.store)
    state.runInAction(() => { f.category.balance = 12.25; f.store.categoryTree.budget.insertChild(destination) })
    routes.set('patch /api/v1/groups/2/categories/20', async () => ({ body: { data: { id: 20, name: f.category.name, type: f.category.type, suspended: false, fundingAmount: '0.00', includeFundingTransfers: true, recurrence: 1, goalDate: null, fundingCategories: [], hidden: false } } }))
    await f.category.update({ group: destination, name: f.category.name, fundingCategories: [] })
    assert.strictEqual(destination.children[0], f.category)
    assert.strictEqual(f.category.group, destination)
    assert.equal(destination.childrenBalance(), 12.25)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 12.25)
  })

  test('combined statement date change and reconciliation uses server-returned membership', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, startDate: '2025-01-01', debits: '-10.00' } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, 30)], balance: '0.00' } } }))
    await f.statement.update({ startDate: '2025-01-01', reconcile: 'All' })
    assert.equal(f.statement.startDate.toISODate(), '2025-01-01')
    assert.equal(cached.category.statementId, 30)
  })

  test('date-only statement edit preserves existing assignment semantics', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, startDate: '2025-02-15', debits: '-10.00' } }))
    await f.statement.update({ startDate: '2025-02-15' })
    assert.equal(cached.account.statementId, 30); assert.equal(cached.category.statementId, 30)
    assert.lengthOf(calls, 1)
  })

  test('malformed authoritative accounts refresh is an error after a successful statement mutation', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: '75.00' } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.equal(f.statement.endingBalance, 75); assert.equal(f.account.balance, 90)
  })

  test('statement date editing reorders the shared history used for latest-statement display', async ({ assert }) => {
    const newer = new state.Statement({ ...f.statementProps, id: 31, startDate: '2025-03-01', endDate: '2025-03-31', endingBalance: '120.00' }, f.account.statements)
    state.runInAction(() => { f.account.statements.statements = [newer, f.statement]; f.account.tracking = state.TrackingType.Balances; f.account.balance = 120 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endDate: '2025-04-30' } }))
    accountsResponse(90)
    await f.statement.update({ endDate: '2025-04-30' })
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.equal(f.account.balance, 90)
  })

  test('statement creation on balance-tracked account refreshes authoritative account', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('post /api/v1/account/10/statements', async () => ({ body: { ...f.statementProps, id: 31, startDate: '2025-03-01', endDate: '2025-03-31', endingBalance: '75.00', transactions: [] } }))
    accountsResponse(75)
    await f.account.statements.addStatement('2025-03-01', '2025-03-31', 90, 75, 0, 0, 0, 0)
    assert.equal(f.account.balance, 75)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('malformed statement creation does not partially insert a financial record', async ({ assert }) => {
    routes.set('post /api/v1/account/10/statements', async () => ({ body: { ...f.statementProps, id: 31 } }))
    transactions()
    await assert.rejects(() => f.account.statements.addStatement('2025-02-01', '2025-02-28', 100, 90, 0, 0, 0, 0))
    assert.lengthOf(f.account.statements.statements, 1)
    assert.strictEqual(f.store.uiState.selectedStatement, f.statement)
  })

  test('transfer deletion applies authoritative reversal to both cached categories').with([12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: (-amount).toFixed(2) }, { categoryId: 21, amount: amount.toFixed(2) }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([props])
      f.category.balance = -amount; f.other.balance = amount
    })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: '0.00' }, { id: 21, balance: '0.00' }], acctBalances: [] } } }))
    await f.category.transactions.transactions[0].delete()
    assert.lengthOf(f.category.transactions.transactions, 0); assert.lengthOf(f.other.transactions.transactions, 0)
    assert.equal(f.category.balance, 0); assert.equal(f.other.balance, 0)
  })

  test('malformed deletion success does not partially apply returned financial balances', async ({ assert }) => {
    const cached = transactions()
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: '0.00' }] } } }))
    await assert.rejects(() => cached.account.delete())
    assert.equal(f.category.balance, -10); assert.equal(f.account.balance, 90)
    assert.lengthOf(f.category.transactions.transactions, 1); assert.lengthOf(f.account.transactions.transactions, 1)
  })

  test('transaction edits update the loaded search cache as well as account/category copies', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.searcher.transactions.setTransactions([f.transactionProps()]) })
    const search = f.store.searcher.transactions.transactions[0]
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(-12.25), version: 1 }, categories: [{ id: 20, balance: '-12.25' }], acctBalances: [{ id: 10, balance: '87.75' }] } } }))
    await cached.account.updateTransaction({ amount: -12.25 })
    assert.equal(search.amount, -12.25); assert.equal(search.version, 1)
    assert.strictEqual(f.store.searcher.transactions.transactions[0], search)
  })

  test('reconciliation rejects incomplete or duplicate batch responses before applying membership').with(['missing', 'duplicate']).run(async ({ assert }, failure) => {
    const cached = transactions()
    state.runInAction(() => { f.account.transactions.appendTransactions([{ ...f.transactionProps(), id: 41 }]) })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: '-20.00' } }))
    const returned = f.transactionProps(-10, 30)
    routes.set('get /api/v1/transactions?t=40&t=41', async () => ({ body: { data: { transactions: failure === 'missing' ? [returned] : [returned, returned], balance: '0.00' } } }))
    await assert.rejects(() => f.statement.update({ reconcile: 'All' }))
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.account.transactions.transactions[1].statementId, null)
  })
  test('funding calculation reaches real State/cache boundaries unchanged').with([false, true]).run(async ({ assert }, rejected) => {
    const rows = calculateFunding({ 21: { baseAmount: 2, includeFundingTransfers: false,
      fundingCategories: [{ categoryId: 20, amount: 100, percentage: true }] } }, 20)
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION,
      accountTransaction: undefined, categories: rows.map(row => ({ ...row, amount: row.amount.toFixed(2),
        ...(row.baseAmount == null ? {} : { baseAmount: row.baseAmount.toFixed(2) }),
        ...(row.fundingCategories == null ? {} : { fundingCategories: row.fundingCategories.map(rule => ({ ...rule, amount: rule.percentage ? rule.amount : rule.amount.toFixed(2) })) }),
      })) }
    routes.set('post /api/v1/category-transfer', async (payload) => {
      assert.deepEqual(payload.categories, rows)
      return rejected ? { ok: false, body: {} }
        : { body: { data: { transaction: props, balances: [{ id: 20, balance: '-2.00' }, { id: 21, balance: '2.00' }] } } }
    })
    const submit = () => f.store.register.addCategoryTransfer({ date: '2025-03-01', categories: rows }, props.type)
    if (rejected) {
      await assert.rejects(submit)
      assert.equal(f.category.balance, 0)
      assert.equal(f.other.balance, 0)
      assert.lengthOf(f.category.transactions.transactions, 0)
    } else {
      await submit()
      assert.equal(f.category.balance, -2)
      assert.equal(f.other.balance, 2)
      assert.deepEqual(f.category.transactions.transactions[0].categories, rows.map((row, id) => ({
        id, comment: undefined, funder: row.funder, ...row,
      })))
    }
  })

  test('rejected funding/rebalance replacement preserves every cached financial value').with([2, 3]).run(async ({ assert }, type) => {
    const props = { ...f.transactionProps(), type, accountTransaction: undefined,
      categories: [{ categoryId: 20, amount: '-2.00' }, { categoryId: 21, amount: '2.00' }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([props])
      f.category.balance = -2; f.other.balance = 2
    })
    const cached = f.category.transactions.transactions[0]
    const before = { date: cached.date.toISODate(), categories: cached.categories.map((row) => ({ ...row })) }
    routes.set('patch /api/v1/category-transfer/40', async () => ({ ok: false, body: {
      errors: [{ status: '422', detail: 'Unsupported replacement target' }],
      data: { transaction: { ...props, date: '2025-04-01' }, balances: [{ id: 20, balance: '999.00' }] },
    } }))
    await assert.rejects(() => cached.updateCategoryTransfer({ date: '2025-04-01', categories: [] }))
    assert.equal(cached.date.toISODate(), before.date)
    assert.deepEqual(cached.categories, before.categories)
    assert.equal(f.category.balance, -2); assert.equal(f.other.balance, 2)
    assert.equal(f.other.transactions.transactions[0].date.toISODate(), before.date)
  })

  test('Category in-use rejection preserves cache; successful delete removes only its Category', async ({ assert }) => {
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
