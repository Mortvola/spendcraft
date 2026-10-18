import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

async function method(file, name, context, dependencyLoader = false) {
  const text = await readFile(file, 'utf8')
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  let member
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) member = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  let body = member.body.getText(ast)
  // Replace only dynamic dependency loading; the production algorithm is unchanged.
  if (dependencyLoader) body = body.replace("await import('@adonisjs/lucid/services/db')", 'await loadDatabase()')
    .replace("await import('#models/Budget')", 'await loadBudget()')
  return runInNewContext(ts.transpileModule(`(async function(${member.parameters.map((p) => p.getText(ast)).join(',')}) ${body})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
}
const noop = async () => undefined

test.group('Remaining Budget writer characterization without DB', () => {
  test('unlink waits for Budget before fresh identity reads and preserves financial amounts', async ({ assert }) => {
    const events = []
    let acquire, entered
    const acquired = new Promise((resolve) => { acquire = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: noop }
    const link = { providerTransactionId: 'purchase', amount: -5,
      merge(values) { Object.assign(this, values); return this }, save: async () => { events.push('link.save') } }
    const account = { plaidAccountId: 'provider-account', balance: 95,
      merge(values) { Object.assign(this, values); return this }, save: async () => { events.push('account.save') },
      related: () => ({ query: async () => [link] }) }
    const institution = { accessToken: 'test-token', institutionId: 'provider-bank', plaidItemId: 'item', cursor: 'c1',
      merge(values) { Object.assign(this, values); return this }, save: async () => { events.push('institution.save') },
      related: () => ({ query: async () => [account] }) }
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'unlink', {
      db: { transaction: async () => owner }, budgetInstitutions: (budgetId, { client }) => {
        assert.equal(budgetId, 7); assert.strictEqual(client, owner)
        assert.include(events, 'budget.acquired')
        return { where() { return this }, firstOrFail: async () => { events.push('institution.read'); return institution } }
      }, app: { container: { make: async () => ({ removeItem: async (token) => { assert.equal(token, 'fresh-token'); events.push('remote.remove') } }) } },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner); events.push('user.bound') },
      related: () => ({ query: () => ({ forUpdate() { events.push('budget.wait'); return this },
        async firstOrFail() { entered(); await acquired; events.push('budget.acquired'); return { id: 7 } },
      }) }) }
    const operation = run({ request: { params: () => ({ instId: 1 }) }, auth: { user }, logger: { error: noop } })
    await waiting
    try {
      assert.deepEqual(events, ['user.bound', 'budget.wait'])
      // An earlier sync commits these values before unlink acquires Budget.
      institution.accessToken = 'fresh-token'; institution.cursor = 'c2'
      link.providerTransactionId = 'fresh-purchase'
    } finally { acquire() }
    await operation
    assert.deepEqual(events, ['user.bound', 'budget.wait', 'budget.acquired', 'institution.read',
      'remote.remove', 'institution.save', 'account.save', 'link.save', 'commit'])
    assert.isNull(institution.cursor); assert.isNull(institution.accessToken); assert.isNull(link.providerTransactionId)
    assert.equal(account.balance, 95); assert.equal(link.amount, -5)
  })

  test('unlink rolls back a failed Budget lookup before any provider or identity work', async ({ assert }) => {
    let rolledBack = false
    const owner = { rollback: async () => { rolledBack = true } }
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'unlink', {
      db: { transaction: async () => owner },
      budgetInstitutions: () => { throw new Error('Unexpected identity lookup') },
      app: { container: { make: () => { throw new Error('Unexpected provider work') } } },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this },
        firstOrFail: async () => { throw new Error('Budget not found') },
      }) }) }
    await assert.rejects(() => run({ auth: { user }, logger: { error: noop } }), 'Budget not found')
    assert.isTrue(rolledBack)
  })

  test('CheckUnassigned waits for fresh JSON selection and commits each Budget before acquiring the next', async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const stored = { categories: [], amount: 5 }
    const second = { categories: [], accountTransaction: { amount: 12 }, async save() {
      assert.include(events, 'gate2'); events.push('save2')
    } }
    let active = 0, next = 0
    const database = { transaction: async (callback) => {
      assert.equal(active, 0); active++
      const owner = { id: ++next }
      try { const result = await callback(owner); events.push(`commit${owner.id}`); return result }
      finally { active-- }
    } }
    const Budget = { query(options) {
      if (!options) return { select: async () => [{ id: 1 }, { id: 2 }] }
      const owner = options.client
      return { where(key, id) { assert.equal(key, 'id'); assert.equal(id, owner.id); return this },
        forUpdate() { return this }, async firstOrFail() {
          if (owner.id === 1) { entered(); await gate }
          else assert.include(events, 'commit1')
          events.push(`gate${owner.id}`)
          return { getUnassignedCategory: async ({ client }) => {
            assert.strictEqual(client, owner); return { id: 99 }
          }, related: () => ({ query: () => ({ useTransaction(client) {
            assert.strictEqual(client, owner); return this
          }, whereRaw(sql, args) {
            assert.equal(sql, 'jsonb_array_length(categories) = ?'); assert.deepEqual(Array.from(args), [0]); return this
          }, has(name) { assert.equal(name, 'accountTransaction'); return this }, async preload(name) {
            assert.equal(name, 'accountTransaction'); events.push(`read${owner.id}`)
            return owner.id === 1 ? (stored.categories.length === 0 ? [{ categories: [], accountTransaction: { amount: stored.amount }, save: async () => { throw new Error('Stale target selected') } }] : []) : [second]
          } }) }) }
        } }
    } }
    const run = await method('commands/CheckUnassigned.ts', 'checkUnassigned', {
      loadDatabase: async () => ({ default: database }), loadBudget: async () => ({ default: Budget }),
      console: { log: (message) => { events.push(message) } },
    }, true)
    const operation = run()
    await waiting
    assert.deepEqual(events, [])
    // A prior gated PATCH commits an explicit allocation before the command acquires Budget.
    stored.amount = 10; stored.categories = [{ categoryId: 20, amount: 10 }]
    release()
    await operation
    assert.deepEqual(stored.categories, [{ categoryId: 20, amount: 10 }])
    assert.equal(second.categories[0].categoryId, 99); assert.equal(second.categories[0].amount, 12)
    assert.deepEqual(events, ['gate1', 'read1', 'commit1', 'gate2', 'read2', 'save2', 'commit2', 'budget: 2, count: 1'])
  })

  test('CheckUnassigned rolls back a failed Budget without starting the next Budget', async ({ assert }) => {
    const events = []
    const owner = {}
    const run = await method('commands/CheckUnassigned.ts', 'checkUnassigned', {
      loadDatabase: async () => ({ default: { transaction: async (callback) => {
        try { await callback(owner); events.push('commit') }
        catch (error) { events.push('rollback'); throw error }
      } } }),
      loadBudget: async () => ({ default: { query(options) {
        if (!options) return { select: async () => [{ id: 1 }, { id: 2 }] }
        assert.strictEqual(options.client, owner)
        return { where() { return this }, forUpdate() { return this }, firstOrFail: async () => ({
          getUnassignedCategory: async ({ client }) => { assert.strictEqual(client, owner); return { id: 99 } },
          related: () => ({ query: () => ({ useTransaction(client) { assert.strictEqual(client, owner); return this },
            whereRaw() { return this }, has() { return this }, preload: async () => [{ categories: [], accountTransaction: { amount: 5 },
              save: async () => { throw new Error('save failed') } }],
          }) }),
        }) }
      } } }), console: { log: (error) => { events.push(error.message) } },
    }, true)
    await run()
    assert.deepEqual(events, ['rollback', 'save failed'])
  })

  test('remove-item command waits for Budget, reloads scoped identity and uses its owning transaction')
    .with(['success', 'changed-token', 'save-failure'])
    .run(async ({ assert }, scenario) => {
      const events = []
      let acquire, entered
      const acquired = new Promise((resolve) => { acquire = resolve })
      const waiting = new Promise((resolve) => { entered = resolve })
      const owner = {}
      const selection = { id: 12, budgetId: 7 }
      const fresh = { accessToken: 'access-test-token', plaidItemId: 'item', institutionId: 'fresh-bank',
        cursor: 'keep-cursor', async save() {
          assert.include(events, 'identity.reload')
          events.push('save')
          if (scenario === 'save-failure') throw new Error('Injected save failure')
        } }
      const errors = []
      const run = await method('commands/PlaidRemoveItem.ts', 'run', {
        env: { get: () => 'test' },
        db: { transaction: async (callback) => {
          try { await callback(owner); events.push('commit') }
          catch (error) { events.push('rollback'); throw error }
        } },
        Budget: { query: ({ client }) => {
          assert.strictEqual(client, owner)
          return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 7); return this },
            forUpdate() { events.push('budget.wait'); return this }, async firstOrFail() {
              entered(); await acquired; events.push('budget.acquired'); return { id: 7 }
            } }
        } },
        Institution: { query: (options) => {
          const filters = {}
          return { select(...fields) { assert.deepEqual(fields, ['id', 'budgetId']); return this },
            where(key, value) { filters[key] = value; return this }, async firstOrFail() {
              if (!options) { events.push('identity.discover'); return selection }
              assert.strictEqual(options.client, owner); assert.include(events, 'budget.acquired')
              assert.deepEqual(filters, { id: 12, budgetId: 7, accessToken: 'access-test-token' })
              events.push('identity.reload')
              if (scenario === 'changed-token') throw new Error('Row not found')
              return fresh
            } }
        } },
      })
      const context = { accessToken: 'access-test-token', logger: { info: noop, error: (error) => { errors.push(error) } },
        app: { container: { make: async () => ({ removeItem: async (token, institutionId) => {
          assert.equal(token, 'access-test-token'); assert.equal(institutionId, 'fresh-bank')
          events.push('remote.remove'); return {}
        } }) } } }
      const operation = run.call(context)
      await waiting
      try { assert.deepEqual(events, ['identity.discover', 'budget.wait']) }
      finally { acquire() }
      await operation
      assert.deepEqual(events, scenario === 'changed-token'
        ? ['identity.discover', 'budget.wait', 'budget.acquired', 'identity.reload', 'rollback']
        : ['identity.discover', 'budget.wait', 'budget.acquired', 'identity.reload', 'remote.remove', 'save',
          scenario === 'success' ? 'commit' : 'rollback'])
      assert.lengthOf(errors, scenario === 'success' ? 0 : 1)
      assert.equal(fresh.cursor, 'keep-cursor')
      if (scenario === 'success') { assert.isNull(fresh.accessToken); assert.isNull(fresh.plaidItemId) }
    })

  test('get-item fix fetches before Budget, revalidates identity and leaves inspection read-only')
    .with(['success', 'already-current', 'changed-token', 'save-failure', 'read-only'])
    .run(async ({ assert }, scenario) => {
      const events = [], errors = []
      let acquire, entered
      const acquired = new Promise((resolve) => { acquire = resolve })
      const waiting = new Promise((resolve) => { entered = resolve })
      const owner = {}
      const selection = { id: 12, budgetId: 7, plaidItemId: 'stale-item' }
      const fresh = { plaidItemId: scenario === 'already-current' ? 'provider-item' : 'fresh-local-item',
        cursor: 'keep-cursor', accessToken: 'access-test-token', async save() {
          events.push('save')
          if (scenario === 'save-failure') throw new Error('Injected save failure')
        } }
      const run = await method('commands/PlaidGetItem.ts', 'run', {
        env: { get: () => 'test' },
        db: { transaction: async (callback) => {
          try { await callback(owner); events.push('commit') }
          catch (error) { events.push('rollback'); throw error }
        } },
        Budget: { query: ({ client }) => {
          assert.strictEqual(client, owner)
          return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 7); return this },
            forUpdate() { events.push('budget.wait'); return this }, async firstOrFail() {
              entered(); await acquired; events.push('budget.acquired'); return { id: 7 }
            } }
        } },
        Institution: { findByOrFail: async (key, token) => {
          assert.equal(key, 'accessToken'); assert.equal(token, 'access-test-token')
          events.push('identity.discover'); return selection
        }, query: ({ client }) => {
          assert.strictEqual(client, owner); assert.include(events, 'budget.acquired')
          const filters = {}
          return { where(key, value) { filters[key] = value; return this }, async first() {
            assert.deepEqual(filters, { id: 12, budgetId: 7, accessToken: 'access-test-token' })
            events.push('identity.reload'); return scenario === 'changed-token' ? null : fresh
          } }
        } },
      })
      const context = { accessToken: 'access-test-token', fix: scenario !== 'read-only',
        logger: { info: noop, error: (error) => { errors.push(error) } },
        app: { container: { make: async () => ({ getItem: async (institution) => {
          assert.strictEqual(institution, selection); events.push('provider.get')
          return { item: { item_id: 'provider-item' } }
        } }) } } }
      const operation = run.call(context)
      if (scenario === 'read-only') {
        await operation
        assert.deepEqual(events, ['identity.discover', 'provider.get'])
      } else {
        await waiting
        try { assert.deepEqual(events, ['identity.discover', 'provider.get', 'budget.wait']) }
        finally { acquire() }
        await operation
        assert.deepEqual(events, ['identity.discover', 'provider.get', 'budget.wait', 'budget.acquired',
          'identity.reload', ...(['success', 'save-failure'].includes(scenario) ? ['save'] : []),
          scenario === 'save-failure' ? 'rollback' : 'commit'])
      }
      assert.lengthOf(errors, scenario === 'save-failure' ? 1 : 0)
      assert.equal(selection.plaidItemId, 'stale-item')
      if (scenario === 'success') assert.equal(fresh.plaidItemId, 'provider-item')
      if (scenario === 'changed-token') assert.equal(fresh.plaidItemId, 'fresh-local-item')
      assert.equal(fresh.cursor, 'keep-cursor'); assert.equal(fresh.accessToken, 'access-test-token')
    })

  test('installed Lucid upsert can create twice when both initial row lookups are absent', async ({ assert }) => {
    let lookups = 0, release
    const bothRead = new Promise((resolve) => { release = resolve })
    const stored = []
    const upsert = await method('node_modules/@adonisjs/lucid/build/src/orm/base_model/index.js', 'updateOrCreate', {
      managedTransaction: async (_client, callback) => callback({}),
    })
    const model = { boot: noop, $adapter: { modelConstructorClient: () => ({}) },
      query: () => ({ clientOptions: {}, forUpdate() { return this }, where() { return this }, async first() {
        if (++lookups === 2) release()
        await bothRead
        return undefined
      } }),
      newUpWithOptions: (values) => ({ async save() { stored.push(values) } }),
    }
    await Promise.all([upsert.call(model, { budgetId: 7, year: 2026 }, { data: { value: 1 } }),
      upsert.call(model, { budgetId: 7, year: 2026 }, { data: { value: 2 } })])
    assert.lengthOf(stored, 2)
    assert.isTrue(stored.every((row) => row.budgetId === 7 && row.year === 2026))
  })


  test('Category settings wait and reload before dirty-field persistence, preventing a hybrid', async ({ assert }) => {
    const stored = { name: 'Original', fundingAmount: 5, groupId: 10 }
    let tail = Promise.resolve()
    const readNames = []
    const run = await method('app/Controllers/Http/CategoriesController.ts', 'updateCategory', {
      db: { transaction: async (callback) => {
        const previous = tail
        let release
        tail = new Promise((resolve) => { release = resolve })
        const owner = { previous, acquired: false }
        try { return await callback(owner) } finally { release() }
      } },
      budgetGroups: (_id, { client }) => {
        assert.isTrue(client.acquired)
        return { where() { return this }, firstOrFail: async () => ({}) }
      },
      budgetCategories: (_id, { client }) => {
        assert.isTrue(client.acquired)
        return { where() { return this }, firstOrFail: async () => {
          const original = { ...stored }; readNames.push(original.name)
          return { ...original, merge(values) { Object.assign(this, values); return this }, async save() {
            for (const key of Object.keys(original)) if (this[key] !== original[key]) stored[key] = this[key]
          } }
        } }
      }, updateCategory: {},
      authorizeCategories: async (_id, _ids, { client }) => { assert.isTrue(client.acquired) },
      removeUndefined: (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    })
    const request = (name, fundingAmount) => {
      let owner
      return { auth: { user: { budgetId: 7, useTransaction(client) { owner = client },
        related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
          await owner.previous; owner.acquired = true
        } }) }) } }, request: {
        params: () => ({ groupId: '10', catId: '20' }), validateUsing: async (_validator, { meta }) => {
          assert.strictEqual(meta.trx, owner); return { name, fundingAmount }
        },
      } }
    }
    await Promise.all([run(request('A', 8)), run(request('B', 5))])
    assert.deepEqual(readNames, ['Original', 'A'])
    assert.deepEqual(stored, { name: 'B', fundingAmount: 5, groupId: 10 })
  })

})

for (const action of ['addGroup', 'updateGroup']) {
  test(`${action} waits before Group reads and binds validation and save to Budget transaction`, async ({ assert }) => {
    const events = []
    const owner = {}
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    class FakeGroup {
      useTransaction(client) { assert.strictEqual(client, owner); this.bound = true; return this }
      fill(values) { Object.assign(this, values); return this }
      merge(values) { return this.fill(values) }
      async save() { assert.isTrue(this.bound); events.push('save'); return this }
    }
    const group = new FakeGroup().useTransaction(owner)
    const run = await method('app/Controllers/Http/CategoriesController.ts', action, {
      db: { transaction: async (callback) => callback(owner) },
      Group: FakeGroup, GroupType: { NoGroup: 0, Regular: 1 },
      addGroup: 'add', updateGroup: 'update', removeUndefined: (values) => values,
      budgetGroups(budgetId, { client }) {
        assert.equal(budgetId, 7); assert.strictEqual(client, owner)
        assert.include(events, 'acquired'); events.push('read')
        return { where() { return this }, firstOrFail: async () => Object.assign(group, { id: 3 }) }
      },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate; events.push('acquired')
      } }) }) }
    const operation = run({ auth: { user }, request: {
      params: () => ({ groupId: 3 }),
      async validateUsing(_validator, { meta }) {
        assert.strictEqual(meta.trx, owner); assert.include(events, 'acquired'); events.push('validate')
        return { name: 'Fresh', hidden: false, parentGroupId: 4 }
      },
    } })
    await waiting
    assert.deepEqual(events, [])
    release()
    const response = await operation
    assert.equal(response.data.name, 'Fresh')
    assert.equal(events.at(-1), 'save')
    assert.equal(events.filter((event) => event === 'read').length, action === 'addGroup' ? 2 : 3)
  })
}

for (const action of ['deleteGroup', 'addCategory', 'updateCategory']) {
  for (const outcome of ['success', 'rejected']) {
    test(`${action} ${outcome}: waits for Budget, binds dependencies and writes, preserves response`, async ({ assert }) => {
      const events = []
      const owner = {}
      let release, entered
      const gate = new Promise((resolve) => { release = resolve })
      const waiting = new Promise((resolve) => { entered = resolve })
      const failure = new Error('validation failed')
      class FakeCategory {
        balance = 42
        useTransaction(client) { assert.strictEqual(client, owner); this.client = client; return this }
        fill(values) { Object.assign(this, values); return this }
        merge(values) { return this.fill(values) }
        async save() { assert.strictEqual(this.client, owner); events.push('save'); return this }
      }
      const category = new FakeCategory().useTransaction(owner)
      const group = {
        related: () => ({ query: () => ({ useTransaction(client) {
          assert.strictEqual(client, owner); assert.include(events, 'acquired'); events.push('membership')
          return Promise.resolve(outcome === 'rejected' ? [{}] : [])
        } }) }),
        async delete() { events.push('delete') },
      }
      const query = (value, budgetId, { client }) => {
        assert.equal(budgetId, 7); assert.strictEqual(client, owner); assert.include(events, 'acquired'); events.push('read')
        return { where() { return this }, firstOrFail: async () => value }
      }
      const run = await method('app/Controllers/Http/CategoriesController.ts', action, {
        db: { transaction: async (callback) => {
          try { const result = await callback(owner); events.push('commit'); return result }
          catch (error) { events.push('rollback'); throw error }
        } }, Category: FakeCategory, CategoryType: { Regular: 0, Bill: 1 },
        RequestErrorCode: { HAS_CHILDREN: 'HAS_CHILDREN' }, addCategory: {}, updateCategory: {},
        budgetGroups: (id, options) => query(group, id, options),
        budgetCategories: (id, options) => query(category, id, options),
        authorizeCategories: async (id, ids, options) => {
          assert.deepEqual(ids, [9]); query({}, id, options); events.push('funding.authorized')
        },
        removeUndefined: (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
      })
      const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
        related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
          entered(); await gate; events.push('acquired')
        } }) }) }
      let status
      const operation = run({ auth: { user }, response: { status(value) { status = value } }, request: {
        params: () => ({ groupId: '10', catId: '20' }),
        async validateUsing(_validator, { meta }) {
          assert.strictEqual(meta.trx, owner); assert.include(events, 'acquired')
          if (outcome === 'rejected') throw failure
          return { name: 'Fresh', fundingCategories: [{ categoryId: 9, amount: 5, percentage: false }] }
        },
      } })
      await waiting
      assert.deepEqual(events, [])
      release()
      if (outcome === 'rejected' && action !== 'deleteGroup') {
        await assert.rejects(() => operation, 'validation failed')
        assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'save')
      } else {
        const result = await operation
        assert.equal(events.at(-1), 'commit')
        if (action === 'deleteGroup') {
          assert.equal(status, outcome === 'rejected' ? 409 : 204)
          if (outcome === 'rejected') { assert.notInclude(events, 'delete'); assert.equal(result.errors[0].code, 'HAS_CHILDREN') }
          else assert.include(events, 'delete')
        } else {
          assert.equal(result.data.name, 'Fresh'); assert.include(events, 'funding.authorized')
          assert.equal(result.data.balance, action === 'addCategory' ? 0 : 42)
          assert.include(events, 'save')
        }
      }
    })
  }
}

for (const failure of [undefined, 'budget', 'cascade']) {
  test(`deleteAccount locks Budget before fresh scope/cascade and ${failure ?? 'commits'} without changing cascade rules`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
    const budget = { id: 7, $trx: owner }
    const account = { id: 20 }
    const balances = [{ id: 9, balance: 45 }]
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'deleteAccount', {
      db: { transaction: async () => owner },
      budgetInstitutions(id, { client }) {
        assert.equal(id, 7); assert.strictEqual(client, owner); assert.include(events, 'acquired')
        return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 10); return this },
          async firstOrFail() {
            events.push('institution')
            return { related: () => ({ query: () => ({
              useTransaction(trx) { assert.strictEqual(trx, owner); return this },
              where(key, value) { assert.equal(key, 'id'); assert.equal(value, 20); return this },
              async firstOrFail() { events.push('account'); return account },
            }) }) }
          } }
      },
      InstitutionController: { async deleteAccounts(accounts, scopedBudget) {
        assert.strictEqual(accounts[0], account); assert.strictEqual(scopedBudget, budget)
        events.push('cascade')
        if (failure === 'cascade') throw new Error('cascade failed')
        return balances
      } },
    })
    const user = { budgetId: 7, useTransaction(trx) { assert.strictEqual(trx, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate
        if (failure === 'budget') throw new Error('budget failed')
        events.push('acquired'); return budget
      } }) }) }
    const operation = run({ auth: { user }, request: { params: () => ({ instId: 10, acctId: 20 }) }, logger: { error: noop } })
    await waiting
    assert.deepEqual(events, [])
    release()
    if (failure) {
      await assert.rejects(() => operation, `${failure} failed`)
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (failure === 'budget') assert.notInclude(events, 'institution')
    } else {
      assert.strictEqual(await operation, balances)
      assert.deepEqual(events, ['acquired', 'institution', 'account', 'cascade', 'commit'])
    }
  })
}

for (const scenario of ['offline', 'online', 'budget-failure', 'remote-failure', 'delete-failure']) {
  test(`Institution delete ${scenario}: Budget precedes fresh reads, remote work and cascade`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
    const budget = { id: 7, $trx: owner }
    const accounts = [{ id: 20 }]
    const balances = [{ id: 9, balance: 45 }]
    const institution = { accessToken: scenario === 'offline' ? null : 'stale-token', institutionId: 'bank',
      related: () => ({ query: () => ({ useTransaction(trx) {
        assert.strictEqual(trx, owner); events.push('accounts'); return Promise.resolve(accounts)
      } }) }),
      async delete() { events.push('delete'); if (scenario === 'delete-failure') throw new Error('delete failed') },
    }
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'delete', {
      db: { transaction: async () => owner },
      budgetInstitutions(id, { client }) {
        assert.equal(id, 7); assert.strictEqual(client, owner); assert.include(events, 'acquired')
        return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 10); return this },
          async firstOrFail() { events.push('institution'); return institution } }
      },
      app: { container: { make: async () => ({ async removeItem(token, providerId) {
        assert.equal(token, 'fresh-token'); assert.equal(providerId, 'bank'); events.push('remote')
        if (scenario === 'remote-failure') throw new Error('remote failed')
      } }) } },
      InstitutionController: { async deleteAccounts(suppliedAccounts, suppliedBudget) {
        assert.strictEqual(suppliedAccounts, accounts); assert.strictEqual(suppliedBudget, budget)
        events.push('cascade'); return balances
      } },
    })
    const user = { budgetId: 7, useTransaction(trx) { assert.strictEqual(trx, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate
        if (scenario === 'budget-failure') throw new Error('budget failed')
        events.push('acquired'); return budget
      } }) }) }
    const operation = run({ auth: { user }, request: { params: () => ({ instId: 10 }) }, logger: { error: noop } })
    await waiting
    assert.deepEqual(events, [])
    // Earlier sync/unlink commits before this waiter can read authoritative identity.
    if (scenario !== 'offline') institution.accessToken = 'fresh-token'
    release()
    if (scenario.endsWith('failure')) {
      await assert.rejects(() => operation, `${scenario.split('-')[0]} failed`)
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (scenario === 'budget-failure') assert.notInclude(events, 'institution')
      if (scenario === 'remote-failure') assert.notInclude(events, 'cascade')
    } else {
      assert.strictEqual(await operation, balances)
      assert.deepEqual(events, ['acquired', 'institution', 'accounts', ...(scenario === 'online' ? ['remote'] : []), 'cascade', 'delete', 'commit'])
    }
  })
}

for (const scenario of ['transactions', 'balances', 'missing-institution', 'statement-failure']) {
  test(`addOfflineAccount ${scenario}: fresh parent and response balances follow Budget gate`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
    const pool = { id: 1, balance: 100 }
    const unassigned = { id: 2, balance: 5 }
    const budget = {
      async getFundingPoolCategory({ client }) {
        assert.strictEqual(client, owner); assert.include(events, 'acquired'); events.push('pool'); return pool
      },
      async getUnassignedCategory({ client }) {
        assert.strictEqual(client, owner); events.push('unassigned'); return unassigned
      },
    }
    class FakeAccount {
      id = 20
      useTransaction(client) { assert.strictEqual(client, owner); this.client = client }
      fill(values) { Object.assign(this, values) }
      async save() { assert.strictEqual(this.client, owner); events.push('account.save') }
      related(name) {
        assert.equal(name, 'statements'); assert.strictEqual(this.client, owner)
        return { create: async (values) => {
          assert.equal(values.startingBalance, 10); assert.equal(values.endingBalance, 10)
          assert.isNull(values.data); events.push('statement')
          if (scenario === 'statement-failure') throw new Error('statement failed')
        } }
      }
    }
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'addOfflineAccount', {
      db: { transaction: async () => owner }, addOfflineAccount: {}, Account: FakeAccount,
      TrackingType: { Transactions: 'transactions', Balances: 'balances' },
      DateTime: { fromISO: (value) => ({ toISODate: () => value }) },
      budgetInstitutions(id, { client }) {
        assert.equal(id, 7); assert.strictEqual(client, owner); assert.include(events, 'acquired')
        return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 3); return this },
          async firstOrFail() { events.push('institution'); if (scenario === 'missing-institution') throw new Error('not found'); return { id: 3 } } }
      },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate; events.push('acquired'); return budget
      } }) }) }
    const operation = run({ auth: { user }, logger: { error: noop }, request: {
      params: () => ({ instId: 3 }), validateUsing: async () => ({ name: 'New', balance: 10,
        startDate: '2025-01-01', tracking: scenario === 'transactions' ? 'transactions' : 'balances', type: 'depository', subtype: 'checking' }),
    } })
    await waiting
    assert.deepEqual(events, [])
    pool.balance = 80 // A preceding writer commits while this operation waits.
    release()
    if (scenario === 'missing-institution' || scenario === 'statement-failure') {
      await assert.rejects(() => operation, scenario === 'missing-institution' ? 'not found' : 'statement failed')
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (scenario === 'missing-institution') assert.notInclude(events, 'account.save')
    } else {
      const result = await operation
      assert.equal(result.data.account.balance, 10)
      assert.equal(result.data.categories[0].balance, 80)
      assert.equal(result.data.categories[1].balance, 5)
      assert.equal(events.filter((event) => event === 'statement').length, scenario === 'balances' ? 1 : 0)
      assert.equal(events.at(-1), 'commit')
    }
    assert.equal(pool.balance, 80); assert.equal(unassigned.balance, 5)
  })
}

for (const scenario of ['success', 'missing', 'save-failure']) {
  test(`updateOffline ${scenario}: waits for Budget before scoped rename`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
    const institution = { name: 'Old', accessToken: 'current-token', cursor: 'current-cursor',
      merge(values) { assert.deepEqual(Object.keys(values), ['name']); Object.assign(this, values) },
      async save() { events.push('save'); if (scenario === 'save-failure') throw new Error('save failed') },
    }
    const run = await method('app/Controllers/Http/InstitutionController.ts', 'updateOffline', {
      db: { transaction: async () => owner }, update: {},
      budgetInstitutions(id, { client }) {
        assert.equal(id, 7); assert.strictEqual(client, owner); assert.include(events, 'acquired')
        return { where(key, value) { assert.equal(key, 'id'); assert.equal(value, 3); return this },
          async firstOrFail() { events.push('institution'); if (scenario === 'missing') throw new Error('not found'); return institution } }
      },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate; events.push('acquired')
      } }) }) }
    const operation = run({ auth: { user }, logger: { error: noop }, request: {
      params: () => ({ instId: 3 }), validateUsing: async () => ({ name: 'Renamed' }),
    } })
    await waiting
    assert.deepEqual(events, [])
    release()
    if (scenario === 'success') {
      assert.equal((await operation).name, 'Renamed')
      assert.deepEqual(events, ['acquired', 'institution', 'save', 'commit'])
    } else {
      await assert.rejects(() => operation, scenario === 'missing' ? 'not found' : 'save failed')
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (scenario === 'missing') assert.notInclude(events, 'save')
    }
    assert.equal(institution.accessToken, 'current-token'); assert.equal(institution.cursor, 'current-cursor')
  })
}

for (const scenario of ['success', 'missing', 'save-failure']) {
  test(`dedup ${scenario}: fresh active scoped target follows Budget and only marker changes`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = {}
    const filters = []
    const transaction = { duplicateOfTransactionId: 99, categories: [{ categoryId: 3, amount: 10 }], version: 4,
      async save() { events.push('save'); if (scenario === 'save-failure') throw new Error('save failed') },
    }
    const run = await method('app/Controllers/Http/TransactionsController.ts', 'dedup', {
      db: { transaction: async (callback) => {
        try { const result = await callback(owner); events.push('commit'); return result }
        catch (error) { events.push('rollback'); throw error }
      } },
      Transaction: { query({ client }) {
        assert.strictEqual(client, owner); assert.include(events, 'acquired'); events.push('query')
        return { where(key, value) { filters.push([key, value]); return this },
          andWhere(key, value) { return this.where(key, value) },
          async firstOrFail() { if (scenario === 'missing') throw new Error('not found'); return transaction } }
      } },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate; events.push('acquired')
      } }) }) }
    const operation = run({ auth: { user }, request: { params: () => ({ trxId: 20 }) } })
    await waiting
    assert.deepEqual(events, [])
    transaction.categories = [{ categoryId: 3, amount: 15 }] // Prior PATCH commits before the waiter reads.
    release()
    if (scenario === 'success') {
      assert.isUndefined(await operation); assert.isNull(transaction.duplicateOfTransactionId)
      assert.deepEqual(events, ['acquired', 'query', 'save', 'commit'])
    } else {
      await assert.rejects(() => operation, scenario === 'missing' ? 'not found' : 'save failed')
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (scenario === 'missing') { assert.notInclude(events, 'save'); assert.equal(transaction.duplicateOfTransactionId, 99) }
    }
    assert.deepEqual(filters, [['id', 20], ['budgetId', 7], ['deleted', false]])
    assert.deepEqual(transaction.categories, [{ categoryId: 3, amount: 15 }]); assert.equal(transaction.version, 4)
  })
}

for (const scenario of ['create', 'update', 'save-failure', 'create-failure']) {
  test(`tax forecast ${scenario}: Budget precedes scoped lookup and owning-transaction persistence`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = {}
    const forecast = { taxableInterest: 25 }
    const existing = { year: 2026, data: { taxableInterest: 5 }, async save() {
      events.push('save'); if (scenario === 'save-failure') throw new Error('save failed')
    } }
    const filters = []
    const run = await method('app/Controllers/Http/TaxesController.ts', 'post', {
      addTax: {}, db: { transaction: async (callback) => {
        try { const result = await callback(owner); events.push('commit'); return result }
        catch (error) { events.push('rollback'); throw error }
      } },
      Tax: {
        query({ client }) {
          assert.strictEqual(client, owner); assert.include(events, 'acquired'); events.push('query')
          return { where(key, value) { filters.push([key, value]); return this },
            first: async () => ['update', 'save-failure'].includes(scenario) ? existing : null }
        },
        async create(values, { client }) {
          assert.strictEqual(client, owner); assert.equal(values.budgetId, 7); events.push('create')
          if (scenario === 'create-failure') throw new Error('create failed')
          return values
        },
      },
      TaxesController: { async getActuals(year, budgetId) {
        assert.equal(events.at(-1), 'commit'); assert.equal(year, 2026); assert.equal(budgetId, 7)
        events.push('actuals'); return []
      } },
    })
    const user = { useTransaction(client) { assert.strictEqual(client, owner) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate; events.push('acquired'); return { id: 7 }
      } }) }) }
    const operation = run({ auth: { user }, request: { validateUsing: async () => ({ year: 2026, forecast }) } })
    await waiting
    assert.deepEqual(events, [])
    release()
    if (scenario.endsWith('failure')) {
      await assert.rejects(() => operation, scenario === 'save-failure' ? 'save failed' : 'create failed')
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'actuals')
    } else {
      const response = await operation
      assert.equal(response.data.year, 2026); assert.equal(response.data.forecast.taxableInterest, 25)
      assert.deepEqual(Array.from(response.data.actuals), [])
      assert.equal(events.at(-1), 'actuals')
    }
    assert.deepEqual(filters, [['budgetId', 7], ['year', 2026]])
  })
}

test('tax forecast concurrent first saves reload after Budget and create only once', async ({ assert }) => {
  let tail = Promise.resolve()
  let stored = null
  let creates = 0
  const run = await method('app/Controllers/Http/TaxesController.ts', 'post', {
    addTax: {}, db: { transaction: async (callback) => {
      const previous = tail
      let release
      tail = new Promise((resolve) => { release = resolve })
      try { return await callback({ previous }) } finally { release() }
    } },
    Tax: {
      query: () => ({ where() { return this }, first: async () => stored }),
      async create(values) { creates++; stored = { ...values, save: noop }; return stored },
    }, TaxesController: { getActuals: async () => [] },
  })
  function context(value) {
    let owner
    return { auth: { user: { useTransaction(trx) { owner = trx }, related: () => ({ query: () => ({
      forUpdate() { return this }, async firstOrFail() { await owner.previous; return { id: 7 } },
    }) }) } }, request: { validateUsing: async () => ({ year: 2026, forecast: { taxableInterest: value } }) } }
  }
  await Promise.all([run(context(10)), run(context(20))])
  assert.equal(creates, 1); assert.equal(stored.data.taxableInterest, 20)
})

for (const scenario of ['other-user', 'last-user', 'budget-failure', 'cleanup-failure']) {
  test(`User delete ${scenario}: Budget precedes deletion and fresh membership/cleanup`, async ({ assert }) => {
    const events = []
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const waiting = new Promise((resolve) => { entered = resolve })
    const owner = { commit: async () => { events.push('commit') }, rollback: async () => { events.push('rollback') } }
    const budget = { related(name) { return { query: async () => {
      assert.include(events, 'acquired'); events.push(name)
      if (scenario === 'cleanup-failure') throw new Error('cleanup failed')
      return []
    } } }, async delete() { events.push('budget.delete') } }
    const run = await method('app/Controllers/Http/UsersController.ts', 'delete', {
      console: { log: noop }, db: { transaction: async () => owner },
      User: { query({ client }) {
        assert.strictEqual(client, owner); assert.include(events, 'user.delete')
        return { async where(key, id) {
          assert.equal(key, 'budgetId'); assert.equal(id, 7); events.push('membership')
          return scenario === 'other-user' ? [{}] : []
        } }
      } },
    })
    const user = { budgetId: 7, useTransaction(client) { assert.strictEqual(client, owner) },
      async delete() { assert.include(events, 'acquired'); events.push('user.delete') },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        entered(); await gate
        if (scenario === 'budget-failure') throw new Error('budget failed')
        events.push('acquired'); return budget
      } }) }) }
    const operation = run({ auth: { user } })
    await waiting
    assert.deepEqual(events, [])
    release()
    if (scenario.endsWith('failure')) {
      await assert.rejects(() => operation, scenario === 'budget-failure' ? 'budget failed' : 'cleanup failed')
      assert.equal(events.at(-1), 'rollback'); assert.notInclude(events, 'commit')
      if (scenario === 'budget-failure') assert.notInclude(events, 'user.delete')
    } else {
      assert.isUndefined(await operation)
      assert.deepEqual(events, ['acquired', 'user.delete', 'membership',
        ...(scenario === 'last-user' ? ['institutions', 'transactions', 'groups', 'budget.delete'] : []), 'commit'])
    }
  })
}

test('two same-Budget user deletions serialize and the final member removes Budget', async ({ assert }) => {
  const members = new Set([1, 2])
  let tail = Promise.resolve()
  let budgetDeletes = 0
  const run = await method('app/Controllers/Http/UsersController.ts', 'delete', {
    console: { log: noop },
    db: { transaction: async () => {
      const previous = tail
      let release
      tail = new Promise((resolve) => { release = resolve })
      return { previous, commit: async () => release(), rollback: async () => release() }
    } },
    User: { query: () => ({ where: async () => [...members] }) },
  })
  function context(id) {
    let owner
    const budget = { related: () => ({ query: async () => [] }), delete: async () => { budgetDeletes++ } }
    return { auth: { user: { budgetId: 7,
      useTransaction(client) { owner = client }, delete: async () => { members.delete(id) },
      related: () => ({ query: () => ({ forUpdate() { return this }, async firstOrFail() {
        await owner.previous; return budget
      } }) }),
    } } }
  }
  await Promise.all([run(context(1)), run(context(2))])
  assert.equal(members.size, 0); assert.equal(budgetDeletes, 1)
})
