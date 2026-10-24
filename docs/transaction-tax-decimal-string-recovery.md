# Transaction Tax release recovery

> Current finalized policy: one-way rollback consumes old, verifies filesystem restoration, starts and health-checks the restored application, then removes the outgoing temporary tree. Success leaves only current. Earlier exchange/early-cleanup descriptions below are historical; use the finalization section. Deployment remains separately unauthorized.

Date: 2026-10-23. Source HEAD: `d62834c4202223557bbffd83cbdc1caffee97553`, branch `dollar-to-cents-2`. Recovery guard changes are uncommitted and not deployed.

## Approved simplified recovery policy

The operator rejected automatic preserved recovery copies. The installer keeps its established layout:

- `$SPENDCRAFT_ROOT/spendcraft`: current release.
- `$SPENDCRAFT_ROOT/spendcraft.old`: previous installed release.

No additional full application copy, recovery-point directory, preservation CLI or alternate-target plan is created. Each deployment rotates the previous installation as before. Retain the exact deployment packages under the existing operational procedure; they are not automatically selected as rollback targets.

Ordinary application rollback restores `spendcraft.old` only when its compatibility and existing safety checks pass. If the previous release cannot safely read tax strings, rollback stops. Keep the compatible current application and prepare/test/deploy a compatible forward correction. A forward correction uses the established build/deploy process with separate authorization; it is not a new recovery command or a directory swap to an arbitrary saved release.

No automated database reversal/restoration is provided. Preserve all legitimate post-deployment Transactions, tax edits, provider imports and balances. A data-corruption incident needs separately approved affected-data recovery with a verified recovery point, complete writer shutdown and unchanged-row protection. A stale full database backup must not be restored automatically.

Even before the first tax-string write, the tool conservatively rejects an unknown predecessor. It does not infer safety from the absence of observed string rows. Restoring an older numeric-only release would require separate positive database/release compatibility evidence and a separately reviewed procedure. There is no override.

## Observed installed releases

Existing authorized SSH access was used for **read-only file inspection** of both hosts. Commands read public build metadata and hash named compiled files, client asset manifests and PM2 manifests. No PostgreSQL or PM2 command ran. Private evidence is in `script-output/tax-recovery-preparation.rwRsXh/{production,staging}-inventory.json`.

| Installation | Root | Source label | Build timestamp (UTC) | Dirty |
| --- | --- | --- | --- | --- |
| Production current | `/spendcraft-prod/server/spendcraft` | `5d98bbc558b8af21f6482805510e684acbcf3489` | 2026-10-23T14:04:30.556Z | true |
| Production previous | `/spendcraft-prod/server/spendcraft.old` | `2259bb6d152edc01dfc0093aae9d4267667ac13a` | 2026-10-23T01:30:01.068Z | true |
| Staging current | `/spendcraft_staging/server/spendcraft` | `5d98bbc558b8af21f6482805510e684acbcf3489` | 2026-10-23T14:04:30.556Z | true |
| Staging previous | `/spendcraft_staging/server/spendcraft.old` | `5d98bbc558b8af21f6482805510e684acbcf3489` | 2026-10-23T13:59:49.626Z | true |

Observed hostnames were `ip-172-31-4-3` (production) and `ip-172-31-10-95` (staging). These observations are not a substitute for verifying the intended EC2 instance/SSH host, installation root and database immediately before an authorized operation. No machine-ID requirement is added.

All four installed trees had identical observed Transaction model, Transaction PATCH controller, tax report controller, three Category boundary and client-manifest hashes. All lacked the three new tax boundary files. The Category codec hash matches the accepted Category boundary; tax report controller hash matches the new release's unchanged reporting controller. **No full installed-tree inventory or authenticated API smoke test was performed in this task.** Source labels marked dirty cannot identify every installed file. Exact build archive identities for these older installations remain unknown.

`release-source.json` identifies source commit/dirty state/build time. The saved local package manifest identifies the archive SHA-256 and installer template. Deployment records hold complete post-dependency-installation release manifests. `releaseManifest()` independently verifies complete server/dependency/client contents and resolved external-secret links; its SHA-256 identifies the actual installed tree. Vite's `public/assets/.vite/manifest.json` maps the client entry to emitted assets; complete file hashes establish their versions. Do not equate these identities or assume `spendcraft.old` is HEAD's parent.

### Compatibility matrix

V = verified compatible by accepted PostgreSQL/runtime tests of the new source boundary; S = source-supported but not exercised against these installed instances during this task; U = unknown, **not approved** as a recovery target. An absent decoder is insufficient to certify compatibility, so unknown is rejected. V does not mean the new release has been deployed.

| Release | Numeric Categories | String Categories | Numeric tax | String tax | Numeric API for all accepted storage | Tax reports | Tax editing with strings | Preserve unrelated state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Production current | S | S | S | U | U | S | U | S |
| Production previous | S | S | S | U | U | S | U | S |
| Staging current | S | S | S | U | U | S | U | S |
| Staging previous | S | S | S | U | U | S | U | S |
| New d628 tax boundary | V | V | V | V | V | V | V | V |

