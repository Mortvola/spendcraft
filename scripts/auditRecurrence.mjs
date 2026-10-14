// Operator-only recurrence prerequisite check; imports never connect.
import process from 'node:process'
import console from 'node:console'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { AuditFailure, collect, configuration, failureReason } from './auditLegacyMoney.mjs'

export const QUERIES = {
  recurrenceSchema: `SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'recurrence'`,
  recurrenceCounts: `SELECT count(*)::text AS total, min(recurrence)::text AS minimum,
    max(recurrence)::text AS maximum,
    count(*) FILTER (WHERE recurrence < 1)::text AS below,
    count(*) FILTER (WHERE recurrence > 360)::text AS above,
    count(*) FILTER (WHERE recurrence IS NULL)::text AS nulls,
    count(*) FILTER (WHERE recurrence::numeric <> trunc(recurrence::numeric))::text AS noninteger
    FROM public.categories`,
  incompatibleRows: `SELECT id::text AS id, recurrence::text AS recurrence
    FROM public.categories WHERE (recurrence BETWEEN 1 AND 360) IS FALSE ORDER BY id`,
}

export function classify(result) {
  const schema = result.recurrenceSchema
  const counts = result.recurrenceCounts
  if (schema.length !== 1 || counts.length !== 1
    || schema[0].data_type !== 'integer' || schema[0].is_nullable !== 'NO') {
    throw new AuditFailure('Schema differs from expected integer NOT NULL recurrence; check incomplete.', 3)
  }
  const c = counts[0]
  for (const key of ['total', 'below', 'above', 'nulls', 'noninteger']) {
    if (!/^\d+$/.test(c[key])) throw new AuditFailure('Invalid aggregate result; check incomplete.', 3)
  }
  const incompatible = BigInt(c.below) + BigInt(c.above)
  if (incompatible !== BigInt(result.incompatibleRows.length)) {
    throw new AuditFailure('Incomplete incompatible-row evidence.', 3)
  }
  return { outcome: incompatible === 0n ? 'COMPATIBLE' : 'INCOMPATIBLE',
    recurrence_schema: schema[0], counts: c, incompatible_rows: result.incompatibleRows }
}

export function collectRecurrence(config, createClient, announce) {
  return collect(config, createClient, announce, { queries: QUERIES, classify })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--print-sql') {
    for (const sql of Object.values(QUERIES)) console.log(`${sql};`)
    return
  }
  const index = args.indexOf('--database')
  if (args.length !== 3 || !args.includes('--execute') || index < 0
    || !args[index + 1] || args[index + 1].startsWith('--')) {
    console.error('INCOMPLETE: use --database NAME --execute; --print-sql is offline.')
    process.exitCode = 2
    return
  }
  let phase = 'configuration'
  try {
    const config = configuration({ ...process.env, SPENDCRAFT_AUDIT_DATABASE: args[index + 1] })
    phase = 'creating private output directory'
    await mkdir(config.outputDir, { mode: 0o700 })
    phase = 'loading driver'
    const { Client } = await import('pg')
    phase = 'recurrence check'
    const report = await collectRecurrence(config, options => new Client(options),
      target => console.log(JSON.stringify({ verified_target: target })))
    report.completion.connection_closed = true
    phase = 'writing reports'
    await writeFile(`${config.outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    const summary = [`# Recurrence prerequisite: ${report.outcome}`,
      `Verified target: ${report.target.hostname}:${report.target.server_port}/${report.target.database}`,
      'READ ONLY / REPEATABLE READ', `Counts: ${JSON.stringify(report.counts)}`,
      ...report.incompatible_rows.map(row => `- Category ${row.id}: recurrence ${row.recurrence}`),
      'Snapshot data check only. Migration bookkeeping and deployment lock planning remain separate.']
    await writeFile(`${config.outputDir}/summary.md`, `${summary.join('\n')}\n`, { flag: 'wx', mode: 0o600 })
    process.exitCode = report.outcome === 'COMPATIBLE' ? 0 : 1
    console.log(`${report.outcome}; private report.json and summary.md written to ${config.outputDir}.`)
  } catch (error) {
    process.exitCode = error instanceof AuditFailure ? error.exitCode : 3
    console.error(`INCOMPLETE/SAFETY FAILURE: ${failureReason(error, phase)} Do not proceed.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
