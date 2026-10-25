import { test } from '@japa/runner'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storedTaxAmount } from '../../app/services/taxAmountCodec.ts'
import { argumentsFor, classify, leafExpression, runConversion, runRecovery, SCAN_SQL, SCHEMA_SQL } from '../../scripts/convertHistoricalTransactionTaxes.mjs'

const row = amounts => ({ id: 1, type: 5, deprecated: false, taxes_text: JSON.stringify(amounts.map(amount => ({ type: 'estimated_tax_payments', amount }))), amount_tokens: JSON.stringify(amounts.map(amount => JSON.stringify(amount))) })
function fixture() {
  const target = { database: { host: 'localhost', port: 5432, name: 'spendcraft', user: 'ubuntu', server: '127.0.0.1', peer: '127.0.0.1', oid: '123', systemIdentifier: '456' } }
  const config = { host: 'localhost', port: 5432, database: 'spendcraft', user: 'ubuntu' }
  const original = '[{"type":"estimated_tax_payments","amount":12.345,"metadata":9007199254740993},{"type":"estimated_tax_payments","amount":"0.30"}]'
  const converted = original.replace('12.345', '"12.35"')
  let state = { taxes: original, hash: 'original', version: '100' }, saved
  const calls = []
  const client = { readOnly: false, extraMalformed: false, rejectWrite: false,
    connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.startsWith('BEGIN')) { saved = { ...state }; return { rows: [] } }
      if (sql === 'ROLLBACK') { state = saved; return { rows: [] } }
      if (sql === 'COMMIT') return { rows: [] }
      if (sql === SCHEMA_SQL) return { rows: [{ jsonb: true, ordinary: true, rls: false, rules: false, triggers: client.userTriggers ?? false }] }
      if (sql.includes('current_database()')) return { rows: [{ database: 'spendcraft', username: 'ubuntu', server: '127.0.0.1', peer: '127.0.0.1', port: 5432, oid: '123', system_identifier: '456' }] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: client.readOnly ? 'on' : 'off', isolation: 'repeatable read' }] }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ xid: '123' }] }
      if (sql === SCAN_SQL) return { rows: parameters[0] !== '0' ? [] : [
        { ...row([]), id: 1, application_id: 2, taxes_text: state.taxes, amount_tokens: JSON.stringify(['12.345', '"0.30"']), row_hash: state.hash, metadata_hash: 'metadata', row_version: state.version },
        ...(client.extraMalformed ? [{ ...row([null]), id: 2, application_id: 2 }] : []),
      ] }
      if (sql.startsWith('SELECT (jsonb_set')) return { rows: [{ taxes: converted, row_hash: 'converted' }] }
      if (sql.startsWith('UPDATE') && sql.includes('SET taxes=jsonb_set')) {
        if (client.rejectWrite) throw Error('injected_write_failure')
        if (state.hash !== 'original' || state.version !== '100') return { rows: [] }
        state = { taxes: converted, hash: 'converted', version: '123' }
        return { rows: [{ taxes: converted, row_hash: 'converted', metadata_hash: 'metadata', version: '123' }] }
      }
      if (sql.startsWith('UPDATE')) {
        if (state.hash !== 'converted' || state.version !== '123') return { rows: [] }
        state = { taxes: original, hash: 'original', version: '789' }
        return { rows: [{ id: 1 }] }
      }
      if (sql.startsWith('SELECT taxes::text')) return { rows: [{ taxes: state.taxes, row_hash: state.hash, version: state.version }] }
      throw Error('unexpected_mock_query')
    } }
  return { client, calls, config, target, original, converted, state: () => state,
    edit: () => { state = { ...state, hash: 'changed', version: '500' } },
    equalSave: () => { state = { ...state, version: '500' } } }
}
async function withFixture(work) {
  const output = await mkdtemp(join(tmpdir(), 'tax-conversion-test-'))
  const f = fixture()
  let guards = 0
  const context = { output, config: f.config, target: f.target, readOnly: false, guard: async () => { guards++ } }
  try { await work({ ...f, context, guards: () => guards }) } finally { await rm(output, { recursive: true, force: true }) }
}

