import { test } from '@japa/runner'
import { checkStopped, createPm2Guard } from '../../scripts/lib/conversionPm2.mjs'
import { executionWriterGuard } from '../../scripts/convertHistoricalTransactionCategories.mjs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { processDefinitions } from '../../installer/lib/pm2Processes.mjs'
import { installerMaintenance } from '../../installer/managePm2.mjs'

const manifest = { format: 1, processes: ['queue', 'plaid-cleanup', 'prod-server'].map(name => ({
  name, script: name === 'prod-server' ? 'bin/server.js' : 'ace.js', cwd: '.', interpreter: 'node', args: [], time: true,
  ...(name === 'prod-server' ? { cronRestart: '0 0 * * *' } : {}),
})) }
const root = '/fixture/server'
const stopped = () => processDefinitions(manifest, root + '/spendcraft').map(item => ({ name: item.name, pid: 0,
  pm2_env: { name: item.name, pm_exec_path: item.script, pm_cwd: item.cwd, exec_interpreter: item.interpreter,
    exec_mode: 'fork_mode', instances: 1, args: item.args, status: 'stopped', pm_pid: 0, cron_restart: null } }))
function fixture() {
  let entries = stopped(), text = JSON.stringify(manifest), pid = '123'
  const calls = [], files = new Map(), stats = new Map()
  const missing = () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }
  const dump = () => entries.map(entry => globalThis.structuredClone(entry.pm2_env))
  files.set('/operator/.pm2/dump.pm2', dump()); files.set('/operator/.pm2/dump.pm2.bak', dump())
  const dependencies = {
    realpath: async path => path.endsWith('/.pm2') ? '/operator/.pm2' : path, probePid: () => true,
    verifyPm2Runtime: async () => '7.1.0',
    lstat: async path => {
      if (!files.has(path)) return missing()
      return { isFile: () => true, uid: process.getuid(), mode: 0o600, size: 100, ...stats.get(path) }
    },
    readFile: async path => {
      if (path.endsWith('pm2.pid')) return pid
      if (path.endsWith('pm2-processes.json')) return text
      if (files.has(path)) return JSON.stringify(files.get(path))
      return missing()
    },
    command: async (command, args, options) => {
      calls.push({ command, args, options })
      if (command === 'which') return { stdout: '/reviewed/bin/pm2' }
      return { stdout: command === 'ps' ? 'PM2 v5.4.1: God Daemon (/operator/.pm2)' : JSON.stringify(entries) }
    },
  }
  return { dependencies, calls, files, stats,
    get entries() { return entries }, set entries(value) { entries = value },
    fence(phase = 'fenced') {
      entries = entries.filter(entry => entry.name !== 'prod-server')
      files.set(root + '/maintenance/installer-pm2.json', { format: 1, root,
        manifest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        id: '12345678-1234-1234-1234-123456789012', phase,
        processes: manifest.processes.map(item => ({ name: item.name, cron: item.cronRestart ?? null })) })
      files.set('/operator/.pm2/dump.pm2', dump()); files.set('/operator/.pm2/dump.pm2.bak', dump())
    },
    running: () => { entries[0].pid = 456; entries[0].pm2_env.status = 'online' },
    missing: () => { entries = [] }, changeManifest: () => { text += ' ' }, changePid: () => { pid = '456' } }
}

