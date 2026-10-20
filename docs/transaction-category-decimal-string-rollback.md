# Transaction Category decimal-string release rollback

## Status and scope

Implemented against repository HEAD `be41cdd4c0c572087e136a81f045ccf95e0e94eb` on October 20, 2026. **Prepared and mock-tested; a separately authorized sandbox rehearsal is required before production use. No real rollback or database connection occurred.**

Script: `scripts/rollbackTransactionCategoryStorage.mjs`. Conversion/workflow helpers: `scripts/lib/categoryRollback.mjs`. Shared release identity: `scripts/lib/releaseManifest.mjs`. Automatic installer capture: `scripts/captureDeploymentManifests.mjs`. Non-database tests: `tests/unit/transactionCategoryRollback.spec.js` and `tests/unit/installerManifests.spec.js`.

The installer moves today's installed `spendcraft` to `spendcraft.old` during deployment. That future directory is the rollback target. Today's older `spendcraft.old` is not a prerequisite for preparing this script. The earlier blocked assessment incorrectly treated present directory generation and execution-time recovery prerequisites as implementation blockers. It is superseded by this procedure.

Only `transactions.categories[].amount` is reversed, from canonical decimal strings to JSON numbers. Existing numbers, allocation order, duplicate Categories, metadata, IDs, dates, statuses and unrelated fields remain unchanged. Supported active lifecycles are types 0, 2, 3, 4 and 5. Opening is included. No conservation repair, full database restore, schema change, migration, seeding or balance recalculation occurs. Loans and every legacy relational allocation dependency remain excluded.

## Installed-release inspection and additional requirements

Read-only inspection established `/spendcraft-prod/server` as production root. Today's live release and old directory both contain server/console entry points, package lock, installed dependencies, public assets, Transaction model and queue/cleanup commands. Both report package version 4.1.0; neither contains the new codec. Package version is insufficient identity. Their database migration/schema JavaScript hashes matched, but live database migration state was not queried.

Today's live release has JSON recordset reporting and an eligibility helper absent from today's old directory. They also differ in controllers, models, routes, validators and operational commands. Those findings establish that directories must not be identified by name/version alone; they do not justify reverting two generations. Capture today's live release before deployment, then verify the same identity at `spendcraft.old` afterward.

Additional read-only inspection of today's live release found no missing files referenced by its Vite client manifest and no missing direct runtime dependency package files. Its compiled database configuration SHA-256 is `9fbff9f15f8b440beab78f20f0a6403179a2ea5e91a393490e446b5bf3bb9b75`, matching the local build. These checks establish specific completeness/configuration facts, not startup or financial acceptance of the previous binary.

| Requirement | Classification and treatment |
| --- | --- |
| Numeric allocation compatibility | Representation reversal is required; prior release is explicitly attested as the numeric predecessor and must lack the new codec. |
| Other code differences | Review required. Manifests hash all regular release files, assets and dependencies; a reviewed difference fingerprint and exact identities are mandatory. |
| Database files/config differ | Execution blocker. Script refuses differences under `database/` or in `config/database.js`; it never reverses schema or other stored representations. |
| Shared secrets/environment | Preserve without overwriting. `.env`, `.npmrc` and PushNotificationKey, when present, must be external symlinks resolving identically in both releases. |
| External queue wrapper/process definitions | Review required. Exact script path/hash, interpreter, cwd and argument list are supplied and verified. No dependency installation or wrapper rewrite occurs. |
| Backup | Fresh backup is created and checked only after writer shutdown; operator confirms the documented recovery procedure. No existing backup is rotated or overwritten. |
| Complete writer fence | Operational prerequisite, not inferred from three PM2 names. Traffic, schedulers, other hosts/users and manual commands must be fenced. |
| PM2 cron restart | Must be disabled in live and saved definitions during maintenance; otherwise fail closed. Restore reviewed schedules manually after successful completion/read checks. |
| Reboot during rollback | Preserve original private PM2 dumps, save stopped state twice, fsync and verify both primary/fallback dumps before conversion. The installed PM2 5.4.1 standalone-fork resurrection path was source-reviewed; other versions/changed source or explicit instance configurations are rejected. |

