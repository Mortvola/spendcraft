// Operator tooling only. Importing this module never connects to a database.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, open, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { setTimeout, clearTimeout } from 'node:timers'
import { configuration as legacyConfiguration, VERIFY_SQL, MODE_SQL } from './auditLegacyMoney.mjs'

// Connection fields come exclusively from the selected file, never ambient PG* values.
export async function configuration(envFile = '.env', options = {}, expectedDatabase) {
  const fields = parseEnv(await readFile(envFile, 'utf8'))
  for (const key of ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DB_NAME']) {
    if (typeof fields[key] !== 'string' || (key !== 'PG_PASSWORD' && !fields[key].trim())) {
      throw new Error('invalid_env_connection')
    }
  }
  if (!/^\d+$/.test(fields.PG_PORT) || Number(fields.PG_PORT) < 1 || Number(fields.PG_PORT) > 65535 ||
      fields.PG_HOST.includes('\0') || fields.PG_USER.includes('\0') || fields.PG_DB_NAME.includes('\0')) {
    throw new Error('invalid_env_connection')
  }
  if (expectedDatabase !== undefined && expectedDatabase !== fields.PG_DB_NAME) {
    throw new Error('env_database_mismatch')
  }
  // Reuse only validated audit limits/output defaults; legacy connection values cannot override the file.
  const limits = legacyConfiguration({ ...options, SPENDCRAFT_AUDIT_DATABASE: 'audit',
    SPENDCRAFT_AUDIT_SOCKET_DIR: '/tmp', SPENDCRAFT_AUDIT_PORT: '5432' })
  return { ...limits, outputDir: options.SPENDCRAFT_AUDIT_OUTPUT_DIR, host: fields.PG_HOST, port: Number(fields.PG_PORT),
    serverPort: Number(fields.PG_PORT), database: fields.PG_DB_NAME, expected: fields.PG_DB_NAME,
    user: fields.PG_USER, password: fields.PG_PASSWORD }
}

export async function createOutputDirectory(outputDir) {
  if (outputDir !== undefined) {
    const directory = resolve(outputDir)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    return directory
  }
  return mkdtemp(join(process.cwd(), 'category-cent-audit-'))
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const maxCents = BigInt(Number.MAX_SAFE_INTEGER)

export function checkedAdd(a, b) {
  const sum = a + b
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(sum)) {
    throw new Error('unsafe_cent_accumulation')
  }
  return Object.is(sum, -0) ? 0 : sum
}

// Scale-two relational decimal text is compared exactly, without binary parsing.
export function decimalTextCents(text) {
  if (typeof text !== 'string' || text.length > 64 || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('invalid_scale_two_decimal')
  }
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.')
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n)
  if (cents > maxCents || cents < -maxCents) throw new Error('unsafe_expected_cents')
  return Number(cents)
}

export function roundAmount(original) {
  if (typeof original !== 'number' && (typeof original !== 'string' || !decimal.test(original))) {
    throw new Error('invalid_amount_type_or_syntax')
  }
  const amount = typeof original === 'number' ? original : Number(original)
  if (!Number.isFinite(amount)) throw new Error('nonfinite_amount')
  const rounded = Math.round(amount * 100)
  if (!Number.isSafeInteger(rounded)) throw new Error('unsafe_amount_cents')
  const cents = Object.is(rounded, -0) ? 0 : rounded
  const amountString = (Math.round(amount * 100) / 100).toFixed(2)
  let encodingMatchesCents = false
  try { encodingMatchesCents = decimalTextCents(amountString) === cents } catch { /* Flag the encoding, never substitute a value. */ }
  return { original, cents, amountString, changed: amount !== cents / 100,
    negativeZero: Object.is(rounded, -0), encodingMatchesCents }
}

function object(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }

