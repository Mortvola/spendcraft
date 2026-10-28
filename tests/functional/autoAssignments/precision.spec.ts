import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Budget from '#models/Budget'
import Transaction from '#models/Transaction'
import AutoAssignmentCategory from '#models/AutoAssignmentCategory'
import Migration, { historicalAmountExpression } from '../../../database/migrations/1792100000000_auto_assignment_amount_numeric.js'
import { DateTime } from 'luxon'
import * as Plaid from 'plaid'
import { AccountType, CategoryType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
async function fixture() {
  return db.transaction(async (trx) => {
    const budget = await Budget.create({}, { client: trx })
    await budget.initialize()
    const user = await budget.related('users').create({ username: `precision-${++sequence}`,
      email: `precision-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name: 'Precision bank' })
    const account = await institution.related('accounts').create({ name: 'Checking', balance: 0,
      type: AccountType.Depository, subtype: 'checking', rate: 0, closed: false,
      tracking: TrackingType.Transactions, startDate: DateTime.fromISO('2025-01-01') })
    const group = await budget.related('groups').create({ name: 'Precision categories', type: 'Regular' })
    const categories = []
    for (const name of ['Fixed', 'First percentage', 'Last percentage']) {
      categories.push(await group.related('categories').create({ name, type: CategoryType.Regular,
        balance: 0, fundingAmount: 0, useGoal: false, recurrence: 1, fundingCategories: [] }))
    }
    return { budget, user, account, categories }
  })
}

function provider(amount: number): Plaid.Transaction {
  return { account_id: 'precision-account', transaction_id: `precision-${sequence}`, amount: -amount,
    date: '2025-02-10', name: 'Precision match', merchant_name: null, iso_currency_code: 'USD',
    unofficial_currency_code: null, pending: false, pending_transaction_id: null, account_owner: null,
    authorized_date: null, authorized_datetime: null, datetime: null,
    payment_channel: Plaid.TransactionPaymentChannelEnum.Online, transaction_code: null,
    location: { address: null, city: null, region: null, postal_code: null, country: null, lat: null, lon: null, store_number: null },
    payment_meta: { reference_number: null, ppd_id: null, payee: null, by_order_of: null, payer: null, payment_method: null, payment_processor: null, reason: null } }
}


// Prepared only: execute through the existing safeguarded spendcraft_test runner.
test.group('Auto-assignment numeric precision PostgreSQL acceptance', () => {
  async function financialState() {
    // Funding Pool balances are included in categories, not a separate table.
    return Promise.all(['accounts', 'account_transactions', 'categories',
      'statements', 'transactions', 'transaction_logs'].map(table => db.from(table).orderBy('id')))
  }

  test('column has exact scale and preserves required amount and nullable mode', async ({ assert }) => {
    const rows = await db.from('information_schema.columns').where('table_schema', 'public')
      .where('table_name', 'auto_assignment_categories').whereIn('column_name', ['amount', 'percentage'])
    const amount = rows.find(row => row.column_name === 'amount')
    const mode = rows.find(row => row.column_name === 'percentage')
    assert.equal(amount.data_type, 'numeric')
    assert.equal(amount.numeric_precision, 12)
    assert.equal(amount.numeric_scale, 2)
    assert.equal(amount.is_nullable, 'NO')
    assert.equal(mode.is_nullable, 'YES')
  })

  test('CREATE and PATCH round and return numbers without financial mutations').with([false, true])
    .run(async ({ client, assert }, percentage) => {
      const f = await fixture()
      const before = await financialState()
      const created = await client.post('/api/v1/auto-assignments').loginAs(f.user).accept('json')
        .json({ name: 'Precision', searchStrings: ['Precision match'],
          categories: [{ id: -1, categoryId: f.categories[0].id, amount: 12.755, percentage }] })
      created.assertStatus(200)
      const child = created.body().categories[0]
      assert.strictEqual(child.amount, percentage ? 12.76 : '12.76')
      const raw = await db.from('auto_assignment_categories').where('id', child.id).first()
      assert.strictEqual(raw.amount, '12.76')
      const patched = await client.patch(`/api/v1/auto-assignments/${created.body().id}`)
        .loginAs(f.user).accept('json').json({ name: 'Changed', searchStrings: ['Precision match'],
          categories: [{ id: child.id, categoryId: f.categories[0].id, amount: -0.125, percentage: !percentage }] })
      patched.assertStatus(200)
      assert.strictEqual(patched.body().categories[0].amount, !percentage ? -0.12 : '-0.12')
      assert.strictEqual(patched.body().categories[0].percentage, !percentage)
      assert.strictEqual((await db.from('auto_assignment_categories').where('id', child.id).first()).amount, '-0.12')
      assert.deepEqual(await financialState(), before)
    })

  test('invalid and overflow requests reject atomically').with([10000000000, -10000000000, 'invalid'])
    .run(async ({ client, assert }, amount) => {
      const f = await fixture()
      const before = await financialState()
      const parents = await db.from('auto_assignments').orderBy('id')
      const children = await db.from('auto_assignment_categories').orderBy('id')
      const response = await client.post('/api/v1/auto-assignments').loginAs(f.user).accept('json')
        .json({ name: 'Invalid', searchStrings: [], categories: [
          { id: -1, categoryId: f.categories[0].id, amount: 10, percentage: false },
          { id: -2, categoryId: f.categories[1].id, amount, percentage: true }] })
      response.assertStatus(422)
      assert.deepEqual(await financialState(), before)
      assert.deepEqual(await db.from('auto_assignments').orderBy('id'), parents)
      assert.deepEqual(await db.from('auto_assignment_categories').orderBy('id'), children)
    })

  test('model hydrates numeric strings, preserves null mode, and rolls back writes', async ({ assert }) => {
    const f = await fixture()
    const rule = await f.budget.related('autoAssignment').create({ name: 'Rollback', searchStrings: [] })
    const before = await db.from('auto_assignment_categories').orderBy('id')
    await assert.rejects(() => db.transaction(async trx => {
      const row = await AutoAssignmentCategory.create({
        autoAssignmentId: rule.id, categoryId: f.categories[0].id, amount: 1.005,
      }, { client: trx })
      await trx.from('auto_assignment_categories').where('id', row.id).update({ percentage: null })
      const hydrated = await AutoAssignmentCategory.findOrFail(row.id, { client: trx })
      assert.strictEqual(hydrated.amount, 1)
      assert.strictEqual(hydrated.percentage, null)
      assert.strictEqual(hydrated.serialize().amount, '1.00')
      throw new Error('deliberate rollback')
    }), 'deliberate rollback')
    assert.deepEqual(await db.from('auto_assignment_categories').orderBy('id'), before)
  })

  test('historical real values use JavaScript ties and transactional DDL rolls back', async ({ assert }) => {
    const f = await fixture()
    const rule = await f.budget.related('autoAssignment').create({ name: 'Historical', searchStrings: [] })
    const trx = await db.transaction()
    try {
      await trx.rawQuery('ALTER TABLE public.auto_assignment_categories ALTER COLUMN amount TYPE real USING amount::real')
      const originals = [-0.125, 0.125, 1.005, -1.005, 12.755]
      const inserted = await trx.table('auto_assignment_categories').insert(originals.map(amount => ({
        auto_assignment_id: rule.id, category_id: f.categories[0].id, amount, percentage: true,
      }))).returning('id')
      const before = await trx.from('auto_assignment_categories').whereIn('id', inserted.map(row => row.id)).orderBy('id')
      const indexes = await trx.from('pg_indexes').where({ schemaname: 'public', tablename: 'auto_assignment_categories' }).orderBy('indexname')
      const constraints = await trx.rawQuery(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid='public.auto_assignment_categories'::regclass ORDER BY conname`)
      await new Migration(trx, 'precision-acceptance', false).execUp()
      const after = await trx.from('auto_assignment_categories').whereIn('id', inserted.map(row => row.id)).orderBy('id')
      for (let i = 0; i < before.length; i++) {
        const expected = Math.round(before[i].amount * 100) / 100
        assert.strictEqual(after[i].amount, expected.toFixed(2))
        assert.strictEqual((await AutoAssignmentCategory.findOrFail(after[i].id, { client: trx })).amount, expected)
        assert.deepEqual({ ...after[i], amount: before[i].amount }, before[i])
      }
      assert.strictEqual(after[0].amount, '-0.12')
      assert.strictEqual(after[1].amount, '0.13')
      assert.deepEqual(await trx.from('pg_indexes').where({ schemaname: 'public', tablename: 'auto_assignment_categories' }).orderBy('indexname'), indexes)
      assert.deepEqual((await trx.rawQuery(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid='public.auto_assignment_categories'::regclass ORDER BY conname`)).rows, constraints.rows)
      const column = await trx.from('information_schema.columns').where({
        table_schema: 'public', table_name: 'auto_assignment_categories', column_name: 'amount',
      }).first()
      assert.strictEqual(column.data_type, 'numeric')
    } finally {
      await trx.rollback()
    }
    const column = await db.from('information_schema.columns').where({
      table_schema: 'public', table_name: 'auto_assignment_categories', column_name: 'amount',
    }).first()
    assert.strictEqual(column.data_type, 'numeric')
  })

  test('foreign Budget update rejects without changing rounded rules', async ({ client, assert }) => {
    const own = await fixture(), foreign = await fixture()
    const rule = await foreign.budget.related('autoAssignment').create({ name: 'Foreign', searchStrings: [] })
    await rule.related('categories').create({ categoryId: foreign.categories[0].id, amount: 12.755, percentage: true })
    const before = await db.from('auto_assignment_categories').orderBy('id')
    const response = await client.patch(`/api/v1/auto-assignments/${rule.id}`).loginAs(own.user).accept('json')
      .json({ name: 'Forbidden', searchStrings: [], categories: [] })
    response.assertStatus(404)
    assert.deepEqual(await db.from('auto_assignment_categories').orderBy('id'), before)
  })

  test('rounded inputs retain actual multi-rule allocation and residual behavior').with([
    { amount: 100, fixed: 10.005, percentage: 50, expected: [10.01, 45, 44.99] },
    { amount: 0.01, fixed: 0, percentage: 50, expected: [0, 0.01, 0] },
  ]).run(async ({ assert }, scenario) => {
    const f = await fixture()
    let transactionId = 0
    await db.transaction(async trx => {
      f.budget.useTransaction(trx)
      f.account.useTransaction(trx)
      const rule = await f.budget.related('autoAssignment').create({ name: 'Precision', searchStrings: ['Precision match'] })
      await rule.related('categories').create({ categoryId: f.categories[0].id, amount: scenario.fixed, percentage: false })
      for (const category of f.categories.slice(1)) {
        await rule.related('categories').create({ categoryId: category.id, amount: scenario.percentage, percentage: true })
      }
      await f.account.addOrUpdateTransaction(provider(scenario.amount), f.budget)
      transactionId = (await f.account.related('accountTransactions').query().firstOrFail()).transactionId
    })
    const transaction = await Transaction.findOrFail(transactionId)
    assert.deepEqual(transaction.categories.map(split => split.amount), scenario.expected)
    assert.equal(transaction.categories.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), Math.round(scenario.amount * 100))
  })
})

test.group('Auto-assignment precision supplemental PostgreSQL acceptance', group => {
  group.each.timeout(30_000)

  test('stale historical proposal rejects atomically').with(['new-row', 'ownership', 'amount'])
    .run(async ({ assert }, change) => {
      const f = await fixture()
      const rule = await f.budget.related('autoAssignment').create({ name: 'Guard', searchStrings: [] })
      const row = await rule.related('categories').create({ categoryId: f.categories[0].id, amount: 1.25, percentage: true })
      const before = await db.from('auto_assignment_categories').orderBy('id')
      await assert.rejects(() => db.transaction(async trx => {
        // Exercise the production USING guard under transactional test DDL; the
        // Adonis migration itself is applied/journaled by the normal runner.
        await trx.rawQuery('ALTER TABLE public.auto_assignment_categories ALTER COLUMN amount TYPE real USING amount::real')
        const pinned = await trx.from('auto_assignment_categories').select('*', trx.raw("encode(float4send(amount),'hex') AS real_hex"))
        const expression = historicalAmountExpression(pinned)
        if (change === 'new-row') {
          await trx.table('auto_assignment_categories').insert({ auto_assignment_id: rule.id,
            category_id: f.categories[1].id, amount: 2.125, percentage: false })
        } else {
          await trx.from('auto_assignment_categories').where('id', row.id).update(change === 'ownership'
            ? { category_id: f.categories[1].id } : { amount: 2.125 })
        }
        await trx.rawQuery(`ALTER TABLE public.auto_assignment_categories ALTER COLUMN amount TYPE numeric(12,2) USING (${expression})`)
      }).catch(error => {
        assert.propertyVal(error, 'code', '23502')
        throw error
      }), /column "amount" of relation "auto_assignment_categories" contains null values/)
      assert.deepEqual(await db.from('auto_assignment_categories').orderBy('id'), before)
      const column = await db.from('information_schema.columns').where({ table_schema: 'public',
        table_name: 'auto_assignment_categories', column_name: 'amount' }).first()
      assert.strictEqual(column.data_type, 'numeric')
    })

  test('fractional percentages and signed values use unchanged allocator').with([
    { amount: 100, fixed: 10.005, percentage: 12.755, expected: [10.01, 11.48, 78.51] },
    { amount: -100, fixed: -10.125, percentage: 12.75, expected: [-10.12, -11.46, -78.42] },
  ]).run(async ({ assert }, scenario) => {
    const f = await fixture()
    let transactionId = 0
    await db.transaction(async trx => {
      f.budget.useTransaction(trx)
      f.account.useTransaction(trx)
      const rule = await f.budget.related('autoAssignment').create({ name: 'Fractional', searchStrings: ['Precision match'] })
      await rule.related('categories').create({ categoryId: f.categories[0].id, amount: scenario.fixed, percentage: false })
      for (const category of f.categories.slice(1)) {
        await rule.related('categories').create({ categoryId: category.id, amount: scenario.percentage, percentage: true })
      }
      await f.account.addOrUpdateTransaction(provider(scenario.amount), f.budget)
      transactionId = (await f.account.related('accountTransactions').query().firstOrFail()).transactionId
    })
    const transaction = await Transaction.findOrFail(transactionId)
    assert.deepEqual(transaction.categories.map(split => split.amount), scenario.expected)
    assert.strictEqual(transaction.categories.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), Math.round(scenario.amount * 100))
  })

  test('CREATE and PATCH wait on the existing Budget lock').with([
    { method: 'post', commit: true }, { method: 'post', commit: false },
    { method: 'patch', commit: true }, { method: 'patch', commit: false },
  ] as const).run(async ({ client, assert }, scenario) => {
    const f = await fixture()
    const rule = await f.budget.related('autoAssignment').create({ name: 'Lock', searchStrings: [] })
    const owner = await db.transaction()
    const { rows: [{ pid }] } = await owner.rawQuery('SELECT pg_backend_pid() AS pid')
    await owner.from('applications').where('id', f.budget.id).forUpdate().firstOrFail()
    const path = scenario.method === 'post' ? '/api/v1/auto-assignments' : `/api/v1/auto-assignments/${rule.id}`
    const pending = client[scenario.method](path).loginAs(f.user).accept('json').json({ name: 'Rounded',
      searchStrings: [], categories: [{ id: -1, categoryId: f.categories[0].id, amount: 12.755, percentage: true }] }).then(response => response)
    try {
      let blocked = false
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const waiters = await db.rawQuery(`SELECT query FROM pg_stat_activity
          WHERE ? = ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`, [pid])
        if (waiters.rows.some((row: { query: string }) => /applications/.test(row.query) && /for update/i.test(row.query))) {
          blocked = true
          break
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.isTrue(blocked, 'request must acquire the real owning Budget lock')
    } finally {
      if (scenario.commit) await owner.commit()
      else await owner.rollback()
    }
    const response = await pending
    response.assertStatus(200)
    assert.strictEqual(response.body().categories[0].amount, 12.76)
  })
})