The accepted commit also includes admission/conservation validation and Category/CheckBalances Budget-scoping corrections, besides the storage boundary. A previous binary restores its previous validation/security behavior too. Review these differences explicitly; number conversion does not preserve newer code fixes. Installed current source can also differ from the repository parent. The operator must review actual package differences and attest compatibility, including provider recovery, current schema, API, funding/rebalance, opening, DELETE/cascades and commands. No additional representation reversal is authorized. Unknown incompatibilities stop execution.

## Preconditions

- Linux host, Node compatible with the installed release, `pg` dependency available to the operator script, running deployment user's reviewed PM2 5.4.1 daemon, PostgreSQL tools `pg_dump` and `pg_restore`, adequate disk space for a fresh dump plus an independent previous-release copy.
- Run the operator tooling outside both installed release directories, preferably from a separate reviewed checkout. It must survive the directory swap. Use the PM2-owning OS account, not an unrelated root PM2 instance.
- Read-only database access for dry-run and destructive execution each require separate authorization for the explicit environment. This document grants neither.
- Confirm that a verified recovery procedure is understood and rehearsal evidence is available. Archive validation alone is not proof of a successful database restore.
- Fence all non-script connections and writers. Production runs refuse test/sandbox database names. Sandbox runs require `spendcraft_sandbox`, distinct roots, prefixed PM2 names and a loopback smoke URL.
- Disable automatic PM2 cron restarts and external schedulers during the entire operation; preserve their original configuration for reviewed restoration after completion. Keep external traffic fenced through smoke verification.
- Do not run the installer as a rollback command: it removes `spendcraft.old` and invokes migration/optional seeding steps.

## Automatic installer capture — filesystem only

`install.sh0` now captures both manifests automatically after dependency/configuration preparation and the existing migration/seeding decisions, while deployment-managed processes are stopped, **before** deleting `spendcraft.old` or swapping releases. It calls the packaged filesystem-only `scripts/captureDeploymentManifests.mjs`; installation and rollback share `scripts/lib/releaseManifest.mjs`, with identical format, validation and hashing. Manifest capture performs no database operations or application bootstrap.

Every installation prints a unique private directory such as `$SPENDCRAFT_ROOT/releases/deployment-<timestamp>-<random>/`. It contains:

- `previous-release-manifest.json`, identifying the current installed package that will become `spendcraft.old` (omitted on a fresh installation).
- `current-release-manifest.json`, identifying the prepared `spendcraft.new` package that will become `spendcraft`.
- `deployment.json`, linking identities, post-swap paths and available build provenance. Its status is `captured-before-swap`; it does not claim deployment or smoke checks succeeded. The rollback script still verifies actual installed contents.

Any capture/validation failure aborts the installer before its old-directory removal or swap. Partial records remain for inspection and lack the completed `deployment.json`. Existing records are never overwritten. A fresh installation explicitly records no previous release and cannot provide a previous-release rollback target.

The established `deploy.sh` → `build.sh` flow now writes `build/release-source.json` after the server build and before archiving. It records Git HEAD, build time and whether staged/unstaged/untracked repository work exists. A dirty flag is conservative and does not assert every untracked file is packaged; manifest hashes identify actual installed bytes. Missing/invalid source metadata on the new package stops automatic capture. Older packages may have no source metadata; their commit remains unknown rather than guessed.

Adonis metadata includes only the capture tool and shared manifest helper in the application package; the rollback executor is not installed or run by this change. Use the automatic pair as `previousManifest` and `currentManifest` in the rollback plan. Compatibility review and rollback approval remain separate.

### Optional manual capture

For additional inspection or packages installed without the updated installer, manual capture remains available. From a directory outside the release being captured, before forward deployment:

```bash
node /path/to/operator-checkout/scripts/rollbackTransactionCategoryStorage.mjs \
  --capture-release /spendcraft-prod/server/spendcraft
```

The script creates a private unique `category-storage-rollback-*` directory and prints its absolute path first. Keep `release-manifest.json` securely as the **previous manifest**. It contains paths/hashes, never secret-file contents. Required files must exist; external non-secret symlinks and incomplete packages are rejected. Package code is never executed while capturing.

Capture the new installed release after deployment, or capture the fully prepared `spendcraft.new` package before activation, as the **current manifest**. Relative secret links remain valid because both paths share the same parent. Do not modify package files after capture. Release hashing includes dependency/assets contents and file modes; source changes or missing files cause a mismatch.

Compare the two manifests without a database connection:

