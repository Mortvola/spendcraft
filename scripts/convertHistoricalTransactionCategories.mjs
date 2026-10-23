// Explicit offline conversion/recovery CLI. Importing never connects or executes.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { mkdtemp, open, readFile, realpath, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { join, resolve, isAbsolute } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { assertSchema } from '../installer/lib/categoryRollback.mjs'
import { releaseManifest } from '../installer/lib/releaseManifest.mjs'
import { sha256, MAINTENANCE, validatePlan, verifyHost, verifyConfigured, verifyDatabase, classify, SCAN_SQL,
  leafExpression, exactConfirmation, atomic } from './lib/historicalCategoryConversion.mjs'

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
async function save(file, value) {
  const handle = await open(file, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync() } finally { await handle.close() }
}
async function* records(file) {
  const input = createReadStream(file, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of lines) yield JSON.parse(line) } finally { lines.close(); input.destroy() }
}
async function instanceDocument() {
  const response = await globalThis.fetch('http://169.254.169.254/latest/api/token', {
    method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' }, redirect: 'error', signal: globalThis.AbortSignal.timeout(3000),
  })
  if (!response.ok) throw new Error('imds_token_failed')
  const document = await globalThis.fetch('http://169.254.169.254/latest/dynamic/instance-identity/document', {
    headers: { 'X-aws-ec2-metadata-token': await response.text() }, redirect: 'error', signal: globalThis.AbortSignal.timeout(3000),
  })
  if (!document.ok) throw new Error('imds_identity_failed')
  return document.json()
}

export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    plan: { type: 'string' }, 'dry-run': { type: 'boolean' }, execute: { type: 'boolean' }, recover: { type: 'boolean' },
    confirm: { type: 'string' }, snapshot: { type: 'string' }, 'snapshot-sha256': { type: 'string' }, 'output-parent': { type: 'string' },
  } })
  if (!values.plan || Number(Boolean(values['dry-run'])) + Number(Boolean(values.execute)) !== 1) throw new Error('explicit_plan_and_one_mode_required')
  if (values.recover && (!values.snapshot || !/^[a-f0-9]{64}$/.test(values['snapshot-sha256'] ?? ''))) throw new Error('pinned_recovery_snapshot_required')
  if (!values.recover && (values.snapshot || values['snapshot-sha256'])) throw new Error('unexpected_snapshot')
  return values
}

export async function operationalPreflight(plan, target, listArchive = async file => {
  const { stdout } = await promisify(execFile)('pg_restore', ['--list', resolve(file)], { maxBuffer: 16 * 1024 * 1024, timeout: 30000 })
  return stdout
}) {
  if (plan.maintenanceStatement !== MAINTENANCE || typeof plan.maintenanceId !== 'string' || plan.maintenanceId.length < 12
    || !Array.isArray(plan.writers) || !plan.writers.length || plan.writers.some(writer => typeof writer.name !== 'string' || writer.stopped !== true)) {
    throw new Error('writer_fence_attestation_required')
  }
  const backup = plan.backup
  const age = Date.now() - Date.parse(backup?.verifiedAt)
  if (!backup || !isAbsolute(backup.file ?? '') || !Number.isFinite(age) || age < 0 || age > 86400000 || backup.database !== target.database.name
    || typeof backup.recoveryProcedure !== 'string' || backup.recoveryProcedure.length < 40
    || !/^[a-f0-9]{64}$/.test(backup.sha256 ?? '') || await hashFile(backup.file) !== backup.sha256) throw new Error('verified_fresh_backup_required')
  const info = await stat(backup.file)
  const fileAge = Date.now() - info.mtimeMs
  if (!info.isFile() || info.size <= 0 || fileAge < -60000 || fileAge > 86400000) throw new Error('fresh_backup_file_required')
  const stdout = await listArchive(backup.file)
  if (stdout.match(/^;\s*dbname: (.+)$/m)?.[1] !== target.database.name) throw new Error('backup_database_mismatch')
}

