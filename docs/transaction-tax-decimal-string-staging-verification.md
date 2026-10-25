# Transaction Tax decimal-string staging verification

## Current status — read-only preflight blocked

Inspected 2026-10-24T00:59:15.109259+00:00 (October 23, 2026 in America/Denver). Source HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. No tracked or staged changes existed at entry; unrelated untracked files were preserved. Deployment, financial fixtures, process control, rollback, historical conversion and production access remain unauthorized. This document records preflight, **not staging acceptance**.

Evidence: `script-output/tax-staging-acceptance-preflight-rf3bkjwt/`. Outputs are local, unique per run; credentials and financial record contents are excluded. Checks used SSH with existing host-key verification, EC2 IMDSv2, file hashes, process metadata and PostgreSQL catalog metadata. No financial table query was needed.

## Pinned artifact

- Source commit: `2429cd32250430d5238ea6d79a066096ccbe8c87`; original clean-build provenance retained in `script-output/one-way-finalization-3nhy2qo5/artifact-receipt.json`.
- Package ID: `13f88fb1a5465e1d40c4a4194b2596c0c276f04a31c79113ccf8fb63e9f208b7`.
- Archive SHA-256: `cd64e9afb929b287f763a5af0a26621f6ce17b8f6fed8b1c53721be898f4a3c1`.
- Saved package: `releases/release-2026-10-24T00-42-21.324Z-2429cd322504-Lm2NaZ`.
- ZIP CRC passed; both saved installer wrapper hashes match the receipt and decode to exactly this ZIP. Seven packaged recovery-tool files match the approved committed source byte for byte. All nine reviewed compiled tax/Category boundary hashes match the profile. Referenced client assets exist.
- No rebuild, replacement, upload or installer execution occurred. Reused finalization evidence: 387 focused non-DB tests passed, both TypeScript checks, changed-file lint, Knip, circular checks, syntax and builds passed. Accepted unchanged tax runtime has the earlier 2,807-test PostgreSQL baseline. No database-backed tests reran.

## Staging identity and database admission

EC2 IMDSv2 independently returned AWS account `011038405378`, region `us-west-2`, instance `i-0b24684c411b4b829`, private address `172.31.10.95`, host `ip-172-31-10-95`. Canonical installation root is `/spendcraft_staging/server`; configured APP_URL is `https://staging.spendcraft.app`, application port `3334`. The SSH hostname alone was not used as proof.

Configured database is **`spendcraft`**, host `localhost`, port `5432`, user `ubuntu`, on this verified staging EC2 instance. It is not inferred to be `spendcraft_staging`. Compiled database configuration SHA-256 `9fbff9f15f8b440beab78f20f0a6403179a2ea5e91a393490e446b5bf3bb9b75` matches the reviewed artifact and maps both `pg` and `pgLog` to the same five PG environment settings. No password was output.

Three independent clients (`pg`, `pgLog`, inspection execution) used `default_transaction_read_only=on`, explicit `BEGIN READ ONLY`, and `ROLLBACK` on completion. Each verified current database `spendcraft`, current/authenticated user `ubuntu`, server port 5432, server and peer `127.0.0.1/32`, actual socket remote address `127.0.0.1`, port 5432, and `transaction_read_only=on`. Only exact loopback host CIDRs were admitted; no bypass was used. The existing role was used with enforced read-only transactions, not claimed to be a dedicated read-only role.

Server: PostgreSQL 15.19; database size metadata: 9,289,063 bytes. Extensions: plpgsql and tablefunc. Session metadata showed one idle application connection and the preflight connection; no query texts or financial contents were collected. Socket ownership linked the application session to plaid-cleanup PID 115432. These observations are a point-in-time inventory, not a future writer fence.

## Actual installed releases and compatibility

Complete filesystem manifests, dependencies, client assets and shared-secret link layout passed the installed manifest helper's checks. Source labels are dirty builds; full tree identities, not commit labels, identify them.

