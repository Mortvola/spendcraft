import {
  addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, moneyCentsFromInteger,
} from
  '../../common/moneyCents.ts'
import { encodeMonetaryAmount } from '../../app/Services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import ts from 'typescript'
import { runInNewContext } from 'node:vm'

// Inert behavioral tests: no application, ORM or DB bootstrap.
async function method(file, name) {
  const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!found?.body) throw new Error(`Missing method ${file}:${name}`)
  return { body: found.body.getText(ast), parameters: found.parameters.map((parameter) =>
    parameter.getText(ast)).join(', ') }
}

const accounts = 'app/Controllers/Http/AccountsController.ts'
const transactions = 'app/Controllers/Http/TransactionsController.ts'



test.group('Budget-gated controller behavior without a database', () => {
  test('waiting mutation cannot reach financial reads before its gate')
    .with([{ file: accounts, name: 'addTransaction' }, { file: transactions, name: 'delete' }])
    .run(async ({ assert }, scenario) => {
      const source = await method(scenario.file, scenario.name)
      let release
      const gate = new Promise((resolve) => { release = resolve })
      let entered
      const waiting = new Promise((resolve) => { entered = resolve })
      let bound = false
      let financialReads = 0
      let rolledBack = false
      const stop = new Error('Stopped at transaction-bound financial read')
      const trx = { async rollback() { rolledBack = true } }
      const budget = { async getUnassignedCategory(options) {
        assert.strictEqual(options.client, trx)
        financialReads++
        throw stop
      } }
      const user = { useTransaction(value) { assert.strictEqual(value, trx); bound = true },
        related() { return { query: () => ({ forUpdate: () => ({ firstOrFail: async () => {
          assert.isTrue(bound)
          entered()
          await gate
          return budget
        } }) }) } },
      }
      const operation = runInNewContext(ts.transpileModule(`(async function(${source
        .parameters}) ${source.body})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText, { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents,
        encodeMonetaryAmount, db: { transaction: async () => trx }, addTransaction: {},
        Transaction: { query(options) { assert.strictEqual(options.client, trx); financialReads++;
          throw stop } },
      })
      const running = operation({ auth: { user }, request: { params: () => ({}),
        validateUsing: async () => ({}) }, logger: { error() {
        /* The caller captures the intentional test failure. */ } } })
      const observed = running.catch((error) => error)
      await waiting
      assert.equal(financialReads, 0)
      release()
      assert.strictEqual(await observed, stop)
      assert.equal(financialReads, 1)
      assert.isTrue(rolledBack)
    })

})

test.group('Provider concurrency behavior without a database', () => {
  test('a waiting sync refreshes cursor before provider work', async ({ assert }) => {
    const source = await method('app/Models/Institution.ts', 'syncUpdate')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let entered
    const waiting = new Promise((resolve) => { entered = resolve })
    const events = []
    const budget = {}
    const institution = {
      accessToken: 'old-token', cursor: 'stale-cursor', $trx: {},
      related(name) {
        if (name === 'budget') return { query: () => ({ forUpdate: () => ({ firstOrFail: async () =>
          {
          entered(); await gate; events.push('gate'); return budget
        } }) }) }
        return { query: async () => { events.push('accounts'); return [] } }
      },
      async refresh() { events.push('refresh'); this.cursor = 'committed-cursor'; this.accessToken =
        'fresh-token' },
    }
    const sync = runInNewContext(ts.transpileModule(`(async function(${source.parameters}) ${source
      .body})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents,
        encodeMonetaryAmount,
      logger: { error() { /* The caller captures the intentional test failure. */ } },
      app: { container: { make: async () => ({ syncTransactions: async (instance, cursor) => {
        assert.equal(cursor, 'committed-cursor')
        assert.equal(instance.accessToken, 'fresh-token')
        events.push('provider')
        return { next_cursor: cursor, has_more: false }
      } }) } },
    })
    const running = sync.call(institution)
    await waiting
    assert.deepEqual(events, [])
    release()
    await running
    assert.deepEqual(events, ['gate', 'refresh', 'accounts', 'provider'])
  })

  test('opening helpers compose shared Pool effects sequentially', async ({ assert }) => {
    const source = await method('app/Models/Institution.ts', 'updateAccountBalances')
    let persistedPool = 0
    const events = []
    const budget = { $trx: {}, async getFundingPoolCategory(options) {
      assert.strictEqual(options.client, this.$trx)
      return { balanceCents: parseMoneyCents(encodeMonetaryAmount(persistedPool)), async save(
        ) { persistedPool = Number(formatMoneyCents(this.balanceCents)) } }
    } }
    const accounts = [1, 2].map((id) => ({
      tracking: 'Transactions', type: 'Depository', plaidAccountId: String(id), initialized: false,
      $extras: { modified: true }, startDate: { toISODate: () => '2025-01-01' },
      async updateStartingBalance(owner, pool) {
        assert.strictEqual(owner, budget)
        events.push(`opening-${id}`)
        await Promise.resolve()
        pool.balanceCents = addMoneyCents(pool.balanceCents, parseMoneyCents(
          encodeMonetaryAmount(id)))
      },
      async save() { events.push(`save-${id}`) },
    }))
    const update = runInNewContext(ts.transpileModule(`(async function(${source
      .parameters}) ${source.body})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents,
        encodeMonetaryAmount,
        TrackingType: { Balances: 'Balances' }, AccountType: { Credit: 'Credit', Loan:
      'Loan' } })
    await update(budget, accounts, accounts.map((account, i) => ({ account_id: account
      .plaidAccountId, balances: { current: i + 1 } })))
    assert.equal(persistedPool, 3)
    assert.deepEqual(events, ['opening-1', 'save-1', 'opening-2', 'save-2'])
  })
})

async function openingFixture({ balance = 0.3, total = '0.20', poolBalance = 0.1,
  loan = false } = {}) {
  const source = await method('app/Models/Account.ts', 'updateStartingBalance')
  const events = []
  let link
  const transaction = { categories: [], merge(values) { Object.assign(this, values); return this },
    async save() { events.push('transaction.save'); return this },
    useTransaction(client) { this.$trx = client; return this },
    fill(values) { Object.assign(this, values); return this } }
  const account = { id: 1, type: loan ? 'Loan' : 'Credit', tracking: 'Transactions',
    balanceCents: parseMoneyCents(encodeMonetaryAmount(balance)),
    $trx: {}, startDate: { toISODate: () => '2025-01-01' }, related() { return {
      query() {
        let aggregate = false
        return { whereHas() { return this }, where() { return this },
          sum() { aggregate = true; return this },
          async first() { return aggregate ? { $extras: { sum: total } } : link } }
      },
      async create(values) { link = { ...values, merge(next) { Object.assign(this, next);
        return this }, async save() { events.push('link.save'); return this },
        related() { return { query: () => ({ firstOrFail: async () => transaction }) } } }
        return link },
    } } }
  const pool = { id: 9, balanceCents: parseMoneyCents(encodeMonetaryAmount(poolBalance)) }
  const run = runInNewContext(ts.transpileModule(`(async function(${source.parameters}) ${source
    .body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, encodeMonetaryAmount,
    AccountType: { Loan: 'Loan' }, TrackingType: { Balances: 'Balances' },
    requestCategoryStorage(model, supported) { events.push(['storage', supported]); return model },
    Transaction: function () { return transaction },
    TransactionType: { STARTING_BALANCE: 4 }, logger: { info() { events.push('log') } },
    validateStoredCategoryConservation: async () => { events.push('validate') },
  })
  return { account, pool, events, transaction, link: () => link,
    run: () => run.call(account, { id: 7 }, pool) }
}

test.group('Initial Funding checked cents without a database', () => {
  test('creation, adjustment and repeat preserve exact signed cents')
    .with([false, true].flatMap(loan => [1, -1].map(sign => ({ loan, sign }))))
    .run(async ({ assert }, { loan, sign }) => {
      const f = await openingFixture({ balance: sign * 0.3, total: sign === 1 ? '0.20' : '-0.20',
        poolBalance: sign * 0.1, loan })
      await f.run()
      assert.deepEqual(f.events.find(event => Array.isArray(event) && event[0] === 'storage'),
        ['storage', undefined])
      assert.strictEqual(f.link().amount, sign * 0.1)
      assert.strictEqual(f.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.2)))
      f.account.balanceCents = parseMoneyCents(encodeMonetaryAmount(sign * 0.4))
      await f.run()
      assert.strictEqual(f.link().amount, sign * 0.2)
      assert.strictEqual(f.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.3)))
      assert.strictEqual(f.transaction.categories[0].amount, sign * 0.2)
      await f.run()
      assert.strictEqual(f.pool.balanceCents, parseMoneyCents(encodeMonetaryAmount(sign * 0.3)))
      assert.strictEqual(Number(formatMoneyCents(f.account.balanceCents)), sign * 0.4)
    })

  test('empty aggregate is zero', async ({ assert }) => {
    const f = await openingFixture({ balance: 0, total: null, poolBalance: 0 })
    await f.run()
    assert.strictEqual(f.link().amount, 0)
    assert.strictEqual(f.pool.balanceCents, parseMoneyCents('0.00'))
  })

  test('malformed or unsafe aggregates reject before persistence')
    .with(['0.2', 'NaN', '90071992547409.92', 0.2]).run(async ({ assert }, total) => {
      const f = await openingFixture({ total })
      await assert.rejects(f.run)
      assert.deepEqual(f.events, [])
      assert.strictEqual(f.pool.balanceCents, parseMoneyCents('0.10'))
    })

  test('Loan opening rejects a subcent SQL aggregate before persistence', async ({ assert }) => {
    const f = await openingFixture({ loan: true, balance: 0.1, total: '0.005', poolBalance: 0 })
    await assert.rejects(f.run)
    assert.deepEqual(f.events, [])
    assert.strictEqual(f.pool.balanceCents, parseMoneyCents('0.00'))
  })
})


async function assignmentFixture(amount, rules, { loan = false, eligible = true,
  balance = 0.1, balanceCents = parseMoneyCents(encodeMonetaryAmount(balance)),
    matched = true } = {}) {
  const source = await method('app/Models/Account.ts', 'autoAssign')
  const events = []
  const categories = rules.map((rule, index) => ({ id: index + 1, categoryId: index + 1,
    ...rule }))
  const balances = categories.map(category => ({ id: category.id, name: `Category ${category.id}`,
    balanceCents, async save() { events.push(['category.save', this.id]) },
    related() { return { query: () => ({ firstOrFail: async () => ({ type: 'NoGroup' }) }) } } }))
  const trx = {}
  const account = { type: loan ? 'Loan' : 'Credit', $trx: trx, startDate: 1 }
  const transaction = { budgetId: 7, date: eligible ? 1 : 0, categories: [],
    async save() { events.push('transaction.save') }, related() { return { create: async () => {
      events.push('log') } } } }
  const budget = { related() { return { query() { return { whereIn() { return this },
    async first() { return matched ? { related() { return { query: () => ({
      async orderByRaw(order) {
        events.push(order)
        return categories
      },
    }) } } } : null } } } } } }
  const allocate = runInNewContext(ts.transpileModule(`(async function(${source.parameters}) ${
    source.body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, moneyCentsFromInteger,
    encodeMonetaryAmount, AccountType: { Loan: 'Loan' }, GroupType: { NoGroup: 'NoGroup' },
    Category: { async findOrFail(id, options) {
      if (options.client !== trx) throw new Error('Missing transaction binding')
      return balances[id - 1]
    } },
  })
  return { transaction, balances, events,
    run: () => allocate.call(account, budget, transaction, { amount, name: 'Match' }) }
}

test.group('Auto-assignment checked cents without a database', () => {
  test('fixed, percentage and mixed rules retain order, rounding and final residual')
    .with([
      { amount: 100, rules: [{ amount: 10.01 }, { amount: 12.75, percentage: true },
        { amount: 87.25, percentage: true }], expected: [10.01, 11.47, 78.52] },
      { amount: 0.3, rules: [{ amount: 0.1, percentage: null }, { amount: 50, percentage: true },
        { amount: 50, percentage: true }], expected: [0.1, 0.1, 0.1] },
      { amount: 0.29, rules: [{ amount: 50, percentage: true },
        { amount: 50, percentage: true }], expected: [0.15, 0.14] },
      { amount: -0.01, rules: [{ amount: 50, percentage: true },
        { amount: 50, percentage: true }], expected: [0, -0.01] },
      { amount: 0.01, rules: [{ amount: 50, percentage: true },
        { amount: 50, percentage: true }], expected: [0.01, 0] },
      { amount: -100, rules: [{ amount: -10 }, { amount: 25, percentage: true },
        { amount: 75, percentage: true }], expected: [-10, -22.5, -67.5] },
      { amount: 0.3, rules: [{ amount: 0.1 }, { amount: 0.1 }], expected: [0.1, 0.2] },
      { amount: 0.05, rules: [1, 2, 3].map(() => ({ amount: 33.33, percentage: true })),
        expected: [0.02, 0.02, 0.01] },
      { amount: 0, rules: [{ amount: 100, percentage: true }], expected: [0] },
      { amount: 0.1, rules: [{ amount: 0.2 }, { amount: 50, percentage: true },
        { amount: 50, percentage: true }], expected: [0.2, -0.05, -0.05] },
    ]).run(async ({ assert }, scenario) => {
      const f = await assignmentFixture(scenario.amount, scenario.rules)
      assert.isTrue(await f.run())
      assert.deepEqual(f.transaction.categories.map(split => split.amount), scenario.expected)
      assert.deepEqual(f.transaction.categories.map(split => split.categoryId), scenario.rules
        .map((_, index) => index + 1))
      assert.strictEqual(addMoneyCents(...f.transaction.categories.map(split => parseMoneyCents(
        encodeMonetaryAmount(split.amount)))), parseMoneyCents(encodeMonetaryAmount(scenario
        .amount)))
      for (let i = 0; i < f.balances.length; i++) {
        assert.strictEqual(f.balances[i].balanceCents, addMoneyCents(
          parseMoneyCents('0.10'), parseMoneyCents(encodeMonetaryAmount(scenario.expected[i]))))
      }
      assert.include(f.events, 'CASE WHEN percentage THEN 1 ELSE 0 END')
    })

  test('unsafe amounts, percentages and Category results reject')
    .with([
      { amount: Infinity, rules: [{ amount: 100, percentage: true }] },
      { amount: 0.1, rules: [{ amount: Infinity, percentage: true }] },
      { amount: 9999999999.99, rules: [{ amount: 9999999999.99, percentage: true }] },
      { amount: 0.1, rules: [{ amount: 100, percentage: true }],
        balanceCents: Number.MAX_SAFE_INTEGER },
      { amount: 0.1, rules: [{ amount: Number.MAX_SAFE_INTEGER }] },
    ]).run(async ({ assert }, scenario) => {
      const f = await assignmentFixture(scenario.amount, scenario.rules, scenario)
      await assert.rejects(f.run)
      assert.notInclude(f.events, 'transaction.save')
      assert.isFalse(f.events.some(event => Array.isArray(event) && event[0] === 'category.save'))
    })

  test('pre-start-date allocations do not change Category balances', async ({ assert }) => {
    const f = await assignmentFixture(0.2, [{ amount: 100, percentage: true }], { eligible: false })
    await f.run()
    assert.strictEqual(f.balances[0].balanceCents, parseMoneyCents('0.10'))
    assert.strictEqual(f.transaction.categories[0].amount, 0.2)
  })

  test('unmatched assignment leaves allocations untouched', async ({ assert }) => {
    const f = await assignmentFixture(0.2, [], { matched: false })
    assert.isFalse(await f.run())
    assert.deepEqual(f.events, [])
  })

  test('Loan allocations use shared checked-cent percentage rounding and residuals',
    async ({ assert }) => {
      const f = await assignmentFixture(0.29, [{ amount: 50, percentage: true },
        { amount: 50, percentage: true }], { loan: true })
      await f.run()
      assert.deepEqual(f.transaction.categories.map(split => split.amount), [0.15, 0.14])
      assert.strictEqual(f.balances[1].balanceCents, parseMoneyCents('0.24'))
    })
})


async function startDateFixture({ amount = 0.2, balance = 0.3, earlier = false,
  duplicate = false, loan = false } = {}) {
  const source = await method(accounts, 'update')
  const events = []
  const trx = { async commit() { events.push('commit') },
    async rollback() { events.push('rollback') } }
  const category = { balanceCents: parseMoneyCents(encodeMonetaryAmount(balance)), async save(
    ) { events.push('category.save') } }
  const account = { type: loan ? 'Loan' : 'Credit', tracking: 'Transactions',
    startDate: DateTime.fromISO(earlier ? '2025-02-01' : '2025-01-01'),
    async save() { events.push('account.save') },
    async updateStartingBalance() { events.push('opening') },
    related() { return { query() { return { if() { return this }, whereHas() { return this },
      async preload() { return Array.from({ length: duplicate ? 2 : 1 }, () => ({ amount,
        transaction: { categories: [{ categoryId: 1, amount }] } })) },
    } } } } }
  const pool = { async save() { events.push('pool.save') } }
  const budget = { useTransaction() { events.push('budget.bound') },
    async getUnassignedCategory() { return { id: 2 } },
    async getFundingPoolCategory() { return pool } }
  const user = { budgetId: 7, useTransaction() { events.push('user.bound') },
    related() { return { query() { return {
    forUpdate() { return this }, async firstOrFail() { return budget },
  } } } } }
  const update = runInNewContext(ts.transpileModule(`(async function(${source.parameters}) ${
    source.body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents, encodeMonetaryAmount,
    updateAccount: {}, db: { transaction: async () => trx },
    AccountType: { Loan: 'Loan' }, TrackingType: { Transactions: 'Transactions', Balances:
      'Balances' }, budgetAccounts: () => ({ where() { return this },
      async firstOrFail() { return account } }), Category: { query(options) {
      if (options.client !== trx) throw new Error('Missing transaction binding')
      return { where() { return this }, whereHas() { return this },
        async firstOrFail() { return category } }
    } },
  })
  return { events, category, run: () => update({ auth: { user }, request: {
    params: () => ({ acctId: 1 }), validateUsing: async () => ({ startDate: DateTime.fromISO(
      earlier ? '2025-01-01' : '2025-02-01') }),
  }, logger: { error() { events.push('error') } } }) }
}

test.group('Account start-date checked cents without a database', () => {
  test('date movement applies exact signed effects').with([
    { amount: 0.2, balance: 0.3, earlier: false, expected: 0.1 },
    { amount: -0.2, balance: -0.3, earlier: false, expected: -0.1 },
    { amount: 0.2, balance: 0.1, earlier: true, expected: 0.3 },
    { amount: -0.2, balance: -0.1, earlier: true, expected: -0.3 },
    { amount: 0.125, balance: 0.005, earlier: true, expected: 0.14, loan: true },
  ]).run(async ({ assert }, scenario) => {
    const f = await startDateFixture(scenario)
    await f.run()
    assert.strictEqual(f.category.balanceCents, parseMoneyCents(encodeMonetaryAmount(
      scenario.expected)))
    assert.strictEqual(f.events.at(-1), 'commit')
  })

  test('unsafe deltas and balance totals roll back before Category or Account saves').with([
    { amount: 50000000000000, duplicate: true },
    { amount: 50000000000000, balance: 50000000000000, earlier: true },
    { amount: Infinity },
  ]).run(async ({ assert }, scenario) => {
    const f = await startDateFixture(scenario)
    await assert.rejects(f.run)
    assert.include(f.events, 'rollback')
    assert.notInclude(f.events, 'category.save')
    assert.notInclude(f.events, 'account.save')
    assert.notInclude(f.events, 'commit')
  })
})
