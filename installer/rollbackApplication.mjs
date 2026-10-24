import { requireTaxStorageCompatibility } from './lib/taxReleaseRecovery.mjs'
// Application-only rollback. Never converts or restores database values. Never imported by the application.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL, fileURLToPath, URL } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { readFile, readdir, lstat, realpath, readlink, open, mkdtemp, cp, rename, mkdir } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createInterface } from 'node:readline/promises'
import { orchestrate, swapDirectories, normalizedIP } from './lib/applicationRollback.mjs'

import { verifyRollbackBundle } from './lib/rollbackBundleIntegrity.mjs'
import { readProcessManifest, processDefinitions, replaceProcesses, matchesDefinition } from './lib/pm2Processes.mjs'
import { releaseManifest, secretLinks } from './lib/releaseManifest.mjs'
export { releaseManifest } from './lib/releaseManifest.mjs'
const sha = (value) => createHash('sha256').update(value).digest('hex')
const inside = (parent, child) => child === parent || (!relative(parent, child).startsWith('..') && !isAbsolute(relative(parent, child)))

async function exists(path) {
  try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}


export function releaseDifferences(current, previous) {
  const left = new Map(current.files.map((file) => [file.name, file]))
  const right = new Map(previous.files.map((file) => [file.name, file]))
  return [...new Set([...left.keys(), ...right.keys()])].sort().filter((name) =>
    JSON.stringify(left.get(name)) !== JSON.stringify(right.get(name)))
}

export function validatePlan(plan) {
  if (plan.rollbackKind !== 'application-only') throw new Error('application_only_plan_required')
  if (plan.recoveryIdentity !== undefined) throw new Error('alternate_recovery_target_not_supported')
  if (!['production', 'staging', 'sandbox'].includes(plan.environment) || !isAbsolute(plan.root ?? '')
    || !isAbsolute(plan.productionRoot ?? '') || !isAbsolute(plan.envFile ?? '')) throw new Error('invalid_plan_paths')
  if (plan.environment === 'sandbox' && (inside(plan.productionRoot, plan.root) || inside(plan.root, plan.productionRoot)
    || inside('/spendcraft-prod/server', plan.root) || inside(plan.root, '/spendcraft-prod/server')
    || inside('/spendcraft-prod/server', plan.envFile)
    || plan.expected?.database !== 'spendcraft_sandbox')) throw new Error('sandbox_not_isolated')
  if (plan.environment === 'staging' && (inside(plan.productionRoot, plan.root) || inside(plan.root, plan.productionRoot)
    || inside('/spendcraft-prod/server', plan.root) || inside(plan.root, '/spendcraft-prod/server')
    || inside(plan.productionRoot, plan.envFile) || inside('/spendcraft-prod/server', plan.envFile)
    || ['spendcraft_sandbox', 'spendcraft_test'].includes(plan.expected?.database))) {
    throw new Error('staging_not_isolated')
  }
  if (plan.environment === 'production' && (plan.root !== plan.productionRoot
    || ['spendcraft_sandbox', 'spendcraft_test'].includes(plan.expected?.database))) throw new Error('production_target_mismatch')
  if (![plan.pm2Executable, plan.pm2Home, plan.productionPm2Home].every((path) => typeof path === 'string' && isAbsolute(path))) {
    throw new Error('explicit_pm2_paths_required')
  }
  if ((plan.environment === 'production' && plan.pm2Home !== plan.productionPm2Home)
    || (plan.environment === 'sandbox' && (inside(plan.productionPm2Home, plan.pm2Home) || inside(plan.pm2Home, plan.productionPm2Home)
      || inside('/home/ubuntu/.pm2', plan.pm2Home) || inside(plan.pm2Home, '/home/ubuntu/.pm2')))) {
    throw new Error('pm2_home_not_isolated')
  }
  const expected = plan.expected
  if (!expected || !['localhost', '127.0.0.1', '::1'].includes(expected.host)
    || !Number.isInteger(expected.port) || expected.port < 1 || expected.port > 65535
    || !/^[a-zA-Z0-9_]+$/.test(expected.database ?? '') || !/^[a-zA-Z0-9_]+$/.test(expected.user ?? '')
    || !['127.0.0.1', '::1'].includes(expected.serverAddress)
    || !['127.0.0.1', '::1'].includes(expected.clientAddress)) throw new Error('ambiguous_database_target')
  for (const key of ['currentManifest', 'previousManifest']) if (!isAbsolute(plan[key] ?? '')) throw new Error('manifest_path_required')
  if (!/^[a-f0-9]{64}$/.test(plan.reviewedDifferencesSha256 ?? '') || !/^[a-f0-9]{64}$/.test(plan.databaseConfigSha256 ?? '')) {
    throw new Error('compatibility_review_required')
  }
  if (plan.maintenanceStatement !== 'All external writers, schedulers and traffic are fenced for this operation'
    || typeof plan.recoveryProcedure !== 'string' || plan.recoveryProcedure.trim().length < 40) throw new Error('operational_review_required')
  if (!Array.isArray(plan.processes) || !plan.processes.length || plan.processes.length > 32) throw new Error('exact_process_inventory_required')
  if (plan.manualRestart !== undefined && typeof plan.manualRestart !== 'boolean') throw new Error('invalid_manual_restart_policy')
  if (plan.manualRestart && (plan.previousProcesses !== undefined || plan.previousProcessManifestSha256 !== undefined)) throw new Error('conflicting_restart_policy')
  if (plan.previousProcesses !== undefined && (!Array.isArray(plan.previousProcesses)
    || !plan.previousProcesses.length || plan.previousProcesses.length > 32)) throw new Error('invalid_previous_process_inventory')
  for (const definitions of [plan.processes, ...(plan.previousProcesses ? [plan.previousProcesses] : [])]) {
    const names = definitions.map((item) => item.name)
    if (names.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name))
      || new Set(names).size !== names.length) throw new Error('invalid_pm2_selection')
  }
  for (const item of [...plan.processes, ...(plan.previousProcesses ?? [])]) {
    if (![item.script, item.cwd].every((path) => typeof path === 'string' && isAbsolute(path))
      || !(typeof item.interpreter === 'string' && (isAbsolute(item.interpreter) || ['node', 'bash'].includes(item.interpreter)))
      || !inside(plan.root, item.script) || !inside(plan.root, item.cwd) || !Array.isArray(item.args)
      || item.args.some((arg) => typeof arg !== 'string') || !/^[a-f0-9]{64}$/.test(item.scriptSha256 ?? '')) {
      throw new Error('invalid_process_definition')
    }
  }
  if (typeof plan.smokeUrl !== 'string') throw new Error('smoke_url_required')
  const url = new URL(plan.smokeUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash || (plan.environment === 'sandbox' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('unsafe_smoke_url')
  }
}

