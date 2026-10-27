import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { argumentsFor, classify, leafExpression, verifyRelease, runConversion, runRecovery,
  SCAN_SQL, SCHEMA_SQL, LOCK_SQL } from './convertHistoricalFunding.mjs'
import { loadFunding } from './auditFundingPrecision.mjs'

const hash = (value, algorithm = 'md5') => createHash(algorithm).update(value).digest('hex')
const fixed = amount => ({ categoryId: 99, amount, percentage: false })
const rate = amount => ({ categoryId: 99, amount, percentage: true })
const split = (baseAmount, rules = [rate(100)]) => ({ categoryId: 10, amount: '1.00', baseAmount, fundingCategories: rules })
function row(source, data, extra = {}) {
  const token = value => JSON.stringify(value) ?? null
  const tokens = data === null ? [] : source === 'category' ? data.map(r => token(r?.amount))
    : data.map(r => ({ baseAmount: token(r?.baseAmount),
      fundingCategories: Array.isArray(r?.fundingCategories) ? r.fundingCategories.map(f => token(f?.amount)) : [] }))
  return { id: source === 'category' ? 1 : 2, budget_id: source === 'category' ? 2 : 3,
    type: source === 'category' ? 'BUDGET' : 2, deleted: source === 'transaction',
    payload_text: JSON.stringify(data), amount_tokens: JSON.stringify(tokens),
    ownership_valid: true, active: true, loan_excluded: false, ...extra }
}
function fixture() {
  const target = { database: { host: 'localhost', port: 5432, name: 'offline', user: 'ubuntu',
    server: '127.0.0.1', peer: '127.0.0.1', oid: '123', systemIdentifier: '456' } }
  const config = { host: 'localhost', port: 5432, database: 'offline', user: 'ubuntu' }
  const original = {
    category: '[{"categoryId":99,"amount":12.345,"percentage":false,"note":9007199254740993},{"categoryId":99,"amount":"100.00","percentage":true}]',
    transaction: '[{"categoryId":10,"amount":"1.00","baseAmount":-0.125,"fundingCategories":[{"categoryId":99,"amount":100,"percentage":true}],"note":9007199254740993}]',
  }
  const converted = {
    category: original.category.replace('12.345', '"12.35"'),
    transaction: original.transaction.replace('-0.125', '"-0.12"').replace('"amount":100', '"amount":"100.00"'),
  }
  let state = Object.fromEntries(Object.entries(original).map(([source, payload]) => [source, { payload, hash: hash(payload), version: '100' }])), saved
  const calls = [], metadata = hash('unchanged non-payload columns')
  const client = { readOnly: false, connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.startsWith('BEGIN')) { saved = globalThis.structuredClone(state); return { rows: [] } }
      if (sql === 'ROLLBACK') { state = saved; return { rows: [] } }
      if (sql === 'COMMIT') { if (client.uncertainCommit) throw Error('connection_lost'); return { rows: [] } }
      if (sql === SCHEMA_SQL) return { rows: ['categories', 'transactions'].map(name => ({ name, correct_type: !client.wrongType,
        ordinary: true, rls: !!client.rls, rules: false, triggers: !!client.triggers })) }
      if (sql === LOCK_SQL || sql.startsWith('SELECT id FROM public.applications')) return { rows: [{ id: 2 }, { id: 3 }] }
      if (sql.includes('current_database()')) return { rows: [{ database: 'offline', username: 'ubuntu', server: '127.0.0.1/32',
        peer: '127.0.0.1/32', port: 5432, oid: '123', system_identifier: '456' }] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: client.readOnly ? 'on' : 'off', isolation: 'repeatable read' }] }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ xid: '123' }] }
      for (const source of ['category', 'transaction']) if (sql === SCAN_SQL[source]) {
        if (parameters[0] !== '0') return { rows: [] }
        return { rows: [{ ...row(source, JSON.parse(state[source].payload)), payload_text: state[source].payload,
          row_hash: state[source].hash, row_version: state[source].version, metadata_hash: metadata,
          ...(client.badOwnership ? { ownership_valid: false } : {}) }] }
      }
      const source = sql.includes('public.categories r') ? 'category' : sql.includes('public.transactions r') ? 'transaction' : undefined
      if (source && sql.startsWith('SELECT (')) return { rows: [{ payload: converted[source], row_hash: hash(converted[source]) }] }
      if (source && sql.startsWith('UPDATE')) {
        if (client.rejectWrite === source) throw Error('injected_write_failure')
        if (parameters.at(-2) !== state[source].version || parameters.at(-1) !== state[source].hash) return { rows: [] }
        const recovery = /SET (funding_categories|categories)=\$1::/.test(sql)
        const payload = recovery ? original[source] : converted[source]
        state[source] = { payload, hash: hash(payload), version: recovery ? '789' : '123' }
        return { rows: [{ id: source === 'category' ? 1 : 2, ...state[source], row_hash: state[source].hash,
          metadata_hash: client.changedMetadata ? hash('changed') : metadata }] }
      }
      if (source && sql.startsWith('SELECT r.')) return { rows: client.moved === source ? [] : [{ ...state[source], row_hash: state[source].hash }] }
      throw Error('unexpected_mock_query')
    },
  }
  return { target, config, client, calls, original, converted, state: () => globalThis.structuredClone(state),
    edit(source, sameValue = false) { state[source] = { ...state[source], version: '500', ...(sameValue ? {} : { hash: hash('later edit') }) } },
  }
}
async function withFixture(work) {
  const output = await mkdtemp(join(tmpdir(), 'funding-conversion-test-')), f = fixture()
  let guards = 0
  const context = { output, config: f.config, target: f.target, readOnly: false, guard: async () => { guards++ } }
  try { await work({ ...f, context, guards: () => guards }) } finally { await rm(output, { recursive: true, force: true }) }
}

