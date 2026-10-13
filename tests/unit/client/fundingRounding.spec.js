import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'
import { log } from 'node:console'

async function productionExpressions() {
  const source = await readFile(new URL('../../../client-src/Funding/FundingDialog.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('FundingDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const expressions = new Map()
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ['computeSpread', 'handleSubmit'].includes(node.name.getText(ast))) {
      expressions.set(node.name.getText(ast), node.initializer.getText(ast))
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return expressions
}

function evaluate(source, context = {}) {
  return runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context)
}

// Valid nonnegative percentages total 100%; negative source amounts remain valid.
test.group('Funding residual correction regression', () => {
  test('actual spread preserves individual allocations and total cents')
    .with([
      { amount: 0.01, expected: [0, 0, 1] },
      { amount: 0.02, expected: [1, 1, 0] },
      { amount: -0.01, expected: [0, 0, -1] },
      { amount: -0.02, expected: [-1, -1, 0] },
      { amount: 100, expected: [3333, 3333, 3334] },
      { amount: -100, expected: [-3333, -3333, -3334] },
      { amount: 1, expected: [33, 33, 34] },
      { amount: -1, expected: [-33, -33, -34] },
      { amount: 0.05, expected: [2, 2, 1] },
      { amount: -0.05, expected: [-2, -2, -1] },
    ])
    .run(async ({ assert }, scenario) => {
      const expressions = await productionExpressions()
      let order
      const observed = expressions.get('computeSpread').replace('const funders = new Map<number, number>();',
        'observeOrder(sortedCategories.map((entry) => entry.categoryId)); const funders = new Map<number, number>();')
      const spread = evaluate(`const computeSpread = ${observed}; computeSpread;`, { observeOrder: (ids) => { order = [...ids] } })
      const result = spread(scenario.amount, [
        { categoryId: 1, amount: 33.33, percentage: true },
        { categoryId: 2, amount: 33.33, percentage: true },
        { categoryId: 3, amount: 33.34, percentage: true },
      ])
      // Tiny-amount residual assertions follow actual processing order, without defining tie priority.
      const ids = Math.abs(scenario.amount) === 100 ? [1, 2, 3] : order
      const allocations = ids.map((id) => result.get(id) ?? 0)
      assert.deepEqual(allocations, scenario.expected)
      assert.equal(allocations.reduce((sum, cents) => sum + cents, 0), scenario.expected.reduce((sum, cents) => sum + cents, 0))
      assert.equal([...result.values()].reduce((sum, cents) => sum + cents, 0), Math.round(scenario.amount * 100))
    })

  test('actual submit handler passes balanced spread values to the funding request boundary', async ({ assert }) => {
    const expressions = await productionExpressions()
    let submitted
    let shown = true
    let order
    const observed = expressions.get('computeSpread').replace('const funders = new Map<number, number>();',
      'observeOrder(sortedCategories.map((entry) => entry.categoryId)); const funders = new Map<number, number>();')
    const submit = evaluate(`const computeSpread = ${observed}; const handleSubmit = ${expressions.get('handleSubmit')}; handleSubmit;`, {
      observeOrder: (ids) => { order = [...ids] },
      fundingPoolCat: { id: 99 }, transaction: undefined, TransactionType: { FUNDING_TRANSACTION: 2 },
      register: { addCategoryTransfer: async (request, type) => { submitted = { request, type }; return null } },
      setShow: (value) => { shown = value },
    })
    await submit({ date: '2025-03-01', categories: { 10: { baseAmount: 0.01, includeFundingTransfers: false,
      fundingCategories: [{ categoryId: 1, amount: 33.33, percentage: true },
        { categoryId: 2, amount: 33.33, percentage: true }, { categoryId: 3, amount: 33.34, percentage: true }] } } })
    assert.equal(submitted.type, 2)
    assert.isFalse(shown)
    assert.deepEqual(submitted.request.categories.map(({ categoryId, amount }) => ({ categoryId, amount })),
      [{ categoryId: 10, amount: 0.01 }, { categoryId: order.at(-1), amount: -0.01 }])
    assert.equal(submitted.request.categories.reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 0)
  })
})

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
      const correction = 'fundingAmount += categoryAmount - percentSum;'
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
      assert.equal(actualCents, Math.round(amount * 100))
      log(JSON.stringify({ amount, expectedCents: Math.round(amount * 100), actualCents, allocations, trace }))
    })
})
