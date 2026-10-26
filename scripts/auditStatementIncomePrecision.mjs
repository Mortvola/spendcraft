// Read-only characterization only. No cent policy is approved for these fields.
import process from 'node:process'
import console from 'node:console'
import { parseArgs } from 'node:util'
import { mkdir, mkdtemp, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { discoverTarget, verifyDatabase, verifyConnectionConfiguration } from './lib/historicalCategoryConversion.mjs'

export const FIELDS = ['shortTermCapitalGains', 'longTermCapitalGains', 'dividends', 'taxableInterest']
export const PAGE_SQL = `SELECT s.id, s.account_id, s.start_date::text, s.end_date::text,
  s.data::text AS data_text, i.application_id AS budget_id,
  jsonb_build_object(${FIELDS.map(f => `'${f}', (s.data->'${f}')::text`).join(', ')})::text AS tokens
  FROM public.statements s LEFT JOIN public.accounts a ON a.id=s.account_id
  LEFT JOIN public.institutions i ON i.id=a.institution_id
  WHERE s.id>$1 ORDER BY s.id LIMIT $2`

// Same account exclusions, start-date year and end-date month as getActuals.
// Only the hypothetical input leaves change; both sides retain PostgreSQL real SUM.
export const REPORT_SQL = `WITH proposals AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(id integer, data jsonb)
), inputs AS (
  SELECT s.*, COALESCE(p.data,s.data) AS hypothetical, i.application_id AS budget_id
  FROM public.statements s JOIN public.accounts a ON a.id=s.account_id
  JOIN public.institutions i ON i.id=a.institution_id
  JOIN public.applications b ON b.id=i.application_id
  LEFT JOIN proposals p ON p.id=s.id
  WHERE a.subtype NOT IN ('401k','Roth 401k','Roth','ira')
) SELECT budget_id, EXTRACT(YEAR FROM start_date)::int AS year,
  EXTRACT(MONTH FROM end_date)::int AS month,
  ${FIELDS.flatMap(f => [
    `SUM(COALESCE((data->>'${f}')::real,0)) AS "${f}"`,
    `SUM(COALESCE((hypothetical->>'${f}')::real,0)) AS "hypothetical_${f}"`,
  ]).join(',\n  ')}
  FROM inputs GROUP BY budget_id, EXTRACT(YEAR FROM start_date), EXTRACT(MONTH FROM end_date)
  ORDER BY budget_id,year,month`

export function inspectStatement(row) {
  const finding = { statementId: row.id, accountId: row.account_id, budgetId: row.budget_id,
    startDate: row.start_date, endDate: row.end_date, rawData: row.data_text, fields: {} }
  let data
  if (row.data_text === null) finding.shape = 'sql_null'
  else if (row.data_text === undefined) finding.shape = 'missing'
  else {
    try { data = JSON.parse(row.data_text) } catch { finding.shape = 'invalid_json' }
    finding.shape ??= data === null ? 'json_null' : typeof data === 'object' && !Array.isArray(data) ? 'object' : 'non_object'
  }
  const tokens = JSON.parse(row.tokens ?? '{}')
  const proposed = finding.shape === 'object' ? { ...data } : null
  for (const field of FIELDS) {
    const present = finding.shape === 'object' && Object.hasOwn(data, field)
    const entry = present ? inspectAmount(data[field], tokens[field]) : { kind: 'missing', status: 'missing' }
    finding.fields[field] = { present, ...entry }
    // Strings are characterized, not coerced or hypothetically converted.
    if (entry.kind === 'number' && entry.status === 'valid') proposed[field] = entry.proposedAmount
  }
  finding.mixed = Object.values(finding.fields).some(e => e.kind === 'number')
    && Object.values(finding.fields).some(e => e.kind === 'string')
  return { finding, proposal: proposed && { id: row.id, data: proposed } }
}

export function newSummary() {
  return { statementsExamined: 0, mixedStatements: 0, shapes: {}, fields: Object.fromEntries(FIELDS.map(f => [f, {
    present: 0, numeric: 0, strings: 0, canonicalStrings: 0, missing: 0, null: 0,
    malformed: 0, fractionalCents: 0, hypotheticalNumericChanges: 0, sourceToNumberChanges: 0,
  }])) }
}

export async function runAudit(client, config, writeFinding, { verify = discoverTarget, reverify = verifyDatabase } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    if ((await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0]?.read_only !== 'on') throw new Error('read_only_required')
    const target = await verify(client, config)
    const summary = newSummary(), proposals = []
    let after = 0, reportSafe = true
    for (;;) {
      const { rows } = await client.query(PAGE_SQL, [after, 100])
      if (!rows.length) break
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= after) throw new Error('invalid_page_progress')
        after = row.id
        const { finding, proposal } = inspectStatement(row)
        summary.statementsExamined++
        summary.mixedStatements += Number(finding.mixed)
        summary.shapes[finding.shape] = (summary.shapes[finding.shape] ?? 0) + 1
        if (['non_object', 'invalid_json', 'missing'].includes(finding.shape)) reportSafe = false
        for (const field of FIELDS) {
          const e = finding.fields[field], count = summary.fields[field]
          count.present += Number(e.present)
          count.numeric += Number(e.kind === 'number')
          count.strings += Number(e.kind === 'string')
          count.canonicalStrings += Number(e.canonicalString === true)
          count.missing += Number(e.kind === 'missing')
          count.null += Number(e.kind === 'null')
          count.malformed += Number(e.status === 'malformed')
          count.fractionalCents += Number(e.fractionalCents === true)
          count.hypotheticalNumericChanges += Number(e.changed === true)
          count.sourceToNumberChanges += Number(e.sourceToNumberChanged === true)
          if (e.status === 'malformed' && e.kind !== 'null') reportSafe = false
        }
        if (proposal) proposals.push(proposal)
        await writeFinding(finding)
      }
    }
    const reports = reportSafe ? (await client.query(REPORT_SQL, [JSON.stringify(proposals)])).rows : null
    const differences = reports?.filter(row => FIELDS.some(f => row[f] !== row[`hypothetical_${f}`])) ?? null
    await reverify(client, config, target)
    await client.query('COMMIT')
    return { target: target.database, ...summary, reports, reportDifferences: differences,
      reportComparison: reportSafe ? 'compared' : 'not_compared_unsupported_values',
      hypotheticalPolicyOnly: true, stringsPreservedInHypothesis: true }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* Preserve original failure. */ }
    throw error
  }
}

