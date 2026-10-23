import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { test } from '@japa/runner'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256, loopback, discoverTarget, verifyConnectionConfiguration, verifyConfigured, verifyDatabase,
  classify, convertedAmount, leafExpression, atomic, SCAN_SQL } from '../../scripts/lib/historicalCategoryConversion.mjs'
import { argumentsFor, conversionDiagnostic, runConversion, runRecovery } from '../../scripts/convertHistoricalTransactionCategories.mjs'

function targetFor(name = 'spendcraft_staging') {
  return { database: { host: 'localhost', port: 5432, name, user: name,
    server: '127.0.0.1', peer: '127.0.0.1', systemIdentifier: '123456', oid: '16384' } }
}
const ordinary = (amounts, expected = '0.30', type = 5) => ({ id: 1, type, deleted: false, deprecated: false,
  categories: amounts.map(amount => ({ categoryId: 10, amount })), links: [{ amount: expected, tracking: 'Transactions', scoped: true }], poolIds: [99] })
const configFor = target => ({ host: target.database.host, port: target.database.port, database: target.database.name, user: target.database.user })
const liveFor = target => ({ database: target.database.name, username: target.database.user, port: target.database.port,
  server: '127.0.0.1/32', peer: '::ffff:127.0.0.1/128', oid: '16384', system_identifier: '123456' })

function fixture(target = targetFor()) {
  const original = '[{"categoryId":10,"amount":0.30000000000000004,"meta":9007199254740993}]'
  const converted = original.replace('0.30000000000000004', '"0.30"')
  let state = { categories: original, hash: 'original', version: '100' }, saved
  const calls = []
  const client = {
    connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5432 } },
    async query(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.startsWith('BEGIN')) { saved = { ...state }; return { rows: [] } }
      if (sql === 'ROLLBACK') { state = saved; return { rows: [] } }
      if (sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FROM pg_class')) return { rows: [{ kind: 'jsonb', rls: false, triggers: false, rules: false }] }
      if (sql.includes('inet_server_addr()')) return { rows: [liveFor(target)] }
      if (sql.includes("current_setting('transaction_read_only')")) return { rows: [{ read_only: client.readOnly ? 'on' : 'off', isolation: 'repeatable read' }] }
      if (sql.includes('pg_current_xact_id')) return { rows: [{ xid: '123' }] }
      if (sql === SCAN_SQL) return { rows: parameters[0] !== '0' ? [] : [{ id: 1, application_id: 12, type: 5, deleted: false, deprecated: false,
        categories_text: state.categories, links_text: JSON.stringify(ordinary([]).links), pool_ids: '[99]',
        row_version: state.version, row_hash: state.hash, metadata_hash: 'metadata' }] }
      if (sql.startsWith('SELECT (jsonb_set')) return { rows: [{ categories: converted, row_hash: 'converted' }] }
      if (sql.startsWith('UPDATE') && sql.includes('SET categories=jsonb_set')) {
        if (state.version !== '100' || state.hash !== 'original') return { rows: [] }
        state = { categories: converted, hash: 'converted', version: '123' }
        return { rows: [{ categories: converted, row_hash: 'converted', metadata_hash: 'metadata', version: '123' }] }
      }
      if (sql.startsWith('UPDATE')) {
        if (state.version !== '123' || state.hash !== 'converted') return { rows: [] }
        state = { categories: parameters[0], hash: 'original', version: '456' }
        return { rows: [{ id: 1 }] }
      }
      if (sql.startsWith('SELECT')) return { rows: [{ categories: state.categories, row_hash: state.hash, version: state.version }] }
      throw new Error('unexpected_mock_query')
    },
  }
  return { client, calls, target, original, converted, state: () => state,
    change: () => { state = { ...state, hash: 'later-change', version: '500' } },
    equalValueSave: () => { state = { ...state, version: '500' } } }
}
async function withFixture(work, override) {
  const output = await mkdtemp(join(tmpdir(), 'category-conversion-test-'))
  try {
    const f = fixture(override)
    let guards = 0
    const context = { maintenance: { maintenanceId: 'synthetic-window', writersStopped: true }, target: f.target, config: configFor(f.target), output, readOnly: false,
      guard: async () => { guards++ } }
    await work({ ...f, context, guards: () => guards })
  } finally { await rm(output, { recursive: true, force: true }) }
}

