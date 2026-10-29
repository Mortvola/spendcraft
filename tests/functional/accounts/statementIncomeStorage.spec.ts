import { statementRequest } from '../../helpers/statementRequest.js'
// Prepared PostgreSQL acceptance cases. Do not run without database authorization.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Statement from '#models/Statement'
import TaxesController from '#controllers/TaxesController'
import { replaceStatementIncome } from '#services/statementIncomeStorage'
import { encodeStatementIncome, statementIncomeFields } from '#services/statementIncomeCodec'
import { AccountType, TrackingType } from '#common/ResponseTypes'

let sequence = 0
const income = (amount: number) => ({ shortTermCapitalGains: amount, longTermCapitalGains: amount,
  dividends: amount, taxableInterest: amount })
async function fixture() {
  return db.transaction(async trx => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `income-${++sequence}`,
      email: `income-${sequence}@example.com`, password: 'testPassw0rd' })
    const institution = await budget.related('institutions').create({ name:
      'Synthetic income bank' })
    const account = await institution.related('accounts').create({ name: 'Synthetic income account',
      balance: 200,
      type: AccountType.Investment, subtype: 'brokerage', tracking: TrackingType.Transactions,
      startDate: DateTime.fromISO('2026-01-01'), rate: 0, closed: false })
    const statement = await account.related('statements').create({ startDate: DateTime.fromISO(
      '2026-01-01'), endDate: DateTime.fromISO('2026-01-31'), startingBalance: 100,
      endingBalance: 200, data: income(1) })
    return { budget, user, account, statement }
  })
}

