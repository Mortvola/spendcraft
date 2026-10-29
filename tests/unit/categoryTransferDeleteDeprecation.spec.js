import { test } from '@japa/runner'
import { readFile, readdir, access } from 'node:fs/promises'
import ts from 'typescript'

const read = (file) => readFile(file, 'utf8')
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat()
    .filter((file) => /\.(ts|tsx|js)$/.test(file))
}

test.group('Legacy CategoryTransfer DELETE removal (no database)', () => {
  test('category-transfer route group retains only modern POST/PATCH', async ({ assert }) => {
    const source = ts.createSourceFile('routes.ts', await read('start/routes.ts'), ts.ScriptTarget
      .Latest, true)
    let routes
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'prefix' && node.arguments[0]?.getText(source) ===
          "'/category-transfer'") {
        const group = node.expression.expression
        const result = []
        function calls(child) {
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
            && child.expression.expression.getText(source) === 'router') {
            result.push([child.expression.name.text, child.arguments[0].getText(source), child
              .arguments[1].getText(source)])
          }
          ts.forEachChild(child, calls)
        }
        calls(group.arguments[0])
        routes = result
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.deepEqual(routes, [['post', "''", "[CategoriesController, 'transfer']"],
      ['patch', "'/:tfrId'", "[CategoriesController, 'transfer']"]])
    assert.notInclude(await read('start/routes.ts'), 'transferDelete')
  })

  test('no production legacy-table authority or standalone handler remains', async ({ assert }) => {
    for (const file of (await Promise.all(['app', 'commands', 'start', 'client-src', 'common',
      'providers'].map(files))).flat()) {
      assert.notMatch(await read(file),
        new RegExp(
"\\btransferDelete\\b|\\bcategory_transfers\\b|\\bcategory_sp" +
"lits\\b|#(?:app\\/)?Models\\/CategoryTransfer|#(?:app\\/)?M" +
"odels\\/CategorySplit",
""), file)
    }
    for (const file of ['app/Models/CategoryTransfer.ts', 'app/Models/CategorySplit.ts']) {
      await assert.rejects(() => access(file))
    }
  })

  test('no client DELETE caller; modern deletion remains Transaction-owned', async ({ assert }) => {
    for (const file of await files('client-src')) {
      const source = ts.createSourceFile(file, await read(file), ts.ScriptTarget.Latest, true)
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text.toLowerCase() === 'delete') {
          for (const arg of node.arguments) assert.notInclude(arg.getText(source),
            'category-transfer', file)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    for (const dialog of ['client-src/Funding/FundingDialog.tsx',
      'client-src/Rebalance/RebalanceDialog.tsx']) {
      assert.include(await read(dialog), 'transaction.delete()')
    }
    assert.include(await read('client-src/State/Transaction.ts'),
      '`/api/v1/transaction/${this.id}`')
    assert.notInclude(await read('client-src/CategoryTransferDialog.tsx'), 'Http.delete')
  })

  test('modern DTOs, admission and separate date policies remain', async ({ assert }) => {
    const controller = await read('app/Controllers/Http/CategoriesController.ts')
    assert.include(controller, "budget.related('transactions')")
    assert.include(controller, '.forUpdate()')
    assert.include(controller, 'const fundingTarget =')
    assert.include(controller, 'const rebalanceTarget =')
    assert.include(controller, 'The date of a funding transaction cannot be changed.')
    assert.include(await read('common/ResponseTypes.ts'), 'CategoryTransferProps')
    assert.include(await read('client-src/State/Register.ts'), "'/api/v1/category-transfer'")
  })

  test('historical schema records remain and modern legacy allocations are separate', async ({
    assert }) => {
    assert.include(await read('database/old-migrations/1585435828322_category_transfers_schema.js'),
      "this.create('category_transfers'")
    assert.include(await read('database/old-migrations/1585435670190_category_splits_schema.js'),
      "this.create('category_splits'")
    assert.include(await read(
      'database/old-migrations/1591064873260_transaction_categories_schema.js'),
      "this.rename('category_splits', 'transaction_categories')")
    assert.include(await read('database/migrations/1626492161245_transaction_categories.ts'),
      "'transaction_categories'")
  })
})
