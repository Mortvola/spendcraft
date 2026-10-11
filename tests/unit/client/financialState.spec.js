import { test } from '@japa/runner'
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
export { store } from ${source('client-src/State/Store.ts')};
export { default as Http } from '@mortvola/http';
export { default as Institution } from ${source('client-src/State/Institution.ts')};
export { default as Category } from ${source('client-src/State/Category.ts')};
export { default as Group } from ${source('client-src/State/Group.ts')};
export { default as Transaction } from ${source('client-src/State/Transaction.ts')};
export { default as Statement } from ${source('client-src/State/Statement.ts')};
export { default as Balance } from ${source('client-src/State/Balance.ts')};
export { runInAction } from 'mobx';
export * from ${source('common/ResponseTypes.ts')};
`)
    await build({ configFile: false, logLevel: 'error', plugins: [babel({ plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]] })], resolve: { alias: { '@mortvola/http': resolve('node_modules/@mortvola/http/dist/index.js'), mobx: resolve('node_modules/mobx/dist/mobx.esm.js') } }, build: { target: 'esnext', minify: false, outDir: join(directory, 'out'), lib: { entry, formats: ['es'], fileName: () => 'state.mjs' } } })
    state = await import(pathToFileURL(join(directory, 'out/state.mjs')).href)
  })
  group.teardown(async () => {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  let f
  let routes
  let calls
  let originals
  group.each.setup(() => {
    const store = new state.store.constructor()
    const accountProps = { id: 10, plaidId: null, name: 'Checking', closed: false, type: state.AccountType.Depository, subtype: 'checking', tracking: state.TrackingType.Transactions, balance: 100, pendingBalance: 0, plaidBalance: null, startDate: '2025-01-01', rate: 0 }
    const institutionProps = { id: 1, plaidInstitutionId: null, name: 'Offline bank', syncDate: null, accounts: [accountProps] }
    const institution = new state.Institution(store, institutionProps)
    const account = institution.accounts[0]
    const props = (id) => ({ id, groupId: -1, name: `Category ${id}`, type: state.CategoryType.Regular, balance: 0, fundingAmount: 0, fundingCategories: [], includeFundingTransfers: true, goalDate: null, useGoal: false, recurrence: 1, suspended: false, hidden: false })
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
    const statementProps = { id: 30, startDate: '2025-02-01', endDate: '2025-02-28', startingBalance: 100, endingBalance: 90, credits: 0, debits: 0, data: {} }
    const statement = new state.Statement(statementProps, account.statements)
    state.runInAction(() => { account.statements.statements = [statement]; store.uiState.selectedStatement = statement })
    const transactionProps = (amount = -10, statementId = null) => ({ id: 40, date: '2025-02-10', type: state.TransactionType.MANUAL_TRANSACTION, sortOrder: 0, comment: '', version: 0, duplicateOfTransactionId: null, categories: [{ categoryId: 20, amount }], taxes: [], accountTransaction: { name: 'Purchase', amount, principle: null, statementId, pending: false, accountOwner: null, paymentChannel: null, location: null, account: { id: 10, name: 'Checking', institution: { name: 'Offline bank' } } } })
    routes = new Map(); calls = []
    originals = new Map(['get', 'post', 'put', 'patch', 'delete'].map((method) => [method, state.Http[method]]))
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

  function transactions(props = f.transactionProps()) {
    state.runInAction(() => {
      f.account.transactions.setTransactions([props])
      f.category.transactions.setTransactions([props])
      f.account.balance = 90; f.category.balance = -10
    })
    return { account: f.account.transactions.transactions[0], category: f.category.transactions.transactions[0] }
  }

  test('transaction edit applies returned statement totals', async ({ assert }) => {
    const trx = transactions().account
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f.transactionProps(-10, 30), categories: [{ id: 20, balance: -10 }], acctBalances: [{ id: 10, balance: 90 }], statement: { ...f.statementProps, debits: -10 } } } }))
    await trx.updateTransaction({ statementId: 30 })
    assert.equal(trx.statementId, 30)
    assert.equal(f.statement.debits, -10)
  })

  test('amount edits keep separately loaded account and category transaction caches consistent').with([-12.25, -5.75]).run(async ({ assert }, amount) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(amount), version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: amount }], acctBalances: [{ id: 10, balance: 100 + amount }] } } }))
    await cached.account.updateTransaction({ amount })
    assert.equal(f.account.balance, 100 + amount); assert.equal(f.category.balance, amount)
    assert.equal(cached.account.amount, amount)
    assert.equal(cached.category.amount, amount)
    assert.equal(cached.category.version, 1)
  })

  test('statement editing refreshes authoritative current balance for balance-tracked accounts', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: 75 } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances, balance: 75 }] }] } }))
    await f.statement.update({ endingBalance: 75 })
    assert.equal(f.statement.endingBalance, 75)
    assert.equal(f.account.balance, 75)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('bulk reconciliation refreshes loaded transaction statement membership', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: -10 } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, 30)], balance: 0 } } }))
    await f.statement.update({ reconcile: 'All' })
    assert.equal(cached.account.statementId, 30)
    assert.equal(cached.category.statementId, 30)
  })

  test('split edits remove stale membership from inactive category lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    const returned = { ...f.transactionProps(), version: 1, categories: [{ categoryId: 21, amount: -10 }] }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: 0 }, { id: 21, balance: -10 }], acctBalances: [{ id: 10, balance: 90 }] } } }))
    await cached.account.updateTransaction({ categories: returned.categories })
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.category.balance, 0); assert.equal(f.other.balance, -10)
    assert.equal(cached.account.categories[0].categoryId, 21)
  })

  test('date edits update and reorder both cached copies', async ({ assert }) => {
    const cached = transactions()
    const returned = { ...f.transactionProps(), date: '2025-02-20', version: 1 }
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: returned, categories: [{ id: 20, balance: -10 }], acctBalances: [{ id: 10, balance: 90 }] } } }))
    await cached.account.updateTransaction({ date: returned.date })
    assert.equal(cached.category.date.toISODate(), returned.date)
    assert.strictEqual(f.category.transactions.transactions[0], cached.category)
    assert.strictEqual(f.account.transactions.transactions[0], cached.account)
  })

  test('deletion removes copies from inactive transaction lists', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.uiState.selectedCategory = f.other })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: 0 }], acctBalances: [{ id: 10, balance: 100 }] } } }))
    await cached.account.delete()
    assert.lengthOf(f.account.transactions.transactions, 0)
    assert.lengthOf(f.category.transactions.transactions, 0)
    assert.equal(f.account.balance, 100); assert.equal(f.category.balance, 0)
  })

  test('transfer editing updates date/version and every loaded copy').with([12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: -amount }, { categoryId: 21, amount }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([props])
      f.category.balance = -amount; f.other.balance = amount
    })
    const cached = { source: f.category.transactions.transactions[0], destination: f.other.transactions.transactions[0] }
    const returned = { ...props, date: '2025-02-20', version: 2 }
    routes.set('patch /api/v1/category-transfer/40', async () => ({ body: { data: { transaction: returned, balances: [{ id: 20, balance: -amount }, { id: 21, balance: amount }] } } }))
    await cached.source.updateCategoryTransfer({ date: returned.date, categories: returned.categories })
    assert.equal(cached.source.date.toISODate(), returned.date)
    assert.equal(cached.destination.version, 2)
    assert.equal(f.category.balance, -amount); assert.equal(f.other.balance, amount)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 0)
  })

  test('successful transfer creation applies authoritative source/destination balances').with([12.25, -12.25]).run(async ({ assert }, amount) => {
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: -amount }, { categoryId: 21, amount }] }
    routes.set('post /api/v1/category-transfer', async () => ({ body: { data: { transaction: props, balances: [{ id: 20, balance: -amount }, { id: 21, balance: amount }] } } }))
    await f.store.register.addCategoryTransfer({ date: props.date, categories: props.categories }, props.type)
    assert.equal(f.category.balance, -amount); assert.equal(f.other.balance, amount)
    assert.equal(f.category.transactions.transactions[0].id, 40)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 0)
  })

  test('account creation applies returned balances and inserts transaction', async ({ assert }) => {
    routes.set('post /api/v1/account/10/transactions', async () => ({ body: { transaction: f.transactionProps(), categories: [{ id: 20, balance: -10 }], acctBalances: [{ id: 10, balance: 90 }] } }))
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

  test('statement deletion removes selected statement without inventing unsupported server effects', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('delete /api/v1/statements/30', async () => ({ body: {} }))
    await f.statement.delete()
    // The current DELETE endpoint does not clear assignments or recompute balances.
    assert.equal(cached.account.statementId, 30); assert.equal(cached.category.statementId, 30)
    assert.lengthOf(f.account.statements.statements, 0)
    assert.equal(f.account.balance, 90)
    assert.equal(f.store.uiState.selectedStatement, null)
  })

  function accountsResponse(balance) {
    routes.set('get /api/v1/connected-accounts', async () => ({ body: { data: [{ ...f.institutionProps, accounts: [{ ...f.accountProps, tracking: state.TrackingType.Balances, balance }] }] } }))
  }

  test('balance-history edits preserve shared account identity and use server current balance').with([{ previous: '2025-02-20', next: '2025-02-20', otherBalance: 100, initial: 100, current: 75 }, { previous: '2025-02-20', next: '2025-02-10', otherBalance: 100, initial: 100, current: 100 }, { previous: '2025-02-10', next: '2025-02-20', otherBalance: 125, initial: 125, current: 75 }]).run(async ({ assert }, scenario) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.store.balances.account = f.account })
    const row = new state.Balance(f.store.balances, { id: 50, date: scenario.previous, balance: 100 })
    const other = new state.Balance(f.store.balances, { id: 51, date: '2025-02-15', balance: scenario.otherBalance })
    state.runInAction(() => { f.store.balances.balances = [row, other]; f.account.balance = scenario.initial })
    routes.set('patch /api/v1/account/10/balances/50', async () => ({ body: { data: { id: 50, date: scenario.next, balance: 75 } } }))
    accountsResponse(scenario.current)
    await row.update({ date: scenario.next, amount: 75 })
    assert.equal(f.account.balance, scenario.current)
    assert.strictEqual(f.store.accounts.findAccount(10), f.account)
  })

  test('balance-history final deletion uses authoritative zero', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.store.balances.account = f.account })
    const row = new state.Balance(f.store.balances, { id: 50, date: '2025-02-10', balance: 100 })
    state.runInAction(() => { f.store.balances.balances = [row] })
    routes.set('delete /api/v1/balance/50', async () => ({ body: {} }))
    accountsResponse(0)
    await row.delete()
    assert.equal(f.account.balance, 0); assert.lengthOf(f.store.balances.balances, 0)
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
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: 75 } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ ok: false, body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.equal(f.statement.endingBalance, 75); assert.equal(f.account.balance, 90)
  })

  test('statement refresh preserves selected shared statement identity', async ({ assert }) => {
    routes.set('get /api/v1/account/10/statements', async () => ({ body: [{ ...f.statementProps, debits: -25 }] }))
    await f.account.statements.load()
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.strictEqual(f.store.uiState.selectedStatement, f.statement)
    assert.equal(f.statement.debits, -25)
  })

  test('amount edit on an assigned transaction refreshes missing statement totals', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(-12.25, 30), version: 1 }, categories: [{ id: 20, balance: -12.25 }], acctBalances: [{ id: 10, balance: 87.75 }] } } }))
    routes.set('get /api/v1/account/10/statements', async () => ({ body: [{ ...f.statementProps, debits: -12.25 }] }))
    await cached.account.updateTransaction({ amount: -12.25 })
    assert.equal(f.statement.debits, -12.25)
    assert.equal(cached.category.amount, -12.25)
  })

  test('clearing assignment applies returned statement totals to all loaded copies', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: f.transactionProps(-10, null), categories: [{ id: 20, balance: -10 }], acctBalances: [{ id: 10, balance: 90 }], statement: { ...f.statementProps, debits: 0 } } } }))
    await cached.account.updateTransaction({ statementId: null })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.statement.debits, 0)
  })

  test('bulk reconciliation None uses authoritative membership', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: 0 } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, null)], balance: 0 } } }))
    await f.statement.update({ reconcile: 'None' })
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
  })

  test('reconciliation refresh rejection propagates and leaves cached membership intact', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: -10 } }))
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
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(), date: 'invalid' }, categories: [{ id: 20, balance: -75 }], acctBalances: [{ id: 10, balance: 25 }] } } }))
    await assert.rejects(() => cached.account.updateTransaction({ amount: -75 }))
    assert.equal(cached.account.amount, -10); assert.equal(cached.category.amount, -10)
    assert.equal(f.account.balance, 90); assert.equal(f.category.balance, -10)
  })

  test('HTTP-rejected transfer creation cannot apply a success-shaped body', async ({ assert }) => {
    routes.set('post /api/v1/category-transfer', async () => ({ ok: false, body: { data: { transaction: f.transactionProps(), balances: [{ id: 20, balance: -75 }] } } }))
    await assert.rejects(() => f.store.register.addCategoryTransfer({ date: '2025-02-10', categories: [] }, state.TransactionType.FUNDING_TRANSACTION))
    assert.equal(f.category.balance, 0); assert.lengthOf(f.category.transactions.transactions, 0)
  })

  test('balance-history creation applies authoritative current balance', async ({ assert }) => {
    state.runInAction(() => { f.store.balances.account = f.account; f.account.tracking = state.TrackingType.Balances; f.account.balance = 100 })
    routes.set('post /api/v1/account/10/balances', async () => ({ body: { data: { id: 50, date: '2025-02-10', balance: 75, accountBalance: 100 } } }))
    await f.store.balances.addBalance({ date: '2025-02-10', amount: 75 })
    assert.equal(f.account.balance, 100)
    assert.equal(f.store.balances.balances[0].balance, 75)
  })

  test('same-budget category movement preserves identity and changes computed group balances', async ({ assert }) => {
    const destination = new state.Group({ id: 2, name: 'Destination', type: state.GroupType.Regular, parentGroupId: -1 }, f.store)
    state.runInAction(() => { f.category.balance = 12.25; f.store.categoryTree.budget.insertChild(destination) })
    routes.set('patch /api/v1/groups/2/categories/20', async () => ({ body: { data: { id: 20, name: f.category.name, type: f.category.type, suspended: false, fundingAmount: 0, includeFundingTransfers: true, recurrence: 1, goalDate: null, fundingCategories: [], hidden: false } } }))
    await f.category.update({ group: destination, name: f.category.name, fundingCategories: [] })
    assert.strictEqual(destination.children[0], f.category)
    assert.strictEqual(f.category.group, destination)
    assert.equal(destination.childrenBalance(), 12.25)
    assert.equal(f.store.categoryTree.budget.childrenBalance(), 12.25)
  })

  test('combined statement date change and reconciliation uses server-returned membership', async ({ assert }) => {
    const cached = transactions()
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, startDate: '2025-01-01', debits: -10 } }))
    routes.set('get /api/v1/transactions?t=40', async () => ({ body: { data: { transactions: [f.transactionProps(-10, 30)], balance: 0 } } }))
    await f.statement.update({ startDate: '2025-01-01', reconcile: 'All' })
    assert.equal(f.statement.startDate.toISODate(), '2025-01-01')
    assert.equal(cached.category.statementId, 30)
  })

  test('date-only statement edit preserves existing assignment semantics', async ({ assert }) => {
    const cached = transactions(f.transactionProps(-10, 30))
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, startDate: '2025-02-15', debits: -10 } }))
    await f.statement.update({ startDate: '2025-02-15' })
    assert.equal(cached.account.statementId, 30); assert.equal(cached.category.statementId, 30)
    assert.lengthOf(calls, 1)
  })

  test('malformed authoritative accounts refresh is an error after a successful statement mutation', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endingBalance: 75 } }))
    routes.set('get /api/v1/connected-accounts', async () => ({ body: {} }))
    await assert.rejects(() => f.statement.update({ endingBalance: 75 }))
    assert.equal(f.statement.endingBalance, 75); assert.equal(f.account.balance, 90)
  })

  test('statement date editing reorders the shared history used for latest-statement display', async ({ assert }) => {
    const newer = new state.Statement({ ...f.statementProps, id: 31, startDate: '2025-03-01', endDate: '2025-03-31', endingBalance: 120 }, f.account.statements)
    state.runInAction(() => { f.account.statements.statements = [newer, f.statement]; f.account.tracking = state.TrackingType.Balances; f.account.balance = 120 })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, endDate: '2025-04-30' } }))
    accountsResponse(90)
    await f.statement.update({ endDate: '2025-04-30' })
    assert.strictEqual(f.account.statements.statements[0], f.statement)
    assert.equal(f.account.balance, 90)
  })

  test('statement creation on balance-tracked account refreshes authoritative account', async ({ assert }) => {
    state.runInAction(() => { f.account.tracking = state.TrackingType.Balances; f.account.balance = 90 })
    routes.set('post /api/v1/account/10/statements', async () => ({ body: { ...f.statementProps, id: 31, startDate: '2025-03-01', endDate: '2025-03-31', endingBalance: 75, transactions: [] } }))
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
    const props = { ...f.transactionProps(), type: state.TransactionType.FUNDING_TRANSACTION, accountTransaction: undefined, categories: [{ categoryId: 20, amount: -amount }, { categoryId: 21, amount }] }
    state.runInAction(() => {
      f.category.transactions.setTransactions([props]); f.other.transactions.setTransactions([props])
      f.category.balance = -amount; f.other.balance = amount
    })
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: 0 }, { id: 21, balance: 0 }], acctBalances: [] } } }))
    await f.category.transactions.transactions[0].delete()
    assert.lengthOf(f.category.transactions.transactions, 0); assert.lengthOf(f.other.transactions.transactions, 0)
    assert.equal(f.category.balance, 0); assert.equal(f.other.balance, 0)
  })

  test('malformed deletion success does not partially apply returned financial balances', async ({ assert }) => {
    const cached = transactions()
    routes.set('delete /api/v1/transaction/40', async () => ({ body: { data: { categories: [{ id: 20, balance: 0 }] } } }))
    await assert.rejects(() => cached.account.delete())
    assert.equal(f.category.balance, -10); assert.equal(f.account.balance, 90)
    assert.lengthOf(f.category.transactions.transactions, 1); assert.lengthOf(f.account.transactions.transactions, 1)
  })

  test('transaction edits update the loaded search cache as well as account/category copies', async ({ assert }) => {
    const cached = transactions()
    state.runInAction(() => { f.store.searcher.transactions.setTransactions([f.transactionProps()]) })
    const search = f.store.searcher.transactions.transactions[0]
    routes.set('patch /api/v1/transaction/40', async () => ({ body: { data: { transaction: { ...f.transactionProps(-12.25), version: 1 }, categories: [{ id: 20, balance: -12.25 }], acctBalances: [{ id: 10, balance: 87.75 }] } } }))
    await cached.account.updateTransaction({ amount: -12.25 })
    assert.equal(search.amount, -12.25); assert.equal(search.version, 1)
    assert.strictEqual(f.store.searcher.transactions.transactions[0], search)
  })

  test('reconciliation rejects incomplete or duplicate batch responses before applying membership').with(['missing', 'duplicate']).run(async ({ assert }, failure) => {
    const cached = transactions()
    state.runInAction(() => { f.account.transactions.appendTransactions([{ ...f.transactionProps(), id: 41 }]) })
    routes.set('patch /api/v1/statements/30', async () => ({ body: { ...f.statementProps, debits: -20 } }))
    const returned = f.transactionProps(-10, 30)
    routes.set('get /api/v1/transactions?t=40&t=41', async () => ({ body: { data: { transactions: failure === 'missing' ? [returned] : [returned, returned], balance: 0 } } }))
    await assert.rejects(() => f.statement.update({ reconcile: 'All' }))
    assert.equal(cached.account.statementId, null); assert.equal(cached.category.statementId, null)
    assert.equal(f.account.transactions.transactions[1].statementId, null)
  })
})
