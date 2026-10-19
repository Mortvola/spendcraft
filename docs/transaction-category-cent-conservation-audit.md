# Transaction Category cent conservation audit

## Approved type-4 audit amendment

Type4 opening Transactions now follow the same signed account-linked conservation rule as types0/5: sum each individually rounded allocation in checked integer cents and compare against the single scoped AccountTransaction amount. Include every allocation, including Funding Pool entries; do not apply type2's opposite-sign rule. Pending/deleted/pre-start status does not exclude nominal conservation. Empty allocations sum to zero; missing or multiple links remain unsupported. The audit reports opening candidates separately as `opening` and in `byType["4"]`.

This supersedes earlier statements below excluding type4 from conservation. The existing historical artifact's eight unsupported type4 outcomes remain historical results of the previous tool; they do not establish whether these records conserve. Rerun the updated read-only tool into a fresh output directory to obtain their allocation details and results. No historical artifact or financial data was changed. The approved deleted-record representation-conversion policy remains unchanged.


## Status and scope

Prepared at `341de4a9e5af37e0ed543efcdaab31b7b4b4ffe2`. **NOT EXECUTED AGAINST POSTGRESQL.** No historical counts are known. Execution requires separate explicit target authorization; no previous authorization carries forward. This document is not production-database authorization.

Tool: `scripts/auditTransactionCategoryCents.mjs`. Helpers and runner are tested through `tests/unit/transactionCategoryCentAudit.spec.js`. Importing the script or using `--print-sql` does not connect. No Adonis bootstrap, ORM, application jobs or DB test setup is loaded. Execution parses only the selected .env file; import and --print-sql do not read it. Only the existing operator configuration/identity helpers are reused; the old broad audit collector and its SQL are not executed.

Loans and the entire legacy relational allocation architecture are deprecated and excluded. The tool counts identifiable deprecated Transactions but does not evaluate their monetary conservation or output their allocation values. Current linked Account type or current Category type identifies them; no legacy storage is read. It does not infer deprecated ownership for orphan historical shapes.

## Reads and safety

The fixed page SELECT reads Transaction ID/type/deleted state/categories; all AccountTransaction amounts as decimal text and pending flags; Account tracking/type and owning Institution Budget ID; current scoped system Pool ID; and Category type solely for deprecation detection. It reads no names, descriptions, credentials, balances, Statements, tax JSON or logs. The raw JSON amount tokens are separately extracted as strings, so JSON Number parsing cannot erase the original token in the output. Original comments/other personal metadata are not output.

The connection uses the selected .env file’s PG_HOST (TCP host or absolute Unix socket directory), PG_PORT, PG_USER, PG_PASSWORD and PG_DB_NAME, with `default_transaction_read_only=on`. Before application reads, live database/port/default-read-only identity must match; `BEGIN ... REPEATABLE READ READ ONLY` is followed by verification of actual transaction mode. Connection fields come exclusively from the selected file, not ambient PG* or legacy SPENDCRAFT_AUDIT_* connection variables; none is printed. All five keys are required (an explicitly empty password is allowed). Invalid configuration fails before connection. The script has no SQL supplied by operator arguments. Its only transaction statements are BEGIN, COMMIT and error ROLLBACK. It issues no INSERT, UPDATE, DELETE, TRUNCATE, ALTER, DROP, repair or application migration, and acquires no application serialization locks.

Keyset pages use `t.id > lastId ORDER BY t.id LIMIT100`, within one repeatable-read snapshot. Each page query aggregates links independently, avoiding link/allocation fan-out and N+1 application queries. Memory is proportional to one page of Transaction JSON/link data plus small per-type counters; one exceptionally large Transaction still must fit in memory. Detail output is streamed sequentially to JSON Lines, not accumulated for the table. Query count is identity/mode checks + ceil(rows/100)+1 page queries + transaction completion. The full table scan and correlated indexed Transaction-link/Category lookups need a later authorized performance check; no index is added. A long repeatable snapshot can retain database versions, so schedule and timeout it appropriately.

Existing configuration imposes connection, per-statement, lock, idle-transaction and total-duration limits. Total default is300,000ms, statement default60,000ms and lock default3,000ms; configurable bounds are validated by the shared operator configuration. On failure, signal, timeout or output failure, close the connection and roll back when possible. No complete summary is returned on an incomplete scan. A crashed process may leave partial JSONL or an empty summary; **only `summary.json` with status `complete` is an audit result**. Output errors must not be treated as zero anomalies.

## Running later, only after authorization

Print the fixed query offline:

