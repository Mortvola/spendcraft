import { test } from '@japa/runner'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { storedTaxMonetaryAmount, taxForecastPaths, transactionLogMoneyPaths } from '../../app/services/taxMonetaryCodec.ts'
import { loadWorksheet } from '../../scripts/auditTaxForecastPrecision.mjs'
import { argumentsFor, classify, leafExpression, runConversion, runRecovery, TAX_FIELDS,
  SCAN_SQL, SCHEMA_SQL, LOCK_SQL } from '../../scripts/convertHistoricalTaxMonetary.mjs'

const hash = (value, algorithm = 'md5') => createHash(algorithm).update(value).digest('hex')
function row(source, data) {
  const fields = source === 'tax' ? TAX_FIELDS : ['amount.old', 'amount.new']
  const value = path => path.split('.').reduce((value, key) => value?.[key], data)
  return { id: source === 'tax' ? 1 : 2, budget_id: source === 'tax' ? 2 : 3, transaction_id: 7, year: 2026,
    payload_text: JSON.stringify(data), tokens: JSON.stringify(Object.fromEntries(fields.map(field => [field, JSON.stringify(value(field)) ?? null]))),
    ownership_valid: true, unique_paths: true }
}
function fixture() {
  const target = { database: { host: 'localhost', port: 5432, name: 'spendcraft', user: 'ubuntu', server: '127.0.0.1', peer: '127.0.0.1', oid: '123', systemIdentifier: '456' } }
  const config = { host: 'localhost', port: 5432, database: 'spendcraft', user: 'ubuntu' }
  const original = {
    tax: '{"note": 9007199254740993, "estimated": {"priorYearAgi": "150000.00"}, "taxableInterest": 12.345}',
    log: '{ "amount" : {"old":0.125,"new":"-0.12","metadata":1e400}, "duplicate":1,"duplicate":2,"note":9007199254740993 }',
  }
  const converted = { tax: original.tax.replace('12.345', '"12.35"'), log: original.log.replace('"old":0.125', '"old":"0.13"') }
  let state = Object.fromEntries(Object.entries(original).map(([source, payload]) => [source, { payload, hash: hash(payload), version: '100' }])), saved
  const calls = [], metadata = hash('unchanged non-payload columns')
  const client = { readOnly: false,
    connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.startsWith('BEGIN')) { saved = globalThis.structuredClone(state); return { rows: [] } }
      if (sql === 'ROLLBACK') { state = saved; return { rows: [] } }
      if (sql === 'COMMIT') { if (client.uncertainCommit) throw Error('connection_lost'); return { rows: [] } }
      if (sql === SCHEMA_SQL) return { rows: ['taxes', 'transaction_logs'].map(name => ({ name, correct_type: !client.wrongType,
        ordinary: true, rls: !!client.rls, rules: false, triggers: !!client.triggers })) }
      if (sql === LOCK_SQL || sql.startsWith('SELECT id FROM public.applications')) return { rows: [{ id: 2 }, { id: 3 }] }
      if (sql.includes('current_database()')) return { rows: [{ database: 'spendcraft', username: 'ubuntu', server: '127.0.0.1/32', peer: '127.0.0.1/32', port: 5432, oid: '123', system_identifier: '456' }] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: client.readOnly ? 'on' : 'off', isolation: 'repeatable read' }] }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ xid: '123' }] }
      for (const source of ['tax', 'log']) {
        if (sql === SCAN_SQL[source]) {
          if (parameters[0] !== '0') return { rows: [] }
          const r = { ...row(source, JSON.parse(state[source].payload)), payload_text: state[source].payload,
            row_hash: state[source].hash, row_version: state[source].version, metadata_hash: metadata }
          if (client.duplicateKeys && source === 'log') r.unique_paths = false
          if (client.badOwnership && source === 'log') r.ownership_valid = false
          return { rows: [r] }
        }
      }
      const source = sql.includes('public.taxes r') ? 'tax' : sql.includes('public.transaction_logs r') ? 'log' : undefined
      if (source && sql.startsWith('SELECT (')) return { rows: [{ payload: converted[source], row_hash: hash(converted[source]) }] }
      if (source && sql.startsWith('UPDATE')) {
        if (client.rejectWrite === source) throw Error('injected_write_failure')
        if (parameters.at(-2) !== state[source].version || parameters.at(-1) !== state[source].hash) return { rows: [] }
        const recovery = /SET (data|changes)=\$1::/.test(sql)
        state[source] = { payload: recovery ? original[source] : converted[source],
          hash: hash(recovery ? original[source] : converted[source]), version: recovery ? '789' : '123' }
        return { rows: [{ id: source === 'tax' ? 1 : 2, ...state[source], row_hash: state[source].hash,
          metadata_hash: client.changedMetadata ? hash('changed') : metadata }] }
      }
      if (source && sql.startsWith('SELECT r.')) return { rows: client.moved === source ? [] : [{ ...state[source], row_hash: state[source].hash }] }
      throw Error('unexpected_mock_query')
    },
  }
  return { target, config, client, calls, original, converted, state: () => globalThis.structuredClone(state),
    edit(source, sameValue = false) { state[source] = { ...state[source], version: '500', ...(sameValue ? {} : { hash: hash('later edit') }) } } }
}
async function withFixture(work) {
  const output = await mkdtemp(join(tmpdir(), 'tax-monetary-conversion-')), f = fixture()
  let guards = 0
  const context = { output, config: f.config, target: f.target, readOnly: false, guard: async () => { guards++ } }
  try { await work({ ...f, context, guards: () => guards }) } finally { await rm(output, { recursive: true, force: true }) }
}