// Input is a single transaction and *all* its links, not Lucid's hasOne relation.
// No posting-eligibility filtering, implicit Unassigned fill or repair is performed.
export function auditTransaction(row) {
  const result = { transactionId: row.id, transactionType: row.type, status: 'unsupported',
    reason: '', originalCategoryAmounts: [], roundedCategoryAmounts: [], categoryCents: [],
    categorySumCents: null, expectedCents: null, differenceCents: null, amountsChanged: false,
    deleted: row.deleted, pending: (Array.isArray(row.links) ? row.links : []).map((link) => object(link) ? link.pending : null) }
  if (row.deprecated) return { ...result, status: 'deprecated', reason: 'deprecated_feature' }
  if (![0, 5, 2, 3, 4].includes(row.type)) return { ...result, reason: 'outside_supported_lifecycles' }
  if (!Array.isArray(row.categories)) return { ...result, status: 'malformed', reason: 'categories_not_array' }
  result.originalCategoryAmounts = row.categories.map((split, index) => ({ index,
    categoryId: object(split) ? split.categoryId : null,
    present: object(split) && Object.hasOwn(split, 'amount'),
    value: object(split) && Object.hasOwn(split, 'amount') ? split.amount : null,
    ...(row.amountTokens ? { storedToken: row.amountTokens[index] } : {}) }))
  try {
    let encodingMismatch = false
    for (const split of row.categories) {
      if (!object(split) || !Number.isSafeInteger(split.categoryId) || split.categoryId <= 0) {
        throw new Error('invalid_allocation_shape_or_category_id')
      }
      const rounded = roundAmount(split.amount)
      result.categoryCents.push(rounded.cents)
      result.roundedCategoryAmounts.push(rounded.amountString)
      result.amountsChanged ||= rounded.changed
      encodingMismatch ||= !rounded.encodingMatchesCents
    }
    result.categorySumCents = result.categoryCents.reduce(checkedAdd, 0)
    if (encodingMismatch) return { ...result, reason: 'formatted_dollars_do_not_encode_rounded_cents' }
    if (!Array.isArray(row.links)) return { ...result, reason: 'missing_link_evidence' }
    if ([0, 4, 5].includes(row.type)) {
      if (row.links.length !== 1) return { ...result, reason: 'ordinary_link_count_not_one' }
      const link = row.links[0]
      if (!object(link) || link.scoped !== true || !['Transactions', 'Uncategorized Transactions'].includes(link.tracking)) {
        return { ...result, reason: 'ordinary_account_scope_or_tracking_unsupported' }
      }
      result.expectedCents = typeof link.amount === 'string' ? decimalTextCents(link.amount) : roundAmount(link.amount).cents
    } else {
      if (row.links.length !== 0) return { ...result, reason: 'funding_or_rebalance_has_account_links' }
      if (row.categories.length === 0) return { ...result, reason: 'empty_funding_or_rebalance_not_supported_by_endpoint' }
      result.expectedCents = 0
      if (row.type === 2) {
        if (!Array.isArray(row.poolIds) || row.poolIds.length !== 1) return { ...result, reason: 'owning_budget_pool_not_unique' }
        const poolId = row.poolIds[0]
        let pool = 0, nonPool = 0, found = false
        row.categories.forEach((split, index) => {
          if (split.categoryId === poolId) { pool = checkedAdd(pool, result.categoryCents[index]); found = true }
          else nonPool = checkedAdd(nonPool, result.categoryCents[index])
        })
        if (!found) return { ...result, reason: 'missing_pool_allocation' }
        result.poolAllocationCents = pool
        result.nonPoolSumCents = nonPool
        result.expectedCents = -pool
        result.differenceCents = checkedAdd(nonPool, pool)
      }
    }
    if (result.differenceCents === null) result.differenceCents = checkedAdd(result.categorySumCents, -result.expectedCents)
    if (row.type === 3) result.signedRemainderCents = result.differenceCents
    result.status = result.differenceCents === 0 ? 'pass' : 'fail'
    result.reason = result.status === 'pass' ? 'conserved' : 'rounded_cent_conservation_mismatch'
  } catch (error) { result.status = 'malformed'; result.reason = error.message }
  return result
}

export function newSummary() {
  return { total: 0, ordinary: 0, opening: 0, funding: 0, rebalance: 0, pass: 0, fail: 0,
    malformed: 0, unsupported: 0, deprecated: 0, amountsChanged: 0, byType: {} }
}
export function countResult(summary, result) {
  summary.total++
  summary[result.status]++
  if (result.amountsChanged) summary.amountsChanged++
  if (result.status !== 'deprecated') {
    if ([0, 5].includes(result.transactionType)) summary.ordinary++
    if (result.transactionType === 4) summary.opening++
    if (result.transactionType === 2) summary.funding++
    if (result.transactionType === 3) summary.rebalance++
  }
  const key = String(result.transactionType)
  const counts = summary.byType[key] ??= { total: 0, pass: 0, fail: 0, malformed: 0, unsupported: 0, deprecated: 0, amountsChanged: 0 }
  counts.total++; counts[result.status]++
  if (result.amountsChanged) counts.amountsChanged++
}