The source predecessor passes stored tax values through without the new decoding/storage-binding boundary. It is not certified to expose numeric tax API values when storage contains strings. Its SQL `->>`/`real` report extraction is source-compatible with both shapes; this does not make the entire old application compatible. New release evidence: 45 prepared PostgreSQL cases, 1,269 expanded focused tests, one additional Category preservation case and full suite 2,807 passed, no failures/skips/pending. These overlapping selections are not additive.

## Compatibility safeguards

`installer/tax-storage-profile.json` contains reviewed SHA-256 hashes for nine emitted production files: Transaction model, Transaction PATCH and tax report controllers, three tax boundary files and three Category boundary files. `installer/lib/taxReleaseRecovery.mjs` recognizes this boundary against complete, internally consistent release manifests. File presence, source labels and self-declared capabilities are insufficient.

The application-only rollback executor requires the reviewed storage boundary in both current and previous releases before database access or process shutdown, and rechecks complete identities before swapping. Unknown tax compatibility fails with `tax_storage_compatibility_unknown`; ordinary plan generation publishes an unavailable plan. Plans from the abandoned preservation design with `recoveryIdentity` are explicitly rejected. There is no alternate-target flag or automatic fallback selection.

This conservative profile is release-specific. A future compiler/protected-file change needs explicit compatibility review and an updated reviewed profile with tests. Do not regenerate it automatically to suppress a guard failure. Other release/config/schema differences still require the existing full manifest checks and operator review. This slice does not claim that identical protected bytes prove compatibility of arbitrary unrelated application changes.

The immutable maintenance bundle includes the helper/profile and existing executor. Existing Category, bundle identity, target, `pg`/`pgLog`/execution connection, socket peer, PM2 runtime/definition, writer shutdown, child-process, backup, directory swap, confirmation and smoke-test safeguards remain. Script output uses unique `script-output/` subdirectories.

The first-Category-release converter at `installer/rollbackTransactionCategoryStorage.mjs` and its guard remain unchanged. It serves a different release pair and is never selected for this tax recovery procedure. Historical conversion recovery remains separate.

## Future operational procedure

No deployment, rollback, PostgreSQL connection or PM2 operation is authorized by this document.

1. Before deployment, independently verify the EC2/SSH host, explicit environment, canonical installation root, current/previous complete release manifests, saved build archive/template identity, PM2 names, database identity and backup paths. Source labels marked dirty are insufficient. Existing deployment records and `releaseManifest()` identify complete files/dependencies/client assets and external secret-link targets. Unknown or incomplete identity stops the operation.
2. Verify available disk space and a fresh completed, readable backup/recovery point. The installer produces a plain SQL dump with completion/checksum evidence; the rollback executor uses its existing verified custom dump. A checksum alone does not prove restore recoverability. Do not copy production data into staging.
3. Identify/fence all financial writers and traffic. Manifest processes are `queue`, `plaid-cleanup`, `prod-server`; inspect actual daemon/process definitions, children, cron restarts and external writers. Do not stop unrelated applications. Existing legacy installer fallback may stop all processes in its daemon when the installed release lacks the manifest, requiring operator review.
4. Deploy only the reviewed saved artifact, decline schema migrations for this release and choose SKIP seeding. The ordinary installer rotates current/old directories without a preserved recovery copy. Verify startup and authenticated health before permitting new activity.
5. If recovery is needed, inspect the exact installed-release bundle and generated default plan. The stable entry point remains:

   ```sh
   "$SPENDCRAFT_ROOT/maintenance/rollback.sh" --dry-run
   ```

   Existing read-only database/process inspection and private evidence generation are required. Do not infer a successful plan from an earlier deployment. Unknown tax compatibility makes rollback unavailable before execution.
6. Only if the intended `spendcraft.old` passes all guards, obtain fresh environment-specific authorization and use:

   ```sh
   "$SPENDCRAFT_ROOT/maintenance/rollback.sh" --execute
   ```

   Existing exact-target confirmation, writer fencing, PM2 source/runtime/cron checks, stopped-state persistence, independent DB identities, backup, staged-copy verification, journal, restart decision and authenticated smoke remain. The executor may stage/retain directories during an explicitly authorized rollback for interruption safety; this is distinct from automatically keeping a full recovery copy for every deployment.
7. If compatibility fails, stop rollback. Retain the current compatible release and make a tested compatible forward fix. If it is unhealthy, keep affected writes/traffic fenced while investigating. Do not invoke an older bundle, fabricate identity evidence, remove guards, reverse tax JSON or restore a stale database.

For errors before new tax writes, the previous release still requires positive compatibility evidence. After new tax writes, never return automatically to an unrecognized predecessor. On interrupted application rollback, keep writers stopped, preserve directories/journal and review exact state before resuming. Missing/incomplete files or config/schema changes are stop conditions. No machine-ID restriction, new financial lock, database repair or automatic database restoration is introduced.

## Prepared staging rehearsal — not executed

Target: `staging.spendcraft.app`, independent root `/spendcraft_staging/server`. Obtain fresh authorization for fixtures, backups, deployment/process control, rollback and cleanup. Independently verify host/root/environment, configured/live/execution DB identities, PM2 selection, backup paths and complete release identities before destructive phases. No production authorization is implied.

`tests/fixtures/taxRecoveryRehearsal.json` is a declarative synthetic specification, not an import command. Map its Category/tax identifiers to staging-owned fixtures. It covers ordinary/manual, funding, rebalance, opening, numeric/string/mixed taxes, duplicate allocations/attributions, empty taxes and fractional-cent PATCH input. Production codecs validate the specification in non-DB tests. Active Category conservation remains required; no tax conservation equality is invented. Legacy raw numeric/mixed setup needs separate safeguarded authorization; prefer existing supported APIs for new activity.