test.group('Historical Tax and TransactionLog conversion (no database)', () => {
  test('allowlists exactly match the production storage boundaries', ({ assert }) => {
    assert.deepEqual(TAX_FIELDS.map(field => field.split('.')), taxForecastPaths)
    assert.deepEqual(leafExpression('log', [{ field: 'amount.old', stored: '1.00' }, { field: 'amount.new', stored: '2.00' }]).parameters, ['old', '1.00', 'new', '2.00'])
    assert.deepEqual(transactionLogMoneyPaths, [['amount', 'old'], ['amount', 'new']])
  })
  test('all numeric leaves use the production codec and approved rounding').with([
    12.34, 12.345, -12.345, 0.125, -0.125, 1.005, -1.005, 0.1 + 0.2, 0, -0, -0.005,
  ]).run(({ assert }, value) => {
    const tax = Object.fromEntries(TAX_FIELDS.filter(f => !f.includes('.')).map(f => [f, value]))
    tax.estimated = { expectedAgi: value, priorYearAgi: value, priorYearTotalTax: value }
    const result = classify('tax', row('tax', tax)), log = classify('log', row('log', { amount: { old: value, new: value } }))
    assert.isEmpty(result.errors); assert.isEmpty(log.errors); assert.lengthOf(result.patches, 13); assert.lengthOf(log.patches, 2)
    for (const patch of [...result.patches, ...log.patches]) assert.equal(patch.stored, storedTaxMonetaryAmount(value))
  })
  test('canonical strings and mixed data retain metadata without mutation', ({ assert }) => {
    for (const source of ['tax', 'log']) {
      const input = row(source, source === 'tax' ? { taxableInterest: 0.125, qualifiedDividends: '-2.00', notes: [2, 1, 2] }
        : { amount: { old: 0.125, new: '-2.00', currency: 'USD' }, notes: [2, 1, 2] })
      const before = globalThis.structuredClone(input), result = classify(source, input)
      assert.isEmpty(result.errors); assert.equal(result.numericAmounts, 1); assert.equal(result.canonicalStrings, 1); assert.equal(result.mixed, 1)
      assert.deepEqual(input, before); assert.lengthOf(result.patches, 1)
    }
  })
  test('missing/null roots, parents and leaves never become zero', ({ assert }) => {
    for (const source of ['tax', 'log']) {
      assert.equal(classify(source, { payload_text: null }).sqlNullData, 1)
      assert.equal(classify(source, row(source, null)).jsonNullData, 1)
      for (const data of [{}, source === 'tax' ? { taxableInterest: null, estimated: null } : { amount: null },
        source === 'tax' ? { estimated: { expectedAgi: null } } : { amount: { old: null } }]) {
        const result = classify(source, row(source, data)); assert.isEmpty(result.errors); assert.isEmpty(result.patches)
      }
    }
  })
  test('malformed/noncanonical/unsafe money blocks both boundaries').with([
    true, {}, [], 'bad', '1', '1.001', '01.00', '-0.00', ' 1.00', '1e2', Number.MAX_SAFE_INTEGER, '9007199254740992.00',
  ]).run(({ assert }, value) => {
    for (const source of ['tax', 'log']) {
      const input = source === 'tax' ? { taxableInterest: value } : { amount: { old: value } }
      const result = classify(source, row(source, input)); assert.equal(result.malformedAmounts, 1); assert.isNotEmpty(result.errors)
    }
  })
  test('overflow tokens, unsupported parents and duplicate target keys fail closed', ({ assert }) => {
    assert.isNotEmpty(classify('tax', { ...row('tax', {}), payload_text: '{"taxableInterest":1e400}', tokens: '{"taxableInterest":"1e400"}' }).errors)
    for (const data of [[], false, 'bad', { estimated: [] }, { estimated: 1 }]) assert.isNotEmpty(classify('tax', row('tax', data)).errors)
    for (const data of [{ amount: [] }, { amount: 'bad' }]) assert.isNotEmpty(classify('log', row('log', data)).errors)
    assert.isNotEmpty(classify('log', { ...row('log', { amount: { old: 1 } }), unique_paths: false }).errors)
    assert.isNotEmpty(classify('tax', { ...row('tax', { taxableInterest: 1 }), ownership_valid: false }).errors)
    assert.isNotEmpty(classify('log', { ...row('log', { amount: { old: 1 } }), transaction_id: null }).errors)
  })
  test('only approved paths and canonical replacements can reach SQL', ({ assert }) => {
    for (const source of ['tax', 'log']) {
      for (const patches of [[], [{ field: 'note', stored: '1.00' }], [{ field: '__proto__', stored: '1.00' }],
        [{ field: source === 'tax' ? 'taxableInterest' : 'amount.old', stored: '1.001' }]]) assert.throws(() => leafExpression(source, patches))
      const patch = { field: source === 'tax' ? 'taxableInterest' : 'amount.old', stored: '1.00' }
      assert.throws(() => leafExpression(source, [patch, patch])); assert.throws(() => leafExpression(source, [{ ...patch, stored: 1 }]))
    }
    assert.throws(() => leafExpression('plaid_logs', [{ field: 'amount.old', stored: '1.00' }]))
  })
  test('JSON log SQL preserves raw values, member order and unrelated duplicate keys without JSONB', ({ assert }) => {
    const sql = leafExpression('log', [{ field: 'amount.old', stored: '0.13' }]).expression
    assert.include(sql, 'json_each(r.changes)'); assert.include(sql, 'ELSE a.value'); assert.include(sql, 'ELSE o.value')
    assert.include(sql, 'ORDER BY a.ordinal'); assert.include(sql, 'ORDER BY o.ordinal'); assert.notInclude(sql, 'jsonb')
    assert.notInclude(SCAN_SQL.log, 'jsonb'); assert.include(SCAN_SQL.log, 'count(DISTINCT e.key)')
    assert.include(SCAN_SQL.log, 'row_to_json(r)'); assert.notInclude(SCAN_SQL.log, 'to_jsonb')
  })
  test('explicit target, default dry-run and pinned separate recovery CLI', ({ assert }) => {
    assert.throws(() => argumentsFor([]), /explicit_database_required/)
    assert.isUndefined(argumentsFor(['--database', 'spendcraft']).execute)
    assert.isTrue(argumentsFor(['--database', 'spendcraft', '--recover', '--snapshot', '/p', '--snapshot-sha256', 'a'.repeat(64), '--execute']).execute)
    for (const args of [['--execute', '--dry-run'], ['--recover'], ['--snapshot', 'x'], ['--force']]) assert.throws(() => argumentsFor(['--database', 'spendcraft', ...args]))
  })
  test('dry-run reports the complete candidate set without locks, writes or recovery snapshots', async ({ assert }) => {
    await withFixture(async f => {
      f.client.readOnly = true; f.context.readOnly = true
      const result = await runConversion(f.client, f.context)
      assert.equal(result.candidates, 2); assert.equal(result.taxCandidates, 1); assert.equal(result.logCandidates, 1)
      assert.equal(result.numericAmounts, 2); assert.equal(result.canonicalStrings, 2); assert.equal(f.guards(), 0)
      assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE') || c.sql.includes('FOR UPDATE') || c.sql.includes('pg_current_xact_id')))
      const details = (await readFile(join(f.context.output, 'records.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
      assert.deepEqual(details.map(d => [d.source, d.id, d.budget]), [['tax', 1, 2], ['log', 2, 3]])
      assert.equal(details[1].original, f.original.log); assert.equal(details[1].changes[0].proposedAmount, '0.13')
      await assert.rejects(() => readFile(join(f.context.output, 'snapshot.json')))
    })
  })
  test('both boundaries convert atomically, preserve raw originals and are idempotent', async ({ assert }) => {
    await withFixture(async f => {
      const result = await runConversion(f.client, f.context)
      assert.equal(result.candidates, 2); assert.equal(f.calls.filter(c => c.sql.startsWith('BEGIN')).length, 1)
      const snapshot = await readFile(join(f.context.output, 'original-tax-monetary.jsonl'), 'utf8')
      const entries = snapshot.trim().split('\n').map(JSON.parse)
      assert.equal(entries[0].original, f.original.tax); assert.equal(entries[1].original, f.original.log)
      assert.include(entries[1].converted, '1e400'); assert.include(entries[1].converted, '9007199254740993'); assert.include(entries[1].converted, '"duplicate":1,"duplicate":2')
      assert.equal(f.state().tax.payload, f.converted.tax); assert.equal(f.state().log.payload, f.converted.log)
      assert.isBelow(f.calls.findIndex(c => c.sql === LOCK_SQL), f.calls.findIndex(c => c.sql === SCAN_SQL.tax))
      for (const call of f.calls.filter(c => c.sql.startsWith('UPDATE'))) {
        assert.match(call.sql, /^UPDATE public\.(taxes|transaction_logs) r SET (data|changes)=/)
        assert.include(call.sql, 'r.xmin::text='); assert.notInclude(call.sql, 'SET updated_at')
      }
      const second = await mkdtemp(join(tmpdir(), 'tax-monetary-second-'))
      try {
        const previousUpdates = f.calls.filter(c => c.sql.startsWith('UPDATE')).length
        const next = await runConversion(f.client, { ...f.context, output: second })
        assert.equal(next.candidates, 0); assert.equal(next.numericAmounts, 0)
        assert.equal(f.calls.filter(c => c.sql.startsWith('UPDATE')).length, previousUpdates)
        assert.equal(await readFile(join(f.context.output, 'original-tax-monetary.jsonl'), 'utf8'), snapshot)
      } finally { await rm(second, { recursive: true, force: true }) }
    })
  })
  test('recovery dry-run and execution preserve exact original Tax and JSON log text', async ({ assert }) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context)
      const snapshot = join(f.context.output, 'snapshot.json')
      f.client.readOnly = true
      const dry = await runRecovery(f.client, { ...f.context, readOnly: true }, snapshot, f.context.snapshotHash)
      assert.equal(dry.restored, 0); assert.equal(f.state().log.payload, f.converted.log)
      f.client.readOnly = false
      const result = await runRecovery(f.client, f.context, snapshot, f.context.snapshotHash)
      assert.equal(result.restored, 2); assert.equal(f.state().tax.payload, f.original.tax); assert.equal(f.state().log.payload, f.original.log)
      assert.deepEqual(f.calls.find(c => c.sql.startsWith('SELECT id FROM public.applications')).parameters, [[2, 3]])
      const update = f.calls.find(c => c.sql.startsWith('UPDATE public.transaction_logs') && c.sql.includes('SET changes=$1::json'))
      assert.equal(update.parameters[0], f.original.log); assert.include(update.sql, 'r.transaction_id=')
    })
  })
  test('later edits, equal-value saves and ownership changes refuse recovery').with([
    ['tax', false], ['log', false], ['tax', true], ['log', true], ['log', 'moved'],
  ]).run(async ({ assert }, [source, change]) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context)
      if (change === 'moved') f.client.moved = source; else f.edit(source, change)
      const before = f.state()
      await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), /changed_row_recovery_refused/)
      assert.deepEqual(f.state(), before)
    })
  })
  test('schema, identity, ownership, duplicates and writer admission fail before updates').with([
    'wrongType', 'rls', 'triggers', 'identity', 'badOwnership', 'duplicateKeys', 'writers',
  ]).run(async ({ assert }, failure) => {
    await withFixture(async f => {
      if (failure === 'identity') f.context.config = { ...f.config, database: 'other' }
      else if (failure === 'writers') f.context.guard = async () => { throw Error('writers_running') }
      else f.client[failure] = true
      await assert.rejects(() => runConversion(f.client, f.context))
      assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE'))); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
    })
  })
  test('late log write, metadata or writer failures roll back changes to both tables').with(['log', 'metadata', 'writers'])
    .run(async ({ assert }, failure) => {
      await withFixture(async f => {
        if (failure === 'log') f.client.rejectWrite = 'log'
        if (failure === 'metadata') f.client.changedMetadata = true
        if (failure === 'writers') { let calls = 0; f.context.guard = async () => { if (++calls === 3) throw Error('writer_restarted') } }
        const before = f.state()
        await assert.rejects(() => runConversion(f.client, f.context))
        assert.deepEqual(f.state(), before); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
      })
    })
  test('damaged snapshots and wrong database identity reject before database recovery').with(['data', 'manifest', 'target'])
    .run(async ({ assert }, failure) => {
      await withFixture(async f => {
        await runConversion(f.client, f.context)
        const path = join(f.context.output, 'snapshot.json')
        if (failure === 'data') await writeFile(join(f.context.output, 'original-tax-monetary.jsonl'), '{}\n')
        if (failure === 'manifest') await writeFile(path, '{}\n')
        if (failure === 'target') f.context.target = { database: { ...f.target.database, name: 'other' } }
        const calls = f.calls.length
        await assert.rejects(() => runRecovery(f.client, f.context, path, f.context.snapshotHash))
        assert.equal(f.calls.length, calls)
      })
    })
  test('uncertain COMMIT is reported without automatically retrying', async ({ assert }) => {
    await withFixture(async f => {
      f.client.uncertainCommit = true
      await assert.rejects(() => runConversion(f.client, f.context), /commit_outcome_unknown_inspect_snapshot_before_retry/)
      assert.equal(f.calls.filter(c => c.sql === 'COMMIT').length, 1)
    })
  })
  test('cent inputs retain existing Worksheet thresholds, safe harbor and intermediate precision', async ({ assert }) => {
    const worksheet = await loadWorksheet()
    for (const agi of [150000, 150000.01]) {
      const original = { filingStatus: 'Single', estimated: { expectedAgi: 100000, priorYearAgi: agi, priorYearTotalTax: 10000.01 } }
      const result = classify('tax', row('tax', original)), converted = globalThis.structuredClone(original)
      assert.equal(result.roundedAmounts, 0)
      for (const patch of result.patches) converted.estimated[patch.field.split('.')[1]] = Number(patch.stored)
      const input = data => ({ filingStatus: 'Single', deductions: worksheet.deductions('Single'), adjustedGrossIncome: data.estimated.expectedAgi,
        priorYearAdjustedGrossIncome: data.estimated.priorYearAgi, priorYearTotalTax: data.estimated.priorYearTotalTax })
      assert.deepEqual(worksheet.calculate(input(converted)), worksheet.calculate(input(original)))
      if (agi === 150000) assert.equal(worksheet.calculate(input(converted)).firstInstallment, 2500.0025)
    }
  })
})
