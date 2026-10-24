// Installer-only discovery. No financial writes, rollback or process control.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, parseEnv, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, lstat, mkdir, mkdtemp, open, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readProcessManifest, processDefinitions, matchesDefinition } from './lib/pm2Processes.mjs'
import { normalizedIP } from './lib/applicationRollback.mjs'
import { releaseManifest } from './lib/releaseManifest.mjs'
import { validatePlan, connectionConfig, verifyIdentity, verifyApplicationConnections, verifyReleases,
  releaseDifferences, isSingleForkProcess } from './rollbackApplication.mjs'

const command = promisify(execFile)
const hash = (value) => createHash('sha256').update(value).digest('hex')
// Never include raw exception text, child output, SQL, configuration or credentials.
export function planDiagnostic(error) {
  const reason = typeof error.message === 'string' && /^[a-z][a-z0-9_]{0,100}$/.test(error.message) ? error.message : undefined
  const code = typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : undefined
  return { phase: error.planPhase ?? 'arguments', code: code ?? reason
    ?? (error instanceof SyntaxError ? 'invalid_json' : error instanceof TypeError ? 'invalid_value_type' : 'unclassified_error'),
    ...(typeof error.planProcess === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(error.planProcess) ? { process: error.planProcess } : {}),
    ...(error.message === 'unsupported_pm2_definition' ? {
      execMode: ['fork_mode', 'cluster_mode'].includes(error.planExecMode) ? error.planExecMode : 'missing_or_unsupported',
      instances: Number.isSafeInteger(error.planInstances) ? error.planInstances
        : error.planInstances === undefined ? 'absent' : 'unsupported_type',
    } : {}),
    ...(Number.isInteger(error.code) ? { exitCode: error.code } : {}),
    ...(typeof error.signal === 'string' && /^SIG[A-Z]+$/.test(error.signal) ? { signal: error.signal } : {}) }
}

export async function planStep(phase, operation) {
  try { return await operation() }
  catch (error) { error.planPhase ??= phase; throw error }
}

async function writePrivate(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}

