# Transaction Category decimal-string production deployment

## Status: blocked before production execution

Prepared October20,2026 (America/Denver). **No production deployment has occurred.** Preparation does not authorize deployment, historical conversion, schema changes, backup rotation or restoration.

Candidate commit: `be41cdd4c0c572087e136a81f045ccf95e0e94eb` (`Store Transaction Category allocations as decimal-dollar strings`). Branch: `dollar-to-cents-2`. Accepted baseline:616 focused and2110 complete-suite tests,0 failures/skips, plus both TypeScript checks, ESLint, Knip, circular regression and builds. See [implementation](transaction-category-decimal-string-implementation.md) and [PostgreSQL acceptance](transaction-category-decimal-string-postgresql-verification.md).

Tracked working tree and index were clean at entry. The43-file commit contains the accepted implementation/tests/documentation. All12 production-file fingerprints match the accepted reverification snapshot retained locally; no material source discrepancy was found. No application/deployment script was modified during preflight. Existing unrelated untracked generated/editor/backup/scratch/key files were preserved and were not packaged or uploaded. Only this document is newly created, unstaged.

## Target and established architecture

Repository `README.md` identifies `https://spendcraft.app`; the existing `SPENDCRAFT_SERVER` is `spendcraft.app`. Read-only SSH with the deployment identity and strict host-key checking reached the expected host. No installer, PM2 command, provider operation or database command ran remotely.

Observed host: Linux/Ubuntu22.04.5 LTS; hostname`ip-172-31-4-3`, virtualization vendor`Xen`. These observations establish an Ubuntu host, not independently its cloud account, complete hosting topology or absence of other instances. Production root discovered from saved PM2 definitions and live process paths: `/spendcraft-prod/server`. Live processes use Node24.15.0 where applicable. The production `.env` resolves to `/spendcraft-prod/server/spendcraft-env` with selected nonsecret settings `NODE_ENV=production`, `DB_CONNECTION=pg`, `PG_HOST=localhost`, `PG_PORT=5433`, `PG_DB_NAME=budget`. No production database connection was made; these are file/process configuration observations, not live PostgreSQL identity verification or database authorization. Credentials were not output.

The repository configures both `pg` and `pgLog` from the shared PG environment fields. Selected live process environments contained `NODE_ENV=production` and no exported PG overrides among the fields inspected. Full environment contents were not disclosed. Other host/proxy/environment overrides remain an operational review item.

### Existing procedure, inspected but not executed

- `build.sh` runs `npm run server-build` locally.
- `deploy.sh` builds, replaces local build/package output, embeds the archive in a generated installer and copies it with SCP to `ubuntu@${SPENDCRAFT_SERVER}`. It does **not** execute the remote installer. It was not run: it would overwrite local artifacts and upload to production.
- `installer/install.sh0` is the installer template. It requires `SPENDCRAFT_ROOT`, external maintenance and explicit `DEPLOY`, `MIGRATE`, `RESUME` confirmations. It stops `prod-server`, `queue` and `plaid-cleanup`, extracts/installs dependencies in `spendcraft.new`, invokes host`./backup.sh`, then invokes `node ace migration:status` and `node ace migration:run`. Lucid migration:run has its own production consent prompt; declining returns without applying migrations. Declining the separate installer MIGRATE gate instead exits the installer. After migration:run, a separate operator decision accepts SEED (run `node ace db:seed`), SKIP (continue without seeding) or ABORT (exit before release switch/startup). Invalid/blank input reprompts; EOF aborts. Seeder failure stops the installer under set -e. It rotates `spendcraft` to `spendcraft.old`, starts/restarts processes, saves PM2 state and leaves external maintenance removal to the operator.
- `Installation.md` documents Ubuntu/PostgreSQL, Redis, Node/nvm, PM2 startup and nginx setup; it is not a tested backup restore or no-migration deployment runbook. `docs/plaid-item-cleanup.md` provides cleanup-worker rollout/readiness guidance but explicitly expects a migration/seed review for that older rollout. Those instructions do not authorize schema changes for this release.

