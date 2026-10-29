// Read-only characterization. Hypothetical rounding is not an approved storage policy.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { mkdir, mkdtemp, open, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { discoverTarget, verifyDatabase, verifyConnectionConfiguration } from
  './lib/historicalCategoryConversion.mjs'

export const FIELDS = ['taxableInterest', 'qualifiedDividends', 'ordinaryDividends',
  'taxableIraDistributions',
  'taxablePensionAndAnnuities', 'taxableSocialSecurityBenefits', 'additionalTaxableIncome',
  'shortTermCapitalGains', 'longTermCapitalGains', 'qualifiedBusinessIncomeDeduction',
  'estimated.expectedAgi', 'estimated.priorYearAgi', 'estimated.priorYearTotalTax']
export const PAGE_SQL = `SELECT t.id, t.budget_id, t.year, t.data::text AS data_text,
  jsonb_build_object(${FIELDS.map(f => `'${f}', (t.data #> '{${f.replaceAll('.', ',')}}')::text`)
    .join(', ')})::text AS tokens
  FROM public.taxes t WHERE t.id>$1 ORDER BY t.id LIMIT $2`
export const LOG_FIELDS = ['amount.old', 'amount.new']
export const LOG_SQL = `SELECT l.id, l.application_id AS budget_id, l.transaction_id,
  l.changes::text AS changes_text,
  json_build_object('amount.old', (l.changes->'amount'->'old')::text,
    'amount.new', (l.changes->'amount'->'new')::text)::text AS tokens
  FROM public.transaction_logs l WHERE l.id>$1 ORDER BY l.id LIMIT $2`
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const shape = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
function wholeDollar(text) {
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e')
  const fraction = (mantissa.split('.')[1] ?? '').length
  const scale = fraction - Number(exponent)
  return scale <= 0 || BigInt(mantissa.replace(/[+.-]/g, '')) % (10n ** BigInt(scale)) === 0n
}

function amountFinding(value, token, present) {
  const entry = present ? inspectAmount(value, token) : { kind: 'missing', status: 'missing' }
  if (entry.status === 'valid') {
    const text = entry.kind === 'string' ? value : token ?? String(value)
    entry.wholeDollar = wholeDollar(text); entry.centScale = !entry.fractionalCents
  }
  return { present, ...entry }
}
export function inspectLog(row) {
  const finding = { source: 'transaction_logs', logId: row.id, budgetId: row.budget_id,
    transactionId: row.transaction_id, rawChanges: row.changes_text, fields: {} }
  let data
  if (row.changes_text === null) finding.shape = 'sql_null'
  else if (row.changes_text === undefined) finding.shape = 'missing'
  else { try { data = JSON.parse(row.changes_text); finding.shape = shape(data) } catch { finding
    .shape = 'invalid_json' } }
  finding.amountShape = object(data) && Object.hasOwn(data, 'amount') ? shape(data.amount) :
    'missing'
  finding.otherChangeKeys = object(data) ? Object.keys(data).filter(k => k !== 'amount') : []
  const tokens = JSON.parse(row.tokens ?? '{}')
  for (const field of LOG_FIELDS) {
    const key = field.split('.')[1], present = object(data) && object(data.amount) && Object.hasOwn(
      data.amount, key)
    finding.fields[field] = amountFinding(present ? data.amount[key] : undefined, tokens[field],
      present)
  }
  finding.mixed = Object.values(finding.fields).some(e => e.kind === 'number') && Object.values(
    finding.fields).some(e => e.kind === 'string')
  return finding
}

// Execute the existing pure worksheet, not a rewritten formula or application bootstrap.
export async function loadWorksheet() {
  const source = await readFile(new URL('../client-src/State/Taxes/Estimated.ts', import.meta.url),
    'utf8')
  const types = await readFile(new URL('../common/ResponseTypes.ts', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('ResponseTypes.ts', types, ts.ScriptTarget.Latest, true)
  const declaration = parsed.statements.find(s => ts.isEnumDeclaration(s) && s.name.text ===
    'FilingStatus')
  if (!declaration) throw new Error('filing_status_enum_unavailable')
  const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind
    .CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const enums = {}; runInNewContext(compile(declaration.getText(parsed)), { exports: enums })
  const taxSource = await readFile(new URL('../client-src/State/Taxes/Taxes.ts', import.meta.url),
    'utf8')
  const taxAst = ts.createSourceFile('Taxes.ts', taxSource, ts.ScriptTarget.Latest, true)
  const taxClass = taxAst.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'Taxes')
  const deduction = taxClass?.members.find(m => ts.isGetAccessor(m) && m.name.getText(taxAst) ===
    'standardDeduction')
  if (!deduction?.body) throw new Error('standard_deduction_unavailable')
  const helpers = {}
  runInNewContext(compile(`exports.deduction = function() ${deduction.body.getText(taxAst)}`), {
    exports: helpers, FilingStatus: enums.FilingStatus })
  const exports = {}
  runInNewContext(compile(source), { exports, require: name => {
    if (name === 'luxon') return { DateTime }
    if (name === '../../../common/ResponseTypes') return enums
    throw new Error('unexpected_calculation_dependency')
  } })
  if (typeof exports.worksheet2_1_2026 !== 'function') throw new Error('worksheet_unavailable')
  return { calculate: exports.worksheet2_1_2026, deductions: status => helpers.deduction.call({
    filingStatus: status }), filingStatuses: Object.values(enums.FilingStatus),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    responseTypesSha256: createHash('sha256').update(types).digest('hex'),
    taxStateSha256: createHash('sha256').update(taxSource).digest('hex') }
}

export function compareWorksheet(data, finding, worksheet) {
  const scope =
    'Worksheet2_1_only_as_called_by_Worksheet2_1_state; \
other_forecast_and_actuals_calculations_not_compared'
  if (finding.year !== 2026) return { status: 'not_compared', reason:
    'no_matching_year_calculation', scope }
  if (!worksheet.filingStatuses.includes(data?.filingStatus)) return { status: 'not_compared',
    reason: 'unsupported_filing_status', scope }
  const keys = FIELDS.filter(f => f.startsWith('estimated.'))
  if (!keys.every(f => finding.fields[f].kind === 'number' && finding.fields[f].status ===
    'valid')) {
    return { status: 'not_compared', reason: 'estimated_requires_three_safe_numeric_inputs', scope }
  }
  const deductions = worksheet.deductions(data.filingStatus)
  const inputs = proposed => ({ filingStatus: data.filingStatus, deductions,
    adjustedGrossIncome: proposed ? Number(finding.fields['estimated.expectedAgi']
      .proposedAmount) : data.estimated.expectedAgi,
    priorYearAdjustedGrossIncome: proposed ? Number(finding.fields['estimated.priorYearAgi']
      .proposedAmount) : data.estimated.priorYearAgi,
    priorYearTotalTax: proposed ? Number(finding.fields['estimated.priorYearTotalTax']
      .proposedAmount) : data.estimated.priorYearTotalTax })
  const beforeInput = inputs(false), afterInput = inputs(true)
  const before = worksheet.calculate(beforeInput), after = worksheet.calculate(afterInput)
  const threshold = data.filingStatus === 'MarriedFilingSeparate' ? 75000 : 150000
  const finite = r => Object.values(r.lines).every(Number.isFinite) && Number.isFinite(r
    .firstInstallment)
  if (!finite(before) || !finite(after)) return { status: 'not_compared', reason:
    'nonfinite_calculation_result', scope }
  return { status: 'compared', scope, beforeInput, hypotheticalInput: afterInput, before,
    hypothetical: after,
    changed: !isDeepStrictEqual(before, after),
    changedLines: Object.keys(before.lines).filter(k => before.lines[k] !== after.lines[k]),
    priorYearThreshold: threshold,
    thresholdSelectionChanged: (beforeInput.priorYearAdjustedGrossIncome > threshold) !== (
      afterInput.priorYearAdjustedGrossIncome > threshold) }
}

export function inspectTax(row, worksheet) {
  const finding = { source: 'taxes', taxId: row.id, budgetId: row.budget_id, year: row.year,
    rawData: row.data_text, fields: {}, unclassifiedPaths: [] }
  let data
  if (row.data_text === null) finding.shape = 'sql_null'
  else if (row.data_text === undefined) finding.shape = 'missing'
  else { try { data = JSON.parse(row.data_text); finding.shape = shape(data) } catch { finding
    .shape = 'invalid_json' } }
  const tokens = JSON.parse(row.tokens ?? '{}')
  finding.estimatedShape = object(data) && Object.hasOwn(data, 'estimated') ? shape(data
    .estimated) : 'missing'
  for (const field of FIELDS) {
    const [parent, child] = field.split('.')
    const container = child ? object(data) && object(data[parent]) ? data[parent] : undefined : data
    const key = child ?? parent, present = object(container) && Object.hasOwn(container, key)
    finding.fields[field] = amountFinding(present ? container[key] : undefined, tokens[field],
      present)
  }
  // Unknown historical keys/arrays are evidence for review, never inferred to be currency.
  function unknown(value, prefix = '') {
    if (!object(value) && !Array.isArray(value)) return
    for (const [key, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (FIELDS.includes(path) || path === 'filingStatus') continue
      if (path !== 'estimated') finding.unclassifiedPaths.push({ path, kind: shape(v) })
      unknown(v, path)
    }
  }
  unknown(data)
  finding.mixed = Object.values(finding.fields).some(e => e.kind === 'number') && Object.values(
    finding.fields).some(e => e.kind === 'string')
  finding.calculation = compareWorksheet(data, finding, worksheet)
  return finding
}

export function newSummary() {
  return { recordsExamined: 0, mixedRecords: 0, shapes: {}, estimatedShapes: {},
    recordsWithUnclassifiedPaths: 0,
    calculations: { compared: 0, changed: 0, thresholdChanges: 0, notCompared: {} },
    fields: Object.fromEntries(FIELDS.map(f => [f, { examined: 0, present: 0, missing: 0, null: 0,
      numeric: 0, strings: 0, canonicalStrings: 0, malformed: 0, unsafe: 0, wholeDollar: 0,
        centScale: 0,
      fractionalCents: 0, hypotheticalNumericChanges: 0, sourceToNumberChanges: 0, positive: 0,
        negative: 0, zero: 0 }])) }
}
function includeFields(fields, finding, counters) {
  for (const field of fields) {
    const e = finding.fields[field], c = counters[field]
    c.examined++; c.present += Number(e.present); c.missing += Number(e.kind === 'missing'); c
      .null += Number(e.kind === 'null')
    c.numeric += Number(e.kind === 'number'); c.strings += Number(e.kind === 'string'); c
      .canonicalStrings += Number(e.canonicalString === true)
    c.malformed += Number(e.status === 'malformed'); c.unsafe += Number(
      /unsafe|cannot_preserve_cents|nonfinite/.test(e.reason ?? ''))
    for (const key of ['wholeDollar', 'centScale', 'fractionalCents']) c[key] += Number(e[
      key] === true)
    c.hypotheticalNumericChanges += Number(e.changed === true); c.sourceToNumberChanges += Number(e
      .sourceToNumberChanged === true)
    if (e.status === 'valid') {
      const text = e.kind === 'string' ? JSON.parse(e.originalToken) : e.originalToken
      const zero = /^0+$/.test(text.split(/[eE]/)[0].replace(/[+.-]/g, ''))
      c.positive += Number(!zero && !e.negative); c.negative += Number(!zero && e.negative); c
        .zero += Number(zero)
    }
  }
}
export async function runAudit(client, config, writeFinding, worksheet, { verify = discoverTarget,
  reverify = verifyDatabase } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    if ((await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0]
      ?.read_only !== 'on') throw new Error('read_only_required')
    const target = await verify(client, config), summary = newSummary()
    summary.transactionLogs = { recordsExamined: 0, mixedRecords: 0, shapes: {}, amountShapes: {},
      recordsWithOtherChangeKeys: 0,
      fields: Object.fromEntries(LOG_FIELDS.map(f => [f, { ...newSummary().fields
        .taxableInterest }])) }
    let after = 0
    for (;;) {
      const { rows } = await client.query(PAGE_SQL, [after, 100])
      if (!rows.length) break
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= after) throw new Error(
          'invalid_page_progress')
        after = row.id
        const f = inspectTax(row, worksheet)
        summary.recordsExamined++; summary.mixedRecords += Number(f.mixed)
        summary.shapes[f.shape] = (summary.shapes[f.shape] ?? 0) + 1
        summary.estimatedShapes[f.estimatedShape] = (summary.estimatedShapes[f.estimatedShape] ??
          0) + 1
        summary.recordsWithUnclassifiedPaths += Number(f.unclassifiedPaths.length > 0)
        includeFields(FIELDS, f, summary.fields)
        const calculation = f.calculation
        if (calculation.status === 'compared') { summary.calculations.compared++; summary
          .calculations.changed += Number(calculation.changed); summary.calculations
          .thresholdChanges += Number(calculation.thresholdSelectionChanged) }
        else summary.calculations.notCompared[calculation.reason] = (summary.calculations
          .notCompared[calculation.reason] ?? 0) + 1
        await writeFinding(f)
      }
    }
    after = 0
    for (;;) {
      const { rows } = await client.query(LOG_SQL, [after, 100])
      if (!rows.length) break
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= after) throw new Error(
          'invalid_log_page_progress')
        after = row.id
        const f = inspectLog(row), logs = summary.transactionLogs
        logs.recordsExamined++; logs.mixedRecords += Number(f.mixed)
        logs.shapes[f.shape] = (logs.shapes[f.shape] ?? 0) + 1
        logs.amountShapes[f.amountShape] = (logs.amountShapes[f.amountShape] ?? 0) + 1
        logs.recordsWithOtherChangeKeys += Number(f.otherChangeKeys.length > 0)
        includeFields(LOG_FIELDS, f, logs.fields); await writeFinding(f)
      }
    }
    await reverify(client, config, target); await client.query('COMMIT')
    return { target: target.database, ...summary, hypotheticalPolicyOnly: true,
      stringsPreservedInHypothesis: true,
      calculationSourceSha256: worksheet.sourceSha256, responseTypesSha256: worksheet
        .responseTypesSha256, taxStateSha256: worksheet.taxStateSha256 }
  } catch (error) { try { await client.query('ROLLBACK') } catch {
    /* Preserve original failure. */ } throw error }
}
export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    env: { type: 'string', default: '.env' }, database: { type: 'string' }, 'output-parent': {
      type: 'string' }, 'print-sql': { type: 'boolean' },
  } })
  if (!values['print-sql'] && !/^[a-zA-Z0-9_]+$/.test(values.database ?? '')) throw new Error(
    'explicit_database_required')
  return values
}
export async function main(args = process.argv.slice(2)) {
  let client, details, logDetails, timer
  try {
    const options = argumentsFor(args)
    if (options['print-sql']) { console.log(PAGE_SQL + ";\n" + LOG_SQL); return }
    const parent = resolve(options['output-parent'] ?? 'script-output'); await mkdir(parent, {
      recursive: true, mode: 0o700 })
    const output = await mkdtemp(join(parent, 'tax-forecast-audit-')); console.log(output)
    const config = await configuration(options.env, {}, options.database);
      verifyConnectionConfiguration(config)
    const worksheet = await loadWorksheet()
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: false, connectionTimeoutMillis: 10000, application_name: 'spendcraft_tax_forecast_audit',
      options:
        '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c \
idle_in_transaction_session_timeout=60000 -c search_path=pg_catalog,public' })
    client.on('error', () => undefined); timer = globalThis.setTimeout(() => { client.end().catch((
      ) => undefined) }, 300000)
    await client.connect(); details = await open(join(output, 'taxes.jsonl'), 'wx', 0o600)
    logDetails = await open(join(output, 'transaction-logs.jsonl'), 'wx', 0o600)
    const result = await runAudit(client, config, f => (f.source ===
      'transaction_logs' ? logDetails : details).writeFile(JSON.stringify(f) + '\n'), worksheet)
    await details.sync(); await logDetails.sync(); const file = await open(join(output,
      'summary.json'), 'wx', 0o600)
    try { await file.writeFile(JSON.stringify({ status: 'complete', readOnly: true, ...result },
      null, 2) + '\n'); await file.sync() } finally { await file.close() }
    console.log(JSON.stringify({ recordsExamined: result.recordsExamined, fields: result.fields,
      calculations: result.calculations, transactionLogs: result.transactionLogs }))
  } catch {
    console.error(
      'INCOMPLETE tax forecast audit; preserve private evidence. No database changes attempted.');
      process.exitCode = 1
  } finally { globalThis.clearTimeout(timer); await details?.close(); await logDetails?.close();
    await client?.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(
  )