for (const value of [12.34, 12.345, -12.345, 0.125, -0.125, 1.005, -1.005, 0.1 + 0.2, 0, -0, -0.005]) {
  test('all three paths and modes follow approved JS rounding: ' + String(value), () => {
    const expected = (Math.round(value * 100) / 100).toFixed(2)
    for (const source of ['category', 'transaction']) {
      const data = source === 'category' ? [fixed(value), rate(value)] : [split(value, [fixed(value), rate(value)])]
      const result = classify(source, row(source, data))
      assert.deepEqual(result.errors, [])
      assert.equal(result.patches.length, source === 'category' ? 2 : 3)
      for (const patch of result.patches) assert.equal(patch.stored, expected)
      assert.ok(result.changes.some(change => change.unit === 'percentage_points'))
      assert.ok(result.changes.some(change => change.unit === 'dollars'))
    }
  })
}
test('mixed storage, missing/nulls, flags, unrelated values and deleted status are never mutated', () => {
  const data = [split(1.005, [fixed('2.00'), rate(100), fixed(null), { categoryId: 99, percentage: false }]),
    { categoryId: 20, amount: '0.00', baseAmount: null, fundingCategories: null }, { categoryId: 30, note: [3,2,1] }]
  const input = row('transaction', data), before = globalThis.structuredClone(input)
  const result = classify('transaction', input)
  assert.deepEqual(result.errors, []); assert.equal(result.mixed, 1)
  assert.equal(result.nullFields, 2); assert.ok(result.missingFields > 0)
  assert.equal(result.canonicalStrings, 1); assert.equal(result.numericAmounts, 2)
  assert.deepEqual(input, before); assert.equal(input.deleted, true)
  for (const source of ['category', 'transaction']) {
    assert.equal(classify(source, row(source, null)).jsonNullData, 1)
    assert.equal(classify(source, row(source, null, { payload_text: null })).sqlNullData, 1)
    assert.deepEqual(classify(source, row(source, [])).patches, [])
  }
})
for (const value of [true, {}, [], 'bad', '1', '1.001', '01.00', '-0.00', ' 1.00', '1e2', Number.MAX_SAFE_INTEGER, '9007199254740992.00']) {
  test('malformed or unsafe amount blocks: ' + JSON.stringify(value), () => {
    for (const source of ['category', 'transaction']) {
      const result = classify(source, row(source, source === 'category' ? [fixed(value)] : [split(value)]))
      assert.ok(result.errors.length); assert.ok(result.malformedAmounts)
    }
  })
}
test('raw exact leaf precision loss, overflow, malformed containers and absent tokens fail closed', () => {
  for (const token of ['0.100000000000000001', '1e400']) {
    const input = row('category', [fixed(0)], {
      payload_text: '[{"categoryId":99,"amount":'+token+',"percentage":false}]', amount_tokens: JSON.stringify([token]) })
    assert.ok(classify('category', input).errors.length)
  }
  for (const payload_text of ['{}', 'false', '"bad"', '[null]', '[{"fundingCategories":{}}]'])
    assert.ok(classify('transaction', row('transaction', [], { payload_text })).errors.length)
  assert.ok(classify('category', row('category', [fixed(1)], { amount_tokens: undefined })).errors.length)
})
for (const percentage of [undefined, null, 'false', 0, 1]) {
  test('legacy/ambiguous mode is reported and blocks: ' + String(percentage), () => {
    const result = classify('category', row('category', [{ categoryId: 99, amount: 1, percentage }]))
    assert.equal(result.legacyModes, 1); assert.ok(result.errors.some(e => e.reason === 'mode_requires_review'))
  })
}
test('Loan/deprecated exclusions precede payload decoding; unknown types and unresolved active ownership block', () => {
  for (const source of ['category', 'transaction']) {
    const result = classify(source, { loan_excluded: true, payload_text: 'invalid' })
    assert.equal(result.excludedRecords, 1); assert.deepEqual(result.errors, []); assert.deepEqual(result.patches, [])
  }
  assert.equal(classify('transaction', { type: 1 }).exclusion, 'deprecated_lifecycle')
  for (const extra of [{ ownership_valid: false }, { active: false }, { budget_id: null }, { type: 99 }])
    assert.ok(classify('transaction', row('transaction', [split(1)], extra)).errors.length)
})
test('SQL patches are restricted to three paths, retain siblings, and never update balances or dates', () => {
  for (const source of ['category', 'transaction']) {
    const result = classify(source, row(source, source === 'category' ? [fixed(1)] : [split(1, [rate(100)])]))
    const sql = leafExpression(source, result.patches)
    assert.match(sql.expression, /jsonb_set/); assert.match(sql.expression, /, false\)/)
    assert.ok(sql.parameters.every((p, i) => i % 2 === 0 ? Array.isArray(p) : typeof p === 'string'))
    for (const path of [['balance'], [0,'amount','other'], [-1,'amount'], ['__proto__','amount'], [0,'note']])
      assert.throws(() => leafExpression(source, [{ path, stored: '1.00' }]))
    assert.throws(() => leafExpression(source, [result.patches[0],result.patches[0]]))
    assert.throws(() => leafExpression(source, [{ ...result.patches[0], stored: '1.001' }]))
  }
  assert.throws(() => leafExpression('plaid_logs', []))
  assert.match(SCAN_SQL.transaction, /c.type='loan'/)
  assert.match(SCAN_SQL.transaction, /c.type='LOAN'/)
  assert.match(SCAN_SQL.transaction, /i.application_id=r.application_id/)
  assert.match(SCAN_SQL.transaction, /IS DISTINCT FROM r.application_id/)
  assert.doesNotMatch(SCAN_SQL.transaction, /deleted\s*=/)
})
test('explicit target, default read-only, compiled release requirement and pinned separate recovery CLI', () => {
  assert.throws(() => argumentsFor([]), /explicit_database_required/)
  assert.equal(argumentsFor(['--database','offline']).execute, undefined)
  assert.throws(() => argumentsFor(['--database','offline','--execute']), /compatible_release_required/)
  assert.equal(argumentsFor(['--database','offline','--execute','--release','/reviewed']).release, '/reviewed')
  for (const args of [['--execute','--dry-run'], ['--recover'], ['--snapshot','x'], ['--force'], ['--release'], ['--release','a','--release','b']])
    assert.throws(() => argumentsFor(['--database','offline',...args]))
})
test('unknown compiled capability refuses before database access', async () => {
  const output = await realpath(await mkdtemp(join(tmpdir(), 'funding-release-test-')))
  try {
    const profile = JSON.parse(await readFile('installer/tax-storage-profile.json','utf8'))
    for (const name of Object.keys(profile.fundingFiles)) {
      await mkdir(dirname(join(output,name)), { recursive: true })
      await writeFile(join(output,name), 'unreviewed compiled code')
    }
    await assert.rejects(verifyRelease(output), /funding_storage_compatibility_unknown/)
  } finally { await rm(output,{ recursive:true,force:true }) }
})
test('dry-run lists complete candidate details/raw tokens without writes, locks or snapshots', async () => withFixture(async f => {
  f.client.readOnly = true; f.context.readOnly = true
  const result = await runConversion(f.client,f.context)
  assert.equal(result.candidates,2); assert.equal(result.numericAmounts,3); assert.equal(result.canonicalStrings,1)
  assert.equal(result.categoryCandidates,1); assert.equal(result.transactionCandidates,1)
  assert.equal(result.dollarRoundingChanges,2); assert.equal(result.percentageRoundingChanges,0)
  assert.equal(f.guards(),0)
  assert.ok(!f.calls.some(c => c.sql.startsWith('UPDATE') || c.sql.includes('FOR UPDATE') || c.sql.includes('pg_current_xact_id')))
  const details = (await readFile(join(f.context.output,'records.jsonl'),'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(details.map(r => [r.source,r.id,r.budget]), [['category',1,2],['transaction',2,3]])
  assert.equal(details[0].original,f.original.category)
  assert.equal(details[0].changes[0].originalToken,'12.345')
  assert.equal(details[1].deleted,true)
  await assert.rejects(readFile(join(f.context.output,'snapshot.json')))
}))
test('both boundaries convert atomically, preserve originals and unrelated large tokens, and are idempotent', async () => withFixture(async f => {
  const result = await runConversion(f.client,f.context)
  assert.equal(result.candidates,2)
  const path = join(f.context.output,'original-funding.jsonl'), originalSnapshot = await readFile(path,'utf8')
  const entries = originalSnapshot.trim().split('\n').map(JSON.parse)
  for (const entry of entries) {
    assert.equal(entry.original,f.original[entry.source]); assert.equal(entry.converted,f.converted[entry.source])
    assert.match(entry.converted,/9007199254740993/)
  }
  assert.ok(f.calls.findIndex(c => c.sql===LOCK_SQL) < f.calls.findIndex(c => c.sql===SCAN_SQL.category))
  for (const call of f.calls.filter(c => c.sql.startsWith('UPDATE'))) {
    assert.match(call.sql,/r.xmin::text=/); assert.doesNotMatch(call.sql,/SET (updated_at|balance|amount)=/)
  }
  const second = await mkdtemp(join(tmpdir(),'funding-second-test-'))
  try {
    const updates = f.calls.filter(c => c.sql.startsWith('UPDATE')).length
    const next = await runConversion(f.client,{ ...f.context,output:second })
    assert.equal(next.candidates,0); assert.equal(next.numericAmounts,0)
    assert.equal(f.calls.filter(c => c.sql.startsWith('UPDATE')).length,updates)
    assert.equal(await readFile(path,'utf8'),originalSnapshot)
  } finally { await rm(second,{recursive:true,force:true}) }
}))
test('pinned recovery dry-run and execution restore original JSONB text and hashes exactly', async () => withFixture(async f => {
  await runConversion(f.client,f.context)
  const path = join(f.context.output,'snapshot.json')
  f.client.readOnly=true
  const dry = await runRecovery(f.client,{...f.context,readOnly:true},path,f.context.snapshotHash)
  assert.equal(dry.restored,0); assert.equal(f.state().transaction.payload,f.converted.transaction)
  f.client.readOnly=false
  const result=await runRecovery(f.client,f.context,path,f.context.snapshotHash)
  assert.equal(result.restored,2)
  for(const source of ['category','transaction']){
    assert.equal(f.state()[source].payload,f.original[source]); assert.equal(f.state()[source].hash,hash(f.original[source]))
  }
}))
for(const [source,sameValue] of [['category',false],['transaction',false],['category',true],['transaction',true],['transaction','moved']]){
  test('subsequent edits/ownership changes refuse atomic recovery: '+source+':'+sameValue, async () => withFixture(async f => {
    await runConversion(f.client,f.context)
    if(sameValue==='moved') f.client.moved=source; else f.edit(source,sameValue)
    const before=f.state()
    await assert.rejects(runRecovery(f.client,f.context,join(f.context.output,'snapshot.json'),f.context.snapshotHash),/changed_row_recovery_refused/)
    assert.deepEqual(f.state(),before); assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  }))
}
for(const failure of ['wrongType','rls','triggers','identity','badOwnership','writers']){
  test('schema/identity/ownership/writer admission fails before updates: '+failure,async () => withFixture(async f => {
    if(failure==='identity') f.context.config={...f.config,database:'other'}
    else if(failure==='writers') f.context.guard=async()=>{throw Error('writers_running')}
    else f.client[failure]=true
    await assert.rejects(runConversion(f.client,f.context))
    assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE'))); assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  }))
}
for(const failure of ['transaction','metadata','writers']){
  test('late failure rolls back both tables: '+failure, async () => withFixture(async f => {
    if(failure==='transaction') f.client.rejectWrite='transaction'
    if(failure==='metadata') f.client.changedMetadata=true
    if(failure==='writers'){let calls=0;f.context.guard=async()=>{if(++calls===3)throw Error('writer_restarted')}}
    const before=f.state();await assert.rejects(runConversion(f.client,f.context))
    assert.deepEqual(f.state(),before)
  }))
}
for(const failure of ['data','manifest','target']){
  test('damaged snapshots and wrong target reject before recovery SQL: '+failure,async () => withFixture(async f => {
    await runConversion(f.client,f.context)
    const path=join(f.context.output,'snapshot.json')
    if(failure==='data')await writeFile(join(f.context.output,'original-funding.jsonl'),'{}\n')
    if(failure==='manifest')await writeFile(path,'{}\n')
    if(failure==='target')f.context.target={database:{...f.target.database,name:'other'}}
    const calls=f.calls.length
    await assert.rejects(runRecovery(f.client,f.context,path,f.context.snapshotHash));assert.equal(f.calls.length,calls)
  }))
}
test('uncertain commit is reported without retry or automatic recovery',async()=>withFixture(async f=>{
  f.client.uncertainCommit=true
  await assert.rejects(runConversion(f.client,f.context),/commit_outcome_unknown_inspect_snapshot_before_retry/)
  assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1)
}))
test('actual funding/reconstruction and conservation retain posted cents for representation-only conversions',async()=>{
  const funding=await loadFunding(),data=[split(12.34,[rate(100)])]
  const result=classify('transaction',row('transaction',data)),converted=globalThis.structuredClone(data)
  for(const patch of result.patches){
    let parent=converted
    for(const key of patch.path.slice(0,-1))parent=parent[key]
    parent[patch.path.at(-1)]=Number(patch.stored)
  }
  const inputs=rows=>Object.fromEntries(rows.map(r=>[r.categoryId,{baseAmount:r.baseAmount,fundingCategories:r.fundingCategories}]))
  const before=funding.execute('funding',inputs(data),99),after=funding.execute('funding',inputs(converted),99)
  assert.deepEqual(after,before);assert.equal(after.invariant.accepted,true)
})