async function noOtherSessions(client) {
  await client.query('SELECT pg_stat_clear_snapshot()')
  const { rows } = await client.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
    AND pid<>pg_backend_pid() AND backend_type='client backend'`)
  if (rows.length) throw new Error('other_database_clients_present')
}

export async function runConversion(client, context) {
  const { plan, target, output, config, readOnly, guard } = context
  const summary = { transactions: 0, numericAmounts: 0, canonicalStrings: 0, candidates: 0, mixed: 0,
    empty: 0, blockingRecords: 0, malformed: 0, exceptions: 0, deprecated: 0, roundedTransactions: 0, pass: 0, fail: 0, unsupported: 0, byType: {}, preconditionsPass: false }
  const snapshotPath = join(output, 'original-categories.jsonl')
  const snapshot = readOnly ? undefined : await open(snapshotPath, 'wx', 0o600)
  const detail = await open(join(output, 'transactions.jsonl'), 'wx', 0o600)
  try {
    return await atomic(client, readOnly, async () => {
      await verifyDatabase(client, config, target)
      await assertSchema(client)
      const { rows: [mode] } = await client.query(`SELECT current_setting('transaction_read_only') AS read_only,
        current_setting('transaction_isolation') AS isolation`)
      if (mode.read_only !== (readOnly ? 'on' : 'off') || mode.isolation !== 'repeatable read') throw new Error('transaction_mode_mismatch')
      let xid
      if (!readOnly) {
        await guard()
        const { rows: [row] } = await client.query('SELECT pg_current_xact_id()::text AS xid')
        xid = (BigInt(row.xid) % 4294967296n).toString()
      }
      let after = '0'
      for (;;) {
        const { rows } = await client.query(SCAN_SQL, [after, 100])
        if (!rows.length) break
        for (const row of rows) {
          summary.transactions++
          let result
          try {
            result = classify({ ...row, categories: JSON.parse(row.categories_text), links: JSON.parse(row.links_text), poolIds: JSON.parse(row.pool_ids) })
          } catch (error) {
            summary.blockingRecords++
            const status = error.message === 'conservation_fail' ? 'fail'
              : error.message === 'conservation_unsupported' || error.message === 'unsupported_transaction_shape' ? 'unsupported' : 'malformed'
            summary[status]++
            const counts = summary.byType[row.type] ??= { transactions: 0, pass: 0, fail: 0, unsupported: 0, malformed: 0 }
            counts.transactions++; counts[status]++
            const blocked = error.classification
            if (blocked) {
              summary.numericAmounts += blocked.numeric; summary.canonicalStrings += blocked.strings
              if (blocked.patches.length) summary.candidates++
              if (blocked.kind === 'mixed') summary.mixed++
              if (blocked.kind === 'empty') summary.empty++
              if (blocked.rounded) summary.roundedTransactions++
            }
            await detail.write(JSON.stringify({ id: row.id, type: row.type, error: error.message }) + '\n')
            continue
          }
          if (result.excluded) { summary.deprecated++; continue }
          const counts = summary.byType[row.type] ??= { transactions: 0, pass: 0, fail: 0, unsupported: 0, malformed: 0 }
          counts.transactions++; counts[result.finding.status]++; summary[result.finding.status]++
          summary.numericAmounts += result.numeric; summary.canonicalStrings += result.strings
          if (result.exception) summary.exceptions++
          if (result.kind === 'mixed') summary.mixed++
          if (result.kind === 'empty') summary.empty++
          if (result.rounded) summary.roundedTransactions++
          await detail.write(JSON.stringify({ id: row.id, type: row.type, kind: result.kind, numeric: result.numeric,
            rounded: result.rounded, conservation: result.finding.status, differenceCents: result.finding.differenceCents, exception: result.exception }) + '\n')
          if (!result.patches.length) continue
          summary.candidates++
          if (!readOnly) {
            const { expression, parameters } = leafExpression(result.patches)
            const { rows: [proposed] } = await client.query(`SELECT (${expression})::text AS categories,
              md5((to_jsonb(t) || jsonb_build_object('categories', ${expression}))::text) AS row_hash
              FROM public.transactions t WHERE id=$${parameters.length + 1}`, [...parameters, row.id])
            if (!proposed) throw new Error('candidate_disappeared')
            await snapshot.write(JSON.stringify({ id: String(row.id), budget: row.application_id, type: row.type, original: row.categories_text,
              converted: proposed.categories, originalHash: row.row_hash, convertedHash: proposed.row_hash,
              metadataHash: row.metadata_hash, originalVersion: row.row_version, patches: result.patches }) + '\n')
          }
        }
        const next = String(rows.at(-1).id)
        if (BigInt(next) <= BigInt(after)) throw new Error('invalid_page_progress')
        after = next
      }
      summary.preconditionsPass = summary.blockingRecords === 0
      await detail.sync()
      await save(join(output, 'preflight.json'), summary)
      if (!summary.preconditionsPass) throw new Error('preconditions_failed_inspect_transactions_jsonl')
      if (!readOnly) {
        await snapshot.sync(); await snapshot.close()
        const digest = await hashFile(snapshotPath)
        const manifest = { format: 1, operation: 'historical-category-conversion', target, environment: plan.environment,
          release: target.release, maintenanceId: plan.maintenanceId, backup: plan.backup, writers: plan.writers, created: new Date().toISOString(), xid,
          candidates: summary.candidates, amounts: summary.numericAmounts, dataSha256: digest }
        const manifestPath = join(output, 'snapshot.json')
        await save(manifestPath, manifest)
        // Durability of directory entries matters as well as file contents.
        const directory = await open(output, 'r'); try { await directory.sync() } finally { await directory.close() }
        if (await hashFile(snapshotPath) !== digest) throw new Error('snapshot_verification_failed')
        context.snapshotHash = await hashFile(manifestPath)
        await context.onSnapshot?.({ snapshot: manifestPath, sha256: context.snapshotHash })
        let changed = 0
        for await (const entry of records(snapshotPath)) {
          await guard()
          const { expression, parameters } = leafExpression(entry.patches)
          const offset = parameters.length
          const { rows } = await client.query(`UPDATE public.transactions t SET categories=${expression}
            WHERE id=$${offset + 1} AND application_id=$${offset + 2} AND xmin::text=$${offset + 3}
            AND md5(to_jsonb(t)::text)=$${offset + 4}
            RETURNING categories::text AS categories, md5(to_jsonb(t)::text) AS row_hash,
              md5((to_jsonb(t)-'categories')::text) AS metadata_hash, xmin::text AS version`,
          [...parameters, entry.id, entry.budget, entry.originalVersion, entry.originalHash])
          if (rows.length !== 1 || rows[0].categories !== entry.converted || rows[0].row_hash !== entry.convertedHash
            || rows[0].metadata_hash !== entry.metadataHash || rows[0].version !== xid) throw new Error('conversion_verification_failed')
          changed++
        }
        if (changed !== summary.candidates) throw new Error('candidate_count_mismatch')
        // Re-read after all writes to catch deferred interaction within this transaction.
        for await (const entry of records(snapshotPath)) await verifyRow(client, entry, xid, false)
        if (await hashFile(snapshotPath) !== digest) throw new Error('snapshot_changed_during_conversion')
        await guard(true)
      }
      return summary
    })
  } finally { await snapshot?.close(); await detail.close() }
}

async function verifyRow(client, entry, xid, original) {
  const { rows: [row] } = await client.query(`SELECT categories::text AS categories, md5(to_jsonb(t)::text) AS row_hash,
    xmin::text AS version FROM public.transactions t WHERE id=$1 AND application_id=$2`, [entry.id, entry.budget])
  if (!row || row.categories !== (original ? entry.original : entry.converted)
    || row.row_hash !== (original ? entry.originalHash : entry.convertedHash)
    || (!original && row.version !== xid)) throw new Error('changed_row_recovery_refused')
  return row
}

export async function runRecovery(client, context, snapshotFile, pinnedHash) {
  const manifestText = await readFile(snapshotFile, 'utf8')
  if (sha256(manifestText) !== pinnedHash) throw new Error('snapshot_identity_mismatch')
  const manifest = JSON.parse(manifestText)
  const dataFile = join(resolve(snapshotFile, '..'), 'original-categories.jsonl')
  if (manifest.format !== 1 || manifest.operation !== 'historical-category-conversion'
    || manifest.environment !== context.plan.environment || !isDeepStrictEqual(manifest.target, context.target)
    || manifest.release !== context.target.release || !/^\d+$/.test(manifest.xid ?? '')
    || await hashFile(dataFile) !== manifest.dataSha256) throw new Error('snapshot_target_mismatch')
  return atomic(client, context.readOnly, async () => {
    await verifyDatabase(client, context.config, context.target)
    await assertSchema(client)
    let examined = 0, restored = 0, alreadyOriginal = 0
    for await (const entry of records(dataFile)) {
      examined++
      const { rows: [live] } = await client.query('SELECT md5(to_jsonb(t)::text) AS row_hash, categories::text AS categories FROM public.transactions t WHERE id=$1 AND application_id=$2', [entry.id, entry.budget])
      // Exact original whole-row state is an idempotent no-op, never an overwrite.
      if (live?.row_hash === entry.originalHash && live.categories === entry.original) { alreadyOriginal++; continue }
      await verifyRow(client, entry, manifest.xid, false)
      if (context.readOnly) continue
      await context.guard()
      const { rows } = await client.query(`UPDATE public.transactions t SET categories=$1::jsonb WHERE id=$2 AND application_id=$3
        AND xmin::text=$4 AND md5(to_jsonb(t)::text)=$5 RETURNING id`, [entry.original, entry.id, entry.budget, manifest.xid, entry.convertedHash])
      if (rows.length !== 1) throw new Error('changed_row_recovery_refused')
      await verifyRow(client, entry, manifest.xid, true)
      restored++
    }
    if (examined !== manifest.candidates) throw new Error('snapshot_count_mismatch')
    if (!context.readOnly) {
      for await (const entry of records(dataFile)) await verifyRow(client, entry, manifest.xid, true)
      if (await hashFile(dataFile) !== manifest.dataSha256 || await hashFile(snapshotFile) !== pinnedHash) throw new Error('snapshot_changed_during_recovery')
      await context.guard(true)
    }
    return { examined, restored, alreadyOriginal, preconditionsPass: true }
  })
}

export async function main(args = process.argv.slice(2)) {
  const options = argumentsFor(args)
  const output = await mkdtemp(join(resolve(options['output-parent'] ?? process.cwd()), 'category-conversion-'))
  console.log(output) // Always before configuration, host checks or database work.
  let client, context
  try {
    const plan = JSON.parse(await readFile(options.plan, 'utf8'))
    const target = validatePlan(plan)
    const operation = options.recover ? 'RECOVER' : 'CONVERT'
    if (options.execute && options.confirm !== exactConfirmation(operation, plan, options['snapshot-sha256'])) throw new Error('exact_target_confirmation_required')
    const config = await configuration(target.envFile, {}, target.database.name)
    verifyConfigured(config, target)
    let codecHash
    const localGuard = async (full = false) => {
      verifyHost(await instanceDocument(), target)
      if (await realpath(join(target.root, 'spendcraft')) !== join(target.root, 'spendcraft')
        || (full && (await releaseManifest(join(target.root, 'spendcraft'))).identity !== target.release)) throw new Error('compatible_release_identity_mismatch')
      const currentCodecHash = sha256(await readFile(join(target.root, 'spendcraft/app/services/categoryAmountCodec.js')))
      if (codecHash && codecHash !== currentCodecHash) throw new Error('compatible_release_identity_mismatch')
      codecHash = currentCodecHash
    }
    await localGuard(true)
    if (options.execute) await operationalPreflight(plan, target)
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_historical_category_conversion',
      options: `-c default_transaction_read_only=${options.execute ? 'off' : 'on'} -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=600000 -c search_path=pg_catalog,public` })
    client.on('error', () => undefined)
    await client.connect()
    const identity = await verifyDatabase(client, config, target)
    await save(join(output, 'target.json'), { environment: plan.environment, identity, release: target.release })
    context = { plan, target, output, config, readOnly: !options.execute,
      onSnapshot: evidence => console.log(JSON.stringify({ recoveryPoint: evidence })),
      guard: async (full = false) => {
        await localGuard(full)
        const freshConfig = await configuration(target.envFile, {}, target.database.name)
        await verifyDatabase(client, freshConfig, target)
        await noOtherSessions(client)
      } }
    const result = options.recover
      ? await runRecovery(client, context, resolve(options.snapshot), options['snapshot-sha256'])
      : await runConversion(client, context)
    await save(join(output, 'summary.json'), { status: 'complete', operation, dryRun: !options.execute, result,
      ...(context.snapshotHash ? { snapshotSha256: context.snapshotHash } : {}) })
    console.log(JSON.stringify({ status: 'complete', operation, dryRun: !options.execute, ...result,
      ...(context.snapshotHash ? { snapshotSha256: context.snapshotHash } : {}) }))
  } catch (error) {
    // Only controlled labels leave this process; database errors can contain financial data.
    const code = /^[a-z][a-z0-9_]{2,100}$/.test(error.message ?? '') ? error.message : 'operation_failed_inspect_private_evidence'
    await save(join(output, 'failure.json'), { status: 'incomplete', code, snapshotSha256: context?.snapshotHash ?? null })
    console.error(`INCOMPLETE: ${code}. Keep writers fenced; do not infer commit outcome or restart services.`)
    process.exitCode = 1
  } finally {
    try { await client?.end() } catch {
      console.error('Connection closure failed; inspect the private completion evidence before further action.')
      process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
