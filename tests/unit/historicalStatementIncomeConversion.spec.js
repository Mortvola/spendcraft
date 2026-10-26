import { test } from '@japa/runner'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storedStatementIncomeAmount } from '../../app/services/statementIncomeCodec.ts'
import { argumentsFor, classify, leafExpression, runConversion, runRecovery, SCAN_SQL, SCHEMA_SQL, LOCK_SQL } from '../../scripts/convertHistoricalStatementIncome.mjs'

const row = data => ({ id: 1, account_id: 3, budget_id: 2, data_text: JSON.stringify(data),
  tokens: JSON.stringify(Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [key, JSON.stringify(value)]))) })
function fixture() {
  const target = { database: { host: 'localhost', port: 5432, name: 'spendcraft', user: 'ubuntu', server: '127.0.0.1', peer: '127.0.0.1', oid: '123', systemIdentifier: '456' } }
  const config = { host: 'localhost', port: 5432, database: 'spendcraft', user: 'ubuntu' }
  const original = '{"shortTermCapitalGains":12.345,"dividends":"0.30","metadata":9007199254740993}'
  const converted = original.replace('12.345', '"12.35"')
  let state = { data: original, hash: 'original', version: '100' }, saved
  const calls = []
  const client = { readOnly: false, extraMalformed: false, rejectWrite: false,
    connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.startsWith('BEGIN')) { saved = { ...state }; return { rows: [] } }
      if (sql === 'ROLLBACK') { state = saved; return { rows: [] } }
      if (sql === 'COMMIT') return { rows: [] }
      if (sql === SCHEMA_SQL) return { rows: [{ jsonb: true, ordinary: true, rls: false, rules: false, triggers: client.userTriggers ?? false }] }
      if (sql === LOCK_SQL || sql.startsWith('SELECT id FROM public.applications')) return { rows: [{ id: 2 }] }
      if (sql.includes('current_database()')) return { rows: [{ database: 'spendcraft', username: 'ubuntu', server: '127.0.0.1', peer: '127.0.0.1', port: 5432, oid: '123', system_identifier: '456' }] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: client.readOnly ? 'on' : 'off', isolation: 'repeatable read' }] }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ xid: '123' }] }
      if (sql === SCAN_SQL) return { rows: parameters[0] !== '0' ? [] : [
        { ...row(JSON.parse(state.data)), data_text: state.data, row_hash: state.hash, metadata_hash: 'metadata', row_version: state.version },
        ...(client.extraMalformed ? [{ ...row({ dividends: null }), id: 2 }] : []),
        { ...row(null), id: 3, data_text: null },
      ] }
      if (sql.startsWith('SELECT (jsonb_set')) return { rows: [{ data: converted, row_hash: 'converted' }] }
      if (sql.startsWith('UPDATE') && sql.includes('SET data=jsonb_set')) {
        if (client.rejectWrite) throw Error('injected_write_failure')
        if (state.hash !== 'original' || state.version !== '100') return { rows: [] }
        state = { data: converted, hash: 'converted', version: '123' }
        return { rows: [{ data: converted, row_hash: 'converted', metadata_hash: client.changedMetadata ? 'changed' : 'metadata', version: '123' }] }
      }
      if (sql.startsWith('UPDATE')) {
        if (state.hash !== 'converted' || state.version !== '123') return { rows: [] }
        state = { data: original, hash: 'original', version: '789' }
        return { rows: [{ id: 1 }] }
      }
      if (sql.startsWith('SELECT s.data::text')) return { rows: client.moved ? [] : [{ data: state.data, row_hash: state.hash, version: state.version }] }
      throw Error('unexpected_mock_query')
    } }
  return { client, calls, config, target, original, converted, state: () => state,
    edit: () => { state = { ...state, hash: 'changed', version: '500' } },
    equalSave: () => { state = { ...state, version: '500' } } }
}
async function withFixture(work) {
  const output = await mkdtemp(join(tmpdir(), 'statement-income-conversion-'))
  const f = fixture()
  let guards = 0
  const context = { output, config: f.config, target: f.target, readOnly: false, guard: async () => { guards++ } }
  try { await work({ ...f, context, guards: () => guards }) } finally { await rm(output, { recursive: true, force: true }) }
}

