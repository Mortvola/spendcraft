// Read-only analysis of the approved two-decimal policy. Importing does not connect.
import process from 'node:process'
import console from 'node:console'
import { isDeepStrictEqual } from 'node:util'
import { mkdir, mkdtemp, open, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { Exception } from '@adonisjs/core/exceptions'
import { configuration } from './auditTransactionCategoryCents.mjs'
import { inspectAmount } from './auditTransactionTaxPrecision.mjs'
import { argumentsFor } from './auditStatementIncomePrecision.mjs'
import { discoverTarget, verifyDatabase, verifyConnectionConfiguration } from './lib/historicalCategoryConversion.mjs'

export { argumentsFor }
export const FIELDS = ['categories.funding_categories[].amount', 'transactions.categories[].baseAmount',
  'transactions.categories[].fundingCategories[].amount']
const arraySql = expression => `CASE WHEN jsonb_typeof(${expression})='array' THEN ${expression} ELSE '[]'::jsonb END`
export const PAGE_SQL = {
  category: `SELECT c.id, g.application_id AS budget_id, c.type, c.funding_categories::text AS payload_text,
    COALESCE((SELECT jsonb_agg((e.value->'amount')::text ORDER BY e.ordinality)
      FROM jsonb_array_elements(${arraySql('c.funding_categories')}) WITH ORDINALITY e(value,ordinality)), '[]'::jsonb)::text AS amount_tokens
    FROM public.categories c LEFT JOIN public.groups g ON g.id=c.group_id
    WHERE c.id>$1 AND c.type IS DISTINCT FROM 'LOAN' ORDER BY c.id LIMIT $2`,
  transaction: `SELECT t.id, t.application_id AS budget_id, t.type, t.deleted, t.date::text, t.categories::text AS payload_text,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('baseAmount',(e.value->'baseAmount')::text,
      'fundingCategories',COALESCE((SELECT jsonb_agg((f.value->'amount')::text ORDER BY f.ordinality)
        FROM jsonb_array_elements(${arraySql("e.value->'fundingCategories'")}) WITH ORDINALITY f(value,ordinality)), '[]'::jsonb)) ORDER BY e.ordinality)
      FROM jsonb_array_elements(${arraySql('t.categories')}) WITH ORDINALITY e(value,ordinality)), '[]'::jsonb)::text AS amount_tokens
    FROM public.transactions t WHERE t.id>$1
    AND NOT EXISTS (SELECT 1 FROM public.account_transactions a JOIN public.accounts c ON c.id=a.account_id
      WHERE a.transaction_id=t.id AND c.type='loan')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'
      THEN t.categories ELSE '[]'::jsonb END) e JOIN public.categories c ON e->>'categoryId'=c.id::text WHERE c.type='LOAN')
    ORDER BY t.id LIMIT $2`,
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const sourceFields = source => source === 'category' ? [FIELDS[0]] : FIELDS.slice(1)

export function inspectLeaf(value, present = true, storedToken) {
  if (!present) return { kind: 'missing', status: 'missing' }
  if (value === null) return { kind: 'null', status: 'null' }
  const result = inspectAmount(value, storedToken)
  if (result.kind === 'string' && result.status === 'valid' && !result.canonicalString) {
    return { ...result, status: 'unsupported', reason: 'noncanonical_string' }
  }
  return result
}

export function inspectRow(source, row) {
  if (!['category', 'transaction'].includes(source)) throw new Error('invalid_audit_source')
  const finding = { source, id: row.id, budgetId: row.budget_id, type: row.type, deleted: row.deleted === true,
    date: row.date, rawJson: row.payload_text, entries: [], containers: [], issues: [],
    percentageRules: 0, legacyFixedModes: 0 }
  let payload
  try { payload = row.payload_text === null ? null : JSON.parse(row.payload_text) }
  catch { finding.issues.push('invalid_or_missing_json') }
  const tokens = row.amount_tokens === undefined ? undefined : JSON.parse(row.amount_tokens)
  if (tokens !== undefined && (!Array.isArray(tokens) || Array.isArray(payload) && tokens.length !== payload.length)) throw new Error('amount_token_count_mismatch')
  const container = (field, value, present = true) => {
    const shape = !present ? 'missing' : value === null ? 'null' : Array.isArray(value)
      ? value.length ? 'array' : 'empty' : 'unsupported'
    finding.containers.push({ field, shape })
    if (shape === 'unsupported') finding.issues.push('non_array:' + field)
    return Array.isArray(value) ? value : []
  }
  const leaf = (field, path, item, token, mode) => {
    const precision = inspectLeaf(item.amount, Object.hasOwn(item, 'amount'), token ?? undefined)
    finding.entries.push({ field, path, mode,
      modeFlagPresent: Object.hasOwn(item, 'percentage'), modeFlag: item.percentage,
      unit: mode === 'percentage' ? 'percentage_points' : ['legacy', 'ambiguous'].includes(mode) ? 'unknown' : 'dollars',
      ...precision, storedToken: token,
      conversionCandidate: precision.kind === 'number' && precision.status === 'valid' && ['fixed', 'percentage'].includes(mode),
      difference: precision.differenceCents === undefined ? undefined : Number(precision.differenceCents) / 100 })
  }
  const rules = (field, list, prefix, present = true, amountTokens) => {
    if (amountTokens !== undefined && (!Array.isArray(amountTokens) || Array.isArray(list) && amountTokens.length !== list.length)) throw new Error('amount_token_count_mismatch')
    for (const [index, rule] of container(field, list, present).entries()) {
      if (!object(rule)) { finding.issues.push('non_object_rule:' + prefix.join('.') + '.' + index); continue }
      const mode = rule.percentage === true ? 'percentage' : rule.percentage === false ? 'fixed'
        : rule.percentage === null || rule.percentage === undefined ? 'legacy' : 'ambiguous'
      if (mode === 'percentage') finding.percentageRules++
      if (mode === 'legacy') finding.legacyFixedModes++
      if (mode === 'ambiguous') finding.issues.push('unsupported_mode:' + prefix.join('.') + '.' + index)
      leaf(field, [...prefix, index, 'amount'], rule, amountTokens?.[index], mode)
    }
  }
  if (row.payload_text === null) {
    for (const field of sourceFields(source)) finding.containers.push({ field, shape: 'sql_null' })
  } else if (source === 'category') rules(FIELDS[0], payload, [], true, tokens)
  else {
    for (const [index, split] of container(FIELDS[1], payload).entries()) {
      if (!object(split)) { finding.issues.push('non_object_split:' + index); continue }
      finding.entries.push({ field: FIELDS[1], path: [index, 'baseAmount'], mode: 'base', unit: 'dollars',
        ...inspectLeaf(split.baseAmount, Object.hasOwn(split, 'baseAmount'), tokens?.[index]?.baseAmount ?? undefined) })
      rules(FIELDS[2], split.fundingCategories, [index, 'fundingCategories'], Object.hasOwn(split, 'fundingCategories'), tokens?.[index]?.fundingCategories)
    }
  }
  if (!Number.isSafeInteger(row.budget_id) || row.budget_id < 1) finding.issues.push('budget_ownership_unavailable')
  const proposed = globalThis.structuredClone(payload)
  for (const entry of finding.entries) {
    if (entry.kind !== 'number' || entry.status !== 'valid' || ['legacy', 'ambiguous'].includes(entry.mode)) continue
    let parent = proposed
    for (const key of entry.path.slice(0, -1)) parent = parent[key]
    // Numeric hypothesis only; no encoding/write. Existing strings stay untouched.
    parent[entry.path.at(-1)] = Number(entry.proposedAmount)
  }
  return { finding, payload, proposed }
}

export function newSummary() {
  return { categoriesExamined: 0, transactionsExamined: 0, recordsWithIssues: 0,
    percentageRules: 0, legacyFixedModes: 0,
    fields: Object.fromEntries(FIELDS.map(field => [field, { recordsExamined: 0, recordsContaining: 0,
      recordsWithoutLeaf: 0, mixedRecords: 0, containers: {}, modes: {}, present: 0, numeric: 0, strings: 0,
      canonicalStrings: 0, missing: 0, null: 0, malformedOrUnsupported: 0, unsafe: 0,
      fractionalCents: 0, exceedsTwoDecimalPlaces: 0, conversionCandidates: 0,
      hypotheticalChanges: 0, sourceToNumberChanges: 0, positive: 0, negative: 0, zero: 0 }])) }
}

export function accumulate(summary, finding) {
  summary[finding.source === 'category' ? 'categoriesExamined' : 'transactionsExamined']++
  summary.recordsWithIssues += Number(finding.issues.length > 0 || finding.entries.some(e => ['malformed', 'unsupported'].includes(e.status)))
  summary.percentageRules += finding.percentageRules
  summary.legacyFixedModes += finding.legacyFixedModes
  for (const field of sourceFields(finding.source)) {
    const total = summary.fields[field], allEntries = finding.entries.filter(e => e.field === field)
    for (const mode of ['total', ...(field === FIELDS[1] ? ['base'] : ['fixed', 'percentage', 'legacy', 'ambiguous'])]) {
      const count = mode === 'total' ? total : (total.modes[mode] ??= {
        ...newSummary().fields[field], modes: undefined,
        maxAbsoluteDifference: 0, aggregateDifference: 0, aggregateAbsoluteDifference: 0,
        unit: mode === 'percentage' ? 'percentage_points' : ['legacy', 'ambiguous'].includes(mode) ? 'unknown' : 'dollars',
      })
      const entries = mode === 'total' ? allEntries : allEntries.filter(e => e.mode === mode)
      count.recordsExamined++
      count.recordsContaining += Number(entries.some(e => e.kind !== 'missing'))
      count.recordsWithoutLeaf += Number(!entries.some(e => e.kind !== 'missing'))
      count.mixedRecords += Number(entries.some(e => e.kind === 'number') && entries.some(e => e.kind === 'string'))
      for (const item of finding.containers.filter(c => c.field === field)) count.containers[item.shape] = (count.containers[item.shape] ?? 0) + 1
      for (const entry of entries) {
        count.present += Number(entry.kind !== 'missing')
        count.numeric += Number(entry.kind === 'number'); count.strings += Number(entry.kind === 'string')
        count.canonicalStrings += Number(entry.canonicalString === true)
        count.missing += Number(entry.kind === 'missing'); count.null += Number(entry.kind === 'null')
        count.malformedOrUnsupported += Number(['malformed', 'unsupported'].includes(entry.status))
        count.unsafe += Number(/unsafe|nonfinite|cannot_preserve_cents/.test(entry.reason ?? ''))
        count.fractionalCents += Number(entry.fractionalCents === true)
        count.exceedsTwoDecimalPlaces += Number(entry.fractionalCents === true)
        count.conversionCandidates += Number(entry.kind === 'number' && entry.status === 'valid'
          && !['legacy', 'ambiguous'].includes(entry.mode))
        // Aggregate units only within a mode; never add dollars and percentage points.
        if (mode !== 'total' && entry.differenceCents !== undefined) {
          const difference = Number(entry.differenceCents) / 100
          count.maxAbsoluteDifference = Math.max(count.maxAbsoluteDifference, Math.abs(difference))
          count.aggregateDifference += difference
          count.aggregateAbsoluteDifference += Math.abs(difference)
        }
        count.hypotheticalChanges += Number(entry.changed === true)
        count.sourceToNumberChanges += Number(entry.sourceToNumberChanged === true)
        if (entry.status === 'valid') {
          const value = Number(entry.kind === 'string' ? JSON.parse(entry.originalToken) : entry.originalToken)
          count.positive += Number(value > 0); count.negative += Number(value < 0); count.zero += Number(value === 0)
        }
      }
    }
  }
}

export async function loadFunding() {
  const source = await readFile(new URL('../client-src/Funding/calculateFunding.ts', import.meta.url), 'utf8')
  const marker = 'fundingAmount += categoryAmount - percentSum;'
  if (source.split(marker).length !== 2) throw new Error('funding_observation_boundary_changed')
  const observed = source.replace(marker, `residuals.push({ categoryAmount, percentSum, before: fundingAmount });
    ${marker} residuals.push({ after: fundingAmount });`)
  const compiled = ts.transpileModule(observed, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const exports = {}, residuals = []
  runInNewContext(compiled, { exports, residuals }, { timeout: 1000 })
  // Use the existing posting validator; never invent a funding conservation rule.
  const codecSource = await readFile(new URL('../app/services/categoryAmountCodec.ts', import.meta.url), 'utf8')
  const codec = {}
  runInNewContext(ts.transpileModule(codecSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: codec, require(name) {
    if (name !== '@adonisjs/core/exceptions') throw new Error('unexpected_codec_dependency')
    return { Exception }
  } }, { timeout: 1000 })
  return { sourceSha256: createHash('sha256').update(source).digest('hex'),
    validatorSha256: createHash('sha256').update(codecSource).digest('hex'),
    execute(name, ...args) {
      residuals.length = 0
      const result = name === 'spread' ? [...exports.computeSpread(...args)] : exports.calculateFunding(...args)
      let invariant, totalCents, centAllocations, categoryEffects
      try {
        centAllocations = name === 'spread' ? result : result.map(r => [r.categoryId, codec.categoryAmountCents(r.amount)])
        totalCents = codec.checkedCentSum(centAllocations.map(r => r[1]))
        if (name !== 'spread') categoryEffects = [...new Set(result.map(r => r.categoryId))]
          .map(categoryId => ({ categoryId, amount: exports.fundingCategoryEffect(result, categoryId) }))
        if (name !== 'spread') codec.validateCategoryConservation(2, result, undefined, args[1])
        invariant = { accepted: true }
      } catch (error) { invariant = { accepted: false, reason: error.message } }
      return globalThis.structuredClone({ result, residuals, totalCents, centAllocations, categoryEffects, invariant })
    } }
}

function validRules(rules) {
  return Array.isArray(rules) && rules.every(r => object(r) && Number.isSafeInteger(r.categoryId) && r.categoryId > 0
    && [true, false, undefined, null].includes(r.percentage)
    && (typeof r.amount === 'number' && Number.isFinite(r.amount) && Number.isSafeInteger(Math.round(r.amount * 100))
      || typeof r.amount === 'string' && inspectLeaf(r.amount).status === 'valid'))
}

export function compareImpact(source, row, inspected, funding, poolId) {
  const { finding, payload, proposed } = inspected
  if (finding.legacyFixedModes) return { status: 'not_compared', reason: 'legacy_mode_requires_review' }
  const roundedInputs = finding.entries.filter(e => e.kind === 'number' && e.status === 'valid')
    .map(e => ({ path: e.path, mode: e.mode, unit: e.unit, originalToken: e.originalToken,
      proposedAmount: e.proposedAmount, changed: e.changed }))
  if (finding.issues.length || finding.entries.some(e => ['malformed', 'unsupported'].includes(e.status))) {
    return { status: 'not_compared', reason: 'unsupported_values_or_shape' }
  }
  if (finding.entries.some(e => e.sourceToNumberChanged)) return { status: 'not_compared', reason: 'source_to_number_precision_loss' }
  if (source === 'category') {
    if (!validRules(payload)) return { status: 'not_compared', reason: 'unsupported_rule_inputs' }
    return { status: 'compared', roundedInputs, scope: 'actual_computeSpread_sensitivity_not_goal_or_history_replay',
      cases: [0, 0.01, -0.01, 1, 100].map(nominal => {
        const before = funding.execute('spread', nominal, payload), after = funding.execute('spread', nominal, proposed)
        return { nominal, before, after, changed: !isDeepStrictEqual(before, after) }
      }) }
  }
  if (row.type !== 2) return { status: 'not_compared', reason: 'not_type_2_funding_snapshot' }
  if (!Number.isSafeInteger(poolId)) return { status: 'not_compared', reason: 'unique_budget_funding_pool_unavailable' }
  const inputs = data => {
    if (!Array.isArray(data)) return null
    const result = {}
    for (const split of data) {
      if (!object(split) || ![true, false, undefined].includes(split.funder)) return null
      if (split.funder) continue
      if (!Number.isSafeInteger(split.categoryId) || split.categoryId < 1 || Object.hasOwn(result, split.categoryId)
        || !Object.hasOwn(split, 'baseAmount') || inspectLeaf(split.baseAmount).status !== 'valid'
        || !validRules(split.fundingCategories) || ![true, false, undefined, null].includes(split.includeFundingTransfers)) return null
      result[split.categoryId] = { baseAmount: split.baseAmount, fundingCategories: split.fundingCategories,
        includeFundingTransfers: split.includeFundingTransfers ?? false }
    }
    return result
  }
  const originalInputs = inputs(payload), proposedInputs = inputs(proposed)
  if (!originalInputs || !proposedInputs) return { status: 'not_compared', reason: 'incomplete_or_duplicate_snapshot_requires_dialog_category_tree_context' }
  const before = funding.execute('funding', originalInputs, poolId), after = funding.execute('funding', proposedInputs, poolId)
  return { status: 'compared', scope: 'actual_calculateFunding_complete_saved_inputs_only_not_full_dialog_or_balance_reconstruction',
    deleted: row.deleted === true, roundedInputs, before, after, changed: !isDeepStrictEqual(before, after),
    postedAmountsChanged: !isDeepStrictEqual(before.result.map(r => [r.categoryId, r.amount]), after.result.map(r => [r.categoryId, r.amount])),
    centAllocationsChanged: !isDeepStrictEqual(before.centAllocations, after.centAllocations),
    limits: 'No category-tree fallback, additional zero-input rows, SQL previousBaseAmount aggregation, goal proposal or historical posting replay.' }
}

export async function runAudit(client, config, emit, funding, { verify = discoverTarget, reverify = verifyDatabase } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    if ((await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only !== 'on') throw new Error('read_only_required')
    const target = await verify(client, config), summary = newSummary(), pools = new Map()
    for (const source of ['category', 'transaction']) {
      let after = 0
      for (;;) {
        const { rows } = await client.query(PAGE_SQL[source], [after, 100])
        if (!rows.length) break
        for (const row of rows) {
          if (!Number.isSafeInteger(row.id) || row.id <= after) throw new Error('invalid_page_progress')
          after = row.id
          if (source === 'category' && row.type === 'FUNDING POOL') {
            const ids = pools.get(row.budget_id) ?? []; ids.push(row.id); pools.set(row.budget_id, ids)
          }
          const inspected = inspectRow(source, row)
          accumulate(summary, inspected.finding)
          const ids = pools.get(row.budget_id) ?? []
          const impact = compareImpact(source, row, inspected, funding, ids.length === 1 ? ids[0] : undefined)
          await emit({ ...inspected.finding, impact })
        }
      }
    }
    await reverify(client, config, target)
    await client.query('ROLLBACK')
    return { target: target.database, ...summary, sourceSha256: funding.sourceSha256,
      validatorSha256: funding.validatorSha256, hypotheticalPolicyOnly: true,
      fullReconstructedBalances: 'not_compared_requires_historical_context_and_posting_authority',
      previousBaseAmountSqlSums: 'not_compared_requires_separately_authorized_existing_SQL_comparison' }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* Retain evidence; no writes. */ }
    throw error
  }
}

export async function main(args = process.argv.slice(2)) {
  let client, details, timer
  try {
    const options = argumentsFor(args)
    if (options['print-sql']) { console.log(Object.values(PAGE_SQL).join(';\n')); return }
    const parent = resolve(options['output-parent'] ?? 'script-output')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const output = await mkdtemp(join(parent, 'funding-precision-audit-'))
    console.log(output) // Before configuration or database work.
    const config = await configuration(options.env, {}, options.database)
    verifyConnectionConfiguration(config)
    const funding = await loadFunding(), { default: pg } = await import('pg')
    client = new pg.Client({ host: config.host, port: config.port, database: config.database, user: config.user,
      password: config.password, ssl: false, connectionTimeoutMillis: 10000,
      application_name: 'spendcraft_funding_precision_audit',
      options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=60000' })
    client.on('error', () => undefined)
    timer = globalThis.setTimeout(() => { client.end().catch(() => undefined) }, 300000)
    await client.connect()
    details = await open(join(output, 'records.jsonl'), 'wx', 0o600)
    const result = await runAudit(client, config, f => details.writeFile(JSON.stringify(f) + '\n'), funding)
    await details.sync()
    const summary = await open(join(output, 'summary.json'), 'wx', 0o600)
    try { await summary.writeFile(JSON.stringify({ status: 'complete', readOnly: true, ...result }, null, 2) + '\n'); await summary.sync() }
    finally { await summary.close() }
    console.log(JSON.stringify({ categoriesExamined: result.categoriesExamined, transactionsExamined: result.transactionsExamined, fields: result.fields }))
  } catch {
    console.error('INCOMPLETE funding precision audit; preserve private evidence. No database changes were attempted.')
    process.exitCode = 1
  } finally {
    globalThis.clearTimeout(timer)
    try { await details?.close() } catch { /* Preserve partial evidence. */ }
    try { await client?.end() } catch { /* Read-only connection. */ }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
