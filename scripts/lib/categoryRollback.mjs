// Release-specific operator tooling. Importing this file has no side effects.
import { createHash } from 'node:crypto'

const maximumCents = BigInt(Number.MAX_SAFE_INTEGER)
export const supportedTypes = [0, 2, 3, 4, 5]

export function numericAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) {
      throw new Error('invalid_numeric_amount')
    }
    return value // Already numeric: never normalize or round it.
  }
  if (typeof value !== 'string' || value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error('invalid_decimal_amount')
  }
  const negative = value.startsWith('-')
  const [whole, fraction] = value.replace(/^-/, '').split('.')
  const cents = (BigInt(whole) * 100n + BigInt(fraction)) * (negative ? -1n : 1n)
  if (cents > maximumCents || cents < -maximumCents) throw new Error('unsafe_amount_cents')
  const number = Number(value)
  // This is a representability check, not a second financial rounding operation.
  if (!Number.isFinite(number) || BigInt(Math.round(number * 100)) !== cents) {
    throw new Error('numeric_cent_roundtrip_failed')
  }
  // Verify the JSON token too: at the safe-integer limit a JS number can round-trip
  // through Math.round while JSON.stringify emits a different decimal cent value.
  const token = JSON.stringify(number)
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(token)) throw new Error('json_cent_roundtrip_failed')
  const [tokenWhole, tokenFraction = ''] = token.replace(/^-/, '').split('.')
  const tokenCents = (BigInt(tokenWhole) * 100n + BigInt(tokenFraction.padEnd(2, '0'))) * (token.startsWith('-') ? -1n : 1n)
  if (tokenCents !== cents) throw new Error('json_cent_roundtrip_failed')
  return number === 0 ? 0 : number
}

export function planAllocations(categories) {
  if (!Array.isArray(categories)) throw new Error('categories_not_array')
  const patches = []
  let numeric = 0
  categories.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !Number.isSafeInteger(entry.categoryId) || entry.categoryId <= 0 || !Object.hasOwn(entry, 'amount')) {
      throw new Error('invalid_allocation_shape')
    }
    const value = numericAmount(entry.amount)
    if (typeof entry.amount === 'string') patches.push({ index, value })
    else numeric++
  })
  return { patches, numeric }
}

export const PAGE_SQL = `SELECT t.id::text, t.type, t.categories::text AS categories_text,
  (SELECT count(*)::integer FROM public.account_transactions at WHERE at.transaction_id=t.id) AS links,
  (SELECT count(*)::integer FROM public.account_transactions at
    JOIN public.accounts a ON a.id=at.account_id
    JOIN public.institutions i ON i.id=a.institution_id
    WHERE at.transaction_id=t.id AND i.application_id=t.application_id AND a.type<>'loan') AS own_links,
  (EXISTS (SELECT 1 FROM public.account_transactions at JOIN public.accounts a ON a.id=at.account_id
      WHERE at.transaction_id=t.id AND a.type='loan')
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'
       THEN t.categories ELSE '[]'::jsonb END) e
       JOIN public.categories c ON CASE WHEN jsonb_typeof(e->'categoryId')='number'
         THEN (e->>'categoryId')::numeric=c.id ELSE e->>'categoryId'=c.id::text END
       WHERE c.type='LOAN')) AS deprecated
  FROM public.transactions t WHERE ($1::bigint IS NULL OR t.id > $1::bigint) ORDER BY t.id LIMIT 500`

