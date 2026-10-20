import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function ast(text) { return ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true) }
function methods(text) {
  const source = ast(text)
  const result = new Map()
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.body) result.set(node.name.getText(source), node.getText(source))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

for (const name of ['addGroup', 'updateGroup', 'addCategory', 'updateCategory']) {
  test(`${name} actual uniqueness filter binds owner before scoped SQL`, async ({ assert }) => {
    const source = ast(await readFile('app/validation/Validators/category.ts', 'utf8'))
    const declaration = source.statements.find((node) => ts.isVariableStatement(node)
      && node.declarationList.declarations.some((entry) => entry.name.getText(source) === name))
    let filter
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'filter') filter = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(declaration)
    const run = runInNewContext(ts.transpileModule(`(${filter.getText(source)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText)
    const owner = {}
    const calls = []
    const query = {
      useTransaction(client) { assert.strictEqual(client, owner); calls.push('owner'); return this },
      where(key, value) { assert.equal(calls[0], 'owner'); calls.push([key, value]); return this },
      andWhereNot(key, value) { calls.push([key, value]); return this },
      andWhereRaw(sql, bindings) { calls.push([sql, ...bindings]); return this },
    }
    run(query, 'Name', { meta: { trx: owner, budgetId: 7, groupId: 3, catId: 5, noGroupId: 9 }, data: {} })
    assert.equal(calls[0], 'owner')
    assert.deepEqual(calls[1], name.includes('Group') ? ['application_id', 7] : ['group_id', 3])
    if (name.startsWith('update')) assert.deepEqual(calls.at(-1), ['id', name.includes('Group') ? 3 : 5])
  })
}

test('Plaid sync waiter refreshes after Budget and rejects an earlier committed unlink before provider work', async ({ assert }) => {
  const source = ast(await readFile('app/Models/Institution.ts', 'utf8'))
  let node
  function visit(value) {
    if (ts.isMethodDeclaration(value) && value.name.getText(source) === 'syncUpdate') node = value
    ts.forEachChild(value, visit)
  }
  visit(source)
  const events = []
  const run = runInNewContext(ts.transpileModule(`(async function() ${node.body.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { logger: { error: () => undefined } })
  const institution = { accessToken: 'stale-token', $trx: {},
    related: () => ({ query: () => ({ forUpdate() { events.push('gate'); return this },
      firstOrFail: async () => { events.push('acquired'); return {} },
    }) }),
    async refresh() { events.push('refresh'); this.accessToken = null },
  }
  await assert.rejects(() => run.call(institution), 'access token is null')
  assert.deepEqual(events, ['gate', 'acquired', 'refresh'])
})

test('storage and approved tenant-scoping corrections preserve unrelated methods', async ({ assert }) => {
  const changedMethods = new Map([
    ['app/Controllers/Http/AccountsController.ts', ['addTransaction']],
    ['app/Models/Account.ts', ['updateTransaction', 'addTransaction', 'processOfx', 'updateStartingBalance']],
    ['app/Controllers/Http/TransactionsController.ts', ['update']],
    // Category GET scoping was separately authorized; its four SQL bindings have dedicated regressions.
    ['app/Controllers/Http/CategoriesController.ts', ['transfer', 'deleteCategory', 'get']],
  ])
  for (const file of ['app/Controllers/Http/ReportController.ts', 'app/Controllers/Http/AccountsController.ts',
    'app/Models/Account.ts', 'app/Models/Institution.ts', 'app/Controllers/Http/InstitutionController.ts',
    'app/Controllers/Http/TransactionsController.ts', 'app/Controllers/Http/CategoriesController.ts',
    'app/Controllers/Http/TaxesController.ts']) {
    const current = methods(await readFile(file, 'utf8'))
    const before = methods(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }))
    for (const [name, body] of before) {
      if (!(changedMethods.get(file) ?? []).includes(name)) assert.equal(current.get(name), body, `${file}:${name}`)
    }
  }
})