export async function createPlan({ root, environment, envFile, current, previous, record, pm2Executable, pm2Home, entries, expected, smokeUrl }) {
  if (!['production', 'staging'].includes(environment)) throw new Error('explicit_installation_target_required')
  const manifest = await readProcessManifest(join(root, 'spendcraft'))
  const desired = processDefinitions(manifest, join(root, 'spendcraft'))
  const processes = []
  for (const item of desired) {
    const name = item.name
    const matches = entries.filter((entry) => entry.name === name)
    if (matches.length !== 1) throw Object.assign(new Error('missing_or_duplicate_pm2_process'), { planProcess: name })
    const definition = matches[0].pm2_env
    if (!isSingleForkProcess(definition)) {
      throw Object.assign(new Error('unsupported_pm2_definition'), { planProcess: name,
        planExecMode: definition?.exec_mode, planInstances: definition?.instances })
    }
    if (!matchesDefinition(definition, item) || (item.cronRestart && definition.cron_restart !== item.cronRestart)) throw Object.assign(new Error('pm2_manifest_mismatch'), { planProcess: name })
    // Manifest fields are allowlisted; never persist PM2 environments or credentials.
    processes.push({ ...item, scriptSha256: hash(await readFile(item.script)) })
  }
  let previousManifest
  try { previousManifest = await readProcessManifest(join(root, 'spendcraft.old')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const previousProcesses = []
  for (const item of previousManifest ? processDefinitions(previousManifest, join(root, 'spendcraft')) : []) {
    const original = join(root, 'spendcraft.old', item.script.slice(join(root, 'spendcraft').length + 1))
    previousProcesses.push({ ...item, scriptSha256: hash(await readFile(original)) })
  }
  const plan = { rollbackKind: 'application-only', environment, root, productionRoot: environment === 'production' ? root : '/spendcraft-prod/server',
    pm2Executable, pm2Home, productionPm2Home: pm2Home, envFile, expected,
    currentManifest: join(record, 'current-release-manifest.json'), previousManifest: join(record, 'previous-release-manifest.json'),
    reviewedDifferencesSha256: hash(JSON.stringify(releaseDifferences(current, previous))),
    databaseConfigSha256: hash(await readFile(join(root, 'spendcraft/config/database.js'))),
    maintenanceStatement: 'All external writers, schedulers and traffic are fenced for this operation',
    recoveryProcedure: 'Keep writers stopped on failure. Preserve both releases and the rollback journal. No database conversion is performed; never automatically restore a database backup. Follow docs/application-release-rollback.md and verify backup recoverability before application restoration.',
    smokeUrl, processes, processManifestSha256: hash(JSON.stringify(manifest)),
    ...(previousManifest ? { previousProcesses, previousProcessManifestSha256: hash(JSON.stringify(previousManifest)) }
      : { manualRestart: true }), generated: true, generatedAt: new Date().toISOString() }
  validatePlan(plan)
  return plan
}

export async function publishPlan(maintenance, output, plan) {
  if (await realpath(maintenance) !== maintenance || !(await lstat(maintenance)).isDirectory()) throw new Error('unsafe_maintenance_directory')
  await writePrivate(join(output, 'rollback-plan.json'), plan)
  const destination = join(maintenance, 'rollback-plan.json')
  try {
    if (!(await lstat(destination)).isFile()) throw new Error('unsafe_existing_rollback_plan')
    // Retain the previous plan privately before replacing the active pointer.
    await writePrivate(join(output, 'previous-rollback-plan.json'), JSON.parse(await readFile(destination, 'utf8')))
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const temporary = join(output, 'active-plan.json')
  await writePrivate(temporary, plan)
  const archive = await open(output, 'r')
  try { await archive.sync() } finally { await archive.close() }
  await rename(temporary, destination)
  const directory = await open(maintenance, 'r')
  try { await directory.sync() } finally { await directory.close() }
}

export async function discoverDatabaseIdentity(config, expected, Client) {
  for (let index = 0; index < 3; index++) {
    const client = new Client({ ...config, options: config.options + ' -c default_transaction_read_only=on' })
    try {
      await planStep('connect-database-' + (index + 1), () => client.connect())
      if (index === 0) {
        const result = await planStep('discover-loopback-identity', () => client.query('SELECT inet_server_addr()::text AS server, inet_client_addr()::text AS peer'))
        try {
          expected.serverAddress = normalizedIP(result.rows[0]?.server)
          expected.clientAddress = normalizedIP(result.rows[0]?.peer)
        } catch { throw new Error('ambiguous_database_target') }
        if (!['127.0.0.1', '::1'].includes(expected.serverAddress)
          || !['127.0.0.1', '::1'].includes(expected.clientAddress)) throw Object.assign(new Error('ambiguous_database_target'), { planPhase: 'discover-loopback-identity' })
      }
      await planStep('verify-database-' + (index + 1), () => verifyIdentity(client, expected))
    } finally { await client.end() }
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { root: { type: 'string' }, target: { type: 'string' } } })
  if (!values.root || !['production', 'staging'].includes(values.target)) throw new Error('explicit_installation_target_required')
  const root = resolve(values.root)
  if (await planStep('validate-root', () => realpath(root)) !== root) throw new Error('noncanonical_installation_root')
  const maintenance = join(root, 'maintenance')
  await planStep('prepare-maintenance-directory', () => mkdir(maintenance, { recursive: true, mode: 0o700 }))
  if (await realpath(maintenance) !== maintenance) throw new Error('unsafe_maintenance_directory')
  const outputParent = join(root, 'script-output')
  await mkdir(outputParent, { recursive: true, mode: 0o700 })
  if (await realpath(outputParent) !== outputParent) throw new Error('unsafe_output_parent')
  const output = await planStep('create-output-directory', () => mkdtemp(join(outputParent, 'rollback-plan-generation-')))
  console.log(output) // Print unique absolute output location before any database work.
  const current = await planStep('inspect-current-release', () => releaseManifest(join(root, 'spendcraft')))
  try { await lstat(join(root, 'spendcraft.old')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    await publishPlan(maintenance, output, { root, unavailableReason: 'no_previous_installed_release' })
    console.log('Rollback unavailable: fresh installation has no previous release.')
    return
  }
  const previous = await planStep('inspect-previous-release', () => releaseManifest(join(root, 'spendcraft.old')))
  let record
  for (const name of (await planStep('list-deployment-records', () => readdir(join(root, 'releases')))).sort().reverse()) {
    if (!name.startsWith('deployment-')) continue
    const directory = join(root, 'releases', name)
    const captured = await planStep('read-deployment-record', async () => JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8')))
    if (captured.current?.identity === current.identity && captured.previous?.identity === previous.identity) { record = directory; break }
  }
  if (!record) throw new Error('matching_deployment_record_missing')
  const envFile = await planStep('resolve-environment-file', () => realpath(join(root, 'spendcraft/.env')))
  const env = await planStep('read-environment-file', async () => parseEnv(await readFile(envFile, 'utf8')))
  const expected = { host: env.PG_HOST, port: Number(env.PG_PORT), database: env.PG_DB_NAME, user: env.PG_USER,
    serverAddress: '127.0.0.1', clientAddress: '127.0.0.1' }
  // Infer IPv4/IPv6 only from a read-only connection, then independently verify all three clients.
  const config = await planStep('validate-database-configuration', () => connectionConfig(envFile, expected))
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw new Error('loopback_database_required')
  const pm2Executable = (await planStep('locate-pm2', () => command('sh', ['-c', 'command -v pm2']))).stdout.trim()
  const pm2Home = await planStep('resolve-pm2-home', () => realpath(process.env.PM2_HOME || join(process.env.HOME, '.pm2')))
  const pm2Output = await planStep('read-pm2-state', () => command(pm2Executable, ['jlist'], { maxBuffer: 8 * 1024 * 1024 }))
  const entries = await planStep('parse-pm2-state', async () => JSON.parse(pm2Output.stdout))
  const plan = await planStep('build-plan', () => createPlan({ root, environment: values.target, envFile, current, previous, record,
    pm2Executable, pm2Home, entries, expected, smokeUrl: env.APP_URL }))
  await planStep('validate-application-connections', () => verifyApplicationConnections(join(root, 'spendcraft'), plan.databaseConfigSha256))
  try { await planStep('verify-release-compatibility', () => verifyReleases(plan, output)) }
  catch (error) {
    if (!['compatible_decimal_string_release_pair_required', 'database_release_difference', 'secret_link_difference', 'tax_storage_compatibility_unknown'].includes(error.message)) throw error
    await publishPlan(maintenance, output, { root, currentManifest: plan.currentManifest,
      unavailableReason: error.message, generated: true })
    console.log('Release-specific rollback unavailable: ' + error.message + '. No conversion or rollback was executed.')
    return
  }
  const { Client } = await planStep('load-postgresql-driver', () => import('pg'))
  await discoverDatabaseIdentity(config, expected, Client)
  validatePlan(plan)
  await planStep('publish-plan', () => publishPlan(maintenance, output, plan))
  if (plan.manualRestart) console.log('Previous release has no PM2 manifest. After rollback, all managed processes remain stopped; the operator must start and verify the restored release manually.')
  console.log('Rollback plan generated at ' + join(maintenance, 'rollback-plan.json') + '. Execution still requires review, maintenance and confirmation.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('Diagnostic: ' + JSON.stringify(planDiagnostic(error)))
    console.error('Automatic rollback plan generation failed. No rollback was executed. Inspect deployment configuration; do not use an older plan for this release.')
    process.exitCode = 1
  })
}