```sh
node scripts/auditTransactionCategoryCents.mjs --print-sql
```

After authorizing the intended target, populate the five connection fields in `.env` in the current working directory, using dotenv `KEY=value` syntax. Quoted passwords can contain `#`. Keep the file private and uncommitted. Then run:

```sh
node scripts/auditTransactionCategoryCents.mjs --execute
```

Select a different file or assert the expected database explicitly:

```sh
node scripts/auditTransactionCategoryCents.mjs --env-file /path/to/.env --database AUTHORIZED_DATABASE_NAME --execute
```

The optional `--database` is an assertion against `PG_DB_NAME`, never an override. Missing files/fields, invalid ports or a database mismatch fail before connecting. Node.js with `node:util.parseEnv` support is required (the tested runtime is Node24). TCP and Unix sockets are supported; this tool retains its existing SSL-disabled client configuration.

Optional audit controls remain process environment variables: `SPENDCRAFT_AUDIT_OUTPUT_DIR` (choose a fresh directory), `SPENDCRAFT_AUDIT_STATEMENT_TIMEOUT_MS`, `SPENDCRAFT_AUDIT_LOCK_TIMEOUT_MS` and `SPENDCRAFT_AUDIT_TOTAL_TIMEOUT_MS`. The tool cannot enforce human authorization; `--execute` prevents accidental execution, not unauthorized use.

By default, each execution creates a unique `category-cent-audit-XXXXXX` directory in the current working directory. Its absolute location is printed to standard output immediately after creation, before connection, so it remains discoverable if the audit fails. `SPENDCRAFT_AUDIT_OUTPUT_DIR` remains an optional explicit directory override.

The output directory is created privately (0700 for new directories); files use exclusive creation and0600 permissions. Existing output files are never overwritten. Detailed output contains financial amounts/IDs and should be handled as sensitive, despite excluding names and credentials. Reserve disk space for all records; JSONL includes passing/changed/unsupported records as well as failures.

## Conversion and classification

For each valid finite amount use `Math.round(amount * 100)`, require safe integer cents, and format `(Math.round(amount * 100) / 100).toFixed(2)`. Negative half ties retain JavaScript behavior; -0.005→integer0 and string"0.00". No decimal-library/SQL replacement, truncation, epsilon or half-away policy. Numeric strings need a complete decimal/scientific syntax match before Number conversion; missing/null/boolean/container/blank/malformed values are invalid. Original input types and raw stored amount tokens remain available for review.

Each addition and subtraction checks safe integer range, including intermediate totals. Accumulation overflow is malformed/unevaluable, not a rounded mismatch. At huge magnitudes the formatting formula can fail to encode its own safe rounded cents; flag it as unsupported for migration review rather than choosing a new formula. Decimal expected AccountTransaction text is parsed exactly to cents through BigInt and range-checked; it is never replaced by the calculated sum.

| Outcome | Meaning |
|---|---|
| pass | Valid supported shape; per-entry rounded integer conservation holds |
| fail | Valid supported shape; nonzero signed cent difference |
| malformed | Invalid amounts/root/entries/IDs/expected decimal, or unsafe cents/accumulation/difference |
| unsupported | No approved invariant/expected authority for this shape; no invented amount |
| deprecated | Identifiable excluded feature; no monetary evaluation |

Outcomes are disjoint, and their totals equal total Transactions examined. `ordinary` (0/5), `opening` (4), `funding`, `rebalance` count nondeprecated candidate types, including malformed/unsupported candidates; `byType` has outcome and rounded-change counts for each encountered type. `amountsChanged` counts Transactions with at least one successfully examined JavaScript value unequal to its rounded dollar value (not formatting-only 12→"12.00"). It can overlap any outcome and is not another outcome bucket. Numeric-string syntax acceptance does not imply it was already canonical decimal-string storage. Raw stored tokens preserve precision that was lost when JSON decimal numbers originally became JavaScript numbers.

### Applicable comparisons

- Ordinary0/5 and opening4 (same account-linked rule): exactly one valid in-Budget nondeprecated Account link with Transactions/Uncategorized Transactions tracking; signed sum of every allocation cent equals exact persisted movement cents. Pending/deleted/pre-start records are included unchanged. Empty array totals0; no implicit Unassigned inference. Zero/multiple links and other tracking/scope shapes are unsupported.
- Funding2: accountless/nonempty; unique current Budget-owned Pool must be identifiable and represented in the Transaction. Each duplicate contributes separately. Non-Pool sum equals **negative** Pool sum. Difference = nonPool + Pool. Only these persisted amounts participate; no baseAmount, gross request, nested rule, current balance or rule recalculation.
- Rebalance3: accountless/nonempty; signed sum is0. Duplicate IDs are not deduplicated. A failure reports the signed remainder.
- Type1 and unknown types: unsupported/outside this audit's approved conservation invariants, not automatically malformed or repaired. Their presence normally makes the complete report's exit status nonzero; it does not mean the scan failed.

