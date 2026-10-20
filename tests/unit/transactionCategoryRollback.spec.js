import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  numericAmount, planAllocations, patchQuery, scan, convert, orchestrate, swapDirectories, WARNING,
} from '../../scripts/lib/categoryRollback.mjs'
import {
  releaseManifest, releaseDifferences, validatePlan, connectionConfig, verifyIdentity,
  selectProcesses, assertNoExtraProcesses, writerProcesses, verifyReleases, verifyApplicationConnections, assertConfirmation,
  persistStoppedState, verifyPm2Runtime, main,
} from '../../scripts/rollbackTransactionCategoryStorage.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const expected = { host: 'localhost', port: 5433, database: 'budget', user: 'operator',
  serverAddress: '127.0.0.1', clientAddress: '127.0.0.1' }
function plan() {
  return { environment: 'production', root: '/production/server', productionRoot: '/production/server',
    pm2Executable: '/reviewed/pm2/bin/pm2', pm2Home: '/operator/.pm2', productionPm2Home: '/operator/.pm2',
    envFile: '/production/server/spendcraft-env', expected: { ...expected },
    currentManifest: '/review/current.json', previousManifest: '/review/previous.json',
    databaseConfigSha256: 'a'.repeat(64), reviewedDifferencesSha256: 'b'.repeat(64),
    maintenanceStatement: 'All external writers, schedulers and traffic are fenced for this operation',
    recoveryProcedure: 'An independently reviewed recovery procedure with a restore rehearsal is available.',
    smokeUrl: 'https://spendcraft.app/', processes: ['prod-server', 'queue', 'plaid-cleanup'].map((name) => ({
      name, script: `/production/server/${name}.js`, cwd: '/production/server', interpreter: 'node',
      args: [], scriptSha256: 'c'.repeat(64),
    })) }
}
function identityClient(override = {}, streamOverride = {}) {
  return { connection: { stream: { remoteAddress: '127.0.0.1', remotePort: 5433, ...streamOverride } },
    async query() { return { rows: [{ database: 'budget', username: 'operator', port: 5433,
      server: '127.0.0.1', peer: '127.0.0.1', pid: 123, ...override }] } } }
}

// Inert PostgreSQL substitute: SQL is observed, no driver is imported and no sockets are opened.
function database(options = {}) {
  let rows = options.rows ?? [{ id: '1', type: 5, links: 1, own_links: 1, categories_text:
    JSON.stringify([{ categoryId: 10, amount: '12.34', comment: 'keep', extra: { flags: [1, 2] } }]) }]
  let saved
  let fetched = false
  let cursor = []
  let balance = 900
  let updates = 0
  const calls = []
  return {
    calls, get rows() { return rows },
    async query(sql, values) {
      calls.push(sql)
      if (sql.startsWith('BEGIN')) { saved = globalThis.structuredClone(rows); return { rows: [] } }
      if (sql === 'ROLLBACK') { rows = saved; balance = 900; return { rows: [] } }
      if (sql === 'COMMIT') {
        if (options.commitFailure) throw new Error('lost_commit_response')
        return { rows: [] }
      }
      if (sql.includes('a.atttypid')) return { rows: [{ kind: 'jsonb', rls: false, triggers: false, rules: false }] }
      if (sql.includes('FROM public.transactions t WHERE')) return { rows: rows.filter((row) => values[0] === null || BigInt(row.id) > BigInt(values[0])) }
      if (sql.includes('pg_catalog.pg_tables')) return { rows: [{ tablename: 'accounts' }, { tablename: 'transactions' }] }
      if (sql.startsWith('DECLARE')) {
        fetched = false
        cursor = sql.includes('public."accounts"') ? [{ document: JSON.stringify({ balance }) }]
          : rows.map((row) => ({ document: JSON.stringify({ id: row.id, categories: JSON.parse(row.categories_text).map((entry) => {
            const copy = { ...entry }; delete copy.amount; return copy
          }) }) }))
        return { rows: [] }
      }
      if (sql.startsWith('FETCH')) { const page = fetched ? [] : cursor; fetched = true; return { rows: page } }
      if (sql.startsWith('UPDATE')) {
        updates++
        if (options.updateFailure || updates === options.failAtUpdate) throw new Error('update_failed')
        const row = rows.find((entry) => entry.id === values[0])
        const categories = JSON.parse(row.categories_text)
        for (const patch of JSON.parse(values[2])) categories[patch.index].amount = patch.value
        row.categories_text = JSON.stringify(categories)
        if (options.balanceMutation) balance++
        return { rowCount: 1, rows: [{ verified: !options.verificationFailure }] }
      }
      return { rows: [] }
    },
  }
}

