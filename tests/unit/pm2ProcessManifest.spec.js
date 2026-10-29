import { test } from '@japa/runner'
import process from 'node:process'
import { URL } from 'node:url'
import { readFile, mkdtemp, realpath, rm, writeFile, stat, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { validateProcessManifest, processDefinitions, processStartArgs, matchesDefinition,
  replaceProcesses } from '../../installer/lib/pm2Processes.mjs'
import { manageProcesses, installerMaintenance, maintenanceStore } from
  '../../installer/managePm2.mjs'
const clone = value => globalThis.structuredClone(value)
const execute = promisify(execFile)

const root = '/fixture/server'

function maintenanceFixture(cron = '0 0 * * *') {
  const incoming = { format: 1, processes: ['queue', 'plaid-cleanup', 'prod-server'].map(name => ({
    name, script: name === 'prod-server' ? 'bin/server.js' : 'ace.js', cwd: '.', interpreter:
      'node',
    args: name === 'prod-server' ? [] : [name + ':listener'], time: true,
    ...(name === 'prod-server' ? { cronRestart: cron } : {}),
  })) }
  let entries = processDefinitions(incoming, root + '/spendcraft').map((definition, i) => ({
    name: definition.name, pid: i + 10, pm2_env: { name: definition.name, pm_exec_path: definition
      .script,
      pm_cwd: definition.cwd, exec_interpreter: definition.interpreter, args: definition.args,
      status: 'online', ...(definition.cronRestart ? { cron_restart: definition.cronRestart } : {
        }) },
  }))
  const jobs = new Set(['prod-server']), calls = [], events = [], saved = {}, archive = []
  let state
  const f = { incoming, previous: incoming, calls, events, jobs, archive, ignoreDelete: false,
    fail: '', corruptDump: false, ignoreStop: false, ignoreStartCron: false,
    get entries() { return entries }, get state() { return state },
    set state(value) { state = value },
    fireCron() { for (const item of entries) if (jobs.has(item.name)) { item.pid = 999; item.pm2_env
      .status = 'online' } },
    store: {
      async capture(value) {
        if (state) throw new Error('maintenance_already_active')
        events.push('capture'); state = clone(value)
      },
      async read() { if (!state) throw new Error('maintenance_state_missing'); return clone(
        state) },
      async save(value) { events.push(value.phase); state = clone(value) },
      async complete(value) { archive.push(clone({ ...value, phase: 'complete' })); state =
        undefined },
    },
    async dumps(name) {
      if (f.corruptDump) return [{ name: 'queue', status: 'online' }]
      return clone(saved[name])
    },
    async run(args) {
      calls.push(args)
      if (args[0] !== 'jlist') events.push(args.join(' '))
      if (f.fail && args.join(' ').startsWith(f.fail)) throw new Error('injected_pm2_failure')
      if (args[0] === 'jlist') return { stdout: JSON.stringify(entries) }
      if (args[0] === 'delete' && !f.ignoreDelete) {
        // Reviewed PM2 5.4.1/7.1.0: deleteCron precedes stopProcessId.
        jobs.delete(args[1]); events.push('cron-removed:' + args[1])
        entries = entries.filter(item => item.name !== args[1])
      }
      if (args[0] === 'stop' && !f.ignoreStop) {
        for (const item of entries.filter(item => args[1] === 'all' || args[1] === item.name)) {
          item.pid = 0; item.pm2_env.status = 'stopped'
          // Deliberately retains cron, reproducing the real PM2 stop behavior.
        }
      }
      if (args[0] === 'start') {
        const get = flag => args[args.indexOf(flag) + 1]
        const name = get('--name'), cronValue = args.includes('--cron') && !f.ignoreStartCron ? get(
          '--cron') : undefined
        entries.push({ name, pid: 100, pm2_env: { name, pm_exec_path: args[1], pm_cwd: get('--cwd'),
          exec_interpreter: get('--interpreter'), status: 'online',
          args: args.includes('--') ? args.slice(args.indexOf('--') + 1) : [],
          ...(cronValue ? { cron_restart: cronValue } : {}) } })
        if (cronValue) jobs.add(name)
      }
      if (args[0] === 'save') {
        saved['dump.pm2.bak'] = clone(saved['dump.pm2'] ?? [])
        saved['dump.pm2'] = entries.map(item => clone(item.pm2_env))
      }
      return { stdout: '' }
    },
    async act(action) {
      return installerMaintenance({ action, root, incoming, previous: f.previous,
        run: f.run, store: f.store, dumps: f.dumps, print: () => undefined })
    },
  }
  return f
}

test.group('Installer durable PM2 maintenance fence (inert daemon and files)', () => {
  test('PM2 stop alone can be restarted by its retained cron', async ({ assert }) => {
    const f = maintenanceFixture()
    await f.run(['stop', 'prod-server'])
    assert.equal(f.entries.find(item => item.name === 'prod-server').pid, 0)
    f.fireCron()
    assert.equal(f.entries.find(item => item.name === 'prod-server').pid, 999)
  })
  test(
    'captures before deleting cron, then stops unscheduled writers and fences both startup dumps',
    async ({ assert }) => {
    const f = maintenanceFixture()
    await f.act('stop')
    assert.equal(f.events[0], 'capture')
    assert.isBelow(f.events.indexOf('delete prod-server'), f.events.indexOf('stop queue'))
    assert.deepEqual(f.state.processes.map(item => [item.name, item.cron]), [
      ['queue', null], ['plaid-cleanup', null], ['prod-server', '0 0 * * *'],
    ])
    assert.equal(f.state.phase, 'fenced')
    assert.isEmpty([...f.jobs])
    f.fireCron()
    assert.isTrue(f.entries.every(item => item.pid === 0 && item.pm2_env.status === 'stopped'))
    assert.equal(f.calls.filter(args => args[0] === 'save').length, 2)
    await f.act('verify')
  })
  test('restores exact original schedule only after successful database preparation').with([
    '0 0 * * *', '7 2 * * 1-5'])
    .run(async ({ assert }, cron) => {
      const f = maintenanceFixture(cron)
      await f.act('stop')
      await assert.rejects(() => f.act('start'), 'database_preparation_not_confirmed')
      assert.isFalse(f.calls.some(args => args[0] === 'start'))
      await f.act('prepared'); await f.act('start')
      assert.equal(f.state.phase, 'restored')
      assert.deepEqual(f.entries.map(item => item.name), ['queue', 'plaid-cleanup', 'prod-server'])
      assert.equal(f.entries.find(item => item.name === 'prod-server').pm2_env.cron_restart, cron)
      assert.isTrue(f.entries.filter(item => item.name !== 'prod-server').every(item => !Object
        .hasOwn(item.pm2_env, 'cron_restart')))
      await f.act('complete')
      assert.isUndefined(f.state)
      assert.equal(f.archive[0].phase, 'complete')
      assert.equal(f.archive[0].processes[2].cron, cron)
    })
  test('migration failure or interruption never restarts writers or overwrites original capture',
    async ({ assert }) => {
    const f = maintenanceFixture()
    await f.act('stop')
    const original = clone(f.state)
    await assert.rejects(() => f.act('stop'), 'maintenance_already_active')
    await assert.rejects(() => f.act('start'), 'database_preparation_not_confirmed')
    await assert.rejects(() => f.act('complete'), 'pm2_restoration_not_verified')
    assert.deepEqual(f.state, original)
    assert.isFalse(f.calls.some(args => args[0] === 'start'))
  })
  test('missing or malformed state fails before any process mutations').with([undefined, {}, {
    format: 1, processes: [] }])
    .run(async ({ assert }, state) => {
      const f = maintenanceFixture(); f.state = state
      await assert.rejects(() => f.act('start'))
      assert.isEmpty(f.calls)
    })
  test('unknown live schedules fail before creating maintenance state or changing processes',
    async ({ assert }) => {
    const f = maintenanceFixture()
    f.entries.find(item => item.name === 'prod-server').pm2_env.cron_restart = '5 5 * * *'
    await assert.rejects(() => f.act('stop'), 'pm2_schedule_manifest_mismatch')
    assert.isUndefined(f.state)
    assert.isTrue(f.calls.every(args => args[0] === 'jlist'))
  })
  test('failure to disable or verify cron never reaches migration-ready state').with(['command',
    'verification'])
    .run(async ({ assert }, mode) => {
      const f = maintenanceFixture()
      if (mode === 'command') f.fail = 'delete prod-server'
      else f.ignoreDelete = true
      await assert.rejects(() => f.act('stop'))
      assert.equal(f.state.phase, 'captured')
      assert.equal(f.state.processes[2].cron, '0 0 * * *')
      assert.isFalse(f.calls.some(args => args[0] === 'start' || args[0] === 'save'))
    })
  test('writer shutdown and persisted dump failures keep maintenance active').with(['stop', 'dump'])
    .run(async ({ assert }, mode) => {
      const f = maintenanceFixture()
      if (mode === 'stop') f.fail = 'stop queue'
      else f.corruptDump = true
      await assert.rejects(() => f.act('stop'))
      assert.equal(f.state.phase, 'captured')
      assert.isFalse(f.calls.some(args => args[0] === 'start'))
    })
  test('PM2 still reporting a running writer blocks migration', async ({ assert }) => {
    const f = maintenanceFixture()
    f.ignoreStop = true
    await assert.rejects(() => f.act('stop'), 'pm2_writer_not_fenced')
    assert.equal(f.state.phase, 'captured')
    assert.isFalse(f.calls.some(args => args[0] === 'start'))
  })
  test('maintenance trusts PM2 without requiring a process inventory', async ({ assert }) => {
    const f = maintenanceFixture()
    await f.act('stop'); await f.act('verify'); await f.act('prepared')
    assert.notProperty(f.state, 'writers')
    await f.act('start'); await f.act('complete')
    assert.isUndefined(f.state)
    const source = await readFile(new URL('../../installer/managePm2.mjs', import.meta.url), 'utf8')
    assert.notInclude(source, 'processTable')
    assert.notInclude(source, 'writerProcesses')
    assert.notInclude(source, '/proc')
  })
  test('PM2 reactivation blocks verification, preparation and startup').with(['verify', 'prepared',
    'start'])
    .run(async ({ assert }, action) => {
      const f = maintenanceFixture()
      await f.act('stop')
      if (action === 'start') await f.act('prepared')
      const writer = f.entries.find(item => item.name === 'queue')
      writer.pm2_env.status = 'online'; writer.pid = 999
      await assert.rejects(() => f.act(action), 'pm2_writer_not_fenced')
      assert.isFalse(f.calls.some(args => args[0] === 'start'))
    })
  test('restoration failure fences partial startup and retains original schedules', async ({
    assert }) => {
    const f = maintenanceFixture()
    await f.act('stop'); await f.act('prepared')
    f.fail = 'start ' + root + '/spendcraft/bin/server.js'
    await assert.rejects(() => f.act('start'), 'injected_pm2_failure')
    assert.equal(f.state.phase, 'resume-failed')
    assert.equal(f.state.processes[2].cron, '0 0 * * *')
    assert.isEmpty(f.entries)
    assert.isEmpty([...f.jobs])
    assert.isEmpty(f.archive)
    await assert.rejects(() => f.act('start'), 'database_preparation_not_confirmed')
  })
  test('failure to restore the effective cron schedule fences startup', async ({ assert }) => {
    const f = maintenanceFixture()
    await f.act('stop'); await f.act('prepared')
    f.ignoreStartCron = true
    await assert.rejects(() => f.act('start'), 'restored_pm2_process_unhealthy')
    assert.equal(f.state.phase, 'resume-failed')
    assert.isEmpty(f.entries)
    assert.isEmpty(f.archive)
  })
  test('legacy maintenance keeps unscheduled outside applications stopped without adopting them',
    async ({ assert }) => {
    const f = maintenanceFixture(); f.previous = undefined
    f.entries.push({ name: 'outside', pid: 88, pm2_env: { name: 'outside', pm_cwd: '/other',
      pm_exec_path: '/other/server.js', status: 'online' } })
    await f.act('stop'); await f.act('prepared'); await f.act('start')
    assert.equal(f.entries.find(item => item.name === 'outside').pm2_env.status, 'stopped')
    assert.equal(f.entries.filter(item => item.pm2_env.status === 'online').length, 3)
  })
  test('fresh installation fences empty startup dumps before starting its manifest', async ({
    assert }) => {
    const f = maintenanceFixture(); f.previous = undefined
    f.entries.splice(0); f.jobs.clear()
    await f.act('stop'); await f.act('prepared'); await f.act('start'); await f.act('complete')
    assert.equal(f.entries.length, 3)
    assert.isUndefined(f.state)
  })
  test('saved startup corruption blocks completion without clearing state', async ({ assert }) => {
    const f = maintenanceFixture()
    await f.act('stop'); await f.act('prepared'); await f.act('start')
    f.corruptDump = true
    await assert.rejects(() => f.act('complete'))
    assert.equal(f.state.phase, 'restored')
    assert.isEmpty(f.archive)
  })
  test(
    ("durable state is private, exclusive, survives " +
"interruption, and is archived only at completion"), async ({ assert }) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'installer-pm2-fence-')))
    try {
      const store = await maintenanceStore(directory)
      const value = { id: 'fixture', phase: 'captured', processes: [{ name: 'prod-server', cron:
        '7 2 * * *' }] }
      await store.capture(value)
      assert.equal((await stat(join(directory, 'maintenance/installer-pm2.json'))).mode & 0o777,
        0o600)
      await assert.rejects(() => store.capture(value))
      assert.deepEqual(await (await maintenanceStore(directory)).read(), value)
      await store.save({ ...value, phase: 'fenced' })
      await store.complete(value)
      await assert.rejects(() => store.read())
      const [archive] = await readdir(join(directory, 'maintenance'))
      assert.equal(archive, 'installer-pm2-fixture.complete.json')
      assert.equal(JSON.parse(await readFile(join(directory, 'maintenance', archive), 'utf8'))
        .phase, 'complete')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  test('malformed persisted JSON is not silently replaced', async ({ assert }) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'installer-pm2-fence-')))
    try {
      const store = await maintenanceStore(directory)
      await writeFile(join(directory, 'maintenance/installer-pm2.json'), 'not-json', {
        mode: 0o600 })
      await assert.rejects(() => store.read())
      await assert.rejects(() => store.capture({}))
      assert.equal(await readFile(join(directory, 'maintenance/installer-pm2.json'), 'utf8'),
        'not-json')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  test('shell keeps fence across backup, migrations, seeders, swap and final checks', async ({
    assert }) => {
    const shell = await readFile('installer/install.sh0', 'utf8')
    assert.isBelow(shell.indexOf('Unfinished PM2 maintenance exists'), shell.indexOf('unzip'))
    assert.isBelow(shell.indexOf('--action stop'), shell.indexOf('installer/backup.sh'))
    assert.include(shell.slice(shell.indexOf('node ace migration:status'), shell.indexOf(
      '--action prepared')), 'seed_database')
    assert.isAbove(shell.indexOf('--action prepared'), shell.indexOf('node ace migration:run'))
    assert.isAbove(shell.indexOf('--action start'), shell.indexOf('confirm_deployment RESUME'))
    assert.isAbove(shell.indexOf('--action complete'), shell.indexOf('sudo systemctl reload nginx'))
    assert.include(shell, 'set -e')
  })
  test('actual database-preparation shell stops on failure before allowing resume').with(['success',
    'status', 'migration', 'seed'])
    .run(async ({ assert }, failure) => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'installer-pm2-sequence-')))
      try {
        const shell = await readFile('installer/install.sh0', 'utf8')
        const start = shell.indexOf('node installer/managePm2.mjs --root "$SPENDCRAFT_ROOT"')
        const fragment = shell.slice(start, shell.indexOf('\npopd', start))
        const stubs = `set -e
node() {
  printf '%s\\n' "$*" >> "$CALL_LOG"
  case "$*:$FAILURE" in
    'ace migration:status:status'|'ace migration:run:migration') return 37 ;;
  esac
}
seed_database() {
  printf '%s\\n' 'seed_database' >> "$CALL_LOG"
  if [ "$FAILURE" = seed ]; then return 37; fi
}
`
        const operation = () => execute('bash', ['-c', stubs + fragment], { env: { ...process.env,
          SPENDCRAFT_ROOT: directory, CALL_LOG: join(directory, 'calls'), FAILURE: failure } })
        if (failure === 'success') await operation()
        else await assert.rejects(operation)
        const calls = await readFile(join(directory, 'calls'), 'utf8')
        assert.include(calls, '--action verify')
        assert.notInclude(calls, '--action start')
        assert.equal(calls.includes('--action prepared'), failure === 'success')
        if (failure === 'status' || failure === 'migration') assert.notInclude(calls,
          'seed_database')
      } finally { await rm(directory, { recursive: true, force: true }) }
    })
})
function manifest(name = 'worker', args = ['old:command']) {
  return { format: 1, processes: [{ name, script: 'ace.js', cwd: '.', interpreter: 'node', args,
    time: true }] }
}
function entry(name = 'worker', status = 'online') {
  return { name, pm2_env: { pm_exec_path: root + '/spendcraft/ace.js', pm_cwd: root + '/spendcraft',
    status } }
}