**Correction following operator feedback:** Lucid's installed migration command asks for production consent and returns without applying migrations when declined. Therefore, the earlier claim that this installer necessarily applies migrations was too strong. For a no-schema-change rollout, the review must explicitly specify declining Lucid's production migration prompt and confirm production mode/no force flag. The installer has a separate MIGRATE gate that aborts on refusal. Following the authorized installer change, db:seed is now conditional on an explicit SEED/SKIP/ABORT decision; choosing SKIP omits it. This is not a requirement to invent a new deployment command or necessarily change the installer. No deployment command was executed.

### Processes and job inventory

| Process/path | Observed role and compatibility requirement |
|---|---|
| PM2`prod-server`, `/spendcraft-prod/server/spendcraft/bin/server.js` | HTTP application, authentication, manual Transactions, OFX uploads, funding/rebalance, opening/startDate, DELETE/cascades and reports. Saved Node interpreter`node`, live Node24.15.0; live PID exists. |
| PM2`queue`, `/spendcraft-prod/server/queue.sh` | Bash wrapper enters `spendcraft` and runs `node ace queue:listener`. Live wrapper PID exists. Listener processes Plaid webhooks and calls `Institution.syncUpdate`; its child Node process must also be fully stopped/drained and restarted from the new release. |
| PM2`plaid-cleanup`, `/spendcraft-prod/server/spendcraft/ace.js` | `plaid:cleanup-listener`, BullMQ cleanup jobs and a60-second reconciliation sweep. Live PID exists. Preserve its durable recovery configuration/keys and compatible code. It is not an allocation converter. |
| Operational CLI | `institution:sync`, `ofx:upload`, `check:unassigned` and other writer commands can run outside PM2. Confirm none is in flight or scheduled from an old release during cutover. `check:balances --fix` is not a deployment/smoke procedure and must not be run. |
| Scheduling | Installer configures daily midnight PM2 server restart (`0 0 * * *`); cleanup owns its minute timer. Ubuntu deployment user's crontab was absent. System/root cron, systemd timers, other users/hosts and external schedulers were not exhaustively verified. |

Saved PM2 metadata was inspected without invoking PM2, which could start a daemon if absent. `/proc` metadata and signal-zero existence checks corroborated the three PID files. Saved status alone is not readiness or proof that all child/remote writers are inventoried. QueueListener does not retain/close its worker in a terminating hook like the cleanup listener; established PM2 stop behavior must be verified to leave no old child process or in-flight work before enabling new writers. No shutdown redesign was attempted.

The installer is a stop-and-replace procedure, not a proven zero-downtime rollout. Expected interruption spans process stop, dependency installation, backup/manual gates, replacement, readiness and startup. A duration cannot be established from source alone. PM2 restarts use existing definitions when names already exist; inspect interpreter, cwd and script paths before execution rather than assuming names prove release identity.

## Storage compatibility preflight

Current committed code has the accepted central codec, active per-instance model binding and owning-transaction conservation checks. Supported types0/5,2,3,4 read numeric/string/mixed arrays into numeric runtime/API values and encode allocation writes as two-decimal strings. Reads and metadata-only operations do not normalize history. Existing report SQL extracts numeric values from either JSON representation; membership predicates and relevant Budget filters are updated. No other storage/API-wide conversion is part of this release.

| Active surface | Preflight finding |
|---|---|
| Manual CREATE/PATCH |Scoped storage opt-in/decoding, canonical encoding and linked conservation before commit. |
| OFX/Plaid HTTP, webhook worker and CLI |Share the updated Account/Institution model paths; all processes must load the compatible release. |
| Funding/rebalance |Compatible CREATE/replacement/DELETE readers; CREATE2/3 only and explicit type2 Pool requirement retained. |
| Opening/type4 and startDate |Same-sign linked conservation and accepted opening/Pool behavior retained. |
| DELETE and Account/Institution cascades |Decoded active amounts feed existing arithmetic; no historical reversal redesign. |
| Reports/registers |Accepted JSON authority, numeric SQL extraction, typed membership and numeric responses retained. |
| Commands/jobs |CheckUnassigned writes through the boundary; CheckBalances SQL accepts the representation but must not be used for historical repair or smoke tests. |
| Client assets |Existing runtime/API money types remain numeric. Old cached client assets do not read database JSON directly; API compatibility preserves their numeric contract. This does not make old backend instances safe. |

