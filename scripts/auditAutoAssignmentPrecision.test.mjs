import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { URL } from 'node:url'
import { RULE_SQL, SCHEMA_SQL, DEFAULT_AMOUNTS, inspectRule, loadAllocator, compareAllocations, runAudit, argumentsFor } from './auditAutoAssignmentPrecision.mjs'

const allocator = await loadAllocator()
function row(amount = 12.75, percentage = true, extra = {}) {
  const bytes = Buffer.alloc(4); bytes.writeFloatBE(amount ?? 0)
  const pg = amount === null || !Number.isFinite(amount) ? null : amount.toFixed(2)
  return { id: 1, auto_assignment_id: 2, category_id: 3, budget_id: 4, percentage, amount,
    original_text: String(amount), original_real_hex: bytes.toString('hex'),
    expanded_binary_value: String(bytes.readFloatBE()), pg_rounded: pg, pg_target: pg,
    pg_difference: amount === null || pg === null ? null : String(Number(pg) - amount), ownership_valid: true, ...extra }
}

for (const [amount, percentage, mode] of [[10, true, 'percentage'], [10.5, true, 'percentage'],
  [10.25, true, 'percentage'], [12.75, false, 'fixed'], [0, null, 'null_flag_fixed'], [-1.25, false, 'fixed']]) {
  test(`classifies ${amount} / ${percentage} without changing evidence`, () => {
    const input = row(amount, percentage), saved = globalThis.structuredClone(input), finding = inspectRule(input)
    assert.equal(finding.mode, mode); assert.equal(finding.moreThanTwoDecimals, false)
    assert.equal(finding.negative, amount < 0); assert.equal(finding.zero, amount === 0)
    assert.deepEqual(finding.errors, []); assert.deepEqual(input, saved)
    assert.equal(finding.original_real_hex, input.original_real_hex)
  })
}
for (const [amount, pg, js, disagreement] of [[-0.125, '-0.13', '-0.12', true],
  [0.125, '0.13', '0.13', false], [1.005, '1.01', '1.00', true], [-1.005, '-1.01', '-1.00', true]]) {
  test(`keeps PostgreSQL projection separate from JavaScript hypothesis for ${amount}`, () => {
    const f = inspectRule(row(amount, false, { pg_target: pg, pg_rounded: pg, pg_difference: String(Number(pg) - amount) }))
    assert.equal(f.moreThanTwoDecimals, true); assert.equal(f.jsTarget, js)
    assert.equal(f.pgTarget, pg); assert.equal(f.policyDisagreement, disagreement)
    assert.equal(f.pgChangesValue, true)
  })
}
for (const amount of [null, NaN, Infinity, -Infinity, 1e20]) {
  test(`blocks invalid or out-of-range configuration: ${amount}`, async () => {
    const input = row(amount, false, { pg_target: null })
    assert.ok(inspectRule(input).errors.length)
    assert.equal((await compareAllocations([input], allocator)).status, 'not_compared')
  })
}
test('rejects unavailable ownership and binary evidence', () => {
  assert.ok(inspectRule(row(1, false, { ownership_valid: false })).errors.includes('ownership_unavailable'))
  assert.ok(inspectRule(row(1, false, { original_real_hex: '' })).errors.includes('missing_original_real_bits'))
})
test('actual allocation method applies fractional percentages and last-rule residual', async () => {
  const rules = [row(12.75), row(87.25, true, { id: 2, category_id: 5 })]
  const result = await allocator.execute(rules, 1)
  assert.deepEqual(result.allocations, [{ categoryId: 3, amount: 0.13 }, { categoryId: 5, amount: 0.87 }])
  assert.equal(result.finalResidualCents, 0); assert.equal(result.totalCents, 100)
  const residual = await allocator.execute([row(50), row(50, true, { id: 2, category_id: 5 })], 0.01)
  assert.deepEqual(residual.allocations, [{ categoryId: 3, amount: 0.01 }, { categoryId: 5, amount: 0 }])
  assert.equal(residual.finalResidualCents, -1); assert.equal(residual.conservesNominalCents, true)
})
test('actual method preserves duplicate categories, signed totals and accumulated balance effects', async () => {
  const result = await allocator.execute([row(50), row(50, true, { id: 2 })], -1)
  assert.equal(result.allocations.length, 2); assert.equal(result.totalCents, -100)
  assert.deepEqual(result.balanceEffects, [{ categoryId: 3, amount: -1 }])
  assert.equal(result.safeIntegerCents, true)
})
test('fixed plus percentage rules expose policy-specific changes and preserve inputs', async () => {
  const rules = [row(1.005, false, { pg_target: '1.01', pg_rounded: '1.01' }), row(100, true, { id: 2, category_id: 5 })]
  const saved = globalThis.structuredClone(rules)
  const result = await compareAllocations(rules, allocator, [100])
  assert.equal(result.cases[0].changed, true); assert.equal(result.cases[1].changed, false)
  assert.equal(result.cases[0].before.allocations[0].amount, 1)
  assert.equal(result.cases[0].after.allocations[0].amount, 1.01)
  assert.deepEqual(rules, saved)
})
test('percentage precision can change allocations without changing total cents', async () => {
  const result = await compareAllocations([row(12.345, true, { pg_target: '12.35' }), row(100, true, { id: 2, category_id: 5 })], allocator, [10000])
  assert.equal(result.equalModeOrderUnspecified, true)
  assert.equal(result.cases[0].changed, true)
  assert.equal(result.cases[0].before.totalCents, result.cases[0].after.totalCents)
})
test('explicit target is mandatory; CLI has no execute/recovery mode', () => {
  for (const args of [[], ['--execute'], ['--database', 'budget', '--recover'], ['budget'], ['--database', 'budget', '--amount', 'Infinity']]) assert.throws(() => argumentsFor(args))
  assert.equal(argumentsFor(['--database', 'budget', '--amount=-0.01']).amount[0], '-0.01')
  assert.equal(DEFAULT_AMOUNTS.includes(-100), true)
})
function fake(options = {}) {
  const calls = []
  const client = { async query(sql) {
    calls.push(sql)
    if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ mode: options.mode ?? 'on' }] }
    if (sql === SCHEMA_SQL) return { rows: [{ is_real: options.isReal ?? true, not_null: true }] }
    if (sql === RULE_SQL) return { rows: options.rows ?? [row()] }
    if (/^(BEGIN|ROLLBACK)/.test(sql)) return { rows: [] }
    throw Error('unexpected_query')
  } }
  return { client, calls, dependencies: { verify: async () => ({ database: { name: 'fixture' } }), reverify: async () => {
    if (options.changedIdentity) throw Error('identity_changed')
  } } }
}
test('read-only scan reconciles mode totals and uses actual allocator with rollback', async () => {
  const { client, calls, dependencies } = fake({ rows: [row(), row(1, false, { id: 2 }), row(0, null, { id: 3 })] })
  const findings = []
  const result = await runAudit(client, {}, f => findings.push(f), allocator, [1], dependencies)
  assert.equal(result.records, 3); assert.equal(result.counts.percentage.total, 1)
  assert.equal(result.counts.fixed.total, 1); assert.equal(result.counts.null_flag_fixed.total, 1)
  assert.equal(findings.length, 4); assert.equal(calls.at(-1), 'ROLLBACK')
  assert.ok(calls.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql)))
})
test('read-write mode, wrong schema, duplicate IDs and changed identity abort', async () => {
  for (const options of [{ mode: 'off' }, { isReal: false }, { changedIdentity: true }, { rows: [row(), row()] }]) {
    const { client, calls, dependencies } = fake(options)
    await assert.rejects(runAudit(client, {}, () => undefined, allocator, [1], dependencies))
    assert.equal(calls.at(-1), 'ROLLBACK')
  }
})
test('PostgreSQL projection preserves raw bits, mode flags, ownership and actual cast semantics', () => {
  assert.match(RULE_SQL, /float4send\(amount\)/)
  assert.match(RULE_SQL, /amount::numeric\(12,2\)/)
  assert.match(RULE_SQL, /9999999999\.99/)
  assert.match(RULE_SQL, /CASE WHEN percentage THEN 1 ELSE 0 END/)
  assert.doesNotMatch(RULE_SQL, /transaction_categories|plaid_logs/)
})
test('audit import and output conventions do not boot application or connect implicitly', async () => {
  const source = await readFile(new URL('./auditAutoAssignmentPrecision.mjs', import.meta.url), 'utf8')
  assert.ok(source.indexOf('console.log(output)') < source.indexOf('await configuration('))
  assert.match(source, /default_transaction_read_only=on/)
  assert.match(source, /configuration\(options.env, \{\}, options.database\)/)
  assert.doesNotMatch(source, /app\.boot|app\.start|pm2|execFile/)
})
