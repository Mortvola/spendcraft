// Explicit offline conversion/recovery CLI. Importing never connects or executes.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { mkdtemp, open, readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { configuration, failureInfo } from './auditTransactionCategoryCents.mjs'
import { createPm2Guard } from './lib/conversionPm2.mjs'
import { assertSchema } from '../installer/lib/categoryRollback.mjs'
import { sha256, verifyConnectionConfiguration, discoverTarget, verifyDatabase, classify, SCAN_SQL,
  leafExpression, atomic } from './lib/historicalCategoryConversion.mjs'

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
export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    'env': { type: 'string', default: '.env' }, 'dry-run': { type: 'boolean' }, execute: { type: 'boolean' }, recover: { type: 'boolean' },
    pm2: { type: 'string' }, 'pm2-home': { type: 'string' }, 'pm2-manifest': { type: 'string' },
    snapshot: { type: 'string' }, 'snapshot-sha256': { type: 'string' }, 'output-parent': { type: 'string' },
  } })
  if (values['dry-run'] && values.execute) throw new Error('choose_dry_run_or_execute')
  values['dry-run'] = !values.execute
  if (values.recover && (!values.snapshot || !/^[a-f0-9]{64}$/.test(values['snapshot-sha256'] ?? ''))) throw new Error('pinned_recovery_snapshot_required')
  if (!values.recover && (values.snapshot || values['snapshot-sha256'])) throw new Error('unexpected_snapshot')
  return values
}

export async function executionWriterGuard(options, target, createGuard = createPm2Guard) {
  if (target.database.name === 'spendcraft_sandbox') {
    return async () => ({ mode: 'sandbox', processes: [], checkedAt: new Date().toISOString() })
  }
  return createGuard(options)
}

