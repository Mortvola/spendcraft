# Historical Transaction Category conversion and recovery

> Current normal rollback uses the application-only executor and leaves database
> values unchanged. See [compatible application rollback](application-release-rollback.md).
> The first-release conversion executor/guard is preserved but is not selected or
> bundled for normal rollback. Historical conversion recovery remains a separate
> explicitly invoked operation that retains the compatible application release.


## Source baseline and authorization

Source HEAD `ed696bc5587f9d6988e8fd8520e9691880d16cfd`, branch
`dollar-to-cents-2`. The operator reports successful compatible-release deployment
to staging and production. No fresh server or database inspection occurred here.
Existing untracked files, staged work and unrelated work remain untouched.

The approved design revision replaces the earlier recovery blocker with
conversion-specific recovery **retaining the installed compatible release**.
Implementation and local mocked tests are authorized; database connections,
staging execution and production execution are not. Historical conversion is
not completed. Staging rehearsal requires fresh staging-only authorization;
production requires later independent approval.

## Tooling and supported targets

- CLI: `scripts/convertHistoricalTransactionCategories.mjs`.
- Policy/identity/SQL helpers: `scripts/lib/historicalCategoryConversion.mjs`.
- Non-database tests: `tests/unit/historicalCategoryConversion.spec.js`.
- Existing audit authority: `scripts/auditTransactionCategoryCents.mjs`.
- The existing read-only schema helper is reused from
  `installer/lib/categoryRollback.mjs`; no release-manifest helper is required.

The database named in the selected `.env` is the explicit target. No implicit target,
force option, import-time execution, application swap, PM2 control, schema
migration, seeder, backup creation or automatic backup restore exists.
The older `scripts/rollbackTransactionCategoryStorage.mjs` path has moved to
`installer/rollbackTransactionCategoryStorage.mjs` in current source. That tool
serves the first-decimal-string-release downgrade scenario. It and its guard
remain unchanged and are **not used for historical conversion recovery**.

Run from a complete reviewed checkout/tooling copy, outside immutable installed
release directories; relative dependencies must remain available. Do not patch
an installed release or an immutable rollback bundle to deliver this tool.

## Approved conversion and conservation

Only numeric `transactions.categories[].amount` leaves are converted, for active
supported types **0, 2, 3, 4, 5**, including deleted records. Deprecated Loan paths
and every `transaction_categories` dependency are excluded; no legacy relational
allocation query or write is added.

Conversion uses the audit's actual helper and approved policy:

```js
const cents = Math.round(amount * 100)
const storedAmount = (cents / 100).toFixed(2)
```

Finite numeric values, safe integer cents, safe encoded decimal round-trip and
safe runtime decoding are required. Checked accumulation rejects overflow before
later cancellation. `-0` becomes `"0.00"`; `-1.005` becomes `"-1.00"`;
`0.30000000000000004` becomes `"0.30"`. This is a representation migration,
not a complete exact runtime arithmetic change. No narrower monetary-column
range is imposed on JSON; the supported range must pass all safe-cent and
round-trip checks. More than 1,000 numeric leaves in one Transaction requires
separate review rather than an unbounded nested SQL expression.

Existing canonical strings are validated with exact decimal-text cents and
remain unchanged. Exponents, whitespace, leading zeros, malformed syntax,
nonfinite numbers, missing amounts and unsafe values fail closed. `"-0.00"` is
not canonical for this release and requires review, not silent normalization.

Conservation reuses `auditTransaction`, scoped linked AccountTransaction and
Funding Pool evidence, independent of pending/deleted/startDate posting
eligibility:

- Types 0/5 and opening 4: exactly one supported, same-Budget linked movement;
  individually rounded allocation cents equal exact relational decimal-text cents,
  with the same sign.
- Funding 2: explicit unique owning Pool, no AccountTransaction links;
  non-Pool cents plus Pool cents equal zero. `baseAmount` is not authority.
- Rebalance 3: no AccountTransaction links, nonempty allocations, total zero.

