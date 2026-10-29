// Read-only operator audit. Importing never connects or starts application code.
import process from 'node:process'
import console from 'node:console'
import { parseArgs } from 'node:util'
import { mkdtemp, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout, clearTimeout } from 'node:timers'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { discoverTarget, verifyDatabase, verifyConnectionConfiguration } from
  './lib/historicalCategoryConversion.mjs'

export const PAGE_SQL = `SELECT t.id, t.type, t.deleted, t.taxes::text AS taxes_text,
  COALESCE((SELECT jsonb_agg((e.value->'amount')::text ORDER BY e.ordinality)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.taxes)='array' THEN t.taxes ELSE \
'[]'::jsonb END)
      WITH ORDINALITY e(value,ordinality)), '[]'::jsonb)::text AS amount_tokens,
  (EXISTS (SELECT 1 FROM public.account_transactions at
      JOIN public.accounts a ON a.id=at.account_id WHERE at.transaction_id=t.id AND a.type='loan')
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'
       THEN t.categories ELSE '[]'::jsonb END) e
      JOIN public.categories c ON e->>'categoryId'=c.id::text WHERE c.type='LOAN')) AS deprecated
FROM public.transactions t WHERE t.id > $1 ORDER BY t.id LIMIT $2`

// Exact base-ten arithmetic for audit comparisons, not a production money policy.
function decimalParts(text) {
  if (typeof text !== 'string' || text.length > 4096
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) throw new Error(
      'invalid_decimal_syntax')
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e')
  const shift = Number(exponent)
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 1024) throw new Error(
    'unsupported_decimal_range')
  const negative = mantissa.startsWith('-')
  const [whole, fraction = ''] = mantissa.replace(/^[+-]/, '').split('.')
  let coefficient = BigInt((whole || '0') + fraction) * (negative ? -1n : 1n)
  let scale = fraction.length - shift
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0 }
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale-- }
  return { coefficient, scale, negativeZero: negative && coefficient === 0n }
}
function decimalString(coefficient, scale) {
  if (coefficient === 0n) return '0'
  const sign = coefficient < 0n ? '-' : ''
  const digits = (coefficient < 0n ? -coefficient : coefficient).toString().padStart(scale + 1, '0')
  return scale === 0 ? sign + digits : (sign + digits.slice(0, -scale) + '.' + digits.slice(-scale))
    .replace(/0+$/, '').replace(/\.$/, '')
}
function equalDecimal(a, b) {
  const scale = Math.max(a.scale, b.scale)
  return a.coefficient * 10n ** BigInt(scale - a.scale) === b.coefficient * 10n ** BigInt(scale - b
    .scale)
}

export function inspectAmount(value, storedToken) {
  const kind = value === null ? 'null' : typeof value
  const original = storedToken ?? (kind === 'number' && Object.is(value, -0) ? '-0' : JSON
    .stringify(value)) ?? null
  const result = { kind, originalToken: original, status: 'malformed' }
  if (!['number', 'string'].includes(kind)) return { ...result, reason:
    'unsupported_or_missing_amount' }
  try {
    if (kind === 'number' && !Number.isFinite(value)) throw new Error('nonfinite_amount')
    const text = kind === 'number' ? storedToken ?? String(value) : value
    const source = decimalParts(text)
    const centsNumerator = source.coefficient * 100n
    const denominator = 10n ** BigInt(source.scale)
    const fractionalCents = centsNumerator % denominator !== 0n
    const absoluteRemainder = (centsNumerator % denominator < 0n ? -(
      centsNumerator % denominator) : centsNumerator % denominator)
    const sourceHalfTie = absoluteRemainder * 2n === denominator
    const max = BigInt(Number.MAX_SAFE_INTEGER)
    if (centsNumerator > max * denominator || centsNumerator < -max * denominator) throw new Error(
      'unsafe_amount_cents')
    const common = { ...result, status: 'valid', fractionalCents, sourceHalfTie,
      negative: source.coefficient < 0n, originalNegativeZero: Object.is(value, -0) || source
        .negativeZero }
    if (kind === 'string') {
      return { ...common, canonicalString: /^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) && value !==
        '-0.00',
        proposedAmount: null, reason: 'string_characterized_without_numeric_rounding' }
    }
    const scaled = value * 100
    const cents = Math.round(scaled)
    if (!Number.isSafeInteger(cents)) throw new Error('unsafe_amount_cents')
    const proposedAmount = (cents / 100).toFixed(2)
    const proposed = decimalParts(proposedAmount)
    if (!equalDecimal(proposed, { coefficient: BigInt(cents), scale: 2 })) throw new Error(
      'proposed_encoding_cannot_preserve_cents')
    const scale = Math.max(source.scale, proposed.scale)
    const difference = proposed.coefficient * 10n ** BigInt(scale - proposed.scale)
      - source.coefficient * 10n ** BigInt(scale - source.scale)
    return { ...common, proposedAmount, cents: Object.is(cents, -0) ? 0 : cents,
      changed: difference !== 0n, differenceCents: decimalString(difference * 100n, scale),
      javascriptHalfTie: Math.abs(scaled % 1) === 0.5, roundedNegativeZero: Object.is(cents, -0),
      sourceToNumberChanged: !equalDecimal(source, decimalParts(String(value))) }
  } catch (error) {
    return { ...result, reason: error.message }
  }
}

