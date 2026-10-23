import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { test } from '@japa/runner'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256, MAINTENANCE, loopback, validatePlan, verifyHost, verifyConfigured, verifyDatabase,
  classify, convertedAmount, leafExpression, exactConfirmation, atomic, SCAN_SQL } from '../../scripts/lib/historicalCategoryConversion.mjs'
import { argumentsFor, operationalPreflight, runConversion, runRecovery } from '../../scripts/convertHistoricalTransactionCategories.mjs'

function plan() {
  const target = (name, instance, ip) => ({ instanceId: instance, region: 'us-west-2', accountId: '123456789012', privateIp: ip,
    root: `/srv/${name}`, envFile: `/srv/${name}/.env`, release: 'a'.repeat(64), database: { host: 'localhost', port: 5432,
      name, user: name, server: '127.0.0.1', peer: '127.0.0.1', systemIdentifier: '123456', oid: '16384' } })
  return { format: 1, environment: 'staging', targets: { staging: target('spendcraft_staging', 'i-12345678', '10.0.0.1'),
    production: target('spendcraft', 'i-87654321', '10.0.0.2') } }
}
const ordinary = (amounts, expected = '0.30', type = 5) => ({ id: 1, type, deleted: false, deprecated: false,
  categories: amounts.map(amount => ({ categoryId: 10, amount })), links: [{ amount: expected, tracking: 'Transactions', scoped: true }], poolIds: [99] })
const configFor = target => ({ host: target.database.host, port: target.database.port, database: target.database.name, user: target.database.user })
const liveFor = target => ({ database: target.database.name, username: target.database.user, port: target.database.port,
  server: '127.0.0.1/32', peer: '::ffff:127.0.0.1/128', oid: '16384', system_identifier: '123456' })

function fixture() {
  const p = plan(), target = validatePlan(p)
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
  return { client, calls, p, target, original, converted, state: () => state,
    change: () => { state = { ...state, hash: 'later-change', version: '500' } },
    equalValueSave: () => { state = { ...state, version: '500' } } }
}
async function withFixture(work) {
  const output = await mkdtemp(join(tmpdir(), 'category-conversion-test-'))
  try {
    const f = fixture()
    let guards = 0
    const context = { plan: f.p, target: f.target, config: configFor(f.target), output, readOnly: false,
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
  test('known deleted empty ordinary exceptions stay empty').with([3974, 3975, 3977, 4116, 4262, 4412, 4413, 4415]).run(({ assert }, id) => {
    const row = { ...ordinary([], '1.00'), id, deleted: true }
    assert.isTrue(classify(row).exception); assert.isEmpty(classify(row).patches)
    assert.throws(() => classify({ ...row, deleted: false }))
  })
  test('known deleted empty funding stays empty').with([2578, 3077, 3388]).run(({ assert }, id) => {
    assert.isTrue(classify({ ...ordinary([]), id, type: 2, deleted: true, links: [] }).exception)
    assert.throws(() => classify({ ...ordinary([]), id, type: 2, deleted: true }))
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
  test('no default target, generic force, implicit execute or ambiguous modes', ({ assert }) => {
    for (const args of [[], ['--plan', 'p'], ['--execute'], ['--plan', 'p', '--execute', '--dry-run'], ['--force'],
      ['--plan', 'p', '--dry-run', '--recover']]) assert.throws(() => argumentsFor(args))
    assert.isTrue(argumentsFor(['--plan', 'p', '--dry-run'])['dry-run'])
    const p = plan(); assert.include(exactConfirmation('CONVERT', p), 'spendcraft_staging i-12345678')
    assert.notEqual(exactConfirmation('CONVERT', p), 'yes')
  })
  test('explicit plan prevents shared host, root, database and missing identities', ({ assert }) => {
    for (const key of ['instanceId', 'privateIp', 'root']) { const p = plan(); p.targets.staging[key] = p.targets.production[key]; assert.throws(() => validatePlan(p)) }
    const p = plan(); p.targets.staging.database.name = p.targets.production.database.name; assert.throws(() => validatePlan(p))
    assert.throws(() => validatePlan({ ...plan(), environment: undefined }))
    assert.throws(() => verifyHost({ instanceId: 'i-99999999' }, validatePlan(plan())))
    const t = validatePlan(plan()); assert.throws(() => verifyConfigured({ ...configFor(t), port: 5433 }, t))
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
  test('wrong release/target and tampered original payload fail before recovery updates', async ({ assert }) => withFixture(async f => {
    await runConversion(f.client, f.context)
    const path = join(f.context.output, 'snapshot.json'), pin = f.context.snapshotHash
    f.context.target = { ...f.target, release: 'b'.repeat(64) }
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
  test('CLI rejects generic execution confirmation before reading environment or connecting', async ({ assert }) => withFixture(async f => {
    const path = join(f.context.output, 'plan.json')
    await writeFile(path, JSON.stringify(f.p))
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, ['scripts/convertHistoricalTransactionCategories.mjs', '--plan', path,
        '--execute', '--confirm', 'yes', '--output-parent', f.context.output], { encoding: 'utf8' })
      assert.equal(result.status, 1)
      const directory = result.stdout.trim()
      assert.isTrue(directory.startsWith(f.context.output))
      const failure = JSON.parse(await readFile(join(directory, 'failure.json'), 'utf8'))
      assert.equal(failure.code, 'exact_target_confirmation_required')
    }
    assert.equal((await readdir(f.context.output)).filter(name => name.startsWith('category-conversion-')).length, 2)
  }))
  test('execution requires a fresh pinned readable backup for the same database and a writer fence', async ({ assert }) => withFixture(async f => {
    const file = join(f.context.output, 'backup.dump')
    await writeFile(file, 'synthetic archive bytes')
    const p = { ...f.p, maintenanceStatement: MAINTENANCE, maintenanceId: 'synthetic-maintenance-1', writers: [{ name: 'web', stopped: true }],
      backup: { file, sha256: sha256('synthetic archive bytes'), database: f.target.database.name,
        verifiedAt: new Date().toISOString(), recoveryProcedure: 'Synthetic restore rehearsal passed; recovery procedure reviewed for this isolated staging target.' } }
    const listing = async () => ';     dbname: ' + f.target.database.name
    await operationalPreflight(p, f.target, listing)
    await assert.rejects(() => operationalPreflight({ ...p, writers: [{ name: 'web', stopped: false }] }, f.target, listing), 'writer_fence_attestation_required')
    await assert.rejects(() => operationalPreflight({ ...p, backup: { ...p.backup, sha256: '0'.repeat(64) } }, f.target, listing), 'verified_fresh_backup_required')
    await assert.rejects(() => operationalPreflight({ ...p, backup: { ...p.backup, verifiedAt: '2000-01-01' } }, f.target, listing), 'verified_fresh_backup_required')
    await assert.rejects(() => operationalPreflight(p, f.target, async () => '; dbname: foreign'), 'backup_database_mismatch')
  }))
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
  }))
  test('snapshot SHA protects the actual bytes, not reserialized JSON', ({ assert }) => {
    assert.notEqual(sha256('{"a":1}'), sha256('{ "a":1 }'))
  })
})
