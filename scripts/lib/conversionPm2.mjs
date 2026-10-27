// Read-only PM2 status checks. Never sends start/stop/restart/delete commands.
import process from 'node:process'
import { readFile, realpath, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, dirname, basename, relative, sep, isAbsolute } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { validateProcessManifest, processDefinitions, matchesDefinition, inside } from '../../installer/lib/pm2Processes.mjs'
import { installerMaintenance } from '../../installer/managePm2.mjs'
import { verifyPm2Runtime, isSingleForkProcess } from '../../installer/rollbackApplication.mjs'

const command = promisify(execFile)
export const defaultManifest = fileURLToPath(new URL('../../installer/pm2-processes.json', import.meta.url))

export function checkStopped(manifest, entries) {
  validateProcessManifest(manifest)
  if (!Array.isArray(entries)) throw new Error('invalid_pm2_process_list')
  const checked = []
  for (const definition of manifest.processes) {
    const matches = entries.filter(entry => entry?.name === definition.name)
    if (matches.length !== 1) throw Object.assign(new Error('pm2_manifest_process_missing_or_duplicate'), { processName: definition.name })
    const entry = matches[0]
    if (entry.pm2_env?.status !== 'stopped' || entry.pid !== 0 || Number(entry.pm2_env?.pm_pid ?? 0) !== 0) {
      throw Object.assign(new Error('pm2_manifest_process_not_stopped'), { processName: definition.name })
    }
    checked.push({ name: definition.name, status: 'stopped', pid: 0 })
  }
  return checked
}

