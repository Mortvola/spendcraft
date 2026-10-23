// Read-only PM2 status checks. Never sends start/stop/restart/delete commands.
import process from 'node:process'
import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { validateProcessManifest } from '../../installer/lib/pm2Processes.mjs'

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
  const probe = dependencies.probePid ?? (pid => process.kill(pid, 0))
  const manifestPath = resolve(options['pm2-manifest'] ?? defaultManifest)
  const home = await canonical(resolve(options['pm2-home'] ?? process.env.PM2_HOME ?? join(homedir(), '.pm2')))
  const originalText = await read(manifestPath, 'utf8')
  let manifest
  try { manifest = validateProcessManifest(JSON.parse(originalText)) }
  catch { throw new Error('invalid_process_manifest') }
  const executable = options.pm2 ?? 'pm2'
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
    // Fail before jlist if the selected daemon is unavailable; do not deliberately
    // bootstrap another daemon or silently inspect another PM2_HOME.
    const before = await daemonIdentity()
    const { stdout } = await run(executable, ['jlist'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PM2_HOME: home } })
    if (await daemonIdentity() !== before) throw new Error('pm2_daemon_changed')
    let entries
    try { entries = JSON.parse(stdout) } catch { throw new Error('invalid_pm2_process_list') }
    const processes = checkStopped(manifest, entries)
    return { manifest: manifestPath, pm2Home: home, processes, checkedAt: new Date().toISOString() }
  }
}
