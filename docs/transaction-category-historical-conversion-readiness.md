# Transaction Category historical conversion readiness

## Deleted-state conservation policy

Conversion logic no longer contains or checks production Transaction IDs.
Supported, valid deleted records may be converted without passing conservation;
existing discrepancies and empty arrays are preserved. Failed/unsupported findings
remain visible as exceptions. Malformed amounts/structures/types and unsafe cents
still block. Nondeleted failures still block, and linked balance-tracked Accounts
remain excluded. Historical IDs below are evidence only, not exception criteria.


## Current interface — .env only, no manual plan

Run `node scripts/convertHistoricalTransactionCategories.mjs --env /absolute/sandbox.env`
for a read-only dry-run (or omit `--env` to use `.env`). No plan, application release
hash, installation directory or internal database identifier is supplied. The
script verifies the configured/live target and discovers database/cluster identity
automatically. Execution requires `--execute`. The verified `spendcraft_sandbox` database skips
PM2; other databases require all manifest PM2 processes to be stopped. There is
no confirmation, writer-attestation, external-backup or database-session check. Original-JSON snapshots and atomic,
unchanged-row-protected recovery remain separate from application rollback.

This supersedes plan/release-identity instructions in earlier historical records.
Local verification passed 281 focused tests, both TypeScript checks, changed-file
lint, Knip, circular regression, syntax and whitespace checks. Repository-wide
lint retains six unrelated generated-probe errors. No database connection or
historical conversion/recovery was run for this revision.
See [current commands](transaction-category-historical-conversion-implementation.md#running-directly-from-env).


## Portability revision — explicit sandbox support

The conversion/recovery tooling no longer depends on EC2 metadata, instance IDs,
AWS accounts, private IPs or Linux machine IDs. It supports an explicitly selected
local `sandbox` target restricted to `spendcraft_sandbox`, in addition to staging
and production. Database/cluster/role/port/peer checks, compatible-release checks,
exact confirmation, raw snapshots and unchanged-row recovery remain mandatory.
The revision passed 279 focused non-database tests and the relevant type/static
checks; repository-wide lint retains six unrelated generated-probe errors.
No database connection or conversion/recovery was performed for this revision.
See the [local sandbox procedure](transaction-category-historical-conversion-implementation.md#running-directly-from-env)
for plan format, `.env` requirements, release capture and commands. Prior EC2
inspection records below are historical evidence, not current tool prerequisites.


## Resumption — conversion-specific recovery approved

At source HEAD `ed696bc5587f9d6988e8fd8520e9691880d16cfd`, branch
`dollar-to-cents-2`, the operator reports compatible releases deployed to staging
and production. This is not fresh server/database evidence. The product revision
now approves recovery that retains that compatible application release and
restores exact original Category JSON from a pinned preconversion snapshot.

The converter/recovery CLI is
`scripts/convertHistoricalTransactionCategories.mjs`; policy helpers are in
`scripts/lib/historicalCategoryConversion.mjs`. It supports explicit plans,
read-only dry-run, separately confirmed execution, atomic conversion, durable raw
JSON snapshots, unchanged-row-protected atomic recovery and numeric/string/mixed
handling. No old release swap or automatic process operations occur.

The first-release rollback guard in
`installer/rollbackTransactionCategoryStorage.mjs` remains unchanged. Both
installed releases containing a codec is correctly rejected for that different
scenario and no longer blocks this approved conversion-specific recovery design.
Strict host-CIDR loopback handling is implemented/tested only in the new tooling;
the old rollback tool is not patched or reused for conversion recovery.

The historical 6,254-record / 6,241-candidate / 10,457-numeric-leaf findings below
remain historical reference counts, not fixed current expectations. All known
deleted exceptions remain preserved. No current production/staging audit has been
run, and **no historical conversion or recovery has occurred**.

See [implementation, recovery and staging procedure](transaction-category-historical-conversion-implementation.md)
for exact arguments, plan fields, original-JSON protection and future acceptance.
Local non-database verification passed 322 tests (88 new; zero failed/skipped),
both TypeScript checks, Knip, circular regression, changed-file ESLint and syntax/
whitespace checks. Repository-wide ESLint has six pre-existing errors in an
unrelated generated probe, left unchanged; full details are in the implementation
record. No application build is affected.
Fresh staging-only authorization and a complete synthetic staging rehearsal are
required next. Production requires later independent approval. The following
October 20 observations are retained as historical evidence, not current targets.

## Decision and scope

Read-only investigation on October 20, 2026, at HEAD `54b12f90fe7df23e640f9072255a6d574169fe2c`, branch `dollar-to-cents-2`. Tracked working tree and index were clean at entry. Existing unrelated untracked files were preserved.

**Historical conversion is not yet ready for execution.** Production data passed the applicable readiness checks, but the committed rollback identity guard rejects the actual PostgreSQL address text format. Correct and reverify that guard separately, then establish a fresh recovery point and a complete writer fence. No conversion is authorized by this document. No production behavior was changed.

The operator confirmed successful deployment and a successful sandbox rollback rehearsal. This is operator evidence; an independently identifiable rehearsal artifact/revision was not available. Current exact-script characterization below must be reconciled with that report before relying on rollback.

## Deployed release identity

Read-only SSH inspection identified production as `spendcraft.app`, root `/spendcraft-prod/server`. Current release source metadata names the exact HEAD above, built `2026-10-20T17:21:21.213Z`. Its `dirty:true` provenance flag prevents claiming a clean source build solely from Git metadata. Full filesystem release-manifest rehashes independently matched the recorded deployed bytes:

| Directory | Verified release identity |
| --- | --- |
| `spendcraft` | `40f2c52161ed9dd29d4e950510668cf2e3dbef5816d0b3db3e22e5ab7c65dee6` |
| `spendcraft.old` | `0ee52b77f682a65c12996573939c3abd2f3909242747f0a1898a4458a6327fa2` |

The deployment record is `releases/deployment-2026-10-20T17-23-05.170Z-XXTedC/deployment.json`, status `captured-before-swap`, captured `17:23:55.553Z`. This timestamp is not proof of the exact activation time. The current release contains the storage codec; the previous numeric release lacks it. Both directories remain available. The manifest includes code, dependencies and client assets, rather than relying on shared package version 4.1.0.

## Production database identity and read-only controls

Independently corroborated installed `.env` and local PostgreSQL configuration identified `localhost:5433/budget`, authenticated user `ubuntu`. These are production observations, not reuse of earlier test authorization. `.env` resolves outside the release to `/spendcraft-prod/server/spendcraft-env`; no credentials were printed or copied into evidence.

The successful connection verified database `budget`, user `ubuntu`, server port `5433`, server and client addresses `127.0.0.1`, and loopback TCP peer. The role is not a superuser. A dedicated read-only role was not established: read-only enforcement used startup `default_transaction_read_only=on` and an explicit repeatable-read READ ONLY transaction; both live read-only settings were `on`. The snapshot began `2026-10-20T17:43:32.121Z`. Only identity/catalog/application SELECTs and transaction control were issued. No application bootstrap, migrations, setup, cleanup, fixture writes or conversion SQL ran.

An initial identity-only probe failed closed because `inet_server_addr()::text` returned `127.0.0.1/32`. A subsequent probe used PostgreSQL `host(...)` to compare canonical addresses while retaining explicit target and TCP-peer checks. This was a probe correction, not a production code change.

## Raw storage and candidate inventory

A complete keyset scan examined 6,254 Transactions in one read-only snapshot. It issued 68 queries including identity/catalog checks and bounded 100-row pages; linked AccountTransaction authority and scoped Pool information were fetched in each page, without per-Transaction network queries. SQL reads raw allocation JSON; runtime decoding was tested separately.

| Transaction shape | Transactions |
| --- | ---: |
| Numeric amounts only | 6,241 |
| Canonical string amounts only | 1 |
| Mixed numeric/string | 0 |
| Empty arrays | 12 |
| Malformed amounts/shape | 0 |

| Allocation value classification | Count |
| --- | ---: |
| JSON numbers | 10,457 |
| Canonical two-decimal JSON strings | 1 |
| Noncanonical strings | 0 |
| Invalid types / missing amounts | 0 / 0 |

There are **6,241 candidate Transactions and 10,457 numeric leaves** under the approved scope and deleted-record policy. One Transaction is already string-only; empty arrays require no amount conversion. Thirty-eight Transactions contain 64 numeric leaves whose dollar values change under the approved per-entry rounding. There are zero additional candidate manual-review records and zero nondeleted conservation/unsupported exceptions. The three known deleted empty funding records remain unsupported for conservation, not malformed or conversion candidates.

The unique private local evidence directory is `category-conversion-readiness-ajar8i/` (not staged). `production-findings.jsonl` contains deterministic ID-ordered per-Transaction classifications, candidate flags, timestamps, provider labels and allocation/metadata/nonallocation fingerprints, followed by a complete summary. It excludes raw allocations, descriptions and credentials. `analysis.mjs`, `probe-body.txt` and `production-readonly-probe.mjs` preserve the analysis/probe; diagnostic and rollback-characterization JSON files preserve the relevant guard observations. Initial failed identity output is not a completed audit.

These are snapshot candidates, not a durable authorization list: regenerate immediately before a future conversion after writers stop. Retain the private evidence rather than committing production per-record information.

## Post-deployment writes and API compatibility

Verified active process starts range from `17:24:06.760Z` to `17:24:08.110Z`. No Transaction has a recorded created_at or updated_at after the conservative latter cutoff. However, investigation after operator feedback confirmed that the Transaction model does not maintain updated_at; that timestamp cannot exclude post-deployment edits. No newly created post-deployment record was identified by created_at. Do not create financial records to fill coverage gaps.

The operator confirms that the single string-only Transaction (7225, ordinary/Plaid) was edited after deployment and its amount changed from JSON number to string. Its stored creation/update timestamps both predate deployment because updated_at is not maintained by the Transaction model. Its read/conservation checks passed. This provides operator-confirmed post-deployment edit evidence paired with raw canonical-string storage evidence; it does not establish new provider-import writes. The earlier inference that the string representation predated deployment was incorrect. Installed codec execution produced numeric runtime allocation amounts for all 6,254 records, without saving models or rewriting rows. Actual mixed-storage production records were absent; mixed decoding remains supported by accepted test evidence.

The operator explicitly confirmed authenticated production read-only checks passed for existing Transactions, Category reports, Funding History and Income Vs. Expenses. Those are **operator-confirmed HTTP results**, distinct from agent database/helper observations. No credentials or tokens were supplied. The accepted PostgreSQL baseline remains 616 focused and 2,110 complete-suite passes, zero failures/skips; it is test-environment evidence for unobserved production writers, not a new production execution claim.

## Conservation results and historical comparison

Conversion/comparison uses each allocation's individually checked `Math.round(amount * 100)` cents, checked integer accumulation, and `(cents / 100).toFixed(2)` for prospective numeric-to-string encoding. Canonical stored strings are interpreted as exact decimal cents rather than blindly Number()-rounded. Ordinary types 0/5 and opening 4 compare same-sign split cents with the single scoped AccountTransaction decimal-text amount. Funding 2 checks `non-Pool cents + Pool cents = 0`; baseAmount is not authority. Rebalance 3 checks zero sum. Nominal conservation is independent of posting eligibility.

| Lifecycle | Passed | Failed | Unsupported | Total |
| --- | ---: | ---: | ---: | ---: |
| Ordinary 0/5 | 6,159 | 8 | 0 | 6,167 |
| Funding 2 | 39 | 2 | 3 | 44 |
| Rebalance 3 | 35 | 0 | 0 | 35 |
| Opening 4 | 8 | 0 | 0 | 8 |
| Total | 6,241 | 10 | 3 | 6,254 |

Zero malformed records; all failures and unsupported records are deleted. Compared with the accepted 6,247-Transaction baseline, totals and passes each increased by seven; numeric-plus-string leaves increased from 10,451 to 10,458. IDs 7262–7268 are additional passing ordinary Plaid records after the previously recorded 7261, all predating this deployment. Rounding-changed Transaction count remains 38. All eight opening records still pass.

Original detailed historical audit files were not available in the mentioned local artifact directories. Consequently, exact row-by-row historical modification/deletion/representation reconciliation cannot be certified. The current per-row fingerprints establish a new baseline, not proof that every earlier shared row is unchanged. Timestamp observations alone do not prove complete modification history. No inference of historical repair is made.

### Preserved historical exceptions

- Deleted ordinary empty allocations: 3974, 3975, 3977, 4116, 4262, 4412, 4413, 4415. All remain failed conservation with empty arrays.
- Deleted funding 4596 and 4597: each retains a +9-cent remainder after individual rounding.
- Deleted funding empty allocations: 2578, 3077, 3388. All remain unsupported for conservation, with empty arrays.

These 13 records require no invented allocations or redistribution. Future conversion can convert existing scalar amounts in 4596/4597 while preserving discrepancies; the eleven empty arrays remain untouched. No balances or linked amounts are adjusted.

## Writers and process evidence

| Process | Observed state and future maintenance action |
| --- | --- |
| `prod-server` | Live PID 554110, current `bin/server.js`, current release cwd, Node 24.15.0; started 17:24:08.110Z. Saved cron restart `0 0 * * *` must be disabled during maintenance. |
| `queue` | Live bash PID 554048 and Node child 554049, current release cwd; child runs `queue:listener`. Stop/drain and verify both parent and children. |
| `plaid-cleanup` | Live PID 554069, current ace entry point and cwd, `plaid:cleanup-listener`; started 17:24:07.210Z. Stop/drain during maintenance. |

Reviewed saved PM2 definitions and readable process identities matched current paths; no nonsecret database target overrides or old-release references were found among those inspected. PM2 commands were not run. Three same-user process cwd inspections were inaccessible; other users/hosts, independent schedulers and ad-hoc commands were not exhaustively ruled out. Therefore this is evidence for the named processes, **not a complete writer fence**. Before conversion, the operator must inventory/fence cron/systemd/external schedulers, provider sync/manual commands, all hosts/users and incoming write traffic. Do not rely on release directory names alone or on Budget locks to protect against an old process.

## Recovery and rollback readiness

The observed predeployment backup `/spendcraft-prod/server/backups/backup.sql` was 6,598,285 bytes, modified `2026-10-20T17:22:45.044627Z`; an older compressed backup also exists. No contents, restore, completion record or recoverability were validated. This is **not a sufficient fresh recovery point for a later conversion**. After writer fencing, create and verify a fresh backup using established tooling, preserve both application releases and record the understood/rehearsed recovery procedure. Never automatically restore a backup that would discard later legitimate activity.

Rollback script and tests remain available: `installer/rollbackTransactionCategoryStorage.mjs`, `installer/lib/categoryRollback.mjs`, `tests/unit/transactionCategoryRollback.spec.js`. Previous release availability and exact manifest identity were independently confirmed above. The operator reports sandbox rehearsal success; no attributable rehearsal result was available locally.

**Confirmed guard incompatibility:** rollback `verifyIdentity()` selects `inet_server_addr()::text` and `inet_client_addr()::text`, then compares with bare expected addresses. Actual production returns `127.0.0.1/32`. Its normalizer removes only IPv4-mapped IPv6 prefixes. A pure test of the actual helper with this observed identity and matching inert TCP stream rejects `live_database_identity_mismatch`. It fails safely before conversion, but cannot be certified executable against this target as written.

Smallest proposed separate correction: select `host(inet_server_addr())` and `host(inet_client_addr())`, retain strict database/user/port/TCP-peer checks, add IPv4/IPv6 address-format regressions, and rerun sandbox rehearsal on the exact corrected revision. Do not weaken target checks. No correction or rollback execution occurred in this read-only task.

Rollback also requires reviewed current/previous package compatibility, disabling scheduled resurrection, a fresh recovery point and complete writer shutdown as described in its existing procedure. Reverting binaries alone remains unsafe after string writes; no automatic reverse conversion is proposed here.

## Future conversion implementation and execution plan

No historical forward-conversion command has been implemented or executed by this task. Prepare it separately and obtain explicit execution approval only after readiness prerequisites are satisfied.

1. Fix/reverify the rollback guard separately; preserve exact release identities and attributable rehearsal evidence. Review all previous-release constraints.
2. Schedule offline maintenance. Fence incoming mutations and every writer source, drain jobs, disable automatic restarts, stop reviewed processes and verify children/independent writers stopped. Preserve definitions for controlled restoration. This is preferable to a long-running Budget-by-Budget live conversion because it permits one stable snapshot, atomic verification and an unambiguous recovery point without races with provider or replacement writes.
3. Verify explicit configured and live target, authenticated user, port and server/peer/TCP identities. Read credentials only from the explicit `.env`. Generate and print a private unique output directory before database work. Read-only rehearsal and eventual write execution require separate environment-specific authorization; missing arguments must never infer production.
4. Create/verify a fresh backup after fencing. Record backup completion, exact release identities and recovery instructions. Capture financial/nonallocation/metadata fingerprints, counts and the new complete conservation/candidate inventory.
5. Reject malformed, unsafe or unsupported nondeprecated ownership shapes. Review any new nondeleted conservation failures separately. Preserve the approved deleted exceptions. Never alter the policy to make records pass.
6. In one explicitly atomic transaction, reload supported types 0/2/3/4/5 and validate every amount. For each numeric leaf only, use the approved per-entry conversion and safe range/format checks. Validate canonical existing strings and leave them unchanged. Preserve empty arrays, ordered duplicates, metadata and every nonamount field. Construct SQL JSON leaf patches against the original JSON, without ORM replay, financial mutation or replacement of unrelated fields. Fail closed on any inconsistency. Dataset size here is modest; if runtime/disk limits make a single transaction unreasonable, stop for an explicitly recoverable batching design rather than improvising partial conversion.
7. Before commit verify exact candidate coverage, unchanged metadata/order/IDs/status/dates, canonical string values, exact expected cent meaning and unchanged financial snapshots/counts. Conservation outcomes must match the precomputed per-entry-rounded outcomes, including the deleted discrepancies. Roll back the entire conversion on any failure.
8. Verify committed raw JSON and numeric API reads while writers remain fenced. Restore only reviewed compatible processes/schedules, monitor errors and provider behavior, and retain all evidence/recovery points. A startup or smoke failure stops further automated changes; no automatic older binary/database restore.

The Budget row remains the sole explicit application-level serialization lock. No explicit locks on Transactions, Accounts, Categories or provider rows and no advisory locks are introduced. Offline maintenance avoids reliance on cooperative live writers; any later live-conversion alternative must use the existing Budget protocol, reload after waiting and prove every writer cooperates. Ordinary implicit PostgreSQL write/constraint locks remain expected.

The procedure is idempotent: canonical strings are validated no-ops, numeric leaves convert once, empty arrays remain empty. A repeated run must not round canonical strings again. No conservation gate should repair or reject the approved deleted historical exceptions solely because they fail conservation.

## Future acceptance matrix

- Every eligible allocation amount in supported scope is a canonical two-decimal string; no numeric leaves remain. Empty arrays and deprecated exclusions are unchanged.
- Numeric/string/mixed and repeated-run fixtures preserve order, duplicates, optional metadata and all nonamount properties; malformed/overflow cases fail atomically.
- Ordinary, funding, rebalance and opening conservation is unchanged under individually rounded cents. All eight opening records remain supported; all 13 deleted exceptions retain their approved content/status/discrepancies.
- AccountTransaction amounts, Account/Category/Pool balances, Statements and unrelated financial state match pre-conversion snapshots; no Transaction is created/deleted and no unrelated monetary field changes.
- Raw JSON inspection and numeric API/client read compatibility pass; Category, Funding History and Income Vs. Expenses authorities remain unchanged. No read-triggered normalization.
- Failure/rollback, interruption, tenant isolation, writer fencing and any proposed Budget serialization are verified in separately authorized tests before production execution.
- Verified fresh recovery point, exact previous/current releases and usable rollback procedure remain available. Preserve legitimate postdeployment activity; never silently restore an old backup.

Loans and the entire legacy relational allocation architecture remain deprecated and excluded regardless of references. This investigation does not inventory, migrate or repair them.

## Verification, evidence and limitations

Focused existing non-DB tests ran in a standalone Japa runner without application/database bootstrap: `categoryAmountStorage.spec.js`, `transactionCategoryCentAudit.spec.js`, `transactionCategoryRollback.spec.js`: **211 passed, zero failed/skipped**. Additional local probe-helper assertions (16 cases) and the pure actual rollback-guard failure characterization passed. The passing existing suite does not cover the observed CIDR-address guard failure; it is not evidence that rollback is ready.

No TypeScript/runtime/build inputs changed; no production build or database-backed test was required or executed for this documentation/evidence task. Both Git diff whitespace checks passed. The final tracked addition is this document, unstaged; private investigation artifacts are an untracked directory. Existing unrelated untracked files and the clean index were preserved.

Remaining prerequisites: rollback identity correction/rehearsal, complete operational writer fence, fresh verified recovery point, a separately implemented/tested forward conversion tool and explicit conversion authorization. Production evidence includes the operator-confirmed post-deployment edit of 7225 and its raw string storage. Post-deployment creation for each lifecycle remains unobserved. updated_at cannot be used as a reliable modification watermark until separately corrected. Exact historic per-row reconciliation remains limited by absent original artifacts. None justifies historical repair or broader monetary changes.

No production database modification, destructive database operation, historical conversion/repair, schema migration, unrelated representation change, service restart, deployment or commit occurred. Read-only investigation authorization does not authorize subsequent conversion or rollback.

## Follow-up: stale Transaction update timestamp

The operator reported that 7225 was edited after deployment and observed number-to-string conversion. Source investigation at the same HEAD identifies the cause in `app/Models/Transaction.ts`: the class extends Lucid BaseModel directly, declares createdAt, but declares no updatedAt column and no autoUpdate timestamp. `TransactionsController.update` merges categories/comment/date/version and calls save without setting updated_at. `database/migrations/1626491435592_transactions.ts` defines updated_at DEFAULT now(); this initializes inserts, not subsequent updates. No timestamp-update trigger is defined in repository migrations. Live trigger state was not queried in this follow-up.

Lucid's installed initiateAutoUpdateColumns implementation only updates declared datetime columns with meta.autoUpdate. This is a longstanding model omission: the parent of the storage release also lacks updatedAt, rather than a string codec regression. Storage binding preserves dirty allocation state and the controller can therefore persist strings while leaving the old update timestamp. Existing version increment and TransactionLog writes are independent modification evidence, although this follow-up did not query production logs.

A standalone direct import of the real Transaction model could not run without Adonis application initialization (Lucid db service app.booted error); it made no database connection. A subsequent non-DB characterization asserted absence of updatedAt/autoUpdate in the actual source and exercised real Lucid BaseModel timestamp preparation with equivalent missing metadata, plus an autoUpdate-enabled control: the missing mapping emits no timestamp, while the control generates one. This is source/framework evidence, not a real endpoint persistence test.

Smallest proposed runtime correction, not implemented: add `@column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null }) public updatedAt: DateTime` to Transaction and test actual CREATE/PATCH/replacement and metadata-only saves. Query-builder/raw UPDATE paths bypass model timestamp automation and must be considered separately if promising universal modification tracking. Do not backfill historical timestamps with invented update times. No production runtime or schema correction was made.

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
