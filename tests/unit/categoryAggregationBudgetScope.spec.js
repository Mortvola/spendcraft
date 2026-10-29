import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { TransactionType } from '../../common/ResponseTypes.ts'

// Evaluate the actual production SQL templates and binding expressions, without
// bootstrapping Adonis or connecting to a database.
async function aggregates(file, methodName, budgetId) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest,
    true)
  let method
  function find(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === methodName) method = node
    ts.forEachChild(node, find)
  }
  find(source)
  if (!method) throw new Error(`Missing ${methodName}`)
  const calls = []
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'joinRaw') {
      const expression = `[${node.arguments.map((arg) => arg.getText(source)).join(',')}]`
      const [sql, bindings] = runInNewContext(ts.transpileModule(expression,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
        budget: { id: budgetId }, TransactionType,
        firstDayOfMonth: DateTime.fromISO('2025-03-01'),
        firstDayOfPreviousMonth: DateTime.fromISO('2025-02-01'),
      })
      calls.push({ sql, bindings: Array.from(bindings ?? []) })
    }
    ts.forEachChild(node, visit)
  }
  visit(method)
  // Chained calls are visited from the outermost (last) join inward.
  return calls.reverse()
}

function assertScope(assert, { sql, bindings }, budgetId) {
  const match = /\band t\.application_id = \?/.exec(sql)
  assert.isNotNull(match, 'Transaction aggregation must filter its owning Budget')
  const budgetIndex = (sql.slice(0, match.index).match(/\?/g) ?? []).length
  assert.equal(bindings[budgetIndex], budgetId)
  assert.equal((sql.match(/\?/g) ?? []).length, bindings.length)
  assert.include(sql, 'and t.deleted = false')
  assert.include(sql, 'group by transCats."categoryId"')
}

test.group('Category allocation aggregation Budget scoping (no database)', () => {
  test('all four month summary aggregates bind the authorized Budget').with([7, 19])
    .run(async ({ assert }, budgetId) => {
      const calls = await aggregates('app/Controllers/Http/CategoriesController.ts', 'get',
        budgetId)
      assert.lengthOf(calls, 4)
      for (const call of calls) assertScope(assert, call, budgetId)
      assert.deepEqual(calls.map((call) => call.bindings), [
        ['2025-03-01', budgetId],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.FUNDING_TRANSACTION, TransactionType
          .REBALANCE_TRANSACTION],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.FUNDING_TRANSACTION],
        ['2025-03-01', '2025-02-01', budgetId, TransactionType.REBALANCE_TRANSACTION],
      ])
    })

  test('balance check aggregates only the Budget currently being examined').with([7, 19])
    .run(async ({ assert }, budgetId) => {
      const calls = await aggregates('commands/CheckBalances.ts', 'checkCategoryBalances', budgetId)
      assert.lengthOf(calls, 1)
      assertScope(assert, calls[0], budgetId)
      assert.deepEqual(calls[0].bindings, [budgetId])
      assert.include(calls[0].sql, '(a.start_date is null OR t.date >= a.start_date)')
    })
})