```bash
node /path/to/operator-checkout/scripts/rollbackTransactionCategoryStorage.mjs \
  --compare-manifests \
  --current-manifest /absolute/current/release-manifest.json \
  --previous-manifest /absolute/previous/release-manifest.json
```

`release-differences.json` contains the sorted changed path list and its SHA-256. Review the actual corresponding source and runtime changes, not merely the path list. Exact manifest identities already bind each file's contents. Copy the reviewed list fingerprint into the plan. The unchanged `config/database.js` file's SHA-256 is available in either manifest's `files` list.

## Explicit plan

Create a private operator JSON plan. Paths and identities below are illustrative; replace them with reviewed actual values. Never put a password in this plan. The selected external `.env` must contain `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD` and `PG_DB_NAME`. Ambient PG variables cannot override these connection fields.

```json
{
  "environment": "production",
  "root": "/spendcraft-prod/server",
  "productionRoot": "/spendcraft-prod/server",
  "pm2Executable": "/home/ubuntu/.nvm/versions/node/v24.15.0/bin/pm2",
  "pm2Home": "/home/ubuntu/.pm2",
  "productionPm2Home": "/home/ubuntu/.pm2",
  "envFile": "/spendcraft-prod/server/spendcraft-env",
  "expected": {
    "host": "localhost",
    "port": 5433,
    "database": "budget",
    "user": "REPLACE_WITH_VERIFIED_DATABASE_USER",
    "serverAddress": "127.0.0.1",
    "clientAddress": "127.0.0.1"
  },
  "currentManifest": "/absolute/current/release-manifest.json",
  "previousManifest": "/absolute/previous/release-manifest.json",
  "reviewedDifferencesSha256": "REPLACE_WITH_64_HEX_DIGITS",
  "databaseConfigSha256": "REPLACE_WITH_64_HEX_DIGITS",
  "maintenanceStatement": "All external writers, schedulers and traffic are fenced for this operation",
  "recoveryProcedure": "REPLACE_WITH_REVIEWED_RECOVERY_RUNBOOK_AND_REHEARSAL_EVIDENCE",
  "smokeUrl": "https://spendcraft.app/",
  "processes": [
    {
      "name": "prod-server",
      "script": "/spendcraft-prod/server/spendcraft/bin/server.js",
      "scriptSha256": "REPLACE_WITH_64_HEX_DIGITS",
      "cwd": "/spendcraft-prod/server/spendcraft",
      "interpreter": "node",
      "args": []
    },
    {
      "name": "queue",
      "script": "/spendcraft-prod/server/queue.sh",
      "scriptSha256": "REPLACE_WITH_64_HEX_DIGITS",
      "cwd": "/spendcraft-prod/server",
      "interpreter": "/bin/bash",
      "args": []
    },
    {
      "name": "plaid-cleanup",
      "script": "/spendcraft-prod/server/spendcraft/ace.js",
      "scriptSha256": "REPLACE_WITH_64_HEX_DIGITS",
      "cwd": "/spendcraft-prod/server/spendcraft",
      "interpreter": "node",
      "args": ["plaid:cleanup-listener"]
    }
  ]
}
```

Use exact saved/live PM2 metadata; the interpreter example may differ on the host. Only standalone fork-mode processes without an explicit `instances` property are supported. The wrapper hash is independent of a package manifest because it lives outside the release. Production process names are exactly `prod-server`, `queue`, `plaid-cleanup`. Sandbox names are exactly `sandbox-prod-server`, `sandbox-queue`, `sandbox-plaid-cleanup`. Sandbox also requires a separate PM2 home/daemon; renamed processes in the production PM2 home are insufficient isolation. A wrong name is never interpreted as permission to stop an unrelated application.

Only explicit loopback PostgreSQL TCP endpoints are supported in this first version. Set expected server/client IPs to the verified actual IPv4 or IPv6 loopback identities. A socket connection, missing peer, mismatched database/user/port or unresolved ambiguity is rejected. No production target is inferred, and no prior `spendcraft_test` authorization is reused.

## Dry-run

Only after separate read-only authorization for the selected environment:

```bash
node /path/to/operator-checkout/scripts/rollbackTransactionCategoryStorage.mjs \
  --plan /absolute/rollback-plan.json --dry-run
```

Dry-run validates manifests, reviewed differences, `.env`, both application connection mappings and independent live pg/pgLog/execution connections. It reads saved PM2 metadata without invoking PM2 or starting its daemon; saved definitions are a plan, not a live shutdown assertion. It performs its data scan in a read-only repeatable-read transaction. It never stops/restarts processes, creates a backup, modifies installed releases or updates database records.

