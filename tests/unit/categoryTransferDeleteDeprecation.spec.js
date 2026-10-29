import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const read = (file) => readFile(file, 'utf8')

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
})