export async function createPm2Guard(options, dependencies = {}) {
  const read = dependencies.readFile ?? readFile
  const canonical = dependencies.realpath ?? realpath
  const run = dependencies.command ?? command
  const stat = dependencies.lstat ?? lstat
  const verifyRuntime = dependencies.verifyPm2Runtime ?? verifyPm2Runtime
  const probe = dependencies.probePid ?? (pid => process.kill(pid, 0))
  const manifestPath = resolve(options['pm2-manifest'] ?? defaultManifest)
  const home = await canonical(resolve(options['pm2-home'] ?? process.env.PM2_HOME ?? join(homedir(), '.pm2')))
  const originalText = await read(manifestPath, 'utf8')
  let manifest
  try { manifest = validateProcessManifest(JSON.parse(originalText)) }
  catch { throw new Error('invalid_process_manifest') }
  const selected = options.pm2 ?? 'pm2'
  const executable = isAbsolute(selected) ? selected : (await run('which', [selected], { timeout: 10000 })).stdout.trim()
  if (!isAbsolute(executable)) throw new Error('pm2_executable_unavailable')
  let observedShutdown
  const list = async () => {
    const { stdout } = await run(executable, ['jlist'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PM2_HOME: home } })
    try { return JSON.parse(stdout) } catch { throw new Error('invalid_pm2_process_list') }
  }
  async function privateJson(path, maintenance = false) {
    const info = await stat(path)
    // Same owner/regular-file conventions as the installer; no arbitrary fence path.
    if (!info.isFile() || info.uid !== process.getuid() || await canonical(path) !== path
      || maintenance && ((info.mode & 0o777) !== 0o600 || info.size > 65536)) throw new Error('unsafe_pm2_saved_state')
    return JSON.parse(await read(path, 'utf8'))
  }
  async function verifyShutdown(entries) {
    if (!Array.isArray(entries)) throw new Error('invalid_pm2_process_list')
    // Unscheduled registrations must remain present in BOTH supported states.
    const anchor = manifest.processes.find(item => !item.cronRestart)
    const matches = entries.filter(entry => entry?.name === anchor?.name)
    if (!anchor || matches.length !== 1) throw new Error('pm2_manifest_process_missing_or_duplicate')
    const script = matches[0].pm2_env?.pm_exec_path
    if (typeof script !== 'string' || !isAbsolute(script)) throw new Error('pm2_definition_mismatch')
    const parts = relative('/release', resolve('/release', anchor.script)).split(sep)
    const release = resolve(script, ...parts.map(() => '..')), root = dirname(release)
    if (basename(release) !== 'spendcraft' || await canonical(root) !== root
      || await canonical(release) !== release) throw new Error('unsafe_process_root')
    const installed = validateProcessManifest(JSON.parse(await read(join(release, 'installer/pm2-processes.json'), 'utf8')))
    if (!isDeepStrictEqual(installed, manifest)) throw new Error('pm2_manifest_mismatch')
    const file = join(root, 'maintenance/installer-pm2.json')
    let state
    try { state = await privateJson(file, true) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const fenced = state !== undefined
    if (fenced) {
      const directory = dirname(file)
      if (await canonical(directory) !== directory) throw new Error('unsafe_maintenance_directory')
      // The installer validates format, root, manifest digest, ID and active phase.
      // Independently require the complete intended set and exact original schedules.
      if (!Array.isArray(state?.processes) || state.processes.length !== manifest.processes.length
        || manifest.processes.some(item => state.processes.filter(saved => saved?.name === item.name
          && saved.cron === (item.cronRestart ?? null)).length !== 1)) throw new Error('pm2_maintenance_process_mismatch')
    }
    const definitions = processDefinitions(manifest, release)
    const checkEntries = values => {
      if (!Array.isArray(values)) throw new Error('invalid_pm2_process_list')
      for (const definition of definitions) {
        const found = values.filter(entry => entry?.name === definition.name)
        if (fenced && definition.cronRestart) {
          if (found.length) throw new Error('scheduled_pm2_writer_still_registered')
        } else {
          if (found.length !== 1) throw new Error('pm2_manifest_process_missing_or_duplicate')
          if (!matchesDefinition(found[0].pm2_env, definition)
            || !isSingleForkProcess(found[0].pm2_env)) throw new Error('pm2_definition_mismatch')
        }
        if (found.some(entry => ![undefined, null, false, 0, '0', ''].includes(entry.pm2_env?.cron_restart))) {
          throw new Error('disable_pm2_cron_during_maintenance')
        }
      }
      if (values.some(entry => !definitions.some(item => item.name === entry?.name)
        && (inside(root, entry?.pm2_env?.pm_cwd ?? '/') || inside(root, entry?.pm2_env?.pm_exec_path ?? '/')))) {
        throw new Error('unmanaged_installation_process')
      }
      return checkStopped({ ...manifest, processes: manifest.processes.filter(item => !fenced || !item.cronRestart) }, values)
    }
    const processes = checkEntries(entries)
    const dumps = async name => {
      const saved = await privateJson(join(home, name))
      if (!Array.isArray(saved)) throw new Error('invalid_pm2_startup_dump')
      checkEntries(saved.map(env => ({ name: env.name, pid: env.status === 'online' ? 1 : 0, pm2_env: env })))
      return saved
    }
    if (fenced) {
      await installerMaintenance({ action: 'verify', root, incoming: installed, store: { read: async () => state }, dumps,
        run: async args => {
          if (args.length !== 1 || args[0] !== 'jlist') throw new Error('read_only_pm2_guard_required')
          const current = await list(); checkEntries(current)
          return { stdout: JSON.stringify(current) }
        } })
      if (!isDeepStrictEqual(await privateJson(file, true), state)) throw new Error('pm2_maintenance_state_changed')
      processes.push(...manifest.processes.filter(item => item.cronRestart).map(item => ({ name: item.name, status: 'removed', pid: 0 })))
    } else {
      await dumps('dump.pm2'); await dumps('dump.pm2.bak')
    }
    return { processes, root, mode: fenced ? 'durable-maintenance-fence' : 'stopped',
      ...(fenced ? { maintenanceId: state.id, phase: state.phase } : {}) }
  }
  async function daemonIdentity() {
    const text = (await read(join(home, 'pm2.pid'), 'utf8')).trim()
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('invalid_pm2_daemon_pid')
    const pid = Number(text)
    probe(pid)
    const { stdout } = await run('ps', ['-ww', '-p', text, '-o', 'args='], { timeout: 10000 })
    if (!stdout.includes(`God Daemon (${home})`)) throw new Error('pm2_daemon_identity_mismatch')
    return pid
  }
  return async () => {
    if (await read(manifestPath, 'utf8') !== originalText) throw new Error('pm2_manifest_changed')
    if (!['5.4.1', '7.1.0'].includes(await verifyRuntime(executable))) throw new Error('unreviewed_pm2_version')
    // Fail before jlist if the selected daemon is unavailable; do not deliberately
    // bootstrap another daemon or silently inspect another PM2_HOME.
    const before = await daemonIdentity()
    const evidence = await verifyShutdown(await list())
    if (await daemonIdentity() !== before) throw new Error('pm2_daemon_changed')
    const shutdown = { ...evidence, processes: undefined }
    if (observedShutdown && !isDeepStrictEqual(observedShutdown, shutdown)) throw new Error('pm2_maintenance_state_changed')
    observedShutdown = shutdown
    return { manifest: manifestPath, pm2Home: home, ...evidence, checkedAt: new Date().toISOString() }
  }
}
