import { test } from '@japa/runner'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, readdir, stat, symlink, chmod } from
  'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { main, createPlan, publishPlan, discoverDatabaseIdentity, planDiagnostic, planStep } from
  '../../installer/generateRollbackPlan.mjs'
import { validatePlan, releaseManifest, verifyReleases } from
  '../../installer/rollbackApplication.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
test.group('Automatic installer rollback plan (temporary files, no database or PM2)', (group) => {
  let root
  let input
  group.each.setup(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'installer-rollback-plan-')))
    await mkdir(join(root, 'spendcraft/config'), { recursive: true })
    await mkdir(join(root, 'maintenance'))
    await mkdir(join(root, 'record'))
    await writeFile(join(root, 'spendcraft/config/database.js'),
      '// database configuration fixture')
    const entries = []
    for (const name of ['prod-server', 'queue', 'plaid-cleanup']) {
      const script = join(root, 'spendcraft', name + '.js')
      await writeFile(script, '// ' + name)
      entries.push({ name, pm2_env: { pm_exec_path: script, pm_cwd: join(root, 'spendcraft'),
        exec_interpreter: 'node', args: name === 'queue' ? ['queue:listener'] : [], exec_mode:
          'fork_mode', instances: 1,
        env: { SECRET: 'must-not-appear' }, cron_restart: '0 0 * * *' } })
    }
    const manifest = { format: 1, processes: entries.map((entry) => ({ name: entry.name,
      script: entry.name + '.js', cwd: '.', interpreter: 'node', args: entry.pm2_env.args,
        time: true })) }
    for (const release of ['spendcraft', 'spendcraft.old']) {
      await mkdir(join(root, release, 'installer'), { recursive: true })
      await writeFile(join(root, release, 'installer/pm2-processes.json'), JSON.stringify(manifest))
      for (const item of manifest.processes) await writeFile(join(root, release, item.script),
        '// ' + item.name)
    }
    input = { root, environment: 'production', envFile: join(root, 'spendcraft-env'),
      current: { files: [{ name: 'current.js' }] }, previous: { files: [{ name: 'old.js' }] },
        record: join(root, 'record'),
      pm2Executable: '/reviewed/bin/pm2', pm2Home: '/home/ubuntu/.pm2', entries,
      expected: { host: 'localhost', port: 5432, database: 'spendcraft', user: 'ubuntu',
        serverAddress: '127.0.0.1', clientAddress: '127.0.0.1' },
      smokeUrl: 'https://spendcraft.app' }
    return () => rm(root, { recursive: true, force: true })
  })
  test('production discovery captures actual definitions and hashes without credentials', async ({
    assert }) => {
    const plan = await createPlan(input)
    assert.equal(plan.rollbackKind, 'application-only')
    validatePlan(plan)
    assert.isTrue(plan.generated)
    assert.equal(plan.productionRoot, root)
    assert.equal(plan.databaseConfigSha256, hash('// database configuration fixture'))
    assert.equal(plan.processes[0].scriptSha256, hash('// prod-server'))
    assert.deepEqual(plan.processes[1].args, ['queue:listener'])
    assert.equal(plan.currentManifest, join(root, 'record/current-release-manifest.json'))
    assert.notInclude(JSON.stringify(plan), 'must-not-appear')
    assert.notProperty(plan, 'machineId')
    assert.notProperty(plan.processes[0], 'cron_restart')
  })
  test('separate EC2 staging accepts ordinary PM2 names and same home path', async ({ assert }) => {
    const plan = await createPlan({ ...input, environment: 'staging', smokeUrl:
      'https://staging.spendcraft.app' })
    validatePlan(plan)
    assert.equal(plan.productionRoot, '/spendcraft-prod/server')
    assert.deepEqual(plan.processes.map((item) => item.name), ['prod-server', 'queue',
      'plaid-cleanup'])
  })
  test('missing previous manifest records manual restart without inventing previous processes',
    async ({ assert }) => {
    await rm(join(root, 'spendcraft.old/installer/pm2-processes.json'))
    const plan = await createPlan(input)
    assert.isTrue(plan.manualRestart)
    assert.notProperty(plan, 'previousProcesses')
    assert.notProperty(plan, 'previousProcessManifestSha256')
    validatePlan(plan)
  })
  test('malformed previous manifest fails instead of silently selecting manual mode', async ({
    assert }) => {
    await writeFile(join(root, 'spendcraft.old/installer/pm2-processes.json'), 'not JSON')
    await assert.rejects(() => createPlan(input))
  })
  test('rejects missing or duplicate expected PM2 processes', async ({ assert }) => {
    await assert.rejects(() => createPlan({ ...input, entries: input.entries.slice(1) }),
      'missing_or_duplicate_pm2_process')
    await assert.rejects(() => createPlan({ ...input, entries: [...input.entries, input.entries[
      0]] }), 'missing_or_duplicate_pm2_process')
  })
  test('single fork instances are accepted whether default metadata is explicit or absent', async ({
    assert }) => {
    for (const instances of [undefined, 1]) {
      for (const entry of input.entries) entry.pm2_env.instances = instances
      const plan = await createPlan(input)
      assert.lengthOf(plan.processes, 3)
    }
  })
  test('rejects unsupported process modes and instances', async ({ assert }) => {
    for (const change of [{ exec_mode: 'cluster_mode' }, { instances: 2 }, { instances: 0 }, {
      instances: -1 }, { instances: '1' }, { instances: null }]) {
      const entries = input.entries.map((entry) => ({ ...entry, pm2_env: { ...entry.pm2_env } }))
      Object.assign(entries[0].pm2_env, change)
      await assert.rejects(() => createPlan({ ...input, entries }), 'unsupported_pm2_definition')
    }
  })
  test('rejects process paths outside installation', async ({ assert }) => {
    input.entries[0].pm2_env.pm_cwd = '/unrelated'
    await assert.rejects(() => createPlan(input), 'pm2_manifest_mismatch')
  })
  test('requires explicit supported target and loopback database', async ({ assert }) => {
    await assert.rejects(() => createPlan({ ...input, environment: undefined }),
      'explicit_installation_target_required')
    await assert.rejects(() => createPlan({ ...input, expected: { ...input.expected, host:
      'production.example' } }), 'ambiguous_database_target')
  })
  test('publishes private plan and retains previous plan without overwriting archives', async ({
    assert }) => {
    const maintenance = join(root, 'maintenance'), output = join(root, 'record')
    await writeFile(join(maintenance, 'rollback-plan.json'), JSON.stringify({ previous: 'keep' }))
    const plan = await createPlan(input)
    await publishPlan(maintenance, output, plan)
    assert.deepEqual(JSON.parse(await readFile(join(maintenance, 'rollback-plan.json'), 'utf8')),
      plan)
    assert.deepEqual(JSON.parse(await readFile(join(output, 'previous-rollback-plan.json'),
      'utf8')), { previous: 'keep' })
    assert.equal((await stat(join(maintenance, 'rollback-plan.json'))).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(await readFile(join(output, 'rollback-plan.json'), 'utf8')), plan)
    await assert.rejects(() => publishPlan(maintenance, output, plan))
  })
  test('rejects symlink plan without changing its target', async ({ assert }) => {
    const target = join(root, 'private.json')
    await writeFile(target, '{}')
    await symlink(target, join(root, 'maintenance/rollback-plan.json'))
    const plan = await createPlan(input)
    await assert.rejects(() => publishPlan(join(root, 'maintenance'), join(root, 'record'), plan),
      'unsafe_existing_rollback_plan')
    assert.equal(await readFile(target, 'utf8'), '{}')
  })
  test('read-only discovery is packaged and called after swap and PM2 save', async ({ assert }) => {
    const source = await readFile('installer/generateRollbackPlan.mjs', 'utf8')
    assert.include(source, 'default_transaction_read_only=on')
    assert.include(source, 'index < 3')
    assert.include(source,
      "planStep('verify-database-' + (index + 1), () => verifyIdentity(client, expected))")
    assert.include(source, 'await client.end()')
    assert.isBelow(source.indexOf('console.log(output)'), source.indexOf(
      'await discoverDatabaseIdentity(config, expected, Client)'))
    assert.notMatch(source,
      /client\.query\(['"\x60](INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/)
    const installer = await readFile('installer/install.sh0', 'utf8')
    const call = installer.indexOf('node "$PWD/$APP/installer/generateRollbackPlan.mjs"')
    assert.isAbove(call, installer.indexOf('mv $APP_NEW $APP'))
    assert.isAbove(call, installer.indexOf('pm2 save'))
    assert.include(await readFile('adonisrc.ts', 'utf8'),
      "pattern: 'installer/generateRollbackPlan.mjs'")
    assert.lengthOf(await readdir(join(root, 'maintenance')), 0)
  })
  test('three independently checked read-only connections are closed; IPv6 is supported', async ({
    assert }) => {
    const clients = []
    class Client {
      constructor(config) {
        assert.include(config.options, 'default_transaction_read_only=on')
        this.connection = { stream: { remoteAddress: '::1', remotePort: 5432 } }
        clients.push(this)
      }
      async connect() { this.connected = true }
      async query() { return { rows: [{ server: '::1', peer: '::1', database: 'spendcraft',
        username: 'ubuntu', port: 5432 }] } }
      async end() { this.closed = true }
    }
    const expected = { ...input.expected }
    await discoverDatabaseIdentity({ options: '' }, expected, Client)
    assert.lengthOf(clients, 3)
    assert.isTrue(clients.every((client) => client.closed))
    assert.equal(expected.serverAddress, '::1')
  })
  test('identity failure closes connection and prevents further connections', async ({ assert }) =>
    {
    const clients = []
    class Client {
      constructor() { clients.push(this) }
      async connect() { this.connected = true }
      async query() { return { rows: [{ server: '192.0.2.1', peer: '127.0.0.1' }] } }
      async end() { this.closed = true }
    }
    await assert.rejects(() => discoverDatabaseIdentity({ options: '' }, { ...input.expected },
      Client), 'ambiguous_database_target')
    assert.lengthOf(clients, 1)
    assert.isTrue(clients[0].closed)
  })
  test('diagnostics retain SQLSTATE codes and phases without exposing exception content', async ({
    assert }) => {
    const error = Object.assign(new Error('password=private-value'), { code: '28P01', detail:
      'private-value' })
    await assert.rejects(() => planStep('connect-database-1', async () => { throw error }))
    assert.deepEqual(planDiagnostic(error), { phase: 'connect-database-1', code: '28P01' })
    assert.notInclude(JSON.stringify(planDiagnostic(error)), 'private-value')
    assert.deepEqual(planDiagnostic(Object.assign(new Error('stderr contains credentials'), {
      code: 2, signal: 'SIGTERM' })), {
      phase: 'arguments', code: 'unclassified_error', exitCode: 2, signal: 'SIGTERM',
    })
  })
  test('PM2 reason codes keep digits and rejected process metadata is safe', async ({ assert }) => {
    assert.deepEqual(planDiagnostic(new Error('invalid_pm2_selection')), { phase: 'arguments',
      code: 'invalid_pm2_selection' })
    input.entries[0].pm2_env.instances = 2
    let diagnostic
    try { await planStep('build-plan', () => createPlan(input)) }
    catch (error) { diagnostic = planDiagnostic(error) }
    assert.deepEqual(diagnostic, { phase: 'build-plan', code: 'unsupported_pm2_definition',
      process: 'prod-server', execMode: 'fork_mode', instances: 2 })
    assert.notInclude(JSON.stringify(diagnostic), 'must-not-appear')
    assert.notInclude(JSON.stringify(diagnostic), root)
  })
  test('JSON parse failures identify the parser step without printing PM2 output', async ({
    assert }) => {
    let observed
    try { await planStep('parse-pm2-state', async () => JSON.parse('secret-value')) }
    catch (error) { observed = planDiagnostic(error) }
    assert.deepEqual(observed, { phase: 'parse-pm2-state', code: 'invalid_json' })
  })
  test('nested phase context keeps the original failing step', async ({ assert }) => {
    const error = new Error('missing_runtime_dependency')
    try { await planStep('outer', () => planStep('inspect-current-release', async () => {
      throw error })) }
    catch (observed) { assert.deepEqual(planDiagnostic(observed), { phase:
      'inspect-current-release', code: 'missing_runtime_dependency' }) }
  })
  test(
    'generated plan execution requires explicit readiness review and dry-run avoids confirmation',
    async ({ assert }) => {
    const executor = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.include(executor, 'if (plan.generated)')
    assert.include(executor, "assertConfirmation(await review.question(")
    assert.include(executor, "Type READY: '), 'READY')")
    const core = await readFile('installer/lib/applicationRollback.mjs', 'utf8')
    assert.isBelow(core.indexOf('if (options.dryRun) return operations.inspect()'), core.indexOf(
      'await operations.confirm(WARNING'))
  })
})
