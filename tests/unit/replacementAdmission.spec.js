import { requestFundingStorage } from '../../app/services/fundingStorage.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { TransactionType } from '../../common/ResponseTypes.ts'
import { validateCategoryConservation, encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { validateTransactionSplits } from '../../app/validation/transactionSplits.ts'

async function expressions() {
  const file = 'app/Controllers/Http/CategoriesController.ts'
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const result = {}
  function visit(node) {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && ['transfer', 'hasReplacementAllocations'].includes(node.name?.getText(source))) {
      const asyncPrefix = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''
      result[node.name.getText(source)] = ts.transpileModule(`(${asyncPrefix}function(${node.parameters.map((p) => p.getText(source)).join(',')}) ${node.body.getText(source)})`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}
class Rejection extends Error {
  constructor(message, options) { super(message); this.status = options.status }
}
async function harness(shape = {}, request = {}) {
  const log = []
  const trx = { commit: async () => { log.push('commit') }, rollback: async () => { log.push('rollback') } }
  const categories = new Map([1, 2].map((id) => [id, { id, balance: id === 1 ? 10 : -10,
    save: async () => { log.push('category.save') } }]))
  const target = { id: 10, budgetId: 1, deleted: false, type: 2, date: DateTime.fromISO('2025-03-01'),
    categories: [{ categoryId: 1, amount: 10 }, { categoryId: 2, amount: -10 }], ...shape,
    merge(values) { log.push('target.merge'); Object.assign(this, values); return this },
    save: async () => { log.push('target.save') }, serialize() { return { id: this.id, date: this.date.toISODate(), type: this.type, categories: this.categories } } }
  const before = JSON.stringify({ target: { ...target }, balances: [...categories].map(([id, c]) => [id, c.balance]) })
  const budget = { id: 1, getFundingPoolCategory: async () => ({ id: 2 }), related: () => ({ query: () => {
    const filters = []
    return { where(key, value) { filters.push([key, value]); return this }, firstOrFail: async () => {
      log.push('target.read')
      if (target.budgetId !== 1 || filters.some(([key, value]) => target[key] !== Number(value) && target[key] !== value)) {
        throw new Rejection('Row not found', { status: 404 })
      }
      return target
    } }
  } }) }
  const user = { useTransaction: () => undefined, related: () => ({ query: () => ({ forUpdate: () => ({ firstOrFail: async () => {
    log.push('gate')
    if (shape.wait) await shape.wait(target)
    return budget
  } }) }) }) }
  const source = await expressions()
  const reversal = 'for (const transCategory of transaction.categories)'
  const application = 'for (const transCategory of transaction.categories)'
  if (!source.transfer.includes(reversal) || !source.transfer.includes(application)) throw new Error('Missing financial loops')
  const instrumented = source.transfer.replace(reversal, `observeReversal(); ${reversal}`)
    .replace(application, `observeApplication(); ${application}`)
  const transfer = runInNewContext(instrumented, {
    encodeMonetaryAmount, requestFundingStorage, observeReversal: () => { log.push('reverse') }, observeApplication: () => { log.push('apply') },
    validateCategoryConservation, validateStoredCategoryConservation: async () => undefined,
    TransactionType, DateTime, Exception: Rejection, updateCategoryTransfer: {}, transactionFields: {},
    hasReplacementAllocations: runInNewContext(source.hasReplacementAllocations), validateTransactionSplits,
    removeUndefined: (value) => value,
    authorizeCategories: async () => { log.push('categories.authorize') },
    AccountTransaction: { query: ({ client }) => { if (client !== trx) throw new Error('Account read escaped transaction')
      return { where() { return this }, first: async () => { log.push('accounts.read'); return target.links ? { id: 1 } : null } }
    } },
    db: { transaction: async () => trx, from: () => ({ useTransaction(client) { if (client !== trx) throw new Error('Loan read escaped transaction'); return this },
      join() { return this }, where() { return this }, select() { return this }, first: async () => { log.push('loans.read'); return target.loan ? { id: 1 } : null } }) },
    budgetCategories: (id, { client }) => { if (id !== 1 || client !== trx) throw new Error('Category read escaped transaction')
      return { where(key, value) { this.id = value; return this }, firstOrFail() { return categories.get(this.id) } }
    },
  })
  const run = () => transfer({ auth: { user }, logger: { error: () => undefined }, request: { params: () => ({ tfrId: 10 }),
    validateUsing: async () => ({ date: '2025-03-01', type: 2, categories: [{ categoryId: 1, amount: 20 }, { categoryId: 2, amount: -20 }], ...request }) } })
  const snapshot = () => JSON.stringify({ target: { ...target }, balances: [...categories].map(([id, c]) => [id, c.balance]) })
  return { run, log, target, categories, before, snapshot }
}
const invalid = [
  { name: 'deleted funding', shape: { deleted: true }, status: 404 },
  { name: 'deleted rebalance', shape: { type: 3, deleted: true }, request: { type: 3 }, status: 404 },
  ...[0, 1, 4, 5, 99].map((type) => ({ name: `unrelated type${type}`, shape: { type }, status: 422 })),
  { name: 'rebalance targeted as funding', shape: { type: 3 }, status: 422 },
  { name: 'funding targeted as rebalance', request: { type: 3 }, status: 422 },
  { name: 'unknown request type', request: { type: 99 }, status: 422 },
  { name: 'one Account link', shape: { links: 1 }, status: 422 },
  { name: 'multiple Account links', shape: { links: 2 }, status: 422 },
  { name: 'Loan Account link', shape: { links: 1, accountType: 'loan' }, status: 422 },
  { name: 'legacy Loan ownership', shape: { loan: true }, status: 422 },
  ...[null, {}, [], [null], [{ categoryId: '1', amount: 10 }], [{ categoryId: 1, amount: '10' }], [{ categoryId: 1, amount: NaN }]]
    .map((categories, index) => ({ name: `unreadable allocations${index}`, shape: { categories }, status: 422 })),
  { name: 'nonexistent ID', shape: { id: 11 }, status: 404 },
  { name: 'foreign Budget', shape: { budgetId: 2 }, request: { date: '2025-04-01' }, status: 404 },
]
test.group('Funding/rebalance replacement admission without DB', () => {
  test('blocked target performs no financial work').with(invalid).run(async ({ assert }, scenario) => {
    const f = await harness(scenario.shape, scenario.request)
    try { await f.run(); assert.fail(`Expected rejection: ${scenario.name}`) }
    catch (error) { assert.equal(error.status, scenario.status, scenario.name) }
    assert.equal(f.snapshot(), f.before)
    assert.notInclude(f.log, 'target.merge'); assert.notInclude(f.log, 'target.save')
    assert.notInclude(f.log, 'category.save'); assert.notInclude(f.log, 'categories.authorize')
    assert.notInclude(f.log, 'reverse'); assert.notInclude(f.log, 'apply')
    assert.notInclude(f.log, 'commit'); assert.include(f.log, 'rollback')
    assert.isBelow(f.log.indexOf('gate'), f.log.indexOf('target.read'))
  })

  test('valid matching lifecycle preserves replacement arithmetic and distinct dates').with([2, 3]).run(async ({ assert }, type) => {
    const f = await harness({ type }, { type, date: type === 2 ? '2025-03-01' : '2025-04-01' })
    await f.run()
    assert.equal(f.target.date.toISODate(), type === 2 ? '2025-03-01' : '2025-04-01')
    assert.equal(f.target.type, type)
    assert.equal(f.categories.get(1).balance, 20); assert.equal(f.categories.get(2).balance, -20)
    assert.isBelow(f.log.indexOf('loans.read'), f.log.indexOf('target.merge'))
    assert.include(f.log, 'commit')
    assert.isBelow(f.log.indexOf('loans.read'), f.log.indexOf('reverse'))
    assert.include(f.log, 'apply')
  })

  test('optional funding metadata, zero allocations and duplicate IDs remain valid', async ({ assert }) => {
    const f = await harness({ categories: [{ categoryId: 1, amount: 5 }, { categoryId: 1, amount: 5 },
      { categoryId: 2, amount: -10 }, { categoryId: 2, amount: 0 }] })
    await f.run()
    assert.equal(f.categories.get(1).balance, 20)
    assert.equal(f.categories.get(2).balance, -20)
  })

  test('number artifacts are not treated as a legacy-money admission failure', async ({ assert }) => {
    const f = await harness({ categories: [{ categoryId: 1, amount: 0.30000000000000004 }, { categoryId: 2, amount: -0.3 }] })
    await f.run()
    assert.include(f.log, 'commit')
  })

  test('funding date validation follows successful target admission', async ({ assert }) => {
    const f = await harness({}, { date: '2025-04-01' })
    await assert.rejects(f.run, 'The date of a funding transaction cannot be changed.')
    assert.equal(f.snapshot(), f.before)
    assert.include(f.log, 'loans.read'); assert.notInclude(f.log, 'category.save')
  })

  test('waiter admits committed target state rather than a pre-gate shape').with(['deleted', 'type', 'links'])
    .run(async ({ assert }, field) => {
      const f = await harness({ wait: async (target) => { target[field] = field === 'deleted' ? true : field === 'type' ? 5 : 1 } })
      await assert.rejects(f.run)
      assert.notInclude(f.log, 'target.save'); assert.notInclude(f.log, 'category.save')
    })
})