export async function scan(client, onRow = async () => undefined) {
  const summary = { examined: 0, supported: 0, excluded: 0, numeric: 0, strings: 0,
    malformed: 0, unsupported: 0, affected: 0 }
  let last = null
  for (;;) {
    const { rows } = await client.query(PAGE_SQL, [last])
    if (!rows.length) break
    for (const row of rows) {
      if (!/^\d+$/.test(row.id) || (last !== null && BigInt(row.id) <= BigInt(last))) throw new Error('invalid_page_progress')
      last = row.id
      summary.examined++
      if (summary.examined > 100000) throw new Error('offline_dataset_limit_exceeded')
      if (row.deprecated || !supportedTypes.includes(row.type)) { summary.excluded++; continue }
      summary.supported++
      if ([2, 3].includes(row.type) ? row.links !== 0 : row.links !== 1 || row.own_links !== 1) {
        summary.unsupported++
        await onRow({ id: row.id, error: 'unsupported_allocation_ownership' })
        continue
      }
      let plan
      try {
        plan = planAllocations(JSON.parse(row.categories_text))
        if (plan.patches.length > 10000) throw new Error('allocation_limit_exceeded')
      } catch (error) {
        summary.malformed++
        await onRow({ id: row.id, error: /^[a-z_]+$/.test(error.message) ? error.message : 'invalid_category_json' })
        continue
      }
      summary.numeric += plan.numeric
      summary.strings += plan.patches.length
      if (summary.strings > 1000000) throw new Error('offline_patch_limit_exceeded')
      if (plan.patches.length) summary.affected++
      await onRow({ id: row.id, original: row.categories_text, ...plan })
    }
  }
  return summary
}

export function assertClean(summary) {
  if (summary.malformed || summary.unsupported) throw new Error('invalid_or_unsupported_records')
}