| Slot | Complete installed identity | Source label / build UTC |
| --- | --- | --- |
| current | `abe55d888b4119cb96d832b1cdf1465eabd09e38271b3ef54845543b6fd175c8` | `5d98bbc558b8af21f6482805510e684acbcf3489`, dirty; 2026-10-23T14:04:30.556Z |
| previous | `b261e79dc7395bef240743993318a372e3209f37fef93860ceb8273658afb662` | same label, dirty; 2026-10-23T13:59:49.626Z |

Both have the accepted three Category boundary hashes. Both lack tax codec/binding/storage helpers, and their Transaction model/PATCH hashes differ from the accepted tax boundary. Numeric tax reads and numeric/string Category reads are source-supported, but authenticated staging behavior was not exercised here. String-tax numeric API compatibility is **not certified**; both releases fail the new reviewed tax-profile recognition and are inadmissible rollback targets. Unchanged tax-report controller supports SQL text extraction/real aggregation; that alone cannot establish complete application compatibility.

The pinned new release has the reviewed numeric/string/mixed tax decoding, numeric API boundary and canonical string writer, with accepted local PostgreSQL evidence; actual deployed staging behavior remains unobserved until authorized deployment. On deployment, today's current becomes the new old. It will remain an incompatible rollback target. Rejection is expected even before an observed tax-string write: this guard conservatively rejects unknown compatibility without querying the database to infer safety.

## Capacity and recovery point

Data filesystem: `/dev/nvme1n1`, ext4 rw, mounted `/spendcraft_staging`, 4,143,677,440 bytes total; **2,926,952,448 bytes (2.73 GiB) available**, approximately 26% used. Root filesystem separately has approximately 11 GiB available.

Current tree is 327,216 KiB; old is 326,780 KiB. Release records use 230,492 KiB, maintenance 10,488 KiB, backups 1,036 KiB. ZIP size is 1,997,886 bytes. Installation temporarily adds an extracted incoming tree and installs runtime dependencies before removing old; npm cache may use root. A similarly sized incoming tree (~320 MiB), small current logical backup, maintenance metadata and logs appear to fit the measured headroom. This is an estimate, not an enforced peak bound; recheck before execution, allow at least 1 GiB incoming/dependency contingency plus backup/log headroom, and stop if allocation/growth exceeds the budget. Rollback renames into a temporary path rather than copying a third tree. Never delete recovery artifacts to make room without approval.

Latest backup: `/spendcraft_staging/server/backups/database-backup-MeTelm/backup.sql`, 61,112 bytes, recorded complete at `2026-10-23T14:06:01.727Z`. SHA-256 `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a` matches summary; byte size and final pg_dump completion marker match; stderr file is empty. The next two prior dumps also pass these checks. No backup contents were exposed.

**Restore recoverability remains unverified.** A matching hash and complete plain SQL dump are integrity/completion evidence, not proof of a successful restore with required roles/extensions/ownership. No documented restore result was established by this bounded inspection; no restore was attempted. Establish a separately authorized isolated restore rehearsal or supply verifiable existing rehearsal evidence, then establish a fresh pre-deployment recovery point after writers stop. This preflight cannot pass the backup gate yet. Do not restore an old database automatically.

## PM2, writers, schedules and health

Existing PM2 daemon PID 49118 has three live children, mapped through PID files and saved definitions:

| Name | PID | Command | Restart schedule |
| --- | --- | --- | --- |
| queue | 115426 | node ace.js queue:listener | none in saved definition |
| plaid-cleanup | 115432 | node ace.js plaid:cleanup-listener | delay 5 seconds; kill timeout 30 seconds |
| prod-server | 118658 | node bin/server.js | midnight cron, `0 0 * * *` |