export async function connectionConfig(envFile, expected) {
  const env = parseEnv(await readFile(envFile, 'utf8'))
  for (const key of ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DB_NAME']) {
    if (typeof env[key] !== 'string' || (key !== 'PG_PASSWORD' && !env[key])) throw new Error('missing_env_connection')
  }
  if (env.DB_CONNECTION && env.DB_CONNECTION !== 'pg') throw new Error('unexpected_application_connection')
  if (!/^\d+$/.test(env.PG_PORT) || env.PG_HOST !== expected.host || Number(env.PG_PORT) !== expected.port
    || env.PG_DB_NAME !== expected.database || env.PG_USER !== expected.user) throw new Error('configured_database_mismatch')
  return { host: env.PG_HOST, port: Number(env.PG_PORT), database: env.PG_DB_NAME, user: env.PG_USER,
    password: env.PG_PASSWORD, connectionTimeoutMillis: 10000, application_name: 'spendcraft-application-rollback',
    ssl: false, options: '-c search_path=pg_catalog,public -c row_security=off' }
}

export async function verifyApplicationConnections(directory, expectedHash) {
  const source = await readFile(join(directory, 'config/database.js'), 'utf8')
  if (sha(source) !== expectedHash) throw new Error('database_config_changed')
  const expected = "host:env.get('PG_HOST'),port:env.get('PG_PORT'),user:env.get('PG_USER'),password:env.get('PG_PASSWORD',''),database:env.get('PG_DB_NAME')"
  for (const name of ['pg', 'pgLog']) {
    const match = source.match(new RegExp(`\\b${name}:\\s*\\{\\s*client:\\s*['"]pg['"],\\s*connection:\\s*\\{([^{}]*)\\}`))
    const fields = match?.[1].replaceAll('"', "'").replace(/\s/g, '').replace(/,$/, '')
    if (fields !== expected) throw new Error('application_connection_mapping_not_supported')
  }
}

