// Prepared acceptance only. Requires separate authorization for localhost:5432/spendcraft_test.
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Budget from '#models/Budget'
import Tax from '#models/Tax'
import TransactionLog from '#models/TransactionLog'
import { replaceTaxForecast } from '#services/taxMonetaryStorage'
import { taxForecastFields, taxEstimatedFields } from '#services/taxMonetaryCodec'
import { FilingStatus, TransactionType } from '#common/ResponseTypes'

let sequence = 0
const forecast = (amount: number) => ({ filingStatus: FilingStatus.Single, taxableInterest: amount, qualifiedDividends: amount,
  ordinaryDividends: amount, taxableIraDistributions: amount, taxablePensionAndAnnuities: amount,
  taxableSocialSecurityBenefits: amount, additionalTaxableIncome: amount, shortTermCapitalGains: amount,
  longTermCapitalGains: amount, qualifiedBusinessIncomeDeduction: amount,
  estimated: { expectedAgi: amount, priorYearAgi: amount, priorYearTotalTax: amount } })
async function fixture() {
  return db.transaction(async trx => {
    const budget = await Budget.create({}, { client: trx }); await budget.initialize()
    const user = await budget.related('users').create({ username: `tax-money-${++sequence}`,
      email: `tax-money-${sequence}@example.com`, password: 'testPassw0rd' })
    const transaction = await budget.related('transactions').create({ date: DateTime.fromISO('2026-01-01'),
      type: TransactionType.MANUAL_TRANSACTION, categories: [], taxes: [], deleted: false })
    return { budget, user, transaction }
  })
}
const paths = [...taxForecastFields.map(f => [f]), ...taxEstimatedFields.map(f => ['estimated', f])]