All use the current installation working directory. Saved definitions say online; live PIDs/parentage were independently observed. No PM2 CLI/RPC/control operation was invoked; saved definitions are not a fresh daemon RPC dump. Midnight restart explains why server PID may differ from earlier inventory. Writer shutdown must cover these processes, drain children and prevent resurrection; repeat actual daemon/schedule/child admission at execution. No user or root crontab entries were found. Listed system timers and cron filenames were standard OS/Certbot maintenance; no SpendCraft financial schedule was observed. This bounded process/socket/timer inventory cannot prove that no future operational command or uninspected service could write.

PostgreSQL, Redis and Nginx are active. **No PM2 systemd unit file was listed, and `pm2-ubuntu` is inactive.** The daemon currently runs, but reboot recovery is not established. Resolve through an approved operational task or supply positive evidence of another startup mechanism before affirming the installer's reboot-recovery gate. This is not authorization to configure startup now.

Local HTTP `http://127.0.0.1:3334` and HTTPS `https://staging.spendcraft.app` returned 200. This establishes basic service response only; authentication, tax editor and reports need later functional acceptance. No active root rollback journal or temporary rollback/recovery directory was found. A read-only filesystem listing is not an execution of the installed older rollback tool.

## One-way rollback admission and interruption expectations

Pinned code requires old, verifies full identities/compiled tax and Category compatibility plus required assets/dependencies and journal state **before database access, PM2 shutdown or release mutation**. Unknown tax compatibility stops; no generic override exists. Do not run an older installed bundle to bypass the new guard.

For a genuinely admitted pair: stop/drain intended writers, fresh backup and identity checks, current → journaled temporary path, old → current, verify restored filesystem, start intended processes, verify PM2/HTTP plus operator-confirmed authenticated read/startup checks, then guarded outgoing cleanup. Success leaves only current; a second rollback rejects missing old. No tax reversal or automatic DB restore is performed. Failed restoration/startup/health leaves outgoing temporary evidence for manual recovery and stops managed writers as appropriate; incomplete journals reject blind retry. Temporary residue is an interrupted operation, not another permanent release slot.

The initial staging pair is incompatible; **do not execute a compatible application swap with it**. A positive compatibility predicate can be exercised through existing non-DB compiled fixtures. A real positive rollback or controlled failure injection requires a genuinely reviewed compatible pair and separate explicit authorization. Never relabel metadata to fabricate compatibility.

## Future procedure — not executed

After resolving recovery/startup gates, repeat host, configured/live DB, capacity, complete releases, writers/schedules, backup and artifact checks. Request explicit staging execution approval. No approval is implied by this document.

```sh
# Local, only after execution approval; uses the saved package, never rebuilds:
RELEASE_DIRECTORY="$PWD/releases/release-2026-10-24T00-42-21.324Z-2429cd322504-Lm2NaZ"
bash deploy.sh "$RELEASE_DIRECTORY" staging
ssh -i "$SPENDCRAFT_STAGING_SSH_KEY" ubuntu@staging.spendcraft.app
# On the independently reverified staging host:
export SPENDCRAFT_ROOT=/spendcraft_staging/server
bash "$HOME/install.sh"
```

Review generated staging wrapper identity against the pinned saved wrapper before execution. Installer target is staging. DEPLOY gate: stop/drain manifest writers, unpack incoming and install dependencies, preserve shared config/secrets, verify Nginx, create fresh backup, review migration status. **Decline migration:run; SKIP seeding.** This release requires no schema migration or historical conversion. Capture complete manifests/bundle; delete the older old, move current to old, incoming to current; complete operator checks before RESUME, then start only manifest processes, save PM2, generate rollback plan and validate/reload Nginx. No third persistent release copy is created.

Expected downtime lasts from manifest writer shutdown until restart and health acceptance. Duration has not been measured; dependency downloads and operator gates can extend it. No automatic application/database fallback should be assumed. Before rotation, failure leaves existing current/old plus incoming and stopped writers; after rotation, current is the new release and old is the immediate predecessor. If the new release fails and predecessor is incompatible, stop and seek a forward fix; do not reverse tax data or restore stale balances. Interrupted-deployment failure injection is separately approved work.

