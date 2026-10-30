import { addMoneyCents, subtractMoneyCents, parseMoneyCents, formatMoneyCents } from
  '../../common/moneyCents.ts'
import { encodeMonetaryAmount } from '../../app/Services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
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
      return { balance: persistedPool, async save() { persistedPool = this.balance } }
    } }
    const accounts = [1, 2].map((id) => ({
      tracking: 'Transactions', type: 'Depository', plaidAccountId: String(id), initialized: false,
      $extras: { modified: true }, startDate: { toISODate: () => '2025-01-01' },
      async updateStartingBalance(owner, pool) {
        assert.strictEqual(owner, budget)
        events.push(`opening-${id}`)
        await Promise.resolve()
        pool.balance += id
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
