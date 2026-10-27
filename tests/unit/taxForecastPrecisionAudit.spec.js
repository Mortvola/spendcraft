import { test } from '@japa/runner'
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { URL } from 'node:url'
import { FIELDS, PAGE_SQL, LOG_FIELDS, LOG_SQL, inspectLog, argumentsFor, inspectTax, loadWorksheet, runAudit } from '../../scripts/auditTaxForecastPrecision.mjs'

const worksheet = await loadWorksheet()
const forecast = () => ({ filingStatus: 'Single', ...Object.fromEntries(FIELDS.filter(f => !f.includes('.')).map(f => [f, 0])),
  estimated: { expectedAgi: 100000, priorYearAgi: 150000, priorYearTotalTax: 10000 } })
function row(data = forecast(), extra = {}) {
  const tokens = Object.fromEntries(FIELDS.map(f => { const [a, b] = f.split('.'); return [f, JSON.stringify(b ? data?.[a]?.[b] : data?.[a]) ?? null] }))
  return { id: 1, budget_id: 3, year: 2026, data_text: data === undefined ? undefined : JSON.stringify(data), tokens: JSON.stringify(tokens), ...extra }
}
function fake(rows = [], mode = 'on') {
  const calls = []
  return { calls, async query(sql, params) {
    calls.push([sql, params])
    if (sql === LOG_SQL) return { rows: [] }
    if (sql === PAGE_SQL) return { rows: rows.filter(r => r.id > params[0]).slice(0, params[1]) }
    if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: mode }] }
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] }
    throw new Error('unexpected_query')
  } }
}
const identity = { database: { name: 'audit_fixture' } }
const dependencies = { verify: async () => identity, reverify: async () => undefined }

