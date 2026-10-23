// Installer process control. Uses release-owned manifest, never a process-name list in shell.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { inside, readProcessManifest, processDefinitions, replaceProcesses } from './lib/pm2Processes.mjs'
const execute = promisify(execFile)

export async function manageProcesses({ action, root, incoming, entries, run, previous }) {
  if (!['stop', 'start'].includes(action)) throw new Error('invalid_process_action')
  if (!Array.isArray(entries)) throw new Error('invalid_pm2_inventory')
  const desired = processDefinitions(incoming, join(root, 'spendcraft'))
  if (action === 'stop' && !previous) {
    // Explicit legacy-upgrade policy: stop every app in the selected PM2 daemon.
    if (entries.length) await run(['stop', 'all'])
    return
  }
  const old = previous ? processDefinitions(previous, join(root, 'spendcraft')) : desired
  const names = [...new Set([...old, ...desired].map((item) => item.name))]
  for (const name of names) {
    const matches = entries.filter((entry) => entry.name === name)
    if (matches.length > 1) throw new Error('duplicate_managed_process')
    if (!matches.length) continue
    const env = matches[0].pm2_env
    // Legacy queue wrappers may live at the installation root. Never touch a same-named foreign app.
    if (!env || !inside(root, env.pm_exec_path ?? '/') || !inside(root, env.pm_cwd ?? '/')) throw new Error('foreign_managed_process')
    if (action === 'start' && env.status !== 'stopped') throw new Error('managed_process_not_stopped')
  }
  if (entries.some((entry) => (inside(root, entry.pm2_env?.pm_exec_path ?? '/')
    || inside(root, entry.pm2_env?.pm_cwd ?? '/')) && !names.includes(entry.name)
    && (previous || entry.pm2_env?.status !== 'stopped'))) throw new Error('unmanaged_installation_process')
  // Complete admission before any stop/delete/start command.
  const existing = names.filter((name) => entries.some((entry) => entry.name === name))
  if (action === 'start') await replaceProcesses(existing, desired, run)
  else for (const name of existing) await run(['stop', name])

}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { root: { type: 'string' }, action: { type: 'string' }, release: { type: 'string' } } })
  if (!values.root || !values.release || !['stop', 'start'].includes(values.action)) throw new Error('explicit_process_action_required')
  const root = resolve(values.root), release = resolve(values.release)
  if (await realpath(root) !== root || ![join(root, 'spendcraft.new'), join(root, 'spendcraft')].includes(release)) throw new Error('unsafe_process_root')
  const incoming = await readProcessManifest(release)
  let previous
  try { previous = await readProcessManifest(join(root, values.action === 'stop' ? 'spendcraft' : 'spendcraft.old')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const run = (args) => execute('pm2', args, { env: { ...process.env, NODE_ENV: 'production' }, maxBuffer: 8 * 1024 * 1024 })
  const entries = JSON.parse((await run(['jlist'])).stdout)
  if (!Array.isArray(entries)) throw new Error('invalid_pm2_inventory')
  if (values.action === 'stop' && !previous) console.log('Installed release has no PM2 manifest: stopping ALL applications in the selected PM2 daemon.')
  await manageProcesses({ action: values.action, root, incoming, previous, entries, run })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('PM2 manifest operation failed: ' + (/^[a-z][a-z0-9_]+$/.test(error.message) ? error.message : 'inspect_process_configuration'))
    process.exitCode = 1
  })
}
