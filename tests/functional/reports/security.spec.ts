import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import User from '#models/User'
import { AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes'

let sequence = 0

async function createDomain(label: string, existingBudget?: Budget) {
  return db.transaction(async (trx) => {
    const budget = existingBudget?.useTransaction(trx) ?? await Budget.create({}, { client: trx })
    if (!existingBudget) await budget.initialize()
    const user = await budget.related('users').create({
      username: `report-${label}-${++sequence}`,
      email: `report-${sequence}@example.com`,
      password: 'testPassw0rd',
    })
    const institution = await budget.related('institutions').create({ name: `${label} bank` })
    const account = await institution.related('accounts').create({
      name: `${label} account`, balance: 100, type: AccountType.Depository,
      subtype: 'checking', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2025-01-01'), rate: 0, closed: false,
    })
    const group = await budget.related('groups').create({ name: `${label} group`, type: 'Regular' })
    const category = await group.related('categories').create({
      name: `${label} category`, type: CategoryType.Regular, balance: 20, fundingCategories: [],
    })
    const transaction = await budget.related('transactions').create({
      date: DateTime.fromISO('2025-02-01'), type: TransactionType.MANUAL_TRANSACTION,
      version: 0, deleted: false, sortOrder: 0, comment: `${label} private comment`,
      categories: [{ categoryId: category.id, amount: 10 }], taxes: [],
    })
    await account.related('accountTransactions').create({
      transactionId: transaction.id, name: `${label} private purchase`, amount: 10,
      provider: 'NONE', pending: false, statementId: null,
    })
    await db.table('transaction_categories').useTransaction(trx).insert({ transaction_id: transaction.id, category_id: category.id, amount: 10 })
    return { budget, user, institution, account, category, transaction }
  })
}

async function createFixture() {
  const own = await createDomain('own')
  const foreign = await createDomain('foreign')
  const second = await createDomain('second', own.budget)
  const shared = await User.create({
    username: `report-shared-${++sequence}`, email: `report-${sequence}@example.com`,
    password: 'testPassw0rd', budgetId: own.budget.id,
  })
  return { own, foreign, second, shared }
}

test.group('Report filter security', (group) => {
  let fixture: Awaited<ReturnType<typeof createFixture>>
  group.each.setup(async () => { fixture = await createFixture() })

  let addedTablefunc = false
  group.setup(async () => {
    const existing = await db.from('pg_extension').where('extname', 'tablefunc').first()
    if (!existing) {
      await db.rawQuery('CREATE EXTENSION tablefunc')
      addedTablefunc = true
    }
  })
  group.teardown(async () => {
    if (addedTablefunc) await db.rawQuery('DROP EXTENSION tablefunc')
  })

  async function state() {
    const budgets = [fixture.own.budget.id, fixture.foreign.budget.id]
    const accounts = [fixture.own.account.id, fixture.second.account.id, fixture.foreign.account.id]
    return Promise.all([
      db.from('transactions').whereIn('application_id', budgets).orderBy('id'),
      db.from('accounts').whereIn('id', accounts).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id', 'categories.group_id')
        .whereIn('groups.application_id', budgets).orderBy('categories.id'),
      db.from('account_transactions').whereIn('account_id', accounts).orderBy('id'),
      db.from('transaction_categories').whereIn('category_id', [fixture.own.category.id, fixture.second.category.id, fixture.foreign.category.id]).orderBy('id'),
      db.from('statements').whereIn('account_id', accounts).orderBy('id'),
      db.from('balance_histories').whereIn('account_id', accounts).orderBy('id'),
      db.from('transaction_logs').whereIn('application_id', budgets).orderBy('id'),
    ])
  }

  test('net-worth treats stored account names as data').with([
    'Everyday checking / savings (personal)',
    'Account "quoted"',
    'x" FLOAT, injected FLOAT) --',
    'x" FLOAT); SELECT pg_sleep(0); --',
    '銀行 Épargne 💰',
    'Shared name',
    'Long account name '.repeat(6),
  ]).run(async ({ client, assert }, name) => {
    await fixture.own.account.merge({ name }).save()
    await fixture.second.account.merge({ name, balance: 200 }).save()
    await fixture.foreign.account.merge({ name: 'FOREIGN PRIVATE ACCOUNT', balance: 987654 }).save()
    const date = DateTime.now().minus({ days: 1 }).startOf('day')
    for (const domain of [fixture.own, fixture.second, fixture.foreign]) {
      await domain.transaction.merge({ date }).save()
    }
    const before = await state()
    for (const user of [fixture.own.user, fixture.shared]) {
      const response = await client.get('/api/v1/reports/networth').accept('json').loginAs(user)
      assert.deepEqual(await state(), before)
      response.assertStatus(200)
      assert.deepEqual(response.body(), [['date', name, name], [date.toISODate(), 100, 200]])
      assert.notInclude(response.text(), 'FOREIGN PRIVATE ACCOUNT')
      assert.notInclude(response.text(), '987654')
    }
  })

  for (const report of ['payee', 'category'] as const) {
    const column = report === 'payee' ? 'accounts.id' : 'c.id'
    const id = (domain: typeof fixture.own) => report === 'payee' ? domain.account.id : domain.category.id
    const filters = (value: unknown) => report === 'payee' ? { a: value, pc: 'unknown' } : { c: value }

    test(`${report}: owner/shared, scalar/array and duplicates retain results`)
      .with(['owner-scalar', 'shared-array', 'owner-duplicates', 'owner-multiple', 'owner-padded'])
      .run(async ({ client, assert }, scenario) => {
        const ids = scenario === 'owner-padded' ? ` 0${id(fixture.own)} ` : scenario === 'owner-scalar' ? id(fixture.own)
          : scenario === 'owner-multiple' ? [id(fixture.own), id(fixture.second)] : [id(fixture.own), id(fixture.own)]
        const user = scenario === 'shared-array' ? fixture.shared : fixture.own.user
        const response = await client.get(`/api/v1/reports/${report}`).qs(filters(ids)).accept('json').loginAs(user)
        response.assertStatus(200)
        assert.lengthOf(response.body(), scenario === 'owner-multiple' ? 2 : 1)
        for (const row of response.body()) assert.equal(row.sum, 10)
        assert.notInclude(response.text(), 'foreign private purchase')
        assert.notInclude(response.text(), 'foreign category')
      })

    test(`${report}: foreign, missing and mixed IDs reject atomically`)
      .with(['foreign-scalar', 'missing-scalar', 'mixed', 'mixed-duplicates', 'mixed-missing'])
      .run(async ({ client, assert }, scenario) => {
        const value = scenario === 'foreign-scalar' ? id(fixture.foreign)
          : scenario === 'missing-scalar' ? 2147483647
            : scenario === 'mixed-missing' ? [id(fixture.own), 2147483647]
              : scenario === 'mixed' ? [id(fixture.own), id(fixture.foreign)]
              : [id(fixture.own), id(fixture.own), id(fixture.foreign)]
        const before = await state()
        const response = await client.get(`/api/v1/reports/${report}`).qs(filters(value)).accept('json').loginAs(fixture.own.user)
        response.assertStatus(404)
        assert.deepEqual(await state(), before)
        assert.notInclude(response.text(), 'foreign private purchase')
        assert.notInclude(response.text(), 'foreign category')
      })

    test(`${report}: adversarial and malformed values are validation errors`)
      .with([[`0) OR TRUE OR ${column} IN (0`, '0'], ['not-an-id'], ['1.5'], [''], ['2147483648'], ['1e2'], `0) OR TRUE OR ${column} IN (0`, { nested: '1' }])
      .run(async ({ client, assert }, values) => {
        const before = await state()
        const response = await client.get(`/api/v1/reports/${report}`).qs(filters(values)).accept('json').loginAs(fixture.own.user)
        if (Array.isArray(response.body())) {
          assert.isFalse(response.body().some((row: Record<string, unknown>) => row.name === 'foreign private purchase' || row.categoryName === 'foreign category'))
        }
        response.assertStatus(422)
        assert.deepEqual(await state(), before)
        assert.notInclude(response.text(), 'foreign private purchase')
        assert.notInclude(response.text(), 'foreign category')
      })

    test(`${report}: omitted and empty-array filters return no rows`)
      .with(['omitted', 'empty'])
      .run(async ({ client, assert }, scenario) => {
        const response = await client.get(`/api/v1/reports/${report}`).qs(scenario === 'empty' ? filters([]) : {}).accept('json').loginAs(fixture.own.user)
        response.assertStatus(200)
        assert.deepEqual(response.body(), [])
      })

    test(`${report}: filter SQL binds account/category IDs`, async ({ client, assert }) => {
      const queries: { sql: string, bindings?: readonly unknown[] }[] = []
      const listener = (event: { sql: string, bindings?: readonly unknown[] }) => { queries.push(event) }
      const connection = db.connection().getWriteClient()
      connection.on('query', listener)
      try {
        const response = await client.get(`/api/v1/reports/${report}`).qs(filters([id(fixture.own), id(fixture.second)])).accept('json').loginAs(fixture.own.user)
        response.assertStatus(200)
        const query = queries.find((event) => event.sql.includes(report === 'payee' ? 'account_transactions' : 'transaction_categories') && event.sql.includes('group by'))
        assert.isDefined(query)
        if (!query) throw new Error('Report query was not captured')
        assert.include(query.bindings ?? [], id(fixture.own))
        const quotedColumn = report === 'payee' ? '"accounts"."id"' : '"c"."id"'
        assert.include(query.bindings ?? [], id(fixture.second))
        const placeholders = query.sql.split(`${quotedColumn} in (`)[1]?.split(')')[0]
        assert.match(placeholders ?? '', /^(?:\?|\$\d+), (?:\?|\$\d+)$/)
      } finally {
        connection.removeListener('query', listener)
      }
    })
  }
})
