import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalConstraints, assertConstraints, validateProfile, constraintAssertionSQL,
  replaceConstraintAssertion } from './prepareStagingRestoreVerification.mjs'

const profile = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreConstraintInventory.json', import.meta.url), 'utf8'))
const clone = value => JSON.parse(JSON.stringify(value))
const oldAssertion = "SELECT * FROM (SELECT array_agg(name::text ORDER BY name)=ARRAY['old']::text[] FROM (SELECT conname AS name FROM pg_constraint WHERE connamespace='public'::regnamespace) inventory) AS assertion(accepted) \\gset\n\\if :accepted\n\\else\nSELECT 1/0 AS constraint_inventory_mismatch;\n\\endif"

test('independent pre-restore catalog is reconciled with actual migration source and dump declarations', async () => {
  const rows = await validateProfile(profile)
  assert.deepEqual(rows.reduce((counts, row) => {
    counts[row.type] = (counts[row.type] ?? 0) + 1
    return counts
  }, {}), { c: 5, f: 17, p: 27, u: 2 })
  assert.deepEqual(rows.filter(row => row.type !== 'c').map(row => row.name).sort(),
    [...profile.dumpAddConstraintNames].sort())
  assert.equal(profile.provenance.kind, 'pre-restore source catalog, not failed-restore count')
})

test('all five CHECK identities have independent source references and monetary-free definitions', () => {
  const checks = canonicalConstraints(profile.constraints).filter(row => row.type === 'c')
  assert.deepEqual(checks.map(row => [row.table, row.name]).sort(), [
    ['account_transactions', 'account_transactions_provider_check'],
    ['categories', 'categories_recurrence_range_check'],
    ['plaid_item_cleanups', 'plaid_item_cleanups_attempt_count_check'],
    ['plaid_item_cleanups', 'plaid_item_cleanups_check'],
    ['plaid_item_cleanups', 'plaid_item_cleanups_status_check'],
  ].sort())
  assert.equal(profile.sourceChecks.length, checks.length)
})

test('ordering is immaterial and comparison never mutates the input', () => {
  const before = clone(profile.constraints)
  assertConstraints(profile.constraints, [...profile.constraints].reverse())
  assert.deepEqual(profile.constraints, before)
})

test('the original ADD-only inventory is rejected', () => {
  assert.throws(() => assertConstraints(profile.constraints, profile.constraints.filter(row => row.type !== 'c')),
    /constraint_inventory_mismatch/)
})

for (const field of ['schema', 'table', 'name', 'definition', 'validated']) {
  test(`a changed constraint ${field} fails even when the total count is unchanged`, () => {
    const actual = clone(profile.constraints)
    const row = actual.find(item => item.name === 'categories_recurrence_range_check')
    if (field === 'validated') row.validated = false
    else if (field === 'definition') row.definition = 'CHECK ((recurrence >= 0))'
    else row[field] += '_changed'
    assert.throws(() => assertConstraints(profile.constraints, actual), /constraint_inventory_mismatch/)
  })
}

test('unexpected constraints and duplicate identities fail closed', () => {
  const additional = { ...profile.constraints[0], name: 'unexpected_check' }
  assert.throws(() => assertConstraints(profile.constraints, [...profile.constraints, additional]), /mismatch/)
  assert.throws(() => canonicalConstraints([...profile.constraints, profile.constraints[0]]), /duplicate/)
})

test('same-named constraints on different relations are distinct', () => {
  const first = { ...profile.constraints[0], name: 'shared_name' }
  assert.equal(canonicalConstraints([first, { ...first, table: 'another_table' }]).length, 2)
})

test('unknown types, wrong classification and malformed identities are rejected', () => {
  const row = profile.constraints[0]
  for (const changes of [{ type: 'x' }, { type: 'c' }, { name: "bad';DROP" }, { validated: null }]) {
    assert.throws(() => canonicalConstraints([{ ...row, ...changes }]), /invalid/)
  }
})

test('source drift and absent/duplicate source references are rejected', async () => {
  await assert.rejects(validateProfile(profile, async () => 'unreviewed source'), /source_evidence_changed/)
  const missing = clone(profile)
  missing.sourceChecks.pop()
  await assert.rejects(validateProfile(missing), /source_check_inventory_mismatch/)
  const duplicate = clone(profile)
  duplicate.sourceChecks.push(duplicate.sourceChecks[0])
  await assert.rejects(validateProfile(duplicate), /duplicate_source_check/)
})

test('dump reconciliation fails instead of trusting the final total', async () => {
  const changed = clone(profile)
  changed.dumpAddConstraintNames[0] = 'incorrect_pkey'
  await assert.rejects(validateProfile(changed), /dump_constraint_inventory_mismatch/)
})

test('wrong database or OID cannot silently change the planned target', async () => {
  for (const change of [{ database: 'spendcraft' }, { oid: 17261 }]) {
    const changed = clone(profile)
    Object.assign(changed.target, change)
    await assert.rejects(validateProfile(changed), /wrong_restore_target/)
  }
})

