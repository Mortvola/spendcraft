// Offline funding JSON conversion. Importing never connects or boots the app.
import process from 'node:process'
import console from 'node:console'
import { isDeepStrictEqual } from 'node:util'
import { mkdtemp, mkdir, open, readFile, lstat, realpath } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import { argumentsFor as baseArguments } from './convertHistoricalStatementIncome.mjs'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectRow, PAGE_SQL } from './auditFundingPrecision.mjs'
import { fundingStorageCompatibility } from '../installer/lib/taxReleaseRecovery.mjs'
import { convertedAmount, discoverTarget, verifyConnectionConfiguration, verifyDatabase, atomic } from './lib/historicalCategoryConversion.mjs'
import { createPm2Guard } from './lib/conversionPm2.mjs'
import { conversionDiagnostic } from './convertHistoricalTransactionCategories.mjs'

export function argumentsFor(args) {
  const rest = [], releases = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--release') releases.push(args[++i])
    else if (args[i].startsWith('--release=')) releases.push(args[i].slice(10))
    else rest.push(args[i])
  }
  if (releases.length > 1 || releases.some(value => !value || value.startsWith('--'))) throw new Error('invalid_release_argument')
  const options = baseArguments(rest)
  if (options.execute && !releases.length) throw new Error('compatible_release_required')
  return { ...options, release: releases[0] }
}
const sources = {
  category: { table: 'categories', column: 'funding_categories', type: 'jsonb' },
  transaction: { table: 'transactions', column: 'categories', type: 'jsonb' },
}
function sourceFor(source) {
  if (!Object.hasOwn(sources, source)) throw new Error('invalid_conversion_source')
  return sources[source]
}
const arraySql = value => `CASE WHEN jsonb_typeof(${value})='array' THEN ${value} ELSE '[]'::jsonb END`
const categoryBudget = '(SELECT g.application_id FROM public.groups g WHERE g.id=r.group_id)'
const budgetFor = source => source === 'category' ? categoryBudget : 'r.application_id'
const rulesOwned = (rules, budget) => `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${arraySql(rules)}) f
  LEFT JOIN public.categories c ON f->>'categoryId'=c.id::text
  LEFT JOIN public.groups g ON g.id=c.group_id WHERE g.application_id IS DISTINCT FROM ${budget})`
const referencesOwned = source => source === 'category' ? rulesOwned('r.funding_categories', categoryBudget)
  : `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${arraySql('r.categories')}) e
      LEFT JOIN public.categories c ON e->>'categoryId'=c.id::text
      LEFT JOIN public.groups g ON g.id=c.group_id
      WHERE g.application_id IS DISTINCT FROM r.application_id
      OR NOT (${rulesOwned("e->'fundingCategories'", 'r.application_id')}))`
const loanOwned = `EXISTS (SELECT 1 FROM public.account_transactions a JOIN public.accounts c ON c.id=a.account_id
  WHERE a.transaction_id=r.id AND c.type='loan')
  OR EXISTS (SELECT 1 FROM jsonb_array_elements(${arraySql('r.categories')}) e
    JOIN public.categories c ON e->>'categoryId'=c.id::text WHERE c.type='LOAN')`
// Match the existing transactionCategoryStorage binding: type 2/3 have no account
// links; type 0/4/5 have exactly one same-Budget, non-Loan account link.
const transactionActive = `r.type IN (0,2,3,4,5) AND NOT (${loanOwned}) AND
  CASE WHEN r.type IN (2,3) THEN NOT EXISTS (SELECT 1 FROM public.account_transactions a WHERE a.transaction_id=r.id)
  ELSE (SELECT count(*)=1 AND bool_and(i.application_id=r.application_id AND c.type<>'loan')
    FROM public.account_transactions a LEFT JOIN public.accounts c ON c.id=a.account_id
    LEFT JOIN public.institutions i ON i.id=c.institution_id WHERE a.transaction_id=r.id) END`