export async function verifyIdentity(client, expected) {
  const { rows } = await client.query(`SELECT current_database() AS database, current_user AS username,
    inet_server_port() AS port, inet_server_addr()::text AS server, inet_client_addr()::text AS peer, pg_backend_pid() AS pid`)
  const identity = rows[0]
  if (rows.length !== 1 || identity.database !== expected.database || identity.username !== expected.user
    || identity.port !== expected.port || normalizedIP(identity.server) !== expected.serverAddress
    || normalizedIP(identity.peer) !== expected.clientAddress
    || normalizedIP(client.connection?.stream?.remoteAddress) !== expected.serverAddress
    || client.connection?.stream?.remotePort !== expected.port) throw new Error('live_database_identity_mismatch')
  return identity
}

export function assertConfirmation(answer, expected) {
  if (typeof expected !== 'string' || !expected || answer !== expected) throw new Error('confirmation_declined')
}

// PM2 may explicitly record its default single instance in fork-mode metadata.
export function isSingleForkProcess(definition) {
  return definition?.exec_mode === 'fork_mode'
    && (definition.instances === undefined || definition.instances === 1)
}

export function selectProcesses(entries, definitions) {
  return definitions.map((definition) => {
    const matches = entries.filter((entry) => entry.name === definition.name)
    if (matches.length !== 1) throw new Error('missing_or_duplicate_pm2_process')
    const processEntry = matches[0]
    const env = processEntry.pm2_env
    const args = env.args === undefined ? [] : env.args
    if (!matchesDefinition({ ...env, args }, definition) || !isSingleForkProcess(env)) {
      throw new Error('pm2_definition_mismatch')
    }
    if (env.cron_restart) throw new Error('disable_pm2_cron_during_maintenance')
    return { name: definition.name, pid: processEntry.pid, status: env.status }
  })
}

export async function verifyPm2Runtime(executable) {
  const root = dirname(dirname(await realpath(executable)))
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  // This release-specific procedure reviewed stopped-state resurrection in the actual installed source.
  const reviewed = {
    'lib/God.js': '6f283d694e00ec66e65605e47264c918313809d57662008a3c1a1b4dad87aa88',
    'lib/API/Startup.js': '4c88ebbc0be3d76ed89e3bde9bc44c7d74c41a6ebf4660334a9a600376920f9a',
    'lib/Common.js': 'ec76f7aeeab38e6cebf2e6b83cedf2d8b5f1d510019331e5c72404624785d50f',
  }
  if (pkg.name !== 'pm2' || pkg.version !== '5.4.1') throw new Error('unreviewed_pm2_version')
  for (const [file, expectedHash] of Object.entries(reviewed)) {
    if (await fileHash(join(root, file)) !== expectedHash) throw new Error('unreviewed_pm2_startup_source')
  }
}

export async function persistStoppedState(operations, definitions) {
  // Saving twice makes BOTH the primary dump and its fallback contain stopped entries.
  await operations.save()
  await operations.save()
  for (const file of ['dump.pm2', 'dump.pm2.bak']) {
    await operations.sync(file)
    const entries = await operations.read(file)
    const selected = selectProcesses(entries.map((entry) => ({ name: entry.name, pid: entry.pm_pid ?? 0, pm2_env: entry })), definitions)
    if (selected.some((entry) => entry.status !== 'stopped')) throw new Error('pm2_startup_not_stopped')
  }
}

export function assertNoExtraProcesses(entries, definitions, root) {
  if (entries.some((entry) => (inside(root, entry.pm2_env.pm_cwd ?? '/') || inside(root, entry.pm2_env.pm_exec_path ?? '/'))
    && !definitions.some((item) => item.name === entry.name))) throw new Error('uncontrolled_pm2_writer')
}