## Future acceptance matrix

| Check | Required evidence after separate authorization |
| --- | --- |
| Startup/authentication/retrieval | new installed complete identity; intended PM2 PIDs online; HTTPS/authenticated non-mutating reads |
| Legacy numeric/mixed taxes | synthetic fixtures; numeric API values; raw stored JSON unchanged on reads/metadata-only edits |
| New tax PATCH | canonical two-decimal raw JSON strings; approved Math.round fractional-cent/tie/artifact/negative-zero cases; numeric API |
| Reports | existing selection/grouping/sign/real aggregation; numeric response; tablefunc already present |
| Financial noninterference | raw before/after Categories/order/metadata, AccountTransaction amounts and Account/Category/Pool balances unchanged on tax-only edit |
| Incompatible rollback | guard rejects before DB/process/filesystem action; before/after directories/journal/PM2 and financial snapshot unchanged |
| Compatible predicate | reviewed compiled fixtures pass without a real swap; no metadata-only claims |
| Interruption | separately approved controlled failures; verify actual directory/journal/health state; no blind retry or outgoing cleanup before health |

Use synthetic staging records only. No staging-wide historical conversion is approved. Production requires acceptance of this exact artifact and independent authorization. Historical tax conversion remains a later project.

## Verification, changes and blockers

Local artifact inspection passed without executing installer/rollback or rebuilding. Existing 387-test non-DB and 2,807-test PostgreSQL evidence is reused only for unchanged reviewed source/compiled boundaries. Current verification runs only the two Git whitespace checks and index-preservation comparison; no destructive PostgreSQL suite ran.

Files changed: this new document and linked current-preflight addenda in deployment/recovery documentation. All unrelated untracked work is preserved. No stage or commit occurred.

Outstanding execution gates: verified restore recoverability/fresh recovery-point procedure; positive PM2 reboot recovery and final live writer/schedule admission; repeat volatile identity/capacity checks and explicit staging execution authorization. **Deployment has not occurred and preflight is blocked.**

## Recovery-readiness investigation — October 24, 2026

See [the restore and PM2 recovery preparation](staging-backup-restore-and-pm2-recovery.md). HEAD remains `2429cd32250430d5238ea6d79a066096ccbe8c87`; no artifact rebuild or deployment occurred. Fresh read-only host and three database connection checks passed. The active PostgreSQL data directory is `/spendcraft_staging/postgresql/15/staging` on the same 2.73-GiB-free data volume as backups/application; root free space must not be substituted for its restore budget. Live database metadata size is 9,289,063 bytes. A 512-MiB restore budget plus 2-GiB reserve currently fits, subject to fresh checks/monitoring.

The selected 61,112-byte plain SQL backup still passes integrity/completion checks and includes schema/data/migration metadata, but **does not include tablefunc**. A guarded, separately authorized temporary-database restore followed by temporary-only tablefunc setup/crosstab verification is prepared; no restore or database creation ran. The role ubuntu lacks CREATEDB, so privileged temporary operations need the verified local postgres administrator, not a privilege grant.

System/user unit-content and legacy startup checks found no PM2 boot restoration mechanism; the existing daemon and three staging children remain running. Installed global PM2 is **7.1.0**, while the pinned rollback executor permits **5.4.1**. That separate support mismatch requires review; no guard or PM2 version changed. Plaid is sandbox and its production secret is absent, but nonlocal SMTP credentials, web-push capability and unknown effective egress isolation prevent safe automatic-worker startup from being certified. Reboot recovery and restore recoverability remain **unverified**, not resolved.

