import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'
import { log } from 'node:console'

test.group('Funding allocation rounding characterization', () => {
  test('actual dialog allocation records percentage residual conservation')
    .with([0.01, 0.02, -0.01])
    .run(async ({ assert }, amount) => {
      const source = await readFile(new URL('../../../client-src/Funding/FundingDialog.tsx', import.meta.url), 'utf8')
      const ast = ts.createSourceFile('FundingDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const matches = []
      function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'computeSpread' && node.initializer) {
          matches.push(node.initializer.getText(ast))
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
      assert.lengthOf(matches, 1)
      // Execute the actual closure-free allocation function, rather than copying its algorithm.
      const correction = 'fundingAmount += percentSum - categoryAmount;'
      assert.include(matches[0], correction)
      const observedSource = matches[0].replace(correction,
        `trace.push({ categoryAmount, percentSum, before: fundingAmount }); ${correction} trace.push({ after: fundingAmount });`)
      const compiled = ts.transpileModule(`const computeSpread = ${observedSource}; computeSpread;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
      }).outputText
      const trace = []
      const computeSpread = runInNewContext(compiled, { trace })
      const allocations = [...computeSpread(amount, [
        { categoryId: 1, amount: 33.33, percentage: true },
        { categoryId: 2, amount: 33.33, percentage: true },
        { categoryId: 3, amount: 33.34, percentage: true },
      ])]
      const actualCents = allocations.reduce((sum, [, cents]) => sum + cents, 0)
      assert.isNumber(actualCents)
      log(JSON.stringify({ amount, expectedCents: Math.round(amount * 100), actualCents, allocations, trace }))
    })
})
