// Offline Statement-income-only conversion/recovery. Importing never connects or runs application code.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { mkdtemp, mkdir, open, readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { PAGE_SQL, FIELDS } from './auditStatementIncomePrecision.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { convertedAmount, discoverTarget, verifyConnectionConfiguration, verifyDatabase, atomic } from './lib/historicalCategoryConversion.mjs'
import { createPm2Guard } from './lib/conversionPm2.mjs'
import { conversionDiagnostic } from './convertHistoricalTransactionCategories.mjs'

const unrelatedData = `md5(((to_jsonb(s)-'data') || jsonb_build_object('data', s.data - ARRAY[${FIELDS.map(f => `'${f}'`).join(',')}]::text[]))::text)`
export const SCAN_SQL = PAGE_SQL.replace('s.id, s.account_id,', `s.id, s.xmin::text AS row_version,
  md5(to_jsonb(s)::text) AS row_hash, ${unrelatedData} AS metadata_hash, s.account_id,`)
export const SCHEMA_SQL = `SELECT a.atttypid='jsonb'::regtype AS jsonb, c.relkind='r' AS ordinary,
  c.relrowsecurity AS rls, c.relhasrules AS rules,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS triggers
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='data' AND NOT a.attisdropped
  WHERE n.nspname='public' AND c.relname='statements'`
// Same owning-Budget serialization as the Statement API; lock in stable ID order.
export const LOCK_SQL = `SELECT b.id FROM public.applications b WHERE EXISTS (
  SELECT 1 FROM public.statements s JOIN public.accounts a ON a.id=s.account_id
  JOIN public.institutions i ON i.id=a.institution_id WHERE i.application_id=b.id
) ORDER BY b.id FOR UPDATE OF b`

export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    database: { type: 'string' }, env: { type: 'string', default: '.env' }, execute: { type: 'boolean' },
    'dry-run': { type: 'boolean' }, recover: { type: 'boolean' }, snapshot: { type: 'string' },
    'snapshot-sha256': { type: 'string' }, 'output-parent': { type: 'string' },
    pm2: { type: 'string' }, 'pm2-home': { type: 'string' }, 'pm2-manifest': { type: 'string' },
  } })
  if (!/^[a-zA-Z0-9_]+$/.test(values.database ?? '')) throw new Error('explicit_database_required')
  if (values.execute && values['dry-run']) throw new Error('choose_dry_run_or_execute')
  if (values.recover && (!values.snapshot || !/^[a-f0-9]{64}$/.test(values['snapshot-sha256'] ?? ''))) throw new Error('pinned_recovery_snapshot_required')
  if (!values.recover && (values.snapshot || values['snapshot-sha256'])) throw new Error('unexpected_snapshot')
  return values
}
export function classify(row) {
  const result = { numericAmounts: 0, stringAmounts: 0, canonicalStrings: 0, malformedAmounts: 0,
    roundedAmounts: 0, mixed: 0, missingFields: 0, sqlNullData: 0, jsonNullData: 0, errors: [], patches: [], changes: [] }
  if (row.data_text === null) return { ...result, sqlNullData: 1 }
  const data = JSON.parse(row.data_text)
  if (data === null) return { ...result, jsonNullData: 1 }
  if (typeof data !== 'object' || Array.isArray(data)) return { ...result, errors: [{ reason: 'unsupported_statement_data_shape' }] }
  if (!Number.isSafeInteger(row.budget_id) || row.budget_id < 1
    || !Number.isSafeInteger(row.account_id) || row.account_id < 1) return { ...result, errors: [{ reason: 'statement_ownership_unavailable' }] }
  const tokens = JSON.parse(row.tokens)
  for (const field of FIELDS) {
    if (!Object.hasOwn(data, field)) { result.missingFields++; continue }
    if (typeof data[field] === 'number') result.numericAmounts++
    if (typeof data[field] === 'string') result.stringAmounts++
    try {
      const amount = convertedAmount(data[field])
      if (amount.numeric) {
        result.patches.push({ field, stored: amount.stored })
        const precision = inspectAmount(data[field], tokens[field])
        if (precision.changed ?? amount.rounded) result.roundedAmounts++
        result.changes.push({ field, originalToken: tokens[field], proposedAmount: amount.stored,
          changed: precision.changed ?? amount.rounded, differenceCents: precision.differenceCents ?? null })
      } else result.canonicalStrings++
    } catch (error) { result.malformedAmounts++; result.errors.push({ field, reason: error.message }) }
  }
  result.mixed = Number(result.numericAmounts > 0 && result.stringAmounts > 0)
  return result
}
export function leafExpression(patches) {
  let expression = 's.data'
  const parameters = [], seen = new Set()
  if (patches.length > FIELDS.length) throw new Error('invalid_patch')
  for (const { field, stored } of patches) {
    if (!FIELDS.includes(field) || seen.has(field) || typeof stored !== 'string') throw new Error('invalid_patch')
    seen.add(field)
    convertedAmount(stored)
    expression = `jsonb_set(${expression}, $${parameters.length + 1}::text[], to_jsonb($${parameters.length + 2}::text), false)`
    parameters.push([field], stored)
  }
  return { expression, parameters }
}

