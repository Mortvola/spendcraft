// Read-only characterization; neither rounding hypothesis is an approved migration.
import process from 'node:process'
import console from 'node:console'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { readFile, mkdir, mkdtemp, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { discoverTarget, verifyDatabase, verifyConnectionConfiguration } from './lib/historicalCategoryConversion.mjs'

export const SCHEMA_SQL = `SELECT a.atttypid='real'::regtype AS is_real, a.attnotnull AS not_null
  FROM pg_attribute a WHERE a.attrelid='public.auto_assignment_categories'::regclass
  AND a.attname='amount' AND NOT a.attisdropped`
export const RULE_SQL = `WITH rules AS (
  SELECT c.*, c.xmin::text AS row_version, md5(row_to_json(c)::text) AS row_hash, a.application_id AS budget_id,
    EXISTS (SELECT 1 FROM public.applications b WHERE b.id=a.application_id) AND
    EXISTS (SELECT 1 FROM public.categories k JOIN public.groups g ON g.id=k.group_id
      WHERE k.id=c.category_id AND g.application_id=a.application_id) AS ownership_valid,
    CASE WHEN c.amount::text NOT IN ('NaN','Infinity','-Infinity') THEN round(c.amount::numeric,2) END AS rounded
  FROM public.auto_assignment_categories c LEFT JOIN public.auto_assignments a ON a.id=c.auto_assignment_id
) SELECT id, auto_assignment_id, category_id, budget_id, row_version, row_hash, percentage, amount,
  amount::text AS original_text, encode(float4send(amount),'hex') AS original_real_hex,
  (amount::double precision)::text AS expanded_binary_value,
  rounded::text AS pg_rounded,
  CASE WHEN abs(rounded)<=9999999999.99 THEN (amount::numeric(12,2))::text END AS pg_target,
  (rounded-(amount::text)::numeric)::text AS pg_difference,
  ownership_valid
FROM rules ORDER BY auto_assignment_id, CASE WHEN percentage THEN 1 ELSE 0 END`
// This intentionally has the same unspecified tie order as Account.autoAssign.
export const DEFAULT_AMOUNTS = [0, 0.01, -0.01, 1, -1, 100, -100, 10000]

export function inspectRule(row) {
  const mode = row.percentage === true ? 'percentage' : row.percentage === false ? 'fixed' : 'null_flag_fixed'
  const result = { ...row, mode, nullAmount: row.amount === null, errors: [] }
  if (![true, false, null].includes(row.percentage)) result.errors.push('invalid_mode')
  if (row.ownership_valid !== true) result.errors.push('ownership_unavailable')
  if (!Number.isSafeInteger(row.id) || row.id < 1) result.errors.push('invalid_rule_id')
  if (row.amount === null) result.errors.push('null_amount_violates_schema')
  else if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) result.errors.push('nonfinite_or_nonnumeric_amount')
  else {
    result.negative = row.amount < 0
    result.zero = row.amount === 0
    result.precision = inspectAmount(row.amount, row.original_text)
    result.moreThanTwoDecimals = result.precision.fractionalCents === true
    result.jsTarget = result.precision.proposedAmount ?? null
    result.pgTarget = row.pg_target
    result.outOfRange = row.pg_target === null
    result.pgChangesValue = row.pg_difference !== null && Number(row.pg_difference) !== 0
    result.policyDisagreement = result.jsTarget !== null && row.pg_target !== null && Number(result.jsTarget) !== Number(row.pg_target)
    if (result.precision.status !== 'valid') result.errors.push(result.precision.reason)
    if (result.outOfRange) result.errors.push('numeric_12_2_out_of_range')
    if (!/^[0-9a-f]{8}$/.test(row.original_real_hex ?? '')) result.errors.push('missing_original_real_bits')
  }
  return result
}

