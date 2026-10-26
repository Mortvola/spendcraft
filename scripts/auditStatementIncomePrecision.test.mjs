import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { FIELDS, PAGE_SQL, REPORT_SQL, argumentsFor, inspectStatement, runAudit } from './auditStatementIncomePrecision.mjs'

const row = (data, extra = {}) => ({ id: 1, account_id: 2, budget_id: 3,
  start_date: '2026-01-01', end_date: '2026-01-31', data_text: JSON.stringify(data),
  tokens: JSON.stringify(Object.fromEntries(FIELDS.map(f => [f, data && Object.hasOwn(data, f) ? JSON.stringify(data[f]) : null]))), ...extra })
const all = amount => Object.fromEntries(FIELDS.map(f => [f, amount]))

for (const [amount, proposed, difference] of [
  [12.34, '12.34', '0'], [12.345, '12.35', '0.5'], [-0.125, '-0.12', '0.5'],
  [0.125, '0.13', '0.5'], [-1.005, '-1.00', '0.5'], [0, '0.00', '0'],
  [0.30000000000000004, '0.30', '-0.000000000000004'],
]) test(`hypothetical rounding preserves raw evidence for ${amount}`, () => {
  const input = row(all(amount)), saved = JSON.parse(JSON.stringify(input))
  const { finding, proposal } = inspectStatement(input)
  for (const f of FIELDS) {
    assert.equal(finding.fields[f].differenceCents, difference)
    assert.equal(proposal.data[f], proposed)
    assert.equal(finding.fields[f].fractionalCents, difference !== '0')
  }
  assert.deepEqual(input, saved)
  assert.equal(finding.rawData, input.data_text)
})

test('mixed representations retain strings and unrelated metadata', () => {
  const { finding, proposal } = inspectStatement(row({ ...all(0), dividends: '1.005', note: { original: true } }))
  assert.equal(finding.mixed, true)
  assert.equal(finding.fields.dividends.fractionalCents, true)
  assert.equal(finding.fields.dividends.proposedAmount, null)
  assert.equal(proposal.data.dividends, '1.005')
  assert.deepEqual(proposal.data.note, { original: true })
})
test('canonical and noncanonical strings are distinct without changing either', () => {
  for (const [value, canonical] of [['12.34', true], ['-0.00', false], ['1e-2', false]]) {
    assert.equal(inspectStatement(row(all(value))).finding.fields.dividends.canonicalString, canonical)
  }
})
test('SQL null, JSON null, missing, empty and non-object data stay distinct', () => {
  for (const [value, shape] of [[null, 'sql_null'], ['null', 'json_null'], [undefined, 'missing'], ['{}', 'object'], ['[]', 'non_object'], ['1', 'non_object'], ['bad', 'invalid_json']]) {
    const { finding } = inspectStatement(row({}, { data_text: value }))
    assert.equal(finding.shape, shape)
    assert.equal(finding.fields.dividends.kind, 'missing')
  }
  assert.equal(inspectStatement(row(all(null))).finding.fields.dividends.kind, 'null')
})
test('malformed and unsafe values cannot be hypothetically zeroed', () => {
  for (const value of [true, {}, [], '', 'bad', 'Infinity', Number.MAX_SAFE_INTEGER]) {
    const { finding, proposal } = inspectStatement(row(all(value)))
    assert.equal(finding.fields.dividends.status, 'malformed')
    assert.deepEqual(proposal.data.dividends, value)
  }
})
test('raw PostgreSQL precision survives JavaScript hydration', () => {
  const { finding } = inspectStatement(row(all(0.1), { tokens: JSON.stringify(Object.fromEntries(FIELDS.map(f => [f, '0.100000000000000001']))) }))
  assert.equal(finding.fields.dividends.sourceToNumberChanged, true)
  assert.equal(finding.fields.dividends.differenceCents, '-0.0000000000000001')
})
test('explicit target required and execution flags rejected', () => {
  for (const args of [[], ['--execute'], ['--database', 'budget', '--execute'], ['budget']]) assert.throws(() => argumentsFor(args))
  assert.equal(argumentsFor(['--database', 'budget']).database, 'budget')
})