async function save(file, value) {
  const f = await open(file, 'wx', 0o600)
  try { await f.writeFile(JSON.stringify(value) + '\n'); await f.sync() } finally { await f.close() }
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
async function* records(file) {
  const input = createReadStream(file, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of lines) yield JSON.parse(line) } finally { lines.close(); input.destroy() }
}
async function admission(client, context) {
  await verifyDatabase(client, context.config, context.target)
  const { rows } = await client.query(SCHEMA_SQL)
  if (rows.length !== 1 || !rows[0].jsonb || !rows[0].ordinary || rows[0].rls || rows[0].rules || rows[0].triggers) throw new Error('unsupported_statement_income_schema')
  const { rows: [mode] } = await client.query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation")
  if (mode.read_only !== (context.readOnly ? 'on' : 'off') || mode.isolation !== 'repeatable read') throw new Error('transaction_mode_mismatch')
}
async function verifyRow(client, entry, xid, original = false) {
  const { rows: [row] } = await client.query(`SELECT s.data::text AS data, md5(to_jsonb(s)::text) AS row_hash,
    s.xmin::text AS version FROM public.statements s JOIN public.accounts a ON a.id=s.account_id
    JOIN public.institutions i ON i.id=a.institution_id WHERE s.id=$1 AND i.application_id=$2 AND s.account_id=$3`, [entry.id, entry.budget, entry.accountId])
  if (!row || row.data !== (original ? entry.original : entry.converted)
    || row.row_hash !== (original ? entry.originalHash : entry.convertedHash)
    || (!original && row.version !== xid)) throw new Error('changed_row_recovery_refused')
}