Missing or multiple current Pool definitions and missing Pool allocations are unsupported. A current ordinary Category row/name is not required for a nominal sum: the stored ID and amount are evaluated, without resolving a historical name. Missing Category membership or historical posting is not repaired. Current-state conservation says nothing about whether a Category effect was historically applied.

## Output and interpretation

Console: concise COMPLETE summary of total, lifecycle candidates, pass/fail/malformed/unsupported/deprecated and rounding-change counts. Raw driver errors are redacted. Machine files:

- `summary.json`: status, verified database/port/local transport and summary with `byType` breakdown.
- `transactions.jsonl`: one record per Transaction in ascending ID order, preserving allocation order. Fields include Transaction ID/type, outcome/reason, original Category amounts/IDs and stored amount tokens, rounded dollar strings, per-allocation cents, aggregate cents, expected cents and signed difference. Funding adds Pool/non-Pool cents; rebalance adds signed remainder. Deleted/pending state is contextual only. Deprecated details contain no allocation values.

Exit0 = complete with no fail/malformed/unsupported; exit1 = complete with findings requiring review; exit2 = invalid invocation (no connection); exit3 = incomplete/configuration/connection/output failure. No summary count is a correction instruction. Review actual cent mismatches separately from malformed/unsupported shapes and from values that merely lose sub-cent precision under the approved policy. Preserve all historical data; do not redistribute remainder cents or change expected amounts to force a pass.

Before production migration approval, review the complete historical result and separately authorize any disposition. This tool is ready for later authorized execution, but PostgreSQL syntax/performance and real historical counts remain unverified in this task.

## Offline verification

81 new audit tests pass, covering signed rounding/half ties, binary artifacts, negative zero, malformed/missing/unsafe amounts, checked accumulation, exact decimal expected values, duplicate IDs, ordinary/funding/rebalance conservation, empty/unsupported shapes, rounding order, summary counts and fake-client read-only paging/failure cleanup. The focused selection including existing audit/precision controls passes95 tests with0 failures/skips. Both TypeScript checks, final ESLint, Knip, circular regression and whitespace checks pass. No PostgreSQL connection or database-backed test was used; no historical result is implied by these offline fixtures.


## Failure diagnosis follow-up

The original generic INCOMPLETE message alone cannot identify the cause of an operator run. The script now prints a separate safe `Diagnostic` JSON line and includes the same failure object in an incomplete summary when writable. It records phase, error code, examined-record count and (for applicable PostgreSQL errors) numeric SQL position. It never prints raw driver error messages, SQL payloads, credentials or record contents. Rollback/connection-close errors are recorded separately and do not replace an earlier failure. These diagnostics do not establish why any previous run failed.

Typical phases: configuration; create_output_directory/create_details_file/create_summary_file; connect; verify_target; verify_transaction_mode; page_query; classify_transaction; write_details; commit_readonly_snapshot; write_summary. EEXIST during output creation means select a fresh output directory, preserving prior output. EACCES/ENOSPC indicate permission/storage issues; connection codes identify connection-stage failures; PostgreSQL SQLSTATE plus position identifies query failures; audit_timeout indicates the overall limit. Do not increase limits or change queries merely to obtain a passing audit before identifying the phase/code.

To retry manually after authorization, retain the intended connection configuration, choose a fresh output directory and run the updated script. Share only the safe Diagnostic line for investigation, not credentials or raw financial output. Failed/partial outputs still are not migration approval evidence. Additional offline tests prove safe diagnostics, primary-error preservation across cleanup failures, and an existing-file failure before database-driver loading/connection. No database connection was made to test these paths.


Codeless connection-error follow-up: installed pg can throw SCRAM and connection Errors without SQLSTATE/system codes. Diagnostics now map the exact missing/invalid-password messages, connection timeout and termination messages to fixed labels; other SASL messages become SASL_PROTOCOL_ERROR without emitting server-provided text. SASL_PASSWORD_MISSING means set PG_PASSWORD in the selected .env file; ambient PGPASSWORD is not used. A previous unclassified_error cannot retrospectively establish which error occurred; rerun the updated tool with a fresh output directory to obtain the mapped code. Six additional offline cases verify this classification and redaction; no database connection was made.