test.group('Historical Category conversion — pure policy and isolation', () => {
  test('approved numeric conversion').with([
    [12.345, '12.35'], [-1.005, '-1.00'], [0.005, '0.01'], [-0.005, '0.00'],
    [0.1 + 0.2, '0.30'], [-79.49000000000001, '-79.49'], [0, '0.00'], [-0, '0.00'],
    [12.34, '12.34'], ['12.34', '12.34'], ['0.00', '0.00'], ['-12.34', '-12.34'],
  ]).run(({ assert }, [input, expected]) => { assert.equal(convertedAmount(input).stored, expected) })
  test('reject malformed/unsafe inputs').with([undefined, null, true, {}, [], NaN, Infinity, -Infinity, '', '1', '1.000',
    '01.00', '+1.00', '1e0', ' 1.00', '-0.00', '9007199254740992.00', Number.MAX_SAFE_INTEGER,
  ]).run(({ assert }, value) => { assert.throws(() => convertedAmount(value)) })
  test('accept only exact loopback hosts and full-width CIDR').with([
    ['127.0.0.1', '127.0.0.1'], ['127.0.0.1/32', '127.0.0.1'], ['::1', '::1'], ['::1/128', '::1'],
    ['0:0:0:0:0:0:0:1/128', '::1'], ['::ffff:127.0.0.1/128', '127.0.0.1'], ['::ffff:7f00:1/128', '127.0.0.1'],
    ['0:0:0:0:0:ffff:7f00:1/128', '127.0.0.1'],
  ]).run(({ assert }, [input, output]) => { assert.equal(loopback(input), output) })
  test('reject networks, malformed addresses and remote hosts').with(['127.0.0.1/24', '::1/64', '127.0.0.2', '10.0.0.1',
    'localhost', '127.0.0.1/32/32', '127.0.0.1/', '::ffff:10.0.0.1', '::1%lo', '::1/0128', undefined,
  ]).run(({ assert }, input) => { assert.throws(() => loopback(input)) })
  test('numeric/string/mixed decoding preserves duplicates and metadata', ({ assert }) => {
    const row = ordinary([0.1, '0.20']); row.categories[0].meta = { order: [2, 1] }
    const before = JSON.stringify(row)
    const result = classify(row)
    assert.equal(result.kind, 'mixed'); assert.lengthOf(result.patches, 1)
    assert.equal(result.finding.categorySumCents, 30); assert.equal(JSON.stringify(row), before)
  })
  test('all ordinary and opening lifecycles use nominal conservation').with([0, 4, 5]).run(({ assert }, type) => {
    const row = ordinary([0.1, 0.2], '0.30', type); row.links[0].pending = true
    assert.equal(classify(row).finding.status, 'pass')
  })
  test('funding signed Pool rule and duplicate rebalance', ({ assert }) => {
    const row = { ...ordinary([]), type: 2, links: [], categories: [{ categoryId: 10, amount: 0.3 }, { categoryId: 99, amount: '-0.30' }] }
    assert.equal(classify(row).finding.status, 'pass')
    assert.throws(() => classify({ ...row, categories: row.categories.slice(0, 1) }))
    assert.equal(classify({ ...row, type: 3, categories: [{ categoryId: 10, amount: 0.3 }, { categoryId: 10, amount: -0.3 }] }).finding.status, 'pass')
  })
  test('per-operand rounding cannot be replaced with round-after-sum', ({ assert }) => {
    assert.equal(classify(ordinary([0.005, 0.005], '0.02')).total, 2)
    assert.throws(() => classify(ordinary([0.005, 0.005], '0.01')))
  })
  test('checked accumulation rejects overflow before cancellation', ({ assert }) => {
    assert.throws(() => classify(ordinary([45035996273704.95, 45035996273704.95, 1, -1])))
  })
  test('deleted empty ordinary exceptions depend on state, not ID').with([1, 37, 3974, 999999]).run(({ assert }, id) => {
    const row = { ...ordinary([], '1.00'), id, deleted: true }
    assert.isTrue(classify(row).exception); assert.isEmpty(classify(row).patches)
    assert.throws(() => classify({ ...row, deleted: false }))
  })
  test('deleted empty funding stays empty regardless of ID').with([1, 148, 2578, 999999]).run(({ assert }, id) => {
    assert.isTrue(classify({ ...ordinary([]), id, type: 2, deleted: true, links: [] }).exception)
    assert.isTrue(classify({ ...ordinary([]), id, type: 2, deleted: true }).exception)
    assert.throws(() => classify({ ...ordinary([]), id, type: 2, deleted: false, links: [] }))
  })
  test('nine-cent funding discrepancies are not repaired').with([4596, 4597]).run(({ assert }, id) => {
    const row = { ...ordinary([]), id, type: 2, deleted: true, links: [], categories: [{ categoryId: 10, amount: 1.09 }, { categoryId: 99, amount: -1 }] }
    const result = classify(row)
    assert.isTrue(result.exception); assert.equal(result.finding.differenceCents, 9)
    assert.deepEqual(result.patches.map(patch => patch.stored), ['1.09', '-1.00'])
    assert.throws(() => classify({ ...row, deleted: false }))
  })
  test('unknown/invalid shapes fail closed; deprecated paths excluded', ({ assert }) => {
    for (const row of [ordinary([], '1.00'), { ...ordinary([0.3]), type: 9 }, { ...ordinary([0.3]), categories: null },
      { ...ordinary([0.3]), links: [] }, { ...ordinary([0.3]), links: [...ordinary([0.3]).links, ...ordinary([0.3]).links] }]) assert.throws(() => classify(row))
    assert.isTrue(classify({ deprecated: true }).excluded)
  })
  test('defaults to .env and dry-run; execution is explicit and no plan is accepted', ({ assert }) => {
    const defaults = argumentsFor([])
    assert.equal(defaults['env'], '.env'); assert.isTrue(defaults['dry-run'])
    for (const args of [['--plan', 'p'], ['--force'], ['--execute', '--dry-run'], ['--recover']]) assert.throws(() => argumentsFor(args))
    assert.isFalse(argumentsFor(['--execute'])['dry-run'])
    const t = targetFor(); assert.throws(() => verifyConfigured({ ...configFor(t), port: 5433 }, t))
  })
  test('live database identity checks CIDR, remote socket and immutable cluster identity', async ({ assert }) => {
    const f = fixture(); await verifyDatabase(f.client, configFor(f.target), f.target)
    f.client.connection.stream.remoteAddress = '10.0.0.1'
    await assert.rejects(() => verifyDatabase(f.client, configFor(f.target), f.target))
    f.client.connection.stream.remoteAddress = '127.0.0.1'
    const wrong = { ...f.target, database: { ...f.target.database, systemIdentifier: '999' } }
    await assert.rejects(() => verifyDatabase(f.client, configFor(f.target), wrong))
  })
  test('leaf SQL changes only amount paths and binds values', ({ assert }) => {
    const sql = leafExpression([{ index: 2, stored: '12.34' }, { index: 4, stored: '-0.30' }])
    assert.deepEqual(sql.parameters, [['2', 'amount'], '12.34', ['4', 'amount'], '-0.30'])
    assert.notInclude(sql.expression, '12.34'); assert.notMatch(sql.expression, /updated_at|balance|FOR UPDATE|advisory/i)
  })
})