Outputs: `preflight.json`, `release-differences.json`, concise stdout summary, `summary.json`, and `transactions.jsonl` with affected IDs/conversion counts or sanitized rejection reasons. No credentials or allocation comments are logged. Malformed and ambiguous records are separate counts, produce a nonzero exit and block execution. Unsupported/deprecated types are excluded; ambiguous ownership inside supported active lifecycles fails closed. The existing active boundary's nondeprecated ownership rules are retained.

All modes create unique output directories and exclusive result files; no prior results are overwritten. Even a failed preflight preserves whatever evidence was produced. If invoked from inside an installed release, results are placed in a sibling directory, so reporting does not change the release being inspected. Running the operator checkout outside both releases remains recommended.

## Execution — separate approval required

Do not run this during preparation. After a successful sandbox rehearsal and explicit production authorization:

```bash
node /path/to/operator-checkout/scripts/rollbackTransactionCategoryStorage.mjs \
  --plan /absolute/rollback-plan.json --execute
```

No generic `--force` exists. The script first performs read-only inspection, then prints:

> This operation will replace the current SpendCraft application release and convert Transaction Category amounts back to JSON numbers. It will preserve other database records but may make the database incompatible with the newer release.

A terminal is required. Type the exact requested `ROLLBACK <database> <previous-manifest-identity>` confirmation. Other gates require `RECOVERY <database>`, `START <database> <previous-manifest-identity>` and `READ CHECKS PASSED <database>`. Blank input, EOF, noninteractive invocation or a different answer stops execution.

### Ordered execution

1. Create and fsync the durable root journal `.transaction-category-release-rollback.jsonl`. A journal from **any** previous attempt blocks another execution pending manual recovery review; it is never automatically removed.
2. Verify live PM2 daemon identity and exact definitions, reject additional in-root PM2 applications, preserve the original primary/fallback PM2 dumps in private exclusive output files, stop only the three reviewed names and verify their stopped status and child exits. Scan same-user `/proc` cwd/arguments and tracked descendants, including children that changed cwd. PID start times prevent false matches after reuse. Unknown remaining writers stop execution. Save PM2 state twice, fsync and verify both `dump.pm2` and `dump.pm2.bak` contain the selected applications stopped with no cron schedule. The source-reviewed resurrection path preserves that state. Unrelated PM2 applications remain running and retain their saved definitions. No conversion begins until these durable checks pass.
3. Verify the `.env` target and both reviewed application mappings, all three live connections and actual TCP peers. Reject other client sessions in the target database. Repeat immediately before each UPDATE and conversion COMMIT; also recheck process quiescence.
4. Create an exclusive private `recovery.dump` after shutdown using `pg_dump --format=custom`. Require successful exit, nonempty output, `pg_restore --list` and a full read/decompression with `pg_restore --file /dev/null` (no restoration/database connection). Record completion time and SHA-256, fsync the file and obtain operator recovery acknowledgment. The backup does not restore anything or authorize an automatic restore.
5. Independently copy the attested previous package into a unique sibling staging directory. Verify its full identity before database changes; preserve original `spendcraft.old`. Disk/copy/dependency errors stop before conversion.
6. Run one atomic repeatable-read database transaction. Validate the complete supported dataset, then apply only amount-leaf patches and verify every update. No explicit Budget or other application row lock is used for this offline procedure; writer fencing is mandatory. Normal PostgreSQL implicit write/constraint locks remain.
7. Verify remaining supported strings are zero, numeric counts increased exactly, transaction/scope counts match and unrelated state is unchanged. Journal `commit-pending` before COMMIT and `converted` after acknowledgment. A lost COMMIT response or journal failure after commit is treated as uncertain/postcommit failure, never falsely labeled rollback.
8. Verify release identities again, journal the swap, rename current `spendcraft` into a unique forward-recovery directory, fsync the parent, then rename the independent previous-release staging copy into `spendcraft`. The original `spendcraft.old` and newer recovery release both remain intact. Secret links and dependencies are preserved; no install, schema migration or seeding occurs.
9. Obtain the explicit START confirmation, restart only the reviewed PM2 names using their existing stable-path definitions, verify online status and make a bounded GET of the root URL. Authenticated read-only Transaction/allocation/funding/rebalance/report checks and server/provider log review require operator confirmation. No synthetic financial write is performed. Save PM2 state after confirmed smoke checks; traffic and schedule resumption remain manual.