| Scenario | Acceptance |
| --- | --- |
| Failure before new tax writes | Prior/current release identities and failure state are recoverable; unknown predecessor remains blocked; any exceptional pre-write restoration requires separate evidence/review. |
| Successful deployment and tax writes | Canonical raw strings, numeric API responses, reports and financial/Category noninterference pass; no extra recovery copy exists. |
| Incompatible rollback attempt | Actual numeric-only predecessor is rejected before DB access/process shutdown; default launcher reports unavailable. |
| Compatible ordinary rollback | In a later compatible release pair, target is exactly `spendcraft.old`; all existing safety checks apply; raw database financial state remains unchanged. |
| Compatible forward fix | Build/test/deploy the correction through the existing installer, preserving tax-string compatibility and all legitimate new activity; no DB restoration or historical conversion. |
| Interrupted deployment/rollback | No automatic unsafe restart/fallback; existing directory/journal evidence retained and reviewed; no per-deployment preservation mechanism assumed. |
| Legitimate new financial activity | New synthetic Transaction, tax replacement and metadata edit all survive compatible rollback/forward fix; raw Categories, AccountTransactions, balances and counts stay unchanged except for intended test activity. |
| Isolation/missing artifacts | Wrong environment/root/host/DB/PM2/backup/release or incomplete dependency/client evidence stops the operation. |

Capture raw before/after financial snapshots and legitimate new activity separately. Do not use real financial data. Staging does not currently have an approved compatible prior tax release; scenario testing that needs one must first establish a reviewed compatible release pair. It must not bypass the guard.

## Remaining gates and changed files

Review/commit the simplified guard changes in a separate task, build once from clean intended source, verify full installed identities and runtime/backup/capacity, then authorize/run the staging rehearsal. Production needs acceptance of that same saved artifact and separate approval. Historical tax conversion stays deferred.

Changed tooling: `adonisrc.ts`, `installer/generateRollbackPlan.mjs`, `installer/prepareRollbackBundle.mjs`, `installer/rollbackApplication.mjs`, new `installer/lib/taxReleaseRecovery.mjs`, `installer/tax-storage-profile.json`. Tests: updated `applicationRollback.spec.js`, `installerRollbackBundle.spec.js`; new `taxReleaseRecovery.spec.js`, helper `taxRecoveryRelease.js`, fixture `taxRecoveryRehearsal.json`. Documentation: this file and the deployment addendum. Installer rotation/ordinary plan target remain unchanged. The preservation-only CLI, alternate-target plan support and preservation tests were removed before deployment. The index and unrelated user files remain untouched.

## Verification of the simplified design

343 focused non-database tests passed, zero failures/skips/pending. Both TypeScript checks, changed-file ESLint, Knip, circular regression, Node/shell syntax, server build and both diff whitespace checks passed. All nine emitted storage-boundary hashes still match the reviewed profile; the removed preservation CLI is absent from the build. Client runtime/assets were unaffected by this revision; the earlier passing client build and its existing chunk-size warning remain the applicable baseline. No database-backed tests were run.

Logs: `script-output/tax-recovery-simplification-d6c9twca/`. The index remains empty; unrelated work was preserved. No database connection, historical conversion, process control, installed-release modification, deployment or commit occurred.

## Staging execution preflight — 2026-10-23T23:56:39.803858+00:00

**BLOCKED: no staging execution was authorized or performed.** Exact HEAD remains `d62834c4202223557bbffd83cbdc1caffee97553`, branch `dollar-to-cents-2`. Thirteen recovery/tooling/test/documentation files were already staged at task start. Their index entries remain unchanged; this preflight only appends unstaged documentation evidence. Unrelated untracked files are untouched.

### Fresh read-only staging evidence

Existing strict-known-host SSH access was used only for filesystem/process-presence inspection and EC2 IMDSv2 identity metadata. No remote files were written; no PM2 command, database connection, installer, migration or seeder ran. No production connection occurred.

