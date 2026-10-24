# Transaction Tax release recovery

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
