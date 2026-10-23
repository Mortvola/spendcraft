import { test } from '@japa/runner'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { validateProcessManifest, processDefinitions, processStartArgs, matchesDefinition, replaceProcesses } from '../../installer/lib/pm2Processes.mjs'
import { manageProcesses } from '../../installer/managePm2.mjs'

const root = '/fixture/server'
function manifest(name = 'worker', args = ['old:command']) {
  return { format: 1, processes: [{ name, script: 'ace.js', cwd: '.', interpreter: 'node', args, time: true }] }
}
function entry(name = 'worker', status = 'online') {
  return { name, pm2_env: { pm_exec_path: root + '/spendcraft/ace.js', pm_cwd: root + '/spendcraft', status } }
}

test.group('Release-owned PM2 process manifest (no real services)', () => {
  test('actual manifest preserves all current installer process settings and startup order', async ({ assert }) => {
    const actual = validateProcessManifest(JSON.parse(await readFile('installer/pm2-processes.json', 'utf8')))
    const definitions = processDefinitions(actual, root + '/spendcraft')
    assert.deepEqual(definitions.map((item) => item.name), ['queue', 'plaid-cleanup', 'prod-server'])
    assert.deepEqual(definitions[0].args, ['queue:listener'])
    assert.deepEqual(definitions[1].args, ['plaid:cleanup-listener'])
    assert.equal(definitions[1].killTimeout, 30000)
    assert.equal(definitions[1].restartDelay, 5000)
    assert.equal(definitions[2].script, root + '/spendcraft/bin/server.js')
    assert.equal(definitions[2].cronRestart, '0 0 * * *')
    const args = processStartArgs(definitions[1])
    assert.deepEqual(args.slice(-6), ['--kill-timeout', '30000', '--restart-delay', '5000', '--', 'plaid:cleanup-listener'])
    assert.include(processStartArgs(definitions[2]), '--cron')
    assert.notInclude(processStartArgs(definitions[2], true), '--cron')
  })
  test('rejects traversal, absolute paths, duplicates and credential/environment fields', ({ assert }) => {
    for (const change of [{ script: '../escape.js' }, { cwd: '/production' }, { script: '/absolute' },
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
  test('installer stops the union of previous and incoming release processes', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'stop', root, incoming: manifest('new-worker'), previous: manifest('old-worker'),
      entries: [entry('old-worker'), entry('new-worker'), { name: 'unrelated', pm2_env: { pm_exec_path: '/other/app', pm_cwd: '/other' } }],
      run: async (args) => calls.push(args) })
    assert.deepEqual(calls, [['stop', 'old-worker'], ['stop', 'new-worker']])
  })
  test('foreign same-name process rejects before stopping any managed process', async ({ assert }) => {
    const calls = []
    const foreign = entry('new-worker'); foreign.pm2_env.pm_exec_path = '/other/server.js'
    await assert.rejects(() => manageProcesses({ action: 'stop', root, incoming: manifest('new-worker'), previous: manifest('old-worker'),
      entries: [entry('old-worker'), foreign], run: async (args) => calls.push(args) }), 'foreign_managed_process')
    assert.lengthOf(calls, 0)
  })
  test('unknown in-root writers and duplicate process names reject before mutations', async ({ assert }) => {
    for (const entries of [[entry(), entry('unknown')], [entry(), entry()]]) {
      const calls = []
      await assert.rejects(() => manageProcesses({ action: 'stop', root, incoming: manifest(), previous: manifest(), entries, run: async (args) => calls.push(args) }))
      assert.lengthOf(calls, 0)
    }
  })
  test('missing installed manifest stops every selected-daemon PM2 application, including outside-root apps', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(),
      entries: [entry(), { name: 'another-app', pm2_env: { pm_exec_path: '/other/app', pm_cwd: '/other', status: 'online' } }],
      run: async (args) => calls.push(args) })
    assert.deepEqual(calls, [['stop', 'all']])
  })
  test('legacy shutdown reports every process name before issuing stop all', async ({ assert }) => {
    const events = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(), entries: [entry('first'), entry('second')],
      print: (message) => events.push(message), run: async (args) => events.push(args) })
    assert.deepEqual(events, ['Stopping PM2 process: "first"', 'Stopping PM2 process: "second"', ['stop', 'all']])
  })
  test('manifest startup and shutdown report each process before its command', async ({ assert }) => {
    const events = []
    await manageProcesses({ action: 'stop', root, incoming: manifest(), previous: manifest(), entries: [entry()],
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
    await manageProcesses({ action: 'stop', root, incoming: manifest(), entries: [], run: async (args) => calls.push(args) })
    assert.lengthOf(calls, 0)
  })
  test('legacy startup leaves unknown stopped apps alone and creates only incoming processes', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'start', root, incoming: manifest(),
      entries: [entry('retired-worker', 'stopped')], run: async (args) => calls.push(args) })
    assert.lengthOf(calls, 1)
    assert.equal(calls[0][0], 'start')
    assert.equal(calls[0][calls[0].indexOf('--name') + 1], 'worker')
  })
  test('installer replaces stopped definitions and starts incoming arguments instead of stale saved definitions', async ({ assert }) => {
    const calls = []
    await manageProcesses({ action: 'start', root, incoming: manifest('new-worker', ['new:command']), previous: manifest('old-worker'),
      entries: [entry('old-worker', 'stopped')], run: async (args) => calls.push(args) })
    assert.deepEqual(calls[0], ['delete', 'old-worker'])
    assert.deepEqual(calls[1].slice(-2), ['--', 'new:command'])
    assert.equal(calls[1][calls[1].indexOf('--name') + 1], 'new-worker')
  })
  test('installer will not replace an application that is still running', async ({ assert }) => {
    const calls = []
    await assert.rejects(() => manageProcesses({ action: 'start', root, incoming: manifest(), entries: [entry()],
      run: async (args) => calls.push(args) }), 'managed_process_not_stopped')
    assert.lengthOf(calls, 0)
  })
  test('rollback starts the previous release definitions, suppressing maintenance cron', async ({ assert }) => {
    const old = manifest('old-worker', ['old:command']); old.processes[0].cronRestart = '0 0 * * *'
    const calls = []
    await replaceProcesses(['new-worker'], processDefinitions(old, root + '/spendcraft'), async (args) => calls.push(args), true)
    assert.deepEqual(calls[0], ['delete', 'new-worker'])
    assert.equal(calls[1][calls[1].indexOf('--name') + 1], 'old-worker')
    assert.deepEqual(calls[1].slice(-2), ['--', 'old:command'])
    assert.notInclude(calls[1], '--cron')
  })
  test('failed replacement does not continue starting subsequent processes', async ({ assert }) => {
    const calls = []
    await assert.rejects(() => replaceProcesses(['current'], processDefinitions(manifest('previous'), root + '/spendcraft'), async (args) => {
      calls.push(args); throw new Error('injected_failure')
    }), 'injected_failure')
    assert.deepEqual(calls, [['delete', 'current']])
  })
  test('matching permits Node shorthand but rejects changed commands, paths and other interpreters', ({ assert }) => {
    const definition = processDefinitions(manifest(), root + '/spendcraft')[0]
    const env = { pm_exec_path: definition.script, pm_cwd: definition.cwd, exec_interpreter: 'node', args: definition.args }
    assert.isTrue(matchesDefinition(env, definition))
    for (const change of [{ pm_cwd: '/foreign' }, { args: ['wrong'] }, { exec_interpreter: '/bin/bash' }]) {
      assert.isFalse(matchesDefinition({ ...env, ...change }, definition))
    }
    assert.isFalse(matchesDefinition(env, { ...definition, interpreter: '/bin/bash' }))
  })
  test('manifest shutdown timeout and restart delay must match live metadata', ({ assert }) => {
    const definition = { ...processDefinitions(manifest(), root + '/spendcraft')[0], killTimeout: 30000, restartDelay: 5000 }
    const env = { pm_exec_path: definition.script, pm_cwd: definition.cwd, exec_interpreter: 'node', args: definition.args,
      kill_timeout: 30000, restart_delay: 5000 }
    assert.isTrue(matchesDefinition(env, definition))
    assert.isFalse(matchesDefinition({ ...env, kill_timeout: 100 }, definition))
    assert.isFalse(matchesDefinition({ ...env, restart_delay: 0 }, definition))
  })
  test('shell delegates process control and packaging includes the manifest and helpers', async ({ assert }) => {
    const shell = await readFile('installer/install.sh0', 'utf8')
    assert.notInclude(shell, 'pm2 logs')
    assert.include(shell, '--action stop')
    assert.include(shell, '--action start')
    for (const name of ['prod-server', 'plaid-cleanup', 'queue']) assert.notMatch(shell, new RegExp('pm2 (?:start|stop|restart) ' + name))
    assert.isBelow(shell.indexOf('--action stop'), shell.indexOf('npm ci'))
    assert.isAbove(shell.indexOf('--action start'), shell.indexOf('confirm_deployment RESUME'))
    const packaging = await readFile('adonisrc.ts', 'utf8')
    for (const file of ['pm2-processes.json', 'managePm2.mjs', 'lib/pm2Processes.mjs']) assert.include(packaging, 'installer/' + file)
    const executor = await readFile('installer/rollbackTransactionCategoryStorage.mjs', 'utf8')
    assert.include(executor, 'const restored = plan.previousProcesses ?? plan.processes')
    assert.include(executor, 'replaceProcesses(plan.processes.map((item) => item.name), restored, pm2, true)')
    assert.include(executor, "throw new Error('process_manifest_mismatch')")
  })
})