- EC2 identity: `i-0b24684c411b4b829`, region `us-west-2`, private IP `172.31.10.95`, hostname `ip-172-31-10-95`; accessed through the configured staging SSH target. Root independently resolves to `/spendcraft_staging/server`; shared APP_URL is `https://staging.spendcraft.app`.
- Filesystem available: 2,926,952,448 bytes (approximately 2.73 GiB), total 4,143,677,440 bytes. This is fresh availability evidence, not proof that all deployment/backup/rehearsal peaks fit.
- Exactly `spendcraft` and `spendcraft.old` were observed as release directories. The current installer rotates only these two completed installations, using `spendcraft.new` during installation. No preserved-copy feature or alternate recovery target is present in the staged implementation.
- Current complete installed manifest identity: `abe55d888b4119cb96d832b1cdf1465eabd09e38271b3ef54845543b6fd175c8`.
- Previous complete installed manifest identity: `b261e79dc7395bef240743993318a372e3209f37fef93860ceb8273658afb662`.
- Both source labels are `5d98bbc558b8af21f6482805510e684acbcf3489`, dirty=true, built respectively `2026-10-23T14:04:30.556Z` and `2026-10-23T13:59:49.626Z`. Distinct full identities establish why source labels alone are insufficient. Real compiled Category codec/binding/storage and unchanged tax-report hashes match the reviewed components; model/PATCH bytes match the prior numeric-tax implementation. Both releases lack the three tax boundary modules.
- Capability assessment for both installed releases: Category numeric/string support and numeric tax reads are source-supported, not freshly runtime-verified. Tax reports' unchanged SQL extraction is source-compatible. Tax-string numeric API/editing safety is unapproved/unknown and fails the new guard. The new tax source retains the accepted PostgreSQL compatibility baseline, but is not installed.
- Configured staging connection: localhost:5432, database `spendcraft`, role `ubuntu`. This is configuration evidence only. The database uses the same name that may appear in another environment; host isolation must be checked independently. **Live database/user/server/peer/execution identities were not queried.** With the architecture/artifact blockers below, database verification and execution preparation stop here. Never infer database identity solely from hostname or these env settings.
- PM2 daemon PID 49118 was present and running; three Node processes were observed with current-release cwd, PIDs 115426, 115432 and 115433. Both release manifests specify queue, plaid-cleanup and prod-server, including the nightly server restart. Actual daemon process-to-definition mapping, child/writer inventory and cron maintenance admission still need verification. No PM2 CLI was invoked to avoid daemon side effects.
- Backups are present under `/spendcraft_staging/server/backups`; latest observed directory `database-backup-MeTelm` contains a 61,112-byte SQL file, summary and empty stderr log. Existence/size are not completion/checksum/readability/restore proof. A fresh verified recoverable backup remains required before execution; no backup or restore was performed.

### Concrete design and artifact blockers

1. **Rollback still retains an extra application directory.** `installer/rollbackApplication.mjs` selects `spendcraft.old`, but its existing swap routine uses `spendcraft.rollback-stage-*` and moves the current release to `spendcraft.forward-recovery-*`. `installer/lib/applicationRollback.mjs::swapDirectories` leaves that retained copy after success, alongside restored current and unchanged old. This contradicts the task's prohibition on additional retained release slots. Earlier statements that the removed per-deployment preservation feature solved the entire two-directory requirement were incomplete. No production correction was made in this preflight. The smallest required design correction is a reviewed, journaled compatible-rollback swap that completes with only current/old slots and has explicit interruption semantics, followed by regression coverage. Do not silently delete the retained release or weaken interruption checks.
2. **No exact deployable candidate contains the staged guard yet.** HEAD has the accepted tax runtime, but guard/profile/bundle changes are staged and uncommitted. The nine existing local saved packages predate the tax commit; the latest is a dirty `5d98bbc` build. No artifact is approved for deployment and no package was generated or copied. Review/commit the intended recovery correction under separate instructions, then build once from its clean pinned source and verify archive/template identities and unchanged accepted monetary runtime.
3. **Execution preconditions remain incomplete.** Positive live staging database/execution identity, fresh backup recoverability, full PM2 writer/cron admission and deployment disk-space peak must be established after the design/artifact blockers are resolved. The installed pair cannot serve as a compatible-tax rollback pair; prepare genuine compiled compatible releases for that separate scenario, without fabricating metadata.

### Guard and rehearsal findings

The staged tax guard rejects unknown current/previous protected bytes before creating database clients or stopping processes. It is repeated with existing full manifest/config/schema/Category safeguards before swaps. Old alternate-target plans are rejected, no generic bypass is added, and legacy first-Category-release conversion guards remain unchanged. Local positive/negative compatibility tests exercise real emitted production components and actual guard callers. These passing predicates do not make the extra-directory swap policy compliant.

After resolution, the future staging sequence remains: obtain fresh explicit staging execution approval; deploy one exact reviewed saved artifact; decline migrations and select SKIP seeding; restart only manifest staging writers; verify synthetic numeric/string/mixed tax reads, raw canonical tax PATCH storage/Math.round behavior, numeric API/report behavior and Category/balance noninterference. Attempted incompatible rollback must reject with database, processes and directories unchanged. A compatible pair may be tested without a real swap first; any actual swap/failure injection requires separate execution authorization and the corrected two-slot semantics. Capture interruption states before rotation, before restart and after startup; if the only compatible installed release is unavailable, stop and require a reviewed forward correction. No redundant copy, tax reversal or automatic full-database restore is permitted.

Production deployment remains unauthorized, and historical tax conversion remains deferred. No execution-approval request is made while these blockers remain; resolve the recovery design and artifact first, complete the outstanding read-only gates, then request fresh staging-only authorization.

### Fresh local verification and Git preservation

343 focused non-database tests passed, zero failures/skips/pending. Both TypeScript projects, changed-file ESLint, Knip, circular regression, server and client builds, Node/shell syntax and both diff checks passed. Existing client >500 kB warning remains. The previously documented unrelated private-artifact lint errors were not modified or suppressed. No PostgreSQL tests ran. These checks do not supersede the identified policy mismatch.

Private evidence: `script-output/tax-staging-preflight-ua8mvwa5/` (inventory, package metadata, logs and final Git status). Only the two requested documentation files receive new unstaged addenda. The 13 staged files and unrelated user work are preserved. No staging or production database, PM2 process, installed application or AWS resource was modified. No historical conversion, schema migration, deployment, seeding or commit occurred.