The deployed production release currently has **no `app/services/categoryAmountCodec.js`**. That is not a precise remote commit attestation, but it confirms the new module is absent. The previous repository commit`1c2a1edaa8e1dc8112e2d949deefb5b9e637633b` also lacks the decoding hooks and uses direct arithmetic such as allocation addition/reduction. It is **not** a safe post-write rollback release.

No rolling/mixed-backend rollout is approved. Before any new process writes strings, all old web/worker/CLI writers must be stopped, in-flight work resolved and remaining processes verified. External onboarding-only maintenance is insufficient to quiesce every financial writer. The installer starts the queue before the web server: normal provider synchronization can create string allocations **before** HTTP smoke checks or removal of the web maintenance gate. Rollback readiness must therefore be established before restarting the first financial worker.

Loans and the entire legacy relational allocation architecture remain deprecated/excluded; no compatibility/migration for those paths was introduced. Historical conversion remains separately deferred.

## Backup and recovery evidence

The existing host script `/spendcraft-prod/server/backup.sh` is404 bytes, last modified October20,2023. It enters `backups`, renames/rotates prior archives, compresses the previous plain dump and executes `pg_dump -d budget -p5433 > backup.sql`. This matches the observed database name/port configuration but does not independently prove live source identity or recoverability. Its rotation/output overwrites files, so it was **not executed** under preparation authorization.

Read-only metadata found591 backup files. Latest observed candidates (America/Denver):

| File | Modified | Bytes | Evidence |
|---|---|---:|---|
| `backup.sql` |October18,2026 20:42:55 MDT|6604912|PostgreSQL dump header and completion marker present in bounded header/footer reads. |
| `backup_1.sql.gz` |October13,2026 21:40:06 MDT|915079|Metadata only; archive integrity not tested. |
| `backup_2.sql.gz` |October10,2026 09:20:42 MDT|914211|Metadata only. |
| `backup_3.sql.gz` |October7,2026 15:18:58 MDT|914279|Metadata only. |

No dump rows, personal financial data or credentials were output. No backup was created, overwritten, rotated, restored or copied. No database was queried.

**Recovery gate not satisfied.** An existing completed-looking dump is established, but a fresh deployment recovery point, isolated restore-test evidence, documented recovery procedure, matching key/configuration recovery, and acceptable recovery point/objectives are not established. No operational documentation files were found at the host root inspected, and no tested recovery runbook was found in the repository. This is not proof that an operator has no external procedure; it must be supplied/verified.

Restoring the October18 dump would discard legitimate activity after that timestamp. Even a fresh predeployment dump would lose legitimate post-backup activity if restored later. Backup restoration must not be treated as an automatic application rollback. No restore or recovery-test target is authorized by this task.

## Rollback constraints and execution gate

There is no identified, verified rollback release that both predates this deployment and understands decimal-string allocation storage. The previous commit/deployed module layout is incompatible; an `spendcraft.old` directory is not proof of compatibility. The installer deletes/replaces older rollback directories, so retained artifact/version provenance must also be established.

Required plan before approval:

1. Establish a retained, tested release/artifact capable of reading strings, with exact provenance and a reviewed recovery procedure. Do not assume the former binary is safe after the first new worker/web write.
2. Define how all financial producers are paused/drained, including queue children, provider sync and external commands; verify none can restart old code through PM2 reboot configuration or schedulers.
3. If a failure occurs after strings may exist, stop financial producers and preserve logs/data. Remain in controlled maintenance until a compatible recovery release or separately approved forward correction is available. Do not automatically start old code, reverse-convert JSON or restore a dump.
4. Review any disaster-recovery restore separately, including legitimate activity loss/reconciliation and cleanup keys/provider state. This preflight authorizes no restore.