test.group('Historical tax conversion (no database)', () => {
  test('approved encoding agrees with production codec').with([
    12.34, 12.345, -1.005, 0.125, -0.125, 0.30000000000000004, 0, -0, -0.005, '12.34', '-12.34', '0.00',
  ]).run(({ assert }, amount) => {
    const result = classify(row([amount]))
    assert.isEmpty(result.errors)
    if (typeof amount === 'number') assert.equal(result.patches[0].stored, storedTaxAmount(amount))
    else { assert.isEmpty(result.patches); assert.equal(result.canonicalStrings, 1) }
  })
  test('malformed and unsafe amounts block conversion').with([
    null, true, {}, [], 'bad', '1', '1.234', '-0.00', '01.00', ' 1.00', '1e2', Number.MAX_SAFE_INTEGER, '9007199254740992.00',
  ]).run(({ assert }, amount) => {
    const result = classify(row([amount]))
    assert.equal(result.malformedAmounts, 1); assert.lengthOf(result.errors, 1)
  })
  test('nonfinite numbers and missing amounts reject before writes', ({ assert }) => {
    for (const amount of [NaN, Infinity, -Infinity, undefined]) assert.throws(() => storedTaxAmount(amount))
    const result = classify({ ...row([]), taxes_text: '[{"type":"estimated_tax_payments"}]', amount_tokens: '[null]' })
    assert.equal(result.malformedAmounts, 1)
  })
  test('mixed arrays preserve ordering, duplicates and metadata without mutation', ({ assert }) => {
    const input = row([12.345, '0.30', -0.125])
    const before = JSON.stringify(input)
    const result = classify(input)
    assert.equal(result.numericAmounts, 2); assert.equal(result.stringAmounts, 1); assert.equal(result.mixed, 1)
    assert.deepEqual(result.patches, [{ index: 0, stored: '12.35' }, { index: 2, stored: '-0.12' }])
    assert.equal(JSON.stringify(input), before)
    const sql = leafExpression(result.patches)
    assert.include(sql.expression, 'jsonb_set(taxes,'); assert.notInclude(sql.expression, 'categories')
    assert.deepEqual(sql.parameters, [['0', 'amount'], '12.35', ['2', 'amount'], '-0.12'])
  })
  test('empty/null arrays are preserved; malformed shapes block; deprecated rows are untouched', ({ assert }) => {
    assert.equal(classify(row([])).empty, 1)
    assert.equal(classify({ taxes_text: 'null' }).nullTaxData, 1)
    assert.isNotEmpty(classify({ taxes_text: '{}' }).errors)
    assert.isNotEmpty(classify({ taxes_text: '[{}]', amount_tokens: '[null]' }).errors)
    assert.equal(classify({ deprecated: true }).excludedDeprecated, 1)
    assert.equal(classify({ ...row([1]), deleted: true }).numericAmounts, 1)
    assert.equal(classify({ ...row([1]), type: 1 }).numericAmounts, 1)
  })
  test('requires explicit database and separate execution; pinned recovery only', ({ assert }) => {
    assert.throws(() => argumentsFor([]), /explicit_database_required/)
    assert.isUndefined(argumentsFor(['--database', 'spendcraft']).execute)
    assert.isTrue(argumentsFor(['--database', 'spendcraft', '--execute']).execute)
    assert.throws(() => argumentsFor(['--database', 'spendcraft', '--execute', '--dry-run']))
    assert.throws(() => argumentsFor(['--database', 'spendcraft', '--recover']))
    assert.throws(() => argumentsFor(['--database', 'spendcraft', '--snapshot', 'x']))
  })
  test('unsafe patch paths cannot change unrelated JSON', ({ assert }) => {
    for (const index of [-1, 0.5, '0']) assert.throws(() => leafExpression([{ index, stored: '1.00' }]))
    assert.throws(() => leafExpression([{ index: 0, stored: 1 }]))
    assert.throws(() => leafExpression([{ index: 0, stored: '1.001' }]))
  })
  test('database mismatch, user triggers and running writers fail before every update')
    .with(['database', 'triggers', 'writers']).run(async ({ assert }, failure) => {
      await withFixture(async f => {
        if (failure === 'database') f.context.config = { ...f.context.config, database: 'other' }
        if (failure === 'triggers') f.client.userTriggers = true
        if (failure === 'writers') f.context.guard = async () => { throw Error('writers_running') }
        await assert.rejects(() => runConversion(f.client, f.context))
        assert.equal(f.state().taxes, f.original)
        assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE')))
        assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
      })
    })
  test('dry run is read-only, reports rounding and never writes or snapshots', async ({ assert }) => {
    await withFixture(async f => {
      f.client.readOnly = true; f.context.readOnly = true
      const summary = await runConversion(f.client, f.context)
      assert.equal(summary.numericAmounts, 1); assert.equal(summary.canonicalStrings, 1)
      assert.equal(summary.roundedAmounts, 1); assert.equal(summary.candidates, 1)
      assert.equal(f.state().taxes, f.original); assert.equal(f.guards(), 0)
      assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE')))
      assert.include(f.calls[0].sql, 'READ ONLY')
      await assert.rejects(() => readFile(join(f.context.output, 'snapshot.json')))
    })
  })
  test('atomic tax-only conversion saves durable raw JSON and is idempotent on second execution', async ({ assert }) => {
    await withFixture(async f => {
      const summary = await runConversion(f.client, f.context)
      assert.equal(summary.candidates, 1); assert.equal(f.state().taxes, f.converted); assert.isAbove(f.guards(), 1)
      const text = await readFile(join(f.context.output, 'original-taxes.jsonl'), 'utf8')
      assert.equal(JSON.parse(text).original, f.original)
      assert.include(JSON.parse(text).converted, '9007199254740993')
      assert.isTrue(f.calls.filter(c => c.sql.startsWith('UPDATE')).every(c => c.sql.startsWith('UPDATE public.transactions t SET taxes=')))
      const second = await mkdtemp(join(tmpdir(), 'tax-second-'))
      try {
        const result = await runConversion(f.client, { ...f.context, output: second })
        assert.equal(result.candidates, 0); assert.equal(result.numericAmounts, 0)
      } finally { await rm(second, { recursive: true, force: true }) }
    })
  })
  test('recovery dry-run and execution restore exact original tax JSON only', async ({ assert }) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context)
      const path = join(f.context.output, 'snapshot.json')
      f.client.readOnly = true
      const check = await runRecovery(f.client, { ...f.context, readOnly: true }, path, f.context.snapshotHash)
      assert.equal(check.examined, 1); assert.equal(check.restored, 0); assert.equal(f.state().taxes, f.converted)
      f.client.readOnly = false
      const result = await runRecovery(f.client, f.context, path, f.context.snapshotHash)
      assert.equal(result.restored, 1); assert.equal(f.state().taxes, f.original)
    })
  })
  test('later row edits, including equal-value saves, refuse recovery').with(['edit', 'equalSave']).run(async ({ assert }, change) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context); f[change]()
      const before = { ...f.state() }
      await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), /changed_row_recovery_refused/)
      assert.deepEqual(f.state(), before)
    })
  })
  test('snapshot tampering refuses recovery before database use', async ({ assert }) => {
    await withFixture(async f => {
      await runConversion(f.client, f.context)
      await writeFile(join(f.context.output, 'original-taxes.jsonl'), '{}\n')
      const count = f.calls.length
      await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), /snapshot_target_mismatch/)
      assert.equal(f.calls.length, count)
    })
  })
  test('malformed records prevent every update, and write failures roll back').with(['malformed', 'write']).run(async ({ assert }, mode) => {
    await withFixture(async f => {
      f.client.extraMalformed = mode === 'malformed'; f.client.rejectWrite = mode === 'write'
      await assert.rejects(() => runConversion(f.client, f.context))
      assert.equal(f.state().taxes, f.original); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
      if (mode === 'malformed') assert.isFalse(f.calls.some(c => c.sql.startsWith('UPDATE')))
    })
  })
})