## Finalized two-directory swap — supersedes the preflight design blocker

Starting HEAD for this correction: `1a9d382d1f9dd06019a67c8aca407afce27ebe86`, branch `dollar-to-cents-2`. The tax compatibility guard was already committed there (parent tax implementation `d62834c4202223557bbffd83cbdc1caffee97553`). The index and tracked tree were clean at task start; only unrelated untracked editor/key/backup/scratch files existed. This section supersedes the earlier staged-guard/artifact and third-directory findings once the finalized artifact receipt is verified. No remote access occurs during this correction.

### Implementation and admission

The normal application-only rollback now **exchanges the two original directories** rather than copying the previous release and retaining a third recovery tree. After independent admission, stopped writers and a verified fresh backup:

1. Reverify both complete installed identities against the admitted pair and ensure the temporary path is absent.
2. Durably journal `swap-pending`, including live/old/temporary paths and identities.
3. Rename `spendcraft` to `.spendcraft.rollback-swap-<run>`; sync the root directory; journal `current-release-temporary`.
4. Verify the expected previous tree and missing live destination, rename `spendcraft.old` to `spendcraft`; sync; journal `previous-release-promoted`.
5. Verify the expected outgoing tree and missing old destination, rename the temporary path to `spendcraft.old`; sync; verify both resulting full identities and temporary absence; journal `two-directory-swap-completed`.
6. Only then offer the existing explicit startup approval and start the restored release's process definitions. Failure during startup triggers the existing stop/fail-closed handling; no database restore/reversal occurs.

Every rename is atomic individually; the three-rename sequence **is not one atomic exchange**. A synced journal and independent identity checks support manual interruption recovery. No release is deleted or copied. The temporary directory is only an in-progress rename location and disappears on success. It is never a persistent recovery slot or an alternate rollback target. Both original trees, including client/dependencies and unchanged external-secret links, survive at their established same-parent paths. There is no `spendcraft.forward-recovery-*` or previous-release staged copy in the normal executor. The excluded legacy first-Category-release executor remains unchanged for its distinct historical scenario; do not select it for this release.

Tax/Category/profile/full manifest/config/schema/bundle guards remain ahead of database client construction, PM2 shutdown, execution journaling and directory mutation. An unknown/incompatible predecessor returns diagnostics only: financial records, PM2 and release directories are unchanged. There is no generic bypass or numeric tax reverse conversion. A compatible fallback requires actual reviewed compiled support, not edited metadata. The profile is conservative and release-specific; future protected-file/compiler changes need explicit review rather than automatic regeneration.

### Interruption and retry table

Let A be the outgoing current identity, B the admitted previous identity, T the one temporary rename path. Journal entries may lag the last rename if interruption occurs between the operation and its journal write. **Inspect actual full identities at all locations; never trust a phase label alone.**

| Last completed rename | `spendcraft` | `spendcraft.old` | T | Required disposition with writers stopped |
| --- | --- | --- | --- | --- |
| None | A | B | absent | No filesystem change. Preserve journal/evidence; reauthorize and review before a new attempt. |
| First | absent | B | A | Both trees remain complete. Following fresh host/root/DB/writer/identity verification and explicit manual recovery authorization, completing means move old B to live, then T A to old. |
| Second | B | absent | A | Live B is complete, but do not restart before review. Verified manual completion moves T A to old. |
| Third, before journal completion | B | A | absent | Exchange is already complete. Verify both identities, preserve the incomplete journal and document completion; never repeat the original swap blindly. |
| Journal completed, before restart | B | A | absent | Complete two-directory state; authorize restored startup only after all health/identity conditions are satisfied. |
| Restart failed/partially started | B | A | absent | Existing failure handling stops managed writers; inspect actual daemon/process state, retain journal and investigate. Never auto-resume traffic or perform another swap. |

Before admission failure, no stop/journal/swap is allowed. Between admission and shutdown, confirmation or initial journal failure leaves directories unchanged. Shutdown/backup failures keep existing complete directories and writers stopped. No failure path discards a release or restores the database. The executor refuses an existing journal or temporary path before proceeding; stale plans also fail exact current/previous/bundle identity checks. A second intentional rollback needs a newly verified/reviewed release-bound plan, compatible reversed pair, and archived prior journal after explicit operational review; **the old execution plan is not reusable**. The helper's repeated-exchange test does not authorize bypassing these executor requirements.

Manual completion is a separately authorized operation, not an automatic resume mode. Capture each location with the immutable verified bundle's filesystem-only `--capture-release` mode (which does not access PostgreSQL), compare identities with the original admitted manifests and journal, positively verify the same filesystem/root and stopped writers, and reject missing/unexpected/duplicate identities or occupied destinations. Sync the parent after each authorized rename and preserve all journal evidence. Do not issue generic rm/cp commands, synthesize manifests, delete the temporary path, or restart an unverified tree. If identities cannot be established, stop. No additional financial or advisory lock is introduced.

### Installer and database boundaries

The existing installer is unchanged: capture manifests before rotating, remove the older `spendcraft.old`, rename installed current to old, promote incoming `spendcraft.new`, then separately approve startup. That installer replacement behavior cannot be copied into rollback because deleting old during rollback would discard the required target. The corrected rollback instead exchanges both existing trees without deletion. Temporary installer unpacking and swap paths are permitted; only current/old persist after success. No schema migration is needed: decline execution at Ace's prompt and choose SKIP seeding. Historical tax conversion remains separate.