test('SQL compares relation/name/type/definition/validation with bidirectional exact sets', () => {
  const sql = constraintAssertionSQL(profile.constraints)
  for (const fragment of ['t.relname::text', 'c.contype::text', 'pg_get_constraintdef(c.oid, false)',
    'c.convalidated', 'LEFT JOIN pg_class', 'expected EXCEPT ALL SELECT * FROM actual',
    'actual EXCEPT ALL SELECT * FROM expected', "''NONE''", 'constraint_inventory_mismatch']) {
    assert.ok(sql.includes(fragment), fragment)
  }
  assert.equal((sql.match(/EXCEPT ALL/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s/i)
})

test('replacement changes only the failed assertion and preserves other acceptance checks', () => {
  const prefix = '\\set ON_ERROR_STOP on\n-- existing target and read-only guards\n'
  const suffix = '\n-- unchanged sequence, extension, report and index assertions\n'
  const sql = replaceConstraintAssertion(prefix + oldAssertion + suffix, profile.constraints)
  assert.ok(sql.startsWith(prefix) && sql.endsWith(suffix))
  assert.equal((sql.match(/constraint_inventory_mismatch/g) ?? []).length, 1)
  assert.throws(() => replaceConstraintAssertion('missing', profile.constraints), /ambiguous/)
  assert.throws(() => replaceConstraintAssertion(oldAssertion + '\n' + oldAssertion, profile.constraints), /ambiguous/)
})

test('CLI refuses missing/unknown execution options without connecting or preparing output', () => {
  const script = resolve('scripts/prepareStagingRestoreVerification.mjs')
  for (const args of [[], ['--execute'], ['--cleanup']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
  }
})

test('offline CLI produces unique corrected outputs and preserves the original input', async () => {
  const root = await mkdtemp(join(resolve('script-output'), 'restore-inventory-test-'))
  console.log(root)
  try {
    const base = join(root, 'original.sql')
    await writeFile(base, oldAssertion)
    const run = () => spawnSync(process.execPath, [resolve('scripts/prepareStagingRestoreVerification.mjs'),
      '--base-sql', base, '--output-parent', root], { encoding: 'utf8' })
    const first = run(), second = run()
    assert.equal(first.status, 0, first.stderr)
    assert.equal(second.status, 0, second.stderr)
    assert.notEqual(first.stdout.trim(), second.stdout.trim())
    assert.equal(await readFile(base, 'utf8'), oldAssertion)
    const receipt = JSON.parse(await readFile(join(first.stdout.trim(), 'constraint-inventory.json'), 'utf8'))
    assert.equal(receipt.databaseConnected, false)
    assert.equal(receipt.target.oid, 17260)
    assert.deepEqual(receipt.classifications, { f: 17, p: 27, c: 5, u: 2 })
  } finally { await rm(root, { recursive: true }) }
})

const castPairs = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreCastEquivalences.json', import.meta.url), 'utf8'))
for (const pair of castPairs) {
  const expected = { ...pair, definition: pair.original }
  const restored = { ...pair, definition: pair.restored }
  test(`${pair.name}: both verified cast forms compare equal without mutation`, () => {
    const before = clone(restored)
    assertConstraints([expected], [restored])
    assertConstraints([restored], [expected])
    assert.deepEqual(restored, before)
  })
  for (const [label, change] of [
    ['operator', row => { row.definition = row.definition.replace(pair.name.endsWith('status_check') ? '= ANY' : '<> ALL', '= ALL') }],
    ['constant', row => { row.definition = row.definition.replace('cancelled', 'unknown') }],
    ['column', row => { row.definition = row.definition.replace('(status)', '(provider_context)') }],
    ['cast type', row => { row.definition = row.definition.replaceAll('character varying', 'character') }],
    ['schema', row => { row.schema = 'other' }],
    ['table', row => { row.table = 'other' }],
    ['name', row => { row.name += '_other' }],
    ['validation', row => { row.validated = false }],
    ['extra predicate', row => { row.definition += ' AND false' }],
  ]) {
    test(`${pair.name}: altered ${label} is rejected`, () => {
      const changed = clone(restored)
      change(changed)
      assert.throws(() => assertConstraints([expected], [changed]), /mismatch/)
    })
  }
}

test('cast equivalences are pinned to independently source-checked full expressions', async () => {
  const rows = await validateProfile(profile)
  for (const pair of castPairs) {
    assert.equal(rows.find(row => row.name === pair.name).definition, pair.original)
    const literals = definition => [...definition.matchAll(/'([^']+)'::character varying/g)].map(match => match[1])
    assert.deepEqual(literals(pair.original), literals(pair.restored))
  }
  const sql = constraintAssertionSQL(rows)
  assert.match(sql, /format_type\(a.atttypid, a.atttypmod\) = 'character varying\(255\)'/)
  assert.match(sql, /constraint_column_type_mismatch/)
  assert.match(sql, /ELSE pg_get_constraintdef\(c.oid, false\) END/)
  assert.equal((sql.match(/THEN 'CHECK/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /regexp_replace|replace\(/i)
})