test.group('Tax forecast precision audit (no database)', () => {
  test('all 13 validator/model money paths are audited, with no nonmonetary fields', async ({ assert }) => {
    assert.lengthOf(FIELDS, 13); assert.lengthOf(FIELDS.filter(f => f.startsWith('estimated.')), 3)
    const validator = await readFile(new URL('../../app/validation/Validators/tax.ts', import.meta.url), 'utf8')
    const model = await readFile(new URL('../../app/Models/Tax.ts', import.meta.url), 'utf8')
    assert.equal((validator.match(/: vine.number\(\)/g) ?? []).length, 14) // Includes nonmonetary year.
    for (const f of FIELDS) { const name = f.split('.').at(-1); assert.include(validator, name + ': vine.number()'); assert.include(model, name + ': number') }
    assert.notInclude(FIELDS, 'filingStatus'); assert.notInclude(FIELDS, 'year')
  })
  test('safe entered values are classified without mutating input')
    .with([[12, true, false, '12.00'], [12.34, false, false, '12.34'], [1.005, false, true, '1.00'],
      [-0.125, false, true, '-0.12'], [0, true, false, '0.00'], [0.30000000000000004, false, true, '0.30']])
    .run(({ assert }, [amount, whole, fractional, proposed]) => {
      const data = forecast(); data.taxableInterest = amount; const input = row(data), before = JSON.stringify(input)
      const f = inspectTax(input, worksheet).fields.taxableInterest
      assert.equal(f.status, 'valid'); assert.equal(f.wholeDollar, whole); assert.equal(f.fractionalCents, fractional)
      assert.equal(f.proposedAmount, proposed); assert.equal(JSON.stringify(input), before)
    })
  test('strings and mixed objects are characterized without hypothetical string coercion')
    .with(['1.25', '1.005', '1e2', '-0.00']).run(({ assert }, value) => {
      const data = forecast(); data.taxableInterest = value; const f = inspectTax(row(data), worksheet)
      assert.isTrue(f.mixed); assert.equal(f.fields.taxableInterest.kind, 'string')
      assert.isNull(f.fields.taxableInterest.proposedAmount)
      assert.equal(f.fields.taxableInterest.canonicalString, value === '1.25')
    })
  test('malformed and unsafe leaves never become zero')
    .with([null, true, {}, [], 'no', '', 'Infinity', 1e100]).run(({ assert }, value) => {
      const data = forecast(); data.estimated.priorYearTotalTax = value; const f = inspectTax(row(data), worksheet)
      assert.equal(f.fields['estimated.priorYearTotalTax'].status, 'malformed')
      assert.equal(f.calculation.status, 'not_compared')
    })
  test('raw tokens preserve decimal precision lost by JSON.parse', ({ assert }) => {
    const data = forecast(); data.taxableInterest = 0.1; const input = row(data)
    input.tokens = JSON.stringify({ ...JSON.parse(input.tokens), taxableInterest: '0.100000000000000001' })
    const f = inspectTax(input, worksheet).fields.taxableInterest
    assert.equal(f.originalToken, '0.100000000000000001'); assert.isTrue(f.sourceToNumberChanged)
    assert.equal(f.differenceCents, '-0.0000000000000001')
  })
  test('SQL null, JSON null, array and malformed roots are explicit')
    .with([[null, 'sql_null'], ['null', 'null'], ['[]', 'array'], ['{', 'invalid_json']])
    .run(({ assert }, [data_text, shape]) => {
      const f = inspectTax(row(forecast(), { data_text, tokens: '{}' }), worksheet)
      assert.equal(f.shape, shape); assert.isFalse(f.fields.taxableInterest.present)
    })
  test('absent, null and malformed optional estimated objects remain distinct')
    .with([[undefined, 'missing'], [null, 'null'], [[], 'array'], [1, 'number']])
    .run(({ assert }, [value, expected]) => {
      const data = forecast(); if (value === undefined) delete data.estimated; else data.estimated = value
      const f = inspectTax(row(data), worksheet); assert.equal(f.estimatedShape, expected)
      assert.equal(f.fields['estimated.expectedAgi'].kind, 'missing'); assert.equal(f.calculation.status, 'not_compared')
    })
  test('unknown nested/array properties are surfaced without being classified as money', ({ assert }) => {
    const data = forecast(); data.extra = [{ amount: 7 }]; data.estimated.extra = 0.5
    const f = inspectTax(row(data), worksheet)
    assert.include(f.unclassifiedPaths.map(e => e.path), 'extra.0.amount')
    assert.include(f.unclassifiedPaths.map(e => e.path), 'estimated.extra')
    assert.lengthOf(Object.keys(f.fields), 13); assert.equal(f.rawData, JSON.stringify(data))
  })
  test('actual worksheet detects AGI threshold crossing from hypothetical rounding', ({ assert }) => {
    const data = forecast(); data.estimated.priorYearAgi = 150000.004
    const f = inspectTax(row(data), worksheet).calculation
    assert.equal(f.status, 'compared'); assert.isTrue(f.thresholdSelectionChanged)
    assert.include(f.changedLines, '12b'); assert.equal(f.before.lines['12b'], 11000); assert.equal(f.hypothetical.lines['12b'], 10000)
  })
  test('actual worksheet preserves cent inputs and exposes higher-precision installment results', ({ assert }) => {
    const data = forecast(); data.estimated.priorYearTotalTax = 10000.01
    const f = inspectTax(row(data), worksheet).calculation
    assert.isFalse(f.changed); assert.equal(f.before.firstInstallment, 2500.0025)
  })
  test('fractional tax rounds only in hypothesis and changes safe harbor/payment', ({ assert }) => {
    const data = forecast(); data.estimated.priorYearTotalTax = 10000.125
    const f = inspectTax(row(data), worksheet).calculation
    assert.isTrue(f.changed); assert.equal(f.before.lines['12b'], 10000.125); assert.equal(f.hypothetical.lines['12b'], 10000.13)
    assert.equal(data.estimated.priorYearTotalTax, 10000.125)
  })
  test('other years and string calculation inputs are explicit limitations', ({ assert }) => {
    assert.equal(inspectTax(row(forecast(), { year: 2025 }), worksheet).calculation.reason, 'no_matching_year_calculation')
    const data = forecast(); data.estimated.expectedAgi = '100000.00'
    assert.equal(inspectTax(row(data), worksheet).calculation.reason, 'estimated_requires_three_safe_numeric_inputs')
  })
  test('summary reconciles per-field counts and emits only read-only SQL', async ({ assert }) => {
    const data = forecast(); data.taxableInterest = '1.00'; data.longTermCapitalGains = -2; data.dividends = 9
    const c = fake([row(data), row(null, { id: 2, data_text: null, tokens: '{}' })]), findings = []
    const s = await runAudit(c, {}, f => findings.push(f), worksheet, dependencies)
    assert.equal(s.recordsExamined, 2); assert.equal(s.mixedRecords, 1)
    assert.equal(s.fields.taxableInterest.strings, 1); assert.equal(s.fields.taxableInterest.missing, 1)
    assert.equal(s.fields.longTermCapitalGains.negative, 1); assert.equal(s.fields.ordinaryDividends.zero, 1)
    for (const field of FIELDS) { const f = s.fields[field]; assert.equal(f.examined, 2); assert.equal(f.present + f.missing, 2) }
    assert.lengthOf(findings, 2); assert.equal(c.calls[0][0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert.equal(c.calls.at(-1)[0], 'COMMIT')
    for (const [sql] of c.calls) assert.match(sql, /^(SELECT|BEGIN|COMMIT)/)
    assert.notMatch(PAGE_SQL, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|TRUNCATE|nextval|setval)\b/i)
  })
  test('read-only mode and identity failures roll back without scanning', async ({ assert }) => {
    for (const mode of ['off', 'on']) {
      const c = fake([], mode)
      await assert.rejects(() => runAudit(c, {}, () => undefined, worksheet, {
        ...dependencies, verify: async () => { throw Error('database_identity_mismatch') },
      }), mode === 'off' ? 'read_only_required' : 'database_identity_mismatch')
      assert.equal(c.calls.at(-1)[0], 'ROLLBACK'); assert.isFalse(c.calls.some(([sql]) => sql === PAGE_SQL))
    }
  })
  test('unsafe/missing/null counts and precise signs reconcile without zero coercion', async ({ assert }) => {
    const data = forecast(); data.taxableInterest = 1e100; data.ordinaryDividends = null; delete data.longTermCapitalGains
    const input = row(data); input.tokens = JSON.stringify({ ...JSON.parse(input.tokens), shortTermCapitalGains: '-1e-1000' })
    const summary = await runAudit(fake([input]), {}, () => undefined, worksheet, dependencies)
    assert.equal(summary.fields.taxableInterest.unsafe, 1); assert.equal(summary.fields.taxableInterest.malformed, 1)
    assert.equal(summary.fields.ordinaryDividends.null, 1); assert.equal(summary.fields.longTermCapitalGains.missing, 1)
    assert.equal(summary.fields.shortTermCapitalGains.negative, 1); assert.equal(summary.fields.shortTermCapitalGains.zero, 0)
  })
  test('identity revalidation failure preserves diagnostics and rolls back', async ({ assert }) => {
    const c = fake([row()]), findings = []
    await assert.rejects(() => runAudit(c, {}, f => findings.push(f), worksheet, {
      ...dependencies, reverify: async () => { throw Error('target_changed') },
    }), 'target_changed')
    assert.lengthOf(findings, 1); assert.equal(c.calls.at(-1)[0], 'ROLLBACK')
    assert.isFalse(c.calls.some(([sql]) => sql === 'COMMIT'))
  })
  test('TransactionLog old/new money is characterized without changing the recorded proposal')
    .with([[1.25, 1.005], ['1.25', -0.125], [null, 0], [1e100, 'bad']])
    .run(({ assert }, [old, value]) => {
      const changes = { amount: { old, new: value }, note: { new: 'unchanged' } }
      const r = { id: 7, budget_id: 3, transaction_id: 8, changes_text: JSON.stringify(changes),
        tokens: JSON.stringify({ 'amount.old': JSON.stringify(old), 'amount.new': JSON.stringify(value) }) }
      const f = inspectLog(r)
      assert.equal(f.rawChanges, r.changes_text); assert.equal(f.source, 'transaction_logs')
      assert.deepEqual(Object.keys(f.fields), LOG_FIELDS); assert.include(f.otherChangeKeys, 'note')
      assert.equal(f.fields['amount.old'].kind, old === null ? 'null' : typeof old)
      if (value === 1.005) { assert.equal(f.fields['amount.new'].proposedAmount, '1.00'); assert.isTrue(f.fields['amount.new'].changed) }
      assert.deepEqual(JSON.parse(r.changes_text), changes)
    })
  test('TransactionLog null/message-only and unsupported amount shapes are explicit')
    .with([null, {}, { amount: null }, { amount: [1, 2] }]).run(({ assert }, changes) => {
      const f = inspectLog({ id: 1, changes_text: changes === null ? null : JSON.stringify(changes), tokens: '{}' })
      assert.isFalse(f.fields['amount.old'].present); assert.equal(f.fields['amount.new'].kind, 'missing')
      if (changes === null) assert.equal(f.shape, 'sql_null')
    })
  test('one consistent read-only audit covers Tax and TransactionLog, never PlaidLog', async ({ assert }) => {
    const c = fake([row()]), baseQuery = c.query.bind(c), findings = []
    c.query = async (sql, params) => {
      if (sql === LOG_SQL) {
        c.calls.push([sql, params])
        return { rows: params[0] === 0 ? [{ id: 10, budget_id: 3, transaction_id: 8,
          changes_text: '{"amount":{"old":1.25,"new":1.005}}',
          tokens: '{"amount.old":"1.25","amount.new":"1.005"}' }] : [] }
      }
      return baseQuery(sql, params)
    }
    const summary = await runAudit(c, {}, f => findings.push(f), worksheet, dependencies)
    assert.equal(summary.transactionLogs.recordsExamined, 1)
    assert.equal(summary.transactionLogs.fields['amount.new'].hypotheticalNumericChanges, 1)
    assert.equal(summary.transactionLogs.fields['amount.old'].centScale, 1)
    assert.lengthOf(findings, 2); assert.equal(findings[1].source, 'transaction_logs')
    assert.equal(c.calls.filter(([sql]) => sql.startsWith('BEGIN')).length, 1)
    assert.isFalse(c.calls.some(([sql]) => /plaid_logs/i.test(sql)))
    assert.notMatch(LOG_SQL, /\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|TRUNCATE|nextval|setval)\b/i)
  })
  test('explicit database required and execute/recovery flags rejected', ({ assert }) => {
    for (const args of [[], ['--database', 'x', '--execute'], ['--database', 'x', '--recover']]) assert.throws(() => argumentsFor(args))
    assert.equal(argumentsFor(['--database', 'audit_fixture']).database, 'audit_fixture')
  })
  test('CLI creates private output before configuration failure; print-sql never connects', async ({ assert }) => {
    const parent = await mkdtemp(join(tmpdir(), 'tax-forecast-audit-test-'))
    try {
      const result = spawnSync(process.execPath, ['scripts/auditTaxForecastPrecision.mjs', '--database', 'audit_fixture', '--env', join(parent, 'missing'), '--output-parent', parent], { encoding: 'utf8' })
      assert.equal(result.status, 1); assert.include(result.stdout, parent)
      assert.lengthOf(await readdir(parent), 1)
      const sql = spawnSync(process.execPath, ['scripts/auditTaxForecastPrecision.mjs', '--print-sql'], { encoding: 'utf8' })
      assert.equal(sql.status, 0); assert.include(sql.stdout, 'FROM public.taxes')
    } finally { await rm(parent, { recursive: true, force: true }) }
  })
})