The backup remains a verified read-only logical dump. All configured/live pg, pgLog, execution/socket identity, PM2 runtime/definitions, child shutdown, cron/stopped-state and fresh backup checks stay in place. Legitimate post-deployment data is neither read into an ORM rewrite nor restored from an older backup. Money arithmetic, API types, schemas and the accepted tax runtime remain unchanged.

### Verification and artifact provenance

New `tests/unit/applicationRollbackSwap.spec.js` exercises actual production swap/guard helpers using complete temporary releases with real emitted tax/Category/model/PATCH/report files, distinct client/server fixture identities and external-secret links. It checks positive exchange, repeated exchange after readmission, every rename boundary and journal/sync failure, guard/missing-file/invalid-manifest rejection, restored startup, failed startup and financial-sentinel nonmutation. Separate child processes exit immediately after each of the three real renames, leaving both trees independently identifiable. Manual completion of observed intermediate states is exercised in temporary directories. These are process interruption tests, **not claims of physical disk/power-loss testing or EC2 rehearsal**. Root/journal fsync ordering is explicit in production.

Final test counts and artifact receipt are recorded with this task's local evidence at `script-output/tax-two-directory-finalization-per_cpsz/`. The release source commit is the commit containing this finalized correction; its exact hash is captured after commit together with the immutable package ID, archive SHA-256 and target installer hashes in `artifact-receipt.json`. These generated identifiers cannot be embedded into their own source commit. The public package's `release.json` and `release-source.json` are the authoritative artifact provenance records.

Package from a clean detached checkout of the finalized commit using the existing `bash build.sh`; do not package this user's unrelated untracked files. Verify source `dirty:false`, hashes of committed rollback helper/executor/profile/bundle code and all nine accepted compiled monetary boundary files inside the ZIP, absence of credentials/backups, and integrity of the saved template/archive. Generate target-specific installers locally from that same saved package without scp/SSH; do not deploy them. Keep the clean checkout and exact saved package available for later approved promotion.

Remaining staging gates: fresh actual EC2/SSH host, canonical root, configured/live/execution database identity (including role/port/server/peer), verified backup recovery, capacity, full PM2/cron/external-writer inventory, exact installed release pair, and separately approved synthetic rehearsal. Historical staging observations are prior evidence only; no server is accessed now. Both prior installed staging releases lack tax decoding, so the expected initial rollback is rejection; a genuinely compatible pair is required for real exchange testing. Production remains untouched and unauthorized until same-artifact staging acceptance and separate approval.

Local finalization checks: **377 focused non-database tests passed**, zero failures/skips/pending, including **34 new two-directory swap cases**. Both TypeScript projects, changed-file ESLint, Knip, circular regression, server/client builds, syntax and both diff checks passed. The client >500 kB bundle warning is unchanged. No PostgreSQL tests or remote inspection ran; the accepted 2,807-test database baseline applies to unchanged tax runtime code. Verification logs, final Git audit and exact committed-source/artifact receipt are retained under the ignored task output directory named above. No private output, credentials, backups, unrelated files or generated artifacts belong to the source commit. The exact artifact remains blocked from execution until fresh staging authorization and all staging preflight gates pass.

Relocation admission also rejects absolute internal release symlinks before shutdown/swap: their targets would not follow a directory rename. Existing external shared-secret links remain permitted and unchanged. A real compiled-fixture regression verifies rejection without process, directory, journal or financial mutation; do not rewrite such links during rollback to force admission.

## Current policy: one-way rollback — supersedes directory exchange

Rollback now restores an earlier release and **consumes** `spendcraft.old`; it does not toggle current/old. Normal deployment still keeps current/old, but successful rollback leaves only `spendcraft`. Another rollback is unavailable until a subsequent deployment creates a new `spendcraft.old`.

The normal stable launcher, direct executor and filesystem helper explicitly reject a missing `spendcraft.old` with `no_previous_installed_release`. The launcher never dispatches an executor in that case. Rejection precedes database access, shutdown or filesystem mutation. Existing tax/Category/compiled identity/manifest/PM2/database/backup admission remains; unknown compatibility still fails closed. The historical Category-only conversion executor remains unchanged and excluded from normal rollback.

After admission, writer shutdown and backup, the one-way operation is:

1. Journal and rename current to the single temporary path; sync the parent and journal the phase.
2. Rename old to current; sync and journal promotion. Verify the restored complete identity, outgoing temporary identity and absence of old.
3. Independently repeat the existing database/configuration/stopped-writer guard and both identities. Durably journal `outgoing-release-removal-pending`.
4. Recursively remove **only the outgoing temporary tree**, without following its external secret symlinks; sync the parent. Verify restored current again and absence of old/temporary; journal `one-way-rollback-completed`.
5. Offer the existing startup approval and use the restored process definitions. No database value or financial record is restored or reversed.

The warning now explicitly states that the outgoing release is removed and old is consumed. Complete code identity verification precedes removal; this is not a guarantee that startup will succeed. A later startup failure keeps writers stopped and needs investigation/forward correction, not automatic return to the removed version.

