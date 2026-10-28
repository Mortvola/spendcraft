import { test } from '@japa/runner'
import Tax from '../../app/Models/Tax.ts'
import TransactionLog from '../../app/Models/TransactionLog.ts'
import { taxForecastFields, taxEstimatedFields, encodeTaxForecast, decodeTaxForecast,
  encodeTransactionLogMoney, decodeTransactionLogMoney, storedTaxMonetaryAmount, validateSubmittedTaxForecast, serializeTaxForecast, serializeTransactionLogMoney } from '../../app/services/taxMonetaryCodec.ts'
import { replaceTaxForecast } from '../../app/services/taxMonetaryStorage.ts'
import { addTax } from '../../app/validation/Validators/tax.ts'
import { loadWorksheet } from '../../scripts/auditTaxForecastPrecision.mjs'

const forecast = amount => ({ filingStatus: 'Single', ...Object.fromEntries(taxForecastFields.map(f => [f, amount])),
  estimated: Object.fromEntries(taxEstimatedFields.map(f => [f, amount])) })
function sample(kind) {
  const Model = kind === 'tax' ? class extends Tax {} : class extends TransactionLog {}
  const property = kind === 'tax' ? 'data' : 'changes', writes = []
  Model.boot()
  Model.$adapter = {
    query() { return { client: { dialect: { dateTimeFormat: 'yyyy-MM-dd HH:mm:ss.SSSZZ' } } } },
    async insert(_row, values) { writes.push(values) }, async update(_row, values) { writes.push(values) },
  }
  const hydrated = value => Model.$createFromAdapterResult({ id: 1, budget_id: 3, application_id: 3, year: 2026,
    transaction_id: 4, message: 'original', [property]: value })
  return { Model, property, writes, hydrated }
}

