// Operational configuration only. No application bootstrap or PM2 invocation.
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'

export const inside = (parent, child) => child === parent || (!relative(parent, child).startsWith(
  '..') && !isAbsolute(relative(parent, child)))
export function validateProcessManifest(manifest) {
  if (manifest?.format !== 1 || !Array.isArray(manifest.processes)
    || !manifest.processes.length || manifest.processes.length > 32) throw new Error(
      'invalid_process_manifest')
  if (Object.keys(manifest).some((key) => !['format', 'processes'].includes(key))) throw new Error(
    'unknown_process_manifest_field')
  const names = new Set()
  for (const item of manifest.processes) {
    if (!item || !/^[a-z][a-z0-9-]*$/.test(item.name ?? '') || names.has(item.name)
      || item.interpreter !== 'node' || !Array.isArray(item.args) || item.args.some((arg) =>
        typeof arg !== 'string')
      || typeof item.time !== 'boolean') throw new Error('invalid_process_manifest_entry')
    names.add(item.name)
    for (const key of ['script', 'cwd']) {
      if (typeof item[key] !== 'string' || !item[key] || isAbsolute(item[key])
        || !inside('/release', resolve('/release', item[key]))) throw new Error(
          'unsafe_process_manifest_path')
    }
    for (const key of ['killTimeout', 'restartDelay']) {
      if (item[key] !== undefined && (!Number.isSafeInteger(item[key]) || item[
        key] < 0)) throw new Error('invalid_process_manifest_setting')
    }
    if (item.cronRestart !== undefined && (typeof item.cronRestart !== 'string'
      || item.cronRestart.trim().split(/\s+/).length !== 5)) throw new Error(
        'invalid_process_manifest_schedule')
    if (Object.keys(item).some((key) => !['name', 'script', 'cwd', 'interpreter', 'args', 'time',
      'killTimeout', 'restartDelay', 'cronRestart'].includes(key))) {
      throw new Error('unknown_process_manifest_field')
    }
  }
  return manifest
}

export async function readProcessManifest(release) {
  return validateProcessManifest(JSON.parse(await readFile(join(release,
    'installer/pm2-processes.json'), 'utf8')))
}

export function processDefinitions(manifest, release, prefix = '') {
  validateProcessManifest(manifest)
  return manifest.processes.map((item) => ({ ...item, name: prefix + item.name,
    script: resolve(release, item.script), cwd: resolve(release, item.cwd), interpreter: process
      .execPath }))
}

export function processStartArgs(definition, maintenance = false) {
  const args = ['start', definition.script, '--name', definition.name, '--cwd', definition.cwd,
    '--interpreter', definition.interpreter]
  if (definition.time) args.push('--time')
  if (definition.killTimeout !== undefined) args.push('--kill-timeout', String(definition
    .killTimeout))
  if (definition.restartDelay !== undefined) args.push('--restart-delay', String(definition
    .restartDelay))
  // Maintenance must not resurrect a writer on a schedule; restore reviewed schedules after smoke
  // checks.
  if (definition.cronRestart && !maintenance) args.push('--cron', definition.cronRestart)
  if (definition.args.length) args.push('--', ...definition.args)
  return args
}

export function matchesDefinition(env, definition) {
  return env?.pm_exec_path === definition.script && env.pm_cwd === definition.cwd
    && [definition.interpreter, ...(definition.interpreter === process.execPath ? ['node'] : [])]
      .includes(env.exec_interpreter)
    && JSON.stringify(env.args ?? []) === JSON.stringify(definition.args)
    && (definition.killTimeout === undefined || env.kill_timeout === definition.killTimeout)
    && (definition.restartDelay === undefined || env.restart_delay === definition.restartDelay)
}

export async function replaceProcesses(names, definitions, run, maintenance = false) {
  for (const name of names) await run(['delete', name])
  for (const definition of definitions) await run(processStartArgs(definition, maintenance))
}