These are prerequisites, not executable commands or an established rollback procedure. **A safe actionable rollback path has not been established, so deployment must stop.**

No production-changing execution approval is requested while these blockers remain. Before a later approval request, present the exact candidate commit/artifact, verified target/root, reviewed no-migration command/pipeline, complete process/scheduler inventory, expected interruption, fresh recoverable backup evidence, compatible rollback procedure and outstanding risks. The user's separate explicit approval is required even after those prerequisites are satisfied. Installer confirmation prompts are additional safeguards, not a substitute for that approval.

## Local checks performed

At committed candidate HEAD, all of the following passed without database access:

- 58 focused non-DB tests using the actual codec/boundary and source/inert controller/query regressions.
- Server and client TypeScript checks.
- ESLint and Knip.
- Circular regression: accepted11-model/26-edge component; no unexpected cycle.
- Server production build including client assets, then separate client production build.
- `bash -n deploy.sh build.sh installer/install.sh0` (syntax only; not operational approval).
- Standard and staged diff checks.

Existing client bundle above500kB remains a nonfatal warning. The accepted616/2110 PostgreSQL baseline was read as evidence; no database tests/setup/reset/cleanup were run in this deployment task. Build output is local only. No archive/installer was uploaded or executed. Local logs are `/tmp/decimal-deploy-*` and contain no production credentials.

## Post-deployment verification plan — not executed

After prerequisites and separate execution approval, use the established reviewed procedure and verify all relevant processes load the approved artifact; inspect old PIDs/children and scheduler behavior. Do not add migration/seed/conversion steps.

The repository's `/health` route is commented out. PM2 online alone does not prove application/worker health. Use the established frontend/authenticated application flows and worker readiness/log checks. A provider cleanup list/retry command is not a generic harmless smoke test: retry/sweep can contact Plaid and mutate recovery state.

Operator-authenticated read-only checks should cover existing numeric allocations, numeric API response types, Category report, Funding History and Income Vs. Expenses, with unchanged financial state and no unexpected server/provider errors. Inspect logs in a credential/personal-data-safe way. Do not create or alter real financial records to prove new writes. No safe new-write fixture/procedure is approved; obtain separate explicit approval for one if required. Do not read raw production allocation JSON without a justified read-only plan that minimizes sensitive output.

No production smoke check has been claimed as passed. No postdeployment write or raw production database inspection occurred.

## Final preparation boundary

Candidate source is committed and matches the accepted implementation. Expected production host/root/process paths were inspected read-only. Preparation remains blocked by incomplete backup/recovery evidence and lack of a verified compatible rollback path. For this bounded rollout, review declining Lucid migration consent and choosing SKIP at the independent seeding decision. Neither migrations nor seeding need execute. Full process/scheduler inventory and an appropriate all-financial-writer maintenance gate remain operational prerequisites.

Only this unstaged document was added. Tracked source, index and unrelated user work remain unchanged. No production-changing deployment command, PM2 restart/stop, backup execution, database connection, test destruction, historical conversion/repair, schema migration, deployment or commit occurred.

## Installer seeding decision follow-up

The user authorized adding an explicit operator seeding decision to `install.sh0`. SEED runs the existing seeder; SKIP continues without invoking it; ABORT or EOF exits before release switching and process restarts, without automatic rollback or traffic resume. Invalid/blank input reprompts. The earlier MIGRATE gate no longer claims to approve seeding. Ten focused non-DB Bash tests pass using the actual function with an inert node substitute, including seeder failure. Shell syntax, focused ESLint and both diff checks pass. Regenerate the embedded installer through the reviewed packaging procedure before a future authorized deployment; no generated installer was rebuilt/uploaded/executed here. Backup/rollback blockers remain, and no database connection or production change occurred in this follow-up.
