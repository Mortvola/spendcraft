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
- Existing read-only schema and release-manifest helpers are reused from
  `installer/lib/categoryRollback.mjs` and `installer/lib/releaseManifest.mjs`.

Only explicit `staging` or `production` plans are accepted. No implicit target,
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

The narrowly recognized deleted exceptions remain preserved:

- Empty ordinary allocations: 3974, 3975, 3977, 4116, 4262, 4412, 4413, 4415.
- Deleted funding +9-cent remainders: 4596, 4597.
- Empty deleted funding: 2578, 3077, 3388.

The exceptions require the documented type, deleted state and empty/+9-cent
shape. Restoring an ID to active status does not bypass conservation. Other
failing/unsupported records require investigation. Empty arrays produce no
updates. Existing numeric leaves in the +9-cent records are rounded normally;
the discrepancy is retained. No allocations are synthesized or redistributed.

## Explicit reviewed plan

Prepare a private JSON plan outside the installed release. Values below are
illustrative placeholders, **not executable production identity assertions**.
Collect actual identities only in a separately authorized read-only preflight.
Do not commit plans, snapshots, `.env` files or personal financial output.

```json
{
  "format": 1,
  "environment": "staging",
  "targets": {
    "staging": {
      "instanceId": "i-11111111",
      "region": "us-west-2",
      "accountId": "123456789012",
      "privateIp": "10.0.1.10",
      "root": "/spendcraft_staging/server",
      "envFile": "/absolute/staging-env",
      "release": "REPLACE_WITH_64_HEX_RELEASE_MANIFEST_IDENTITY",
      "database": {
        "host": "localhost", "port": 5432, "name": "spendcraft_staging",
        "user": "staging_role", "server": "127.0.0.1", "peer": "127.0.0.1",
        "systemIdentifier": "REPLACE_WITH_CLUSTER_IDENTIFIER", "oid": "REPLACE_WITH_DATABASE_OID"
      }
    },
    "production": {
      "instanceId": "i-22222222",
      "region": "us-west-2",
      "accountId": "123456789012",
      "privateIp": "10.0.2.10",
      "root": "/spendcraft-prod/server",
      "envFile": "/absolute/production-env",
      "release": "REPLACE_WITH_64_HEX_RELEASE_MANIFEST_IDENTITY",
      "database": {
        "host": "localhost", "port": 5432, "name": "REPLACE_WITH_PRODUCTION_DATABASE",
        "user": "production_role", "server": "127.0.0.1", "peer": "127.0.0.1",
        "systemIdentifier": "REPLACE_WITH_CLUSTER_IDENTIFIER", "oid": "REPLACE_WITH_DATABASE_OID"
      }
    }
  },
  "maintenanceId": "reviewed-window-unique-id",
  "maintenanceStatement": "All financial writers, schedulers, provider commands and traffic are stopped and fenced",
  "writers": [{ "name": "REPLACE_WITH_EVERY_REVIEWED_WRITER", "stopped": true }],
  "backup": {
    "file": "/absolute/verified-preconversion.dump",
    "sha256": "REPLACE_WITH_64_HEX_SHA256",
    "database": "spendcraft_staging",
    "verifiedAt": "REPLACE_WITH_FRESH_ISO_TIMESTAMP",
    "recoveryProcedure": "Document the separately reviewed recovery procedure and completed restore rehearsal here."
  }
}
```

Both inventory entries are required so staging and production cannot share an
EC2 identity, private IP, nested/equal installation root or database name. No
credentials are stored in the plan. The selected absolute `.env` file supplies
**PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DB_NAME**, with no ambient PG-variable
fallback. These must match the plan before a database connection is opened.

IMDSv2 checks the current instance ID, region, AWS account and private IP. This is
an operation-specific EC2 target assertion, not a permanent Linux machine-ID
requirement: a replacement instance needs a freshly reviewed plan. No credentials
or AWS API mutations are required. The current installed directory must resolve
to the exact selected root, contain the codec, and match a complete release
manifest. Full rehashes occur before work and before commit; path/codec checks
repeat at each mutation. Release identities must remain the same for recovery;
a later deployment requires separate review, never a bypass.

The live **execution connection itself** independently verifies database, user,
port, database OID, cluster system identifier, server address, client address and
TCP peer address/port. `pg_control_system()` requires appropriate preexisting
read permission; no grants are issued. Lack of access fails closed. Unix sockets
and remote database hosts are not supported by this EC2-local plan. Legitimate
full-width `/32` and `/128` host CIDR text, expanded IPv6 and IPv4-mapped IPv6
loopback addresses are normalized strictly. Networks, malformed prefixes,
non-loopback addresses and wrong peers fail. This narrowly fixes conversion and
recovery identity handling without altering the old rollback tool.

## Dry-run and execution commands

These commands are **future operator procedures, not authorization**. Even a
read-only database connection needs fresh staging authorization in the next task.

```sh
node scripts/convertHistoricalTransactionCategories.mjs \
  --plan /absolute/staging-conversion-plan.json --dry-run \
  --output-parent /absolute/private-audit-parent
```

The output parent must exist. Every invocation creates a new private
`category-conversion-*` directory and prints its absolute path immediately,
before environment, metadata or database work. Existing output is never replaced.
Dry-run starts with `default_transaction_read_only=on`, uses repeatable-read
READ ONLY and checks the actual mode. It scans deterministic 100-row keyset pages,
creates no backup/snapshot database object, acquires no explicit write locks,
controls no processes and performs no mutations.