| Interruption | Filesystem and required handling |
| --- | --- |
| Before first rename | Both original releases remain; no automatic retry over an existing journal. |
| After first rename | Previous remains at old; outgoing remains at temporary; current is absent. Stop and inspect both identities before separately authorized manual restoration. |
| After promotion/before cleanup | Restored current is complete; old absent; outgoing temporary remains complete. Verify current and journal, keep writers stopped and review cleanup. Do not rename outgoing to old. |
| During removal | Restored current remains complete; old absent; temporary may be partially removed. It is cleanup residue, not a usable recovery release. Preserve journal; verify restored identity and exact temporary path before separately authorized manual cleanup. |
| After removal/before completion journal | Only restored current remains. Validate it and record completion after review; never attempt another rollback to the removed version. |
| Before/during failed restart | Restored current remains; no previous version remains to roll back to. Keep traffic/writers fenced and investigate. |

Removal is not atomic. A partial cleanup error aborts before startup; the temporary path may remain until explicit manual cleanup, while the verified restored release stays intact. No automatic retry, restoration from backup, old re-creation, tax reversal or deletion of restored/current data occurs. Shared environment/configuration files remain outside the removed tree. Tests exercise failed/partial removal, all promotion boundaries and abrupt child-process exits after both renames and after removal, alongside missing-old and second-attempt rejection.

This revision is uncommitted and not deployed. The prior `7871889830159ee55a6d82475882901f33be06c8` installers implement exchange, **not this one-way policy**; they remain unchanged and must not be used to claim this behavior. Commit/rebuild/reverify an exact artifact in a separate authorized task before deployment. The old exchange verification sections above are historical; current results follow below.

One-way revision verification: 381 focused non-database tests passed, zero failures/skips/pending, including actual shell rejection when old is missing, second-attempt rejection, guarded cleanup/partial-removal failure and interruption tests. Both TypeScript checks, changed-file ESLint, Knip, circular regression, Node/shell syntax, server build and both diff checks passed. Existing client bundle-size warning remains. Logs: `script-output/one-way-rollback-d25r1649/`. No database connection, actual rollback, PM2 operation, server access, deployment, installer regeneration or commit occurred.

## One-way finalization: retain outgoing until runtime health passes

Review date: 2026-10-23 (America/Denver). Actual starting HEAD: `160a6e7b578a29cb7a70f14d8e97778638f3521e`, branch `dollar-to-cents-2`. The one-way implementation was already committed at task start; index and tracked working tree were clean. Unrelated untracked editor, key, backup and scratch files are preserved and excluded. No server or database is accessed in this task.

### Small safety correction and exact ordering

The earlier code verified filesystem identity but deleted outgoing before startup. That would remove the only alternative application tree even if the restored binary failed to start. Finalization makes the smallest lifecycle correction: **separate restoration from cleanup, and invoke cleanup only after existing runtime verification passes**. It does not add a persistent recovery slot, restore old, toggle versions, reverse tax storage or restore a database.

1. Before any database connection, validate explicit environment/root/plan, current/old existence and complete manifests, compiled Category/tax/model/PATCH/report compatibility, dependencies/assets, shared configuration mapping, PM2 paths/runtime source/saved definitions/script hashes and absence of existing journal or abandoned temporary path. Private diagnostic output is permitted; installed releases and execution journals are unchanged on rejection. Filesystem-only admission repeats before execution to reject stale state.
2. Independently verify configured/live pg, pgLog, execution connection and socket identities as before. Confirm maintenance, stop only the intended writers, verify their shutdown/cron/stopped-dump state, obtain and verify the fresh logical backup. Exclusive-session and stopped-writer admission remain mandatory before directory rotation.
3. Journal current → temporary and old → current, sync the parent after each rename, verify both complete identities and old absence. Journal `filesystem-restoration-verified`. Current now contains the intended previous release; outgoing is still complete at the one temporary path.
4. Start the restored release with its reviewed PM2 definitions. Require online status and valid PIDs. Perform the established HTTP startup check and require the explicit authenticated read-only Transaction/report/database-connectivity and startup/server/provider-error checks. The operator's `READ CHECKS PASSED <database>` confirmation remains mandatory. Save PM2 state and durably journal health evidence. Only then mark runtime health verified.
5. Cleanup independently checks the health evidence, configured/live database identities, application connection mapping, reviewed PM2 runtime/current restored definitions/online state, no uncontrolled in-root PM2 process and no outgoing-path writer or old PID/start-time still alive. Reverify both complete trees and missing old. Journal `outgoing-release-removal-pending`, remove only outgoing temporary, sync and verify restored identity and absence of both old/temporary. Journal `one-way-rollback-completed`, then final completion. Shared-secret symlink targets are not removed.

Restored application connections are expected during step 5. The cleanup-only guard therefore verifies database identity while allowing those expected connections; it is **not** the exclusive-session/stopped-writer gate used for financial fencing and rotation. Cleanup performs only filesystem deletion of a quiescent outgoing tree, not database mutation or financial reconstruction. Existing stop/rotation identity and exclusivity guards are unchanged. A failed cleanup guard stops completion and the existing error path stops managed restored writers. No generic bypass is provided.

### Filesystem versus runtime verification