export async function runConversion(client, context) {
  const { maintenance, target, output, config, readOnly, guard } = context
  const summary = { transactions: 0, numericAmounts: 0, canonicalStrings: 0, candidates: 0, mixed: 0,
    empty: 0, blockingRecords: 0, malformed: 0, exceptions: 0, deprecated: 0, balanceTracked: 0, roundedTransactions: 0, pass: 0, fail: 0, unsupported: 0, byType: {}, preconditionsPass: false }
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
          let result, input
          try {
            input = { ...row, categories: JSON.parse(row.categories_text), links: JSON.parse(row.links_text), poolIds: JSON.parse(row.pool_ids) }
            result = classify(input)
          } catch (error) {
            summary.blockingRecords++
            const status = error.message === 'conservation_fail' ? 'fail'
              : error.message === 'conservation_unsupported' || error.message === 'unsupported_transaction_shape' ? 'unsupported' : 'malformed'
            summary[status]++
            const counts = summary.byType[row.type] ??= { transactions: 0, pass: 0, fail: 0, unsupported: 0, malformed: 0, skipped: 0 }
            counts.transactions++; counts[status]++
            const blocked = error.classification
            if (blocked) {
              summary.numericAmounts += blocked.numeric; summary.canonicalStrings += blocked.strings
              if (blocked.patches.length) summary.candidates++
              if (blocked.kind === 'mixed') summary.mixed++
              if (blocked.kind === 'empty') summary.empty++
              if (blocked.rounded) summary.roundedTransactions++
            }
            const finding = blocked?.finding
            const code = /^[a-z][a-z0-9_]{2,100}$/.test(error.message ?? '') ? error.message : 'invalid_transaction_input'
            await detail.write(JSON.stringify({ id: row.id, type: row.type, error: code,
              reason: finding?.reason ?? code, deleted: row.deleted, conservation: finding?.status ?? status,
              originalCategoryAmounts: finding?.originalCategoryAmounts ?? null,
              roundedCategoryAmounts: finding?.roundedCategoryAmounts ?? null,
              categoryCents: finding?.categoryCents ?? null, categorySumCents: finding?.categorySumCents ?? null,
              expectedCents: finding?.expectedCents ?? null, differenceCents: finding?.differenceCents ?? null,
              poolAllocationCents: finding?.poolAllocationCents ?? null, nonPoolSumCents: finding?.nonPoolSumCents ?? null,
              signedRemainderCents: finding?.signedRemainderCents ?? null,
              accountTransactionLinks: input?.links ?? null, poolCategoryIds: input?.poolIds ?? null }) + '\n')
            continue
          }
          if (result.excluded) {
            if (result.kind === 'balanceTracked') {
              summary.balanceTracked++
              const counts = summary.byType[row.type] ??= { transactions: 0, pass: 0, fail: 0, unsupported: 0, malformed: 0, skipped: 0 }
              counts.transactions++; counts.skipped++
              await detail.write(JSON.stringify({ id: row.id, type: row.type, deleted: row.deleted,
                status: 'skipped', reason: 'linked_balance_tracked_account' }) + '\n')
            } else summary.deprecated++
            continue
          }
          const counts = summary.byType[row.type] ??= { transactions: 0, pass: 0, fail: 0, unsupported: 0, malformed: 0, skipped: 0 }
          counts.transactions++; counts[result.finding.status]++; summary[result.finding.status]++
          summary.numericAmounts += result.numeric; summary.canonicalStrings += result.strings
          if (result.exception) summary.exceptions++
          if (result.kind === 'mixed') summary.mixed++
          if (result.kind === 'empty') summary.empty++
          if (result.rounded) summary.roundedTransactions++
          await detail.write(JSON.stringify({ id: row.id, type: row.type, kind: result.kind, numeric: result.numeric,
            rounded: result.rounded, conservation: result.finding.status, differenceCents: result.finding.differenceCents, exception: result.exception,
            ...(result.exception ? { deleted: row.deleted, reason: result.finding.reason,
              originalCategoryAmounts: result.finding.originalCategoryAmounts, roundedCategoryAmounts: result.finding.roundedCategoryAmounts,
              categoryCents: result.finding.categoryCents, categorySumCents: result.finding.categorySumCents,
              expectedCents: result.finding.expectedCents, poolAllocationCents: result.finding.poolAllocationCents ?? null,
              nonPoolSumCents: result.finding.nonPoolSumCents ?? null, signedRemainderCents: result.finding.signedRemainderCents ?? null,
              accountTransactionLinks: input.links, poolCategoryIds: input.poolIds } : {}) }) + '\n')
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
        const manifest = { format: 2, operation: 'historical-category-conversion', target,
          maintenance, created: new Date().toISOString(), xid,
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
  if (manifest.format !== 2 || manifest.operation !== 'historical-category-conversion'
    || !isDeepStrictEqual(manifest.target, context.target) || !/^\d+$/.test(manifest.xid ?? '')
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

export function conversionDiagnostic(error, phase) {
  const audit = failureInfo(error, phase)
  const code = audit.code !== 'unclassified_error' ? audit.code
    : error instanceof SyntaxError ? 'INVALID_JSON'
      : /^[a-z][a-z0-9_]{2,100}$/.test(error.message ?? '') ? error.message : 'unclassified_error'
  const hints = {
    ENOENT: phase === 'read_environment' ? 'The selected .env file does not exist; use --env with its actual path.'
      : 'A required local file or executable was not found.',
    EACCES: 'Permission denied while reading or writing a required local file.',
    EPERM: 'The operating system denied the requested file operation.',
    ENOSPC: 'The output filesystem has insufficient free space.',
    ECONNREFUSED: 'The configured PostgreSQL host/port refused the connection.',
    ETIMEDOUT: 'The configured connection timed out.',
    '28P01': 'PostgreSQL rejected the configured username/password.',
    '3D000': 'The configured PostgreSQL database does not exist.',
    '42501': 'The database role lacks a required permission; identity verification includes pg_control_system(). No permission changes were attempted.',
    INVALID_JSON: 'A required snapshot JSON document has invalid JSON syntax.',
    SASL_PASSWORD_MISSING: 'The selected .env does not supply a usable password for password-based authentication.',
    SASL_PASSWORD_INVALID_TYPE: 'The selected .env does not supply a valid password string.',
    pm2_manifest_process_not_stopped: 'A process named in the PM2 manifest is not stopped. Stop it before execution; the script will not stop it.',
    pm2_manifest_process_missing_or_duplicate: 'The selected PM2 daemon must have exactly one registered process for each manifest name. Check PM2_HOME and the manifest.',
    invalid_process_manifest: 'The selected PM2 process manifest is missing valid required settings.',
    invalid_pm2_process_list: 'PM2 did not return a valid JSON process list.',
    pm2_daemon_identity_mismatch: 'The selected PM2_HOME does not identify the expected live PM2 daemon.',
    unclassified_error: 'An unclassified error occurred in the reported phase; raw exception text is withheld to protect credentials and financial data.',
  }
  return { phase, code, ...(typeof error.processName === 'string' && /^[a-z][a-z0-9-]*$/.test(error.processName) ? { process: error.processName } : {}), ...(hints[code] ? { hint: hints[code] } : {}),
    ...(audit.sqlPosition ? { sqlPosition: audit.sqlPosition } : {}) }
}

export async function main(args = process.argv.slice(2)) {
  const options = argumentsFor(args)
  const output = await mkdtemp(join(resolve(options['output-parent'] ?? process.cwd()), 'category-conversion-'))
  console.log(output) // Always before configuration, host checks or database work.
  let client, context
  let phase = 'read_environment'
  try {
    const config = await configuration(options['env'])
    phase = 'verify_configuration'
    verifyConnectionConfiguration(config)
    const operation = options.recover ? 'RECOVER' : 'CONVERT'
    phase = 'load_driver'
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_historical_category_conversion',
      options: `-c default_transaction_read_only=${options.execute ? 'off' : 'on'} -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=600000 -c search_path=pg_catalog,public` })
    client.on('error', () => undefined)
    phase = 'connect'
    await client.connect()
    phase = 'verify_database'
    const target = await discoverTarget(client, config)
    const identity = target.database
    let maintenance, pm2Guard
    if (options.execute) {
      phase = 'verify_pm2_stopped'
      pm2Guard = await executionWriterGuard(options, target)
      maintenance = { maintenanceId: randomUUID(), pm2: await pm2Guard() }
    }
    phase = 'write_target'
    await save(join(output, 'target.json'), { identity })
    context = { maintenance, target, output, config, readOnly: !options.execute,
      onSnapshot: evidence => console.log(JSON.stringify({ recoveryPoint: evidence })),
      guard: async () => {
        await pm2Guard()
        const freshConfig = await configuration(options['env'], {}, target.database.name)
        await verifyDatabase(client, freshConfig, target)
      } }
    phase = options.recover ? 'recover' : 'convert'
    const result = options.recover
      ? await runRecovery(client, context, resolve(options.snapshot), options['snapshot-sha256'])
      : await runConversion(client, context)
    phase = 'write_summary'
    await save(join(output, 'summary.json'), { status: 'complete', operation, dryRun: !options.execute, result,
      ...(context.snapshotHash ? { snapshotSha256: context.snapshotHash } : {}) })
    console.log(JSON.stringify({ status: 'complete', operation, dryRun: !options.execute, ...result,
      ...(context.snapshotHash ? { snapshotSha256: context.snapshotHash } : {}) }))
  } catch (error) {
    const diagnostic = conversionDiagnostic(error, phase)
    console.error(`Diagnostic: ${JSON.stringify(diagnostic)}`)
    try {
      await save(join(output, 'failure.json'), { status: 'incomplete', ...diagnostic, snapshotSha256: context?.snapshotHash ?? null })
    } catch { console.error('Could not write failure.json; retain the diagnostic printed above.') }
    const instruction = options['dry-run'] ? 'Dry-run failed; no conversion or recovery updates were requested.'
      : 'Keep writers fenced; do not infer commit outcome or restart services.'
    console.error(`INCOMPLETE: ${diagnostic.code}. ${instruction}`)
    process.exitCode = 1
  } finally {
    try { await client?.end() } catch {
      console.error('Connection closure failed; inspect the private completion evidence before further action.')
      process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