test.group('Tax forecast and TransactionLog decimal-string PostgreSQL acceptance', group => {
  let f: Awaited<ReturnType<typeof fixture>>
  group.each.setup(async () => { f = await fixture() })
  const rawTax = () => db.from('taxes').where('budget_id', f.budget.id).where('year', 2026).firstOrFail()
  const financialState = async () => (await db.rawQuery(`SELECT
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM accounts t) AS accounts,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM account_transactions t) AS movements,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM categories t) AS categories,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM statements t) AS statements,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM transactions t) AS transactions`)).rows[0]
  test('Tax POST persists all 13 strings and returns rounded numeric forecast').with([
    { amount: 12.345, stored: '12.35', numeric: 12.35 },
    { amount: -0.125, stored: '-0.12', numeric: -0.12 },
    { amount: 0.1 + 0.2, stored: '0.30', numeric: 0.30 },
    { amount: -0, stored: '0.00', numeric: 0 },
  ]).run(async ({ client, assert }, value) => {
    const before = await financialState()
    const response = await client.post('/api/v1/taxes').json({ year: 2026, forecast: forecast(value.amount) }).accept('json').loginAs(f.user)
    response.assertStatus(200); const raw = await rawTax()
    for (const path of paths) {
      const kind = await db.rawQuery('SELECT jsonb_typeof(data #> ?::text[]) AS kind FROM taxes WHERE id=?', [path, raw.id])
      assert.equal(kind.rows[0].kind, 'string')
      if (path.length === 1) { assert.strictEqual(raw.data[path[0]], value.stored); assert.strictEqual(response.body().data.forecast[path[0]], value.numeric) }
      else { assert.strictEqual(raw.data.estimated[path[1]], value.stored); assert.strictEqual(response.body().data.forecast.estimated[path[1]], value.numeric) }
    }
    assert.deepEqual(await financialState(), before)
  })
  test('numeric/mixed Tax reads remain numeric without normalizing history').with(['numeric', 'mixed'])
    .run(async ({ client, assert }, storage) => {
      const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data: forecast(1) })
      const raw = { ...forecast(1.005), ...(storage === 'mixed' ? { taxableInterest: '2.00' } : {}), note: { amount: 1.005 } }
      await db.from('taxes').where('id', tax.id).update({ data: JSON.stringify(raw) })
      const before = await rawTax(), response = await client.get('/api/v1/taxes/2026').accept('json').loginAs(f.user)
      response.assertStatus(200); assert.strictEqual(response.body().data.forecast.taxableInterest, storage === 'mixed' ? 2 : 1.005)
      assert.deepEqual(await rawTax(), before)
      const model = await Tax.findOrFail(tax.id)
      if (!('note' in model.data)) throw new Error('Expected existing Tax metadata')
      model.data.note = { amount: 1.005, changed: true }; await model.save()
      assert.deepEqual((await rawTax()).data, { ...raw, note: { amount: 1.005, changed: true } })
    })
  test('stored/decoded Tax inputs preserve existing worksheet inputs without intermediate quantization', async ({ assert }) => {
    const data = { ...forecast(0), estimated: { expectedAgi: 100000, priorYearAgi: 150000, priorYearTotalTax: 10000.01 } }
    const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data }), model = await Tax.findOrFail(tax.id)
    // Pure worksheet threshold/safe-harbor/installment arithmetic is tested in the
    // focused non-DB suite. This case verifies the real DB supplies identical inputs.
    assert.deepEqual(model.data, data)
    assert.strictEqual(model.data.estimated?.priorYearTotalTax, 10000.01)
    assert.strictEqual((await rawTax()).data.estimated.priorYearTotalTax, '10000.01')
  })
  test('Tax replacement retains unknown root and estimated properties', async ({ client, assert }) => {
    const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data: forecast(1) })
    await db.from('taxes').where('id', tax.id).update({ data: JSON.stringify({ ...forecast(1), note: { amount: 1.005 },
      estimated: { ...forecast(1).estimated, evidence: 'keep' } }) })
    const response = await client.post('/api/v1/taxes').json({ year: 2026, forecast: forecast(2.345) }).accept('json').loginAs(f.user)
    response.assertStatus(200); const raw = await rawTax()
    assert.deepEqual(raw.data.note, { amount: 1.005 }); assert.equal(raw.data.estimated.evidence, 'keep')
    assert.equal(raw.data.estimated.priorYearTotalTax, '2.35')
  })
  test('optional/null leaves persist without manufacturing zero amounts', async ({ assert }) => {
    const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data: { ...forecast(1), estimated: undefined } })
    await db.from('taxes').where('id', tax.id).update({ data: JSON.stringify({ filingStatus: FilingStatus.Single, taxableInterest: null, estimated: null }) })
    const before = await rawTax(), model = await Tax.findOrFail(tax.id)
    assert.isNull(model.data.estimated); assert.isNull(model.data.taxableInterest)
    model.year = 2027; await model.save()
    assert.deepEqual((await db.from('taxes').where('id', tax.id).firstOrFail()).data, before.data)
  })
  test('TransactionLog keeps json column semantics, strings at rest and numeric APIs', async ({ client, assert }) => {
    const before = await financialState()
    const log = await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'synthetic',
      changes: { amount: { old: 0.125, new: -0.125 }, unrelated: { amount: 1.005 } } })
    const raw = (await db.rawQuery("SELECT changes::text AS raw,json_typeof(changes->'amount'->'old') AS old_kind FROM transaction_logs WHERE id=?", [log.id])).rows[0]
    assert.equal(raw.old_kind, 'string'); assert.deepEqual(JSON.parse(raw.raw).amount, { old: '0.13', new: '-0.12' })
    const model = await TransactionLog.findOrFail(log.id); assert.deepEqual(model.changes?.amount, { old: 0.13, new: -0.12 })
    const response = await client.get('/api/v1/transaction-logs').accept('json').loginAs(f.user); response.assertStatus(200)
    const item = response.body().find((entry: { id: number }) => entry.id === log.id)
    assert.deepEqual(item.changes.amount, { old: 0.13, new: -0.12 }); assert.deepEqual(item.changes.unrelated, { amount: 1.005 })
    const column = await db.rawQuery("SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='transaction_logs' AND column_name='changes'")
    assert.equal(column.rows[0].udt_name, 'json'); assert.deepEqual(await financialState(), before)
  })
  test('explicit JSON-null changes remain distinct from omitted SQL-null changes', async ({ assert }) => {
    const nullable = await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'json null', changes: null })
    const absent = await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'sql null' })
    const rows = (await db.rawQuery('SELECT id,changes IS NULL AS sql_null,json_typeof(changes) AS kind FROM transaction_logs WHERE id IN (?,?) ORDER BY id', [nullable.id, absent.id])).rows
    assert.isFalse(rows[0].sql_null); assert.equal(rows[0].kind, 'null')
    assert.isTrue(rows[1].sql_null); assert.isNull(rows[1].kind)
  })
  test('new log appends leave raw historical numeric/mixed log JSON untouched', async ({ assert }) => {
    const old = await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'old', changes: {} })
    const original = '{"amount":{"old":1.005,"new":"2.00"},"note":"keep"}'
    await db.from('transaction_logs').where('id', old.id).update({ changes: original })
    const before = await db.from('transaction_logs').where('id', old.id).firstOrFail()
    const model = await TransactionLog.findOrFail(old.id); assert.deepEqual(model.serialize().changes.amount, { old: 1.005, new: 2 })
    await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'new', changes: { amount: { new: 2.345 } } })
    await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'message only' })
    assert.deepEqual(await db.from('transaction_logs').where('id', old.id).firstOrFail(), before)
  })
  test('Tax and log changes roll back atomically within the owning Budget transaction', async ({ assert }) => {
    const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data: forecast(1) }), before = await rawTax()
    const countBefore = await db.from('transaction_logs').where('transaction_id', f.transaction.id)
    await assert.rejects(async () => db.transaction(async trx => {
      await Budget.query({ client: trx }).where('id', f.budget.id).forUpdate().firstOrFail()
      const row = await Tax.query({ client: trx }).where('id', tax.id).firstOrFail(); replaceTaxForecast(row, forecast(2.345)); await row.save()
      await TransactionLog.create({ budgetId: f.budget.id, transactionId: f.transaction.id, message: 'rollback', changes: { amount: { old: 1, new: 2 } } }, { client: trx })
      assert.equal((await trx.from('taxes').where('id', tax.id).firstOrFail()).data.taxableInterest, '2.35')
      throw new Error('intentional rollback')
    }), 'intentional rollback')
    assert.deepEqual(await rawTax(), before); assert.deepEqual(await db.from('transaction_logs').where('transaction_id', f.transaction.id), countBefore)
  })
  test('Tax save and log listing remain isolated by owning Budget', async ({ client, assert }) => {
    const foreign = await fixture()
    const tax = await Tax.create({ budgetId: f.budget.id, year: 2026, data: forecast(1) }), before = await rawTax()
    const log = await f.transaction.related('transactionLog').create({ budgetId: f.budget.id, message: 'private', changes: { amount: { old: 1 } } })
    const response = await client.post('/api/v1/taxes').json({ year: 2026, forecast: forecast(2) }).accept('json').loginAs(foreign.user)
    response.assertStatus(200); assert.deepEqual(await rawTax(), before); assert.equal((await Tax.findOrFail(tax.id)).data.taxableInterest, 1)
    const list = await client.get('/api/v1/transaction-logs').accept('json').loginAs(foreign.user); list.assertStatus(200)
    assert.isFalse(list.body().some((entry: { id: number }) => entry.id === log.id))
  })
})