test.group('Release rollback monetary reversal (no database)', () => {
  test('canonical strings preserve cents without rerounding').with([
    ['12.34', 12.34], ['-12.34', -12.34], ['0.30', 0.3], ['0.00', 0], ['-0.00', 0],
    ['1.01', 1.01], ['-1.00', -1], ['9999999999.99', 9999999999.99],
  ]).run(({ assert }, [input, output]) => {
    assert.equal(numericAmount(input), output)
    assert.isFalse(Object.is(numericAmount(input), -0))
  })
  test('malformed or unsafe values fail closed').with([
    '1.005', '-1.005', '01.00', '+1.00', '1', '1.0', '1e2', ' 1.00', '', 'NaN', 'Infinity',
    '90071992547409.92', '90071992547409.91', null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY,
  ]).run(({ assert }, value) => assert.throws(() => numericAmount(value)))
  test('legacy numeric amounts are not rounded, including binary artifacts', ({ assert }) => {
    for (const value of [1.005, -1.005, 0.30000000000000004, -0]) assert.isTrue(Object.is(numericAmount(value), value))
  })
  test('mixed duplicate allocations retain positions and metadata', ({ assert }) => {
    const categories = [{ categoryId: 1, amount: '20.00', note: 'first' },
      { categoryId: 1, amount: 20, note: 'second' }, { categoryId: 2, amount: '-0.00' }]
    const original = globalThis.structuredClone(categories)
    assert.deepEqual(planAllocations(categories), { numeric: 1, patches: [{ index: 0, value: 20 }, { index: 2, value: 0 }] })
    assert.deepEqual(categories, original)
  })
  test('empty historical allocations remain empty', ({ assert }) => {
    assert.deepEqual(planAllocations([]), { numeric: 0, patches: [] })
  })
  test('missing amounts and malformed category shapes reject').with([
    null, {}, [{ categoryId: 1 }], [null], [{ categoryId: 0, amount: '1.00' }],
  ]).run(({ assert }, categories) => assert.throws(() => planAllocations(categories)))
  test('SQL leaf patches retain original raw metadata and never round', ({ assert }) => {
    const original = '[{"categoryId":10,"amount":"12.34","unknown":12345678901234567890.123456789}]'
    const query = patchQuery({ id: '1', original, patches: [{ index: 0, value: 12.34 }] })
    assert.equal(query.values[1], original)
    assert.include(query.text, "jsonb_set(e.value, '{amount}'")
    assert.include(query.text, 'ORDER BY e.ordinality')
    assert.notInclude(query.text.toLowerCase(), 'round(')
    assert.notInclude(query.text, 'version=')
    assert.throws(() => patchQuery({ id: '1', original, patches: [{ index: 0, value: 1 }, { index: 0, value: 2 }] }))
  })
})