test.group('Conversion PM2 manifest stopped checks — inert mocks', () => {
  test('checks all manifest names and ignores unrelated applications', ({ assert }) => {
    const entries = [...stopped(), { name: 'unrelated', pid: 99, pm2_env: { status: 'online' } }]
    assert.deepEqual(checkStopped(manifest, entries).map(item => item.name), ['queue', 'plaid-cleanup', 'prod-server'])
  })
  test('online, starting, stopping, errored and live-PID processes block').with(['online', 'launching', 'stopping', 'errored', 'stopped'])
    .run(({ assert }, status) => {
      const entries = stopped(); entries[0] = { name: 'queue', pid: 10, pm2_env: { status } }
      assert.throws(() => checkStopped(manifest, entries), 'pm2_manifest_process_not_stopped')
    })
  test('missing/duplicate names and malformed manifests/lists fail closed', ({ assert }) => {
    assert.throws(() => checkStopped(manifest, []), 'pm2_manifest_process_missing_or_duplicate')
    assert.throws(() => checkStopped(manifest, [...stopped(), stopped()[0]]), 'pm2_manifest_process_missing_or_duplicate')
    assert.throws(() => checkStopped(manifest, {}), 'invalid_pm2_process_list')
    assert.throws(() => checkStopped({}, []), 'invalid_process_manifest')
  })
  test('guard queries only selected daemon and detects later process restart', async ({ assert }) => {
    const f = fixture(), guard = await createPm2Guard({}, f.dependencies)
    const evidence = await guard()
    assert.lengthOf(evidence.processes, 3); assert.equal(evidence.pm2Home, '/operator/.pm2')
    assert.deepEqual(f.calls.find(call => call.command === '/reviewed/bin/pm2').args, ['jlist'])
    assert.equal(f.calls.find(call => call.command === '/reviewed/bin/pm2').options.env.PM2_HOME, '/operator/.pm2')
    f.running(); await assert.rejects(guard, 'pm2_manifest_process_not_stopped')
    assert.isTrue(f.calls.every(call => ['ps', 'which'].includes(call.command) || JSON.stringify(call.args) === '["jlist"]'))
  })
  test('missing daemon fails before invoking PM2', async ({ assert }) => {
    const f = fixture(); f.dependencies.probePid = () => { throw new Error('daemon_unavailable') }
    const guard = await createPm2Guard({}, f.dependencies)
    await assert.rejects(guard, 'daemon_unavailable'); assert.isFalse(f.calls.some(call => call.command === '/reviewed/bin/pm2'))
  })
  test('wrong daemon identity is rejected', async ({ assert }) => {
    const f = fixture(), run = f.dependencies.command
    f.dependencies.command = async (...args) => args[0] === 'ps' ? { stdout: 'unrelated process' } : run(...args)
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))(), 'pm2_daemon_identity_mismatch')
  })
  test('manifest changes and missing registrations block subsequent guards', async ({ assert }) => {
    const f = fixture(), guard = await createPm2Guard({}, f.dependencies)
    await guard(); f.changeManifest(); await assert.rejects(guard, 'pm2_manifest_changed')
    const other = fixture(), next = await createPm2Guard({}, other.dependencies)
    other.missing(); await assert.rejects(next, 'pm2_manifest_process_missing_or_duplicate')
  })
  test('daemon replacement during inspection fails closed', async ({ assert }) => {
    const f = fixture(), run = f.dependencies.command
    f.dependencies.command = async (...args) => { const result = await run(...args); if (args[0] === '/reviewed/bin/pm2') f.changePid(); return result }
    const guard = await createPm2Guard({}, f.dependencies)
    await assert.rejects(guard, 'pm2_daemon_changed')
  })
  test('sandbox never reads PM2 files, queries PM2 or requires a daemon', async ({ assert }) => {
    const guard = await executionWriterGuard({}, { database: { name: 'spendcraft_sandbox' } }, async () => { throw new Error('must_not_inspect_pm2') })
    assert.equal((await guard()).mode, 'sandbox')
    assert.deepEqual((await guard()).processes, [])
  })
  test('only the exact sandbox database skips PM2', async ({ assert }) => {
    for (const name of ['budget', 'spendcraft', 'spendcraft_staging', 'spendcraft_sandbox_copy']) {
      let called = false
      const guard = await executionWriterGuard({}, { database: { name } }, async () => { called = true; return async () => 'checked' })
      assert.isTrue(called); assert.equal(await guard(), 'checked')
    }
  })
  test('dry-run bypasses PM2; execution rechecks before database mutations', async ({ assert }) => {
    const source = await readFile('scripts/convertHistoricalTransactionCategories.mjs', 'utf8')
    assert.include(source, "phase = 'verify_pm2_stopped'")
    assert.include(source, 'pm2Guard = await executionWriterGuard(options, target)')
    assert.include(source, 'guard: async () => {\n        await pm2Guard()')
    assert.notInclude(source, 'pg_stat_activity'); assert.notInclude(source, 'noOtherSessions')
    assert.notInclude(source, 'exactConfirmation'); assert.notInclude(source, "'writers-stopped':")
  })
})

