# Manual production monetary audit

This is an operator-only script, not application runtime code. Codex must not connect to production. Development/validation of this script is offline only.

## Local production-server connection

Run this manually on the database server using an operating-system user permitted by PostgreSQL local authentication:

```sh
node scripts/auditLegacyMoney.mjs --database budget --execute
```

Only the database name is required. The script uses the local Unix socket directory `/var/run/postgresql`, port 5432, and the current OS username. It creates a new timestamped `money-audit-*` directory in the working directory. Neither spendcraft-env nor application .env nor ordinary PG_* environment variables are loaded. The explicit database argument is verified against live current_database() before application rows are read.

Optional audit-specific settings: SPENDCRAFT_AUDIT_SOCKET_DIR (absolute local socket directory only), SPENDCRAFT_AUDIT_PORT, SPENDCRAFT_AUDIT_USER, SPENDCRAFT_AUDIT_PASSWORD if local authentication needs it, and SPENDCRAFT_AUDIT_OUTPUT_DIR. Supply credentials securely; do not share them with reports. Remote TCP connections are not supported in this local-server mode. TLS is unnecessary for the Unix socket and is disabled for this transport only.

The script verifies the server's configured port (inet_server_port is null on Unix sockets), default read-only setting and live database. All application reads run in one verified READ ONLY, REPEATABLE READ transaction. Fixed SELECT-only SQL, normal COMMIT/ROLLBACK, idle verification and connection cleanup remain unchanged. Use a least-privileged SELECT role where practical.

Offline inspection:

```sh
node scripts/auditLegacyMoney.mjs --print-sql
node --test scripts/auditLegacyMoney.test.mjs
```

## Production impact and limits

Defaults (explicit overrides permitted):

| Variable | Default | Maximum |
| --- | ---: | ---: |
| SPENDCRAFT_AUDIT_STATEMENT_TIMEOUT_MS | 60,000 | 3,600,000 |
| SPENDCRAFT_AUDIT_LOCK_TIMEOUT_MS | 3,000 | 60,000 |
| SPENDCRAFT_AUDIT_TOTAL_TIMEOUT_MS | 300,000 | 3,600,000 |
| SPENDCRAFT_AUDIT_MAX_ROWS_PER_QUERY | 100,000 | 1,000,000 |

Connection timeout is 10 seconds; idle-in-transaction timeout is 30 seconds. The total wall-clock deadline runs after connection. Row ceilings apply to each combined query, not each table. A ceiling/time limit **aborts an incomplete audit**; it never silently samples or publishes partial counts as a complete result. Monetary JSON text extraction is capped at 512 characters per value (covering ordinary amounts and finite SDK double representations); larger text is unclassifiable, never silently truncated into a valid amount. Large JSON precision/exponents are also bounded by the exact parser and reported unclassifiable instead of allocating unbounded BigInts.

Queries are set-based, with no row-by-row database round trips. Indexed in-memory maps avoid quadratic comparison lookup. Provider traversal is pruned to the documented transaction arrays and account balances; credentials and unrelated provider branches are not walked. Recursive JSON traversal can still be expensive for large provider logs; SELECT LIMIT limits returned rows, not all server work. Statement and total timeouts bound that cost. Read operations take ordinary PostgreSQL AccessShare locks and can delay DDL. A repeatable-read snapshot can delay vacuum cleanup of old row versions while concurrent writers run.

For a large production dataset, schedule with the DBA during low activity or use an approved suitable replica. Do not casually raise limits to an hour. If the bounded complete snapshot is unsuitable, stop and design a DBA-approved consistent export/replica approach. This script has no multi-snapshot mode that silently weakens consistency.

## Coverage and interpretation

Generic discovery; no sandbox Transaction IDs are hard-coded. Includes deleted/pending history.

- Posted Transaction split values: exact decimal-text parsing, separate cent/sub-cent/malformed counts and affected IDs.
- Single nonloan AccountTransaction counterparts: exact split sum, relational amount and difference; separate scale-two diagnostics. Loans/multiple rows/unsupported counterparts remain unclassified. Empty split arrays are excluded from sum comparison because existing code can use an unassigned relational fallback.
- Accountless transfer/funding/rebalance: separate exact zero-sum counts and evidence, not a fictitious relational amount.
- Statement income JSON: informational, distinct from relational starting/ending balances.
- Fixed Category and embedded funding configuration: percentages excluded. Funding baseAmount snapshots are separate generation inputs.
- Transaction tax attribution, tax forecasts and monetary change history: separate denominators. Optional null history is counted separately, not malformed money.
- Plaid transaction and current/available/limit balance observations (`provider.balance_money_values` counts fields including nulls; `provider.balances.numeric_observations` counts actual numeric values): provenance/valuation, separate from posted money. Null balances mean unavailable. USD plus null unofficial code is not an unknown currency. Missing/non-USD/unofficial currency contexts are flagged for review; discarded posted currency cannot be reconstructed.

Cent-exactness uses a signed decimal coefficient, exponent and scale with BigInt, stripping mathematically redundant trailing zeros. No epsilon, binary-near-cent recognition, toFixed or binary scaling determines validity. B's half-away-from-zero scale-two comparison is **diagnostic only**, not proof of historical calculation sequence or a repair rule. Original HTTP/provider spelling may already be lost; PostgreSQL-extracted numeric text preserves the mathematical value for this audit.

Class counts explicitly include A–I, including zeros. Units differ: A/D posted values/shapes, B/C Transactions, E/F/G observations, H currency contexts, I anomaly records. Malformed informational values are reported as I, not sub-cent F. Precision-affected Transactions and all affected Transactions are separate counts. Current balances, original OFX text and opaque provider revisions are not invented as authorities.

## Reports, privacy and exit codes

The new output directory uses mode 0700; files use 0600:

- `report.json`: deterministic ordered evidence/counts, timestamp, sanitized target, limits, schema metadata/fingerprint, script hash and completion checks. Server application version is not inferred from local source; schema metadata is supplied instead.
- `summary.md`: human-readable denominator/class summary and interpretation warnings.
- `aborted.json`: present on failure when an output directory was created; status is explicitly aborted, not a complete audit. Output-write failures can also abort after a completed read-only scan.

No descriptions, merchants, users/emails, account numbers, credential fields, log messages or entire provider payloads are selected for output. Invalid monetary strings/identifiers/modes are redacted. Raw driver messages/details/stacks are withheld because they can contain sensitive payloads. Reports still contain financial amounts and IDs: inspect them before sharing and send only these dedicated report files back to Codex, not connection settings or database dumps.

| Exit | Meaning |
| --- | --- |
| 0 | Complete audit; no B–I findings or unclassified cases |
| 1 | Complete audit; findings/unclassified cases require review (not execution failure) |
| 2 | Configuration/target/read-only safety failure |
| 3 | Query, deadline, row-ceiling, cleanup or output/runtime failure; incomplete/aborted report |

An aborted target-verification run prints `Audit ABORTED` and never reaches application-data SELECTs. A row/query failure has no complete findings report. Do not treat absent anomaly evidence from an aborted run as a clean audit. Nothing the report finds authorizes repair.