Evidence and unexecuted SQL/unit drafts: `script-output/staging-recovery-readiness-huh_tnmi/`. No further staging-changing action is authorized. Operation A and Operation B require separate explicit approvals; Operation B first needs integration/version decisions. No staging database mutation, production access, process control, systemd change, reboot, installed-release change, historical conversion, migration, deployment, AWS change or commit occurred.

## Isolated backup restore Phase A — October 24, 2026

Fresh read-only preflight **passed** for the isolated restore only. See [the final Phase A evidence and guarded Phase B commands](staging-backup-restore-and-pm2-recovery.md#isolated-restore-phase-a--october-24-2026-passed-execution-not-authorized). EC2/account/root, three actual pg/pgLog/execution read-only identities, separate local postgres administrative identity, pinned backup size/hash/footer/origin, temporary target absence/no sessions/no observed app references, available tablefunc, data-volume capacity and HTTP health were reverified. Exact temporary database: `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`. Backup SHA remains `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a`.

Free data-volume bytes:2,926,952,448; free inodes183,175. A512MiBpeak budget leaves~2.23GiB, above the required2GiBreserve. Prepared procedure creates tablefunc in the guarded temporary database **before** the atomic psql restore, never in live spendcraft. A credential-safe .env launcher and same-session target/OID admission are prepared locally. Cleanup requires separate explicit authorization/confirmation and fresh identities/no sessions; no automatic DROP/retry exists.

Live non-sensitive schema fingerprint `0b21e7d4280f603b015f86e69729d8b3566652e005f5cc4939e6e376d82228a0` and representative counts were captured for later comparison; Phase B must capture a fresh before/after baseline because the app remains active. Evidence: `script-output/staging-restore-preflight-2zscgg82/`. No database creation/restoration/extension/cleanup occurred. **Recoverability is not yet verified**, and tax deployment remains blocked by actual restore acceptance plus the separate PM2/reboot/integration gates. Fresh Phase B authorization is required; production remains out of scope.

## Isolated restore Phase B — October 24, 2026: stopped at verification

Authorized creation, temporary tablefunc installation and atomic SQL restoration succeeded for `spendcraft_restore_verify_20261024_2429cd_huh_tnmi` (OID17260). Restore psql exit0. Read-only verification then failed on the expected constraint-name inventory: the draft counted46 ADD CONSTRAINT names and omitted5CHECK constraints; restored catalog shows51total, all validated. Extended definition/data-hash verification did not run. See [the Phase B attempt record](staging-backup-restore-and-pm2-recovery.md#authorized-phase-b-attempt--october-24-2026-restore-succeeded-verification-stopped).

Per the explicit failure policy, no verification/restore retry or cleanup occurred. The temporary database and diagnostics remain at `/spendcraft_staging/server/script-output/isolated-restore-guxei2lz/`; local evidence is `script-output/staging-restore-rehearsal-x8e0zc8a/`. Live schema/count metadata matched the fresh baseline, PM2 PIDs remained alive and HTTP/HTTPS returned200. Restore free space remained~2.721GiB; no capacity guard failed. No live staging database mutation or production access occurred.

Recoverability remains **unaccepted pending corrected verification**. The attempt is stopped; fresh authorization/direction is needed before a verification retry and conditional cleanup. PM2/reboot/version/integration readiness and tax deployment remain separately blocked. No installed release, PM2, systemd, AWS resource, monetary representation or schema migration changed.

## Offline constraint-inventory correction — October 24, 2026

The verifier now independently reconciles the pre-restore source catalog, four relevant migration declarations and original dump ADD names. It compares all51 full constraint identities/definitions/validation states, classified as27primary keys,17foreign keys,2unique and5CHECK; it does not merely substitute51for46. CHECK definitions/names and source references are reviewed in `scripts/fixtures/stagingRestoreConstraintInventory.json`; offline preparation and regressions use `scripts/prepareStagingRestoreVerification.mjs` and its .test.mjs file.

[The correction and exact verification-only retry/conditional-cleanup procedure](staging-backup-restore-and-pm2-recovery.md#verification-inventory-correction--october-24-2026-offline-only) preserves original failure evidence and targets the **existing**, last-observed OID17260 in `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`. No database recreation or SQL backup restore is included. Prepared inputs: `script-output/restore-verification-correction-vlxmo1to/restore-verification-c8kUho/`.

No SSH, PostgreSQL connection, verification retry or cleanup occurred during correction. Fresh authorization is required for corrected read-only verification and conditional cleanup. Restore recoverability remains unaccepted until those checks actually pass; PM2/reboot/integration and deployment blockers remain separate. Existing Git work is preserved; no deploy or commit.

## Corrected restore verification attempt — October 24, 2026: connectivity blocked

Freshly authorized corrected verification/conditional cleanup could not start: SSH to staging.spendcraft.app port22 timed out twice before any remote command (initial connection plus one bounded read-only retry). Source HEAD remains `2429cd32250430d5238ea6d79a066096ccbe8c87`. Prepared SQL still matches its reviewed bytes; no expected assertions changed.

No PostgreSQL connection, verification, restore, extension change or cleanup occurred. The temporary database's last observed identity remains `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID17260; current state/host/database identities, disk and application health could not be rechecked. The database is untouched by this attempt, not claimed freshly observed. Recoverability and cleanup remain pending. See [the connection-failure record](staging-backup-restore-and-pm2-recovery.md#corrected-verification-execution-attempt--october-24-2026-ssh-blocked); local evidence: `script-output/staging-restore-corrected-verification-wnyz4qpk/`.

Restore SSH connectivity before a fresh verification attempt. PM2/reboot/version/integration and deployment gates remain unchanged; no deployment, production access, service control, AWS change or commit occurred.

## Renewed corrected verification — October 24, 2026: temporary database preserved

SSH and host/PostgreSQL identity admission succeeded after renewed authorization. Existing temporary database/OID17260 was positively verified without recreating/restoring/changing it. Corrected verification failed at the strict definition comparison:49of51constraint records match exactly; two plaid_item_cleanups CHECK definitions deparse whole-array varchar-to-text casts as element-wise casts after restoration. No missing/extra constraint was found, but equivalence has not been approved as acceptance. Exact diagnostics and remaining stages are in [the renewed attempt record](staging-backup-restore-and-pm2-recovery.md#renewed-corrected-verification-attempt--october-24-2026-definition-text-mismatch).

Execution stopped before extended verification and cleanup; the database and evidence remain preserved. Live schema/count/extension metadata, PM2 PIDs/saved configuration and HTTP/HTTPS health remained unchanged; both HTTP responses200. Final volume free space2,917,793,792bytes. Evidence: `script-output/staging-restore-verification-retry-d7sr5fq4/` and `/spendcraft_staging/server/script-output/verification-retry-a7xkc02z/`. Recoverability remains unaccepted, cleanup is not authorized to proceed on failed checks, and deployment gates remain unresolved. No production access, service control, installed-release/data/schema change, monetary conversion, deployment, AWS change or commit occurred.

## Offline cast-equivalence correction — October 24, 2026

The two saved CHECK mismatches have been characterized as equivalent array-wide versus element-wise varchar-to-text casts of identical non-NULL literal status arrays. The offline verifier now accepts only these two complete, identity-specific expression pairs; it preserves exact schema/table/name/type/validation checks and all other definitions. Generated SQL additionally verifies the source-defined status varchar(255) NOT NULL and token nullable text column types before comparison. See [the recovery runbook](staging-backup-restore-and-pm2-recovery.md) for reasoning and limits.

40 non-database tests passed. No PostgreSQL connection, restore, cleanup, deployment, service restart or commit occurred. The temporary database is preserved (last verified OID 17260); recoverability is not yet marked verified. Fresh authorization is required for corrected read-only verification and conditional cleanup after every acceptance gate passes. The separate exact raw dump DDL gate remains intact.


## Authorized reverification — October 24, 2026, 11:26 p.m. MDT

HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The authorized corrected read-only verification established staging instance `i-0b24684c411b4b829` in `us-west-2`, reviewed host/account/root and backup admission, configured/live PostgreSQL localhost:5432 user ubuntu, and temporary database `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID 17260. Actual execution identity/read-only guards passed.

The corrected SQL verification completed successfully (exit 0), including column types, all 51 constraint identities/definitions/validation states with only the two reviewed cast equivalences, table/index/sequence inventories, all 27 table row-count assertions, migration metadata, tablefunc and the synthetic crosstab query. The subsequent independent read-only pg_dump comparison stopped at `restored_tables_mismatch`. This is the exact CREATE TABLE DDL comparison gate; its cause was not further investigated or normalized during this execution. Subsequent dump comparisons and final acceptance were not completed. Backup recoverability therefore remains unverified overall.

No cleanup or automatic retry occurred. The existing temporary database remains preserved. No restoration, extension installation or data mutation was performed. Local evidence: `script-output/restore-cast-reverification-tq1b8ujj/`; remote evidence: `/spendcraft_staging/server/script-output/verification-retry-oyl0hrqu`. Saved execution results and failure diagnostics were collected without further database queries after failure.

Before verification, live staging metadata reported 48 Transactions, 3 Accounts, 27 Categories and 100 migration rows. Intended PM2 PIDs were unchanged from the prior recorded baseline; HTTP and HTTPS returned 200. These are pre-run observations, not a completed post-run noninterference comparison. All database operations in this run were read-only; no PM2/service or installed-release changes were made. After stopping, host capacity check reported 2,917,679,104 available bytes (about 2.72 GiB). No post-cleanup checks apply because cleanup did not occur.

Remaining gates: investigate the exact table-DDL mismatch separately without weakening assertions; obtain fresh verification/conditional-cleanup authorization; then resolve the existing PM2 reboot/startup, version compatibility and integration-isolation readiness issues before deployment. This authorization is closed with the failed run. No deployment, production access, AWS change, migration, historical conversion or commit occurred.

## Catalog comparison prepared — October 25, 2026

See [catalog-based restore comparison](staging-postgresql-catalog-restore-comparison.md) for the new guarded read-only collection and offline comparison, coverage, 88 non-database tests and remaining independent backup-data gates. No database was accessed in preparation. The existing temporary restore is preserved. Catalog results, reviewed integration and independent raw-data verification remain prerequisites; backup recoverability is not yet established. No tax deployment or historical conversion occurred.


## Final recovery-readiness checks — October 25, 2026

Source HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. This section supersedes earlier outstanding temporary-restore and missing-startup observations. Evidence: `script-output/staging-recovery-final-jfplw752/`; original restore/catalog/data verification evidence is preserved.

### Verified backup and authorized temporary cleanup

The prior final read-only checks established that all 27 COPY data blocks (104 rows, preserving duplicates) and 25 sequence states matched the pinned backup, sequence permissions passed, and representative payee/Category report SQL worked. This verifies recovery of this backup's contents only: its financial tables were empty, so recovery/report correctness for populated financial history is not demonstrated.

The currently attached user task explicitly authorized dropping only `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID 17260. Fresh guards verified staging EC2 `i-0b24684c411b4b829`, account `011038405378`, region `us-west-2`, canonical root, configured/live localhost:5432 identities and no temporary database sessions/application references. The unchanged SHA-pinned administrative cleanup SQL independently verified its postgres Unix-socket execution connection, the staging PostgreSQL data directory, live database OID 16839, exact temporary name/OID, zero sessions and exact target confirmation immediately before DROP. It used no FORCE, wildcard deletion or connection termination.

Cleanup exited 0. Subsequent independent read-only checks confirmed the temporary database absent and live `spendcraft` intact. Live schema fingerprint and representative counts were unchanged; all three application PIDs were unchanged. HTTP and HTTPS both returned 200. Data-volume available space after cleanup: 2,925,629,440 bytes (about 2.72 GiB). No live database record, installed application or service configuration was changed.

### PM2 7.1.0 compatibility

Observed global package and running daemon are both PM2 7.1.0. The prior 5.4.1-only admission reflected a narrowly pinned source review, not a demonstrated incompatibility with these operations. Review was limited to the application's rollback operations: process listing/selection, named stop/start/delete/restart, save and stopped-state resurrection. In the inspected 7.1.0 source:

- `API/Startup.js` saves each process's state, removes `instances`, backs up the previous dump and supports primary/fallback resurrection.
- `God.prepare` registers a saved stopped single process without executing it. Cron registration still occurs; the existing prohibition on cron restarts during maintenance therefore remains essential.
- API and ActionMethods retain named-process operation routing, stopped status/PID behavior and restart semantics used by this executor.

Only `installer/rollbackApplication.mjs` changes: retain exact 5.4.1 source admission, add exact 7.1.0 hashes for God, Startup, Common, API and ActionMethods, return the admitted version and require the running daemon title to match that same version and PM2_HOME. Unknown versions and modified source still fail closed. All existing process-definition, single-fork, scheduled-restart, writer, saved-state and release guards remain unchanged. The legacy first-release `rollbackTransactionCategoryStorage.mjs` is intentionally unchanged and remains 5.4.1-pinned; it is not the application-only recovery path for the tax release.

Focused non-database tests: 13 passed, zero failed/skipped, including both admitted version labels rejecting altered source, unreviewed versions/package names rejecting, and both primary/fallback dumps requiring stopped state. The actual retrieved 7.1.0 source passed the production runtime hash verifier offline. Changed-file ESLint and Node syntax checks passed. No real PM2 stop/start/save/resurrect or rollback was executed; this is source-reviewed compatibility, not an operational rollback rehearsal.

### Existing PM2 startup

Classification: **CONFIGURED — REBOOT NOT YET REHEARSED**.

`/etc/systemd/system/pm2-ubuntu.service` already exists and is enabled. Effective user is ubuntu; PM2_HOME is `/home/ubuntu/.pm2`. Effective ExecStart is the executable `/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2 resurrect`, with valid Node 24.15.0 PATH/executable. No environment-file override or drop-in is present. The saved list contains exactly queue, plaid-cleanup and prod-server, all using `/spendcraft_staging/server/spendcraft`, its shared staging `.env`, and no conflicting database/APP_URL/root overrides. Shared settings were independently verified as localhost:5432/spendcraft, ubuntu, staging APP_URL. NODE_ENV=production is the expected application mode on staging and does not identify the deployment as production.

`systemd-analyze verify` exited 0. The service is currently inactive/dead with Result=success and MainPID=0, while the existing manually running daemon and three children remain healthy. Enabled boot configuration does not prove successful reboot recovery. No pm2 startup/save, unit modification, service start/restart or reboot was performed. The web process retains its existing midnight cron restart; that must be accounted for during future maintenance under the existing rollback guard.

### Remaining deployment gates

The temporary-restore cleanup and static PM2 startup checks are complete. Actual reboot recovery still needs a separately authorized rehearsal or explicitly approved alternative recovery procedure. The local PM2 admission correction is uncommitted and is not present in the previously pinned installer: final source/artifact review and packaging are required before using it in a deployment. Reverify host/database/disk/backup and exact artifact identity before any future staging deployment. Production deployment remains unauthorized. Email and web-push isolation were explicitly deferred and were neither investigated nor changed in this task.

No production access, tax deployment, monetary conversion, migration, seeding, application replacement, PM2 restart, systemd change, reboot or commit occurred. Existing staged and unrelated work is preserved.
