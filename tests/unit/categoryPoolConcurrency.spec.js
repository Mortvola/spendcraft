import { categoryNonzeroAllocationSql, encodeMonetaryAmount } from '../../app/services/categoryAmountCodec.ts'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { CategoryType, TrackingType } from '../../common/ResponseTypes.ts'

// Executes current protocol against inert adapters; no app/ORM/DB bootstrap.
async function method(file, name, context = {}) {
  const text = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!found?.body) throw new Error(`Missing ${file}:${name}`)
  const body = found.body.getText(ast)
  const expression = `(async function(${found.parameters.map((p) => p.getText(ast)).join(',')}) ${body})`
  return { body, run: runInNewContext(ts.transpileModule(expression,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { encodeMonetaryAmount, ...context }) }
}
const institutions = 'app/Controllers/Http/InstitutionController.ts'
const categories = 'app/Controllers/Http/CategoriesController.ts'
const noop = async () => undefined
async function offlineFixture({ competing = false, balances = [10], tracking = TrackingType.Transactions } = {}) {
  let storedPool = 100; let saves = 0; let nextId = 0; let gated = false; let statements = 0
  const owner = { commit: noop, rollback: noop }
  const pool = { id: 5, balance: -999, async save() { saves++; storedPool = this.balance } }
  const seen = []
  const institution = { id: 1, syncDate: null, related: () => ({ create: async (values) => ({
    ...values, id: ++nextId, related: () => ({ create: async () => { statements++ } }),
    async updateStartingBalance(budget, suppliedPool) {
      seen.push(suppliedPool); await Promise.resolve(); suppliedPool.balance += this.balance
    },
  }) }) }
  const budget = { id: 1, getFundingPoolCategory: async ({ client }) => {
    if (!gated || client !== owner) throw new Error('Pool read outside acquired gate/owning transaction')
    pool.balance = storedPool; return pool
  }, related: () => ({ create: async () => institution }) }
  const user = { useTransaction(trx) { if (trx !== owner) throw new Error('Wrong user transaction') },
    related: () => ({ query: () => ({ forUpdate() { return this }, firstOrFail: async () => {
      if (competing) storedPool -= 20 // Earlier owner commits before waiter acquires gate.
      gated = true; return budget
    } }) }) }
  const { run } = await method(institutions, 'addOffline', {
    db: { transaction: async () => owner }, TrackingType, addInstitutionOffline: {},
  })
  await run({ auth: { user }, logger: { error: noop }, request: { validateUsing: async () => ({
    institution: { name: 'Offline' }, startDate: { toISODate: () => '2025-01-01' },
    accounts: balances.map((balance) => ({ name: 'New', balance, tracking })),
  }) } })
  return { storedPool, saves, seen, pool, statements }
}
async function deletionFixture(outcome) {
  const events = []
  let status
  const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
  const category = { id: 1, type: CategoryType.Regular, delete: async () => { events.push('delete') } }
  const chain = (value) => ({ where() { return this }, whereHas() { return this }, async firstOrFail() {
    events.push('scope.read'); if (outcome === 'missing' && value === category) throw new Error('Row not found'); return value
  } })
  const user = { budgetId: 3, useTransaction(trx) { if (trx !== owner) throw new Error('Wrong user trx') },
    related: () => ({ query: () => ({ forUpdate() { events.push('gate'); return this },
      firstOrFail: async () => { events.push('acquired'); return { id: 3 } } }) }) }
  const { run } = await method(categories, 'deleteCategory', {
    categoryNonzeroAllocationSql,
    db: { transaction: async () => owner, query: () => ({ useTransaction(trx) {
      if (trx !== owner || !events.includes('acquired')) throw new Error('Membership escaped gate/trx')
      events.push('membership.bound'); return this
    }, select() { return this }, from() { return this }, where(column, value) {
      if (column === 'application_id') {
        if (value !== user.budgetId) throw new Error('Wrong membership Budget')
        events.push('membership.scoped')
      }
      return this
    }, whereRaw() { return this },
    first: async () => {
      events.push('membership.read')
      return outcome === 'used' || (outcome === 'foreign' && !events.includes('membership.scoped')) ? { id: 10 } : undefined
    } }) },
    budgetGroups: (id, { client }) => { if (client !== owner) throw new Error('Group read escaped'); return chain({ id: 2 }) },
    budgetCategories: (id, { client }) => { if (client !== owner) throw new Error('Category read escaped'); return chain(category) },
    CategoryType, RequestErrorCode: { HAS_CHILDREN: 'HAS_CHILDREN' },
  })
  const invoke = () => run({ request: { params: () => ({ groupId: 2, catId: 1 }) }, auth: { user },
    logger: { error: noop }, response: { status: (value) => { status = value } } })
  return { invoke, events, status: () => status }
}