test.group('Tax and TransactionLog monetary storage (no database)', () => {
  test('all 15 approved paths use individual approved rounding').with([
    [12.345, '12.35'], [0.125, '0.13'], [-0.125, '-0.12'], [1.005, '1.00'], [-1.005, '-1.00'],
    [0.1 + 0.2, '0.30'], [0, '0.00'], [-0, '0.00'], [0.005, '0.01'], [-0.005, '0.00'], [-12.34, '-12.34'],
  ]).run(({ assert }, [amount, stored]) => {
    assert.equal(storedTaxMonetaryAmount(amount), stored)
    assert.deepEqual(encodeTaxForecast(forecast(amount)), forecast(stored))
    assert.deepEqual(encodeTransactionLogMoney({ amount: { old: amount, new: amount } }), { amount: { old: stored, new: stored } })
  })
  test('malformed, nonfinite and unsafe scalars reject').with([
    true, false, {}, [], NaN, Infinity, -Infinity, '', ' ', '1.2', '1.005', '1e2', '-0.00', '01.00',
    Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, '90071992547409.92',
  ]).run(({ assert }, value) => {
    assert.throws(() => encodeTaxForecast(forecast(value)))
    assert.throws(() => encodeTransactionLogMoney({ amount: { old: value } }))
  })
  test('canonical reads expose numbers and unrelated JSON', ({ assert }) => {
    const raw = { ...forecast('2.00'), taxableInterest: '1.00', estimated: { ...forecast('2.00').estimated, priorYearAgi: '-0.12' },
      note: { amount: 1.005, ordered: [2, 1, 2] } }, before = globalThis.structuredClone(raw)
    const decoded = decodeTaxForecast(raw)
    assert.equal(decoded.taxableInterest, 1); assert.equal(decoded.estimated.priorYearAgi, -0.12)
    assert.equal(decoded.estimated.priorYearTotalTax, 2); assert.deepEqual(raw, before)
    assert.deepEqual(decoded.note, raw.note)
    const log = { amount: { old: '1.00', new: '2.00', currency: 'USD' }, categories: [{ amount: 1.005 }] }
    assert.deepEqual(decodeTransactionLogMoney(log), { ...log, amount: { ...log.amount, old: 1, new: 2 } })
    assert.equal(log.amount.new, '2.00')
  })
  test('missing/null roots, parents and leaves remain missing/null').with([null, undefined])
    .run(({ assert }, value) => {
      assert.strictEqual(encodeTaxForecast(value), value); assert.strictEqual(decodeTaxForecast(value), value)
      assert.strictEqual(encodeTransactionLogMoney(value), value); assert.strictEqual(decodeTransactionLogMoney(value), value)
      assert.deepEqual(encodeTaxForecast({ filingStatus: 'Single', taxableInterest: value, estimated: null }), { filingStatus: 'Single', taxableInterest: value, estimated: null })
    })
  test('null leaves and message-only or unrelated changes are never filled with zeros', ({ assert }) => {
    assert.deepEqual(encodeTaxForecast({ taxableInterest: null, estimated: { priorYearAgi: null } }), { taxableInterest: null, estimated: { priorYearAgi: null } })
    for (const changes of [{}, { note: { old: 'a', new: 'b' } }, { amount: null }, { amount: { new: null } }]) {
      assert.deepEqual(encodeTransactionLogMoney(changes), changes); assert.deepEqual(decodeTransactionLogMoney(changes), changes)
    }
    assert.deepEqual(encodeTransactionLogMoney({ amount: { old: 1 } }), { amount: { old: '1.00' } })
  })
  test('Tax request numeric-string syntax is preserved, unsupported coercions reject', async ({ assert }) => {
    for (const value of ['1.005', '-.125', '1e-2', 1.005]) {
      validateSubmittedTaxForecast(forecast(value)); const validated = await addTax.validate({ year: 2026, forecast: forecast(value) })
      assert.equal(validated.forecast.taxableInterest, Number(value))
    }
    for (const value of [true, '', ' ', '0x10', {}, [], Infinity]) assert.throws(() => validateSubmittedTaxForecast(forecast(value)))
  })
  test('real model new writes store strings and immediately expose rounded numeric APIs').with(['tax', 'log'])
    .run(async ({ assert }, kind) => {
      const { Model, property, writes } = sample(kind), row = new Model()
      const value = kind === 'tax' ? forecast(-0.125) : { amount: { old: 0.125, new: -0.125 }, note: { unchanged: 1.005 } }
      row.merge({ id: 1, [property]: value }); await row.save()
      assert.lengthOf(writes, 1)
      assert.deepEqual(JSON.parse(writes[0][property]), kind === 'tax' ? forecast('-0.12') : { ...value, amount: { old: '0.13', new: '-0.12' } })
      assert.deepEqual(row.serialize()[property], kind === 'tax' ? forecast(-0.12) : { ...value, amount: { old: 0.13, new: -0.12 } })
      assert.isFalse(row.$isDirty)
    })
  test('real model reads and nonmoney saves never normalize historical amounts').with(['tax', 'log'])
    .run(async ({ assert }, kind) => {
      const { hydrated, property, writes } = sample(kind)
      const raw = kind === 'tax' ? forecast('1.00') : { amount: { old: '1.00', new: '2.00' }, note: 'old' }
      const before = globalThis.structuredClone(raw), row = hydrated(raw)
      assert.isFalse(row.$isDirty); await row.save(); assert.lengthOf(writes, 0)
      if (kind === 'tax') row.year = 2027; else row.message = 'changed'
      await row.save(); assert.notProperty(writes[0], property); assert.deepEqual(raw, before)
    })
  test('metadata-only JSON saves retain historical leaf representations').with(['tax', 'log'])
    .run(async ({ assert }, kind) => {
      const { hydrated, property, writes } = sample(kind)
      const raw = kind === 'tax' ? { ...forecast('1.00'), note: 'old' } : { amount: { old: '1.00', new: '2.00' }, note: 'old' }
      const row = hydrated(raw); row[property].note = 'new'; await row.save()
      assert.deepEqual(JSON.parse(writes[0][property]), { ...raw, note: 'new' }); assert.isFalse(row.$isDirty)
    })
  test('explicit Tax replacement encodes unchanged legacy amounts and preserves metadata', async ({ assert }) => {
    const { hydrated, writes } = sample('tax'), row = hydrated({ ...forecast('1.00'), note: { amount: 1.005 },
      estimated: { ...forecast('1.00').estimated, evidence: 'keep' } })
    replaceTaxForecast(row, forecast(1)); await row.save()
    assert.deepEqual(JSON.parse(writes[0].data), { ...forecast('1.00'), note: { amount: 1.005 }, estimated: { ...forecast('1.00').estimated, evidence: 'keep' } })
    assert.deepEqual(row.data.estimated, { ...forecast(1).estimated, evidence: 'keep' })
  })
  test('explicit null log changes retain JSON null while message-only writes omit changes', async ({ assert }) => {
    const { Model, writes } = sample('log'), nullable = new Model(), absent = new Model()
    nullable.merge({ id: 2, changes: null }); await nullable.save()
    absent.merge({ id: 3, message: 'message only' }); await absent.save()
    assert.strictEqual(writes[0].changes, 'null'); assert.isNull(nullable.serialize().changes)
    assert.notProperty(writes[1], 'changes')
  })
  test('a new log append never rewrites a hydrated historical log', async ({ assert }) => {
    const { Model, hydrated, writes } = sample('log'), old = hydrated({ amount: { old: '1.00' } })
    const original = globalThis.structuredClone(old.$attributes), created = new Model()
    created.merge({ id: 2, message: 'new entry', changes: { amount: { new: 2.345 } } }); await created.save()
    assert.lengthOf(writes, 1); assert.equal(writes[0].id, 2); assert.deepEqual(old.$attributes, original)
  })
  test('existing Worksheet 2-1 values/thresholds/safe-harbor and subcent installments survive storage', async ({ assert }) => {
    const worksheet = await loadWorksheet()
    for (const agi of [150000, 150000.01]) {
      const original = { ...forecast(0), estimated: { expectedAgi: 100000, priorYearAgi: agi, priorYearTotalTax: 10000.01 } }
      const decoded = decodeTaxForecast(encodeTaxForecast(original)); assert.deepEqual(decoded, original)
      const input = data => ({ filingStatus: 'Single', deductions: worksheet.deductions('Single'), adjustedGrossIncome: data.estimated.expectedAgi,
        priorYearAdjustedGrossIncome: data.estimated.priorYearAgi, priorYearTotalTax: data.estimated.priorYearTotalTax })
      assert.deepEqual(worksheet.calculate(input(decoded)), worksheet.calculate(input(original)))
      if (agi === 150000) assert.equal(worksheet.calculate(input(decoded)).firstInstallment, 2500.0025)
    }
  })
})

test('Tax and log storage decoding reject numbers while serialization preserves numeric models', ({ assert }) => {
  for (const amount of [0, -0, 1, -1, 1.005]) {
    const changes = { amount: { old: amount, new: amount }, note: { amount: 'unrelated' } }
    assert.throws(() => decodeTaxForecast(forecast(amount)))
    assert.throws(() => decodeTransactionLogMoney(changes))
    assert.throws(() => sample('tax').hydrated(forecast(amount)))
    assert.throws(() => sample('log').hydrated(changes))
    assert.deepEqual(serializeTaxForecast(forecast(amount)), forecast(amount))
    assert.deepEqual(serializeTransactionLogMoney(changes), changes)
    assert.deepEqual(new Tax().merge({ data: forecast(amount) }).serialize().data, forecast(amount))
    assert.deepEqual(new TransactionLog().merge({ changes }).serialize().changes, changes)
  }
  assert.throws(() => serializeTaxForecast(forecast('1.00')))
  assert.throws(() => serializeTransactionLogMoney({ amount: { old: '1.00' } }))
})