async function command(executable, args, options = {}) {
  return new Promise((fulfill, reject) => {
    const child = spawn(executable, args, { ...options, shell: false, stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'], timeout: 120000 })
    const chunks = []
    let size = 0
    child.stdout?.on('data', (chunk) => {
      size += chunk.length
      if (size > 16 * 1024 * 1024) child.kill('SIGTERM')
      else chunks.push(chunk)
    })
    // Do not log provider/process environments, backup contents or database credentials.
    child.stderr?.resume()
    child.on('error', () => reject(new Error('operator_command_unavailable')))
    child.on('close', (code) => code === 0 && size <= 16 * 1024 * 1024
      ? fulfill(Buffer.concat(chunks).toString('utf8')) : reject(new Error('operator_command_failed')))
  })
}

async function processTable() {
  const entries = []
  for (const pid of (await readdir('/proc')).filter((name) => /^\d+$/.test(name))) {
    try {
      // Other operating-system users are covered by the external-writer fence and database-session gate.
      // Inspecting all their cwd links requires root and would change which PM2 daemon this tool controls.
      if ((await lstat(`/proc/${pid}`)).uid !== process.getuid()) continue
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const cwd = await readlink(`/proc/${pid}/cwd`)
      const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0')
      entries.push({ pid: Number(pid), parent: Number(fields[1]), start: fields[19], cwd, args })
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw new Error('process_inventory_permission_denied')
    }
  }
  return entries
}

export function writerProcesses(table, root, selectedPids, ownPid, ignoredPids = []) {
  const ancestors = new Set([ownPid])
  for (;;) {
    const next = table.find((item) => ancestors.has(item.pid) && !ancestors.has(item.parent) && item.parent > 0)
    if (!next) break
    ancestors.add(next.parent)
  }
  const selected = new Set(selectedPids.filter((pid) => pid > 0))
  for (;;) {
    const child = table.find((item) => selected.has(item.parent) && !selected.has(item.pid))
    if (!child) break
    selected.add(child.pid)
  }
  return table.filter((item) => !ancestors.has(item.pid) && !ignoredPids.includes(item.pid) && (selected.has(item.pid) || inside(root, item.cwd)
    || item.args?.some((arg) => isAbsolute(arg) && inside(root, arg))))
}

async function writeJson(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync() } finally { await file.close() }
}

async function syncDirectory(path) {
  const directory = await open(path, 'r')
  try { await directory.sync() } finally { await directory.close() }
}

export async function assertExecutorBundle(plan, directory = dirname(fileURLToPath(import.meta.url)), currentIdentity) {
  if (!await exists(join(directory, 'bundle.json'))) return
  const manifest = await verifyRollbackBundle(directory)
  const expected = JSON.parse(await readFile(plan.currentManifest, 'utf8'))
  const current = currentIdentity ?? (await releaseManifest(join(plan.root, 'spendcraft'))).identity
  if (expected.format !== 1 || expected.identity !== sha(JSON.stringify(expected.files))
    || manifest.releaseId !== expected.identity || manifest.releaseId !== current) throw new Error('rollback_bundle_release_mismatch')
}

export async function verifyReleases(plan, output) {
  if (await realpath(plan.root) !== plan.root || inside(join(plan.root, 'spendcraft'), output)
    || inside(join(plan.root, 'spendcraft.old'), output)) throw new Error('unsafe_root_or_output_path')
  const current = await releaseManifest(join(plan.root, 'spendcraft'))
  await assertExecutorBundle(plan, undefined, current.identity)
  const previous = await releaseManifest(join(plan.root, 'spendcraft.old'))
  for (const [actual, file] of [[current, plan.currentManifest], [previous, plan.previousManifest]]) {
    const expected = JSON.parse(await readFile(file, 'utf8'))
    if (expected.format !== 1 || expected.identity !== sha(JSON.stringify(expected.files))
      || expected.identity !== actual.identity) throw new Error('release_manifest_mismatch')
  }
  const differences = releaseDifferences(current, previous)
  await writeJson(join(output, 'release-differences.json'), { differences, sha256: sha(JSON.stringify(differences)) })
  if (sha(JSON.stringify(differences)) !== plan.reviewedDifferencesSha256) throw new Error('release_differences_not_reviewed')
  const currentFiles = new Map(current.files.map((file) => [file.name, file]))
  const oldFiles = new Map(previous.files.map((file) => [file.name, file]))
  if (!currentFiles.has('app/services/categoryAmountCodec.js') || !oldFiles.has('app/services/categoryAmountCodec.js')) {
    throw new Error('compatible_decimal_string_release_pair_required')
  }
  for (const file of new Set([...currentFiles.keys(), ...oldFiles.keys()])) {
    if ((file.startsWith('database/') || file === 'config/database.js')
      && JSON.stringify(currentFiles.get(file)) !== JSON.stringify(oldFiles.get(file))) throw new Error('database_release_difference')
  }
  requireTaxStorageCompatibility(current)
  requireTaxStorageCompatibility(previous)
  if (currentFiles.get('config/database.js')?.sha256 !== plan.databaseConfigSha256) throw new Error('database_config_not_reviewed')
  for (const key of secretLinks) {
    if (JSON.stringify(currentFiles.get(key)) !== JSON.stringify(oldFiles.get(key))) throw new Error('secret_link_difference')
  }
  if (currentFiles.get('.env')?.target !== await realpath(plan.envFile)) throw new Error('env_file_not_application_env')
  if (plan.generated) {
    for (const [release, definitions, expectedHash] of [
      [join(plan.root, 'spendcraft'), plan.processes, plan.processManifestSha256],
      [join(plan.root, 'spendcraft.old'), plan.previousProcesses, plan.previousProcessManifestSha256],
    ]) {
      if (release === join(plan.root, 'spendcraft.old') && plan.manualRestart) {
        try { await readProcessManifest(release) }
        catch (error) { if (error.code === 'ENOENT') continue; throw error }
        throw new Error('previous_process_manifest_now_present')
      }
      const manifest = await readProcessManifest(release)
      if (sha(JSON.stringify(manifest)) !== expectedHash || !Array.isArray(definitions)) throw new Error('process_manifest_changed')
      const expected = processDefinitions(manifest, join(plan.root, 'spendcraft'))
      if (definitions.length !== expected.length) throw new Error('process_manifest_mismatch')
      for (let index = 0; index < expected.length; index++) {
        const item = expected[index], actual = definitions[index]
        const source = join(release, relative(join(plan.root, 'spendcraft'), item.script))
        if (JSON.stringify({ ...item, scriptSha256: await fileHash(source) }) !== JSON.stringify(actual)) throw new Error('process_manifest_mismatch')
      }
    }
  }
  return { current: current.identity, previous: previous.identity, differences }
}

async function productionOperations(plan, output, confirm, clients, config) {
  const live = join(plan.root, 'spendcraft')
  const previous = join(plan.root, 'spendcraft.old')
  let restorationStarted = false
  const stamp = output.split('/').at(-1)
  const stage = join(plan.root, `spendcraft.rollback-stage-${stamp}`)
  const retained = join(plan.root, `spendcraft.forward-recovery-${stamp}`)
  const journalPath = join(plan.root, '.transaction-category-release-rollback.jsonl')
  let journalFile
  let identities
  let observed = []
  let stoppedPids = []
  let daemonPid
  const pm2 = async (args) => {
    await verifyPm2Runtime(plan.pm2Executable)
    const pid = Number((await readFile(join(plan.pm2Home, 'pm2.pid'), 'utf8')).trim())
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('pm2_daemon_not_running')
    process.kill(pid, 0) // Never start a daemon as a side effect of inspection.
    const daemonArgs = await readFile(`/proc/${pid}/cmdline`, 'utf8')
    if (!daemonArgs.includes(`PM2 v5.4.1: God Daemon (${plan.pm2Home})`)) throw new Error('pm2_daemon_identity_mismatch')
    daemonPid = pid
    return command(plan.pm2Executable, args, { env: { ...process.env, PM2_HOME: plan.pm2Home, NODE_ENV: 'production' } })
  }
  const journal = async (phase, detail) => {
    journalFile ??= await open(journalPath, 'wx', 0o600)
    await journalFile.write(`${JSON.stringify({ phase, at: new Date().toISOString(), output, identities, ...detail })}\n`)
    await journalFile.sync()
    await syncDirectory(plan.root)
  }
  const guard = async () => {
    // Independently verify configured pg/pgLog and every live connection before each UPDATE and COMMIT.
    await connectionConfig(plan.envFile, plan.expected)
    await verifyApplicationConnections(live, plan.databaseConfigSha256)
    const verified = []
    for (const client of clients) verified.push(await verifyIdentity(client, plan.expected))
    const allowed = verified.map((identity) => identity.pid)
    const others = await clients[2].query(`SELECT pid FROM pg_stat_activity
      WHERE datname=current_database() AND backend_type='client backend' AND NOT (pid=ANY($1::integer[]))`, [allowed])
    if (others.rows.length) throw new Error('other_database_sessions_present')
    const table = await processTable()
    if (writerProcesses(table, plan.root, [], process.pid, [daemonPid]).length
      || stoppedPids.some((old) => table.some((item) => item.pid === old.pid && item.start === old.start))) {
      throw new Error('writer_still_running')
    }
  }
  const operations = {
    async preflight() {
      if (process.platform !== 'linux') throw new Error('execution_host_must_be_linux')
      validatePlan(plan)
      if (await exists(journalPath) || await exists(stage) || await exists(retained)) throw new Error('prior_run_requires_recovery_review')
      identities = await verifyReleases(plan, output)
      await verifyApplicationConnections(live, plan.databaseConfigSha256)
      if (await realpath(plan.pm2Home) !== plan.pm2Home) throw new Error('pm2_home_not_canonical')
      await verifyPm2Runtime(plan.pm2Executable)
      // Capture reviewed definitions without ever persisting the PM2 environment.
      const entries = JSON.parse(await readFile(join(plan.pm2Home, 'dump.pm2'), 'utf8'))
      // Saved dump entries do not carry pm2_env; normalize only the expected metadata shape.
      observed = selectProcesses(entries.map((entry) => ({ name: entry.name, pid: entry.pm_pid ?? 0, pm2_env: entry })), plan.processes)
      for (const definition of plan.processes) {
        if (await fileHash(definition.script) !== definition.scriptSha256) throw new Error('process_script_changed')
      }
      for (const client of clients) await verifyIdentity(client, plan.expected)
      await writeJson(join(output, 'preflight.json'), { manualRestart: plan.manualRestart === true, identities, database: plan.expected, processes: observed,
        directories: { live, previous, stage, retained }, recoveryProcedure: plan.recoveryProcedure })
    },
    confirm,
    journal,
    async inspect() {
      // No allocation scan or conversion: supported storage remains unchanged.
      for (const client of clients) await verifyIdentity(client, plan.expected)
      const summary = { applicationOnly: true, databaseUnchanged: true, identities }
      await writeJson(join(output, 'summary.json'), summary)
      return summary
    },
    async stop() {
      const entries = JSON.parse(await pm2(['jlist']))
      const candidates = [...plan.processes, ...(plan.previousProcesses ?? [])]
      const activeDefinitions = restorationStarted ? entries.filter((entry) => candidates.some((item) => item.name === entry.name)).map((entry) => {
        const match = candidates.find((item) => item.name === entry.name && matchesDefinition(entry.pm2_env, item))
        if (!match) throw new Error('pm2_definition_mismatch')
        return match
      }) : plan.processes
      observed = selectProcesses(entries, activeDefinitions)
      const table = await processTable()
      stoppedPids = [...stoppedPids, ...writerProcesses(table, plan.root, observed.map((item) => item.pid), process.pid, [daemonPid])]
      // Unknown in-root PM2 definitions could resurrect a writer; fail closed.
      assertNoExtraProcesses(entries, activeDefinitions, plan.root)
      for (const name of ['dump.pm2', 'dump.pm2.bak']) {
        const source = join(plan.pm2Home, name), target = join(output, `original-${name}`)
        if (await exists(source) && !await exists(target)) {
          const file = await open(target, 'wx', 0o600)
          try { await file.writeFile(await readFile(source)); await file.sync() } finally { await file.close() }
        }
      }
      for (const item of activeDefinitions) await pm2(['stop', item.name])
      for (let attempt = 0; attempt < 100; attempt++) {
        const remaining = await processTable()
        if (!writerProcesses(remaining, plan.root, [], process.pid, [daemonPid]).length
          && !stoppedPids.some((old) => remaining.some((item) => item.pid === old.pid && item.start === old.start))) break
        if (attempt === 99) throw new Error('writer_shutdown_incomplete')
        await delay(100)
      }
      const stopped = selectProcesses(JSON.parse(await pm2(['jlist'])), activeDefinitions)
      if (stopped.some((item) => item.status !== 'stopped' || item.pid > 0)) throw new Error('pm2_not_stopped')
      await persistStoppedState({
        save: () => pm2(['save']),
        sync: async (name) => {
          const file = await open(join(plan.pm2Home, name), 'r')
          try { await file.sync() } finally { await file.close() }
          await syncDirectory(plan.pm2Home)
        },
        read: async (name) => JSON.parse(await readFile(join(plan.pm2Home, name), 'utf8')),
      }, activeDefinitions)
      await journal('startup-definitions-stopped', {})
      await guard()
    },
    async backup() {
      await guard()
      const backupPath = join(output, 'recovery.dump')
      const file = await open(backupPath, 'wx', 0o600)
      try {
        await command('pg_dump', ['--format=custom', '--no-password', '--host', plan.expected.serverAddress, '--port', String(config.port),
          '--username', config.user, '--dbname', config.database], { stdio: ['ignore', file.fd, 'pipe'],
          env: { PATH: process.env.PATH, PGPASSWORD: config.password, PGAPPNAME: 'spendcraft-rollback-backup' } })
        await file.sync()
      } finally { await file.close() }
      if ((await lstat(backupPath)).size === 0) throw new Error('empty_backup')
      await command('pg_restore', ['--list', backupPath])
      // Decompress/read every archive segment without connecting to a database or restoring anything.
      await command('pg_restore', ['--file', '/dev/null', backupPath])
      await syncDirectory(output)
      await syncDirectory(dirname(output))
      await journal('backup-completed', { backupPath, sha256: await fileHash(backupPath),
        recoveryProcedure: plan.recoveryProcedure, completedAt: new Date().toISOString() })
      await confirm('Confirm the fresh backup completed and the documented recovery procedure is understood.',
        `RECOVERY ${plan.expected.database}`)
      // Copy before swapping: insufficient space or missing dependencies must fail before changing application directories.
      await cp(previous, stage, { recursive: true, dereference: false, force: false, errorOnExist: true, verbatimSymlinks: true })
      if ((await releaseManifest(stage)).identity !== identities.previous) throw new Error('staged_release_changed')
      await journal('previous-release-staged', { stage, retained })
    },
    async swap() {
      await swapDirectories({ live, previous, stage, retained, identities }, {
        guard, journal, exists, identity: async (path) => (await releaseManifest(path)).identity,
        rename, sync: () => syncDirectory(plan.root),
      })
    },
    async restart() {
      if (plan.manualRestart) throw new Error('manual_restart_required')
      await guard()
      await confirm('Application restoration verified; database values were not changed. Keep external traffic fenced.',
        `START ${plan.expected.database} ${identities.previous}`)
      const restored = plan.previousProcesses ?? plan.processes
      if (plan.previousProcesses) {
        restorationStarted = true
        await replaceProcesses(plan.processes.map((item) => item.name), restored, pm2, true)
      } else {
        for (const item of restored) await pm2(['restart', item.name])
      }
      await delay(1000)
      const restarted = selectProcesses(JSON.parse(await pm2(['jlist'])), restored)
      if (restarted.some((item) => item.status !== 'online' || !(item.pid > 0))) throw new Error('pm2_restart_unhealthy')
      await journal('processes-restarted', { processes: restarted })
    },
    async smoke() {
      const response = await globalThis.fetch(plan.smokeUrl, { redirect: 'manual', signal: globalThis.AbortSignal.timeout(10000) })
      if (![200, 301, 302, 303, 307, 308].includes(response.status)) throw new Error('http_startup_check_failed')
      await confirm('Perform authenticated read-only Transaction, allocation display, funding/rebalance and report checks; inspect server/provider errors. Do not create financial test records. Keep traffic fenced if any check fails.',
        `READ CHECKS PASSED ${plan.expected.database}`)
      await pm2(['save'])
      await journal('smoke-confirmed', { httpStatus: response.status })
    },
    async close() { await journalFile?.close() },
  }
  return operations
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { 'capture-release': { type: 'string' }, plan: { type: 'string' },
    'compare-manifests': { type: 'boolean' }, 'current-manifest': { type: 'string' }, 'previous-manifest': { type: 'string' },
    'dry-run': { type: 'boolean' }, execute: { type: 'boolean' }, help: { type: 'boolean' } }, strict: true })
  if (values.help) {
    console.log('Capture: node /absolute/rollback-bundle/rollbackApplication.mjs --capture-release /absolute/release\nCompare: --compare-manifests --current-manifest /absolute/current.json --previous-manifest /absolute/previous.json\nInspect: --plan /absolute/plan.json --dry-run\nExecute (separate authorization required): --plan /absolute/plan.json --execute')
    return
  }
  if ([values['capture-release'], values['compare-manifests'], values['dry-run'], values.execute].filter(Boolean).length !== 1
    || (values['capture-release'] || values['compare-manifests'] ? Boolean(values.plan) : !values.plan)
    || (values['compare-manifests'] ? !values['current-manifest'] || !values['previous-manifest']
      : Boolean(values['current-manifest'] || values['previous-manifest']))) throw new Error('choose_exactly_one_mode')
  let plan
  let outputParent = await realpath(process.cwd())
  // Keep journals/results outside a packaged immutable maintenance bundle,
  // including when the operator invokes the executor from inside that bundle.
  const toolDirectory = dirname(fileURLToPath(import.meta.url))
  if (inside(toolDirectory, outputParent) && await exists(join(toolDirectory, 'bundle.json'))) {
    outputParent = dirname(toolDirectory)
  }
  if (values.plan) {
    plan = JSON.parse(await readFile(values.plan, 'utf8'))
    validatePlan(plan)
    await assertExecutorBundle(plan, toolDirectory)
    if (await realpath(plan.root) !== plan.root) throw new Error('root_path_not_canonical')
    if ([join(plan.root, 'spendcraft'), join(plan.root, 'spendcraft.old')].some((path) => inside(path, outputParent))) {
      outputParent = plan.root
    }
  }
  if (values['capture-release'] && inside(await realpath(values['capture-release']), outputParent)) {
    outputParent = dirname(await realpath(values['capture-release']))
  }
  // Also keep filesystem-only comparison results out of an installed release, even from a nested cwd.
  for (let path = outputParent; path !== dirname(path); path = dirname(path)) {
    if (await exists(join(path, 'bin/server.js')) && await exists(join(path, 'app/Models/Transaction.js'))) {
      outputParent = dirname(path)
    }
  }
  if (plan) outputParent = plan.root
  outputParent = join(outputParent, 'script-output')
  await mkdir(outputParent, { recursive: true, mode: 0o700 })
  if (await realpath(outputParent) !== outputParent) throw new Error('unsafe_output_directory')
  const output = await mkdtemp(join(outputParent, 'application-rollback-'))
  console.log(output) // Required before all database work; every invocation has private unique results.
  if (values['compare-manifests']) {
    const manifests = []
    for (const file of [values['current-manifest'], values['previous-manifest']]) {
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      if (manifest.format !== 1 || manifest.identity !== sha(JSON.stringify(manifest.files))) throw new Error('invalid_release_manifest')
      manifests.push(manifest)
    }
    const differences = releaseDifferences(...manifests)
    await writeJson(join(output, 'release-differences.json'), { differences, sha256: sha(JSON.stringify(differences)) })
    return
  }
  if (values['capture-release']) {
    if (inside(resolve(values['capture-release']), output)) throw new Error('output_inside_captured_release')
    const manifest = await releaseManifest(resolve(values['capture-release']))
    await writeJson(join(output, 'release-manifest.json'), manifest)
    console.log(`Release identity: ${manifest.identity}`)
    return
  }
  // Reject unreviewed storage readers before constructing any database client.
  requireTaxStorageCompatibility(await releaseManifest(join(plan.root, 'spendcraft')))
  requireTaxStorageCompatibility(await releaseManifest(join(plan.root, 'spendcraft.old')))
  if (process.platform !== 'linux') throw new Error('execution_host_must_be_linux')
  const config = await connectionConfig(plan.envFile, plan.expected)
  const { Client } = await import('pg')
  const clients = []
  let operations
  try {
    // Independent pg, pgLog and execution connections, using only the reviewed .env target.
    for (let index = 0; index < 3; index++) {
      const client = new Client({ ...config, options: config.options + ' -c default_transaction_read_only=on' })
      clients.push(client)
      await client.connect()
      await verifyIdentity(client, plan.expected)
    }
    const confirm = async (warning, expected) => {
      if (plan.generated) {
        console.log('Automatically captured release differences are observations, not prior approval. Review release-differences.json in this output directory before continuing.')
        console.log(plan.recoveryProcedure)
        const review = createInterface({ input: process.stdin, output: process.stdout })
        try {
          if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('interactive_confirmation_required')
          assertConfirmation(await review.question('Confirm compatibility review, external writers/traffic fenced, PM2 cron disabled and backup recovery understood. Type READY: '), 'READY')
        } finally { review.close() }
      }
      console.log(warning)
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('interactive_confirmation_required')
      const terminal = createInterface({ input: process.stdin, output: process.stdout })
      try {
        assertConfirmation(await terminal.question(`Type ${expected}: `), expected)
      } finally { terminal.close() }
    }
    operations = await productionOperations(plan, output, confirm, clients, config)
    const previous = JSON.parse(await readFile(plan.previousManifest, 'utf8'))
    const result = await orchestrate({ dryRun: Boolean(values['dry-run']),
      manualRestart: plan.manualRestart === true, confirmation: `ROLLBACK ${plan.expected.database} ${previous.identity}` }, operations)
    if (plan.manualRestart) console.log('Previous release has no process manifest: manual startup and verification are required after restoration; no automatic process restart is permitted.')
    if (values['dry-run']) console.log('Application-only rollback inspection complete; no database conversion or data changes are planned.')
    else if (result?.manualRestartRequired) console.log('Release restored; automatic restart and smoke tests were NOT run. All managed processes remain stopped. Operator must determine startup commands, restart the restored release, verify health/read paths, and review saved PM2 definitions before resuming traffic.')
    else console.log('Rollback completed. Review journal and smoke evidence before manually resuming traffic and reviewed schedules.')
  } finally {
    try { await operations?.close() } finally { await Promise.allSettled(clients.map((client) => client.end())) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Never print arbitrary driver/provider errors, connection strings or secret-bearing objects.
    console.error(`STOPPED: ${/^[a-z_]+$/.test(error.message) ? error.message : 'operator_rollback_failed'}. Keep writers stopped if execution began; inspect the durable journal. No automatic recovery was attempted.`)
    process.exitCode = 1
  })
}