test.group('Historical Category conversion — mocked atomic execution/recovery', () => {
  test('dry-run does no writes, backup or mutation locks', async ({ assert }) => withFixture(async f => {
    f.context.readOnly = true; f.client.readOnly = true
    const result = await runConversion(f.client, f.context)
    assert.equal(result.candidates, 1); assert.equal(f.state().categories, f.original)
    assert.isFalse(f.calls.some(call => /^(?:UPDATE|INSERT|DELETE|CREATE)\b|FOR UPDATE|advisory|pg_current_xact_id/i.test(call.sql)))
    assert.notInclude(await readdir(f.context.output), 'snapshot.json'); assert.equal(f.guards(), 0)
  }))
  test('snapshot is durable before first mutation; exact originals and metadata preserved', async ({ assert }) => withFixture(async f => {
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, parameters) => {
      if (sql.startsWith('UPDATE')) {
        const entry = JSON.parse((await readFile(join(f.context.output, 'original-categories.jsonl'), 'utf8')).trim())
        assert.equal(entry.original, f.original); assert.include(entry.original, '9007199254740993')
        assert.equal(entry.converted, f.converted)
        assert.isString(await readFile(join(f.context.output, 'snapshot.json'), 'utf8'))
      }
      return query(sql, parameters)
    }
    await runConversion(f.client, f.context)
    assert.equal(f.state().categories, f.converted); assert.equal(f.guards(), 3)
    assert.equal(f.calls.at(-1).sql, 'COMMIT'); assert.lengthOf(f.context.snapshotHash, 64)
  }))
  test('late verification failure rolls back all converted values', async ({ assert }) => withFixture(async f => {
    f.context.guard = async full => { if (full) throw new Error('injected_late_failure') }
    await assert.rejects(() => runConversion(f.client, f.context), 'injected_late_failure')
    assert.equal(f.state().categories, f.original); assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
  }))
  test('post-commit exact-original recovery and repeat recovery are idempotent', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    const path = join(f.context.output, 'snapshot.json'), pin = f.context.snapshotHash
    f.context.readOnly = true
    const preview = await runRecovery(f.client, f.context, path, pin)
    assert.equal(preview.restored, 0); assert.equal(f.state().categories, f.converted)
    f.context.readOnly = false
    assert.equal((await runRecovery(f.client, f.context, path, pin)).restored, 1)
    assert.equal(f.state().categories, f.original)
    assert.equal((await runRecovery(f.client, f.context, path, pin)).alreadyOriginal, 1)
  }))
  test('recovery refuses later Transaction edits and snapshot identity mismatch', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    const path = join(f.context.output, 'snapshot.json'), pin = f.context.snapshotHash
    await assert.rejects(() => runRecovery(f.client, f.context, path, '0'.repeat(64)), 'snapshot_identity_mismatch')
    f.change()
    await assert.rejects(() => runRecovery(f.client, f.context, path, pin), 'changed_row_recovery_refused')
    assert.equal(f.state().hash, 'later-change')
  }))
  test('wrong database target and tampered original payload fail before recovery updates', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    const path = join(f.context.output, 'snapshot.json'), pin = f.context.snapshotHash
    f.context.target = { database: { ...f.target.database, oid: '999' } }
    await assert.rejects(() => runRecovery(f.client, f.context, path, pin), 'snapshot_target_mismatch')
    f.context.target = f.target
    await writeFile(join(f.context.output, 'original-categories.jsonl'), '{}\n')
    await assert.rejects(() => runRecovery(f.client, f.context, path, pin), 'snapshot_target_mismatch')
  }))
  test('interruption rolls back; lost COMMIT acknowledgment is explicitly uncertain', async ({ assert }) => {
    const calls = [], client = { query: async sql => { calls.push(sql); if (sql === 'COMMIT') throw new Error('disconnected') } }
    await assert.rejects(() => atomic(client, false, async () => { throw new Error('interrupted') }), 'interrupted')
    assert.equal(calls.at(-1), 'ROLLBACK')
    await assert.rejects(() => atomic(client, false, async () => 'done'), 'commit_outcome_unknown_inspect_snapshot_before_retry')
    assert.equal(calls.at(-1), 'ROLLBACK')
  })
  test('same-value saves after conversion also prevent recovery', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    f.equalValueSave()
    await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), 'changed_row_recovery_refused')
    assert.equal(f.state().categories, f.converted)
  }))
  test('failed snapshot publication prevents the first UPDATE', async ({ assert }) => withFixture(async f => {
    f.context.onSnapshot = async () => { throw new Error('snapshot_publication_failure') }
    await assert.rejects(() => runConversion(f.client, f.context), 'snapshot_publication_failure')
    assert.isFalse(f.calls.some(call => call.sql.startsWith('UPDATE')))
    assert.equal(f.state().categories, f.original)
  }))
  test('late recovery failure rolls back restoration and never controls processes', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    f.context.guard = async full => { if (full) throw new Error('recovery_interrupted') }
    await assert.rejects(() => runRecovery(f.client, f.context, join(f.context.output, 'snapshot.json'), f.context.snapshotHash), 'recovery_interrupted')
    assert.equal(f.state().categories, f.converted)
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK')
  }))
  test('removed confirmation and writer-attestation switches are rejected before execution', ({ assert }) => {
    for (const args of [['--confirm', 'yes'], ['--writers-stopped'], ['--backup', 'old.dump']]) assert.throws(() => argumentsFor(args))
    assert.isTrue(argumentsFor(['--execute']).execute)
  })
  test('new nondeleted failure blocks all updates and reports conservation separately from malformed data', async ({ assert }) => withFixture(async f => {
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, parameters) => {
      const result = await query(sql, parameters)
      if (sql === SCAN_SQL) for (const row of result.rows) row.links_text = JSON.stringify(ordinary([], '0.31').links)
      return result
    }
    await assert.rejects(() => runConversion(f.client, f.context), 'preconditions_failed_inspect_transactions_jsonl')
    assert.isFalse(f.calls.some(call => call.sql.startsWith('UPDATE')))
    const result = JSON.parse(await readFile(join(f.context.output, 'preflight.json'), 'utf8'))
    assert.equal(result.blockingRecords, 1); assert.equal(result.fail, 1); assert.equal(result.malformed, 0)
    assert.equal(result.numericAmounts, 1); assert.isFalse(result.preconditionsPass)
    const detail = JSON.parse((await readFile(join(f.context.output, 'transactions.jsonl'), 'utf8')).trim())
    assert.equal(detail.reason, 'rounded_cent_conservation_mismatch'); assert.isFalse(detail.deleted)
    assert.equal(detail.categorySumCents, 30); assert.equal(detail.expectedCents, 31); assert.equal(detail.differenceCents, -1)
    assert.equal(detail.originalCategoryAmounts[0].value, 0.30000000000000004)
    assert.deepEqual(detail.roundedCategoryAmounts, ['0.30']); assert.deepEqual(detail.categoryCents, [30])
    assert.equal(detail.accountTransactionLinks[0].amount, '0.31')
  }))
  test('database identifiers are discovered and verified without a plan or release', async ({ assert }) => {
    for (const name of ['spendcraft_sandbox', 'spendcraft_staging', 'budget']) {
      const t = targetFor(name), f = fixture(t)
      const discovered = await discoverTarget(f.client, configFor(t))
      assert.deepEqual(discovered, t); assert.notProperty(discovered, 'release'); assert.notProperty(discovered, 'instanceId')
      await assert.rejects(() => discoverTarget(f.client, { ...configFor(t), database: 'foreign' }), 'live_database_identity_mismatch')
      assert.throws(() => verifyConnectionConfiguration({ ...configFor(t), host: 'remote.example' }), 'invalid_explicit_connection')
    }
  })
  test('sandbox conversion and pinned recovery retain database identity and exact original values', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    const snapshotFile = join(f.context.output, 'snapshot.json')
    const manifest = JSON.parse(await readFile(snapshotFile, 'utf8'))
    assert.equal(manifest.format, 2); assert.equal(manifest.target.database.name, 'spendcraft_sandbox')
    assert.notProperty(manifest, 'release'); assert.notProperty(manifest, 'environment')
    assert.equal((await runRecovery(f.client, f.context, snapshotFile, f.context.snapshotHash)).restored, 1)
    assert.equal(f.state().categories, f.original)
    f.context.target = targetFor('budget')
    await assert.rejects(() => runRecovery(f.client, f.context, snapshotFile, f.context.snapshotHash), 'snapshot_target_mismatch')
  }, targetFor('spendcraft_sandbox')))
  test('no conversion/recovery code depends on EC2, a release directory or a plan', async ({ assert }) => {
    const source = await readFile('scripts/convertHistoricalTransactionCategories.mjs', 'utf8')
    assert.notMatch(source, /169\.254\.169\.254|instanceDocument|verifyHost|globalThis\.fetch|releaseManifest|validatePlan/)
  })
  test('diagnostics preserve safe codes/phases without raw credentials or SQL data', ({ assert }) => {
    const secret = 'password=private-credential financial-detail'
    for (const [code, phase] of [['ENOENT', 'read_environment'], ['ECONNREFUSED', 'connect'], ['28P01', 'connect'], ['42501', 'verify_database']]) {
      const result = conversionDiagnostic(Object.assign(new Error(secret), { code, detail: secret }), phase)
      assert.equal(result.code, code); assert.equal(result.phase, phase)
      assert.notInclude(JSON.stringify(result), secret)
      assert.isString(result.hint)
    }
    assert.equal(conversionDiagnostic(new SyntaxError(secret), 'read_snapshot').code, 'INVALID_JSON')
    assert.equal(conversionDiagnostic(new Error(secret), 'connect').code, 'unclassified_error')
    assert.equal(conversionDiagnostic(Object.assign(new Error('pm2_manifest_process_not_stopped'), { processName: 'queue' }), 'verify_pm2_stopped').process, 'queue')
  })
  test('CLI explains missing .env without database work or misleading maintenance instructions', async ({ assert }) => withFixture(async f => {
    const result = spawnSync(process.execPath, ['scripts/convertHistoricalTransactionCategories.mjs', '--env', join(f.context.output, 'missing.env'),
      '--output-parent', f.context.output], { encoding: 'utf8' })
    assert.equal(result.status, 1); assert.include(result.stderr, 'Diagnostic:')
    assert.include(result.stderr, 'Dry-run failed; no conversion or recovery updates were requested.')
    assert.notInclude(result.stderr, 'Keep writers fenced')
    const failure = JSON.parse(await readFile(join(result.stdout.trim(), 'failure.json'), 'utf8'))
    assert.equal(failure.phase, 'read_environment'); assert.equal(failure.code, 'ENOENT'); assert.isString(failure.hint)
  }))
  test('discovery rejects wrong user/port and unavailable internal identity', async ({ assert }) => {
    const f = fixture(), config = configFor(f.target)
    for (const changed of [{ user: 'foreign' }, { port: 5433 }]) {
      await assert.rejects(() => discoverTarget(f.client, { ...config, ...changed }), 'live_database_identity_mismatch')
    }
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, values) => {
      const result = await query(sql, values)
      if (sql.includes('inet_server_addr()')) result.rows[0].system_identifier = null
      return result
    }
    await assert.rejects(() => discoverTarget(f.client, config), 'database_identity_unavailable')
  })
  test('rejected records retain subtype reasons, deleted status and computed cents').with([
    { id: 342, type: 2, deleted: false, categories: [{ categoryId: 10, amount: 1.09 }, { categoryId: 99, amount: -1 }],
      links: [], reason: 'rounded_cent_conservation_mismatch', sum: 9, pool: -100, nonPool: 109, difference: 9 },
    { id: 148, type: 2, deleted: false, categories: [], links: [],
      reason: 'empty_funding_or_rebalance_not_supported_by_endpoint', sum: 0, pool: null, nonPool: null, difference: null },
    { id: 596, type: 4, deleted: false, categories: [{ categoryId: 10, amount: 0.3 }], links: [],
      reason: 'ordinary_link_count_not_one', sum: 30, pool: null, nonPool: null, difference: null },
    { id: 7, type: 2, deleted: false, categories: [{ categoryId: 10, amount: 0.3 }], links: [],
      reason: 'missing_pool_allocation', sum: 30, pool: null, nonPool: null, difference: null },
    { id: 8, type: 3, deleted: false, categories: [{ categoryId: 10, amount: 0.3 }, { categoryId: 10, amount: -0.2 }], links: [],
      reason: 'rounded_cent_conservation_mismatch', sum: 10, pool: null, nonPool: null, difference: 10 },
    { id: 9, type: 5, deleted: true, categories: [{ categoryId: 10, amount: 'bad' }], links: [],
      reason: 'noncanonical_amount', sum: null, pool: null, nonPool: null, difference: null },
  ]).run(async ({ assert }, example) => withFixture(async f => {
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, parameters) => {
      const result = await query(sql, parameters)
      if (sql === SCAN_SQL) for (const row of result.rows) {
        Object.assign(row, { id: example.id, type: example.type, deleted: example.deleted,
          categories_text: JSON.stringify(example.categories), links_text: JSON.stringify(example.links) })
      }
      return result
    }
    await assert.rejects(() => runConversion(f.client, f.context), 'preconditions_failed_inspect_transactions_jsonl')
    const detail = JSON.parse((await readFile(join(f.context.output, 'transactions.jsonl'), 'utf8')).trim())
    assert.equal(detail.reason, example.reason); assert.equal(detail.deleted, example.deleted)
    assert.equal(detail.categorySumCents, example.sum); assert.equal(detail.poolAllocationCents, example.pool)
    assert.equal(detail.nonPoolSumCents, example.nonPool); assert.equal(detail.differenceCents, example.difference)
    assert.deepEqual(detail.accountTransactionLinks, example.links); assert.deepEqual(detail.poolCategoryIds, [99])
    if (example.type === 3) assert.equal(detail.signedRemainderCents, 10)
    if (example.type === 4) assert.isNull(detail.expectedCents)
    if (example.id === 342) {
      assert.equal(detail.expectedCents, 100)
      assert.deepEqual(detail.categoryCents, [109, -100])
      assert.deepEqual(detail.roundedCategoryAmounts, ['1.09', '-1.00'])
    }
    assert.isFalse(f.calls.some(call => call.sql.startsWith('UPDATE')))
  }))
  test('any balance-tracked link excludes the whole Transaction before allocation validation').with([0, 2, 3, 4, 5]).run(({ assert }, type) => {
    const row = { ...ordinary([0.3], '0.30', type), categories: { unsupported: true } }
    row.links.push({ tracking: 'Balances', scoped: true, amount: '0.30' })
    const before = JSON.stringify(row)
    const result = classify(row)
    assert.isTrue(result.excluded); assert.equal(result.kind, 'balanceTracked'); assert.isEmpty(result.patches)
    assert.equal(JSON.stringify(row), before)
  })
  test('balance-tracked Transactions are reported separately and never snapshotted or updated').with([true, false]).run(async ({ assert }, readOnly) => withFixture(async f => {
    f.context.readOnly = readOnly; f.client.readOnly = readOnly
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, values) => {
      const result = await query(sql, values)
      if (sql === SCAN_SQL) for (const row of result.rows) {
        row.type = 4; row.links_text = JSON.stringify([{ amount: '0.30', tracking: 'Balances', scoped: true }])
      }
      return result
    }
    const summary = await runConversion(f.client, f.context)
    assert.equal(summary.balanceTracked, 1); assert.equal(summary.blockingRecords, 0)
    assert.equal(summary.candidates, 0); assert.equal(summary.numericAmounts, 0); assert.isTrue(summary.preconditionsPass)
    assert.equal(summary.byType[4].skipped, 1); assert.equal(summary.byType[4].transactions, 1)
    assert.isFalse(f.calls.some(call => call.sql.startsWith('UPDATE')))
    assert.equal(f.state().categories, f.original)
    const detail = JSON.parse((await readFile(join(f.context.output, 'transactions.jsonl'), 'utf8')).trim())
    assert.equal(detail.status, 'skipped'); assert.equal(detail.reason, 'linked_balance_tracked_account')
    if (!readOnly) assert.equal(await readFile(join(f.context.output, 'original-categories.jsonl'), 'utf8'), '')
  }))
  test('deleted conservation discrepancies of any size/type are preserved without an ID list').with([
    { ...ordinary([0.3], '0.31'), id: 12345, deleted: true },
    { ...ordinary([0.3], '0.31', 4), id: 12346, deleted: true },
    { ...ordinary([0.3], '0.31', 3), id: 12347, deleted: true, links: [] },
    { ...ordinary([], '0.00', 2), id: 12348, deleted: true, links: [],
      categories: [{ categoryId: 10, amount: 1.09 }, { categoryId: 99, amount: -1.1 }] },
  ]).run(({ assert }, row) => {
    const before = JSON.stringify(row), result = classify(row)
    assert.isTrue(result.exception); assert.equal(result.finding.status, 'fail')
    assert.equal(JSON.stringify(row), before)
    assert.throws(() => classify({ ...row, deleted: false }))
  })
  test('deleted state never bypasses invalid amounts, types, Category IDs or overflow', ({ assert }) => {
    for (const row of [ordinary([NaN]), ordinary([Number.MAX_SAFE_INTEGER]), ordinary(['bad']), ordinary([0.3], 'bad'),
      { ...ordinary([0.3]), type: 9 }, { ...ordinary([0.3]), categories: null },
      { ...ordinary([0.3]), categories: [{ categoryId: 0, amount: 0.3 }] },
      ordinary([45035996273704.95, 45035996273704.95, 1])]) {
      assert.throws(() => classify({ ...row, deleted: true }))
    }
    const valid = { ...ordinary([0.3]), deleted: true }
    assert.isFalse(classify(valid).exception)
  })
  test('arbitrary deleted funding mismatch converts without repair and recovery restores its exact JSON', async ({ assert }) => withFixture(async f => {
    const query = f.client.query.bind(f.client)
    f.client.query = async (sql, values) => {
      const result = await query(sql, values)
      if (sql === SCAN_SQL) for (const row of result.rows) {
        row.type = 2; row.deleted = true; row.links_text = '[]'
      }
      return result
    }
    const summary = await runConversion(f.client, f.context)
    assert.equal(summary.exceptions, 1); assert.equal(summary.unsupported, 1)
    assert.equal(summary.blockingRecords, 0); assert.equal(summary.candidates, 1); assert.isTrue(summary.preconditionsPass)
    const detail = JSON.parse((await readFile(join(f.context.output, 'transactions.jsonl'), 'utf8')).trim())
    assert.isTrue(detail.deleted); assert.isTrue(detail.exception); assert.equal(detail.reason, 'missing_pool_allocation')
    assert.equal(detail.categorySumCents, 30); assert.deepEqual(detail.roundedCategoryAmounts, ['0.30'])
    assert.equal(f.state().categories, f.converted)
    const manifestFile = join(f.context.output, 'snapshot.json')
    assert.equal((await runRecovery(f.client, f.context, manifestFile, f.context.snapshotHash)).restored, 1)
    assert.equal(f.state().categories, f.original)
  }))
  test('snapshot SHA protects the actual bytes, not reserialized JSON', ({ assert }) => {
    assert.notEqual(sha256('{"a":1}'), sha256('{ "a":1 }'))
  })
})