test.group('Category/Pool bounded Budget protocol (no database)', () => {
  test('initialization waiter reloads Pool after committed funding; final90 not110', async ({ assert }) => {
    const f = await offlineFixture({ competing: true })
    assert.equal(f.storedPool, 90); assert.equal(f.saves, 1)
  })
  test('batch shares fresh Pool and accumulates before one save', async ({ assert }) => {
    const f = await offlineFixture({ balances: [10, 20, -5] })
    assert.equal(f.storedPool, 125); assert.equal(f.saves, 1)
    assert.lengthOf(f.seen, 3); assert.isTrue(f.seen.every((pool) => pool === f.pool))
  })
  test('Balances tracking creates Statements without opening/Pool delta', async ({ assert }) => {
    const f = await offlineFixture({ balances: [10, 20], tracking: TrackingType.Balances })
    assert.equal(f.storedPool, 100); assert.equal(f.statements, 2); assert.lengthOf(f.seen, 0)
  })
  test('both offline routes gate reads while only new-Institution creation posts opening effects', async ({ assert }) => {
    const fresh = await method(institutions, 'addOffline')
    const existing = await method(institutions, 'addOfflineAccount')
    assert.isBelow(fresh.body.indexOf('.forUpdate()'), fresh.body.indexOf('getFundingPoolCategory'))
    assert.isBelow(fresh.body.indexOf('.forUpdate()'), fresh.body.indexOf("related('institutions').create"))
    assert.include(fresh.body, 'getFundingPoolCategory({ client: trx })')
    assert.include(existing.body, '.forUpdate()')
    assert.isBelow(existing.body.indexOf('.forUpdate()'), existing.body.indexOf('budgetInstitutions('))
    assert.notInclude(existing.body, 'updateStartingBalance')
    assert.notInclude(existing.body, 'fundingPool.save')
    const helper = await method('app/Models/Account.ts', 'updateStartingBalance')
    assert.notInclude(helper.body, 'fundingPool.save')
  })
  test('Category waiter sees committed usage and returns409 before deletion', async ({ assert }) => {
    const f = await deletionFixture('used'); await f.invoke()
    assert.equal(f.status(), 409); assert.notInclude(f.events, 'delete'); assert.include(f.events, 'rollback')
    assert.isBelow(f.events.indexOf('acquired'), f.events.indexOf('scope.read'))
    assert.isBelow(f.events.indexOf('scope.read'), f.events.indexOf('membership.read'))
  })
  test('fresh unused Category deletes only after bound membership check', async ({ assert }) => {
    const f = await deletionFixture('unused'); await f.invoke()
    assert.equal(f.status(), 204); assert.isBelow(f.events.indexOf('membership.read'), f.events.indexOf('delete'))
    assert.include(f.events, 'membership.bound'); assert.include(f.events, 'commit')
  })
  test('foreign cross-linked allocations cannot block owning Budget Category deletion', async ({ assert }) => {
    const f = await deletionFixture('foreign'); await f.invoke()
    assert.equal(f.status(), 204)
    assert.isBelow(f.events.indexOf('acquired'), f.events.indexOf('membership.scoped'))
    assert.isBelow(f.events.indexOf('membership.scoped'), f.events.indexOf('membership.read'))
    assert.include(f.events, 'delete'); assert.include(f.events, 'commit')
  })
  test('missing/deleted Category after wait rejects without another deletion', async ({ assert }) => {
    const f = await deletionFixture('missing'); await assert.rejects(f.invoke, 'Row not found')
    assert.notInclude(f.events, 'delete'); assert.notInclude(f.events, 'membership.read'); assert.include(f.events, 'rollback')
  })
  test('Category gate precedes scoped reads and changes no substantive admission rule', async ({ assert }) => {
    const { body } = await method(categories, 'deleteCategory')
    assert.isBelow(body.indexOf('.forUpdate()'), body.indexOf('budgetGroups('))
    assert.include(body, 'db.query().useTransaction(trx)')
    assert.notInclude(body, 'category.balance'); assert.include(body, "where('deleted', false)")
  })
  test('shared cascade arithmetic remains unchanged and acquires no additional explicit lock', async ({ assert }) => {
    for (const name of ['deleteAccount', 'delete']) {
      const entry = await method(institutions, name)
      assert.include(entry.body, '.forUpdate()')
      assert.isBelow(entry.body.indexOf('.forUpdate()'), entry.body.indexOf('budgetInstitutions('))
    }
    const { body } = await method(institutions, 'deleteAccounts')
    assert.notInclude(body, 'forUpdate')
    assert.include(body, 'category.balance -= tc.amount'); assert.notInclude(body, 'transaction.deleted')
  })
})
