import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import ts from 'typescript'
import { runInNewContext } from 'node:vm'

// Source contracts and inert behavioral tests: no application, ORM or DB bootstrap.
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
  const writes = []
  function inspect(node) {
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && ts.isPropertyAccessExpression(node.left)
      && node.left.name.text === 'balance') writes.push(node.left.getText(ast))
    ts.forEachChild(node, inspect)
  }
  inspect(found.body)
  return { body: found.body.getText(ast), writes, parameters: found.parameters.map((parameter) =>
    parameter.getText(ast)).join(', ') }
}

const accounts = 'app/Controllers/Http/AccountsController.ts'
const transactions = 'app/Controllers/Http/TransactionsController.ts'

test.group('Current Account writer concurrency characterization', () => {
  test('manual CREATE gates before all financial reads', async ({ assert }) => {
    const { body, writes } = await method(accounts, 'addTransaction')
    assert.isAbove(body.indexOf('const account ='), body.indexOf('db.transaction()'))
    assert.include(writes, 'account.balance')
    assert.include(body, 'await account.save()')
    assert.isAbove(body.indexOf('.forUpdate()'), -1)
    assert.isAbove(body.indexOf("const unassignedCat ="), body.indexOf('.forUpdate()'))
    assert.isAbove(body.indexOf('.forUpdate()'), body.indexOf('user.useTransaction(trx)'))
  })

  test('DELETE gates before target and financial reads', async ({ assert }) => {
    const { body, writes } = await method(transactions, 'delete')
    assert.include(writes, 'account.balance')
    assert.include(body, 'await account.save()')
    assert.isAbove(body.indexOf('.forUpdate()'), -1)
    assert.isAbove(body.indexOf('const transaction ='), body.indexOf('.forUpdate()'))
    assert.isAbove(body.indexOf('.forUpdate()'), body.indexOf('user.useTransaction(trx)'))
  })

  test('PATCH and HTTP OFX acquire existing gate before fresh Account lookup', async ({ assert }) =>
    {
    for (const [file, name] of [[transactions, 'update'], [accounts, 'uploadOfx']]) {
      const { body } = await method(file, name)
      assert.isAbove(body.indexOf('.forUpdate()'), -1)
      assert.isAbove(body.indexOf('const account ='), body.indexOf('.forUpdate()'))
    }
  })

  test('startDate saves settings but does not assign Account.balance', async ({ assert }) => {
    const { body, writes } = await method(accounts, 'update')
    assert.notInclude(writes, 'account.balance')
    assert.include(body, 'await account.save()')
    const opening = await method('app/Models/Account.ts', 'updateStartingBalance')
    assert.notInclude(opening.writes, 'this.balance')
  })

  test('provider refresh and shared-state branches follow the gate', async ({ assert }) => {
    const sync = await method('app/Models/Institution.ts', 'syncUpdate')
    assert.isAbove(sync.body.indexOf("const accounts = await this.related('accounts')"), sync.body
      .indexOf('.forUpdate()'))
    const batch = await method('app/Controllers/Http/InstitutionController.ts', 'syncAll')
    assert.notInclude(batch.body, 'Promise.all(')
    const balances = await method('app/Models/Institution.ts', 'updateAccountBalances')
    assert.notInclude(balances.body, 'Promise.all(')
    assert.include(balances.writes, 'acct.balance')
    assert.isAbove(sync.body.indexOf('await this.refresh()'), sync.body.indexOf('.forUpdate()'))
    assert.isAbove(sync.body.indexOf('let nextCursor = this.cursor'), sync.body.indexOf(
      'await this.refresh()'))
  })

  test('command selects identity before gate and reloads scoped Account after it', async ({
    assert }) => {
    const command = await method('commands/OfxUpload.ts', 'run')
    assert.isAbove(command.body.indexOf('.forUpdate()'), command.body.indexOf(
      'this.prompt.choice('))
    assert.isAbove(command.body.indexOf('const account = await Account.query({ client: trx })'),
      command.body.indexOf('.forUpdate()'))
    assert.include(command.body, "query.where('budgetId', budget.id)")
    assert.include(command.body, "User.findBy('username', username, { client: trx })")
    const check = await method('commands/CheckBalances.ts', 'checkCategoryBalances')
    assert.notInclude(check.writes, 'account.balance')
    assert.include(check.writes, 'category.balance')
  })
})


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
      }).outputText, { db: { transaction: async () => trx }, addTransaction: {},
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

  test('deprecated history mutations are absent rather than joining the gate', async ({ assert }) =>
    {
    const source = await readFile(accounts, 'utf8')
    for (const name of ['addBalance', 'updateBalance', 'deleteBalance']) assert.notInclude(source,
      `async ${name}(`)
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
    }).outputText, {
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
    }).outputText, { TrackingType: { Balances: 'Balances' }, AccountType: { Credit: 'Credit', Loan:
      'Loan' } })
    await update(budget, accounts, accounts.map((account, i) => ({ account_id: account
      .plaidAccountId, balances: { current: i + 1 } })))
    assert.equal(persistedPool, 3)
    assert.deepEqual(events, ['opening-1', 'save-1', 'opening-2', 'save-2'])
  })
})
