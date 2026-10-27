// Offline Tax/TransactionLog conversion. Importing never connects or boots the app.
import process from 'node:process'
import console from 'node:console'
import { isDeepStrictEqual } from 'node:util'
import { mkdtemp, mkdir, open, readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { argumentsFor } from './convertHistoricalStatementIncome.mjs'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { convertedAmount, discoverTarget, verifyConnectionConfiguration, verifyDatabase, atomic } from './lib/historicalCategoryConversion.mjs'
import { createPm2Guard } from './lib/conversionPm2.mjs'
import { conversionDiagnostic } from './convertHistoricalTransactionCategories.mjs'

export { argumentsFor }
export const TAX_FIELDS = ['taxableInterest', 'qualifiedDividends', 'ordinaryDividends', 'taxableIraDistributions',
  'taxablePensionAndAnnuities', 'taxableSocialSecurityBenefits', 'additionalTaxableIncome',
  'shortTermCapitalGains', 'longTermCapitalGains', 'qualifiedBusinessIncomeDeduction',
  'estimated.expectedAgi', 'estimated.priorYearAgi', 'estimated.priorYearTotalTax']
const sources = {
  tax: { table: 'taxes', column: 'data', owner: 'budget_id', type: 'jsonb', fields: TAX_FIELDS },
  log: { table: 'transaction_logs', column: 'changes', owner: 'application_id', type: 'json', fields: ['amount.old', 'amount.new'] },
}
function sourceFor(source) {
  if (!Object.hasOwn(sources, source)) throw new Error('invalid_conversion_source')
  return sources[source]
}
// Keep log JSON values as json throughout: no jsonb cast, JS serialization or numeric coercion.
function rowHash(source, expression) {
  if (source === 'tax') return `md5(${expression ? `(to_jsonb(r) || jsonb_build_object('data', ${expression}))` : 'to_jsonb(r)'}::text)`
  return `md5((SELECT json_object_agg(v.key, ${expression ? `CASE WHEN v.key='changes' THEN ${expression} ELSE v.value END` : 'v.value'}
    ORDER BY v.ordinal)::text FROM json_each(row_to_json(r)) WITH ORDINALITY v(key,value,ordinal)))`
}
function metadataHash(source) {
  return source === 'tax' ? "md5((to_jsonb(r)-'data')::text)"
    : "md5((SELECT json_object_agg(v.key,v.value ORDER BY v.ordinal)::text FROM json_each(row_to_json(r)) WITH ORDINALITY v(key,value,ordinal) WHERE v.key<>'changes'))"
}
const logObject = "CASE WHEN json_typeof(r.changes)='object' THEN r.changes ELSE '{}'::json END"
const amountObject = "CASE WHEN json_typeof(r.changes->'amount')='object' THEN r.changes->'amount' ELSE '{}'::json END"
export const SCAN_SQL = Object.fromEntries(Object.entries(sources).map(([source, s]) => [source, `SELECT r.id,
  r.${s.owner} AS budget_id, ${source === 'tax' ? 'r.year' : 'r.transaction_id'}, r.xmin::text AS row_version,
  ${rowHash(source)} AS row_hash, ${metadataHash(source)} AS metadata_hash, r.${s.column}::text AS payload_text,
  ${s.type}_build_object(${s.fields.map(field => `'${field}',(r.${s.column} #> '{${field.replaceAll('.', ',')}}')::text`).join(',')})::text AS tokens,
  EXISTS (SELECT 1 FROM public.applications b WHERE b.id=r.${s.owner})
    ${source === 'log' ? 'AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.id=r.transaction_id AND t.application_id=r.application_id)' : ''} AS ownership_valid,
  ${source === 'tax' ? 'true' : `(SELECT count(*)=count(DISTINCT e.key) FROM json_each(${logObject}) e WHERE e.key='amount')
    AND (SELECT count(*)=count(DISTINCT e.key) FROM json_each(${amountObject}) e WHERE e.key IN ('old','new'))`} AS unique_paths
  FROM public.${s.table} r WHERE r.id>$1 ORDER BY r.id LIMIT $2`]))
export const SCHEMA_SQL = `SELECT c.relname AS name, a.atttypid=CASE WHEN c.relname='taxes' THEN 'jsonb'::regtype ELSE 'json'::regtype END AS correct_type,
  c.relkind='r' AS ordinary, c.relrowsecurity AS rls, c.relhasrules AS rules,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS triggers
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND ((c.relname='taxes' AND a.attname='data') OR (c.relname='transaction_logs' AND a.attname='changes')) AND NOT a.attisdropped`
export const LOCK_SQL = `SELECT b.id FROM public.applications b WHERE
  EXISTS (SELECT 1 FROM public.taxes t WHERE t.budget_id=b.id) OR
  EXISTS (SELECT 1 FROM public.transaction_logs l WHERE l.application_id=b.id) ORDER BY b.id FOR UPDATE OF b`

export function classify(source, row) {
  const s = sourceFor(source)
  const result = { numericAmounts: 0, canonicalStrings: 0, malformedAmounts: 0, roundedAmounts: 0,
    mixed: 0, missingFields: 0, nullFields: 0, sqlNullData: 0, jsonNullData: 0, errors: [], patches: [], changes: [] }
  if (row.payload_text === null) return { ...result, sqlNullData: 1 }
  let data, tokens
  try { data = JSON.parse(row.payload_text); tokens = JSON.parse(row.tokens) }
  catch { return { ...result, errors: [{ reason: 'invalid_payload_or_tokens' }] } }
  if (data === null) return { ...result, jsonNullData: 1 }
  if (typeof data !== 'object' || Array.isArray(data)) return { ...result, errors: [{ reason: 'unsupported_payload_shape' }] }
  if (source === 'log' && row.unique_paths !== true) result.errors.push({ reason: 'duplicate_target_keys_require_review' })
  const parent = source === 'tax' ? 'estimated' : 'amount'
  if (Object.hasOwn(data, parent) && data[parent] !== null && (typeof data[parent] !== 'object' || Array.isArray(data[parent]))) {
    result.errors.push({ reason: 'unsupported_parent_shape', field: parent })
  }
  for (const field of s.fields) {
    const path = field.split('.'), container = path.length === 1 ? data : data[path[0]], key = path.at(-1)
    if (container === null) { result.nullFields++; continue }
    if (!container || typeof container !== 'object' || !Object.hasOwn(container, key)) { result.missingFields++; continue }
    const value = container[key]
    if (value === null) { result.nullFields++; continue }
    try {
      const amount = convertedAmount(value)
      if (amount.numeric) {
        result.numericAmounts++
        if (typeof tokens?.[field] !== 'string' || Number(tokens[field]) !== value) throw new Error('amount_token_mismatch')
        const precision = inspectAmount(value, tokens[field])
        const changed = precision.changed ?? amount.rounded
        if (changed) result.roundedAmounts++
        result.patches.push({ field, stored: amount.stored })
        result.changes.push({ field, originalToken: tokens[field], proposedAmount: amount.stored,
          changed, differenceCents: precision.differenceCents ?? null })
      } else result.canonicalStrings++
    } catch (error) { result.malformedAmounts++; result.errors.push({ field, reason: error.message }) }
  }
  if (result.patches.length && (!Number.isSafeInteger(row.id) || row.id < 1 || !Number.isSafeInteger(row.budget_id)
    || row.budget_id < 1 || row.ownership_valid !== true
    || (source === 'log' && (!Number.isSafeInteger(row.transaction_id) || row.transaction_id < 1)))) {
    result.errors.push({ reason: 'record_ownership_unavailable' })
  }
  result.mixed = Number(result.numericAmounts > 0 && result.canonicalStrings > 0)
  return result
}
export function leafExpression(source, patches) {
  const s = sourceFor(source), parameters = [], seen = new Set()
  if (!patches.length || patches.length > s.fields.length) throw new Error('invalid_patch')
  let expression = 'r.data'
  for (const { field, stored } of patches) {
    if (!s.fields.includes(field) || seen.has(field) || typeof stored !== 'string') throw new Error('invalid_patch')
    convertedAmount(stored); seen.add(field)
    if (source === 'tax') {
      expression = `jsonb_set(${expression}, $${parameters.length + 1}::text[], to_jsonb($${parameters.length + 2}::text), false)`
      parameters.push(field.split('.'), stored)
    } else parameters.push(field.split('.')[1], stored)
  }
  if (source === 'log') {
    const cases = patches.map((_, index) => `WHEN a.key=$${index * 2 + 1}::text THEN to_json($${index * 2 + 2}::text)`).join(' ')
    expression = `(SELECT json_object_agg(o.key, CASE WHEN o.key='amount' THEN
      (SELECT json_object_agg(a.key, CASE ${cases} ELSE a.value END ORDER BY a.ordinal)
       FROM json_each(o.value) WITH ORDINALITY a(key,value,ordinal)) ELSE o.value END ORDER BY o.ordinal)
      FROM json_each(r.changes) WITH ORDINALITY o(key,value,ordinal))`
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
  const input = createReadStream(file, { encoding: 'utf8' }), lines = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of lines) yield JSON.parse(line) } finally { lines.close(); input.destroy() }
}
async function admission(client, context) {
  await verifyDatabase(client, context.config, context.target)
  const { rows } = await client.query(SCHEMA_SQL)
  if (rows.length !== 2 || new Set(rows.map(r => r.name)).size !== 2 || rows.some(r => !['taxes', 'transaction_logs'].includes(r.name)
    || !r.correct_type || !r.ordinary || r.rls || r.rules || r.triggers)) throw new Error('unsupported_tax_monetary_schema')
  const { rows: [mode] } = await client.query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation")
  if (mode.read_only !== (context.readOnly ? 'on' : 'off') || mode.isolation !== 'repeatable read') throw new Error('transaction_mode_mismatch')
}
function ownershipWhere(source, start) {
  const s = sourceFor(source)
  return `r.id=$${start} AND r.${s.owner}=$${start + 1}${source === 'log' ? ` AND r.transaction_id=$${start + 2}
    AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.id=r.transaction_id AND t.application_id=r.application_id)` : ''}`
}
function ownershipParameters(entry) { return entry.source === 'log' ? [entry.id, entry.budget, entry.transactionId] : [entry.id, entry.budget] }
function validateEntry(entry) {
  sourceFor(entry.source)
  if (![entry.id, entry.budget, ...(entry.source === 'log' ? [entry.transactionId] : [])].every(id => Number.isSafeInteger(id) && id > 0)
    || typeof entry.original !== 'string' || typeof entry.converted !== 'string'
    || ![entry.originalHash, entry.convertedHash, entry.metadataHash].every(value => /^[a-f0-9]{32}$/.test(value ?? ''))
    || !/^\d+$/.test(entry.originalVersion ?? '')) throw new Error('invalid_snapshot_record')
}
async function verifyRow(client, entry, xid, original = false) {
  validateEntry(entry)
  const s = sourceFor(entry.source)
  const { rows: [row] } = await client.query(`SELECT r.${s.column}::text AS payload, ${rowHash(entry.source)} AS row_hash,
    r.xmin::text AS version FROM public.${s.table} r WHERE ${ownershipWhere(entry.source, 1)}`, ownershipParameters(entry))
  if (!row || row.payload !== (original ? entry.original : entry.converted)
    || row.row_hash !== (original ? entry.originalHash : entry.convertedHash)
    || (!original && row.version !== xid)) throw new Error('changed_row_recovery_refused')
}
export async function runConversion(client, context) {
  const summary = { records: 0, taxRecords: 0, logRecords: 0, candidates: 0, taxCandidates: 0, logCandidates: 0,
    numericAmounts: 0, canonicalStrings: 0, malformedAmounts: 0, roundedAmounts: 0, mixed: 0,
    missingFields: 0, nullFields: 0, sqlNullData: 0, jsonNullData: 0, blockingRecords: 0 }
  const dataPath = join(context.output, 'original-tax-monetary.jsonl')
  const details = await open(join(context.output, 'records.jsonl'), 'wx', 0o600)
  const snapshot = context.readOnly ? null : await open(dataPath, 'wx', 0o600)
  try {
    return await atomic(client, context.readOnly, async () => {
      await admission(client, context)
      let xid
      if (!context.readOnly) { await context.guard(); await client.query(LOCK_SQL); xid = (BigInt((await client.query('SELECT pg_current_xact_id()::text AS xid')).rows[0].xid) % 4294967296n).toString() }
      for (const source of Object.keys(sources)) {
        const s = sourceFor(source)
        let after = '0'
        for (;;) {
          const { rows } = await client.query(SCAN_SQL[source], [after, 100])
          if (!rows.length) break
          for (const row of rows) {
            summary.records++; summary[source === 'tax' ? 'taxRecords' : 'logRecords']++
            const result = classify(source, row)
            for (const key of Object.keys(summary).filter(key => key in result)) summary[key] += result[key]
            if (result.errors.length) summary.blockingRecords++
            await details.write(JSON.stringify({ source, id: row.id, budget: row.budget_id, year: row.year,
              transactionId: row.transaction_id, original: row.payload_text, ...result }) + '\n')
            if (!result.patches.length || result.errors.length) continue
            summary.candidates++; summary[source === 'tax' ? 'taxCandidates' : 'logCandidates']++
            if (context.readOnly) continue
            const { expression, parameters } = leafExpression(source, result.patches)
            const { rows: [proposed] } = await client.query(`SELECT (${expression})::text AS payload,
              ${rowHash(source, expression)} AS row_hash FROM public.${s.table} r WHERE r.id=$${parameters.length + 1}`, [...parameters, row.id])
            if (!proposed) throw new Error('candidate_disappeared')
            await snapshot.write(JSON.stringify({ source, id: row.id, budget: row.budget_id, transactionId: row.transaction_id,
              original: row.payload_text, converted: proposed.payload, originalHash: row.row_hash, convertedHash: proposed.row_hash,
              metadataHash: row.metadata_hash, originalVersion: row.row_version, patches: result.patches }) + '\n')
          }
          const next = String(rows.at(-1).id)
          if (BigInt(next) <= BigInt(after)) throw new Error('invalid_page_progress')
          after = next
        }
      }
      await details.sync(); await save(join(context.output, 'preflight.json'), summary)
      if (summary.blockingRecords) throw new Error('preconditions_failed_inspect_records_jsonl')
      if (!context.readOnly) {
        await snapshot.sync()
        const manifest = { format: 1, operation: 'historical-tax-monetary-conversion', target: context.target,
          xid, candidates: summary.candidates, dataSha256: await hashFile(dataPath), created: new Date().toISOString() }
        const manifestPath = join(context.output, 'snapshot.json')
        await save(manifestPath, manifest)
        const directory = await open(context.output, 'r'); try { await directory.sync() } finally { await directory.close() }
        context.snapshotHash = await hashFile(manifestPath)
        await context.onSnapshot?.({ snapshot: manifestPath, sha256: context.snapshotHash })
        let changed = 0
        for await (const entry of records(dataPath)) {
          validateEntry(entry); await context.guard()
          const s = sourceFor(entry.source), { expression, parameters } = leafExpression(entry.source, entry.patches)
          const ownership = ownershipParameters(entry), n = parameters.length + ownership.length
          const { rows } = await client.query(`UPDATE public.${s.table} r SET ${s.column}=${expression}
            WHERE ${ownershipWhere(entry.source, parameters.length + 1)} AND r.xmin::text=$${n + 1} AND ${rowHash(entry.source)}=$${n + 2}
            RETURNING r.${s.column}::text AS payload, ${rowHash(entry.source)} AS row_hash, ${metadataHash(entry.source)} AS metadata_hash, r.xmin::text AS version`,
          [...parameters, ...ownership, entry.originalVersion, entry.originalHash])
          if (rows.length !== 1 || rows[0].payload !== entry.converted || rows[0].row_hash !== entry.convertedHash
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
  const manifest = JSON.parse(await readFile(snapshotPath, 'utf8')), dataPath = join(resolve(snapshotPath, '..'), 'original-tax-monetary.jsonl')
  if (manifest.operation !== 'historical-tax-monetary-conversion' || manifest.format !== 1 || !isDeepStrictEqual(manifest.target, context.target)
    || !/^\d+$/.test(manifest.xid ?? '') || !Number.isSafeInteger(manifest.candidates) || manifest.candidates < 0
    || await hashFile(dataPath) !== manifest.dataSha256) throw new Error('snapshot_target_mismatch')
  return atomic(client, context.readOnly, async () => {
    await admission(client, context)
    if (!context.readOnly) {
      await context.guard()
      const budgets = new Set()
      for await (const entry of records(dataPath)) { validateEntry(entry); budgets.add(entry.budget) }
      const { rows } = await client.query('SELECT id FROM public.applications WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE', [[...budgets].sort((a, b) => a - b)])
      if (rows.length !== budgets.size) throw new Error('snapshot_budget_missing')
    }
    let examined = 0
    const identities = new Set()
    for await (const entry of records(dataPath)) {
      const identity = `${entry.source}:${entry.id}`
      if (identities.has(identity)) throw new Error('duplicate_snapshot_record')
      identities.add(identity)
      await verifyRow(client, entry, manifest.xid)
      if (!context.readOnly) {
        await context.guard()
        const s = sourceFor(entry.source), ownership = ownershipParameters(entry), n = ownership.length + 1
        const { rows } = await client.query(`UPDATE public.${s.table} r SET ${s.column}=$1::${s.type}
          WHERE ${ownershipWhere(entry.source, 2)} AND r.xmin::text=$${n + 1} AND ${rowHash(entry.source)}=$${n + 2} RETURNING r.id`,
        [entry.original, ...ownership, manifest.xid, entry.convertedHash])
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
  const output = await mkdtemp(join(parent, 'tax-monetary-conversion-'))
  console.log(output)
  let client, context
  let phase = 'configuration'
  try {
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_historical_tax_monetary_conversion',
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
