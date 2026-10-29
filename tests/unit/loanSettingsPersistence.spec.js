import { test } from '@japa/runner'
import { BaseModel } from '@adonisjs/lucid/orm'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { CategoryType } from '../../common/ResponseTypes.js'
import { inputMoneyCents } from '../../client-src/monetary.js'
import { formatMoneyCents } from '../../common/moneyCents.js'
import { addLoan, updateLoan } from '../../app/validation/Validators/loan.js'

// No application bootstrap or database adapter. Exercise the installed Lucid
// dirty-field save algorithm against an explicitly inert adapter.
function persistence() {
  class Settings extends BaseModel {}
  Settings.boot()
  for (const name of ['id', 'rate', 'startingBalance']) {
    Settings.$addColumn(name, { isPrimary: name === 'id' })
  }
  const row = { id: 1, rate: 5, starting_balance: 100 }
  const writes = []
  Settings.$adapter = {
    async update(_model, values) {
      writes.push({ ...values })
      Object.assign(row, values)
    },
  }
  return { row, writes, load: () => Settings.$createFromAdapterResult({ ...row }) }
}
const valid = { name: ' Loan ', rate: 5, startDate: '2025-01-01', startingBalance: '100.00' }

test.group('Loan settings persistence investigation (no database)', () => {
  test('UPDATE requires all four fields; it is not a partial settings PATCH')
    .with(['name', 'rate', 'startDate', 'startingBalance']).run(async ({ assert }, field) => {
      const request = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field))
      await assert.rejects(() => updateLoan.validate(request))
    })

  test('current coercion and null/empty behavior remains characterized').with([
    { field: 'rate', value: -2, accepted: true, result: -2 },
    { field: 'startingBalance', value: '-20.00', accepted: true, result: -20 },
    { field: 'rate', value: '8.25', accepted: true, result: 8.25 },
    { field: 'startingBalance', value: '200.75', accepted: true, result: 200.75 },
    { field: 'startDate', value: 'invalid-date', accepted: false },
    { field: 'rate', value: 0, accepted: true, result: 0 },
    { field: 'startingBalance', value: '0.00', accepted: true, result: 0 },
    { field: 'rate', value: false, accepted: true, result: 0 },
    { field: 'startingBalance', value: false, accepted: false },
    { field: 'rate', value: '', accepted: true, result: 0 },
    { field: 'startingBalance', value: '', accepted: false },
    { field: 'rate', value: null, accepted: false },
    { field: 'startingBalance', value: null, accepted: false },
    { field: 'rate', value: {}, accepted: false },
    { field: 'name', value: '', accepted: false },
    { field: 'name', value: null, accepted: false },
    { field: 'startDate', value: null, accepted: false },
  ]).run(async ({ assert }, scenario) => {
    const request = { ...valid, [scenario.field]: scenario.value }
    if (!scenario.accepted) await assert.rejects(() => updateLoan.validate(request))
    else assert.strictEqual((await updateLoan.validate(request))[scenario.field], scenario.result)
  })

  test('validation trims name and retains complete settings values', async ({ assert }) => {
    const data = await updateLoan.validate(valid)
    assert.equal(data.name, 'Loan')
    assert.equal(data.rate, 5)
    assert.equal(data.startingBalance, 100)
    assert.equal(data.startDate.toISODate(), '2025-01-01')
  })

  test('Loan CREATE/PATCH decode canonical money and keep rates numeric').with([
    [12.345, '12.35'], [-0.125, '-0.12'], [0.125, '0.13'], [1.005, '1.01'],
    [0.1 + 0.2, '0.30'], [-0, '0.00'], [-0.005, '0.00'],
  ]).run(async ({ assert }, [value, encoded]) => {
    assert.strictEqual(formatMoneyCents(inputMoneyCents(String(value))), encoded)
    const created = await addLoan.validate({ name: ' Loan ', rate: 5.125, startDate: '2025-01-01', amount: encoded })
    const updated = await updateLoan.validate({ ...valid, rate: 5.125, startingBalance: encoded })
    assert.strictEqual(created.amount, Number(encoded))
    assert.strictEqual(updated.startingBalance, Number(encoded))
    assert.strictEqual(created.rate, 5.125)
    assert.strictEqual(updated.rate, 5.125)
    assert.strictEqual(created.name, 'Loan')
  })
  test('Loan CREATE/PATCH reject numeric, noncanonical and unsafe monetary values').with([
    1, 0, -0, undefined, null, false, '', '1', '1.2', '1.005', '1e2', '+1.00', '01.00', '-0.00',
    ' 1.00 ', 'Infinity', '90071992547409.92', Infinity, NaN,
  ]).run(async ({ assert }, value) => {
    await assert.rejects(() => addLoan.validate({ name: 'Loan', rate: 5, startDate: '2025-01-01', amount: value }))
    await assert.rejects(() => updateLoan.validate({ ...valid, startingBalance: value }))
  })
  test('Loan CREATE passes decoded numbers into the unchanged transaction-bound controller', async ({ assert }) => {
    let saved
    const events = [], owner = { commit: async () => events.push('commit'), rollback: async () => events.push('rollback') }
    class FakeCategory {
      useTransaction(trx) { assert.strictEqual(trx, owner); return this }
      fill(values) { Object.assign(this, values) }
      related(name) { assert.strictEqual(name, 'group'); return { associate: async group => assert.strictEqual(group.id, 2) } }
    }
    class FakeLoan {
      useTransaction(trx) { assert.strictEqual(trx, owner); return this }
      fill(values) { saved = values }
      related(name) { assert.strictEqual(name, 'category'); return { associate: async category => assert.instanceOf(category, FakeCategory) } }
    }
    const run = await controller({ addLoan, CategoryType, Category: FakeCategory, Loan: FakeLoan,
      db: { transaction: async () => owner },
      Group: { query({ client }) { assert.strictEqual(client, owner); return { where: () => ({ firstOrFail: async () => ({ id: 2 }) }) } } } }, 'add')
    await run({ auth: { user: { related: () => ({ query: () => ({ firstOrFail: async () => ({ id: 7 }) }) }) } },
      request: { validateUsing: validator => validator.validate({ name: ' Loan ', rate: 5.125, startDate: '2025-01-01', amount: '-0.12' }) },
      logger: { error: () => assert.fail('Unexpected CREATE failure') } })
    assert.strictEqual(saved.startingBalance, -0.12)
    assert.strictEqual(saved.balance, 0.12)
    assert.strictEqual(saved.rate, 5.125)
    assert.strictEqual(saved.budgetId, 7)
    assert.deepEqual(events, ['commit'])
  })

  test('save-only candidate can combine stale complete requests into neither requested settings object')
    .with([false, true]).run(async ({ assert }, reverse) => {
      const store = persistence()
      // Both requests load before either transaction saves/commits. A later
      // Category name row lock cannot refresh these already-hydrated Loans.
      const a = store.load(); const b = store.load()
      a.merge({ rate: 8, startingBalance: 100 })
      b.merge({ rate: 5, startingBalance: 200 })
      assert.deepEqual(a.$dirty, { rate: 8 })
      assert.deepEqual(b.$dirty, { startingBalance: 200 })
      for (const model of reverse ? [b, a] : [a, b]) await model.save()
      assert.deepEqual(store.row, { id: 1, rate: 8, starting_balance: 200 })
      assert.lengthOf(store.writes, 2)
      const fresh = store.load()
      assert.equal(fresh.rate, 8)
      assert.equal(fresh.startingBalance, 200)
    })

  test('fresh serial reads produce a complete requested result in either order')
    .with([false, true]).run(async ({ assert }, reverse) => {
      const store = persistence()
      const proposals = [{ rate: 8, startingBalance: 100 }, { rate: 5, startingBalance: 200 }]
      if (reverse) proposals.reverse()
      for (const proposal of proposals) {
        const loan = store.load()
        loan.merge(proposal)
        await loan.save()
      }
      const expected = proposals[1]
      assert.equal(store.row.rate, expected.rate)
      assert.equal(store.row.starting_balance, expected.startingBalance)
    })

  test('Budget gate precedes both fresh loads and coupled saves', async ({ assert }) => {
    const source = await readFile('app/Controllers/Http/LoansController.ts', 'utf8')
    const update = source.slice(source.indexOf('  public async update('), source.indexOf('  public async getTransactions('))
    assert.include(update, 'budgetLoans(user.budgetId, { client: trx })')
    assert.include(update, 'await category.save()')
    assert.include(update, 'await loan.save()')
    assert.include(update, 'user.useTransaction(trx)')
    assert.isBelow(update.indexOf('forUpdate()'), update.indexOf('const loan ='))
    assert.isBelow(update.indexOf('const loan ='), update.indexOf('const category ='))
    assert.isBelow(update.indexOf('const category ='), update.indexOf('loan.merge'))
    assert.isBelow(update.indexOf('await loan.save()'), update.indexOf('await category.save()'))
    assert.isBelow(update.indexOf('await category.save()'), update.indexOf('await trx.commit()'))
    assert.notInclude(update, 'refresh()')
    assert.isBelow(update.indexOf('const loan ='), update.indexOf('await category.save()'))
    assert.notInclude(update, 'Account')
    assert.notInclude(update, '.balance')
    assert.notInclude(update, 'fundingPool')
    assert.notInclude(update, 'transactionLog')
  })
})