// Keyset paging limits driver materialization. Per-transaction subqueries preserve
// link/allocation cardinality, and neither balance columns nor legacy storage is read.
export const PAGE_SQL = `SELECT t.id, t.type, t.deleted, t.categories::text AS categories_text,
  COALESCE((SELECT jsonb_agg((entry.value->'amount')::text ORDER BY entry.ordinality)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END)
      WITH ORDINALITY entry(value,ordinality)), '[]'::jsonb)::text AS amount_tokens,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('amount', at.amount::text, 'pending', at.pending,
    'tracking', a.tracking, 'scoped', i.application_id=t.application_id) ORDER BY at.id)
    FROM public.account_transactions at LEFT JOIN public.accounts a ON a.id=at.account_id
    LEFT JOIN public.institutions i ON i.id=a.institution_id WHERE at.transaction_id=t.id), '[]'::jsonb)::text AS links_text,
  COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM public.categories c
    JOIN public.groups g ON g.id=c.group_id WHERE g.application_id=t.application_id AND c.type='FUNDING POOL'), '[]'::jsonb)::text AS pool_ids,
  (EXISTS (SELECT 1 FROM public.account_transactions at JOIN public.accounts a ON a.id=at.account_id
      WHERE at.transaction_id=t.id AND a.type='loan')
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END) e
      JOIN public.categories c ON e->>'categoryId'=c.id::text WHERE c.type='LOAN')) AS deprecated
FROM public.transactions t WHERE t.id > $1 ORDER BY t.id LIMIT $2`

const ownFailures = new Set(['target_or_readonly_verification_failed', 'transaction_mode_failed',
  'audit_timeout', 'invalid_page_progress', 'invalid_env_connection', 'env_database_mismatch'])
const systemFailures = new Set(['EEXIST', 'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'ECONNREFUSED',
  'ECONNRESET', 'ETIMEDOUT', 'ERR_MODULE_NOT_FOUND'])
// Installed pg throws some connection/authentication Errors without a code.
// Match known messages internally; only these fixed labels leave the process.
const driverFailures = new Map([
  ['SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string', 'SASL_PASSWORD_MISSING'],
  ['SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string', 'SASL_PASSWORD_INVALID_TYPE'],
  ['timeout expired', 'CONNECT_TIMEOUT'],
  ['Connection terminated', 'CONNECTION_TERMINATED'],
  ['Connection terminated unexpectedly', 'CONNECTION_TERMINATED'],
])

export function failureInfo(error, phase, examined = 0) {
  const code = typeof error?.code === 'string' && (/^[0-9A-Z]{5}$/.test(error.code) || systemFailures.has(error.code))
    ? error.code : ownFailures.has(error?.message) ? error.message
      : driverFailures.get(error?.message) ?? (typeof error?.message === 'string' && error.message.startsWith('SASL: ')
        ? 'SASL_PROTOCOL_ERROR' : 'unclassified_error')
  const info = { phase, code, examined }
  if (typeof error?.position === 'string' && /^\d{1,8}$/.test(error.position)) info.sqlPosition = error.position
  return info
}

class AuditRunError extends Error {
  constructor(info) { super('Audit incomplete'); this.auditFailure = info }
}

