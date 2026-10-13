import { validateFundingPercentages } from '../../../common/fundingPercentages.js'
import { CategoryType } from '../../../common/ResponseTypes.js'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'

async function initializer(path, name) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const matches = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) matches.push(node.initializer.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (matches.length !== 1) throw new Error(`Expected one ${name}`)
  return runInNewContext(ts.transpileModule(`(${matches[0]})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, { validateFundingPercentages, CategoryType })
}

test.group('Funding configuration client regression', () => {
  test('actual dialog validators reject invalid funding configurations and accept valid ones', async ({ assert }) => {
    const category = await initializer('../../../client-src/Categories/CategoryView/CategoryDialog.tsx', 'handleValidate')
    const funding = await initializer('../../../client-src/Funding/FundingDialog.tsx', 'handleValidate')
    const cases = [
      { percentages: [100], valid: true }, { percentages: [50, 50], valid: true },
      { percentages: [33.33, 33.33, 33.34], valid: true }, { percentages: [0.29, 99.71], valid: true },
      { percentages: ['50', '50'], valid: true }, { percentages: [0, 100], valid: true },
      { percentages: [50, 50], fixed: 10, valid: true }, { percentages: [], fixed: 7, valid: true },
      { percentages: [], valid: true }, { percentages: [-1, 101], valid: false },
      { percentages: [99.99], valid: false }, { percentages: [100.01], valid: false },
      { percentages: [0], valid: false }, { percentages: [0.001, 99.999], valid: false },
    ]
    for (const scenario of cases) {
      const entries = scenario.percentages.map((amount) => ({ categoryId: 1, amount, percentage: true }))
      const fundingCategories = scenario.fixed === undefined ? entries
        : [{ categoryId: 1, amount: scenario.fixed, percentage: false }, ...entries]
      const categoryErrors = category({ name: 'Category', type: CategoryType.Bill, fundingCategories })
      const fundingErrors = funding({ date: '2025-03-01', categories: { 1: { baseAmount: -10, fundingCategories } } })
      if (scenario.valid) {
        assert.isEmpty(categoryErrors)
        assert.isEmpty(fundingErrors)
      } else {
        assert.isString(categoryErrors.fundingCategories)
        assert.isString(fundingErrors.categories[1].fundingCategories)
      }
    }
    // Non-Bill Category submissions send [], so hidden legacy rules do not block them.
    assert.isEmpty(category({ name: 'Regular', type: CategoryType.Regular,
      fundingCategories: [{ categoryId: 1, amount: -100, percentage: true }] }))
  })

  test('actual input formatting shows hundredth precision while binary scaling need not be integral', async ({ assert }) => {
    const convert = await initializer('../../../client-src/AmountInput.tsx', 'convertAmount')
    assert.equal(convert(33.333), '33.33')
    assert.equal(convert(0.01), '0.01')
    assert.equal(convert(-1), '-1.00')
    assert.isFalse(Number.isInteger(0.29 * 100))
    assert.equal(Math.round(0.29 * 100), 29)
  })
})