## Conversion and verification

Canonical strings must match `^-?(?:0|[1-9]\d*)\.\d{2}$`. Parse signed BigInt cents, require safe integer cents, convert to a finite number, then check both its cent round-trip and the exact decimal cents in its serialized JSON number token. This last guard rejects high-magnitude cases where binary rounding seems to match but JSON serialization would change a cent. `-0.00` and `0.00` become numeric zero. No forward financial rounding is reapplied to change an allocation.

Existing valid numeric values are unchanged, including existing sub-cent artifacts. Malformed strings, missing amounts, invalid IDs/shapes, unsafe values or ambiguous links fail closed. Strings never silently become zero. JSON numbers restore the previous release's binary-number contract; they are not exact decimal storage.

Raw Category JSON remains in PostgreSQL. Only validated per-index numeric amount patches are serialized from JavaScript. A set-based, ordinal JSONB leaf update preserves untouched entry metadata, large metadata numbers, duplicates and ordering without ORM hydration or unrelated field updates. No allocation is deduplicated or redistributed. Updated rows must still match their original raw JSONB and verify against the expected patched JSONB.

The script hashes all public base-table row state before/after conversion using bounded cursor reads. Transaction snapshots mask only allocation amount leaves; all other Transaction fields and JSON metadata remain checked. Converted amount meaning is separately checked, and SQL verifies exact expected patched JSONB. Accounts, Categories/Pool, AccountTransactions, Statements, logs/version state and every other public table must remain unchanged. Unexpected triggers/rules or Transaction row-level security block execution. No deprecated allocation table is queried for authority, conversion or compatibility; generic unchanged-state snapshots may hash it alongside other tables without interpreting or modifying it.

No conservation invariant is enforced. The eight deleted ordinary empty arrays, the two deleted funding +9-cent discrepancies and three deleted funding empty arrays retain their historical content. Type 4 is supported with the same representation reversal; no opening/Pool calculation runs.

## Failure and recovery

Before approval/preflight failure: no service or database changes occur. After execution approval, any failure leaves or attempts to leave the selected processes stopped; there is no automatic restart/revert.

Before COMMIT failure: conversion rolls back and no old release starts. Uncertain COMMIT outcome: keep writers stopped and inspect raw state under separate authorization. After commit/swap failure: preserve the old original, stage and current/recovery copies, read the durable journal and resolve paths explicitly. Directory rename and database commit are not one cross-resource atomic operation. The journal records each boundary and refuses blind retries.

After restart/smoke failure: stop the selected writers again; inspect whether ordinary background sync wrote additional numeric records. Never automatically restore a backup, restart an incompatible release or perform a reverse/forward conversion. A completed rollback also leaves the journal in place: a second whole-release rollback is not an approved action. The monetary conversion itself is idempotent and tested as such.

Recovery evidence and backups are private financial artifacts. Keep the output folder and journal protected; do not commit them. Existing backup files are never rotated/overwritten.

The original PM2 dump copies can contain credentials from process environments and are private recovery material, never console output. The official PM2 save operation updates its primary/fallback startup dumps after those original copies have been preserved. No database backup is overwritten. PM2's installed `lib/God.js`, `lib/API/Startup.js` and `lib/Common.js` were inspected read-only and pinned by SHA-256; a different implementation needs a fresh startup-safety review. PM2 commands were not executed during preparation.

## Sandbox rehearsal and known limits

Use an explicitly isolated root outside/above neither production root, an external sandbox `.env`, database `spendcraft_sandbox`, independent previous/current package manifests, a separate sandbox PM2 home/daemon with the three `sandbox-*` names, and a loopback root smoke URL. The same conversion, validation, backups, directory swap and journal logic runs. No sandbox execution was authorized or performed here.

Required rehearsal: numeric/string/mixed persistence, numeric no-op and idempotence, exact raw metadata/order/duplicate preservation, all five types including opening and deleted exceptions, real rollback on invalid data/failed verification, startup/read paths, child shutdown, identity/session mismatch, late failure and uncertain-commit recovery, interrupted directory swap and successful restart/smoke. Confirm actual PostgreSQL query syntax/plans and measured downtime/disk needs before production approval.