function signal() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
async function controller(context, method = 'update') {
  const source = ts.createSourceFile('LoansController.ts', await readFile('app/Controllers/Http/LoansController.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find(ts.isClassDeclaration).members.find((node) => ts.isMethodDeclaration(node) && node.name.getText(source) === method)
  const expression = `(async function(${declaration.parameters.map((p) => p.getText(source)).join(',')}) ${declaration.body.getText(source)})`
  return runInNewContext(ts.transpileModule(expression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
}
async function protocol({ pause = false, failure } = {}) {
  let stored = { name: 'Old', rate: 5, startDate: '2025-01-01', startingBalance: 100 }
  let tail = Promise.resolve(); let reads = 0; let attempts = 0
  const entered = signal(); const queued = signal(); const release = signal()
  const events = []
  const run = await controller({ updateLoan: {}, db: { transaction: async () => {
    const owner = { acquired: false, pending: {}, unlock: () => undefined,
      async commit() { stored = { ...stored, ...this.pending }; events.push('commit'); this.unlock() },
      async rollback() { events.push('rollback'); this.unlock() } }
    return owner
  } }, budgetLoans: (_id, { client }) => ({ where() { return this }, async firstOrFail() {
    if (!client.acquired) throw new Error('Loan read before gate')
    reads++
    const snapshot = { ...stored }
    const category = { $trx: client, name: snapshot.name,
      merge(values) { Object.assign(this, values) }, async save() {
        if (!client.acquired) throw new Error('Category save outside owner')
        client.pending.name = this.name; events.push('category.save')
        if (failure === 'category') throw new Error('Injected Category failure')
      } }
    return { ...snapshot, $trx: client, merge(values) { Object.assign(this, values) },
      async updateBalance() { events.push('inert.updateBalance') },
      related: () => ({ query: () => ({ firstOrFail: async () => {
        if (!client.acquired) throw new Error('Category read before gate')
        events.push('category.read'); return category
      } }) }),
      async save() {
        if (!client.acquired) throw new Error('Loan save outside owner')
        client.pending.rate = this.rate; client.pending.startDate = this.startDate
        client.pending.startingBalance = this.startingBalance; events.push('loan.save')
        if (pause && reads === 1) { entered.resolve(); await release.promise }
        if (failure === 'loan' && reads === 1) throw new Error('Injected Loan failure')
      }, getProps: async () => ({ balance: '0.00', transactions: [] }) }
  } }) })
  async function invoke(data) {
    let owner
    const user = { budgetId: 1, useTransaction(trx) { owner = trx }, related: () => ({ query: () => ({
      forUpdate() { return this }, async firstOrFail() {
        attempts++; if (attempts === 2) queued.resolve()
        const previous = tail
        tail = new Promise((done) => { owner.unlock = done })
        await previous; owner.acquired = true; events.push('gate')
        return { id: 1 }
      },
    }) }) }
    return run({ request: { params: () => ({ catId: 1 }), validateUsing: async () => data }, auth: { user }, logger: { error: () => undefined } })
  }
  return { invoke, entered, queued, release, events, reads: () => reads, stored: () => stored }
}
test.group('Actual Loan UPDATE Budget protocol (no database)', () => {
  const a = { name: 'A', rate: 8, startDate: '2025-02-01', startingBalance: 100 }
  const b = { name: 'B', rate: 5, startDate: '2025-03-01', startingBalance: 200 }
  test('post-gate fresh loads persist complete serial settings/name in both orders').with([false, true])
    .run(async ({ assert }, reverse) => {
      const f = await protocol({ pause: true })
      const first = f.invoke(reverse ? b : a)
      await f.entered.promise
      const second = f.invoke(reverse ? a : b)
      try { await f.queued.promise; assert.equal(f.reads(), 1) }
      finally { f.release.resolve() }
      await first; await second
      assert.deepEqual(f.stored(), reverse ? a : b)
      assert.equal(f.reads(), 2)
      assert.deepEqual(f.events, ['gate', 'category.read', 'inert.updateBalance', 'loan.save', 'category.save', 'commit',
        'gate', 'category.read', 'inert.updateBalance', 'loan.save', 'category.save', 'commit'])
    })
  test('Loan/Category late failure rolls back complete settings and name').with(['loan', 'category'])
    .run(async ({ assert }, failure) => {
      const f = await protocol({ failure })
      await assert.rejects(() => f.invoke(a), `Injected ${failure === 'loan' ? 'Loan' : 'Category'} failure`)
      assert.deepEqual(f.stored(), { name: 'Old', rate: 5, startDate: '2025-01-01', startingBalance: 100 })
      assert.include(f.events, 'rollback'); assert.notInclude(f.events, 'commit')
    })
  test('complete no-op retains response and unrelated financial state', async ({ assert }) => {
    const f = await protocol()
    const before = { ...f.stored() }
    const response = await f.invoke(before)
    assert.deepEqual(f.stored(), before)
    assert.deepEqual(JSON.parse(JSON.stringify(response)), { name: 'Old', loan: { balance: '0.00', transactions: [] } })
  })
})