Array ordering, duplicates, Category IDs and optional metadata are preserved.
Unsupported types/shapes and any new nondeleted conservation failure block the
entire operation. Classification failures are recorded by ID/type and reason in
private detailed output; they are never silently coerced into zero or repaired.

## Historical baseline and exceptions

The historical readiness baseline is 6,254 Transactions: 6,241 conservation
passes, ten failures, three unsupported, zero malformed; 6,241 candidate
Transactions and 10,457 numeric allocation leaves, one string-only Transaction
and no mixed arrays. These are historical observations, not fixed expected counts.
No audit was rerun during implementation.

Historical examples of deleted exceptions (evidence only, never runtime IDs):

- Empty ordinary allocations: 3974, 3975, 3977, 4116, 4262, 4412, 4413, 4415.
- Deleted funding +9-cent remainders: 4596, 4597.
- Empty deleted funding: 2578, 3077, 3388.

The conservation exception is based on `deleted === true`, not any ID, expected
remainder size or specific historical shape. Supported deleted Transactions with
valid allocation data may be converted even when conservation fails or cannot be
established. Empty arrays stay empty; discrepancies of any amount are preserved.
Passing deleted records remain ordinary passes rather than exceptions.

Type, allocation structure/Category ID, finite/canonical monetary amounts,
safe-cent range and checked accumulation remain mandatory. A malformed audit
finding is still blocking. Nondeleted records must satisfy the applicable
conservation rule. Balance-tracked exclusions and deprecated boundaries are
unchanged. No allocation is synthesized or redistributed and no balance is repaired.

## Running directly from .env

There is **no plan file, environment inventory, application release hash or
manually supplied database identifier**. Connection settings come exclusively from
the selected `.env`: `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DB_NAME`.
No ambient `PG*` fallback is used. The configured database is the selected target,
including `spendcraft_sandbox`; no production/staging name is inferred.

Default invocation (read-only dry-run using `.env` in the working directory):

```sh
node scripts/convertHistoricalTransactionCategories.mjs
```

Select another environment file explicitly:

```sh
node scripts/convertHistoricalTransactionCategories.mjs --env /absolute/sandbox.env
```

`--dry-run` is optional and has the same effect. `--env` is intentionally used
instead of `--env-file`, which Node 24 can intercept before the script runs.
`--plan`, EC2 metadata, release fingerprints and installation directories are no
longer supported or required. A compatible deployed application must remain in
place operationally, but this data-only tool does not inspect/swap releases.

Every valid invocation creates and immediately prints a new private output
folder (`category-conversion-*`) before environment or database work. Existing
output is never overwritten. `--output-parent /absolute/existing/directory` can
select its parent. Read `target.json`, `preflight.json`, `transactions.jsonl` and
`summary.json`. Failure produces `failure.json` and a safe `Diagnostic:` line
containing phase/code/hint, without raw SQL, credentials or financial exception
text. Partial output is not approval. A missing `.env` is reported at
`read_environment`; dry-run failures explicitly state that no conversion/recovery
updates were requested.

### Automatic database verification

Before connecting, validate the `.env` host/port/database/user. Existing local TCP
loopback restrictions remain: `localhost`, `127.0.0.1` or `::1`; no Unix socket or
remote-server bypass was added. After connecting, compare live database, role,
server port and TCP server/peer identities with the configured target. Legitimate
full-host IPv4/IPv6 CIDR forms are normalized strictly; networks and wrong peers
are rejected.

Discover database OID and cluster system identifier automatically, then verify
them independently again. These are recorded in `target.json` and recovery
metadata; the operator never supplies them. The existing `pg_control_system()`
read permission is still needed. If the role lacks it, fail closed with SQLSTATE
`42501`; no role grants are issued automatically. Re-read the selected `.env` and
verify configured/live identity on the actual execution connection before each
UPDATE and commit boundary. A changed `.env` cannot silently retarget a run.