Limits: Linux and same-user `/proc` inspection; other OS users/hosts rely on the explicitly attested external fence plus database-session rejection, which does not prevent a newly authorized rogue connection. This is not a distributed writer fence. Operators must enforce the fence operationally, including any custom bootstrap automation outside standard PM2 resurrection. Pure/mocked tests do not certify host shutdown, database execution or backup recoverability. All other clients, even idle monitoring connections, block execution. Archives are read-validated but no restore is performed. Only the reviewed compiled database configuration shape and pinned PM2 implementation are supported. No automatic scheduler restoration is attempted. HTTP root success alone does not certify authenticated application/database health; manual read checks are mandatory.

Dataset safety caps are 100,000 examined Transactions, 10,000 patches per Transaction and 1,000,000 total string patches. Statement timeout is 60 seconds within conversion, lock timeout is five seconds and subprocess timeout is two minutes. Larger/slower datasets need separate operational review; no partially committed batching occurs. All code/schema/representation differences not expressly covered by this release-specific reversal require separate review.

## Changed files and verification

New tooling: `scripts/rollbackTransactionCategoryStorage.mjs`, `scripts/lib/categoryRollback.mjs`; new tests: `tests/unit/transactionCategoryRollback.spec.js`; this rollback document updated. Existing staged installer/deployment work is preserved and not staged again. Test/static results are recorded after final verification below.

### Rollback preparation verification (before installer integration)

- Focused non-database selection: **132 passed, 0 failed, 0 skipped**. Includes 78 new rollback tests, 38 existing Category amount/storage tests, 6 storage-admission tests and 10 installer seeding tests. Destructive database/process/swap behavior used inert adapters; filesystem fixtures were temporary test directories only. Actual CLI capture tests verified private unique output and no modification of the captured fixture release.
- Both TypeScript checks, repository ESLint, Knip and circular regression passed. Circular output contained only the accepted Lucid component and informational Node built-ins; no unexpected cycle or lint warning.
- Both script modules and the test file passed Node syntax checks. Working-tree and staged diff checks passed.
- The original staged diff SHA-256 is unchanged: `cb9654a75ae267226c878168f048abe5a880081ee9a4ff43f5c2cfbb34037a6a`. The four pre-existing staged files remain byte-for-byte intact. This document, both new tooling files and the new test file are unstaged. Existing unrelated untracked files were preserved.
- No production or sandbox PostgreSQL connection, conversion SQL, real rollback, PM2 invocation, installed-file modification, historical repair, schema migration, deployment or commit occurred. SSH inspection was read-only. No backup was created or restored during preparation.
- Real PostgreSQL, actual PM2 shutdown/resurrection, backup recovery and installed-directory rehearsal remain unverified and require separate sandbox authorization. This preparation is not production rollback acceptance.

### Automatic installer integration verification

- 98 focused non-database tests passed, 0 failures/skips: 10 installer-manifest cases, 78 rollback cases and 10 existing seeding cases. Tests execute the actual installer swap excerpt with inert node/rm/mv substitutes, verifying capture failure prevents deletion/swap, plus filesystem-only fixture captures and real capture CLI invocation. Fresh installations, unique records, previous/current validation, missing provenance and dirty build metadata are covered.
- Both TypeScript projects, ESLint, Knip, circular regression, shell/Node syntax checks and both diff checks passed.
- `./build.sh` succeeded, including Vite client assets and server compilation. Repeated build succeeded; packaged capture/helper files are byte-identical to their sources, and `build/release-source.json` records actual HEAD with `dirty: true`. Existing Vite chunk-size warning remains; no build failure.
- Integration changes: `install.sh0`, `build.sh`, `adonisrc.ts`; new `scripts/captureDeploymentManifests.mjs`, shared `scripts/lib/releaseManifest.mjs` and `tests/unit/installerManifests.spec.js`. Rollback script now imports/re-exports the extracted shared manifest function without changing its hashing/validation behavior. This document describes the automatic records.
- The staged snapshot SHA-256 remains `cb9654a75ae267226c878168f048abe5a880081ee9a4ff43f5c2cfbb34037a6a`. All integration edits remain unstaged; `install.sh0` has both the original staged changes and these new unstaged changes. No index modification or commit occurred.
- No actual installer/deployment, PostgreSQL connection, PM2 operation or historical conversion occurred. Only local builds and isolated temporary fixture operations ran. Full installed-host rehearsal remains separately authorized operational work.