Review `target.json`, `transactions.jsonl`, `preflight.json` and `summary.json`.
Summary includes Transaction/leaf counts, numeric/string/mixed/empty shapes,
rounding changes, conservation and exception counts by type, deprecated exclusions,
blocking records and precondition status. A failure writes `failure.json` and
returns nonzero; partial output is not acceptance. No credentials or payee data
are printed. Detailed recovery files nevertheless contain sensitive allocations.

For future execution, first establish the reviewed maintenance window, backup
and explicit authorization. Type a confirmation naming the exact target:

```sh
node scripts/convertHistoricalTransactionCategories.mjs \
  --plan /absolute/staging-conversion-plan.json --execute \
  --confirm 'CONVERT staging ACTUAL_DB ACTUAL_INSTANCE_ID ACTUAL_RELEASE_ID' \
  --output-parent /absolute/private-audit-parent
```

No generic `yes`, force flag or missing-environment fallback is accepted.
Execution verifies backup bytes against the reviewed SHA256, a fresh verification
and backup file within 24 hours, database name (including the archive header),
documented recovery procedure, and successful
`pg_restore --list` of a custom-format backup. This checks archive readability,
not a complete restore: a synthetic restore rehearsal remains an operator
prerequisite. No backup is created automatically. Disk headroom and recovery-point
storage/off-instance protection must be checked separately before authorization.

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
exact target/release identities, counts, maintenance ID and conversion transaction
xmin. The manifest and directory entries are fsynced **before writes**. The
manifest SHA256 is printed as `recoveryPoint` before updates and retained in
summary/failure evidence. Copy/protect this recovery point and pin through the
reviewed operational procedure; a hash is not encryption or an external signature.
Do not edit or lose either snapshot file. A local snapshot alone does not protect
against volume loss; the fresh verified database backup remains required.

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
verify the original database/release/snapshot identities, obtain a fresh backup
and inspect a recovery dry-run:

```sh
node scripts/convertHistoricalTransactionCategories.mjs \
  --plan /absolute/staging-recovery-plan.json --recover --dry-run \
  --snapshot /absolute/conversion-output/snapshot.json \
  --snapshot-sha256 ACTUAL_RECORDED_MANIFEST_SHA256
```

The recovery plan keeps the same target object/release but has fresh operational
maintenance/backup evidence. Execution additionally requires:

```sh
node scripts/convertHistoricalTransactionCategories.mjs \
  --plan /absolute/staging-recovery-plan.json --recover --execute \
  --snapshot /absolute/conversion-output/snapshot.json \
  --snapshot-sha256 ACTUAL_RECORDED_MANIFEST_SHA256 \
  --confirm 'RECOVER staging ACTUAL_DB ACTUAL_INSTANCE_ID ACTUAL_RELEASE_ID ACTUAL_RECORDED_MANIFEST_SHA256'
```

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
strict access controls, reviewed pinning or the maintenance boundary. xmin is
an operational short-window concurrency guard, not permanent versioning:
recovery after transaction-ID wraparound, DDL/schema changes, a cluster restore
or a release change requires a new reviewed recovery decision.

## Writer fence, failures and restart safety

The Budget row remains the sole explicit application-level serialization lock.
No new explicit row/advisory locks are introduced. Normal UPDATE/constraint locks
are implicit. The tool does not assume Budget locks can fence uncontrolled writers.

The operator must inventory web, queues, Plaid cleanup/imports, OFX commands,
cron/systemd jobs, webhooks, manual scripts, remote clients and poolers; stop/drain
and prevent their reconnection. The attested writer list is required. Before each
UPDATE and the commit boundary, the selected host, connection and absence of all
other client-backend sessions in this database are independently checked. This
session check supplements the fence; it cannot prevent a new connection or detect
an unreviewed background extension writing without a client backend. The reviewed
fence is mandatory. Never revoke production permissions as an automatic workaround.

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
   host/DB identities, role permissions, schema, disk headroom and synthetic data.
2. Seed reviewed synthetic fixtures under that authorization. Include types
   0/5/2/3/4, numeric/string/mixed arrays, duplicates, Unassigned, metadata, positive,
   negative/zero, half ties, artifacts, empty deleted ordinary/funding and deleted
   +9-cent funding examples. Known exceptions depend on exact IDs/shapes: use an
   isolated synthetic dataset with those IDs; unknown mismatches must block.
3. Preserve raw per-table row/column digests and counts before the operation:
   Transactions (with and without categories), AccountTransactions, Accounts,
   Categories/Pool, Statements, logs/version state. Record original raw JSON text.
4. Run dry-run and confirm zero database changes, correct classifications and all
   candidate/leaf/conservation counts. Archive evidence privately.
5. Fence writers, verify a fresh custom-format backup including a synthetic
   restore rehearsal and disk headroom; authorize exact staging execution.
6. Convert; inspect raw `jsonb_typeof` and two-digit string syntax. Compare raw
   values with independently approved per-operand rounding expectations. Verify
   canonical strings, duplicates, metadata, empty arrays and all non-Category data
   unchanged. All active conservation passes; deleted discrepancies remain.
7. Run again: zero candidates/updates. Keep the **first** recovery snapshot.
8. Inspect numeric APIs, client display/editing and Category/Funding History/
   Income Vs. Expenses reports with controlled synthetic requests; separate any
   approved ordinary financial writes from conversion noninterference evidence.
9. Re-fence writers; run pinned recovery dry-run/execution against the original
   snapshot and same compatible release. Original numeric token text, sub-cent
   amounts and metadata must return exactly. Repeat: no writes.
10. Inject malformed input, unsafe cents/accumulation, missing Pool/wrong type,
    nondeleted mismatch, wrong target/host/release, corrupt snapshot, failed output,
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
read-only inventory/dry-run, reviewed backup/fence, snapshot capacity/protection
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
