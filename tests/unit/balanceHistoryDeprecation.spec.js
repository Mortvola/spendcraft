import { formatMoneyCents, parseMoneyCents } from '#common/moneyCents'
import { encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test.group('Deprecated BalanceHistory production boundary (no database)', () => {
  test('existing Transaction-derived chart ignores legacy observations', async ({ assert }) => {
    const source = await read('app/Controllers/Http/AccountsController.ts')
    const ast = ts.createSourceFile('AccountsController.ts', source, ts.ScriptTarget.Latest, true)
    let body
    function visit(node) {
      if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'balances') body = node.body
        .getText(ast)
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.isString(body)
    let queries = 0
    const account = { id: 10, tracking: 'Transactions', balanceCents: parseMoneyCents(
      encodeMonetaryAmount(100)) }
    const chain = { where() { return this }, whereHas() { return this }, orderBy() { return this },
      async first() { return { date: DateTime.fromISO('2025-02-10') } } }
    const method = runInNewContext(ts.transpileModule(
      `(async function({ request, auth: {user} }) ${body})`, {
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
    const result = await method({ request: { params: () => ({ acctId: '10' }) }, auth: { user: {
      budgetId: 1 } } })
    assert.equal(queries, 1); assert.equal(result.data[0].balance, '100.00')
    assert.equal(Number(formatMoneyCents(account.balanceCents)), 100)
    assert.notProperty(result.data[0], 'id')
  })
})
