import { test } from '@japa/runner'
import { checkStopped, createPm2Guard } from '../../scripts/lib/conversionPm2.mjs'
import { executionWriterGuard } from '../../scripts/convertHistoricalTransactionCategories.mjs'
import { readFile } from 'node:fs/promises'

const manifest = { format: 1, processes: ['queue', 'plaid-cleanup', 'prod-server'].map(name => ({
  name, script: 'ace.js', cwd: '.', interpreter: 'node', args: [], time: true,
})) }
const stopped = () => manifest.processes.map(item => ({ name: item.name, pid: 0, pm2_env: { status: 'stopped' } }))
function fixture() {
  let entries = stopped(), text = JSON.stringify(manifest), pid = '123'
  const calls = []
  const dependencies = {
    realpath: async () => '/operator/.pm2', probePid: () => true,
    readFile: async path => path.endsWith('pm2.pid') ? pid : text,
    command: async (command, args, options) => {
      calls.push({ command, args, options })
      return { stdout: command === 'ps' ? 'PM2 v5.4.1: God Daemon (/operator/.pm2)' : JSON.stringify(entries) }
    },
  }
  return { dependencies, calls, running: () => { entries[0].pid = 456; entries[0].pm2_env.status = 'online' },
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
    assert.deepEqual(f.calls.find(call => call.command !== 'ps').args, ['jlist'])
    assert.equal(f.calls.find(call => call.command !== 'ps').options.env.PM2_HOME, '/operator/.pm2')
    f.running(); await assert.rejects(guard, 'pm2_manifest_process_not_stopped')
    assert.isTrue(f.calls.every(call => call.command === 'ps' || JSON.stringify(call.args) === '["jlist"]'))
  })
  test('missing daemon fails before invoking PM2', async ({ assert }) => {
    const f = fixture(); f.dependencies.probePid = () => { throw new Error('daemon_unavailable') }
    const guard = await createPm2Guard({}, f.dependencies)
    await assert.rejects(guard, 'daemon_unavailable'); assert.isEmpty(f.calls)
  })
  test('wrong daemon identity is rejected', async ({ assert }) => {
    const f = fixture(); f.dependencies.command = async () => ({ stdout: 'unrelated process' })
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
    f.dependencies.command = async (...args) => { const result = await run(...args); if (args[0] !== 'ps') f.changePid(); return result }
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