export async function runAudit(config, createClient, emit) {
  const client = createClient({ host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password, ssl: false, connectionTimeoutMillis: 10_000,
    application_name: 'spendcraft_category_cent_audit',
    options: `-c default_transaction_read_only=on -c statement_timeout=${config.statementMs} -c lock_timeout=${config.lockMs} -c idle_in_transaction_session_timeout=30000 -c search_path=pg_catalog,public` })
  const summary = newSummary()
  let transaction = false, expired = false, report, failure
  let phase = 'connect'
  const interrupt = () => { expired = true; void client.end().catch(() => undefined) }
  const timer = setTimeout(interrupt, config.totalMs)
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  client.on('error', () => undefined)
  try {
    await client.connect()
    phase = 'verify_target'
    const { rows: [live] } = await client.query(VERIFY_SQL)
    if (live?.database !== config.expected || live?.port !== config.serverPort || live?.default_read_only !== 'on') {
      throw new Error('target_or_readonly_verification_failed')
    }
    phase = 'begin_readonly_snapshot'
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true
    phase = 'verify_transaction_mode'
    const { rows: [mode] } = await client.query(MODE_SQL)
    if (mode?.read_only !== 'on' || mode?.isolation !== 'repeatable read') throw new Error('transaction_mode_failed')
    let after = '0'
    while (true) {
      if (expired) throw new Error('audit_timeout')
      phase = 'page_query'
      const { rows } = await client.query(PAGE_SQL, [after, config.batchSize ?? 100])
      if (!rows.length) break
      for (const row of rows) {
        if (expired) throw new Error('audit_timeout')
        phase = 'classify_transaction'
        const finding = auditTransaction({ ...row, categories: JSON.parse(row.categories_text),
          amountTokens: JSON.parse(row.amount_tokens), links: JSON.parse(row.links_text), poolIds: JSON.parse(row.pool_ids) })
        countResult(summary, finding)
        // Stream all rows: passing but changed values are reviewable too.
        phase = 'write_details'
        await emit(finding)
      }
      const next = String(rows.at(-1).id)
      if (BigInt(next) <= BigInt(after)) throw new Error('invalid_page_progress')
      after = next
    }
    phase = 'commit_readonly_snapshot'
    await client.query('COMMIT'); transaction = false
    report = { status: 'complete', target: { database: live.database, port: live.port, transport: config.host.startsWith('/') ? 'local_unix_socket' : 'tcp' }, summary }
  } catch (error) {
    failure = failureInfo(expired ? new Error('audit_timeout') : error, phase, summary.total)
  } finally {
    clearTimeout(timer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt)
    for (const [cleanupPhase, cleanup] of [
      ['rollback', async () => { if (transaction && !expired) await client.query('ROLLBACK') }],
      ['close_connection', () => client.end()],
    ]) {
      try { await cleanup() } catch (error) {
        const info = failureInfo(error, cleanupPhase, summary.total)
        if (!failure) failure = info
        else (failure.cleanupFailures ??= []).push(info)
      }
    }
  }
  if (failure) throw new AuditRunError(failure)
  return report
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--print-sql') { console.log(PAGE_SQL); return }
  let envFile = '.env', expectedDatabase, execute = false, valid = true
  const seen = new Set()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (seen.has(arg)) { valid = false; break }
    seen.add(arg)
    if (arg === '--execute') execute = true
    else if (['--env-file', '--database'].includes(arg) && args[index + 1] && !args[index + 1].startsWith('--')) {
      const value = args[++index]
      if (arg === '--env-file') envFile = value
      else expectedDatabase = value
    } else { valid = false; break }
  }
  if (!valid || !execute) {
    console.error('After authorization only: --execute [--env-file PATH] [--database NAME] (or offline --print-sql)')
    process.exitCode = 2; return
  }
  let details, summaryFile
  let phase = 'configuration'
  try {
    const config = await configuration(envFile, process.env, expectedDatabase)
    phase = 'create_output_directory'
    config.outputDir = await createOutputDirectory(config.outputDir)
    console.log(`Audit output directory: ${config.outputDir}`)
    phase = 'create_details_file'
    details = await open(join(config.outputDir, 'transactions.jsonl'), 'wx', 0o600)
    phase = 'create_summary_file'
    summaryFile = await open(join(config.outputDir, 'summary.json'), 'wx', 0o600)
    phase = 'load_database_driver'
    const { Client } = await import('pg')
    phase = 'run_audit'
    const report = await runAudit(config, (options) => new Client(options), async (finding) => {
      await details.writeFile(`${JSON.stringify(finding)}\n`)
    })
    phase = 'write_summary'
    await summaryFile.writeFile(`${JSON.stringify(report, null, 2)}\n`)
    const s = report.summary
    console.log(`COMPLETE: ${s.total} transactions; ordinary ${s.ordinary}, opening ${s.opening}, funding ${s.funding}, rebalance ${s.rebalance}.`)
    console.log(`Pass ${s.pass}; fail ${s.fail}; malformed ${s.malformed}; unsupported ${s.unsupported}; deprecated ${s.deprecated}; rounded changes ${s.amountsChanged}.`)
    console.log(`Details and summary: ${config.outputDir}`)
    if (s.fail || s.malformed || s.unsupported) process.exitCode = 1
  } catch (error) {
    // Never expose driver messages, credentials, SQL payloads or personal data.
    const failure = error instanceof AuditRunError ? error.auditFailure : failureInfo(error, phase)
    if (summaryFile) {
      try { await summaryFile.writeFile(`${JSON.stringify({ status: 'incomplete', failure })}\n`) }
      catch (writeError) { failure.outputFailure = failureInfo(writeError, 'write_incomplete_summary') }
    }
    console.error('INCOMPLETE: audit did not finish. Do not use partial counts for migration approval.')
    console.error(`Diagnostic: ${JSON.stringify(failure)}`)
    if (failure.code === 'EEXIST') console.error('Choose a fresh output directory; existing audit files are never overwritten.')
    if (failure.code === 'SASL_PASSWORD_MISSING') {
      console.error('The server requires a password. Set PG_PASSWORD in the selected .env file.')
    }
    process.exitCode = 3
  } finally { await details?.close(); await summaryFile?.close() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