test.group('Release rollback atomic database protocol (inert adapter)', () => {
  test('ordinary, funding, rebalance and opening are included without conservation').with([0, 2, 3, 4, 5])
    .run(async ({ assert }, type) => {
      const client = database({ rows: [{ id: '1', type, links: [2, 3].includes(type) ? 0 : 1,
        own_links: [2, 3].includes(type) ? 0 : 1, categories_text: '[{"categoryId":10,"amount":"0.09"}]' }] })
      const phases = []
      const result = await convert(client, { guard: async () => undefined, journal: async (phase) => phases.push(phase) })
      assert.equal(result.after.strings, 0)
      assert.equal(JSON.parse(client.rows[0].categories_text)[0].amount, 0.09)
      assert.deepEqual(phases, ['commit-pending', 'converted'])
    })
  test('historical empty/deleted mismatches have no conservation gate', async ({ assert }) => {
    const client = database({ rows: [
      { id: '3974', type: 0, links: 1, own_links: 1, deleted: true, categories_text: '[]' },
      { id: '4596', type: 2, links: 0, own_links: 0, deleted: true,
        categories_text: '[{"categoryId":1,"amount":"-1.00"},{"categoryId":2,"amount":"1.09"}]' },
      { id: '4597', type: 2, links: 0, own_links: 0, deleted: true, categories_text: '[]' },
    ] })
    const result = await convert(client, { guard: async () => undefined, journal: async () => undefined })
    assert.equal(result.after.examined, 3)
    assert.equal(client.rows[0].categories_text, '[]')
    assert.isTrue(client.rows[1].deleted)
    assert.deepEqual(JSON.parse(client.rows[1].categories_text).map((entry) => entry.amount), [-1, 1.09])
  })
  test('conversion is idempotent and guards every UPDATE plus COMMIT', async ({ assert }) => {
    const client = database()
    let guards = 0
    const controls = { guard: async () => { guards++ }, journal: async () => undefined }
    await convert(client, controls)
    const after = client.rows[0].categories_text
    assert.equal(guards, 3)
    const updates = client.calls.filter((sql) => sql.startsWith('UPDATE')).length
    await convert(client, controls)
    assert.equal(client.rows[0].categories_text, after)
    assert.equal(client.calls.filter((sql) => sql.startsWith('UPDATE')).length, updates)
  })
  test('update, verification and unrelated-state failure all roll back').with([
    { updateFailure: true }, { verificationFailure: true }, { balanceMutation: true },
  ]).run(async ({ assert }, fault) => {
    const client = database(fault)
    const before = client.rows[0].categories_text
    await assert.rejects(() => convert(client, { guard: async () => undefined, journal: async () => undefined }))
    assert.equal(client.rows[0].categories_text, before)
    assert.include(client.calls, 'ROLLBACK')
    assert.notInclude(client.calls, 'COMMIT')
  })
  test('lost COMMIT response is uncertain, never falsely recorded as rollback', async ({ assert }) => {
    const client = database({ commitFailure: true })
    const phases = []
    await assert.rejects(() => convert(client, { guard: async () => undefined, journal: async (phase) => phases.push(phase) }))
    assert.deepEqual(phases, ['commit-pending', 'commit-uncertain-or-postcommit-failure'])
    assert.notInclude(client.calls, 'ROLLBACK')
  })
  test('interruption on a later Transaction rolls back earlier converted rows', async ({ assert }) => {
    const rows = [1, 2].map((id) => ({ id: String(id), type: 5, links: 1, own_links: 1,
      categories_text: '[{"categoryId":1,"amount":"12.34"}]' }))
    const client = database({ rows, failAtUpdate: 2 })
    await assert.rejects(() => convert(client, { guard: async () => undefined, journal: async () => undefined }), 'update_failed')
    assert.isTrue(client.rows.every((row) => JSON.parse(row.categories_text)[0].amount === '12.34'))
    assert.equal(client.calls.filter((sql) => sql.startsWith('UPDATE')).length, 2)
    assert.notInclude(client.calls, 'COMMIT')
  })
  test('malformed preflight rejects before any UPDATE', async ({ assert }) => {
    const client = database({ rows: [{ id: '1', type: 0, links: 1, own_links: 1,
      categories_text: '[{"categoryId":1,"amount":"bad"}]' }] })
    await assert.rejects(() => convert(client, { guard: async () => undefined, journal: async () => undefined }))
    assert.isFalse(client.calls.some((sql) => sql.startsWith('UPDATE')))
  })
  test('ambiguous links fail closed; deprecated and other types remain excluded', async ({ assert }) => {
    const result = await scan(database({ rows: [
      { id: '1', type: 0, links: 2, own_links: 2, categories_text: '[]' },
      { id: '2', type: 0, links: 1, own_links: 1, deprecated: true, categories_text: '[]' },
      { id: '3', type: 1, links: 0, own_links: 0, categories_text: '[]' },
    ] }))
    assert.equal(result.unsupported, 1)
    assert.equal(result.excluded, 2)
  })
})

