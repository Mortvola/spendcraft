import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { URL } from 'node:url'
import { FIELDS, PAGE_SQL, argumentsFor, inspectLeaf, inspectRow, newSummary, accumulate,
  loadFunding, compareImpact, runAudit } from './auditFundingPrecision.mjs'

const row = (data, extra = {}) => ({ id: 1, budget_id: 3, type: 2, deleted: false, payload_text: JSON.stringify(data), ...extra })
const fixed = amount => ({ categoryId: 99, amount, percentage: false })
const rate = amount => ({ categoryId: 99, amount, percentage: true })
const snapshot = (baseAmount, rules = [rate(100)]) => [{ categoryId: 10, amount: '1.00', baseAmount,
  fundingCategories: rules, includeFundingTransfers: false }]

for (const [input, expected] of [[0.125, '0.13'], [-0.125, '-0.12'], [1.005, '1.00'], [-1.005, '-1.00'],
  [0, '0.00'], [-0, '0.00'], [0.1 + 0.2, '0.30']]) {
  test('hypothetical policy preserves JavaScript rounding: ' + String(input), () => {
    assert.equal(inspectLeaf(input).proposedAmount, expected)
  })
}
test('missing, null, canonical strings and unsupported strings are distinct', () => {
  assert.deepEqual(inspectLeaf(undefined, false), { kind: 'missing', status: 'missing' })
  assert.deepEqual(inspectLeaf(null), { kind: 'null', status: 'null' })
  assert.equal(inspectLeaf('-1.25').canonicalString, true)
  for (const value of ['1', 'bad', '-0.00', {}, [], true]) assert.notEqual(inspectLeaf(value).status, 'valid')
})
test('unsafe and nonfinite inputs are not given rounding proposals', () => {
  for (const value of [Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    const entry = inspectLeaf(value)
    assert.equal(entry.status, 'malformed'); assert.equal(entry.proposedAmount, undefined)
  }
})
test('raw PostgreSQL leaf tokens detect digits lost during JSON parsing', async () => {
  const raw = '[{"categoryId":99,"amount":0.100000000000000001,"percentage":false}]'
  const inspected = inspectRow('category', row(null, { payload_text: raw, amount_tokens: '["0.100000000000000001"]' }))
  const entry = inspected.finding.entries[0]
  assert.equal(entry.originalToken, '0.100000000000000001')
  assert.equal(entry.fractionalCents, true); assert.equal(entry.sourceToNumberChanged, true)
  assert.equal(inspected.finding.rawJson, raw)
  assert.equal(compareImpact('category', row(null), inspected, await loadFunding()).reason, 'source_to_number_precision_loss')
  assert.throws(() => inspectRow('category', row([fixed(1)], { amount_tokens: '[]' })), /amount_token_count_mismatch/)
})
test('fixed and percentage values are proposed; duplicates and metadata remain exact', () => {
  const data = [fixed(1.005), rate(33.333), { ...fixed('2.00'), note: { amount: 0.123 } }, fixed(-0.125)]
  const original = JSON.stringify(data), result = inspectRow('category', row(data))
  assert.equal(result.finding.entries.length, 4)
  assert.equal(result.finding.percentageRules, 1)
  assert.deepEqual(result.proposed, [fixed(1), rate(33.33), data[2], fixed(-0.12)])
  assert.equal(result.finding.rawJson, original); assert.equal(JSON.stringify(data), original)
})
test('nested mixed snapshots preserve completed allocations and null/missing leaves', () => {
  const data = [...snapshot(1.005, [fixed(0.125), fixed('2.00'), rate(100)]),
    { categoryId: 20, amount: '0.00', baseAmount: null, fundingCategories: [fixed(null), { categoryId: 99, percentage: false }] },
    { categoryId: 30, amount: '0.00' }]
  const inspected = inspectRow('transaction', row(data)), summary = newSummary()
  accumulate(summary, inspected.finding)
  assert.equal(inspected.proposed[0].amount, '1.00')
  assert.equal(inspected.proposed[0].baseAmount, 1)
  assert.equal(inspected.proposed[0].fundingCategories[0].amount, 0.13)
  assert.equal(inspected.proposed[1].baseAmount, null)
  assert.equal(Object.hasOwn(inspected.proposed[2], 'baseAmount'), false)
  assert.equal(summary.fields[FIELDS[2]].mixedRecords, 1)
  assert.equal(summary.fields[FIELDS[2]].null, 1)
  assert.equal(summary.fields[FIELDS[2]].missing, 1)
  assert.equal(summary.fields[FIELDS[1]].hypotheticalChanges, 1)
})
test('percentage precision and candidates are counted separately in percentage points', () => {
  const data = [fixed(1.005), ...[10, 10.5, 10.25, 12.345, 0.125, -0.125, '2.00', null, 'bad', 1e20].map(rate),
    { categoryId: 99, percentage: true }]
  const inspected = inspectRow('category', row(data)), summary = newSummary()
  accumulate(summary, inspected.finding)
  const counts = summary.fields[FIELDS[0]]
  assert.equal(counts.numeric, 8)
  assert.equal(counts.conversionCandidates, 7)
  assert.equal(counts.modes.fixed.conversionCandidates, 1)
  assert.equal(counts.modes.percentage.conversionCandidates, 6)
  assert.equal(counts.modes.percentage.unit, 'percentage_points')
  assert.equal(counts.modes.percentage.exceedsTwoDecimalPlaces, 3)
  assert.equal(counts.modes.percentage.canonicalStrings, 1)
  assert.equal(counts.modes.percentage.mixedRecords, 1)
  assert.equal(counts.modes.percentage.null, 1)
  assert.equal(counts.modes.percentage.missing, 1)
  assert.equal(counts.modes.percentage.malformedOrUnsupported, 2)
  assert.equal(counts.modes.percentage.unsafe, 1)
  assert.deepEqual(inspected.proposed.slice(1, 7).map(r => r.amount), [10, 10.5, 10.25, 12.35, 0.13, -0.12])
  const changed = inspected.finding.entries.find(e => e.originalToken === '12.345')
  assert.equal(changed.proposedAmount, '12.35')
  assert.equal(changed.difference, 0.005)
  assert.equal(counts.modes.percentage.aggregateDifference, 0.015)
  assert.equal(counts.modes.percentage.maxAbsoluteDifference, 0.005)
  assert.equal(counts.modes.percentage.aggregateAbsoluteDifference, 0.015)
  assert.equal(inspected.finding.budgetId, 3)
  assert.equal(inspected.finding.id, 1)
})
test('percentage raw tokens survive parsing, including precision-loss evidence', async () => {
  const raw = '[{"categoryId":99,"amount":12.345000000000000001,"percentage":true}]'
  const inspected = inspectRow('category', row(null, { payload_text: raw, amount_tokens: '["12.345000000000000001"]' }))
  assert.equal(inspected.finding.rawJson, raw)
  assert.equal(inspected.finding.entries[0].originalToken, '12.345000000000000001')
  assert.equal(inspected.finding.entries[0].sourceToNumberChanged, true)
  assert.equal(compareImpact('category', row(null), inspected, await loadFunding()).reason, 'source_to_number_precision_loss')
})
test('percentage rounding uses actual allocation, residual and conservation calculations', async () => {
  const funding = await loadFunding()
  const rules = [{ ...rate(12.345), categoryId: 98 }, rate(87.655)]
  const data = snapshot(1000, rules), r = row(data)
  const inspected = inspectRow('transaction', r)
  const result = compareImpact('transaction', r, inspected, funding, 99)
  assert.equal(result.status, 'compared')
  assert.equal(result.centAllocationsChanged, true)
  assert.equal(result.before.result.find(r => r.funder && r.categoryId === 98).amount, -123.45)
  assert.equal(result.after.result.find(r => r.funder && r.categoryId === 98).amount, -123.5)
  assert.equal(result.before.invariant.accepted, true)
  assert.equal(result.after.invariant.accepted, true)
  assert.equal(result.before.totalCents, result.after.totalCents)
  assert.deepEqual(result.roundedInputs.map(e => e.mode), ['base', 'percentage', 'percentage'])
  assert.deepEqual(inspected.payload[0].fundingCategories, rules)
  const categoryRules = [{ ...rate(50.499), categoryId: 98 }, rate(49.501)]
  const categoryResult = compareImpact('category', row(categoryRules), inspectRow('category', row(categoryRules)), funding)
  assert.equal(categoryResult.status, 'compared')
  assert.ok(categoryResult.cases.some(c => c.changed))
  assert.deepEqual(categoryResult.cases.find(c => c.nominal === 1).before.result, [[98, 50], [99, 50]])
  assert.deepEqual(categoryResult.cases.find(c => c.nominal === 1).after.result, [[98, 51], [99, 49]])
})
test('legacy and ambiguous modes retain precision evidence without candidate admission', async () => {
  const r = row([{ categoryId: 99, amount: 1.005 }, { ...rate(12.345), percentage: null },
    { ...rate(12.345), percentage: 'true' }])
  const inspected = inspectRow('category', r), summary = newSummary()
  accumulate(summary, inspected.finding)
  assert.equal(summary.fields[FIELDS[0]].conversionCandidates, 0)
  assert.equal(summary.fields[FIELDS[0]].modes.legacy.numeric, 2)
  assert.equal(summary.fields[FIELDS[0]].modes.ambiguous.numeric, 1)
  assert.deepEqual(inspected.proposed, inspected.payload)
  assert.equal(compareImpact('category', r, inspected, await loadFunding()).status, 'not_compared')
})
test('legacy falsey modes are identified while unknown modes are not silently treated as fixed', () => {
  const inspected = inspectRow('category', row([{ categoryId: 99, amount: 1 }, { ...fixed(2), percentage: null },
    { ...fixed(3), percentage: 'false' }]))
  assert.equal(inspected.finding.legacyFixedModes, 2)
  assert.equal(inspected.finding.entries.length, 3)
  assert.deepEqual(inspected.finding.entries.map(e => e.mode), ['legacy', 'legacy', 'ambiguous'])
  assert.equal(inspected.finding.issues.length, 1)
})
test('SQL null, JSON null, empty, malformed arrays and non-object entries remain evidence', () => {
  for (const source of ['category', 'transaction']) {
    for (const value of [null, [], {}, [null]]) assert.ok(inspectRow(source, row(value)).finding)
    const sqlNull = inspectRow(source, row(null, { payload_text: null }))
    assert.equal(sqlNull.finding.containers[0].shape, 'sql_null')
    assert.equal(inspectRow(source, row(null, { payload_text: '{bad' })).finding.issues[0], 'invalid_or_missing_json')
  }
})
test('actual production spread retains fixed ordering, duplicate accumulation and residual behavior', async () => {
  const funding = await loadFunding()
  assert.deepEqual(funding.execute('spread', 1, [fixed(1), { categoryId: 98, amount: 1, percentage: false }]).result, [[98, 100]])
  assert.deepEqual(funding.execute('spread', 0.01, [rate(50), rate(50)]).result, [[99, 1]])
  const source = await readFile(new URL('../client-src/Funding/calculateFunding.ts', import.meta.url))
  assert.equal(funding.sourceSha256, createHash('sha256').update(source).digest('hex'))
})
test('actual funding identifies changed requested bases even when posted cents are unchanged', async () => {
  const funding = await loadFunding(), data = snapshot(0.1 + 0.2)
  const result = compareImpact('transaction', row(data), inspectRow('transaction', row(data)), funding, 99)
  assert.equal(result.status, 'compared'); assert.equal(result.changed, true)
  assert.equal(result.postedAmountsChanged, true) // raw request amount preserves the binary artifact
  assert.equal(result.centAllocationsChanged, false)
  assert.equal(result.before.totalCents, result.after.totalCents)
  assert.equal(result.before.invariant.accepted, true)
})
test('the existing posting validator reports fixed-only underfunding without adding a new rule', async () => {
  const funding = await loadFunding(), data = snapshot(2, [fixed(1)])
  const result = compareImpact('transaction', row(data), inspectRow('transaction', row(data)), funding, 99)
  assert.equal(result.before.invariant.accepted, false)
  assert.equal(result.after.invariant.accepted, false)
})
test('incomplete/duplicate snapshots, other lifecycles and missing pools are explicitly unsupported', async () => {
  const funding = await loadFunding()
  for (const data of [[{ categoryId: 10, amount: '1.00' }], [...snapshot(1), ...snapshot(1)]]) {
    assert.equal(compareImpact('transaction', row(data), inspectRow('transaction', row(data)), funding, 99).status, 'not_compared')
  }
  const r = row(snapshot(1))
  assert.equal(compareImpact('transaction', r, inspectRow('transaction', r), funding).reason, 'unique_budget_funding_pool_unavailable')
  assert.equal(compareImpact('transaction', { ...r, type: 3 }, inspectRow('transaction', r), funding, 99).reason, 'not_type_2_funding_snapshot')
})
test('CLI requires an explicit database and refuses conversion flags; SQL excludes scoped legacy rows', () => {
  assert.throws(() => argumentsFor([]), /explicit_database_required/)
  assert.throws(() => argumentsFor(['--database', 'budget', '--execute']))
  assert.equal(argumentsFor(['--print-sql'])['print-sql'], true)
  assert.match(PAGE_SQL.transaction, /NOT EXISTS/)
  assert.doesNotMatch(Object.values(PAGE_SQL).join('\n'), /plaid_logs|transaction_categories|loan_transactions|UPDATE|DELETE|INSERT|ALTER/)
})
test('read-only paging reconciles details/counts, rechecks identity and rolls back', async () => {
  const queries = [], evidence = [], verified = []
  const client = { async query(sql, args) {
    queries.push(sql)
    if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] }
    if (args?.[0] === 0 && sql === PAGE_SQL.category) return { rows: [row([], { id: 99, type: 'FUNDING POOL' })] }
    if (args?.[0] === 0 && sql === PAGE_SQL.transaction) return { rows: [row(snapshot(1.005))] }
    return { rows: [] }
  } }
  const result = await runAudit(client, {}, async f => evidence.push(f), await loadFunding(), {
    verify: async () => { verified.push('initial'); return { database: { name: 'fixture' } } },
    reverify: async () => verified.push('final'),
  })
  assert.equal(result.categoriesExamined, 1); assert.equal(result.transactionsExamined, 1)
  assert.equal(result.fields[FIELDS[1]].numeric, 1); assert.equal(evidence.length, 2)
  assert.deepEqual(verified, ['initial', 'final']); assert.equal(queries.at(-1), 'ROLLBACK')
  assert.match(queries[0], /READ ONLY/)
})
test('write-enabled transactions fail without mutation', async () => {
  const queries = []
  const client = { async query(sql) { queries.push(sql); return { rows: [{ transaction_read_only: 'off' }] } } }
  await assert.rejects(() => runAudit(client, {}, async () => undefined, {}), /read_only_required/)
  assert.equal(queries.at(-1), 'ROLLBACK')
})
test('invalid pagination stops the audit and rolls back', async () => {
  const queries = []
  const client = { async query(sql) {
    queries.push(sql)
    if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] }
    if (sql === PAGE_SQL.category) return { rows: [row([], { id: 0 })] }
    return { rows: [] }
  } }
  await assert.rejects(() => runAudit(client, {}, async () => undefined, {}, {
    verify: async () => ({ database: {} }),
  }), /invalid_page_progress/)
  assert.equal(queries.at(-1), 'ROLLBACK')
})
