import { encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile, readdir } from 'node:fs/promises'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
async function files(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]))
  return nested.flat().filter((file) => /\.(ts|tsx|js)$/.test(file))
}

test.group('Deprecated BalanceHistory production boundary (no database)', () => {
  test('only minimal model/relationship and parent cleanup references remain', async ({ assert }) => {
    const allowed = new Set(['app/Models/Account.ts', 'app/Models/BalanceHistory.ts',
      'app/Controllers/Http/InstitutionController.ts', 'app/Controllers/Http/UsersController.ts'])
    for (const path of (await Promise.all(['app', 'commands', 'start', 'client-src', 'common'].map(files))).flat()) {
      const source = await read(path)
      if (/BalanceHistory|balanceHistory|balance_histories|balance_history/.test(source)) {
        assert.isTrue(allowed.has(path), `Unexpected production history reference: ${path}`)
      }
    }
    const account = await read('app/Models/Account.ts')
    assert.notInclude(account, 'updateAccountBalanceHistory')
    assert.notInclude(account, "related('balanceHistory')")
  })

  test('deprecated mutation routes, controllers, validators and DTOs are removed', async ({ assert }) => {
    const routes = await read('start/routes.ts')
    const controller = await read('app/Controllers/Http/AccountsController.ts')
    const validator = await read('app/validation/Validators/account.ts')
    const types = await read('common/ResponseTypes.ts')
    for (const name of ['addBalance', 'updateBalance', 'deleteBalance', 'budgetHistory']) {
      assert.notInclude(routes, `'${name}'`)
      assert.notInclude(controller, name)
      assert.notInclude(validator, name)
    }
    assert.notInclude(routes, ".prefix('/balance')")
    for (const name of ['AddBalanceResponse', 'UpdateBalanceResponse', 'BalanceProps', 'isBalancesResponse']) {
      assert.notMatch(types, new RegExp(`\\b${name}\\b`))
    }
  })

  test('active chart stays read-only and Statements remain its Balances source', async ({ assert }) => {
    const chart = await read('client-src/AccountView/AccountBalanceChart.tsx')
    const cache = await read('client-src/State/AccountBalanceSeries.ts')
    const store = await read('client-src/State/Store.ts')
    assert.include(chart, 'selectedAccount?.statements.load()')
    assert.include(chart, 'accountBalanceSeries.load(selectedAccount)')
    assert.include(chart, 'accountBalanceSeries.points')
    assert.include(cache, 'Http.get(')
    for (const mutation of ['Http.post', 'Http.patch', 'Http.delete', 'addBalance', 'insertBalance']) assert.notInclude(cache, mutation)
    assert.notInclude(store, "from './Balances'")
    assert.notInclude(store, 'this.balances')
  })

  test('financial writers, providers, initialization and reports have no history authority', async ({ assert }) => {
    for (const path of ['app/Controllers/Http/AccountsController.ts', 'app/Controllers/Http/TransactionsController.ts',
      'app/Models/Institution.ts', 'app/Controllers/Http/ReportController.ts', 'commands/OfxUpload.ts']) {
      assert.notMatch(await read(path), /BalanceHistory|balanceHistory|balance_histories/)
    }
    // InstitutionController's only retained use is the existing deletion cleanup.
    const institution = await read('app/Controllers/Http/InstitutionController.ts')
    assert.equal((institution.match(/BalanceHistory\.query/g) ?? []).length, 1)
    assert.include(institution, 'balanceHistories.map((balanceHistory) => balanceHistory.delete())')
  })

  test('existing Transaction-derived chart ignores legacy observations', async ({ assert }) => {
    const source = await read('app/Controllers/Http/AccountsController.ts')
    const ast = ts.createSourceFile('AccountsController.ts', source, ts.ScriptTarget.Latest, true)
    let body
    function visit(node) {
      if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'balances') body = node.body.getText(ast)
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.isString(body)
    let queries = 0
    const account = { id: 10, tracking: 'Transactions', balance: 100 }
    const chain = { where() { return this }, whereHas() { return this }, orderBy() { return this }, async first() { return { date: DateTime.fromISO('2025-02-10') } } }
    const method = runInNewContext(ts.transpileModule(`(async function({ request, auth: {user} }) ${body})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText, { encodeMonetaryAmount, DateTime, TrackingType: { Balances: 'Balances' },
      budgetAccounts: () => ({ where: () => ({ firstOrFail: async () => account }) }),
      Transaction: { query: () => chain },
      db: { async rawQuery(sql) {
        queries++; assert.notInclude(sql, 'balance_histories')
        assert.include(sql, 'account_transactions')
        return { rows: [{ date: '2025-02-10', balance: '100.00' }] }
      } },
      BalanceHistory: new Proxy({}, { get() { throw new Error('Legacy rows must not be read') } }),
    })
    const result = await method({ request: { params: () => ({ acctId: '10' }) }, auth: { user: { budgetId: 1 } } })
    assert.equal(queries, 1); assert.equal(result[0].balance, '100.00')
    assert.equal(account.balance, 100)
    assert.notProperty(result[0], 'id')
  })
})