test.group('Rollback orchestration and identity (mocked destructive operations)', () => {
  function operations(failure, calls) {
    return Object.fromEntries(['preflight', 'inspect', 'confirm', 'journal', 'stop', 'backup', 'convert', 'swap',
      'restart', 'smoke'].map((name) => [name, async (...args) => {
      calls.push(name)
      if (name === 'confirm') {
        if (args[0] !== WARNING || args[1] !== 'ROLLBACK budget previous') throw new Error('wrong_confirmation')
      }
      if (name === failure) throw new Error(`${name}_failed`)
    }]))
  }
  test('dry-run cannot confirm, stop, backup, convert, swap or restart', async ({ assert }) => {
    const calls = []
    await orchestrate({ dryRun: true }, operations('', calls))
    assert.deepEqual(calls, ['preflight', 'inspect'])
  })
  test('execution requires exact target/release confirmation before changes', async ({ assert }) => {
    const calls = []
    await assert.rejects(() => orchestrate({ confirmation: 'force' }, operations('', calls)))
    assert.deepEqual(calls, ['preflight', 'inspect', 'confirm'])
  })
  test('actual confirmation rejects generic yes/force and wrong release', ({ assert }) => {
    const expectedAnswer = 'ROLLBACK budget previous'
    assertConfirmation(expectedAnswer, expectedAnswer)
    for (const answer of ['yes', 'force', '', 'ROLLBACK budget other']) {
      assert.throws(() => assertConfirmation(answer, expectedAnswer), 'confirmation_declined')
    }
  })
  test('actual swap preserves both releases and leaves recovery copies on interrupted rename').with([false, true])
    .run(async ({ assert }, interrupted) => {
      const directories = new Map([['live', 'current'], ['previous', 'old'], ['stage', 'old']])
      const phases = []
      const run = () => swapDirectories({ live: 'live', previous: 'previous', stage: 'stage', retained: 'recovery',
        identities: { current: 'current', previous: 'old' } }, {
        guard: async () => undefined, identity: async (path) => directories.get(path),
        exists: async (path) => directories.has(path),
        journal: async (phase) => phases.push(phase), sync: async () => undefined,
        rename: async (from, to) => {
          if (from === 'stage' && interrupted) throw new Error('interrupted_swap')
          if (directories.has(to)) throw new Error('destination_exists')
          directories.set(to, directories.get(from)); directories.delete(from)
        },
      })
      if (interrupted) await assert.rejects(run, 'interrupted_swap')
      else await run()
      assert.equal(directories.get('recovery'), 'current')
      assert.equal(directories.get('previous'), 'old')
      assert.equal(directories.get(interrupted ? 'stage' : 'live'), 'old')
      assert.equal(phases.at(-1), interrupted ? 'current-release-retained' : 'previous-release-restored')
    })
  test('successful order includes recovery before conversion and verification before startup', async ({ assert }) => {
    const calls = []
    await orchestrate({ confirmation: 'ROLLBACK budget previous' }, operations('', calls))
    assert.deepEqual(calls, ['preflight', 'inspect', 'confirm', 'journal', 'stop', 'journal', 'backup', 'convert', 'swap', 'restart', 'smoke', 'journal'])
  })
  test('failure never starts/reverts an application after failed conversion or swap').with(['stop', 'backup', 'convert', 'swap'])
    .run(async ({ assert }, phase) => {
      const calls = []
      await assert.rejects(() => orchestrate({ confirmation: 'ROLLBACK budget previous' }, operations(phase, calls)))
      assert.notInclude(calls, 'restart')
      assert.equal(calls.at(-1), 'stop')
    })
  test('restart/smoke failure stops intended writers again').with(['restart', 'smoke']).run(async ({ assert }, phase) => {
    const calls = []
    await assert.rejects(() => orchestrate({ confirmation: 'ROLLBACK budget previous' }, operations(phase, calls)))
    assert.equal(calls.at(-1), 'stop')
  })
  test('live database identity and TCP peer must match', async ({ assert }) => {
    assert.equal((await verifyIdentity(identityClient(), expected)).pid, 123)
    for (const mismatch of [{ database: 'production' }, { port: 5432 }, { username: 'other' },
      { server: '192.0.2.1' }, { peer: null }]) await assert.rejects(() => verifyIdentity(identityClient(mismatch), expected))
    await assert.rejects(() => verifyIdentity(identityClient({}, { remoteAddress: '192.0.2.1' }), expected))
  })
  test('explicit plan rejects ambiguous targets, missing recovery and sandbox crossover', ({ assert }) => {
    validatePlan(plan())
    for (const change of [{ expected: { ...expected, host: '*' } }, { recoveryProcedure: '' },
      { environment: 'sandbox' }, { processes: [] }, { smokeUrl: 'https://spendcraft.app/api/mutate' }]) {
      assert.throws(() => validatePlan({ ...plan(), ...change }))
    }
  })
  test('only reviewed PM2 definitions are selected; scheduled restart must be disabled', ({ assert }) => {
    const definitions = plan().processes
    const entries = definitions.map((entry, index) => ({ name: entry.name, pid: index + 100, pm2_env: {
      pm_exec_path: entry.script, pm_cwd: entry.cwd, exec_interpreter: entry.interpreter,
      args: entry.args, exec_mode: 'fork_mode', status: 'online',
    } }))
    assert.lengthOf(selectProcesses(entries, definitions), 3)
    assertNoExtraProcesses(entries, definitions, '/production/server')
    assert.throws(() => assertNoExtraProcesses([...entries, { name: 'unknown',
      pm2_env: { pm_cwd: '/outside', pm_exec_path: '/production/server/spendcraft/ace.js' } }], definitions, '/production/server'))
    assert.throws(() => selectProcesses(entries.slice(1), definitions))
    entries[0].pm2_env.cron_restart = '0 0 * * *'
    assert.throws(() => selectProcesses(entries, definitions), 'disable_pm2_cron_during_maintenance')
  })
  test('primary and fallback PM2 dumps are durably stopped before conversion', async ({ assert }) => {
    const definitions = plan().processes
    const entries = definitions.map((entry) => ({ name: entry.name, pm_exec_path: entry.script,
      pm_cwd: entry.cwd, exec_interpreter: entry.interpreter, args: entry.args, exec_mode: 'fork_mode', status: 'stopped' }))
    const calls = []
    const operations = { save: async () => calls.push('save'), sync: async (file) => calls.push(`sync:${file}`),
      read: async (file) => { calls.push(`read:${file}`); return entries } }
    await persistStoppedState(operations, definitions)
    assert.deepEqual(calls, ['save', 'save', 'sync:dump.pm2', 'read:dump.pm2', 'sync:dump.pm2.bak', 'read:dump.pm2.bak'])
    await assert.rejects(() => persistStoppedState({ ...operations, read: async () => entries.map((entry) => ({ ...entry, status: 'online' })) }, definitions), 'pm2_startup_not_stopped')
    await assert.rejects(() => persistStoppedState({ ...operations, read: async () => entries.map((entry) => ({ ...entry, instances: 1 })) }, definitions), 'pm2_definition_mismatch')
  })
  test('sandbox cannot use the production PM2 home even with renamed applications', ({ assert }) => {
    const configuration = plan()
    configuration.environment = 'sandbox'
    configuration.root = '/sandbox/server'
    configuration.expected.database = 'spendcraft_sandbox'
    assert.throws(() => validatePlan(configuration), 'pm2_home_not_isolated')
  })
  test('children and independent writers are detected without stopping unrelated processes', ({ assert }) => {
    const table = [{ pid: 10, parent: 1, cwd: '/outside' },
      { pid: 20, parent: 10, cwd: '/outside' }, { pid: 30, parent: 1, cwd: '/production/server/spendcraft' },
      { pid: 40, parent: 1, cwd: '/outside', args: ['/production/server/spendcraft/ace.js'] },
      { pid: 50, parent: 1, cwd: '/unrelated' }, { pid: 99, parent: 1, cwd: '/production/server' }]
    assert.deepEqual(writerProcesses(table, '/production/server', [10], 99).map((entry) => entry.pid), [10, 20, 30, 40])
  })
  test('guard failure rolls back before writing and before COMMIT', async ({ assert }) => {
    const client = database()
    const original = client.rows[0].categories_text
    let calls = 0
    await assert.rejects(() => convert(client, { guard: async () => { if (++calls === 3) throw new Error('identity_changed') },
      journal: async () => undefined }), 'identity_changed')
    assert.equal(client.rows[0].categories_text, original)
    assert.notInclude(client.calls, 'COMMIT')
  })
})

