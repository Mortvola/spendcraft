import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'

// Executes current method bodies against inert adapters: no app/DB bootstrap.
async function method(file, name, context) {
  const text = await readFile(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!found) throw new Error(`Missing ${file}:${name}`)
  const expression = `(async function(${found.parameters.map((p) => p.getText(source)).join(',')}) ${found.body.getText(source)})`
  return runInNewContext(ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
}
const noop = async () => undefined

test.group('Remaining correctness source characterization without DB', () => {
  test('deleted replacement target rejects before the former financial mutation', async ({ assert }) => {
    let rolledBack = false
    const target = { type: 2, deleted: true }
    const budget = { id: 1, related: () => ({ query: () => ({ where(key, value) {
      if (key === 'deleted') assert.isFalse(value)
      return this
    }, firstOrFail: async () => { throw new Error('Row not found') } }) }) }
    const user = { useTransaction: noop, related: () => ({ query: () => ({ forUpdate: () => ({ firstOrFail: async () => budget }) }) }) }
    const transfer = await method('app/Controllers/Http/CategoriesController.ts', 'transfer', {
      db: { transaction: async () => ({ rollback: async () => { rolledBack = true } }) }, updateCategoryTransfer: {},
    })
    await assert.rejects(() => transfer({ request: { params: () => ({ tfrId: 10 }), validateUsing: async () => ({
      date: '2025-03-01', type: 2, categories: [{ categoryId: 1, amount: 20 }, { categoryId: 2, amount: -20 }],
    }) }, auth: { user }, logger: { error: noop } }), 'Row not found')
    assert.isTrue(target.deleted)
    assert.isTrue(rolledBack)
  })

  test('legacy DELETE resolves and mutates foreign rows without consulting the actor', async ({ assert }) => {
    const category = { budgetId: 2, balance: 100, save: noop }
    const transferDelete = await method('app/Controllers/Http/CategoriesController.ts', 'transferDelete', {
      db: { transaction: async () => ({ commit: noop, rollback: noop }) },
      CategoryTransfer: { findOrFail: async () => ({ splits: async () => [{ categoryId: 200, amount: 10, delete: noop }], delete: noop }) },
      Category: { find: async () => category },
    })
    await transferDelete({ request: { params: () => ({ tfrId: 99 }) },
      auth: { user: { budgetId: 1 } }, logger: { error: noop } })
    assert.equal(category.balance, 90)
  })

  test('Loan update commits the Category name but never saves merged Loan settings', async ({ assert }) => {
    const persisted = { rate: 5, startingBalance: 100 }
    let saves = 0
    const category = { name: 'Old', merge(values) { Object.assign(this, values) }, save: noop }
    const updateBalance = await method('app/Models/Loan.ts', 'updateBalance', {})
    const loan = { ...persisted, merge(values) { Object.assign(this, values) }, updateBalance,
      async save() { saves++; persisted.rate = this.rate; persisted.startingBalance = this.startingBalance },
      related: () => ({ query: () => ({ firstOrFail: async () => category }) }), getProps: async () => ({ balance: 0, transactions: [] }) }
    const update = await method('app/Controllers/Http/LoansController.ts', 'update', {
      db: { transaction: async () => ({ commit: noop, rollback: noop }) }, updateLoan: {},
      budgetLoans: () => ({ where() { return this }, firstOrFail: async () => loan }),
    })
    await update({ request: { params: () => ({ catId: 1 }), validateUsing: async () => ({ name: 'New', rate: 8,
      startingBalance: 200, startDate: DateTime.fromISO('2025-02-01') }) }, auth: { user: { budgetId: 1 } }, logger: { error: noop } })
    assert.equal(category.name, 'New')
    assert.equal(saves, 0)
    assert.deepEqual(persisted, { rate: 5, startingBalance: 100 })
  })
})
