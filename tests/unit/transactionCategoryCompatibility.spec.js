// Characterization of current functions only: no migration implementation or DB bootstrap.
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

async function current(file, name, context = {}) {
  const source = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let expression
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = `(${node.getText(ast).replace(/^export\s+/, '')})`
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = `(${node.initializer.getText(ast)})`
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) {
      expression = `(async function(${node.parameters.map((p) => p.getText(ast)).join(',')}) ${node.body.getText(ast)})`
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!expression) throw new Error(`Current function not found: ${file}:${name}`)
  return runInNewContext(ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
}

test.group('Current Transaction Category string compatibility — no DB', () => {
  test('funding effect concatenates raw strings and mixed values')
    .with([[10, 20, 30], ['10.00', '20.00', '010.0020.00'], [10, '20.00', '1020.00']])
    .run(async ({ assert }, [a, b, expected]) => {
      const effect = await current('client-src/Funding/calculateFunding.ts', 'fundingCategoryEffect')
      assert.strictEqual(effect([{ categoryId: 1, amount: a }, { categoryId: 1, amount: b }], 1), expected)
    })
  test('duplicate effect aggregation fails if strings reach current posting helper')
    .with([[10, 20, 30], ['10.00', '20.00', NaN], [10, '20.00', 1020]])
    .run(async ({ assert }, [a, b, expected]) => {
      const deltas = await current('app/services/transactionEligibility.ts', 'categoryEffectDeltas')
      const delta = deltas([], [{ categoryId: 1, amount: a }, { categoryId: 1, amount: b }], false, true).get(1)
      if (Number.isNaN(expected)) assert.isTrue(Number.isNaN(delta))
      else assert.strictEqual(delta, expected)
    })
  test('replacement admission currently accepts numeric allocations only').with([10, '10.00'])
    .run(async ({ assert }, amount) => {
      const accepts = await current('app/Controllers/Http/CategoriesController.ts', 'hasReplacementAllocations')
      assert.equal(accepts([{ categoryId: 1, amount }]), typeof amount === 'number')
    })
  test('opening writes a positive same-sign Pool allocation and keeps Account balance')
    .with(['new', 'numeric-existing', 'string-existing'])
    .run(async ({ assert }, scenario) => {
      const owner = {}, date = { toISODate: () => '2025-01-01' }
      let row, link, queries = 0, saves = 0
      const pool = { id: 99, balance: 5 }
      const existing = { id: 3, amount: 75, merge(values) { Object.assign(this, values); return this },
        async save() { return this }, related() { return { query: () => ({ firstOrFail: async () => row }) } } }
      if (scenario !== 'new') row = { categories: [{ categoryId: 99, amount: scenario === 'string-existing' ? '75.00' : 75, comment: 'keep' }],
        merge(values) { Object.assign(this, values); return this }, async save() { saves++; return this } }
      class Transaction {
        useTransaction(trx) { assert.strictEqual(trx, owner); return this }
        fill(values) { Object.assign(this, values); return this }
        async save() { saves++; this.id = 7; row = { ...this }; return this }
      }
      const account = { id: 1, balance: 100, tracking: 'Transactions', startDate: date, $trx: owner,
        related: () => ({ query: () => ({ whereHas() { return this }, where() { return this }, sum() { return this },
          async first() { return queries++ === 0 ? { $extras: { sum: '25.00' } } : scenario === 'new' ? null : existing },
        }), async create(values) { link = values; return values } }),
      }
      const update = await current('app/Models/Account.ts', 'updateStartingBalance', {
        Transaction, TrackingType: { Balances: 'Balances' }, TransactionType: { STARTING_BALANCE: 4 }, logger: { info: () => undefined },
      })
      await update.call(account, { id: 2 }, pool)
      assert.equal(account.balance, 100)
      assert.equal(row.categories[0].categoryId, 99)
      assert.strictEqual(row.categories[0].amount, 75)
      if (scenario === 'new') {
        assert.equal(row.type, 4); assert.strictEqual(row.date, date)
        assert.equal(link.amount, 75); assert.equal(pool.balance, 80); assert.equal(saves, 1)
      } else {
        assert.equal(pool.balance, 5); assert.equal(row.categories[0].comment, 'keep'); assert.equal(saves, 2)
      }
    })
  test('three raw JSON-path sites compare amounts to a numeric zero', async ({ assert }) => {
    const controller = await readFile('app/Controllers/Http/CategoriesController.ts', 'utf8')
    const model = await readFile('app/Models/Category.ts', 'utf8')
    assert.equal(controller.match(/@\.amount != 0/g)?.length, 1)
    assert.equal(model.match(/@\.amount != 0/g)?.length, 2)
  })
})