Filesystem verification uses the full manifest, including required server entrypoints, nine reviewed compiled boundary files, client manifest/assets, declared runtime dependencies, file modes and external shared environment/configuration links. Generated plans additionally verify the release-bound PM2 manifest and script hashes; internal absolute symlinks that cannot survive relocation remain rejected.

Runtime verification combines automatic PM2/HTTP evidence and fresh PostgreSQL identity queries with the existing explicit operator-authenticated read/error checks. It does not claim that a redirect alone proves authenticated/database functionality. No production credentials are embedded in the tool or artifact. Startup/error-log review remains an operator step, and actual EC2 behavior must be established in the later staging rehearsal.

If a prior release has no process manifest and the reviewed plan requires manual startup, the tool stops at `manual-restart-required` with outgoing retained. It does not claim successful completion or delete outgoing without health evidence. Manual startup/verification/cleanup needs a separately reviewed authorized procedure; there is no automatic resume or force-cleanup flag.

### Failure-state matrix and completion invariant

| Failure | Preserved state and required response |
| --- | --- |
| Missing old, unknown identity/compatibility, missing asset/dependency or stale journal | Reject before database connection/process shutdown/application mutation. Only safe diagnostics may be written. Existing journal is not changed. |
| Shutdown/backup failure | Both original directories remain; keep writers fenced. No rename, deletion or automatic retry. |
| First rename / restoration interrupted | Both original trees remain at journaled paths; current may be absent. Verify actual full identities, not merely last journal phase. Stop for manual recovery. |
| Filesystem restoration verification failure | No cleanup or restart. Preserve both observed trees, journal and stopped writers for investigation. |
| PM2 restart or HTTP/authenticated/runtime health failure | Restored current and complete outgoing temporary remain; no cleanup. Existing error handling stops managed writers. Investigate; do not automatically return to outgoing or restore a database. |
| Cleanup admission failure | Both complete trees remain, old absent. Stop managed writers and investigate the failed identity/process/health check. |
| Removal partially fails | Restored current remains verified; outgoing may be partial cleanup residue. Journal says removal pending; abort and stop managed writers. Do not treat residue as runnable or recreate old. Manual cleanup requires fresh root/host/DB/writer verification and explicit authorization. |
| Removal completes but journal/finalization fails | Only restored current remains. Verify it and journal actual completion after review; do not repeat rollback. |
| Success | Restored current runs and passed health checks; old/temporary absent; journal completed; database representation unchanged. A second rollback fails with `no_previous_installed_release`. |

The temporary path exists only while the operation is incomplete; it is not another completed release slot. No prior/current tree is automatically discarded until health is positively recorded. Actual process-exit tests exercise both rename boundaries and cleanup, not physical disk/power-loss guarantees. Existing journals deliberately block blind retry, including completed runs until their evidence is reviewed/archived. No automatic recovery or monetary reversal is added.

### Verification, provenance and next gates

Final focused selection: **387 non-database tests passed**, zero failures/skips/pending. Tests use actual production helpers with complete representative emitted release fixtures, mocked process/database operations, real temporary filesystem transitions and abrupt child exits. They cover health-before-cleanup ordering, health rejection, missing-old/second-attempt rejection, positive/negative compatibility, stale journals and abandoned temporary rejection before database work, partial cleanup, startup failure, manual-required startup, asset/manifest failures and unchanged synthetic financial sentinels. Tests do not claim a real EC2/PM2/database rehearsal.

Both TypeScript checks, changed-file ESLint, Knip, circular regression, server/client builds, script syntax and both diff checks pass. Existing client >500 kB bundle warning remains. Accepted monetary runtime code and the nine compiled tax/Category boundary hashes remain unchanged; the earlier 2,807-test PostgreSQL acceptance is not rerun. No staging/production/sandbox/test database connection occurs.

The final release is the commit containing this section. After committing, build once from a clean detached checkout with established `bash build.sh`. Exact commit, `dirty:false`, UTC build timestamp, package ID, ZIP SHA-256, template hash and both target installer hashes are recorded together in `script-output/one-way-finalization-3nhy2qo5/artifact-receipt.json` and the package's `release-source.json`/`release.json`. This avoids embedding a commit's own hash into its source. Verify committed helper/executor/profile/bundle code and the nine accepted compiled monetary boundary files inside the ZIP, its CRC and private-file exclusions, and byte-identical decoded embedded archives in both wrappers. The previous ZIP `63d24c0a49afa2c30081e3cbad0eaea20596b35fc6dae4018b6df180649c4dec` implements exchange and is superseded; never reuse it for this release.

Staging deployment remains unauthorized. Before later execution on `staging.spendcraft.app`, freshly verify EC2/SSH identity, `/spendcraft_staging/server`, configured/live/execution DB identity including role/port/server/peer, exact installed pair, backup readability/recoverability, free-space peak and complete PM2/cron/child/external-writer inventory. Decline migrations and SKIP seeding. Use synthetic data only, test the initial incompatible-pair rejection without shutdown/mutation, then a genuinely reviewed compatible pair and every interruption/cleanup state. Do not edit metadata to manufacture compatibility. Production needs same-artifact staging acceptance and independent approval; historical tax conversion remains separate.

Manual-startup-required execution explicitly returns an incomplete result and CLI exit status 2, retaining outgoing and leaving processes stopped. It cannot be mistaken for completed cleanup/health acceptance. Dry-run remains non-mutating and does not claim runtime verification.