Dry-run uses startup `default_transaction_read_only=on` and repeatable-read READ
ONLY. It creates no database objects, backup or snapshots, controls no processes
and performs no writes or explicit write locks. The read-only target inspection
still requires appropriate operator authorization.

### Explicit execution and PM2 checks

The only execution switch required is `--execute`. The obsolete `--confirm`,
`--writers-stopped` and `--backup` switches have been removed and are rejected.
No external PostgreSQL dump or `pg_restore` tool is required by conversion or
recovery. The durable exact-original-JSON snapshot below is still mandatory.

With `.env` selecting sandbox:

```sh
node scripts/convertHistoricalTransactionCategories.mjs --execute
```

With an alternate `.env`:

```sh
node scripts/convertHistoricalTransactionCategories.mjs --env /absolute/settings.env --execute
```

Only a live, verified database named **exactly `spendcraft_sandbox`** skips PM2.
There is no general skip/bypass flag. Other database names—including staging and
production—require the processes in the PM2 manifest to be stopped. Dry-run never
queries PM2 regardless of the selected database.

For non-sandbox execution, `scripts/lib/conversionPm2.mjs` validates the shared
`installer/pm2-processes.json`, currently naming `queue`, `plaid-cleanup` and
`prod-server`. It verifies the selected daemon PID/identity, reads `pm2 jlist`,
then verifies the same daemon remains present. Every manifest name must have
exactly one registered entry, status `stopped` and zero PID. Missing/duplicate
names, active/transitional/errored status, live PIDs, unavailable/wrong daemon,
invalid output or a changed manifest fail closed with a clear error. The failing
process name is included in diagnostics. Unrelated PM2 applications are ignored.