test.group('Rollback release/connection fixtures (temporary files only)', (group) => {
  let temporary
  group.each.setup(async () => {
    temporary = await realpath(await mkdtemp(join(tmpdir(), 'spendcraft-rollback-tests-')))
    return () => rm(temporary, { recursive: true, force: true })
  })
  async function release(name, codec) {
    const directory = join(temporary, name)
    for (const path of ['bin', 'node_modules', 'public/assets/.vite', 'config', 'app/Models', 'commands']) {
      await mkdir(join(directory, path), { recursive: true })
    }
    for (const file of ['bin/server.js', 'ace.js', 'package.json', 'package-lock.json', 'config/database.js',
      'app/Models/Transaction.js', 'commands/QueueListener.js', 'commands/PlaidCleanupListener.js']) {
      await writeFile(join(directory, file), '{}')
    }
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module', dependencies: {} }))
    await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'spendcraft', lockfileVersion: 3 }))
    await writeFile(join(directory, 'public/assets/.vite/manifest.json'), JSON.stringify({
      'client-src/App.tsx': { isEntry: true, file: 'App.js', css: ['App.css'] },
    }))
    await writeFile(join(directory, 'public/assets/App.js'), '// client')
    await writeFile(join(directory, 'public/assets/App.css'), 'body {}')
    const environment = join(temporary, 'spendcraft-env')
    await writeFile(environment, 'PG_HOST=localhost\nPG_PORT=5433\nPG_USER=operator\nPG_PASSWORD=not-a-real-secret\nPG_DB_NAME=budget\n')
    await symlink(environment, join(directory, '.env'))
    if (codec) { await mkdir(join(directory, 'app/services')); await writeFile(join(directory, 'app/services/categoryAmountCodec.js'), '// codec') }
    return directory
  }
  test('release capture is deterministic; incomplete release rejects', async ({ assert }) => {
    const directory = await release('previous')
    assert.deepEqual(await releaseManifest(directory), await releaseManifest(directory))
    await rm(join(directory, 'ace.js'))
    await assert.rejects(() => releaseManifest(directory), 'incomplete_release')
  })
  test('missing client assets and runtime dependencies reject before rollback', async ({ assert }) => {
    const directory = await release('previous')
    await rm(join(directory, 'public/assets/App.css'))
    await assert.rejects(() => releaseManifest(directory), 'client_asset_missing')
    await writeFile(join(directory, 'public/assets/App.css'), 'body {}')
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'spendcraft', type: 'module',
      dependencies: { absent: '1.0.0' } }))
    await assert.rejects(() => releaseManifest(directory), 'missing_runtime_dependency')
  })
  test('unreviewed PM2 startup implementation rejects', async ({ assert }) => {
    const module = join(temporary, 'pm2')
    await mkdir(join(module, 'bin'), { recursive: true })
    await writeFile(join(module, 'bin/pm2'), '// fixture')
    await writeFile(join(module, 'package.json'), JSON.stringify({ name: 'pm2', version: '6.0.0' }))
    await assert.rejects(() => verifyPm2Runtime(join(module, 'bin/pm2')), 'unreviewed_pm2_version')
  })
  test('current-to-old release rotation preserves manifest identity', async ({ assert }) => {
    const directory = await release('spendcraft.old')
    const manifest = await releaseManifest(directory)
    assert.equal(manifest.identity.length, 64)
    assert.equal(manifest.files.find((file) => file.name === '.env').kind, 'secret-link')
  })
  test('actual CLI capture creates unique private output folders without database work', async ({ assert }) => {
    const directory = await release('previous')
    const script = resolve('scripts/rollbackTransactionCategoryStorage.mjs')
    const folders = []
    for (let count = 0; count < 2; count++) {
      const result = spawnSync(process.execPath, [script, '--capture-release', directory], { cwd: temporary, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      const folder = result.stdout.split('\n')[0]
      assert.isTrue(folder.startsWith(`${temporary}/category-storage-rollback-`))
      assert.equal((await stat(folder)).mode & 0o777, 0o700)
      const content = await readFile(join(folder, 'release-manifest.json'), 'utf8')
      assert.notInclude(content, 'not-a-real-secret')
      folders.push(folder)
    }
    assert.notEqual(folders[0], folders[1])
  })
  test('running capture from inside a release writes only to a sibling output folder', async ({ assert }) => {
    const directory = await release('previous')
    const before = await releaseManifest(directory)
    const result = spawnSync(process.execPath, [resolve('scripts/rollbackTransactionCategoryStorage.mjs'),
      '--capture-release', directory], { cwd: directory, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.isTrue(result.stdout.split('\n')[0].startsWith(`${temporary}/category-storage-rollback-`))
    assert.deepEqual(await releaseManifest(directory), before)
  })
  test('reviewed release pair verifies; source drift fails closed', async ({ assert }) => {
    const current = await release('spendcraft', true)
    const previous = await release('spendcraft.old', false)
    const left = await releaseManifest(current), right = await releaseManifest(previous)
    const currentManifest = join(temporary, 'current.json'), previousManifest = join(temporary, 'previous.json')
    await writeFile(currentManifest, JSON.stringify(left)); await writeFile(previousManifest, JSON.stringify(right))
    const output = join(temporary, 'output'); await mkdir(output)
    const configuration = { ...plan(), root: temporary, envFile: join(temporary, 'spendcraft-env'), currentManifest,
      previousManifest, reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(left, right))),
      databaseConfigSha256: hash('{}') }
    assert.equal((await verifyReleases(configuration, output)).previous, right.identity)
    await writeFile(join(previous, 'ace.js'), '// changed')
    await assert.rejects(() => verifyReleases(configuration, output), 'release_manifest_mismatch')
  })
  test('connection comes only from .env and explicit expected identity', async ({ assert }) => {
    await release('previous')
    const env = join(temporary, 'spendcraft-env')
    assert.equal((await connectionConfig(env, expected)).database, 'budget')
    await assert.rejects(() => connectionConfig(env, { ...expected, database: 'spendcraft_test' }))
    await writeFile(env, 'PG_HOST=localhost')
    await assert.rejects(() => connectionConfig(env, expected), 'missing_env_connection')
  })
  test('both application connection mappings must use the reviewed .env fields', async ({ assert }) => {
    const directory = await release('previous')
    const source = `pg: { client: 'pg', connection: { host: env.get('PG_HOST'), port: env.get('PG_PORT'),
      user: env.get('PG_USER'), password: env.get('PG_PASSWORD', ''), database: env.get('PG_DB_NAME'), } },
      pgLog: { client: 'pg', connection: { host: env.get('PG_HOST'), port: env.get('PG_PORT'),
      user: env.get('PG_USER'), password: env.get('PG_PASSWORD', ''), database: env.get('PG_DB_NAME'), } }`
    await writeFile(join(directory, 'config/database.js'), source)
    await verifyApplicationConnections(directory, hash(source))
    const bad = source.replace('pgLog:', 'different:')
    await writeFile(join(directory, 'config/database.js'), bad)
    await assert.rejects(() => verifyApplicationConnections(directory, hash(bad)), 'application_connection_mapping_not_supported')
    await assert.rejects(() => verifyApplicationConnections(directory, hash(source)), 'database_config_changed')
  })
  test('import has no execution side effects and CLI rejects generic force modes', async ({ assert }) => {
    await assert.rejects(() => main(['--execute', '--dry-run', '--plan', '/not-used']))
    await assert.rejects(() => main(['--force']))
    const source = await readFile('scripts/rollbackTransactionCategoryStorage.mjs', 'utf8')
    assert.notInclude(source, 'migration:run')
    assert.notInclude(source, 'db:seed')
    assert.notInclude(source, "['restore'")
  })
})
