# Legacy recurrence assessment and constraint design

Design only. No production data has been inspected or repaired. The product domain is integer recurrence 1 through 360 months. Current HTTP writers enforce it.

## Read-only audit

Run only against an explicitly reviewed database target. Keep results restricted to the people deciding category corrections.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT c.id AS category_id, c.name AS category_name,
       g.application_id AS budget_id, c.type,
       c.recurrence, c.goal_date, c.funding_amount,
       c.use_goal, c.suspended, c.hidden
FROM categories AS c
LEFT JOIN groups AS g ON g.id = c.group_id
WHERE c.recurrence IS NULL OR c.recurrence NOT BETWEEN 1 AND 360
ORDER BY g.application_id, c.id;

SELECT recurrence, count(*) AS category_count
FROM categories
WHERE recurrence IS NULL OR recurrence NOT BETWEEN 1 AND 360
GROUP BY recurrence
ORDER BY recurrence NULLS FIRST;

COMMIT;
```

The LEFT JOIN keeps anomalous category/group associations visible. NULL is defensive audit coverage; the current column is NOT NULL. Names and funding settings are relevant to manual assessment; no users, credentials, or transaction descriptions are selected.

## Evidence and cleanup

Legacy funding-plan API number validation had no positive-integer/range restriction. Migration 1632664753840 added the integer recurrence column with default 1. Migration 1699460928824 copied legacy recurrence into categories without a domain check. Category and funding-item APIs could store out-of-domain integers until the current validator correction. Direct ORM and SQL writes still bypass API validation.

Category/funding settings updates do not record a recurrence change history. Transaction change logs describe transaction mutations, not successive category recurrence settings. Goal dates, funding amounts, and funding transactions do not uniquely determine a recurrence. Old funding-plan rows can corroborate a user's choice but may be stale or contain the same invalid value. No automatic repair rule is established.

## Recommended rollout

Keep validators in place. Audit first, obtain explicit corrections for each affected row, then add a validated constraint. If the audit is empty, proceed directly to reviewed constraint deployment. A preflight diagnostic can identify counts/IDs and improve a failed deployment message, but cannot substitute for the constraint or prevent races by itself.

Proposed eventual definition:

```sql
ALTER TABLE categories
ADD CONSTRAINT categories_recurrence_range_check
CHECK (recurrence BETWEEN 1 AND 360);
```

Keep the existing NOT NULL and integer column. Down drops only the named constraint and does not undo explicit data corrections. Use a new migration under Lucid's default runner transaction; do not edit historical migrations.

Knex exposes table.check(predicate, bindings, constraintName) for a normal CHECK. Explicit schema.raw SQL is the clear option for NOT VALID and later VALIDATE CONSTRAINT; the installed table.check signature has no NOT VALID argument.

## NOT VALID alternative

PostgreSQL documents that NOT VALID skips the initial historical-row scan, while INSERT and UPDATE enforce the constraint; later VALIDATE scans old rows. This can block even unrelated edits to a legacy invalid category. Category balance updates may therefore fail before users resolve recurrence. It does not repair existing calculation problems.

Reference: https://www.postgresql.org/docs/current/sql-altertable.html

Prepare installed-server verification with an isolated temporary-table test before recommending this alternative. The repository does not pin a PostgreSQL server version. No probe should alter real categories or migration bookkeeping.

## Selected constraint migration

The reviewed read-only sandbox audit found 62 Categories, minimum recurrence 1, maximum 12, and zero NULL/out-of-range values. This establishes the audited sandbox precondition only; other deployment databases still require their own audit.

The selected new migration adds the normal validated categories_recurrence_range_check enforcing recurrence BETWEEN 1 AND 360 using Knex table.check. Down uses table.dropChecks to remove only that constraint. No automatic cleanup or column change is included. Invalid existing data intentionally causes migration failure.