test.group('Historical Statement income conversion (no database)', () => {
  test('encoding agrees with production codec').with([
    12.34, 12.345, -1.005, 0.125, -0.125, 0.30000000000000004, 0, -0, -0.005, '12.34', '-12.34', '0.00',
  ]).run(({ assert }, amount) => {
    const result = classify(row({ dividends: amount }))
    assert.isEmpty(result.errors)
    if (typeof amount === 'number') assert.equal(result.patches[0].stored, storedStatementIncomeAmount(amount))
    else { assert.isEmpty(result.patches); assert.equal(result.canonicalStrings, 1) }
  })
  test('malformed and unsafe amounts block conversion').with([
    null, true, {}, [], 'bad', '1', '1.234', '-0.00', '01.00', ' 1.00', '1e2', Number.MAX_SAFE_INTEGER, '9007199254740992.00',
  ]).run(({ assert }, amount) => {
    const result = classify(row({ dividends: amount }))
    assert.equal(result.malformedAmounts, 1); assert.lengthOf(result.errors, 1)
  })
  test('nonfinite and overflow JSON numbers fail closed', ({ assert }) => {
    for (const value of [NaN, Infinity, -Infinity, undefined]) assert.throws(() => storedStatementIncomeAmount(value))
    assert.isNotEmpty(classify({ ...row({}), data_text: '{"dividends":1e400}', tokens: '{"dividends":"1e400"}' }).errors)
  })
  test('only approved fields produce leaf patches; mixed data and metadata are not rewritten', ({ assert }) => {
    const input = row({ shortTermCapitalGains: 12.345, longTermCapitalGains: '-1.00', dividends: -0.125, taxableInterest: 0,
      notes: { amount: 1.005, ordered: [2, 1, 2] }, otherMoney: 1.234 })
    const before = JSON.stringify(input), result = classify(input)
    assert.equal(result.numericAmounts, 3); assert.equal(result.canonicalStrings, 1); assert.equal(result.mixed, 1)
    assert.equal(JSON.stringify(input), before)
    assert.deepEqual(result.patches, [{ field: 'shortTermCapitalGains', stored: '12.35' }, { field: 'dividends', stored: '-0.12' }, { field: 'taxableInterest', stored: '0.00' }])
    const sql = leafExpression(result.patches)
    assert.include(sql.expression, 'jsonb_set(s.data,'); assert.notInclude(sql.expression, 'starting_balance')
    assert.deepEqual(sql.parameters, [['shortTermCapitalGains'], '12.35', ['dividends'], '-0.12', ['taxableInterest'], '0.00'])
  })
  test('SQL-null, JSON-null and missing fields remain absent; unsupported shapes and ownership block', ({ assert }) => {
    assert.equal(classify({ data_text: null }).sqlNullData, 1)
    assert.equal(classify(row(null)).jsonNullData, 1)
    assert.equal(classify(row({})).missingFields, 4)
    for (const value of [[], 0, false, 'bad']) assert.isNotEmpty(classify(row(value)).errors)
    assert.isNotEmpty(classify({ ...row({ dividends: 1 }), budget_id: null }).errors)
  })
  test('patch paths cannot change other JSON or accept duplicate/noncanonical replacements', ({ assert }) => {
    for (const field of ['startingBalance', 'notes', '__proto__', ['dividends'], undefined]) assert.throws(() => leafExpression([{ field, stored: '1.00' }]))
    assert.throws(() => leafExpression([{ field: 'dividends', stored: 1 }]))
    assert.throws(() => leafExpression([{ field: 'dividends', stored: '1.001' }]))
    assert.throws(() => leafExpression([{ field: 'dividends', stored: '1.00' }, { field: 'dividends', stored: '2.00' }]))
  })
  test('explicit database, separate execution and pinned recovery required', ({ assert }) => {
    assert.throws(() => argumentsFor([]), /explicit_database_required/)
    assert.isUndefined(argumentsFor(['--database', 'spendcraft']).execute)
    assert.isTrue(argumentsFor(['--database', 'spendcraft', '--execute']).execute)
    for (const args of [['--execute', '--dry-run'], ['--recover'], ['--snapshot', 'x'], ['--force'], ['--database', '']]) assert.throws(() => argumentsFor(['--database', 'spendcraft', ...args]))
  })
  test('identity, triggers and running writers reject before updates').with(['database', 'triggers', 'writers']).run(async ({ assert }, failure) => {
    await withFixture(async f => {
      if (failure === 'database') f.context.config = { ...f.context.config, database: 'other' }
      if (failure === 'triggers') f.client.userTriggers = true
      if (failure === 'writers') f.context.guard = async () => { throw Error('writers_running') }
      await assert.rejects(() => runConversion(f.client, f.context))
      assert.equal(f.state().data, f.original); assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE')))
      assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
    })
  })
  test('dry-run is read-only, reports ownership/rounding and never locks, writes or snapshots', async ({ assert }) => {
    await withFixture(async f => {
      f.client.readOnly = true; f.context.readOnly = true
      const summary = await runConversion(f.client, f.context)
      assert.equal(summary.numericAmounts, 1); assert.equal(summary.canonicalStrings, 1); assert.equal(summary.sqlNullData, 1)
      assert.equal(summary.roundedAmounts, 1); assert.equal(summary.candidates, 1); assert.equal(f.guards(), 0)
      assert.equal(f.state().data, f.original); assert.include(f.calls[0].sql, 'READ ONLY')
      assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE') || c.sql.includes('FOR UPDATE')))
      const detail = JSON.parse((await readFile(join(f.context.output, 'statements.jsonl'), 'utf8')).split('\n')[0])
      assert.equal(detail.budget, 2); assert.equal(detail.accountId, 3); assert.equal(detail.changes[0].originalToken, '12.345')
      await assert.rejects(() => readFile(join(f.context.output, 'snapshot.json')))
    })
  })
  test('atomic leaf-only conversion snapshots exact raw JSON; second execution is idempotent', async ({ assert }) => {
    await withFixture(async f => {
      const summary = await runConversion(f.client, f.context)
      assert.equal(summary.candidates, 1); assert.equal(f.state().data, f.converted); assert.isAbove(f.guards(), 1)
      const entry = JSON.parse((await readFile(join(f.context.output, 'original-statement-income.jsonl'), 'utf8')).trim())
      assert.equal(entry.original, f.original); assert.include(entry.converted, '9007199254740993'); assert.equal(entry.budget, 2); assert.equal(entry.accountId, 3); assert.equal(entry.originalVersion, '100')
      const update = f.calls.find(c => c.sql.startsWith('UPDATE'))
      assert.include(update.sql, 'UPDATE public.statements s SET data=jsonb_set')
      assert.include(update.sql, 'i.application_id='); assert.include(update.sql, 's.xmin::text=')
      assert.isBelow(f.calls.findIndex(c => c.sql === LOCK_SQL), f.calls.findIndex(c => c.sql === SCAN_SQL))
      assert.isTrue(f.calls.filter(c => c.sql.startsWith('UPDATE')).every(c => !/SET (starting_balance|ending_balance|updated_at)/.test(c.sql)))
      const second = await mkdtemp(join(tmpdir(), 'statement-income-second-'))
      try { const next = await runConversion(f.client, { ...f.context, output: second }); assert.equal(next.candidates, 0); assert.equal(next.numericAmounts, 0) }
      finally { await rm(second, { recursive: true, force: true }) }
    })
  })
  test('recovery dry-run and execution restore exact original JSON with Budget locking', async ({ assert }) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context); const path = join(f.context.output, 'snapshot.json')
      f.client.readOnly = true
      const checked = await runRecovery(f.client, { ...f.context, readOnly: true }, path, f.context.snapshotHash)
      assert.equal(checked.restored, 0); assert.equal(f.state().data, f.converted)
      f.client.readOnly = false
      const result = await runRecovery(f.client, f.context, path, f.context.snapshotHash)
      assert.equal(result.restored, 1); assert.equal(f.state().data, f.original)
      const lock = f.calls.find(c => c.sql.startsWith('SELECT id FROM public.applications'))
      assert.deepEqual(lock.parameters, [[2]])
    })
  })
  test('later edits, equal-value saves and changed ownership refuse recovery').with(['edit', 'equalSave', 'moved']).run(async ({ assert }, change) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context)
      if (change === 'moved') f.client.moved = true; else f[change]()
      const before = { ...f.state() }
      await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), /changed_row_recovery_refused/)
      assert.deepEqual(f.state(), before)
    })
  })
  test('tampered snapshot or wrong target refuses recovery before database use').with(['data', 'manifest', 'target']).run(async ({ assert }, change) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context); const path = join(f.context.output, 'snapshot.json')
      if (change === 'data') await writeFile(join(f.context.output, 'original-statement-income.jsonl'), '{}\n')
      if (change === 'manifest') await writeFile(path, '{}\n')
      if (change === 'target') f.context.target = { database: { ...f.target.database, name: 'other' } }
      const count = f.calls.length
      await assert.rejects(() => runRecovery(f.client, f.context, path, f.context.snapshotHash))
      assert.equal(f.calls.length, count)
    })
  })
  test('malformed rows, metadata changes and write errors atomically roll back').with(['malformed', 'metadata', 'write']).run(async ({ assert }, mode) => {
    await withFixture(async f => {
      f.client.extraMalformed = mode === 'malformed'; f.client.changedMetadata = mode === 'metadata'; f.client.rejectWrite = mode === 'write'
      await assert.rejects(() => runConversion(f.client, f.context))
      assert.equal(f.state().data, f.original); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
      if (mode === 'malformed') assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE')))
    })
  })
})