test.group('Conversion PM2 durable maintenance fence — inert mocks', () => {
  for (const version of ['5.4.1', '7.1.0']) {
    test(`reviewed PM2 ${version} admits a fully verified fence without mutations`, async ({ assert }) => {
      const f = fixture(); f.fence()
      f.dependencies.verifyPm2Runtime = async () => version
      const guard = await createPm2Guard({}, f.dependencies), result = await guard()
      assert.equal(result.mode, 'durable-maintenance-fence')
      assert.deepEqual(result.processes.map(p => [p.name, p.status]), [['queue', 'stopped'], ['plaid-cleanup', 'stopped'], ['prod-server', 'removed']])
      assert.equal(result.phase, 'fenced'); assert.equal(result.root, root)
      await guard()
      assert.isTrue(f.calls.every(call => ['ps', 'which'].includes(call.command) || JSON.stringify(call.args) === '["jlist"]'))
      assert.equal(f.files.get(root + '/maintenance/installer-pm2.json').phase, 'fenced')
    })
  }
  test('the actual installer stop procedure produces a state accepted by the conversion guard', async ({ assert }) => {
    const f = fixture(), file = root + '/maintenance/installer-pm2.json'
    for (const entry of f.entries) {
      entry.pid = 123; entry.pm2_env.status = 'online'
      if (entry.name === 'prod-server') entry.pm2_env.cron_restart = '0 0 * * *'
    }
    const run = async args => {
      if (args[0] === 'jlist') return { stdout: JSON.stringify(f.entries) }
      if (args[0] === 'delete') f.entries = f.entries.filter(entry => entry.name !== args[1])
      else if (args[0] === 'stop') {
        const entry = f.entries.find(entry => entry.name === args[1])
        entry.pid = 0; entry.pm2_env.status = 'stopped'
      } else if (args[0] === 'save') {
        const saved = f.entries.map(entry => globalThis.structuredClone(entry.pm2_env))
        f.files.set('/operator/.pm2/dump.pm2', saved); f.files.set('/operator/.pm2/dump.pm2.bak', saved)
      } else throw new Error('unexpected_mock_pm2_command')
      return { stdout: '' }
    }
    await installerMaintenance({ action: 'stop', root, incoming: manifest, previous: manifest, run,
      store: { capture: async state => f.files.set(file, globalThis.structuredClone(state)),
        save: async state => f.files.set(file, globalThis.structuredClone(state)) },
      dumps: async name => f.files.get('/operator/.pm2/' + name), print: () => undefined })
    assert.equal((await (await createPm2Guard({}, f.dependencies))()).mode, 'durable-maintenance-fence')
    assert.equal(f.files.get(file).processes.find(p => p.name === 'prod-server').cron, '0 0 * * *')
  })
  test('all registrations stopped with disabled schedules remains eligible', async ({ assert }) => {
    const f = fixture(), result = await (await createPm2Guard({}, f.dependencies))()
    assert.equal(result.mode, 'stopped'); assert.lengthOf(result.processes, 3)
  })
  test('missing registration without an active maintenance record is never a fence', async ({ assert }) => {
    const f = fixture(); f.fence(); f.files.delete(root + '/maintenance/installer-pm2.json')
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))(), 'pm2_manifest_process_missing_or_duplicate')
  })
  test('interrupted captured/resuming/failed and completed/stale phases remain closed').with([
    'captured', 'resuming', 'restored', 'resume-failed', 'complete', 'unknown', undefined,
  ]).run(async ({ assert }, phase) => {
    const f = fixture(); f.fence(); f.files.get(root + '/maintenance/installer-pm2.json').phase = phase
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
  })
  test('prepared phase is verified without resuming writers', async ({ assert }) => {
    const f = fixture(); f.fence('prepared')
    assert.equal((await (await createPm2Guard({}, f.dependencies))()).phase, 'prepared')
    assert.isTrue(f.entries.every(entry => entry.pm2_env.status === 'stopped'))
  })
  test('malformed/incomplete identity, manifest, process set and schedule evidence fails').with([
    'null', 'format', 'root', 'manifest', 'id', 'missing', 'duplicate', 'unknown-process', 'schedule',
  ]).run(async ({ assert }, failure) => {
    const f = fixture(); f.fence()
    const file = root + '/maintenance/installer-pm2.json', state = f.files.get(file)
    if (failure === 'null') f.files.set(file, null)
    if (failure === 'format') state.format = 2
    if (failure === 'root') state.root = '/other/server'
    if (failure === 'manifest') state.manifest = 'a'.repeat(64)
    if (failure === 'id') state.id = 'invalid'
    if (failure === 'missing') state.processes.pop()
    if (failure === 'duplicate') state.processes[2] = state.processes[0]
    if (failure === 'unknown-process') state.processes[2].name = 'other'
    if (failure === 'schedule') state.processes[2].cron = '0 1 * * *'
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
  })
  test('unsafe maintenance files cannot establish a fence').with(['mode', 'owner', 'size', 'symlink', 'directory', 'malformed'])
    .run(async ({ assert }, failure) => {
      const f = fixture(); f.fence()
      const file = root + '/maintenance/installer-pm2.json'
      if (failure === 'mode') f.stats.set(file, { mode: 0o644 })
      if (failure === 'owner') f.stats.set(file, { uid: process.getuid() + 1 })
      if (failure === 'size') f.stats.set(file, { size: 65537 })
      if (failure === 'directory') f.stats.set(file, { isFile: () => false })
      if (failure === 'symlink') {
        const canonical = f.dependencies.realpath
        f.dependencies.realpath = async path => path === file ? '/untrusted/state.json' : canonical(path)
      }
      if (failure === 'malformed') {
        const read = f.dependencies.readFile
        f.dependencies.readFile = async (...args) => args[0] === file ? '{' : read(...args)
      }
      await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
    })
  test('live registration, PID, schedule, identity and unexpected installation processes fail').with([
    'scheduled-present', 'online', 'pid', 'duplicate', 'missing-unscheduled', 'script', 'cwd', 'args', 'interpreter', 'cluster', 'cron', 'unexpected',
  ]).run(async ({ assert }, failure) => {
    const f = fixture(); f.fence()
    const env = f.entries[0].pm2_env
    if (failure === 'scheduled-present') f.entries.push(stopped()[2])
    if (failure === 'online') env.status = 'online'
    if (failure === 'pid') env.pm_pid = 123
    if (failure === 'duplicate') f.entries.push(f.entries[0])
    if (failure === 'missing-unscheduled') f.entries.pop()
    if (failure === 'script') env.pm_exec_path = root + '/spendcraft/foreign.js'
    if (failure === 'cwd') env.pm_cwd = '/other/spendcraft'
    if (failure === 'args') env.args = ['different']
    if (failure === 'interpreter') env.exec_interpreter = '/other/node'
    if (failure === 'cluster') env.exec_mode = 'cluster_mode'
    if (failure === 'cron') env.cron_restart = '0 0 * * *'
    if (failure === 'unexpected') f.entries.push({ name: 'unexpected', pid: 99, pm2_env: { ...env, status: 'online' } })
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
  })
  for (const dump of ['dump.pm2', 'dump.pm2.bak']) {
    test(`both modes reject unsafe ${dump}`).with(['online', 'scheduled-present', 'identity', 'cron', 'missing', 'duplicate', 'owner', 'malformed'])
      .run(async ({ assert }, failure) => {
        for (const fenced of [false, true]) {
          const f = fixture(); if (fenced) f.fence()
          const file = '/operator/.pm2/' + dump, saved = f.files.get(file)
          if (failure === 'online') saved[0].status = 'online'
          if (failure === 'scheduled-present') saved.push(stopped()[2].pm2_env)
          if (failure === 'identity') saved[0].args = ['different']
          if (failure === 'cron') saved[0].cron_restart = '0 0 * * *'
          if (failure === 'missing') f.files.delete(file)
          if (failure === 'duplicate') saved.push(saved[0])
          if (failure === 'owner') f.stats.set(file, { uid: process.getuid() + 1 })
          if (failure === 'malformed') f.files.set(file, {})
          await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
        }
      })
  }
  test('unknown or changed PM2 runtime is rejected before PM2 inspection', async ({ assert }) => {
    const f = fixture(); f.dependencies.verifyPm2Runtime = async () => '7.1.1'
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))(), 'unreviewed_pm2_version')
    assert.isFalse(f.calls.some(call => call.command === '/reviewed/bin/pm2'))
    let changed = false
    const next = fixture(); next.dependencies.verifyPm2Runtime = async () => { if (changed) throw new Error('unreviewed_pm2_startup_source'); return '5.4.1' }
    const check = await createPm2Guard({}, next.dependencies); await check(); changed = true
    await assert.rejects(check, 'unreviewed_pm2_startup_source')
  })
  test('maintenance replacement/removal/phase changes cannot silently fall back between checks').with(['id', 'removed', 'phase'])
    .run(async ({ assert }, failure) => {
      const f = fixture(); f.fence()
      const guard = await createPm2Guard({}, f.dependencies); await guard()
      const file = root + '/maintenance/installer-pm2.json'
      if (failure === 'id') f.files.get(file).id = 'abcdefab-1234-1234-1234-123456789012'
      if (failure === 'phase') f.files.get(file).phase = 'prepared'
      if (failure === 'removed') {
        f.files.delete(file); f.entries = stopped()
        for (const name of ['dump.pm2', 'dump.pm2.bak']) f.files.set('/operator/.pm2/' + name, f.entries.map(entry => entry.pm2_env))
      }
      await assert.rejects(guard, 'pm2_maintenance_state_changed')
    })
  test('a completed record is rejected even if all registrations appear stopped', async ({ assert }) => {
    const f = fixture(); f.fence('complete'); f.entries = stopped()
    await assert.rejects(async () => (await createPm2Guard({}, f.dependencies))())
  })
  test('all five historical converters retain the shared writer guard without conversion changes', async ({ assert }) => {
    for (const name of ['TransactionCategories', 'TransactionTaxes', 'StatementIncome', 'TaxMonetary', 'Funding']) {
      const source = await readFile(`scripts/convertHistorical${name}.mjs`, 'utf8')
      assert.include(source, "from './lib/conversionPm2.mjs'")
      assert.include(source, 'createPm2Guard')
    }
  })
})
