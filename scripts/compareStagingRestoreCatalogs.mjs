import { readFile, mkdir, mkdtemp, writeFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { isIP } from 'node:net'
import { resolve, join } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { URL, pathToFileURL } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import console from 'node:console'
import { catalogQueries } from './stagingRestoreCatalogQueries.mjs'
import { normalizeConstraintDefinition } from './prepareStagingRestoreVerification.mjs'

export const target = Object.freeze({ root: '/spendcraft_staging/server', host: 'localhost', port: 5432,
  user: 'ubuntu', live: 'spendcraft', restored: 'spendcraft_restore_verify_20261024_2429cd_huh_tnmi', oid: 17260,
  account: '011038405378', region: 'us-west-2', instance: 'i-0b24684c411b4b829' })
const backupBaseline = JSON.parse(await readFile(new URL('./fixtures/stagingRestoreBackupDataBaseline.json', import.meta.url), 'utf8'))
const { fetch, AbortSignal } = globalThis
const check = (condition, code) => { if (!condition) throw new Error(code) }
const hash = text => createHash('sha256').update(text).digest('hex')
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const quote = name => '"' + name.replaceAll('"', '""') + '"'
export function loopback(value) {
  if (typeof value !== 'string') return false
  const [address, prefix, ...extra] = value.split('/')
  const family = isIP(address)
  return extra.length === 0 && family > 0 && (prefix === undefined || prefix === (family === 4 ? '32' : '128'))
    && ['127.0.0.1', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1'].includes(address)
}
export function verifyIdentity(identity, database, socket) {
  check([target.live, target.restored].includes(database), 'unapproved_database')
  check(identity.database === database && identity.username === target.user && identity.authenticated_user === target.user
    && identity.port === target.port && identity.read_only === 'on' && identity.isolation === 'repeatable read'
    && loopback(identity.server) && loopback(identity.peer) && loopback(socket.remoteAddress)
    && socket.remotePort === target.port, 'execution_identity_mismatch')
  if (database === target.restored) check(identity.oid === target.oid, 'temporary_oid_mismatch')
}
export function compareCatalogs(live, restored) {
  check(live?.format === 1 && restored?.format === 1, 'invalid_snapshot')
  check(live.identity.database === target.live && restored.identity.database === target.restored
    && restored.identity.oid === target.oid, 'snapshot_identity_mismatch')
  const differences = []
  const add = (classification, section, key, property, before, after, reason) => differences.push({
    classification, section, key, property, live: before ?? null, restored: after ?? null, reason,
  })
  for (const section of Object.keys(catalogQueries)) {
    check(Array.isArray(live.catalog[section]) && Array.isArray(restored.catalog[section]), 'incomplete_catalog')
    const maps = [live, restored].map(snapshot => {
      const map = new Map()
      for (const row of snapshot.catalog[section]) {
        check(typeof row.key === 'string' && !map.has(row.key), 'duplicate_or_missing_object_identity')
        map.set(row.key, row)
      }
      return map
    })
    for (const key of [...new Set([...maps[0].keys(), ...maps[1].keys()])].sort()) {
      const [a, b] = maps.map(map => map.get(key))
      if (!a || !b) {
        add(section.startsWith('migration') ? 'UNRESOLVED' : 'MATERIAL DIFFERENCE', section, key, 'presence',
          Boolean(a), Boolean(b), 'Missing/extra object; backup-age explanation requires independent evidence')
        continue
      }
      for (const property of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        let left = a[property], right = b[property]
        if (section === 'constraints' && property === 'definition' && castColumnsVerified(live) && castColumnsVerified(restored)) {
          left = normalizeConstraintDefinition(a); right = normalizeConstraintDefinition(b)
        }
        if (stable(left) === stable(right)) continue
        const expression = ['definition', 'expression', 'predicate', 'defaults', 'prosrc', 'probin', 'qual', 'with_check', 'keys'].includes(property)
        add(expression || section.startsWith('migration') ? 'UNRESOLVED' : 'MATERIAL DIFFERENCE',
          section, key, property, a[property], b[property], expression
            ? 'Expression/body differs; no general SQL equivalence assumed' : 'Structured catalog attribute differs')
      }
    }
  }
  for (const section of ['rowCounts', 'sequenceValues']) {
    check(live[section] && restored[section], 'missing_data_observations')
    for (const key of [...new Set([...Object.keys(live[section]), ...Object.keys(restored[section])])].sort()) {
      if (stable(live[section][key]) !== stable(restored[section][key])) {
        add('EXPECTED DIFFERENCE', section, key, 'current_value', live[section][key], restored[section][key],
          'Current live data may postdate the backup; this does not approve restored historical values')
      }
    }
  }
  for (const [key, expected] of Object.entries(backupBaseline.rowCounts)) {
    if (String(restored.rowCounts[key]) !== String(expected)) add('MATERIAL DIFFERENCE', 'backupData', key,
      'rowCount', 'backup:' + expected, restored.rowCounts[key], 'Restored count differs from pinned backup-time COPY evidence')
  }
  // Never turn a schema comparison into a claim that backup data has been verified.
  for (const snapshot of [live, restored]) {
    for (const row of snapshot.catalog.unsupported) add('UNRESOLVED', 'unsupported', row.key,
      'coverage', null, row.kind, 'Present object requires additional semantic coverage before acceptance')
  }
  const unresolved = differences.filter(row => ['MATERIAL DIFFERENCE', 'UNRESOLVED'].includes(row.classification)).length
  return { format: 1, schemaComparisonPassed: unresolved === 0, fullRestoreVerified: false,
    requiredIndependentEvidence: ['pinned backup identity', 'backup-time row counts and raw COPY hashes',
      'backup-time sequence values', 'migration rows against backup', 'referential integrity', 'tablefunc report probes'],
    counts: Object.fromEntries(['EXPECTED DIFFERENCE', 'MATERIAL DIFFERENCE', 'UNRESOLVED'].map(kind =>
      [kind, differences.filter(row => row.classification === kind).length])),
    sections: Object.keys(catalogQueries).map(section => ({ section, liveObjects: live.catalog[section].length,
      restoredObjects: restored.catalog[section].length, classification: differences.some(row => row.section === section)
        ? 'SEE DIFFERENCES' : 'MATCH' })), differences }
}
function castColumnsVerified(snapshot) {
  const columns = snapshot.catalog.columns
  return columns.some(row => row.key === 'public.plaid_item_cleanups.status'
    && row.type === 'pg_catalog.varchar' && row.modifier === 259 && row.not_null === true)
    && columns.some(row => row.key === 'public.plaid_item_cleanups.encrypted_access_token'
      && row.type === 'pg_catalog.text' && row.modifier === -1 && row.not_null === false)
}
async function hostIdentity() {
  check(await realpath(target.root) === target.root, 'installation_root_mismatch')
  const response = await fetch('http://169.254.169.254/latest/api/token', { method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' }, signal: AbortSignal.timeout(3000) })
  check(response.ok, 'imds_token_failed')
  const document = await fetch('http://169.254.169.254/latest/dynamic/instance-identity/document', {
    headers: { 'X-aws-ec2-metadata-token': await response.text() }, signal: AbortSignal.timeout(3000) })
  check(document.ok, 'imds_identity_failed')
  const ec2 = await document.json()
  check(ec2.accountId === target.account && ec2.region === target.region && ec2.instanceId === target.instance,
    'staging_ec2_identity_mismatch')
  return { account: ec2.accountId, region: ec2.region, instance: ec2.instanceId }
}
export async function collect(database, env, Client) {
  const c = new Client({ host: env.PG_HOST, port: target.port, user: env.PG_USER, password: env.PG_PASSWORD,
    database, connectionTimeoutMillis: 5000, application_name: 'spendcraft-readonly-catalog-comparison',
    options: '-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=10000' })
  const started = Date.now()
  try {
    await c.connect()
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const identity = (await c.query(`SELECT current_database() AS database,current_user AS username,
      session_user AS authenticated_user,inet_server_addr()::text AS server,inet_client_addr()::text AS peer,
      inet_server_port() AS port,current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation,
      (SELECT oid FROM pg_database WHERE datname=current_database())::int AS oid`)).rows[0]
    verifyIdentity(identity, database, c.connection.stream)
    const snapshot = { format: 1, capturedUTC: new Date().toISOString(), identity, catalog: {}, rowCounts: {}, sequenceValues: {}, integrity: [] }
    const query = async sql => {
      check(Date.now() - started < 30000, 'snapshot_time_budget_exceeded')
      const result = await c.query(`SELECT * FROM (${sql}) bounded_catalog LIMIT 10001`)
      check(result.rows.length < 10000 && Buffer.byteLength(JSON.stringify(result.rows)) < 16 * 1024 * 1024,
        'catalog_output_bound_exceeded')
      return result.rows
    }
    for (const [name, sql] of Object.entries(catalogQueries)) snapshot.catalog[name] = await query(sql)
    const relations = await query(`SELECT n.nspname,c.relname,c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_'
      AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','S') ORDER BY 1,2`)
    for (const row of relations) {
      const qualified = quote(row.nspname) + '.' + quote(row.relname)
      const key = row.nspname + '.' + row.relname
      if (row.relkind === 'S') snapshot.sequenceValues[key] = (await query(`SELECT last_value::text,is_called FROM ${qualified}`))[0]
      else snapshot.rowCounts[key] = (await query(`SELECT count(*)::text AS count FROM ${qualified}`))[0].count
    }
    for (const fk of snapshot.catalog.constraints.filter(row => row.type === 'f')) {
      check(Array.isArray(fk.columns) && Array.isArray(fk.referenced_columns)
        && fk.columns.every(name => typeof name === 'string')
        && fk.referenced_columns.every(name => typeof name === 'string')
        && fk.columns.length > 0 && fk.columns.length === fk.referenced_columns.length
        && ['s', 'f'].includes(fk.confmatchtype), 'unsupported_foreign_key_shape')
      check([fk.schema, fk.table, ...fk.referenced_table.split('.')].every(name => /^[a-z_][a-z_0-9]*$/.test(name)),
        'unsupported_identifier_shape')
      const relation = quote(fk.schema) + '.' + quote(fk.table)
      const referenced = fk.referenced_table.split('.').map(quote).join('.')
      const allPresent = fk.columns.map(name => 's.' + quote(name) + ' IS NOT NULL').join(' AND ')
      const anyPresent = fk.columns.map(name => 's.' + quote(name) + ' IS NOT NULL').join(' OR ')
      const anyMissing = fk.columns.map(name => 's.' + quote(name) + ' IS NULL').join(' OR ')
      const equality = fk.columns.map((name, index) => 's.' + quote(name) + '=r.' + quote(fk.referenced_columns[index])).join(' AND ')
      const missing = `NOT EXISTS(SELECT 1 FROM ${referenced} r WHERE ${equality})`
      const predicate = fk.confmatchtype === 'f'
        ? `(${anyPresent}) AND ((${anyMissing}) OR ${missing})` : `(${allPresent}) AND ${missing}`
      const result = (await query(`SELECT count(*)::text AS violations FROM ${relation} s WHERE ${predicate}`))[0]
      snapshot.integrity.push({ key: fk.key, ...result })
      check(result.violations === '0', 'foreign_key_integrity_failure')
    }
    const probe = await query(`SELECT amount FROM public.crosstab('SELECT 1::int,1::int,42::int ORDER BY 1,2','VALUES (1)')
      AS result(row_id integer,amount integer)`)
    check(probe.length === 1 && probe[0].amount === 42, 'crosstab_probe_failed')
    snapshot.reportProbe = { crosstab: 'passed', syntheticResult: 42 }
    await c.query('ROLLBACK')
    return snapshot
  } finally { await c.end() }
}
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { collect: { type: 'boolean' },
    target: { type: 'string' }, live: { type: 'string' }, restored: { type: 'string' } } })
  check(values.target === 'staging', 'explicit_staging_target_required')
  check(values.collect ? !values.live && !values.restored : Boolean(values.live && values.restored), 'ambiguous_mode')
  await mkdir(resolve('script-output'), { recursive: true, mode: 0o700 })
  const output = await mkdtemp(join(resolve('script-output'), 'catalog-comparison-'))
  console.log(output)
  const save = (name, value) => writeFile(join(output, name), typeof value === 'string' ? value : stable(value) + '\n',
    { flag: 'wx', mode: 0o600 })
  try {
    let live, restored
    if (values.collect) {
      const ec2 = await hostIdentity()
      const env = parseEnv(await readFile(join(target.root, 'spendcraft-env'), 'utf8'))
      check(env.PG_HOST === target.host && env.PG_PORT === '5432' && env.PG_USER === target.user
        && env.PG_DB_NAME === target.live && env.APP_URL === 'https://staging.spendcraft.app', 'configured_identity_mismatch')
      check(hash(await readFile(join(target.root, 'spendcraft/config/database.js')))
        === '9fbff9f15f8b440beab78f20f0a6403179a2ea5e91a393490e446b5bf3bb9b75', 'pg_pgLog_configuration_changed')
      const backup = await readFile(join(target.root, 'backups/database-backup-MeTelm/backup.sql'))
      check(backup.length === backupBaseline.backupSize && hash(backup) === backupBaseline.backupSha256,
        'pinned_backup_identity_mismatch')
      await save('backup-identity.json', { sha256: hash(backup), bytes: backup.length,
        startedUTC: backupBaseline.backupStartedUTC, completedUTC: backupBaseline.backupCompletedUTC })
      const { Client } = createRequire(join(target.root, 'spendcraft/package.json'))('pg')
      await save('host.json', ec2)
      live = await collect(target.live, env, Client)
      await save('live.json', live)
      await hostIdentity()
      restored = await collect(target.restored, env, Client)
      await save('restored.json', restored)
    } else {
      live = JSON.parse(await readFile(values.live, 'utf8'))
      restored = JSON.parse(await readFile(values.restored, 'utf8'))
    }
    const result = compareCatalogs(live, restored)
    await save('comparison.json', result)
    await save('summary.txt', `Schema comparison: ${result.schemaComparisonPassed ? 'MATCH' : 'REVIEW REQUIRED'}\n`
      + `Full restore acceptance: NOT ESTABLISHED (independent data gates required)\n${stable(result.counts)}\n`
      + result.differences.map(row => `${row.classification}: ${row.section}/${row.key}/${row.property}`).join('\n') + '\n')
    if (!result.schemaComparisonPassed) process.exitCode = 1
    return output
  } catch (error) {
    await save('failure.json', { status: 'STOPPED', code: /^[a-z_]+$/.test(error.message) ? error.message : 'comparison_failed',
      databaseMutationRequested: false, cleanupRequested: false })
    throw error
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Catalog comparison stopped; inspect private output. No cleanup requested.'); process.exitCode = 1 })
}