export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    env: { type: 'string', default: '.env' }, database: { type: 'string' },
    'output-parent': { type: 'string' }, 'print-sql': { type: 'boolean' },
  } })
  if (!values['print-sql'] && !/^[a-zA-Z0-9_]+$/.test(values.database ?? '')) throw new Error('explicit_database_required')
  return values
}

export async function main(args = process.argv.slice(2)) {
  let client, details, timer
  try {
    const options = argumentsFor(args)
    if (options['print-sql']) { console.log(PAGE_SQL + ';\n' + REPORT_SQL); return }
    const parent = resolve(options['output-parent'] ?? 'script-output')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const output = await mkdtemp(join(parent, 'statement-income-audit-'))
    console.log(output) // Before configuration reads, driver loading or connection.
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password, ssl: false, connectionTimeoutMillis: 10000,
      application_name: 'spendcraft_statement_income_audit',
      options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=60000 -c search_path=pg_catalog,public' })
    client.on('error', () => undefined)
    timer = globalThis.setTimeout(() => { client.end().catch(() => undefined) }, 300000)
    await client.connect()
    details = await open(join(output, 'statements.jsonl'), 'wx', 0o600)
    const result = await runAudit(client, config, f => details.writeFile(JSON.stringify(f) + '\n'))
    await details.sync()
    const summary = await open(join(output, 'summary.json'), 'wx', 0o600)
    try { await summary.writeFile(JSON.stringify({ status: 'complete', readOnly: true, ...result }, null, 2) + '\n'); await summary.sync() } finally { await summary.close() }
    console.log(JSON.stringify({ statementsExamined: result.statementsExamined, fields: result.fields,
      reportComparison: result.reportComparison, changedReportGroups: result.reportDifferences?.length ?? null }))
  } catch {
    console.error('INCOMPLETE statement income audit; retain private evidence. No database changes were authorized or attempted.')
    process.exitCode = 1
  } finally {
    globalThis.clearTimeout(timer)
    try { await details?.close() } catch { /* Preserve partial evidence. */ }
    try { await client?.end() } catch { /* Read-only connection. */ }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