export async function loadAllocator() {
  const source = await readFile(new URL('../app/Models/Account.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('Account.ts', source, ts.ScriptTarget.Latest, true)
  const account = ast.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'Account')
  const member = account?.members.find(m => ts.isMethodDeclaration(m) && m.name.getText(ast) === 'autoAssign')
  if (!member) throw new Error('actual_auto_assign_method_unavailable')
  const method = member.getText(ast), marker = 'transaction.categories.push('
  if (method.split(marker).length !== 2) throw new Error('allocation_trace_boundary_changed')
  // Observation only: capture actual remaining/amount locals after existing residual handling.
  const traced = method.replace(marker, 'traces.push({ruleId:cat.id,remaining,allocatedCents:amount});' + marker)
  const compiled = ts.transpileModule(`exports.make=(Category,traces)=>new class { ${traced} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, GroupType: { NoGroup: 'audit_no_group' } }, { timeout: 1000 })
  return { sourceSha256: createHash('sha256').update(source).digest('hex'), methodSha256: createHash('sha256').update(method).digest('hex'),
    async execute(rules, nominal) {
      const traces = [], balances = new Map()
      const Category = { async findOrFail(id) {
        if (!balances.has(id)) balances.set(id, { balance: 0, name: String(id), async save() { return undefined },
          related: () => ({ query: () => ({ firstOrFail: async () => ({ type: 'audit_no_group' }) }) }) })
        return balances.get(id)
      } }
      const assignment = { related: () => ({ query: () => ({ orderByRaw: async clause => {
        if (clause !== 'CASE WHEN percentage THEN 1 ELSE 0 END') throw new Error('rule_order_changed')
        return rules.map(r => ({ id: r.id, categoryId: r.category_id, amount: r.amount, percentage: r.percentage }))
      } }) }) }
      // Select this configuration explicitly; search-string winner/tie selection is not replayed.
      const budget = { related: () => ({ query: () => ({ whereIn: () => ({ first: async () => assignment }) }) }) }
      const transaction = { date: 1, budgetId: 1, categories: [], async save() { return undefined },
        related: () => ({ create: async () => undefined }) }
      const receiver = exports.make(Category, traces)
      receiver.startDate = 0
      if (await receiver.autoAssign(budget, transaction, { amount: nominal, name: 'audit scenario' }) !== true) throw new Error('allocation_not_applied')
      const result = globalThis.structuredClone({ allocations: transaction.categories, traces,
        balanceEffects: [...balances].map(([id, row]) => ({ categoryId: id, amount: row.balance })) })
      result.totalCents = result.allocations.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
      result.finalResidualCents = result.traces.at(-1)?.remaining ?? null
      result.conservesNominalCents = result.totalCents === Math.round(nominal * 100)
      result.safeIntegerCents = Number.isSafeInteger(result.totalCents) && result.traces.every(r => Number.isSafeInteger(r.remaining) && Number.isSafeInteger(r.allocatedCents))
      return result
    } }
}

export async function compareAllocations(rows, allocator, amounts = DEFAULT_AMOUNTS) {
  const findings = rows.map(inspectRule)
  if (findings.some(f => f.errors.length)) return { status: 'not_compared', reason: 'invalid_or_out_of_range_configuration' }
  const ties = [false, true].some(mode => rows.filter(r => Boolean(r.percentage) === mode).length > 1)
  const proposed = policy => rows.map((r, i) => ({ ...r, amount: Number(policy === 'postgres' ? findings[i].pgTarget : findings[i].jsTarget) }))
  const cases = []
  for (const nominal of amounts) {
    if (!Number.isFinite(nominal) || !Number.isSafeInteger(Math.round(nominal * 100))) throw new Error('unsafe_nominal_scenario')
    const before = await allocator.execute(rows, nominal)
    for (const policy of ['postgres', 'javascript']) {
      const after = await allocator.execute(proposed(policy), nominal)
      cases.push({ nominal, policy, changed: !isDeepStrictEqual(before, after), before, after })
    }
  }
  return { status: 'compared', observedOrder: rows.map(r => r.id), equalModeOrderUnspecified: ties,
    scope: 'forced_configuration_same_observed_order_synthetic_nominals_no_matching_or_historical_posting_replay', cases }
}

export async function runAudit(client, config, emit, allocator, amounts, { verify = discoverTarget, reverify = verifyDatabase } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    if ((await client.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0]?.mode !== 'on') throw new Error('read_only_required')
    const target = await verify(client, config)
    const schema = (await client.query(SCHEMA_SQL)).rows
    if (schema.length !== 1 || !schema[0].is_real || !schema[0].not_null) throw new Error('unexpected_amount_schema')
    const rows = (await client.query(RULE_SQL)).rows
    const counts = Object.fromEntries(['fixed', 'percentage', 'null_flag_fixed'].map(mode => [mode,
      { total: 0, numeric: 0, null: 0, negative: 0, zero: 0, moreThanTwoDecimals: 0, pgChangesValue: 0, outOfRange: 0, policyDisagreement: 0, invalid: 0 }]))
    const configurations = new Map(), ids = new Set()
    for (const row of rows) {
      if (ids.has(row.id)) throw new Error('duplicate_rule_identity')
      ids.add(row.id)
      const finding = inspectRule(row), count = counts[finding.mode]
      count.total++; count.numeric += Number(typeof row.amount === 'number' && Number.isFinite(row.amount))
      count.null += Number(row.amount === null); count.invalid += Number(finding.errors.length > 0)
      for (const key of ['negative', 'zero', 'moreThanTwoDecimals', 'pgChangesValue', 'outOfRange', 'policyDisagreement']) count[key] += Number(finding[key] === true)
      await emit({ kind: 'rule', ...finding })
      if (!configurations.has(row.auto_assignment_id)) configurations.set(row.auto_assignment_id, [])
      configurations.get(row.auto_assignment_id).push(row)
    }
    let changedCases = 0, notCompared = 0
    for (const [assignmentId, rules] of configurations) {
      const result = await compareAllocations(rules, allocator, amounts)
      changedCases += result.cases?.filter(c => c.changed).length ?? 0
      notCompared += Number(result.status !== 'compared')
      await emit({ kind: 'configuration', assignmentId, budgetId: rules[0].budget_id, ...result })
    }
    await reverify(client, config, target); await client.query('ROLLBACK')
    return { target: target.database, readOnly: true, records: rows.length, counts, configurations: configurations.size,
      changedCases, notCompared, hypotheticalOnly: true, sourceSha256: allocator.sourceSha256, methodSha256: allocator.methodSha256 }
  } catch (error) { try { await client.query('ROLLBACK') } catch { /* Preserve original failure. */ } throw error }
}

export function argumentsFor(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    env: { type: 'string', default: '.env' }, database: { type: 'string' }, 'output-parent': { type: 'string' },
    amount: { type: 'string', multiple: true }, 'print-sql': { type: 'boolean' },
  } })
  if (!values['print-sql'] && !/^[a-zA-Z0-9_]+$/.test(values.database ?? '')) throw new Error('explicit_database_required')
  if (values.amount?.some(v => !/^-?\d+(?:\.\d+)?$/.test(v) || !Number.isFinite(Number(v)) || !Number.isSafeInteger(Math.round(Number(v) * 100)))) throw new Error('invalid_scenario_amount')
  return values
}
export async function main(args = process.argv.slice(2)) {
  let client, file, timer
  try {
    const options = argumentsFor(args)
    if (options['print-sql']) { console.log(SCHEMA_SQL + ';\n' + RULE_SQL); return }
    const parent = resolve(options['output-parent'] ?? 'script-output')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const output = await mkdtemp(join(parent, 'auto-assignment-audit-')); console.log(output)
    const config = await configuration(options.env, {}, options.database); verifyConnectionConfiguration(config)
    const allocator = await loadAllocator()
    const { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      connectionTimeoutMillis: 10000, ssl: false, application_name: 'spendcraft_auto_assignment_precision_audit',
      options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=600000 -c search_path=pg_catalog,public' })
    client.on('error', () => undefined)
    timer = globalThis.setTimeout(() => { client.end().catch(() => undefined) }, 300000)
    await client.connect()
    file = await open(join(output, 'findings.jsonl'), 'wx', 0o600)
    const result = await runAudit(client, config, f => file.writeFile(JSON.stringify(f) + '\n'), allocator,
      [...DEFAULT_AMOUNTS, ...(options.amount ?? []).map(Number)])
    await file.sync()
    const summary = await open(join(output, 'summary.json'), 'wx', 0o600)
    try { await summary.writeFile(JSON.stringify({ status: 'complete', ...result }, null, 2) + '\n'); await summary.sync() } finally { await summary.close() }
    console.log(JSON.stringify(result))
  } catch {
    console.error('INCOMPLETE auto-assignment audit; preserve private evidence. No database changes attempted.')
    process.exitCode = 1
  } finally { globalThis.clearTimeout(timer); await file?.close(); await client?.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