function rowHash(source, expression) {
  const s = sourceFor(source)
  return `md5(${expression ? `(to_jsonb(r) || jsonb_build_object('${s.column}', ${expression}))` : 'to_jsonb(r)'}::text)`
}
function metadataHash(source) { return `md5((to_jsonb(r)-'${sourceFor(source).column}')::text)` }
export const SCAN_SQL = Object.fromEntries(Object.entries(sources).map(([source, s]) => {
  // Reuse exact token extraction from the accepted audit, but scan excluded rows
  // too so exclusions and unsupported ownership are visible, never silent.
  const base = PAGE_SQL[source]
  const token = base.slice(base.indexOf('COALESCE('), base.indexOf(' AS amount_tokens'))
    .replaceAll(source === 'category' ? 'c.funding_categories' : 't.categories', 'r.' + s.column)
  return [source, `SELECT r.id, ${budgetFor(source)} AS budget_id, r.type,
    ${source === 'transaction' ? 'r.deleted' : 'false'} AS deleted,
    r.xmin::text AS row_version, ${rowHash(source)} AS row_hash, ${metadataHash(source)} AS metadata_hash,
    r.${s.column}::text AS payload_text, ${token} AS amount_tokens,
    (EXISTS (SELECT 1 FROM public.applications b WHERE b.id=${budgetFor(source)}) AND ${referencesOwned(source)}) AS ownership_valid,
    ${source === 'category' ? "(r.type='LOAN')" : `(${loanOwned})`} AS loan_excluded,
    ${source === 'category' ? "(r.type IS DISTINCT FROM 'LOAN')" : `(${transactionActive})`} AS active
    FROM public.${s.table} r WHERE r.id>$1 ORDER BY r.id LIMIT $2`]
}))
export const SCHEMA_SQL = `SELECT c.relname AS name, a.atttypid='jsonb'::regtype AS correct_type,
  c.relkind='r' AS ordinary, c.relrowsecurity AS rls, c.relhasrules AS rules,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS triggers
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND ((c.relname='categories' AND a.attname='funding_categories')
    OR (c.relname='transactions' AND a.attname='categories')) AND NOT a.attisdropped`
export const LOCK_SQL = `SELECT b.id FROM public.applications b WHERE
  EXISTS (SELECT 1 FROM public.categories c JOIN public.groups g ON g.id=c.group_id WHERE g.application_id=b.id)
  OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.application_id=b.id) ORDER BY b.id FOR UPDATE OF b`

