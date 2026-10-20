import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { accountEligible, categoryEligible, categoryEffectDeltas } from '../../app/services/transactionEligibility.ts'
import { validateTransactionSplits } from '../../app/validation/transactionSplits.ts'

const boundary = DateTime.fromISO('2025-02-01')
const dates = ['2025-01-31', '2025-02-01', '2025-02-02']
async function method(file, name) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return ts.transpileModule(`(async function(${found.parameters.map((p) => p.getText(ast)).join(',')}) ${found.body.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
}

// Run the actual controller with inert transaction-bound persistence adapters.
async function patchFixture({ date = dates[1], pending = false, amount = 10, splits } = {}) {
  const events = []
  const trx = { async commit() { events.push('commit') }, async rollback() { events.push('rollback') } }
  const categories = new Map([1, 2, 3].map((id) => [id, { id, balance: 0,
    async save() { events.push(['category', id, this.balance]) }, async transactionsCount() { return 1 } }]))
  const eligible = date >= dates[1]
  const account = { id: 1, type: 'Depository', tracking: 'Transactions', startDate: boundary,
    balance: 100 + (eligible && !pending ? amount : 0), async save() { events.push(['account', this.balance]) } }
  const link = { amount, pending, name: 'Original', statementId: null, $attributes: {},
    merge(data) { Object.assign(this, data); return this }, async save() { events.push('link') },
    related() { return { query: () => query(account) } } }
  const transaction = { id: 1, budgetId: 1, version: 0, type: 5, deleted: false,
    date: DateTime.fromISO(date), categories: splits ?? [{ categoryId: 1, amount }], $attributes: {},
    merge(data) { Object.assign(this, data); return this }, async save() { events.push('transaction') },
    async load() { /* Response preloads have no persistence effect in this adapter. */ }, serialize() { return this }, related(name) {
      return name === 'accountTransaction' ? { query: () => query(link) }
        : { async create() { events.push('log') } }
    } }
  if (eligible) for (const split of transaction.categories) categories.get(split.categoryId).balance += split.amount
  function query(row) {
    return { where() { return this }, andWhere() { return this }, whereHas() { return this },
      forUpdate() { events.push('gate'); return this }, async firstOrFail() { return row } }
  }
  const budget = { id: 1, async getUnassignedCategory(options) {
    if (options.client !== trx) throw new Error('Unbound category read')
    return categories.get(3)
  } }
  const user = { username: 'Test', useTransaction() { /* The query adapters independently assert the owning transaction. */ }, related() { return { query: () => query(budget) } } }
  const globals = { hasCategoryStorage: () => false, excludeCategoryStorage: () => undefined, CategoryType: { Loan: 'Loan' }, validateStoredCategoryConservation: async () => undefined, accountEligible, categoryEligible, categoryEffectDeltas,
    AccountType: { Loan: 'Loan' }, TrackingType: { Transactions: 'Transactions', Balances: 'Balances' },
    TransactionType: { MANUAL_TRANSACTION: 5, REGULAR_TRANSACTION: 0 },
    Transaction: { query(options) { if (options.client !== trx) throw new Error('Unbound transaction'); return query(transaction) } },
    budgetCategories(_id, options) {
      if (options.client !== trx) throw new Error('Unbound category')
      return { ...query(), where(_field, id) { return query(categories.get(id)) } }
    },
    validateTransactionSplits, updateTransaction: {}, transactionFields: {},
    getChanges: (_old, _next, changes) => changes, db: { transaction: async () => trx },
  }
  const update = runInNewContext(await method('app/Controllers/Http/TransactionsController.ts', 'update'), globals)
  return { account, categories, link, transaction, events, async run(payload) {
    return update({ auth: { user }, request: { params: () => ({ trxId: 1 }),
      validateUsing: async () => ({ version: transaction.version, ...payload }) }, logger: { error() { /* The caller captures errors from the production method. */ } } })
  } }
}

test.group('Ordinary eligibility and real PATCH effects without DB', () => {
  for (const date of dates) for (const pending of [false, true]) for (const deleted of [false, true]) {
    test(`${date} pending=${pending} deleted=${deleted}`, ({ assert }) => {
      const state = { date: DateTime.fromISO(date), pending, deleted }
      assert.equal(accountEligible(state, boundary), !deleted && !pending && date >= dates[1])
      assert.equal(categoryEligible(state, boundary), !deleted && date >= dates[1])
    })
  }
  test('duplicate allocations aggregate; identical decimal allocations have zero replay delta', ({ assert }) => {
    const splits = [{ categoryId: 1, amount: 0.1 }, { categoryId: 1, amount: 0.2 }]
    assert.equal(categoryEffectDeltas(splits, splits, true, true).get(1), 0)
    assert.equal(categoryEffectDeltas(splits, [], true, false).get(1), -(0.1 + 0.2))
  })
  for (const pending of [false, true]) for (const amount of [-10, 0, 10]) {
    test(`actual PATCH roundtrip dates pending=${pending} amount=${amount}`, async ({ assert }) => {
      const f = await patchFixture({ date: dates[0], pending, amount })
      for (const date of [dates[1], dates[2], dates[0]]) {
        await f.run({ date: DateTime.fromISO(date) })
        const eligible = date >= dates[1]
        assert.equal(f.account.balance, 100 + (eligible && !pending ? amount : 0))
        assert.equal(f.categories.get(1).balance, eligible ? amount : 0)
      }
      assert.equal(f.link.amount, amount)
      assert.equal(f.events.filter((event) => event === 'log').length, 3)
      assert.equal(f.events[0], 'gate')
    })
  }
  test('actual PATCH amount/categories/date uses final old/new effects and preserves duplicate nominal splits', async ({ assert }) => {
    const f = await patchFixture()
    const categories = [{ categoryId: 2, amount: 7 }, { categoryId: 2, amount: 13 }]
    await f.run({ amount: 20, categories, date: DateTime.fromISO(dates[0]) })
    assert.equal(f.account.balance, 100)
    assert.equal(f.categories.get(1).balance, 0)
    assert.equal(f.categories.get(2).balance, 0)
    assert.deepEqual(f.transaction.categories, categories)
    await f.run({ date: boundary })
    assert.equal(f.account.balance, 120)
    assert.equal(f.categories.get(2).balance, 20)
  })
  test('actual PATCH categories-only and metadata-only do not touch Account balance', async ({ assert }) => {
    const f = await patchFixture()
    await f.run({ categories: [{ categoryId: 2, amount: 10 }] })
    assert.equal(f.categories.get(1).balance, 0)
    assert.equal(f.categories.get(2).balance, 10)
    await f.run({ name: 'Renamed', comment: 'Only metadata', statementId: null })
    assert.equal(f.account.balance, 110)
    assert.isFalse(f.events.some((event) => Array.isArray(event) && event[0] === 'account'))
  })
  test('actual PATCH amount-only preserves current split-validation rejection', async ({ assert }) => {
    const f = await patchFixture()
    await assert.rejects(() => f.run({ amount: 20 }), 'The sum of the categories does not match the transaction amount.')
    assert.equal(f.account.balance, 110)
    assert.equal(f.categories.get(1).balance, 10)
    assert.include(f.events, 'rollback')
  })
  test('actual pending amount replacement changes only eligible Category effects', async ({ assert }) => {
    const f = await patchFixture({ pending: true })
    await f.run({ amount: 20, categories: [{ categoryId: 1, amount: 20 }] })
    assert.equal(f.account.balance, 100)
    assert.equal(f.categories.get(1).balance, 20)
  })
  test('actual PATCH ineligible amount and allocations persist without financial effects', async ({ assert }) => {
    const f = await patchFixture({ date: dates[0] })
    await f.run({ amount: -20, categories: [{ categoryId: 2, amount: -20 }] })
    assert.equal(f.account.balance, 100)
    assert.equal(f.categories.get(1).balance, 0)
    assert.equal(f.categories.get(2).balance, 0)
    assert.equal(f.link.amount, -20)
  })
  test('startDate/opening source boundaries preserve accountless and opening separation', async ({ assert }) => {
    const accounts = await readFile('app/Controllers/Http/AccountsController.ts', 'utf8')
    const model = await readFile('app/Models/Account.ts', 'utf8')
    assert.include(accounts, "whereIn('type', [TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION])")
    const opening = model.slice(model.indexOf('public async updateStartingBalance('))
    assert.include(opening, ".andWhere('type', '!=', TransactionType.STARTING_BALANCE)")
    assert.include(opening, ".andWhere('deleted', false)")
    assert.include(opening, ".where('pending', false)")
    assert.include(opening, 'this.balance - (sum?.$extras.sum ?? 0)')
    assert.include(opening, 'date: this.startDate')
    assert.notInclude(opening, 'this.balance =')
  })
})

test.group('Real manual CREATE before/equal/after boundary without DB', () => {
  for (const date of dates) for (const amount of [-10, 0, 10]) {
    test(`${date} signed amount ${amount}`, async ({ assert }) => {
      const events = []
      const trx = { async commit() { events.push('commit') }, async rollback() { events.push('rollback') } }
      const category = { id: 1, balance: 20, async save() { events.push('category') } }
      let persisted
      const account = { id: 1, startDate: boundary, tracking: 'Transactions', type: 'Depository', balance: 100,
        async save() { events.push('account save') }, related() { return { async create(values) { return { ...values, pending: false } } } } }
      const budget = { id: 1, async getUnassignedCategory({ client }) { assert.strictEqual(client, trx); return category } }
      function query(row) { return { where() { return this }, whereHas() { return this },
        forUpdate() { events.push('gate'); return this }, async firstOrFail() { return row } } }
      class Transaction {
        useTransaction() { return this }
        fill(data) { Object.assign(this, data); this.deleted = false; return this }
        related() { return { associate: async () => { persisted = Object.assign({}, this) } } }
        async load() { /* Response preloads have no persistence effect in this adapter. */ }
        serialize() { return this }
      }
      const user = { budgetId: 1, useTransaction() { /* The query adapters independently assert the owning transaction. */ }, related() { return { query: () => query(budget) } } }
      const create = runInNewContext(await method('app/Controllers/Http/AccountsController.ts', 'addTransaction'), {
        requestCategoryStorage: (model) => model, excludeCategoryStorage: () => undefined, CategoryType: { Loan: 'Loan' }, validateStoredCategoryConservation: async () => undefined,
        accountEligible, categoryEligible, Transaction, AccountType: { Loan: 'Loan' },
        TrackingType: { Transactions: 'Transactions', Balances: 'Balances' }, TransactionType: { MANUAL_TRANSACTION: 5 },
        Category: { query({ client }) { assert.strictEqual(client, trx); return query(category) } },
        budgetAccounts(_id, { client }) { assert.strictEqual(client, trx); events.push('account read'); return query(account) },
        validateTransactionSplits, addTransaction: {}, transactionFields: {}, db: { transaction: async () => trx },
      })
      await create({ auth: { user }, request: { params: () => ({ acctId: 1 }), validateUsing: async () => ({
        date: DateTime.fromISO(date), amount, name: 'Manual', categories: [{ categoryId: 1, amount }],
      }) }, logger: { error() { /* The caller captures errors from the production method. */ } } })
      assert.equal(account.balance, 100 + (date >= dates[1] ? amount : 0))
      assert.equal(category.balance, 20 + (date >= dates[1] ? amount : 0))
      assert.equal(persisted.categories[0].amount, amount)
      assert.equal(persisted.date.toISODate(), date)
      assert.equal(events[0], 'gate')
      if (date < dates[1]) assert.notInclude(events, 'category')
      assert.equal(events.at(-1), 'commit')
    })
  }
})
