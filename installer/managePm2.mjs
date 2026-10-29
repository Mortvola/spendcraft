// Installer process control. Uses release-owned manifest, never a process-name list in shell.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { realpath, mkdir, open, readFile, lstat, rename, link, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { inside, readProcessManifest, processDefinitions, replaceProcesses,
  matchesDefinition } from './lib/pm2Processes.mjs'
import { verifyPm2Runtime } from './rollbackApplication.mjs'
const execute = promisify(execFile)
const actions = ['stop', 'verify', 'prepared', 'start', 'complete', 'resume']
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const schedule = env => [undefined, null, false, 0, '0', ''].includes(env
  ?.cron_restart) ? null : env.cron_restart

function validateState(state, root, incoming) {
  if (state?.format !== 1 || state.root !== root || state.manifest !== digest(incoming)
    || !/^[a-f0-9-]{36}$/.test(state.id ?? '')
    || !['captured', 'fenced', 'prepared', 'resuming', 'restored', 'resume-failed', 'complete']
      .includes(state.phase)
    || !Array.isArray(state.processes) || state.processes.length > 128
    || new Set(state.processes.map(item => item?.name)).size !== state.processes
      .length) throw new Error('invalid_installer_pm2_maintenance_state')
  for (const item of state.processes) {
    if (typeof item.name !== 'string' || !item.name || (item.cron !== null
      && (typeof item.cron !== 'string' || item.cron.trim().split(/\s+/)
        .length !== 5))) throw new Error('invalid_saved_pm2_schedule')
  }
  if (state.installation !== undefined && (!/^[a-f0-9]{64}$/.test(state.installation?.installer)
    || !/^[a-f0-9]{64}$/.test(state.installation?.source))) throw new Error(
      'invalid_installer_resume_identity')
  return state
}