export function inspectTransaction(row) {
  const finding = { transactionId: row.id, transactionType: row.type, deleted: row.deleted === true,
    deprecated: row.deprecated === true, entries: [], reasons: [] }
  if (finding.deprecated) return { ...finding, shape: 'excluded', unsupported: false,
    malformed: false }
  const unsupportedLifecycle = ![0, 2, 3, 4, 5].includes(row.type)
  let taxes
  if (row.taxes_text === undefined) return { ...finding, shape: 'missing', unsupported: true,
    malformed: false }
  if (row.taxes_text === null) return { ...finding, shape: 'sql_null', unsupported: true,
    malformed: false }
  try { taxes = JSON.parse(row.taxes_text) } catch {
    return { ...finding, shape: 'invalid_json', unsupported: true, malformed: true }
  }
  if (taxes === null) return { ...finding, shape: 'json_null', unsupported: true, malformed: false }
  if (!Array.isArray(taxes)) return { ...finding, shape: 'non_array', unsupported: true,
    malformed: false }
  const tokens = JSON.parse(row.amount_tokens)
  if (!Array.isArray(tokens) || tokens.length !== taxes.length) throw new Error(
    'amount_token_count_mismatch')
  const seen = new Set()
  finding.entries = taxes.map((entry, index) => {
    const object = entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    const validType = object && typeof entry.type === 'string' && entry.type.length > 0
    const taxType = object && typeof entry.type === 'string' ? entry.type : null
    const duplicate = validType && seen.has(taxType)
    if (validType) seen.add(taxType)
    const amount = inspectAmount(object ? entry.amount : undefined, tokens[index] ?? undefined)
    return { index, taxType, duplicate, ...amount, amountStatus: amount.status,
      ...(!object ? { status: 'malformed', reason: 'entry_not_object' }
        : !validType ? { status: 'malformed', reason: 'missing_or_empty_tax_type' } : {}) }
  })
  return { ...finding, shape: taxes.length ? 'array' : 'empty',
    unsupported: unsupportedLifecycle || finding.entries.some(entry => entry.reason ===
      'entry_not_object'),
    malformed: finding.entries.some(entry => entry.status === 'malformed'), unsupportedLifecycle,
    mixed: finding.entries.some(entry => entry.kind === 'number') && finding.entries.some(entry =>
      entry.kind === 'string') }
}