test.group('Release-owned PM2 process manifest (no real services)', () => {
  test('actual manifest preserves all current installer process settings and startup order', async (
    { assert }) => {
    const actual = validateProcessManifest(JSON.parse(await readFile('installer/pm2-processes.json',
      'utf8')))
    const definitions = processDefinitions(actual, root + '/spendcraft')
    assert.deepEqual(definitions.map((item) => item.name), ['queue', 'plaid-cleanup',
      'prod-server'])
    assert.deepEqual(definitions[0].args, ['queue:listener'])
    assert.deepEqual(definitions[1].args, ['plaid:cleanup-listener'])
    assert.equal(definitions[1].killTimeout, 30000)
    assert.equal(definitions[1].restartDelay, 5000)
    assert.equal(definitions[2].script, root + '/spendcraft/bin/server.js')
    assert.equal(definitions[2].cronRestart, '0 0 * * *')
    const args = processStartArgs(definitions[1])
    assert.deepEqual(args.slice(-6), ['--kill-timeout', '30000', '--restart-delay', '5000', '--',
      'plaid:cleanup-listener'])
    assert.include(processStartArgs(definitions[2]), '--cron')
    assert.notInclude(processStartArgs(definitions[2], true), '--cron')
  })
  test('rejects traversal, absolute paths, duplicates and credential/environment fields', ({
    assert }) => {
    for (const change of [{ script: '../escape.js' }, { cwd: '/production' }, { script:
      '/absolute' },
      { interpreter: 'bash' }, { args: 'command' }, { killTimeout: -1 }, { restartDelay: 0.5 },
      { cronRestart: 'invalid' }, { env: { SECRET: 'no' } }]) {
      const value = manifest()
      Object.assign(value.processes[0], change)
      assert.throws(() => validateProcessManifest(value))
    }
    assert.throws(() => validateProcessManifest({ format: 1, processes: [] }))
    const value = manifest(); value.processes.push(value.processes[0])
    assert.throws(() => validateProcessManifest(value), 'invalid_process_manifest_entry')
  })
  test('definitions are portable and support isolated sandbox names', ({ assert }) => {
    const definitions = processDefinitions(manifest(), '/another/server/spendcraft', 'sandbox-')
    assert.equal(definitions[0].name, 'sandbox-worker')
    assert.equal(definitions[0].script, '/another/server/spendcraft/ace.js')
    assert.equal(definitions[0].interpreter, process.execPath)
  })
  test('installer stops the union of previous and incoming release processes', async ({ assert }) =>
    {
    const calls = []
    await manageProcesses({ action: 'stop', root, incoming: manifest('new-worker'),
      previous: manifest('old-worker'),
      entries: [entry('old-worker'), entry('new-worker'), { name: 'unrelated', pm2_env: {
        pm_exec_path: '/other/app', pm_cwd: '/other' } }],
      run: async (args) => calls.push(args) })
    assert.deepEqual(calls, [['stop', 'old-worker'], ['stop', 'new-worker']])
  })
  test('foreign same-name process rejects before stopping any managed process', async ({
    assert }) => {
    const calls = []
    const foreign = entry('new-worker'); foreign.pm2_env.pm_exec_path = '/other/server.js'
    await assert.rejects(() => manageProcesses({ action: 'stop', root, incoming: manifest(
      'new-worker'), previous: manifest('old-worker'),
      entries: [entry('old-worker'), foreign], run: async (args) => calls.push(args) }),
        'foreign_managed_process')
    assert.lengthOf(calls, 0)
  })
  test('unknown in-root writers and duplicate process names reject before mutations', async ({
    assert }) => {
    for (const entries of [[entry(), entry('unknown')], [entry(), entry()]]) {
      const calls = []
      await assert.rejects(() => manageProcesses({ action: 'stop', root, incoming: manifest(),
        previous: manifest(), entries, run: async (args) => calls.push(args) }))
      assert.lengthOf(calls, 0)
    }
  })
  test(
    'missing installed manifest stops every selected-daemon PM2 application, including \
outside-root apps', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(),
      entries: [entry(), { name: 'another-app', pm2_env: { pm_exec_path: '/other/app', pm_cwd:
        '/other', status: 'online' } }],
      run: async (args) => calls.push(args) })
    assert.deepEqual(calls, [['stop', 'all']])
  })
  test('legacy shutdown reports every process name before issuing stop all', async ({ assert }) => {
    const events = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(), entries: [entry('first'),
      entry('second')],
      print: (message) => events.push(message), run: async (args) => events.push(args) })
    assert.deepEqual(events, ['Stopping PM2 process: "first"', 'Stopping PM2 process: "second"', [
      'stop', 'all']])
  })
  test('manifest startup and shutdown report each process before its command', async ({ assert }) =>
    {
    const events = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(), previous: manifest(),
      entries: [entry()],
      print: (message) => events.push(message), run: async (args) => events.push(args) })
    assert.deepEqual(events, ['Stopping PM2 process: "worker"', ['stop', 'worker']])
    events.length = 0
    await manageProcesses({ action: 'start', root, incoming: manifest(), entries: [],
      print: (message) => events.push(message), run: async (args) => events.push(args) })
    assert.equal(events[0], 'Starting PM2 process: "worker"')
    assert.equal(events[1][0], 'start')
  })
  test('empty legacy PM2 daemon needs no stop command', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(), entries: [], run: async (
      args) => calls.push(args) })
    assert.lengthOf(calls, 0)
  })
  test('legacy startup leaves unknown stopped apps alone and creates only incoming processes',
    async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'start', root, incoming: manifest(),
      entries: [entry('retired-worker', 'stopped')], run: async (args) => calls.push(args) })
    assert.lengthOf(calls, 1)
    assert.equal(calls[0][0], 'start')
    assert.equal(calls[0][calls[0].indexOf('--name') + 1], 'worker')
  })
  test(
    'installer replaces stopped definitions and starts incoming arguments instead of stale saved \
definitions', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'start', root, incoming: manifest('new-worker', [
      'new:command']), previous: manifest('old-worker'),
      entries: [entry('old-worker', 'stopped')], run: async (args) => calls.push(args) })
    assert.deepEqual(calls[0], ['delete', 'old-worker'])
    assert.deepEqual(calls[1].slice(-2), ['--', 'new:command'])
    assert.equal(calls[1][calls[1].indexOf('--name') + 1], 'new-worker')
  })
  test('installer will not replace an application that is still running', async ({ assert }) => {
    const calls = []
    await assert.rejects(() => manageProcesses({ action: 'start', root, incoming: manifest(),
      entries: [entry()],
      run: async (args) => calls.push(args) }), 'managed_process_not_stopped')
    assert.lengthOf(calls, 0)
  })
  test('rollback starts the previous release definitions, suppressing maintenance cron', async ({
    assert }) => {
    const old = manifest('old-worker', ['old:command']); old.processes[0].cronRestart = '0 0 * * *'
    const calls = []
    await replaceProcesses(['new-worker'], processDefinitions(old, root + '/spendcraft'), async (
      args) => calls.push(args), true)
    assert.deepEqual(calls[0], ['delete', 'new-worker'])
    assert.equal(calls[1][calls[1].indexOf('--name') + 1], 'old-worker')
    assert.deepEqual(calls[1].slice(-2), ['--', 'old:command'])
    assert.notInclude(calls[1], '--cron')
  })
  test('failed replacement does not continue starting subsequent processes', async ({ assert }) => {
    const calls = []
    await assert.rejects(() => replaceProcesses(['current'], processDefinitions(manifest(
      'previous'), root + '/spendcraft'), async (args) => {
      calls.push(args); throw new Error('injected_failure')
    }), 'injected_failure')
    assert.deepEqual(calls, [['delete', 'current']])
  })
  test('matching permits Node shorthand but rejects changed commands, paths and other interpreters',
    ({ assert }) => {
    const definition = processDefinitions(manifest(), root + '/spendcraft')[0]
    const env = { pm_exec_path: definition.script, pm_cwd: definition.cwd, exec_interpreter: 'node',
      args: definition.args }
    assert.isTrue(matchesDefinition(env, definition))
    for (const change of [{ pm_cwd: '/foreign' }, { args: ['wrong'] }, { exec_interpreter:
      '/bin/bash' }]) {
      assert.isFalse(matchesDefinition({ ...env, ...change }, definition))
    }
    assert.isFalse(matchesDefinition(env, { ...definition, interpreter: '/bin/bash' }))
  })
  test('manifest shutdown timeout and restart delay must match live metadata', ({ assert }) => {
    const definition = { ...processDefinitions(manifest(), root + '/spendcraft')[0],
      killTimeout: 30000, restartDelay: 5000 }
    const env = { pm_exec_path: definition.script, pm_cwd: definition.cwd, exec_interpreter: 'node',
      args: definition.args,
      kill_timeout: 30000, restart_delay: 5000 }
    assert.isTrue(matchesDefinition(env, definition))
    assert.isFalse(matchesDefinition({ ...env, kill_timeout: 100 }, definition))
    assert.isFalse(matchesDefinition({ ...env, restart_delay: 0 }, definition))
  })
  test('shell delegates process control and packaging includes the manifest and helpers', async ({
    assert }) => {
    const shell = await readFile('installer/install.sh0', 'utf8')
    assert.notInclude(shell, 'pm2 logs')
    assert.include(shell, '--action stop')
    assert.include(shell, '--action start')
    for (const name of ['prod-server', 'plaid-cleanup', 'queue']) assert.notMatch(shell, new RegExp(
      'pm2 (?:start|stop|restart) ' + name))
    assert.isBelow(shell.indexOf('--action stop'), shell.indexOf('npm ci'))
    assert.isAbove(shell.indexOf('--action start'), shell.indexOf('confirm_deployment RESUME'))
    const packaging = await readFile('adonisrc.ts', 'utf8')
    for (const file of ['pm2-processes.json', 'managePm2.mjs', 'lib/pm2Processes.mjs']) assert
      .include(packaging, 'installer/' + file)
    const executor = await readFile('installer/rollbackApplication.mjs', 'utf8')
    assert.include(executor, 'const restored = plan.previousProcesses ?? plan.processes')
    assert.include(executor,
      'replaceProcesses(plan.processes.map((item) => item.name), restored, pm2, true)')
    assert.include(executor, "throw new Error('process_manifest_mismatch')")
  })
})