// A single durable record in the existing maintenance directory. Never replace
// an interrupted installation's record; normal completion archives it.
export async function maintenanceStore(root) {
  const directory = join(root, 'maintenance'), file = join(directory, 'installer-pm2.json')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (await realpath(directory) !== directory) throw new Error('unsafe_maintenance_directory')
  const parent = await open(root, 'r')
  try { await parent.sync() } finally { await parent.close() }
  async function syncDirectory() {
    const handle = await open(directory, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
  async function write(path, value) {
    const handle = await open(path, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(
      ) } finally { await handle.close() }
  }
  return {
    async capture(state) { await write(file, state); await syncDirectory() },
    async read() {
      const stat = await lstat(file)
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat
        .size > 65536) throw new Error('unsafe_installer_pm2_maintenance_state')
      return JSON.parse(await readFile(file, 'utf8'))
    },
    async save(state) {
      const temporary = file + '.tmp'
      await write(temporary, state)
      await rename(temporary, file)
      await syncDirectory()
    },
    async complete(state) {
      await this.save({ ...state, phase: 'complete' })
      await link(file, join(directory, `installer-pm2-${state.id}.complete.json`))
      await syncDirectory()
      await unlink(file)
      await syncDirectory()
    },
  }
}

function assertFence(entries, state) {
  if (!Array.isArray(entries)) throw new Error('invalid_pm2_inventory')
  for (const item of state.processes) {
    const matches = entries.filter(entry => entry.name === item.name)
    // PM2 delete removes cron BEFORE stopProcessId. That registration must stay
    // absent until database preparation is explicitly marked complete.
    if (item.cron !== null) {
      if (matches.length) throw new Error('scheduled_pm2_writer_still_registered')
    } else if (matches.length !== 1 || schedule(matches[0].pm2_env) !== null
      || matches[0].pm2_env.status !== 'stopped' || matches[0].pid > 0) throw new Error(
        'pm2_writer_not_fenced')
  }
  if (entries.some(entry => (inside(state.root, entry.pm2_env?.pm_cwd ?? '/')
    || inside(state.root, entry.pm2_env?.pm_exec_path ?? '/'))
    && !state.processes.some(item => item.name === entry.name))) throw new Error(
      'unmanaged_installation_process')
}

function assertOnline(entries, root, incoming) {
  for (const definition of processDefinitions(incoming, join(root, 'spendcraft'))) {
    const matches = entries.filter(entry => entry.name === definition.name)
    if (matches.length !== 1 || !matchesDefinition(matches[0].pm2_env, definition)
      || schedule(matches[0].pm2_env) !== (definition.cronRestart ?? null)
      || matches[0].pm2_env.status !== 'online' || !(matches[0].pid > 0)) throw new Error(
        'restored_pm2_process_unhealthy')
  }
}

async function savedState(run, dumps, check) {
  // As in existing rollback maintenance: both primary and fallback must be safe
  // for the reviewed PM2 resurrection path, not merely the live daemon.
  await run(['save', '--force'])
  await run(['save', '--force'])
  for (const name of ['dump.pm2', 'dump.pm2.bak']) {
    const entries = await dumps(name)
    if (!Array.isArray(entries)) throw new Error('invalid_pm2_startup_dump')
    check(entries.map(env => ({ name: env.name, pid: env.status === 'online' ? 1 : 0,
      pm2_env: env })))
  }
}

export async function installerMaintenance({ action, root, incoming, previous, run, store, dumps,
  installation, print = message => console.log(message) }) {
  // PM2's stopped status confirms shutdown of managed writers and their children.
  // Cron registrations and both startup dumps are fenced separately below.
  const list = async () => JSON.parse((await run(['jlist'])).stdout)
  let state
  if (action === 'stop') {
    const entries = await list(), commands = []
    // Reuse all existing process ownership/legacy admission BEFORE mutations.
    await manageProcesses({ action, root, incoming, previous, entries, run: async args => commands
      .push(args), print: () => undefined })
    const targets = entries.filter(entry => commands.some(args => args[1] === 'all' || args[
      1] === entry.name))
    const desired = processDefinitions(incoming, join(root, 'spendcraft'))
    state = validateState({ format: 1, id: randomUUID(), root, manifest: digest(incoming), phase:
      'captured',
      ...(installation ? { installation } : {}),
      processes: targets.map(entry => ({ name: entry.name, cron: schedule(entry.pm2_env) })) },
        root, incoming)
    for (const item of state.processes) {
      const definition = desired.find(value => value.name === item.name)
      // Do not silently replace an operator's schedule with a release default.
      if (item.cron !== (definition?.cronRestart ?? null)) throw new Error(
        'pm2_schedule_manifest_mismatch')
    }
    await store.capture(state) // Exclusive durable capture; interrupted state blocks a new install.
    for (const item of state.processes.filter(value => value.cron !== null)) {
      print('Removing scheduled PM2 registration before writer shutdown: ' + JSON.stringify(item
        .name))
      await run(['delete', item.name])
      if ((await list()).some(entry => entry.name === item.name)) throw new Error(
        'pm2_schedule_disable_failed')
    }
    for (const item of state.processes.filter(value => value.cron === null)) {
      print('Stopping PM2 process: ' + JSON.stringify(item.name))
      await run(['stop', item.name])
    }
    assertFence(await list(), state)
    await savedState(run, dumps, entries => assertFence(entries, state))
    state.phase = 'fenced'
    await store.save(state)
    return
  }
  state = validateState(await store.read(), root, incoming)
  if (action === 'resume') {
    if (!installation || !state.installation
      || installation.installer !== state.installation.installer
      || installation.source !== state.installation.source) throw new Error(
        'installer_resume_release_mismatch')
    if (!['prepared', 'restored'].includes(state.phase)) throw new Error(
      'installer_resume_requires_recovery_review')
    const check = entries => state.phase === 'prepared' ? assertFence(entries, state)
      : assertOnline(entries, root, incoming)
    check(await list())
    for (const name of ['dump.pm2', 'dump.pm2.bak']) {
      const entries = await dumps(name)
      if (!Array.isArray(entries)) throw new Error('invalid_pm2_startup_dump')
      check(entries.map(env => ({ name: env.name, pid: env.status === 'online' ? 1 : 0,
        pm2_env: env })))
    }
    return state.phase
  }
  if (action === 'verify' || action === 'prepared') {
    if (state.phase !== 'fenced' && !(action === 'verify' && state.phase ===
      'prepared')) throw new Error('installer_pm2_fence_not_ready')
    assertFence(await list(), state)
    // Verify saved state without rewriting it or introducing new restarts.
    for (const name of ['dump.pm2', 'dump.pm2.bak']) {
      const entries = await dumps(name)
      if (!Array.isArray(entries)) throw new Error('invalid_pm2_startup_dump')
      assertFence(entries.map(env => ({ name: env.name, pid: env.status === 'online' ? 1 : 0,
        pm2_env: env })), state)
    }
    if (action === 'prepared') { state.phase = 'prepared'; await store.save(state) }
    return
  }
  if (action === 'start') {
    if (state.phase !== 'prepared') throw new Error('database_preparation_not_confirmed')
    assertFence(await list(), state)
    state.phase = 'resuming'
    await store.save(state)
    try {
      await manageProcesses({ action, root, incoming, previous, entries: await list(), run, print })
      assertOnline(await list(), root, incoming)
      await savedState(run, dumps, entries => assertOnline(entries, root, incoming))
      state.phase = 'restored'
      await store.save(state)
    } catch (error) {
      // Only fence partial startup; never retry startup, migration or recovery.
      try {
        const entries = await list()
        for (const definition of processDefinitions(incoming, join(root, 'spendcraft'))) {
          if (entries.some(entry => entry.name === definition.name)) await run(['delete', definition
            .name])
        }
        await run(['save', '--force']); await run(['save', '--force'])
      } catch { /* Preserve the original error and the active durable record. */ }
      state.phase = 'resume-failed'
      await store.save(state)
      throw error
    }
    return
  }
  if (action === 'complete') {
    if (state.phase !== 'restored') throw new Error('pm2_restoration_not_verified')
    assertOnline(await list(), root, incoming)
    await savedState(run, dumps, entries => assertOnline(entries, root, incoming))
    await store.complete(state)
    return
  }
  throw new Error('invalid_process_action')
}

export async function manageProcesses({ action, root, incoming, entries, run, previous, print = (
  message) => console.log(message) }) {
  if (!['stop', 'start'].includes(action)) throw new Error('invalid_process_action')
  if (!Array.isArray(entries)) throw new Error('invalid_pm2_inventory')
  const desired = processDefinitions(incoming, join(root, 'spendcraft'))
  if (action === 'stop' && !previous) {
    // Explicit legacy-upgrade policy: stop every app in the selected PM2 daemon.
    if (entries.length) {
      for (const entry of entries) print('Stopping PM2 process: ' + JSON.stringify(entry.name))
      await run(['stop', 'all'])
    }
    return
  }
  const old = previous ? processDefinitions(previous, join(root, 'spendcraft')) : desired
  const names = [...new Set([...old, ...desired].map((item) => item.name))]
  for (const name of names) {
    const matches = entries.filter((entry) => entry.name === name)
    if (matches.length > 1) throw new Error('duplicate_managed_process')
    if (!matches.length) continue
    const env = matches[0].pm2_env
    // Legacy queue wrappers may live at the installation root. Never touch a same-named foreign
    // app.
    if (!env || !inside(root, env.pm_exec_path ?? '/') || !inside(root, env.pm_cwd ??
      '/')) throw new Error('foreign_managed_process')
    if (action === 'start' && env.status !== 'stopped') throw new Error(
      'managed_process_not_stopped')
  }
  if (entries.some((entry) => (inside(root, entry.pm2_env?.pm_exec_path ?? '/')
    || inside(root, entry.pm2_env?.pm_cwd ?? '/')) && !names.includes(entry.name)
    && (previous || entry.pm2_env?.status !== 'stopped'))) throw new Error(
      'unmanaged_installation_process')
  // Complete admission before any stop/delete/start command.
  const existing = names.filter((name) => entries.some((entry) => entry.name === name))
  if (action === 'start') {
    await replaceProcesses(existing, desired, async (args) => {
      if (args[0] === 'start') print('Starting PM2 process: ' + JSON.stringify(args[args.indexOf(
        '--name') + 1]))
      return run(args)
    })
  } else {
    for (const name of existing) {
      print('Stopping PM2 process: ' + JSON.stringify(name))
      await run(['stop', name])
    }
  }

}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { root: { type: 'string' }, action: {
    type: 'string' }, release: { type: 'string' }, 'installer-sha': { type: 'string' } } })
  if (!values.root || !values.release || !actions.includes(values.action)) throw new Error(
    'explicit_process_action_required')
  const root = resolve(values.root), release = resolve(values.release)
  if (await realpath(root) !== root || ![join(root, 'spendcraft.new'), join(root, 'spendcraft')]
    .includes(release)) throw new Error('unsafe_process_root')
  const incoming = await readProcessManifest(release)
  if (values.action === 'resume' && release !== join(root, 'spendcraft')) throw new Error(
    'installer_resume_requires_installed_release')
  let installation
  if (values['installer-sha']) {
    if (!/^[a-f0-9]{64}$/.test(values['installer-sha'])) throw new Error(
      'invalid_installer_resume_identity')
    installation = { installer: values['installer-sha'], source: createHash('sha256').update(
      await readFile(join(release, 'release-source.json'))).digest('hex') }
  }
  let previous
  if (values.action === 'stop' || values.action === 'start') {
    try { previous = await readProcessManifest(join(root, values.action === 'stop' ? 'spendcraft' :
      'spendcraft.old')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const executable = (await execute('which', ['pm2'])).stdout.trim()
  await verifyPm2Runtime(executable) // Existing reviewed 5.4.1 / 7.1.0 resurrection admission.
  const pm2Home = await realpath(process.env.PM2_HOME || join(homedir(), '.pm2'))
  const run = args => execute(executable, args, { env: { ...process.env, PM2_HOME: pm2Home,
    NODE_ENV: 'production' }, maxBuffer: 8 * 1024 * 1024 })
  const dumps = async name => {
    const path = join(pm2Home, name), stat = await lstat(path)
    if (!stat.isFile() || stat.uid !== process.getuid()) throw new Error('unsafe_pm2_startup_dump')
    const handle = await open(path, 'r')
    let entries
    try { await handle.sync(); entries = JSON.parse(await handle.readFile('utf8')) } finally {
      await handle.close() }
    const directory = await open(pm2Home, 'r')
    try { await directory.sync() } finally { await directory.close() }
    return entries
  }
  const phase = await installerMaintenance({ action: values.action, root, incoming, previous,
    installation, run, dumps,
    store: await maintenanceStore(root) })
  if (values.action === 'resume') console.log(phase)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('PM2 manifest operation failed: ' + (/^[a-z][a-z0-9_]+$/.test(error
      .message) ? error.message : 'inspect_process_configuration'))
    console.error(
      'Keep maintenance enabled. Preserve maintenance/installer-pm2.json and both PM2 startup \
dumps. Do not rerun installation or resume writers until database safety is independently \
verified; no automatic recovery was attempted.')
    console.error(
      'Recovery review must establish the actual migration journal, transaction/seeder outcome and \
installed release identity, then use the existing separately authorized readiness and manual \
finalization procedure. Do not delete or edit the saved schedule record to bypass admission.')
    process.exitCode = 1
  })
}