export function newSummary() {
  return { transactionsExamined: 0, excludedDeprecated: 0, transactionsWithTaxAttribution: 0,
    emptyTaxArrays: 0, missingTaxData: 0, nullTaxData: 0, mixedArrays: 0,
    malformedTransactions: 0, unsupportedTransactions: 0, unsupportedLegacyShapes: 0,
      deletedTransactionsWithTaxAttribution: 0,
    totalTaxEntries: 0, numericAmountEntries: 0, stringAmountEntries: 0, canonicalStringEntries: 0,
      noncanonicalStringEntries: 0, validAmountEntries: 0,
    malformedAmountEntries: 0, malformedEntries: 0, fractionalCentAmounts: 0,
      numericFractionalCentAmounts: 0,
    stringFractionalCentAmounts: 0, roundedNumericAmountsChanged: 0,
      transactionsAffectedByRounding: 0,
    numericSourceToNumberChanges: 0, originalNegativeZeroAmounts: 0, roundedNegativeZeroAmounts: 0,
    sourceHalfTies: 0, javascriptHalfTies: 0, duplicateTaxEntries: 0, byType: {} }
}
export function includeFinding(summary, finding) {
  summary.transactionsExamined++
  const type = [0, 2, 3, 4, 5].includes(finding.transactionType) ? String(finding
    .transactionType) : 'other'
  const bucket = summary.byType[type] ??= { transactions: 0, withTaxAttribution: 0,
    excludedDeprecated: 0 }
  bucket.transactions++
  if (finding.deprecated) { summary.excludedDeprecated++; bucket.excludedDeprecated++; return }
  if (finding.shape === 'empty') summary.emptyTaxArrays++
  if (finding.shape === 'missing') summary.missingTaxData++
  if (['sql_null', 'json_null'].includes(finding.shape)) summary.nullTaxData++
  if (finding.entries.length) {
    summary.transactionsWithTaxAttribution++; bucket.withTaxAttribution++
    if (finding.deleted) summary.deletedTransactionsWithTaxAttribution++
  }
  if (finding.mixed) summary.mixedArrays++
  if (finding.malformed) summary.malformedTransactions++
  if (finding.unsupported) summary.unsupportedTransactions++
  if (['non_array', 'invalid_json'].includes(finding.shape) || finding.entries.some(entry => entry
    .reason === 'entry_not_object')) summary.unsupportedLegacyShapes++
  if (finding.entries.some(entry => entry.changed)) summary.transactionsAffectedByRounding++
  for (const entry of finding.entries) {
    summary.totalTaxEntries++
    if (entry.kind === 'number') summary.numericAmountEntries++
    if (entry.kind === 'string') summary.stringAmountEntries++
    if (entry.amountStatus === 'valid') summary.validAmountEntries++
    if (entry.canonicalString) summary.canonicalStringEntries++
    if (entry.kind === 'string' && entry.amountStatus === 'valid' && !entry.canonicalString) summary
      .noncanonicalStringEntries++
    if (entry.status === 'malformed') summary.malformedEntries++
    if (entry.amountStatus === 'malformed') summary.malformedAmountEntries++
    if (entry.fractionalCents) {
      summary.fractionalCentAmounts++
      if (entry.kind === 'number') summary.numericFractionalCentAmounts++
      else summary.stringFractionalCentAmounts++
    }
    if (entry.changed) summary.roundedNumericAmountsChanged++
    if (entry.sourceToNumberChanged) summary.numericSourceToNumberChanges++
    if (entry.originalNegativeZero) summary.originalNegativeZeroAmounts++
    if (entry.roundedNegativeZero) summary.roundedNegativeZeroAmounts++
    if (entry.sourceHalfTie) summary.sourceHalfTies++
    if (entry.javascriptHalfTie) summary.javascriptHalfTies++
    if (entry.duplicate) summary.duplicateTaxEntries++
  }
}

export function argumentsFor(args) {
  const { values } = parseArgs({ args, allowPositionals: false, strict: true, options: {
    database: { type: 'string' }, env: { type: 'string', default: '.env' }, 'dry-run': { type:
      'boolean' },
    'print-sql': { type: 'boolean' }, 'output-parent': { type: 'string' },
  } })
  if (!values['print-sql'] && !/^[a-zA-Z0-9_]+$/.test(values.database ?? '')) throw new Error(
    'explicit_database_required')
  return values
}