// The original JSON never passes through JS serialization. Only validated amount leaves do.
export function patchQuery(row) {
  if (!row.patches?.length) throw new Error('empty_patch')
  const indexes = new Set()
  for (const patch of row.patches) {
    if (!Number.isSafeInteger(patch.index) || patch.index < 0 || typeof patch.value !== 'number'
      || indexes.has(patch.index)) throw new Error('invalid_patch')
    numericAmount(patch.value)
    indexes.add(patch.index)
  }
  const values = [row.id, row.original, JSON.stringify(row.patches)]
  const expression = `(SELECT jsonb_agg(CASE WHEN p.index IS NULL THEN e.value
    ELSE jsonb_set(e.value, '{amount}', to_jsonb(p.value), false) END ORDER BY e.ordinality)
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY e(value,ordinality)
    LEFT JOIN jsonb_to_recordset($3::jsonb) AS p(index integer,value numeric) ON p.index=e.ordinality-1)`
  return { text: `UPDATE public.transactions SET categories=${expression}
    WHERE id=$1 AND categories::jsonb=$2::jsonb
    RETURNING id::text, categories::jsonb=${expression} AS verified`, values }
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`

export async function snapshot(client) {
  const tables = await client.query(`SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname='public' ORDER BY tablename`)
  const result = []
  for (const { tablename } of tables.rows) {
    // Ignore ONLY amount leaves on Transactions; verify converted leaves separately.
    const document = tablename === 'transactions' ? `(to_jsonb(t)-'categories') || jsonb_build_object('categories',
      CASE WHEN jsonb_typeof(t.categories)='array' THEN (SELECT COALESCE(jsonb_agg(
        CASE WHEN jsonb_typeof(e.value)='object' THEN e.value-'amount' ELSE e.value END ORDER BY e.ordinality), '[]'::jsonb)
        FROM jsonb_array_elements(t.categories) WITH ORDINALITY e(value,ordinality)) ELSE t.categories END)` : 'to_jsonb(t)'
    await client.query(`DECLARE rollback_snapshot NO SCROLL CURSOR FOR SELECT (${document})::text AS document
      FROM public.${quote(tablename)} t ORDER BY ${tablename === 'transactions' ? 't.id' : 't.ctid'}`)
    const hash = createHash('sha256')
    let count = 0
    for (;;) {
      const page = await client.query('FETCH 500 FROM rollback_snapshot')
      if (!page.rows.length) break
      for (const row of page.rows) { hash.update(row.document); hash.update('\n'); count++ }
    }
    await client.query('CLOSE rollback_snapshot')
    result.push({ table: tablename, count, sha256: hash.digest('hex') })
  }
  return result
}

export async function assertSchema(client) {
  const result = await client.query(`SELECT a.atttypid::regtype::text AS kind, c.relrowsecurity AS rls,
    EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal) AS triggers,
    EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid AND rw.rulename<>'_RETURN') AS rules
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relname='transactions' AND a.attname='categories' AND NOT a.attisdropped`)
  const row = result.rows[0]
  if (result.rows.length !== 1 || row.kind !== 'jsonb' || row.rls || row.triggers || row.rules) {
    throw new Error('unreviewed_transaction_schema_or_triggers')
  }
}

export async function convert(client, controls) {
  let commitAttempted = false
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  try {
    await client.query("SET LOCAL lock_timeout='5s'")
    await client.query("SET LOCAL statement_timeout='60s'")
    await controls.guard()
    await assertSchema(client)
    const initial = await scan(client, async (row) => {
      if (row.error) await controls.journal('record-rejected', { transactionId: row.id, reason: row.error })
    })
    assertClean(initial)
    const before = await snapshot(client)
    const conversion = await scan(client, async (row) => {
      if (!row.patches?.length) return
      await controls.guard()
      const query = patchQuery(row)
      const result = await client.query(query.text, query.values)
      if (result.rowCount !== 1 || result.rows[0].verified !== true) throw new Error('leaf_update_verification_failed')
    })
    if (JSON.stringify(initial) !== JSON.stringify(conversion)) throw new Error('preflight_changed')
    const after = await scan(client)
    assertClean(after)
    if (after.strings !== 0 || after.examined !== initial.examined || after.supported !== initial.supported
      || after.excluded !== initial.excluded || after.numeric !== initial.numeric + initial.strings) {
      throw new Error('post_conversion_verification_failed')
    }
    if (JSON.stringify(before) !== JSON.stringify(await snapshot(client))) throw new Error('unrelated_state_changed')
    await controls.guard()
    // A lost COMMIT response is never interpreted as rollback; durable journal requires manual recovery.
    await controls.journal('commit-pending', { initial, after, snapshots: before })
    commitAttempted = true
    await client.query('COMMIT')
    await controls.journal('converted', { initial, after, snapshots: before })
    return { initial, after }
  } catch (error) {
    if (!commitAttempted) await client.query('ROLLBACK')
    await controls.journal(commitAttempted ? 'commit-uncertain-or-postcommit-failure' : 'conversion-rolled-back', {})
    throw error
  }
}

export const WARNING = 'This operation will replace the current SpendCraft application release and convert Transaction Category amounts back to JSON numbers. It will preserve other database records but may make the database incompatible with the newer release.'

export async function swapDirectories(paths, operations) {
  const { live, previous, stage, retained, identities } = paths
  await operations.guard()
  if (await operations.identity(live) !== identities.current || await operations.identity(previous) !== identities.previous
    || await operations.identity(stage) !== identities.previous) throw new Error('release_changed_before_swap')
  if (await operations.exists(retained)) throw new Error('recovery_destination_exists')
  await operations.journal('swap-pending', { live, previous, stage, retained })
  await operations.rename(live, retained)
  await operations.sync()
  await operations.journal('current-release-retained', { retained })
  if (await operations.exists(live)) throw new Error('live_destination_reappeared')
  await operations.rename(stage, live)
  await operations.sync()
  if (await operations.identity(live) !== identities.previous) throw new Error('restored_release_mismatch')
  await operations.journal('previous-release-restored', { live, previous, retained })
}

export async function orchestrate(options, operations) {
  await operations.preflight()
  if (options.dryRun) return operations.inspect()
  await operations.inspect() // Report malformed IDs before confirmation or process shutdown; revalidate offline later.
  await operations.confirm(WARNING, options.confirmation)
  await operations.journal('execution-approved', {})
  let stopped = false
  try {
    // Set this before stop so even partial stop failures never automatically resume.
    stopped = true
    await operations.stop()
    await operations.journal('writers-stopped', {})
    await operations.backup()
    await operations.convert()
    await operations.swap()
    await operations.restart()
    await operations.smoke()
    await operations.journal('complete', {})
  } catch (error) {
    if (stopped) {
      try { await operations.stop() } catch { /* Keep the original failure; journal remains incomplete. */ }
    }
    throw error
  }
}