test.group('Statement income decimal-string PostgreSQL acceptance', group => {
  let f: Awaited<ReturnType<typeof fixture>>
  group.each.setup(async () => { f = await fixture() })
  const raw = () => db.from('statements').where('id', f.statement.id).firstOrFail()
  async function financialState() {
    return Promise.all([
      db.from('accounts').where('id', f.account.id),
      db.from('account_transactions').where('account_id', f.account.id).orderBy('id'),
      db.from('transactions').where('application_id', f.budget.id).orderBy('id'),
      db.from('categories').select('categories.*').join('groups', 'groups.id',
        'categories.group_id')
        .where('groups.application_id', f.budget.id).orderBy('categories.id'),
    ])
  }
  test('CREATE raw JSON and cent-exact API strings reflect approved rounding').with([
    { amount: 12.345, stored: '12.35', numeric: 12.35 },
    { amount: -0.125, stored: '-0.12', numeric: -0.12 },
    { amount: 0.1 + 0.2, stored: '0.30', numeric: 0.30 },
    { amount: -0, stored: '0.00', numeric: 0 },
  ]).run(async ({ client, assert }, value) => {
    const response = await client.post(`/api/v1/account/${f.account.id}/statements`).json(
      statementRequest({
      startDate: '2026-02-01', endDate: '2026-02-28', startingBalance: 200, endingBalance: 200,
        data: income(value.amount),
    })).accept('json').loginAs(f.user)
    response.assertStatus(200)
    const stored = await db.from('statements').where('id', response.body().id).firstOrFail()
    for (const field of statementIncomeFields) {
      assert.strictEqual(stored.data[field], value.stored)
      assert.strictEqual(response.body().data[field], value.stored)
      const result = await db.rawQuery(
        'SELECT jsonb_typeof(data->?::text) AS kind FROM statements WHERE id=?', [field, stored.id])
      assert.equal(result.rows[0].kind, 'string')
    }
  })
  test('income-only Statement PATCH preserves financial state, balances and metadata').with([
    TrackingType.Transactions, TrackingType.Balances])
    .run(async ({ client, assert }, tracking) => {
      f.account.tracking = tracking; await f.account.save()
      await db.from('statements').where('id', f.statement.id).update({ data: JSON.stringify({
        ...encodeStatementIncome(income(1)), note: { ordered: [2, 1, 2], amount: 1.005 } }) })
      const before = await financialState(), old = await raw()
      const response = await client.patch(`/api/v1/statements/${f.statement.id}`).json(
        statementRequest({ data: income(12.345) })).accept('json').loginAs(f.user)
      response.assertStatus(200)
      const after = await raw()
      for (const field of statementIncomeFields) { assert.strictEqual(after.data[field], '12.35');
        assert.strictEqual(response.body().data[field], '12.35') }
      assert.deepEqual(after.data.note, old.data.note)
      assert.equal(after.starting_balance, old.starting_balance); assert.equal(after.ending_balance,
        old.ending_balance)
      assert.deepEqual(await financialState(), before)
    })
  test('canonical income responses preserve raw JSON on reads and metadata-only saves', async ({
    client, assert }) => {
    const data = { ...encodeStatementIncome(income(1)), dividends: '2.00', note: { amount: 1.005 } }
    await db.from('statements').where('id', f.statement.id).update({ data: JSON.stringify(data) })
    const before = await raw()
    const list = await client.get(`/api/v1/account/${f.account.id}/statements`).accept('json')
      .loginAs(f.user)
    list.assertStatus(200)
    const item = list.body().find((row: { id: number }) => row.id === f.statement.id)
    assert.strictEqual(item.data.shortTermCapitalGains, '1.00')
    assert.strictEqual(item.data.dividends, '2.00')
    assert.deepEqual(await raw(), before)
    const patch = await client.patch(`/api/v1/statements/${f.statement.id}`).json(statementRequest({
      startDate: '2026-01-02' })).accept('json').loginAs(f.user)
    patch.assertStatus(200); assert.deepEqual((await raw()).data, data)
  })
  test('existing real-aggregation tax reports accept mixed and string attribution', async ({
    assert }) => {
    await db.from('statements').where('id', f.statement.id).update({ data: JSON.stringify({
      ...income(1.25), dividends: '2.50' }) })
    const mixed = await TaxesController.getActuals(2026, f.budget.id)
    assert.equal(mixed[0].ordinaryDividends, 2.5); assert.equal(mixed[0].taxableInterest, 1.25)
    await db.from('statements').where('id', f.statement.id).update({ data: JSON.stringify(
      encodeStatementIncome({ ...income(1.25), dividends: 2.5 })) })
    const model = await Statement.findOrFail(f.statement.id); replaceStatementIncome(model, {
      ...income(1.25), dividends: 2.5 }); await model.save()
    assert.deepEqual(await TaxesController.getActuals(2026, f.budget.id), mixed)
  })
  test('Tax actuals aggregate canonical income by end month with date and account exclusions',
    async ({ assert }) => {
    replaceStatementIncome(f.statement, income(0.1))
    await f.statement.save()
    assert.deepEqual((await raw()).data, encodeStatementIncome(income(0.1)))
    const createIncome = async (account: typeof f.account, start: string, end: string,
      amount: number) => {
      const statement = await account.related('statements').create({
        startDate: DateTime.fromISO(start), endDate: DateTime.fromISO(end),
        startingBalance: 0, endingBalance: 0, data: income(amount),
      })
      const stored = await db.from('statements').where('id', statement.id).firstOrFail()
      assert.deepEqual(stored.data, encodeStatementIncome(income(amount)))
    }
    await createIncome(f.account, '2026-01-15', '2026-01-31', 0.2)
    await createIncome(f.account, '2026-02-01', '2026-03-01', 0.4)
    await createIncome(f.account, '2025-12-31', '2026-01-01', 100)
    await createIncome(f.account, '2027-01-01', '2027-01-31', 100)
    const institution = await f.budget.related('institutions').query().firstOrFail()
    for (const subtype of ['401k', 'Roth 401k', 'Roth', 'ira']) {
      const account = await institution.related('accounts').create({
        name: `Excluded ${subtype}`, subtype, type: AccountType.Investment,
        tracking: TrackingType.Transactions, balance: 0,
        startDate: DateTime.fromISO('2026-01-01'), rate: 0, closed: false,
      })
      await createIncome(account, '2026-01-01', '2026-01-31', 100)
    }
    const actuals = await TaxesController.getActuals(2026, f.budget.id)
    assert.deepEqual(actuals.filter(row => row !== undefined), [
      { month: 1, taxableInterest: '0.30', ordinaryDividends: '0.30',
        shortTermCapitalGains: '0.30', longTermCapitalGains: '0.30', taxes: {} },
      { month: 3, taxableInterest: '0.40', ordinaryDividends: '0.40',
        shortTermCapitalGains: '0.40', longTermCapitalGains: '0.40', taxes: {} },
    ])
  })
  test('SQL-null data and omitted income remain unchanged on unrelated PATCH', async ({ client,
    assert }) => {
    await db.from('statements').where('id', f.statement.id).update({ data: null })
    const response = await client.patch(`/api/v1/statements/${f.statement.id}`).json(
      statementRequest({ startDate: '2026-01-02', data: null })).accept('json').loginAs(f.user)
    response.assertStatus(200); assert.isNull((await raw()).data)
    assert.deepEqual(response.body().data, encodeStatementIncome(income(0)))
  })
  test('CREATE/PATCH reject numeric or noncanonical monetary fields without mutation')
    .with(['create', 'patch'].flatMap(operation => ['startingBalance', 'endingBalance',
      ...statementIncomeFields]
      .map(field => ({ operation, field }))))
    .run(async ({ client, assert }, { operation, field }) => {
      const before = await raw(), financial = await financialState()
      const statements = await db.from('statements').where('account_id', f.account.id).orderBy('id')
      for (const value of [0, '1.2', '-0.00', '90071992547409.92']) {
        const payload = {
          startDate: '2026-02-01', endDate: '2026-02-28', startingBalance: '200.00', endingBalance:
            '200.00',
          data: { ...encodeStatementIncome(income(0)) },
        }
        if (field === 'startingBalance' || field === 'endingBalance') Reflect.set(payload, field,
          value)
        else Reflect.set(payload.data, field, value)
        const request = operation === 'create'
          ? client.post(`/api/v1/account/${f.account.id}/statements`)
          : client.patch(`/api/v1/statements/${f.statement.id}`)
        const response = await request.json(payload).accept('json').loginAs(f.user)
        response.assertStatus(422)
        assert.deepEqual(await raw(), before)
        assert.deepEqual(await financialState(), financial)
        assert.deepEqual(await db.from('statements').where('account_id', f.account.id).orderBy(
          'id'), statements)
      }
    })
  test('rejected input leaves raw Statement and financial state unchanged').with([
    { data: income(Number.MAX_SAFE_INTEGER) }, { data: { dividends: null } }, { data: { dividends:
      'bad' } },
  ]).run(async ({ client, assert }, input) => {
    const before = await raw(), financial = await financialState()
    const response = await client.patch(`/api/v1/statements/${f.statement.id}`).json(input).accept(
      'json').loginAs(f.user)
    response.assertStatus(422); assert.lengthOf(response.redirects(), 0); assert.deepEqual(
      await raw(), before); assert.deepEqual(await financialState(), financial)
  })
  test('owning transaction rollback restores exact original raw JSON', async ({ assert }) => {
    const before = await raw()
    await assert.rejects(async () => db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
      const statement = await Statement.query({ client: trx }).where('id', f.statement.id)
        .firstOrFail()
      replaceStatementIncome(statement, income(2.345)); await statement.save()
      const inside = await trx.from('statements').where('id', statement.id).firstOrFail()
      assert.equal(inside.data.dividends, '2.35'); throw new Error('intentional rollback')
    }), 'intentional rollback')
    assert.deepEqual(await raw(), before)
  })
  test('foreign Budget cannot mutate attribution', async ({ client, assert }) => {
    const other = await fixture(), before = await raw(), financial = await financialState()
    const response = await client.patch(`/api/v1/statements/${f.statement.id}`).json(
      statementRequest({ data: income(10) })).accept('json').loginAs(other.user)
    response.assertStatus(404); assert.deepEqual(await raw(), before); assert.deepEqual(
      await financialState(), financial)
  })
})