export async function runConversion(client, context) {
  const summary = { statements: 0, candidates: 0, numericAmounts: 0, stringAmounts: 0, canonicalStrings: 0,
    malformedAmounts: 0, roundedAmounts: 0, mixed: 0, missingFields: 0, sqlNullData: 0, jsonNullData: 0, blockingRecords: 0 }
  const dataPath = join(context.output, 'original-statement-income.jsonl')
  const details = await open(join(context.output, 'statements.jsonl'), 'wx', 0o600)
  const snapshot = context.readOnly ? null : await open(dataPath, 'wx', 0o600)
  try {
    return await atomic(client, context.readOnly, async () => {
      await admission(client, context)
      let xid
      if (!context.readOnly) { await context.guard(); await client.query(LOCK_SQL); xid = (BigInt((await client.query('SELECT pg_current_xact_id()::text AS xid')).rows[0].xid) % 4294967296n).toString() }
      let after = '0'
      for (;;) {
        const { rows } = await client.query(SCAN_SQL, [after, 100])
        if (!rows.length) break
        for (const row of rows) {
          summary.statements++
          const result = classify(row)
          for (const key of Object.keys(summary).filter(key => key in result)) summary[key] += result[key]
          if (result.errors.length) summary.blockingRecords++
          await details.write(JSON.stringify({ id: row.id, budget: row.budget_id, accountId: row.account_id, ...result }) + '\n')
          if (!result.patches.length || result.errors.length) continue
          summary.candidates++
          if (context.readOnly) continue
          const { expression, parameters } = leafExpression(result.patches)
          const { rows: [proposed] } = await client.query(`SELECT (${expression})::text AS data,
            md5((to_jsonb(s) || jsonb_build_object('data', ${expression}))::text) AS row_hash
            FROM public.statements s WHERE id=$${parameters.length + 1}`, [...parameters, row.id])
          if (!proposed) throw new Error('candidate_disappeared')
          await snapshot.write(JSON.stringify({ id: row.id, budget: row.budget_id, accountId: row.account_id, original: row.data_text,
            converted: proposed.data, originalHash: row.row_hash, convertedHash: proposed.row_hash,
            metadataHash: row.metadata_hash, originalVersion: row.row_version, patches: result.patches }) + '\n')
        }
        const next = String(rows.at(-1).id)
        if (BigInt(next) <= BigInt(after)) throw new Error('invalid_page_progress')
        after = next
      }
      await details.sync()
      await save(join(context.output, 'preflight.json'), summary)
      if (summary.blockingRecords) throw new Error('preconditions_failed_inspect_statements_jsonl')
      if (!context.readOnly) {
        await snapshot.sync()
        const manifest = { format: 1, operation: 'historical-statement-income-conversion', target: context.target,
          xid, candidates: summary.candidates, dataSha256: await hashFile(dataPath), created: new Date().toISOString() }
        const manifestPath = join(context.output, 'snapshot.json')
        await save(manifestPath, manifest)
        const directory = await open(context.output, 'r'); try { await directory.sync() } finally { await directory.close() }
        context.snapshotHash = await hashFile(manifestPath)
        await context.onSnapshot?.({ snapshot: manifestPath, sha256: context.snapshotHash })
        let changed = 0
        for await (const entry of records(dataPath)) {
          await context.guard()
          const { expression, parameters } = leafExpression(entry.patches)
          const n = parameters.length
          const { rows } = await client.query(`UPDATE public.statements s SET data=${expression}
            FROM public.accounts a, public.institutions i
            WHERE s.account_id=a.id AND a.institution_id=i.id AND s.id=$${n + 1} AND i.application_id=$${n + 2}
              AND s.xmin::text=$${n + 3} AND md5(to_jsonb(s)::text)=$${n + 4} AND s.account_id=$${n + 5}
            RETURNING s.data::text AS data, md5(to_jsonb(s)::text) AS row_hash, ${unrelatedData} AS metadata_hash, s.xmin::text AS version`,
          [...parameters, entry.id, entry.budget, entry.originalVersion, entry.originalHash, entry.accountId])
          if (rows.length !== 1 || rows[0].data !== entry.converted || rows[0].row_hash !== entry.convertedHash
            || rows[0].metadata_hash !== entry.metadataHash || rows[0].version !== xid) throw new Error('conversion_verification_failed')
          changed++
        }
        if (changed !== summary.candidates) throw new Error('candidate_count_mismatch')
        for await (const entry of records(dataPath)) await verifyRow(client, entry, xid)
        if (await hashFile(dataPath) !== manifest.dataSha256 || await hashFile(manifestPath) !== context.snapshotHash) throw new Error('snapshot_changed_during_conversion')
        await context.guard()
      }
      return summary
    })
  } finally { await snapshot?.close(); await details.close() }
}
export async function runRecovery(client, context, snapshotPath, pinnedHash) {
  if (await hashFile(snapshotPath) !== pinnedHash) throw new Error('snapshot_identity_mismatch')
  const manifest = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const dataPath = join(resolve(snapshotPath, '..'), 'original-statement-income.jsonl')
  if (manifest.operation !== 'historical-statement-income-conversion' || manifest.format !== 1 || !isDeepStrictEqual(manifest.target, context.target)
    || !/^\d+$/.test(manifest.xid ?? '') || await hashFile(dataPath) !== manifest.dataSha256) throw new Error('snapshot_target_mismatch')
  return atomic(client, context.readOnly, async () => {
    await admission(client, context)
    if (!context.readOnly) {
      await context.guard()
      const budgets = new Set()
      for await (const entry of records(dataPath)) {
        if (!Number.isSafeInteger(entry.budget) || entry.budget < 1) throw new Error('invalid_snapshot_budget')
        budgets.add(entry.budget)
      }
      const { rows } = await client.query('SELECT id FROM public.applications WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE', [[...budgets].sort((a, b) => a - b)])
      if (rows.length !== budgets.size) throw new Error('snapshot_budget_missing')
    }
    let examined = 0
    for await (const entry of records(dataPath)) {
      await verifyRow(client, entry, manifest.xid)
      if (!context.readOnly) {
        await context.guard()
        const { rows } = await client.query(`UPDATE public.statements s SET data=$1::jsonb FROM public.accounts a, public.institutions i
          WHERE s.account_id=a.id AND a.institution_id=i.id AND s.id=$2 AND i.application_id=$3
            AND s.xmin::text=$4 AND md5(to_jsonb(s)::text)=$5 AND s.account_id=$6 RETURNING s.id`,
        [entry.original, entry.id, entry.budget, manifest.xid, entry.convertedHash, entry.accountId])
        if (rows.length !== 1) throw new Error('changed_row_recovery_refused')
        await verifyRow(client, entry, manifest.xid, true)
      }
      examined++
    }
    if (examined !== manifest.candidates) throw new Error('snapshot_count_mismatch')
    if (!context.readOnly) {
      for await (const entry of records(dataPath)) await verifyRow(client, entry, manifest.xid, true)
      if (await hashFile(dataPath) !== manifest.dataSha256 || await hashFile(snapshotPath) !== pinnedHash) throw new Error('snapshot_changed_during_recovery')
      await context.guard()
    }
    return { examined, restored: context.readOnly ? 0 : examined }
  })
}
export async function main(args = process.argv.slice(2)) {
  const options = argumentsFor(args)
  const parent = resolve(options['output-parent'] ?? 'script-output')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const output = await mkdtemp(join(parent, 'statement-income-conversion-'))
  console.log(output)
  let client, context
  let phase = 'configuration'
  try {
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_historical_statement_income_conversion',
      options: `-c default_transaction_read_only=${options.execute ? 'off' : 'on'} -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=600000 -c search_path=pg_catalog,public` })
    client.on('error', () => undefined)
    phase = 'connect'; await client.connect()
    phase = 'identity'; const target = await discoverTarget(client, config)
    const pm2Guard = options.execute ? await createPm2Guard(options) : undefined
    if (pm2Guard) await pm2Guard()
    await save(join(output, 'target.json'), target)
    context = { output, config, target, readOnly: !options.execute,
      guard: async () => { await pm2Guard(); await verifyDatabase(client, await configuration(options.env, {}, options.database), target) },
      onSnapshot: point => console.log(JSON.stringify({ recoveryPoint: point })) }
    phase = options.recover ? 'recover' : 'convert'
    const result = options.recover ? await runRecovery(client, context, resolve(options.snapshot), options['snapshot-sha256']) : await runConversion(client, context)
    const summary = { status: 'complete', operation: options.recover ? 'RECOVER' : 'CONVERT', dryRun: !options.execute, ...result,
      ...(context.snapshotHash ? { snapshotSha256: context.snapshotHash } : {}) }
    await save(join(output, 'summary.json'), summary)
    const human = JSON.stringify(summary, null, 2) + '\n'
    const file = await open(join(output, 'summary.txt'), 'wx', 0o600); try { await file.writeFile(human); await file.sync() } finally { await file.close() }
    console.log(JSON.stringify(summary))
  } catch (error) {
    const diagnostic = conversionDiagnostic(error, phase)
    await save(join(output, 'failure.json'), { status: 'incomplete', ...diagnostic, snapshotSha256: context?.snapshotHash ?? null })
    console.error(JSON.stringify(diagnostic))
    console.error(options.execute ? 'Keep writers stopped; inspect snapshot and commit outcome before any retry.' : 'Read-only check failed; no conversion requested.')
    process.exitCode = 1
  } finally { await client?.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