Defaults are PM2 on PATH and `PM2_HOME` (or the user's `~/.pm2`). Optional
`--pm2 /absolute/pm2`, `--pm2-home /absolute/home` and
`--pm2-manifest /absolute/pm2-processes.json` select the actual installed setup.
They do not bypass validation. A missing selected daemon fails before invoking
PM2; daemon replacement during inspection is rejected. The checker sends only
inspection commands and never asks PM2 to stop/start/restart/delete applications.
The operator stops the manifest processes before executing and prevents their
restart until the run completes.

PM2 is checked at execution preflight, before each UPDATE and before commit.
Database identity is independently rechecked on the execution connection at each
mutation boundary. There is **no database-session check**: other PostgreSQL
sessions do not block the run. This follows the operator's stated architecture
that relevant writers come through the PM2 manifest. No new locks are introduced.

## Atomic conversion and exact recovery point

Conversion uses one repeatable-read transaction. It checks JSONB column type,
no row-level security, and no unreviewed user triggers or rewrite rules. It does
not run ORM hooks or update `updated_at`, logs, versions or unrelated columns.

Before the first UPDATE, every affected row is streamed into private
`original-categories.jsonl`, containing:

- Transaction/Budget/type, original raw `categories::text`, and original xmin.
- PostgreSQL-computed projected converted JSON text.
- Original/projected whole-row hashes, metadata-only hash and amount-leaf patches.

Original JSON is stored as **text inside the snapshot**, never reconstructed from
JavaScript objects. PostgreSQL numeric metadata above JavaScript's safe range,
original sub-cent amounts, ordering and duplicates are retained. PostgreSQL JSONB
has already canonicalized whitespace/object keys; the snapshot preserves its
exact textual output and database value, not unavailable original insertion bytes.

The data file is fsynced, hashed and reread. `snapshot.json` binds its SHA256 to
automatically discovered database identity, counts, maintenance evidence and conversion transaction
xmin. Snapshot format 2 records database identity without release/environment-plan fields.
The manifest and directory entries are fsynced **before writes**. The
manifest SHA256 is printed as `recoveryPoint` before updates and retained in
summary/failure evidence. Copy/protect this recovery point and pin through the
reviewed operational procedure; a hash is not encryption or an external signature.
Do not edit or lose either snapshot file. A local snapshot alone does not protect
against volume loss; retain/protect the recovery files appropriately. External
backups may be managed separately but are not a script prerequisite.

Each UPDATE uses nested parameterized `jsonb_set` calls changing only numeric
amount leaves; no JSON amount/metadata tree is serialized through JavaScript.
WHERE checks bind ID, Budget, original xmin and original full-row fingerprint.
Returned JSON, whole-row/metadata fingerprints and conversion xmin must match the
precomputed projection. All affected rows and snapshot integrity are checked
again before commit. Any failure before commit rolls back all changes. There are
no checkpoint tables or batches that can leave a partial committed conversion.

A second run finds only strings/empty arrays and performs no UPDATEs. Its new
snapshot has zero candidates. The original recovery point must still be retained.

## Conversion-specific recovery

Keep the compatible release installed. **Never invoke the first-release downgrade
script or swap application directories for this recovery.** Do not reconstruct
original floats by string-to-number conversion: e.g. `12.345` cannot be recovered
from `"12.35"` that way. The original snapshot restores the exact original JSON.

After separate recovery approval, stop/drain/fence every financial writer again,
verify the original database/snapshot identities and inspect a recovery dry-run:

```sh
node scripts/convertHistoricalTransactionCategories.mjs --env /absolute/sandbox.env \
  --recover --snapshot /absolute/conversion-output/snapshot.json \
  --snapshot-sha256 ACTUAL_RECORDED_MANIFEST_SHA256
```

The snapshot hash is a recovery artifact pin, not an application release hash or
internal database identifier. Use the value printed before conversion; do not edit
the snapshot to change its identity. Recovery execution uses the same non-sandbox PM2 gate, without confirmation,
external-backup or writer-attestation switches:

```sh
node scripts/convertHistoricalTransactionCategories.mjs --env /absolute/sandbox.env \
  --recover --execute \
  --snapshot /absolute/conversion-output/snapshot.json \
  --snapshot-sha256 ACTUAL_RECORDED_MANIFEST_SHA256
```

The live database must match the identity saved in the pinned snapshot. Earlier
format-1, plan/release-bound snapshots are not silently reinterpreted; retain their
original tooling and obtain review before attempting recovery. No historical
conversion or real recovery has been run during this implementation.

For every snapshot row, recovery requires the exact post-conversion whole-row
fingerprint, raw converted JSON and **conversion xmin**, not merely equality of
allocation values. Any later Transaction UPDATE, including an equal-value save,
changes xmin and causes refusal. Missing rows, Budget changes or metadata edits
also block. No row is skipped as a way around a conflict. The entire restore is
atomic; a late conflict rolls back earlier restores.

An exactly original whole-row state is a safe idempotent no-op (nothing is
written). Restoration updates **only categories** with the saved original JSON
text, verifies original whole-row state and rechecks all rows before commit.
Repeated recovery restores nothing. Unrelated legitimate Transactions and all
other tables remain untouched. Legitimate changes to affected Transactions must
be reconciled separately, never overwritten or automatically merged.

The metadata fingerprints use PostgreSQL MD5 as accidental change detectors;
SHA256 protects snapshot bytes. These do not replace trusted private files,
strict access controls, recorded pinning or the maintenance boundary. xmin is
an operational short-window concurrency guard, not permanent versioning:
recovery after transaction-ID wraparound, DDL/schema changes, a cluster restore
or incompatible application/schema changes require a new reviewed recovery decision.

## Writer fence, failures and restart safety

The Budget row remains the sole explicit application-level serialization lock.
No new explicit row/advisory locks are introduced. Normal UPDATE/constraint locks
are implicit. The tool does not assume Budget locks can fence uncontrolled writers.

For non-sandbox conversion/recovery, all writers named in the selected PM2
manifest must remain stopped throughout the operation. The script checks live
PM2 status rather than accepting a manual attestation. It does not query
`pg_stat_activity`, block unrelated sessions or stop services. Sandbox skips PM2
entirely after verifying the configured/live database name. These conditions do
not add a second explicit application-level lock.

No script path starts/restarts PM2. Pre-commit errors roll back. Process death or
connection loss releases an uncommitted PostgreSQL transaction, but a lost COMMIT
acknowledgment is explicitly **unknown**, not proof of rollback. Keep writers
fenced and use the pinned snapshot plus fresh identity/row inspection to determine
whether it committed. Do not infer outcome from a missing `summary.json` or
rerun/recover blindly. A successful commit followed by output failure may also
leave only the precommit recovery-point record. Disk-full/snapshot-write failure
before mutations prevents conversion; never delete recovery files to resume.

## Full future staging rehearsal and acceptance

Use the actual isolated staging EC2 host and its own database/role, roots, PM2,
logs, backups and recovery files. Synthetic data only; no production dumps.
A complete reviewed checkout supplies tooling; no automatic staging provisioning
or fixture writes are included in this implementation.

1. Obtain staging-only authorization and verify the current compatible release,
   DB identities, role permissions, schema, disk headroom and synthetic data.
2. Seed reviewed synthetic fixtures under that authorization. Include types
   0/5/2/3/4, numeric/string/mixed arrays, duplicates, Unassigned, metadata, positive,
   negative/zero, half ties, artifacts, empty deleted ordinary/funding and deleted
   +9-cent funding examples. Use arbitrary synthetic IDs: valid deleted discrepancies must be preserved
   independent of ID, while active mismatches and malformed values must block.
3. Preserve raw per-table row/column digests and counts before the operation:
   Transactions (with and without categories), AccountTransactions, Accounts,
   Categories/Pool, Statements, logs/version state. Record original raw JSON text.
4. Run dry-run and confirm zero database changes, correct classifications and all
   candidate/leaf/conservation counts. Archive evidence privately.
5. Stop the staging PM2 manifest processes and verify disk headroom/recovery
   file storage; authorize staging execution. A sandbox run does not check PM2.
6. Convert; inspect raw `jsonb_typeof` and two-digit string syntax. Compare raw
   values with independently approved per-operand rounding expectations. Verify
   canonical strings, duplicates, metadata, empty arrays and all non-Category data
   unchanged. All active conservation passes; deleted discrepancies remain.
7. Run again: zero candidates/updates. Keep the **first** recovery snapshot.
8. Inspect numeric APIs, client display/editing and Category/Funding History/
   Income Vs. Expenses reports with controlled synthetic requests; separate any
   approved ordinary financial writes from conversion noninterference evidence.
9. Re-fence writers; run pinned recovery dry-run/execution against the original
   snapshot while retaining the compatible release. Original numeric token text, sub-cent
   amounts and metadata must return exactly. Repeat: no writes.
10. Inject malformed input, unsafe cents/accumulation, missing Pool/wrong type,
    nondeleted mismatch, wrong target/database, corrupt snapshot, failed output,
    late verification failure and interrupted transaction. Require fail-closed,
    atomic rollback and no automatic restart. Prove recovery refuses a later edit
    or same-value update of an affected row; unaffected legitimate rows survive.
11. Simulate uncertain COMMIT in a controlled staging harness; inspect both
    possible outcomes using snapshot identities, never auto-restore a backup.
12. Verify different Budgets remain isolated and no new explicit lock hierarchy
    exists. Resume only the compatible release after independently approved health
    checks; log results and keep artifacts for future production review.

This matrix is prepared, **not executed**. It is not PostgreSQL acceptance.
Production execution requires a successful full staging rehearsal, fresh production
read-only inventory/dry-run, verified stopped PM2 processes, snapshot capacity/protection
and an independent explicit production authorization.

## Verification and changed files

Local verification: **322 passed, zero failed/skipped**, including 88 new
conversion/recovery tests and 234 existing storage, audit, rollback and PM2-manifest
regressions. All database operations were mocked. CLI rejection tests used only
private temporary local files and failed before environment/network access.

Both TypeScript checks, Knip, circular regression, changed-file ESLint, all three
new JavaScript syntax checks and staged/unstaged whitespace checks passed. Circular
regression retained the accepted 11-model/26-edge Lucid component with no new
cycles. Repository-wide ESLint still reports six pre-existing `no-undef` errors
in the unrelated generated
`category-conversion-readiness-ajar8i/production-readonly-probe.mjs`; zero warnings.
That file was not changed or suppressed. Server/client builds are not affected:
no application runtime, assets, package configuration or dependencies changed.
No database-backed test or staging rehearsal ran.

Changed-file inventory:

- New `scripts/convertHistoricalTransactionCategories.mjs`.
- New `scripts/lib/historicalCategoryConversion.mjs`.
- New `tests/unit/historicalCategoryConversion.spec.js`.
- New `docs/transaction-category-historical-conversion-implementation.md`.
- Updated `docs/transaction-category-historical-conversion-readiness.md`.

The index remains unchanged (empty at entry); all additions/edits are unstaged.
Existing unrelated untracked files remain unchanged. Only operator tooling,
focused tests and this record/readiness documentation are changed. No production application runtime,
old rollback code, schema or deployed installation is modified. No connection,
conversion, recovery, PM2 operation, deployment or commit occurred.

## Local sandbox portability revision

At HEAD `660ae1513914f48098c3162c96e30bb89171c237`, branch
`dollar-to-cents-2`, removed EC2 identity dependence and added explicit sandbox
support. Existing unrelated `adonisrc.ts` work and untracked files were preserved.
Changes are limited to the conversion CLI, policy helper, focused tests and these
implementation/readiness records. Earlier verification counts above are historical;
revision verification: **279 focused tests passed, zero failed/skipped** across
conversion/recovery, cent audit, legacy guard and application-only rollback tests.
Both TypeScript checks, changed-file ESLint, Knip, circular regression, three
script syntax checks and both Git whitespace checks passed. Repository-wide
ESLint retains the same six unrelated generated-probe errors, zero warnings.
No application runtime/build configuration changed in this revision, so builds
were not required. No database connection, conversion/recovery, PM2 operation,
historical repair, schema migration, deployment or commit occurred.

## .env-only operator interface revision

This supersedes the earlier plan-based interface: no manual plans, release
hashes, installation paths or internal database identifiers are required. The
script discovers and records connection identity, backup checksums and recovery
metadata automatically. Default mode is read-only, alternate settings use `--env`,
and execution/recovery remain independently confirmed. Database safety, checked
cent conservation, exact original JSON, atomicity and later-edit refusal remain.
No application rollback tooling changed in this revision.

Verification: **281 focused non-database tests passed, zero failed/skipped**,
covering .env/default dry-run, automatic identity discovery, exact confirmation,
backup/maintenance admission, conversion and recovery, cent audit and both
application/legacy rollback regression selections. Both TypeScript checks,
changed-file ESLint, Knip, circular regression, three syntax checks and staged/
unstaged whitespace checks passed. Repository-wide ESLint still reports six
pre-existing errors in the unrelated generated probe; no suppressions were added.
Builds were not needed because no application runtime, assets or build settings
were changed by this revision. No database connection, conversion,
recovery, repair, schema migration, service operation, deployment or commit occurred.

## Rejected-record diagnostic correction

`transactions.jsonl` now preserves the underlying audit `reason`, `deleted` state
and conservation status for rejected rows, in addition to the existing `error`
label. It includes original/rounded Category amounts, per-allocation cents,
Category sum, expected cents, signed difference, funding Pool/non-Pool totals
and rebalance remainder when computed. Fields not computed are `null`; they are
not silently presented as zero. Linked AccountTransaction nominal amounts, scope,
tracking/pending flags and the scoped Pool IDs provide evidence for unsupported
shapes without collecting payee or Category-name metadata. An unsupported finding
is not a validated expected amount, regardless of intermediate totals recorded.

Malformed records rejected before an audit finding retain their controlled
validation reason and deleted state; unavailable audit totals remain `null`.
Unexpected raw parsing exceptions are replaced with a fixed label rather than
embedding raw exception text. These private detailed files contain financial
amounts and should be handled accordingly.

Classification, known deleted exceptions and blocking behavior are unchanged.
The prior uploaded output cannot be retroactively expanded: another authorized
read-only dry-run is needed to collect these diagnostics. Test fixtures use
synthetic shapes and do not establish the causes of the uploaded sandbox records.

Verification: 196 focused non-database tests passed, zero failed/skipped (conversion
and cent audit selections). Both TypeScript checks, changed-file lint, Knip,
circular regression, syntax and both whitespace checks passed. Repository-wide
lint retains six existing errors in an unrelated generated probe. No database
connection, conversion, recovery, historical repair, deployment or commit occurred.

## Balance-tracked Account exclusion

The conversion skips an entire Transaction if any linked Account has tracking
`Balances`, including opening/type-4 records and mixed-link shapes. The exclusion
applies before allocation validation/conservation and makes no data changes.
Skipped records are reported with `status: skipped` and reason
`linked_balance_tracked_account` in `transactions.jsonl`, counted as
`balanceTracked` in the summary and `skipped` by Transaction type. They are not
conversion candidates, do not contribute allocation/rounding/conservation counts,
and are never included in a conversion recovery snapshot or UPDATE. Deprecated
exclusions remain separate. Other validation and deleted-record policies remain
unchanged. Recovery of an existing pinned snapshot retains its original scope;
this exclusion does not silently omit restoration entries.

## Deleted-state exception revision

Removed every production Transaction ID from conversion logic. Valid supported
deleted records receive a conservation exception for a failed or unsupported
audit result, independent of ID or difference size. Such findings remain reported
as fail/unsupported plus `exception: true` and do not become false passes. This
supersedes the earlier ID-specific handling documented in historical verification
notes. All malformed amounts, unsupported types, invalid allocation structures
and unsafe arithmetic remain blocked; active mismatches still block conversion.
Balance-tracked records continue to be skipped. No database execution occurred.

Deleted-state revision verification: 206 focused non-database tests passed, zero
failed/skipped. Both TypeScript checks, changed-file ESLint, Knip, circular
regression, syntax and both Git whitespace checks passed. Tests cover arbitrary
deleted IDs, ordinary/funding/rebalance/opening mismatches, negative and non-nine-
cent discrepancies, empty arrays, invalid amounts/structures/types and overflow,
active rejection, exact raw-JSON recovery and balance-tracked exclusion. Exception
records retain deleted status, reason and detailed cent evidence in output; they
are not relabeled as conservation passes. No database connection or mutation,
service operation, deployment or commit occurred.

## PM2-controlled execution revision

Removed confirmation, writer-attestation and external-backup switches. All modes
retain configured/live database identity, exact JSON snapshot integrity, checked
conservation, atomicity and changed-row refusal during recovery. Sandbox skips
PM2 by exact verified database name; other execution targets use the validated
PM2 process manifest. Database-session inspection was removed by product direction.
Earlier backup/confirmation verification records above are historical evidence,
not current execution prerequisites. No database or PM2 commands were executed
during implementation; status behavior was tested with inert injected adapters.

PM2-controlled revision verification: 218 focused non-database tests passed, zero
failed/skipped. Tests cover live/stopped/missing/duplicate manifest entries, daemon
identity/replacement, later restarts, changed manifests, read-only dry-run, exact
sandbox bypass and non-sandbox enforcement. Commands and PID probes were mocked;
no real PM2 inspection/control or database connection occurred. Both TypeScript
checks, changed-file ESLint, Knip, circular regression, syntax and staged/unstaged
whitespace checks passed. No application build is affected. Original user/index
work is preserved; no conversion/recovery, historical repair, service operation,
schema migration, deployment or commit occurred.
