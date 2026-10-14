# Production recurrence prerequisite check

Operator-only, read-only check. Codex does not run this against any database. Requires Node and installed `pg`, with auditRecurrence.mjs and auditLegacyMoney.mjs beside each other in scripts/. No application boot, ordinary .env or ORM.

Run on the production server using the previously observed target as explicit operator input:

```sh
SPENDCRAFT_AUDIT_SOCKET_DIR=/run/postgresql \
SPENDCRAFT_AUDIT_PORT=5433 \
node scripts/auditRecurrence.mjs --database budget --execute
```

Database/socket/port are not production constants in code. Operating-system user is the default database role; optional SPENDCRAFT_AUDIT_USER and SPENDCRAFT_AUDIT_PASSWORD use the existing dedicated mechanism. Never put credentials in a shared command/report. No remote TCP fallback. Set SPENDCRAFT_AUDIT_OUTPUT_DIR to a new directory if desired; existing directories are refused.

The shared runner verifies live database and server port against operator settings before reading application rows. It requests default_transaction_read_only=on, verifies it, starts READ ONLY / REPEATABLE READ, verifies both settings, uses fixed SELECTs, then commits, checks idle/read connectivity and closes. Failures roll back/close defensively. Defaults: statement 60 seconds, lock 3 seconds, overall 5 minutes, idle transaction 30 seconds and row ceiling 100,000. Existing SPENDCRAFT_AUDIT_* timeout/ceiling overrides apply. Row ceiling or schema/query failure means incomplete, never compatible.

Output: private 0700 directory, 0600 report.json and summary.md; sanitized target, schema, completion checks, total/min/max, below-1/above-360/noninteger/NULL counts and only IDs/recurrence for incompatible rows. No names, descriptions, credentials or unrelated data. Existing shared runner also reads its fixed minimal schema metadata, not other application rows. Offline --print-sql prints the recurrence SELECTs; tests cover the shared verification/cleanup behavior.

Exit 0: COMPATIBLE snapshot; exit 1: INCOMPATIBLE with rows requiring deliberate remediation; exit 2: safety/configuration failure; exit 3: runtime/schema/incomplete/output failure. Any failure means do not proceed; discard partially written reports. No automatic repair. This check does not establish migration bookkeeping or authorize migration execution. Recheck near deployment; writes after this snapshot can change the precondition.

## Exact constraint and schema

Migration 1792000000000_categories_recurrence_range_check.ts adds CHECK (recurrence BETWEEN 1 AND 360). Category recurrence is already integer NOT NULL from migration 1699460928824_categories.ts. Integrality and non-nullability come from that existing schema, not from the new CHECK. CHECK alone accepts SQL NULL and does not reject in-range fractional numbers on a hypothetical decimal column. The script explicitly verifies the expected integer NOT NULL schema; schema drift produces INCOMPLETE rather than inventing a stricter constraint. Noninteger/NULL counts are diagnostic and expected zero. The incompatible-row predicate is exactly `(recurrence BETWEEN 1 AND 360) IS FALSE`. All Categories are included.

## Migration lock review — no migration change made

Knex table.check emits a normal ALTER TABLE ADD CONSTRAINT CHECK with no NOT VALID clause: addition and validation occur in one statement. It takes ACCESS EXCLUSIVE, validates existing rows by scanning them, and keeps its lock through transaction completion. Reads and writes can be blocked; lock acquisition can also wait behind existing transactions. Compatible data does not eliminate that lock risk.

PostgreSQL's [ALTER TABLE documentation](https://www.postgresql.org/docs/current/sql-altertable.html) explains the NOT VALID alternative: add the CHECK with a brief ACCESS EXCLUSIVE lock without the historical scan, commit, then VALIDATE CONSTRAINT in a separate transaction using SHARE UPDATE EXCLUSIVE. The validation scan still occurs but ordinary reads/writes can continue. New/updated rows are checked even before validation. Long-running transactions can still delay initial lock acquisition.

Do not put both commands in the same transaction: the stronger lock from addition remains held, negating the concurrency benefit. A two-phase form needs separate committed migration/deployment steps and verification of convalidated. Invalid data can leave an unvalidated constraint enforcing new writes; remediate deliberately, not automatically. Down should drop only the named constraint.

Recommendation: no unconditional migration rewrite is justified without the Category count and maintenance requirements. For a small Category table during the installer’s already-stopped-process maintenance window, retain the simple validated migration after a clean check and reviewed lock timeout/window. If deployment must remain live or the scan/lock window is unacceptable, revise to separate committed NOT VALID/add and VALIDATE steps before deployment. This is a deployment-design decision, not a data-compatibility conclusion. Do not alter an already-applied migration without first establishing actual migration bookkeeping. The script intentionally does not query bookkeeping.
