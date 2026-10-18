// Read-only operator audit. Importing or --print-sql never connects.
import process from 'node:process'
import console from 'node:console'
import { pathToFileURL } from 'node:url'
import { configuration, collect, failureReason } from './auditLegacyMoney.mjs'

export const QUERIES = {
  counts: `WITH links AS (
    SELECT at.transaction_id, count(*) AS link_count, min(at.amount) AS movement,
      bool_or(a.type = 'loan') AS deprecated_account,
      bool_or(at.pending) AS pending
    FROM public.account_transactions at
    JOIN public.accounts a ON a.id = at.account_id
    GROUP BY at.transaction_id
  ), compared AS (
    SELECT t.deleted, COALESCE(l.pending, false) AS pending,
      COALESCE(l.link_count, 0) AS link_count,
      COALESCE(l.deprecated_account, false) AS deprecated_account,
      jsonb_typeof(t.categories) = 'array' AS valid_root,
      s.split_count, s.invalid_amounts, s.subcent_splits,
      s.exact_total, s.half_away_cents, s.half_positive_cents,
      l.movement
    FROM public.transactions t
    LEFT JOIN links l ON l.transaction_id = t.id
    CROSS JOIN LATERAL (
      SELECT count(*) AS split_count,
        count(*) FILTER (WHERE jsonb_typeof(entry->'amount') IS DISTINCT FROM 'number') AS invalid_amounts,
        count(*) FILTER (WHERE CASE WHEN jsonb_typeof(entry->'amount') = 'number'
          THEN (entry->>'amount')::numeric * 100 <> trunc((entry->>'amount')::numeric * 100)
          ELSE false END) AS subcent_splits,
        COALESCE(sum(CASE WHEN jsonb_typeof(entry->'amount') = 'number'
          THEN (entry->>'amount')::numeric END), 0) AS exact_total,
        COALESCE(sum(CASE WHEN jsonb_typeof(entry->'amount') = 'number'
          THEN round((entry->>'amount')::numeric * 100) END), 0) AS half_away_cents,
        COALESCE(sum(CASE WHEN jsonb_typeof(entry->'amount') = 'number'
          THEN floor((entry->>'amount')::numeric * 100 + 0.5) END), 0) AS half_positive_cents
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories) = 'array'
        THEN t.categories ELSE '[]'::jsonb END) AS entry
    ) s
    WHERE t.type IN (0, 5)
  ), classified AS (
    SELECT *, link_count = 1 AND movement IS NOT NULL
      AND valid_root IS TRUE AND invalid_amounts = 0 AS comparable
    FROM compared WHERE NOT deprecated_account
  )
  SELECT deleted, pending,
    count(*)::text AS ordinary_transactions,
    count(*) FILTER (WHERE comparable)::text AS comparable_transactions,
    count(*) FILTER (WHERE comparable AND split_count = 0)::text AS empty_split_transactions,
    count(*) FILTER (WHERE comparable AND subcent_splits > 0)::text AS transactions_with_subcent_splits,
    count(*) FILTER (WHERE comparable AND exact_total <> movement)::text AS exact_decimal_mismatches,
    count(*) FILTER (WHERE comparable AND half_away_cents <> round(movement * 100))::text AS rounded_half_away_mismatches,
    count(*) FILTER (WHERE comparable AND half_positive_cents <> floor(movement * 100 + 0.5))::text AS rounded_half_positive_mismatches,
    count(*) FILTER (WHERE link_count <> 1)::text AS unavailable_link_count,
    count(*) FILTER (WHERE valid_root IS NOT TRUE OR invalid_amounts > 0)::text AS malformed_split_transactions
  FROM classified GROUP BY deleted, pending ORDER BY deleted, pending`,
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--print-sql') {
    console.log(QUERIES.counts)
    return
  }
  if (args.length !== 3 || args[0] !== '--database' || !args[1] || args[2] !== '--execute') {
    console.error('Use --print-sql offline, or --database NAME --execute on the explicitly authorized production host.')
    process.exitCode = 2
    return
  }
  let phase = 'configuration'
  try {
    const config = configuration({ ...process.env, SPENDCRAFT_AUDIT_DATABASE: args[1] })
    const { Client } = await import('pg')
    phase = 'read-only split totals audit'
    const result = await collect(config, (options) => new Client(options),
      (target) => console.log(JSON.stringify({ verified_target: target })),
      { queries: QUERIES, classify: (rows) => ({ counts: rows.counts }) })
    // Counts and verified target only; no descriptions, IDs or raw financial rows.
    console.log(JSON.stringify({ target: result.target, mode: result.mode,
      counts: result.counts, completion: result.completion }, null, 2))
  } catch (error) {
    console.error(`INCOMPLETE: ${failureReason(error, phase)}`)
    process.exitCode = 3
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
