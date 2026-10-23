-- STAGING SYNTHETIC DATA ONLY. Run with all application writers stopped.
-- This SQL uses the caller's existing connection; it does not select a server.
-- Expected staging database: spendcraft. Production database budget is rejected.
-- Run the complete script in one session. An error aborts the transaction.
BEGIN;

DO $$
DECLARE
  allocation jsonb;
  transaction_row record;
BEGIN
  IF current_database() <> 'spendcraft' THEN
    RAISE EXCEPTION 'Wrong database: expected staging database spendcraft';
  END IF;

  FOR transaction_row IN
    SELECT id, categories FROM transactions WHERE type IN (0, 2, 3, 4, 5) ORDER BY id
  LOOP
    IF jsonb_typeof(transaction_row.categories) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Transaction %: categories must be an array', transaction_row.id;
    END IF;
    FOR allocation IN SELECT value FROM jsonb_array_elements(transaction_row.categories)
    LOOP
      IF jsonb_typeof(allocation) IS DISTINCT FROM 'object'
        OR jsonb_typeof(allocation->'amount') IS NULL
        OR jsonb_typeof(allocation->'amount') NOT IN ('number', 'string') THEN
        RAISE EXCEPTION 'Transaction %: invalid allocation amount', transaction_row.id;
      END IF;
      IF jsonb_typeof(allocation->'amount') = 'string' THEN
        IF (allocation->>'amount') !~ '^-?(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
          RAISE EXCEPTION 'Transaction %: noncanonical amount string', transaction_row.id;
        END IF;
        IF abs((allocation->>'amount')::numeric * 100) > 9007199254740991 THEN
          RAISE EXCEPTION 'Transaction %: unsafe integer cents', transaction_row.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Existing numeric amounts and empty arrays are left untouched.
-- Explicit ordering retains duplicates and allocation positions.
WITH replacements AS (
  SELECT t.id, jsonb_agg(
    CASE WHEN jsonb_typeof(e.value->'amount') = 'string'
      THEN jsonb_set(e.value, '{amount}', to_jsonb((e.value->>'amount')::numeric), false)
      ELSE e.value END
    ORDER BY e.position
  ) AS categories
  FROM transactions t
  CROSS JOIN LATERAL jsonb_array_elements(t.categories) WITH ORDINALITY AS e(value, position)
  WHERE t.type IN (0, 2, 3, 4, 5)
  GROUP BY t.id
  HAVING bool_or(jsonb_typeof(e.value->'amount') = 'string')
)
UPDATE transactions t SET categories = r.categories
FROM replacements r WHERE t.id = r.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions t
    CROSS JOIN LATERAL jsonb_array_elements(t.categories) AS e(value)
    WHERE t.type IN (0, 2, 3, 4, 5)
      AND jsonb_typeof(e.value->'amount') = 'string'
  ) THEN
    RAISE EXCEPTION 'Verification failed: string amounts remain';
  END IF;
END $$;

COMMIT;