export async function runAudit(client, config, writeFinding, { pageSize = 100, verify =
  discoverTarget, reverify = verifyDatabase } = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error(
    'invalid_page_size')
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const { rows: [mode] } = await client.query(
      "SELECT current_setting('transaction_read_only') AS read_only")
    if (mode?.read_only !== 'on') throw new Error('read_only_transaction_required')
    const target = await verify(client, config)
    const summary = newSummary()
    let after = 0
    for (;;) {
      const { rows } = await client.query(PAGE_SQL, [after, pageSize])
      if (!rows.length) break
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= after) throw new Error(
          'invalid_page_progress')
        after = row.id
        const finding = inspectTransaction(row)
        includeFinding(summary, finding)
        await writeFinding(finding)
      }
    }
    await reverify(client, config, target)
    await client.query('COMMIT')
    return { target: target.database, ...summary }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* Preserve the original read-only failure. */ }
    throw error
  }
}
async function writePrivate(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(value); await file.sync() } finally { await file.close() }
}
export async function main(args = process.argv.slice(2)) {
  let output, client, details, timer
  let phase = 'arguments'
  try {
    const options = argumentsFor(args)
    if (options['print-sql']) { console.log(PAGE_SQL); return }
    phase = 'output_directory'
    output = await mkdtemp(join(resolve(options['output-parent'] ?? process.cwd()),
      'tax-precision-audit-'))
    console.log(output) // Immediately after creation; before .env reads or database work.
    phase = 'configuration'
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    phase = 'load_driver'
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name:
        'spendcraft_tax_precision_audit',
      options:
        '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c \
idle_in_transaction_session_timeout=60000 -c search_path=pg_catalog,public' })
    client.on('error', () => undefined)
    timer = setTimeout(() => { client.end().catch(() => undefined) }, 300000)
    phase = 'connect'
    await client.connect()
    details = await open(join(output, 'transactions.jsonl'), 'wx', 0o600)
    phase = 'scan'
    const result = await runAudit(client, config, finding => details.writeFile(JSON.stringify(
      finding) + '\n'))
    await details.sync()
    await details.close(); details = undefined
    phase = 'summary'
    const summary = { status: 'complete', readOnly: true, roundingPolicyApprovedForTax: false,
      ...result }
    const human = `Read-only tax precision audit complete.\nTransactions examined: ${result
      .transactionsExamined}; with attribution: ${result
      .transactionsWithTaxAttribution}; empty: ${result.emptyTaxArrays}.\nEntries: ${result
      .totalTaxEntries}; numeric: ${result.numericAmountEntries}; strings: ${result
      .stringAmountEntries}; malformed entries: ${result
      .malformedEntries}.\nFractional-cent amounts: ${result
      .fractionalCentAmounts}; numeric values changed by reference rounding: ${result
      .roundedNumericAmountsChanged}.\nUnsupported transactions: ${result
      .unsupportedTransactions}; deprecated excluded: ${result
      .excludedDeprecated}.\nReference Math.round policy is characterization only, not approved \
for tax storage.\n`
    await writePrivate(join(output, 'summary.txt'), human)
    await writePrivate(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
    console.log(human)
    console.log(JSON.stringify(summary))
  } catch (error) {
    // Never print raw pg messages, SQL parameters or exception text containing financial
    // data/secrets.
    const knownFailures = new Set(['explicit_database_required', 'invalid_env_connection',
      'env_database_mismatch',
      'invalid_explicit_connection', 'database_identity_unavailable',
        'live_database_identity_mismatch',
      'configured_database_mismatch', 'invalid_loopback_address', 'non_loopback_address',
      'read_only_transaction_required', 'invalid_page_progress', 'amount_token_count_mismatch',
        'invalid_page_size'])
    const code = ['ENOENT', 'EACCES', 'ENOSPC', 'EIO', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
      '28P01', '42501'].includes(error.code) ? error.code
      : knownFailures.has(error.message) ? error.message : 'operation_failed'
    const diagnostic = { status: 'incomplete', phase, code, readOnly: true }
    if (output) {
      try { await writePrivate(join(output, 'failure.json'), JSON.stringify(diagnostic) +
        '\n') } catch { /* Console still reports incomplete status. */ }
    }
    console.error('INCOMPLETE: do not treat partial output as a completed historical audit.')
    console.error(JSON.stringify(diagnostic))
    process.exitCode = 1
  } finally {
    clearTimeout(timer)
    try { await details?.close() } catch { /* Partial evidence remains private. */ }
    try { await client?.end() } catch { /* No data mutations are possible. */ }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(
  )