function mock(rows, options = {}) {
  const calls = []
  const client = { calls, async query(sql, params) {
    calls.push({ sql, params })
    if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: options.mode ?? 'on' }] }
    if (sql === PAGE_SQL) return { rows: rows.filter(r => r.id > params[0]) }
    if (sql === REPORT_SQL) return { rows: [Object.fromEntries(FIELDS.flatMap(f => [[f, 1], [`hypothetical_${f}`, options.reportValue ?? 1]]))] }
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] }
    throw Error('unexpected_query')
  } }
  const dependencies = { verify: async () => ({ database: { name: 'test' } }), reverify: async () => { if (options.failIdentity) throw Error('identity_changed') } }
  return { client, dependencies }
}
test('read-only scan counts fields and compares reports without mutations', async () => {
  const { client, dependencies } = mock([row({ ...all(0), dividends: '1.00' })])
  const findings = []
  const result = await runAudit(client, {}, f => findings.push(f), dependencies)
  assert.equal(result.statementsExamined, 1)
  assert.equal(result.mixedStatements, 1)
  assert.equal(result.fields.dividends.strings, 1)
  assert.equal(result.fields.taxableInterest.numeric, 1)
  assert.equal(findings.length, 1)
  assert.deepEqual(result.reportDifferences, [])
  assert.equal(result.hypotheticalPolicyOnly, true)
  for (const { sql } of client.calls) assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i)
})
test('report differences are reported without treating attribution as balances', async () => {
  const { client, dependencies } = mock([row(all(1.005))], { reportValue: 2 })
  const result = await runAudit(client, {}, () => undefined, dependencies)
  assert.equal(result.reportDifferences.length, 1)
  assert.equal(result.fields.dividends.hypotheticalNumericChanges, 1)
})
test('malformed values explicitly block report comparison, not silent zero substitution', async () => {
  const { client, dependencies } = mock([row(all('bad'))])
  const result = await runAudit(client, {}, () => undefined, dependencies)
  assert.equal(result.reportComparison, 'not_compared_unsupported_values')
  assert.equal(result.fields.dividends.malformed, 1)
  assert.equal(result.reports, null)
  assert.equal(client.calls.some(c => c.sql === REPORT_SQL), false)
})
test('read-write connections and changed identity abort', async () => {
  for (const options of [{ mode: 'off' }, { failIdentity: true }]) {
    const { client, dependencies } = mock([], options)
    await assert.rejects(runAudit(client, {}, () => undefined, dependencies))
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK')
  }
})
test('report query preserves actual selection, casts and month grouping', () => {
  assert.match(REPORT_SQL, /a.subtype NOT IN \('401k','Roth 401k','Roth','ira'\)/)
  assert.match(REPORT_SQL, /YEAR FROM start_date/)
  assert.match(REPORT_SQL, /MONTH FROM end_date/)
  for (const f of FIELDS) assert.ok(REPORT_SQL.includes(`SUM(COALESCE((data->>'${f}')::real,0))`))
  assert.doesNotMatch(PAGE_SQL + REPORT_SQL, /starting_balance|ending_balance|transaction_categories|loan/i)
})
test('CLI config and driver are isolated from imports; timeout/read-only guards remain', async () => {
  const source = await readFile(new URL('./auditStatementIncomePrecision.mjs', import.meta.url), 'utf8')
  assert.match(source, /configuration\(options.env, \{\}, options.database\)/)
  assert.match(source, /default_transaction_read_only=on/)
  assert.match(source, /statement_timeout=30000/)
  assert.ok(source.indexOf('console.log(output)') < source.indexOf('await configuration('))
  assert.match(source, /if \(process.argv\[1\]/)
})
test('actual Statement validators preserve subcent inputs and coerce supported numeric strings', async () => {
  const { addStatement, updateStatement } = await import('../app/validation/Validators/statement.ts')
  for (const value of [12.345, -0.125, '1.005']) {
    const data = all(value)
    const added = await addStatement.validate({ startDate: '2026-01-01', endDate: '2026-01-31', startingBalance: 0, endingBalance: 0, data })
    const updated = await updateStatement.validate({ data })
    for (const f of FIELDS) {
      assert.equal(added.data[f], Number(value))
      assert.equal(updated.data[f], Number(value))
    }
  }
  assert.equal((await updateStatement.validate({})).data, undefined)
  await assert.rejects(updateStatement.validate({ data: {} }))
  assert.equal((await updateStatement.validate({ data: null })).data, undefined)
  await assert.rejects(updateStatement.validate({ data: all('bad') }))
})