export function classify(source, row) {
  sourceFor(source)
  const result = { numericAmounts: 0, canonicalStrings: 0, malformedAmounts: 0, roundedAmounts: 0,
    dollarRoundingChanges: 0, percentageRoundingChanges: 0, legacyModes: 0,
    mixed: 0, missingFields: 0, nullFields: 0, sqlNullData: 0, jsonNullData: 0,
    excludedRecords: 0, errors: [], patches: [], changes: [] }
  if (row.loan_excluded === true || (source === 'transaction' && row.type === 1)) {
    return { ...result, excludedRecords: 1, exclusion: row.loan_excluded ? 'Loan' : 'deprecated_lifecycle',
      errors: [] }
  }
  let inspected
  try { inspected = inspectRow(source, row) }
  catch (error) { return { ...result, errors: [{ reason: error.message }] } }
  result.errors.push(...inspected.finding.issues.map(reason => ({ reason })))
  if (source === 'transaction' && ![0, 2, 3, 4, 5].includes(row.type)) result.errors.push({ reason: 'unknown_transaction_type' })
  if (row.payload_text === null) result.sqlNullData++
  else if (inspected.payload === null) result.jsonNullData++
  for (const entry of inspected.finding.entries) {
    const { path, mode } = entry
    if (['legacy', 'ambiguous'].includes(mode)) result.legacyModes++
    if (entry.kind === 'missing') { result.missingFields++; continue }
    if (entry.kind === 'null') { result.nullFields++; continue }
    if (['legacy', 'ambiguous'].includes(mode)) {
      result.errors.push({ path, reason: 'mode_requires_review', mode })
    }
    try {
      let value = inspected.payload
      for (const key of path) value = value[key]
      const amount = convertedAmount(value)
      if (entry.status !== 'valid' || entry.sourceToNumberChanged) throw new Error(entry.reason ?? 'source_to_number_precision_loss')
      if (amount.numeric) {
        if (typeof row.amount_tokens !== 'string' || typeof entry.originalToken !== 'string') throw new Error('amount_tokens_required')
        result.numericAmounts++
        if (entry.changed) {
          result.roundedAmounts++
          result[mode === 'percentage' ? 'percentageRoundingChanges' : 'dollarRoundingChanges']++
        }
        result.patches.push({ path, stored: amount.stored })
        result.changes.push({ path, mode, unit: mode === 'percentage' ? 'percentage_points' : 'dollars',
          originalToken: entry.originalToken, proposedAmount: amount.stored,
          changed: entry.changed, difference: entry.differenceCents === undefined ? null : Number(entry.differenceCents) / 100,
          differenceScaled: entry.differenceCents })
      } else result.canonicalStrings++
    } catch (error) {
      result.malformedAmounts++; result.errors.push({ path, reason: error.message })
    }
  }
  if (result.patches.length && (!Number.isSafeInteger(row.id) || row.id < 1 || !Number.isSafeInteger(row.budget_id)
    || row.budget_id < 1 || row.ownership_valid !== true || row.active !== true)) {
    result.errors.push({ reason: 'record_ownership_or_lifecycle_unavailable' })
  }
  result.mixed = Number(result.numericAmounts > 0 && result.canonicalStrings > 0)
  if (result.patches.length > 1000) result.errors.push({ reason: 'leaf_count_requires_review' })
  return result
}
export function leafExpression(source, patches) {
  const s = sourceFor(source), parameters = [], seen = new Set()
  if (!patches.length || patches.length > 1000) throw new Error('invalid_patch')
  let expression = 'r.' + s.column
  for (const { path, stored } of patches) {
    const index = value => Number.isSafeInteger(value) && value >= 0
    const allowed = Array.isArray(path) && (source === 'category'
      ? path.length === 2 && index(path[0]) && path[1] === 'amount'
      : path.length === 2 && index(path[0]) && path[1] === 'baseAmount'
        || path.length === 4 && index(path[0]) && path[1] === 'fundingCategories' && index(path[2]) && path[3] === 'amount')
    const key = JSON.stringify(path)
    if (!allowed || seen.has(key) || typeof stored !== 'string') throw new Error('invalid_patch')
    convertedAmount(stored); seen.add(key)
    expression = `jsonb_set(${expression}, $${parameters.length + 1}::text[], to_jsonb($${parameters.length + 2}::text), false)`
    parameters.push(path.map(String), stored)
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
  if (rows.length !== 2 || new Set(rows.map(r => r.name)).size !== 2 || rows.some(r => !['categories', 'transactions'].includes(r.name)
    || !r.correct_type || !r.ordinary || r.rls || r.rules || r.triggers)) throw new Error('unsupported_funding_schema')
  const { rows: [mode] } = await client.query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation")
  if (mode.read_only !== (context.readOnly ? 'on' : 'off') || mode.isolation !== 'repeatable read') throw new Error('transaction_mode_mismatch')
}

function ownershipWhere(source, start) {
  return `r.id=$${start} AND ${budgetFor(source)}=$${start + 1}
    AND ${referencesOwned(source)}
    AND ${source === 'category' ? "(r.type IS DISTINCT FROM 'LOAN')" : `(${transactionActive})`}`
}
function ownershipParameters(entry) { return [entry.id, entry.budget] }
function validateEntry(entry) {
  sourceFor(entry.source)
  if (![entry.id, entry.budget].every(id => Number.isSafeInteger(id) && id > 0)
    || typeof entry.original !== 'string' || typeof entry.converted !== 'string'
    || ![entry.originalHash, entry.convertedHash, entry.metadataHash].every(value => /^[a-f0-9]{32}$/.test(value ?? ''))
    || !/^\d+$/.test(entry.originalVersion ?? '')) throw new Error('invalid_snapshot_record')
  leafExpression(entry.source, entry.patches)
}
// Reuse the existing capability recognizer on actual compiled funding files,
// including the Loan/ownership helper. No commit label can admit execution.
export async function verifyRelease(directory) {
  const root = await realpath(resolve(directory))
  if (root !== resolve(directory)) throw new Error('release_path_not_real_directory')
  const profile = JSON.parse(await readFile(new URL('../installer/tax-storage-profile.json', import.meta.url), 'utf8'))
  const files = []
  for (const name of Object.keys(profile.fundingFiles)) {
    const file = join(root, name)
    if (await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error('unsafe_compiled_funding_file')
    files.push({ name, kind: 'file', sha256: await hashFile(file) })
  }
  const manifest = { format: 1, files, identity: createHash('sha256').update(JSON.stringify(files)).digest('hex') }
  if (fundingStorageCompatibility(manifest) !== 'reviewed-funding-storage') throw new Error('funding_storage_compatibility_unknown')
  return manifest.identity
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
  const summary = { records: 0, categoryRecords: 0, transactionRecords: 0, candidates: 0, categoryCandidates: 0, transactionCandidates: 0,
    numericAmounts: 0, canonicalStrings: 0, malformedAmounts: 0, roundedAmounts: 0, mixed: 0,
    missingFields: 0, nullFields: 0, sqlNullData: 0, jsonNullData: 0, blockingRecords: 0,
    excludedRecords: 0, legacyModes: 0, dollarRoundingChanges: 0, percentageRoundingChanges: 0 }
  const dataPath = join(context.output, 'original-funding.jsonl')
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
            summary.records++; summary[source === 'category' ? 'categoryRecords' : 'transactionRecords']++
            const result = classify(source, row)
            for (const key of Object.keys(summary).filter(key => key in result)) summary[key] += result[key]
            if (result.errors.length) summary.blockingRecords++
            await details.write(JSON.stringify({ source, id: row.id, budget: row.budget_id, type: row.type, deleted: row.deleted, original: row.payload_text, ...result }) + '\n')
            if (!result.patches.length || result.errors.length) continue
            summary.candidates++; summary[source === 'category' ? 'categoryCandidates' : 'transactionCandidates']++
            if (context.readOnly) continue
            const { expression, parameters } = leafExpression(source, result.patches)
            const { rows: [proposed] } = await client.query(`SELECT (${expression})::text AS payload,
              ${rowHash(source, expression)} AS row_hash FROM public.${s.table} r WHERE r.id=$${parameters.length + 1}`, [...parameters, row.id])
            if (!proposed) throw new Error('candidate_disappeared')
            await snapshot.write(JSON.stringify({ source, id: row.id, budget: row.budget_id, type: row.type, deleted: row.deleted,
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
        const manifest = { format: 1, operation: 'historical-funding-conversion', target: context.target,
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
  const manifest = JSON.parse(await readFile(snapshotPath, 'utf8')), dataPath = join(resolve(snapshotPath, '..'), 'original-funding.jsonl')
  if (manifest.operation !== 'historical-funding-conversion' || manifest.format !== 1 || !isDeepStrictEqual(manifest.target, context.target)
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
  const output = await mkdtemp(join(parent, 'funding-conversion-'))
  console.log(output)
  let client, context
  let phase = 'configuration'
  try {
    if (options.release) await verifyRelease(options.release)
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_historical_funding_conversion',
      options: `-c default_transaction_read_only=${options.execute ? 'off' : 'on'} -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=600000 -c search_path=pg_catalog,public` })
    client.on('error', () => undefined)
    phase = 'connect'; await client.connect()
    phase = 'identity'; const target = await discoverTarget(client, config)
    const pm2Guard = options.execute ? await createPm2Guard(options) : undefined
    if (pm2Guard) await pm2Guard()
    await save(join(output, 'target.json'), target)
    context = { output, config, target, readOnly: !options.execute,
      guard: async () => { await verifyRelease(options.release); await pm2Guard(); await verifyDatabase(client, await configuration(options.env, {}, options.database), target) },
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
