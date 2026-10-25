# Staging backup restoration and PM2 reboot recovery

## Status and source baseline

Read-only investigation: October 24, 2026, America/Denver. HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The earlier deployment/recovery documentation modifications and untracked staging-verification document existed at task entry and are preserved. This task adds this document and a readiness addendum; no source/runtime change is made.

**No execution is authorized.** Operation A is a proposed isolated restore rehearsal. Operation B is a proposed PM2 startup/reboot operation and remains conditional on integration isolation and PM2 review. Neither operation deploys the tax release. Cleanup and reboot must be explicitly included in their respective approvals. Production is entirely excluded.

Private local evidence and prepared SQL/unit drafts: `script-output/staging-recovery-readiness-huh_tnmi/`. These drafts are not installed, not executed and not part of the pinned release artifact. They require fresh target/capacity checks and execution review before use. Output folders and logs must stay private, under script-output, outside installed release trees.

## Verified staging identity

Before operational inspection, SSH used existing host-key verification and IMDSv2 independently verified AWS account `011038405378`, region `us-west-2`, instance `i-0b24684c411b4b829`, private IP `172.31.10.95`, host `ip-172-31-10-95`. Canonical root is `/spendcraft_staging/server`; APP_URL is `https://staging.spendcraft.app`, port 3334. DNS alone did not establish identity.

Configured pg/pgLog and execution connections were independently inspected using three explicit read-only transactions. All confirmed database `spendcraft`, user/session user `ubuntu`, localhost:5432, server/peer `127.0.0.1/32`, actual socket `127.0.0.1:5432`, transaction_read_only on. Compiled database mapping hash remains `9fbff9f15f8b440beab78f20f0a6403179a2ea5e91a393490e446b5bf3bb9b75`. Ubuntu is neither superuser nor CREATEDB; do not grant it those privileges for this rehearsal.

A separate local administrator **read-only** connection verified maintenance DB `postgres`, role `postgres`, port 5432, data directory `/spendcraft_staging/postgresql/15/staging`, live staging database OID 16839. Unix-socket server/client IPs are correctly null, not misclassified as TCP loopback; explicit socket directory `/var/run/postgresql`, OS peer role, port and data directory identify this administrative connection. The command succeeded with read-only on; a stderr warning was present and must be classified privately at future execution, not treated as a restore success log.

The actual current/previous full identities and compiled tax compatibility remain the prior verified values in the linked [staging preflight](transaction-tax-decimal-string-staging-verification.md); this task did not repeat expensive full-tree hashing or claim fresh runtime acceptance. Reverify them before deployment. No installed release was changed.

## Backup inventory and dependencies

Selected artifact: `/spendcraft_staging/server/backups/database-backup-MeTelm/backup.sql`.

| Property | Observation |
| --- | --- |
| Completion UTC | 2026-10-23T14:06:01.727Z |
| Bytes | 61,112 |
| SHA-256 | `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a` |
| Format | uncompressed plain SQL, not pg_restore custom format |
| Dump server/client | PostgreSQL 15.19 / pg_dump 15.19 |
| Current psql | 15.19; supports this dump's restrict/unrestrict commands |
| Integrity | completion summary, size, hash, footer all pass; stderr file empty |
| Contents | schema and COPY data; 27 public tables, 25 sequences, 46 ADD CONSTRAINT statements, one explicit CREATE INDEX statement |
| Ownership | owner references ubuntu; no CREATE ROLE statements/global-role backup |
| Connection-changing commands | no CREATE DATABASE; client commands limited to restrict/unrestrict in this inspected dump |

Primary/unique constraints also create indexes; one explicit CREATE INDEX is **not** the total resulting index count. Compare actual index/constraint definitions after restoration, not only this textual count.

The dump contains `adonis_schema` (100 rows), `adonis_schema_versions` (one row), and `tax_categories` (three rows); other COPY tables in this artifact have zero rows. These are **dump contents**, not a new live-data audit. An initial name-based inventory flag did not recognize adonis_schema as migration metadata; the actual named tables/COPY counts establish its presence. No migrations or seeders are needed to reconstruct the saved schema. Whole-database recovery includes existing legacy tables as stored; this does not reactivate deprecated functionality.

`installer/backup.sh` runs a single pg_dump with default schema+data selection, explicit .env target and checked completion/publication/hash. pg_dump provides a consistent single-database snapshot under its normal PostgreSQL mechanism; it does not snapshot Redis or external provider state, nor establish that app writers were stopped. Roles/global configuration are not included. The existing staging ubuntu owner role must exist on the isolated server. No production credentials are needed.

**The selected dump contains no CREATE EXTENSION statement.** Live staging currently has tablefunc 1.0 and plpgsql 1.0. The dump alone therefore does not reproduce the current crosstab reporting dependency. Future rehearsal must first document dump-only results, then explicitly create tablefunc **in the temporary database only** as a separately guarded step of Operation A and test crosstab. No extension change to live spendcraft is required. Preserve the old dump unchanged; a fresh future backup should be inspected for tablefunc and tested separately. Restoring this old, mostly empty artifact does not establish recovery of newer records.

## Capacity analysis

Actual active data directory, WAL, default tablespace and backups are on `/dev/nvme1n1`, ext4 rw, mounted `/spendcraft_staging`. Earlier measurements of `/var/lib/postgresql/15/main` concern an inactive/default directory and must not be used for active-cluster capacity.

- Data volume: 4,143,677,440 bytes total; 2,926,952,448 bytes free (2.73 GiB); 183,175 free inodes.
- Live database metadata size: 9,289,063 bytes (~8.86 MiB).
- Active cluster: 65,024 KiB; WAL: 32,776 KiB (~32 MiB).
- Root: approximately 10.64 GiB free; 1,719,587 free inodes. This is not the reserve for the active database.
- Only pg_default and pg_global tablespaces exist; no external tablespace locations. temp_tablespaces/default_tablespace are empty settings, meaning default storage under the active cluster. The inspected base/pgsql_tmp path was absent/unreadable to the bounded command; no claim is made that all temporary usage is zero.
- WAL segment size: 16 MiB; min_wal_size 80 MiB and max_wal_size 1 GiB. max_wal_size is a checkpoint target, **not a hard bound**.

For this small restore, reserve **512 MiB additional working space** (template database, restored relations/indexes, WAL, temporary files and private logs), with **at least 2 GiB free remaining** and at least 10,000 free inodes. This is deliberately much larger than final database size and is an operational estimate, not a guaranteed WAL bound. 2.73 GiB currently passes the 2.5 GiB admission threshold with limited margin. Recheck immediately before creation, restore and extension work. Monitor from another session; stop work if reserve is threatened, preserving logs/database. Do not run installation or another space-heavy task concurrently. If current size grows or the budget no longer fits, stop and plan additional storage/another isolated server; do not clean or resize automatically.

## Operation A — isolated restore rehearsal, proposed only

Exact reserved name: `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`. The read-only catalog check found this name unused. Never reuse an existing database under this name; choose/review a new name and regenerate the guards if it exists at execution. Do not rename or restore live spendcraft, change its connection settings, stop PM2 or attach the app to this temporary database.

### Admission and prepared files

Before **each** creation, restore, extension or cleanup operation, repeat EC2/account/region identity above, canonical root/.env staging configuration, reviewed backup hash and capacity. Stop on any mismatch. Connect with explicit host, port, user and database, no service-name/default target. Never source `.env` as shell code or print passwords.

Prepared files in the evidence directory:

- `proposed-create.sql`: same administrative connection verifies database postgres, role postgres, Unix-socket identity, port, active data directory and live staging OID before CREATE DATABASE. It refuses an existing target, creates from template0 with observed UTF8/C.UTF-8 settings and ubuntu ownership, limits connections, revokes PUBLIC connect, grants ubuntu connect and returns a creation receipt/OID.
- `proposed-target-guard.sql`: same actual restore/verification/extension session checks the exact temporary name, recorded creation OID, expected role/session user, port, loopback TCP or explicitly reviewed local administrator socket, and no other sessions. Failed admission raises a SQL error before the payload. Admin mode additionally verifies the active data directory.
- `proposed-extension.sql`: only CREATE EXTENSION tablefunc WITH SCHEMA public, to run behind the temporary-target guard.
- `proposed-verification.sql`: read-only catalog/migration/count/crosstab checks; extend the generic row-count comparison to all entries in `expected-restore-inventory.json` during the authorized rehearsal.
- `proposed-cleanup.sql`: fresh administrator identity checks, exact temporary name/OID and zero connected sessions, then one exact DROP DATABASE without FORCE. No wildcard drop, pg_terminate_backend, automatic cleanup or retry.

These SQL drafts have **not** been PostgreSQL-parsed or executed. Their review is preparation, not a claim of executable database acceptance. Maintain a separate private receipt with source host/database, backup hash, temporary OID, timestamps, command exits and verification outcomes. OID is captured automatically from creation, not guessed from the live staging OID.

### Exact command sequence after explicit Operation A approval

The following commands are staging-only, after approved file transfer into a new mode-0700 run folder. They must not run during this preparation. Set umask 077; do not overwrite an earlier run directory. Copy only the reviewed proposed SQL files, expected inventory and selected logs/receipts as needed, never environment files to another host.

```sh
# On the independently reverified staging EC2 host, only after authorization:
umask 077
RUN=/spendcraft_staging/server/script-output/restore-readiness-20261024-huh_tnmi
TARGET=spendcraft_restore_verify_20261024_2429cd_huh_tnmi
BACKUP=/spendcraft_staging/server/backups/database-backup-MeTelm/backup.sql
mkdir -m 700 "$RUN"  # refuses an existing run
# Transfer the reviewed local SQL drafts into RUN after this authorized creation.
sha256sum "$BACKUP"  # must match the pinned backup hash above
# Repeat host/config/capacity admission now. cd /tmp avoids inaccessible cwd warnings.
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -qAt -h /var/run/postgresql -p 5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$RUN/proposed-create.sql") \
  > "$RUN/create-receipt.json" 2> "$RUN/create.stderr.log"
```

Give postgres read/traverse permission only to the reviewed SQL input, not to the whole private evidence folder or credentials. Prefer feeding the reviewed SQL through stdin instead of relaxing run-directory permissions:

```sh
# Use this stdin form for the creation above in the actual authorized operation:
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -qAt -h /var/run/postgresql -p 5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1) \
  < "$RUN/proposed-create.sql" > "$RUN/create-receipt.json" 2> "$RUN/create.stderr.log"
```

**The file-path and stdin examples are alternatives, not two CREATE attempts. Use stdin once.** Stop on nonzero status; do not proceed with an empty/malformed receipt. Extract/validate OID without shell-evaluating JSON:

```sh
TARGET_OID=$(/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node -e \
  'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(r.database!=="spendcraft_restore_verify_20261024_2429cd_huh_tnmi"||!Number.isSafeInteger(Number(r.oid))||Number(r.oid)<=0)process.exit(1);process.stdout.write(String(r.oid))' \
  "$RUN/create-receipt.json")
```

For restore, parse the existing root `.env` with Node parseEnv and pass its five PG settings explicitly to a psql child. The child **overrides database with the exact temporary name**; .env is never changed. Require PG_HOST localhost, PG_PORT 5432, PG_USER ubuntu, source PG_DB_NAME spendcraft, staging APP_URL and exact positive receipt OID. Recheck backup hash in the same runner. Pass the password only in the child environment, no shell echo/CLI value. Ignore inherited PGSERVICE/PGDATABASE/PGOPTIONS and use `-X`. The approved invocation shape is:

```sh
# Environment supplied by the reviewed .env parser; do not type/export passwords:
/usr/lib/postgresql/15/bin/psql -X --no-password \
  -h localhost -p 5432 -U ubuntu -d "$TARGET" \
  -v ON_ERROR_STOP=1 -v expected_user=ubuntu -v expected_oid="$TARGET_OID" \
  --single-transaction -f "$RUN/proposed-target-guard.sql" -f "$BACKUP"
```

A reviewed credential-safe launcher is still required for executing this shape; this document does not pretend that password authentication works without one. The installed backup script already demonstrates parseEnv/explicit-child-environment conventions; do not reuse it as a restore command. Capture stdout/stderr privately because COPY errors can contain row data.

The session guard executes in the same psql connection and transaction immediately before the restore. The verified dump has no connection-switching commands, database creation or external includes; recheck these restrictions and SHA before use. `--single-transaction` + ON_ERROR_STOP ensures SQL failure rolls back the restore transaction; database creation/privilege setup is outside it. No migration/seed is run. Never use pg_restore for this plain SQL file.

After dump-only restoration, record missing tablefunc as expected for this artifact, then repeat identity/capacity admission. Install the dependency into the **temporary** target only, using the same guarded session. Feed SQL through stdin so postgres need not traverse the private run directory:

```sh
cat "$RUN/proposed-target-guard.sql" "$RUN/proposed-extension.sql" | \
  (cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
    /usr/lib/postgresql/15/bin/psql -X -h /var/run/postgresql -p 5432 \
    -U postgres -d "$TARGET" -v ON_ERROR_STOP=1 \
    -v expected_user=postgres -v expected_oid="$TARGET_OID" --single-transaction) \
  > "$RUN/extension.stdout.log" 2> "$RUN/extension.stderr.log"
```

Use pipefail so a failed input read cannot be mistaken for successful execution. No fallback to live spendcraft is permitted. The live ubuntu role lacks CREATEDB; all privileged creation/extension/drop operations use the verified local postgres role, not a new grant to ubuntu.

### Restore acceptance and cleanup

Run the same target guard followed by proposed-verification.sql with explicit temporary connection and `PGOPTIONS='-c default_transaction_read_only=on'`, using a single read-only transaction and credential-safe runner. Compare every dump COPY table's row count with expected-restore-inventory.json, including adonis metadata; compare schema/table/index/constraint/sequence identities and sequence setval state with the dump. Check FK definitions and convalidated states against the saved schema, not an invented repair policy. Do not validate/repair historical constraints automatically.

Verify tablefunc 1.0 and crosstab's synthetic result 42, schema ownership, required tables and no unexpected restore errors. Preserve dump-only results and the separately added dependency evidence. Do not connect the live app to the restored database or start any jobs against it. Record duration; the database is small, but runtime has not been measured. Allow an operator window of 10–20 minutes for review/restore/comparison, not a performance guarantee. PM2 remains running; no downtime is intended.

Cleanup needs explicit authorization (either included clearly in Operation A approval or requested afterward). First positively connect to the exact temporary database/OID as ubuntu in read-only mode and verify it; close that connection. Then independently repeat host/admin admission and run:

```sh
# Only after explicit cleanup approval; never terminate other sessions to make DROP pass:
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -h /var/run/postgresql -p 5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1 -v expected_oid="$TARGET_OID") \
  < "$RUN/proposed-cleanup.sql" > "$RUN/cleanup.stdout.log" 2> "$RUN/cleanup.stderr.log"
```

No force/drop-if-exists/wildcards. If restore fails, retain the isolated database/logs, mark incomplete, do not automatically retry. If cleanup fails, retain exact identity/cause, ensure no app references it and request reviewed cleanup. Never restore this dump into live spendcraft as a verification shortcut.

## PM2 startup investigation

Current runtime owner is ubuntu, UID 1000; daemon PID 49118 uses Node `/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node`, PM2_HOME `/home/ubuntu/.pm2`. Its three live children match PID files, current installation cwd and saved scripts:

| Name | PID | Script/arguments | Schedule |
| --- | --- | --- | --- |
| queue | 115426 | ace.js queue:listener | none saved |
| plaid-cleanup | 115432 | ace.js plaid:cleanup-listener | immediate sweep, then every 60 seconds in application code; PM2 restart delay 5s/kill timeout 30s |
| prod-server | 118658 | bin/server.js | midnight PM2 cron, `0 0 * * *` |

All cwd paths are `/spendcraft_staging/server/spendcraft`. The legacy label `prod-server` is also the staging manifest's name; its root and configured DB are staging. If “no production process names” means forbidding even that label, changing it requires a coordinated manifest/installer review and new artifact; do not rename it independently and break manifest admission. No actual production process is selected by this proposed unit.

Installed global PM2 package is **7.1.0**, executable `/home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2`. This establishes package version, not a fresh daemon RPC version. Saved dump SHA `2ef6c41410ba7306a978a6f2b30ed74283ddc2374d12c3709f66503c46c5ad37` has exactly these three fork-mode definitions, staging paths, explicit Node interpreter, NODE_ENV production and staging SPENDCRAFT_ROOT. PG/provider/SMTP secrets were absent in the inspected saved process fields; application configuration is loaded through current .env. This bounded check is not a full proof that every inherited environment field is safe. Review the full dump privately before resurrection.

System and user service inventories and precise content scans found no PM2/SpendCraft/resurrect service under another name. Broad substring matches were TPM2 OS units, not PM2; they must remain untouched. No rc.local file, root/user crontab entry or shell PM2/resurrect command was found; .bashrc only references the installation root. User linger is off. Thus no observed boot mechanism restores this daemon. Its original manual launch history remains unknown.

`installer/pm2-processes.json` is the release-owned definition; no ecosystem file is required. `managePm2.mjs` uses the manifest to stop/start selected names and validates paths. The saved list/daemon must be verified immediately before any future `pm2 save`, not reconstructed from assumptions. Do not launch a second daemon under root, another PM2_HOME or a new service user.

**Additional tooling mismatch:** installer/rollbackApplication.mjs requires PM2 package and daemon 5.4.1. Installed package 7.1.0 will be rejected. Leave that guard unchanged. Separate narrowly scoped compatibility review/tests or an explicitly reviewed version-management decision is required; this task neither downgrades PM2 nor approves 7.1.0 for rollback. The existing tax-incompatible previous releases already block application rollback independently.

## External side effects and startup stop condition

Plaid environment is sandbox; sandbox secret is present and production secret absent. Redis/BullMQ hosts are local. That is useful isolation evidence, not proof that automatic startup has no external effects.

- QueueListener creates a Plaid webhook worker, performs provider sync/database writes and may send push notifications afterward.
- PlaidCleanupListener sweeps immediately at startup, then each minute, and can remove sandbox provider items. Its context checks do not disable the worker.
- SMTP is nonlocal, credentials are present and its host did not match the bounded local/capture-sink candidate list. The mailbox/account's staging-only safety is **unverified**, not proven to be production.
- VAPID keys exist; web-push can contact persisted subscription endpoints. No APNs key file was present, but that does not disable web-push. The APNs provider source targets Apple's production push hostname when a key/subscription exists.
- No automatic OFX import schedule was identified in reviewed startup commands. Do not infer absence of every external/manual job from that observation.
- UFW is inactive. AWS egress/other firewall policies were not inspected in this task; effective outbound isolation is **unknown**, not proved absent. No provider/SMTP/push request was made for testing.

**Do not enable/reboot into automatic workers until these integrations are safely classified and fenced or explicitly approved as staging-only.** Establish a safe mail capture configuration, synthetic subscriptions/provider records and separately reviewed egress controls or demonstrate equivalent existing isolation. This is a safety-design gate for Operation B; it is not authorization to alter .env, queues, providers or networking now. Do not clear jobs or subscriptions as “cleanup.”

## Operation B — proposed startup configuration and reboot, blocked pending gates

Prefer a dedicated **system service name** `pm2-spendcraft-staging.service` running the existing ubuntu PM2_HOME; do not migrate home or launch a duplicate daemon. Prepared draft: `script-output/staging-recovery-readiness-huh_tnmi/proposed-pm2-spendcraft-staging.service`. It uses explicit Node/PM2 paths, staging cwd/root, HOME/PM2_HOME/NODE_ENV/PATH, dependencies on PostgreSQL/Redis/network readiness, RequiresMountsFor the actual shared data volume, and the existing PM2 PIDFile. It does not source shell startup or place secrets in the unit.

The installed PM2 startup template uses resurrect/start and kill/stop, with reload all. A reviewed custom unit can add the needed mount/service dependencies and omit bulk reload. `pm2 startup` could generate the base unit, but it writes/enables systemd state and its current template lacks the explicit staging mount/service readiness. Do not run it now or install both generated/custom units. `pm2 save` is appropriate only after exact live/saved-manifest/env review, with a private snapshot of the prior dump; it is not a generic safety check.

After a separate Operation B approval, and **only after integration/version decisions**, reverify exact daemon/package identity and all intended saved/live definitions. Preserve the current dump privately; do not run unrestricted jlist/env dumps into public logs. Prove no unrelated app shares the selected home, no production path/credential is inherited, child processes drain safely, and cron cannot resurrect writers unexpectedly during maintenance. QueueListener does not have the same explicit shutdown hook as PlaidCleanupListener; wait for active jobs to drain before reboot rather than assuming graceful completion.

Proposed future commands (not executed):

```sh
# After host identity and safety gates, as ubuntu, using only the existing daemon:
export PM2_HOME=/home/ubuntu/.pm2
export PATH=/home/ubuntu/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin
# Verify existing daemon PID is alive and selected list equals the reviewed staging manifest first.
/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node \
  /home/ubuntu/.nvm/versions/node/v24.15.0/lib/node_modules/pm2/bin/pm2 save
# After review/approved transfer of the draft unit:
sudo install -o root -g root -m 0644 "$RUN/proposed-pm2-spendcraft-staging.service" \
  /etc/systemd/system/pm2-spendcraft-staging.service
sudo systemd-analyze verify /etc/systemd/system/pm2-spendcraft-staging.service
sudo systemctl daemon-reload
sudo systemctl enable pm2-spendcraft-staging.service
systemctl cat pm2-spendcraft-staging.service
systemctl show pm2-spendcraft-staging.service \
  -p User -p Group -p Environment -p PIDFile -p ExecStart -p ExecStop -p RequiresMountsFor
```

Use a separate uniquely named Operation B RUN folder and approved copy; do not reuse Operation A paths implicitly. **Enable without --now**: do not run resurrect/start against an already-running manually launched daemon just to “test” the unit. Installing/enabling a unit is not proof that reboot works. The unit's ExecStop kills the selected daemon; admission must first prove it contains only the intended staging apps. A generic force/restart-all fallback is prohibited.

### Later reboot rehearsal — separate explicit approval

1. Reverify EC2/account/root, current live DB identities, disk reserve, exact saved process list/private dump hash and node paths, unit syntax/dependencies, safe integration/queue state and a verified fresh recovery point.
2. Record EC2 boot ID/time, PIDs/process list, services, local HTTP/HTTPS and approved authenticated reads. Establish SSH/SSM or console recovery access; do not assume SSM exists.
3. Obtain explicit reboot approval, then on that verified host run `sudo systemctl reboot` once. Do not call AWS stop/start or modify security groups.
4. Reconnect using existing SSH host-key verification; recheck IMDS identity and changed boot ID. Check PostgreSQL/Redis/Nginx active, mounted data volume present and `systemctl is-active pm2-spendcraft-staging.service`.
5. Verify exactly one ubuntu daemon in /home/ubuntu/.pm2; its service MainPID/PIDFile and three expected children, cwd/interpreters/args, approved cron settings and no extra processes. A live PID alone does not certify script/environment correctness.
6. Independently verify live staging database identity; inspect private systemd/PM2 startup logs for errors without publishing secrets. Check HTTP localhost:3334 and HTTPS staging.spendcraft.app, then separately approved authenticated read/report checks.
7. Verify no unexpected imports, queued provider cleanup, mail or push delivery occurred. Do not declare success solely from HTTP 200. Record elapsed reboot/recovery time; it has not yet been measured. Allow a maintenance window with operator recovery time, not a guaranteed downtime estimate.

If startup fails, inspect `systemctl status pm2-spendcraft-staging.service` and `journalctl -u pm2-spendcraft-staging.service -b --no-pager` privately. Do not run arbitrary `pm2 resurrect` or start a second daemon. First identify service ownership, existing PID/home and failed stage. After separately authorized corrective action, start only the reviewed staging manifest with the installed managePm2 helper, or the reviewed unit once, never both concurrently. Do not invoke the installer or alter application release slots as a service-recovery shortcut. Unknown daemon/env, provider side effects or a missing mount stops automatic recovery and requires operator review.

If SSH does not return, report reachability and observed service status, use only already-authorized console/SSM access if available, and preserve evidence. Do not automatically modify unrelated AWS resources or production.

## Acceptance matrix, verification and remaining gates

| Operation | Future passing evidence |
| --- | --- |
| A creation/isolation | verified host/admin identity, new exact temporary DB/OID, live DB/env unchanged, no PM2 operation |
| A restore | zero unexpected errors, transaction commits, saved schema/data/counts/owners/sequences/constraints match |
| A dependency | dump-only missing extension recorded; guarded temporary tablefunc installation and read-only crosstab=42 |
| A failure | failed transaction rolls back; temporary DB/logs isolated; no automatic retry/drop or live overwrite |
| A cleanup | explicit approval, positive temp connection/OID, fresh admin check/no other sessions, one exact non-FORCE DROP |
| B static admission | reviewed version/env/integration isolation, unique unit/home, exact three saved/live definitions, mount and service requirements |
| B reboot | same EC2 returns, new boot ID, intended services/one daemon/three children recover, health and side-effect checks pass |
| B failure | exact failed stage/logs preserved, no arbitrary process resurrection, production untouched |

This preparation checks local script syntax, documentation references, expected inventory reconciliation and both Git whitespace diffs only. SQL and unit drafts have not been executed or validated by a PostgreSQL/systemd runtime. No destructive tests ran. Earlier tax PostgreSQL acceptance is unchanged and is not evidence that these operational procedures have passed.

Operation A needs explicit authorization for creation/restore/temporary extension, a reviewed credential-safe runner and optional separately explicit cleanup. Operation B remains blocked by integration-isolation uncertainty and the PM2 package/rollback-support mismatch; legacy process-name wording also needs clarification if a literal ban on prod-server is intended. No bypass, package downgrade, process rename or network change is approved here. Tax deployment stays blocked until successful restore rehearsal, boot recovery or an explicitly accepted alternative, refreshed identity/capacity and unchanged artifact verification.

Changed files: this document and a linked readiness addendum to transaction-tax-decimal-string-staging-verification.md. Existing deployment/recovery edits and unrelated files remain preserved; no stage or commit.

## Isolated restore Phase A — October 24, 2026: PASSED; execution not authorized

This section supersedes the earlier Operation A draft commands, extension ordering and missing-runner status. It does **not** resolve restore recoverability until Phase B succeeds. PM2/reboot/integration blockers remain separate and unchanged; this operation neither starts workers nor deploys the tax release.

Source HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. At entry, .gitignore, deployment/recovery documents, seven staged audit-file deletions and unrelated untracked work already existed; preserve them. Evidence and reviewed proposed inputs are local under `script-output/staging-restore-preflight-2zscgg82/`. No helper/input was uploaded or executed remotely; only read-only inspection code ran over SSH stdin.

### Fresh admission evidence

- IMDSv2 verified account `011038405378`, region `us-west-2`, EC2 `i-0b24684c411b4b829`, private address `172.31.10.95`; host `ip-172-31-10-95`, canonical root `/spendcraft_staging/server`, APP_URL staging.spendcraft.app and port3334 matched. Each database inspection rechecked host/config identity before connecting.
- Separate pg, pgLog and inspection clients verified configured/live `localhost:5432/spendcraft`, authenticated/current user ubuntu, server and peer `127.0.0.1/32`, actual socket `127.0.0.1:5432`, read-only on. Connections ended with ROLLBACK. Server is 15.19; no setup/fixture/cleanup SQL ran.
- Local postgres administrator socket separately verified maintenance database postgres, role postgres, port5432, data directory `/spendcraft_staging/postgresql/15/staging`, and live database OID16839. Null IPs are expected for this explicit Unix socket; they do not substitute for TCP address validation.
- Exact temporary name `spendcraft_restore_verify_20261024_2429cd_huh_tnmi` is **absent** in independent administrator and application catalog checks; zero matching sessions. Shared/current/old environment files, saved PM2 dump and running PM2 child environments contain no reference to it. No observed app/other test uses this name. Recheck absence before CREATE; if present at execution, stop without reuse/drop.
- Selected backup remains `/spendcraft_staging/server/backups/database-backup-MeTelm/backup.sql`, 61,112 bytes, uncompressed SQL, SHA-256 `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a`. Completed2026-10-23T14:06:01.727Z, origin localhost:5432/spendcraft userubuntu; summary, hash, size and footer match. Dump server/client and available psql are15.19. Only restrict/unrestrict client directives occur; no CREATE/DROP DATABASE, DROP SCHEMA or conflicting CREATE SCHEMA public was found. Preserve this exact artifact, never substitute it.
- Schema/data inventory: 27 tables,25 sequences,46 constraints, one explicit index plus constraint-generated indexes; ownership ubuntu; adonis_schema and adonis_schema_versions included. COPY counts match the earlier inventory. No roles are created by this dump. Existing ubuntu owner role is available; administrative work uses local postgres, not a new CREATEDB grant.
- tablefunc is available on this server, installed in live staging, but **not declared in this dump**. Phase B must create it in the newly created temporary database **before restoring**, after actual target/OID admission. Do not change live extensions or global configuration. No migrations or seeders are needed.
- Active data and backup share `/dev/nvme1n1`, ext4 rw on /spendcraft_staging: **2,926,952,448 free bytes**,183,175 free inodes. Active cluster65,024KiB, WAL32,776KiB; live DB9,289,063bytes. Default tablespaces and PostgreSQL temporary files use this active data volume, not the root filesystem. A 512MiB peak working budget leaves2,390,081,536bytes (~2.23GiB), exceeding the2GiB reserve by242,597,888bytes. Require at least10,000free inodes and2.5GiB free immediately before work. Budget includes restored relations/indexes/template overhead, WAL/temp/log contingency; it is an estimate, not a hard WAL bound. Monitor and stop if reserve is threatened; no concurrent installer/cleanup/resize.
- Three PM2 children remained running and local/public HTTP returned200. Basic health is not full authenticated acceptance. No PM2 control operation ran.

Non-sensitive live baseline is in database-preflight.json: database identity, schemas/tables/indexes/constraints/sequences/extensions and catalog fingerprint `0b21e7d4280f603b015f86e69729d8b3566652e005f5cc4939e6e376d82228a0`; representative counts are48Transactions,3Accounts,27Categories,100migration rows. These counts are not financial amounts. Repeat the same read-only catalog/count capture immediately before and after Phase B and after cleanup; compare with the new baseline, not this stale snapshot. Active app writes can legitimately change counts; investigate differences, do not repair/revert them or claim causation from counts alone. Record only aggregate/catalog evidence, no unnecessary financial rows. Repeat HTTP/application DB connectivity checks.

### Prepared Phase B inputs and exact commands — DO NOT RUN until approved

Prepared local files: recheck-host.py, proposed-create.sql, proposed-target-guard.sql, proposed-extension.sql, proposed-verification.sql, proposed-cleanup.sql, restore-psql.mjs, expected-restore-inventory.json. These are operation-specific review inputs, not installed application/release files. JavaScript/Python/shell syntax can be checked without execution; PostgreSQL SQL acceptance remains pending the authorized rehearsal.

`restore-psql.mjs` completes the formerly missing credential-safe launch: it parses the root .env with parseEnv, validates all five PG settings plus APP_URL, independently verifies IMDS identity/root/backup/hash/capacity/creation receipt, overrides only the child database to the exact temporary target, drops inherited libpq target settings, and passes the password privately in the child's environment. Its explicit restore/verify operation selects the SQL; no default operation or live restore exists. It prints a unique private output path before database work. psql uses explicit host/port/user/database, `-X --no-password`, ON_ERROR_STOP and one transaction. The SQL guard checks the actual execution session's exact temporary name, authenticated role, port, addresses, recorded creation OID and no other sessions before any payload. Verify additionally enforces read-only on. No credentials or raw COPY errors are printed to the console; private logs may contain row data on failure and must not be committed.

The complete future sequence is below. Phase B approval must explicitly cover temporary creation, tablefunc, restore and verification. **Cleanup requires its own explicit confirmation/authorization**; omission leaves the database intact. Copy the reviewed inputs only after Phase B approval; do not run the installer. Preserve the local prepared-input hashes and compare uploaded bytes. Never copy .env or production data.

```sh
# Local: only AFTER Phase B authorization. This transfers reviewed rehearsal inputs,
# not the release installer or application. First repeat verified SSH/IMDS staging identity.
LOCAL_INPUTS="$PWD/script-output/staging-restore-preflight-2zscgg82"
# On staging, after approval, create this new private evidence directory once:
# umask 077; mkdir -m 700 /spendcraft_staging/server/script-output/isolated-restore-20261024-2zscgg82
scp -i "$SPENDCRAFT_STAGING_SSH_KEY" \
  "$LOCAL_INPUTS/recheck-host.py" "$LOCAL_INPUTS/restore-psql.mjs" \
  "$LOCAL_INPUTS/proposed-create.sql" "$LOCAL_INPUTS/proposed-target-guard.sql" \
  "$LOCAL_INPUTS/proposed-extension.sql" "$LOCAL_INPUTS/proposed-verification.sql" \
  "$LOCAL_INPUTS/proposed-cleanup.sql" "$LOCAL_INPUTS/expected-restore-inventory.json" \
  ubuntu@staging.spendcraft.app:/spendcraft_staging/server/script-output/isolated-restore-20261024-2zscgg82/
```

The following run **only on the freshly verified staging instance**. Enable shell error/pipe handling; a failed creation/extension/restore/verification must end the sequence without retry or cleanup. Do not paste the cleanup block as part of an automatic combined script.

```sh
set -euo pipefail
umask 077
RUN=/spendcraft_staging/server/script-output/isolated-restore-20261024-2zscgg82
TARGET=spendcraft_restore_verify_20261024_2429cd_huh_tnmi
NODE=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node
python3 "$RUN/recheck-host.py"
# First capture the read-only live catalog/count baseline using the reviewed Phase A queries.
# CREATE uses its own verified administrative session and refuses an existing target:
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -qAt -h /var/run/postgresql -p5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1) \
  < "$RUN/proposed-create.sql" > "$RUN/create-receipt.json" 2> "$RUN/create.stderr.log"
TARGET_OID=$("$NODE" -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(r.database!=="spendcraft_restore_verify_20261024_2429cd_huh_tnmi"||!Number.isSafeInteger(Number(r.oid))||Number(r.oid)<=0)process.exit(1);process.stdout.write(String(r.oid))' "$RUN/create-receipt.json")
# New actual temporary connection: check host/capacity, then target identity/OID before extension.
python3 "$RUN/recheck-host.py"
cat "$RUN/proposed-target-guard.sql" "$RUN/proposed-extension.sql" | \
  (cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
    /usr/lib/postgresql/15/bin/psql -X -h /var/run/postgresql -p5432 \
    -U postgres -d "$TARGET" -v ON_ERROR_STOP=1 \
    -v expected_user=postgres -v expected_oid="$TARGET_OID" --single-transaction) \
  > "$RUN/extension.stdout.log" 2> "$RUN/extension.stderr.log"
# Credential-safe restore; this explicit command is NOT authorized during Phase A:
python3 "$RUN/recheck-host.py"
"$NODE" "$RUN/restore-psql.mjs" --operation restore \
  --run-directory "$RUN" --temporary-oid "$TARGET_OID"
# Same target guard, now in an enforced read-only transaction:
"$NODE" "$RUN/restore-psql.mjs" --operation verify \
  --run-directory "$RUN" --temporary-oid "$TARGET_OID"
# Repeat the live read-only catalog/count/connectivity checks and disk measurement.
```

Creation returns/captures the new database OID automatically; do not substitute live OID16839. Creation/admin-session target validation is distinct from actual temporary-session validation. The restore transaction is atomic; creation/privilege setup and extension creation are separate guarded operations. If restore fails, its transaction rolls back; the isolated temporary database/extension can remain. Stop, preserve evidence and ask for cleanup approval; never automatically retry, drop or restore into live spendcraft.

### Verification and evidence matrix

| Gate | Phase B evidence |
| --- | --- |
| Restore completion | exact command/source/host/DB/OID/hash, timestamps, exit0, private stdout/stderr reviewed for unexpected errors |
| Objects | expected public schema,27table names,25sequence names,46constraint names and all derived index names; SQL assertions fail on mismatch |
| Data | every dump COPY table's expected row count (including migration100/version1/tax categories3 and zero-row tables); not current live counts |
| Integrity | FK/constraint definitions and validation state, owners and sequence state compared to dump; never fix mismatches to pass |
| Extensions/report | tablefunc1.0 only added to temporary; synthetic read-only crosstab returns42; no live extension mutation |
| Real report SQL | optionally prepare current TaxesController SELECT using synthetic/restored data and existing filters; do not boot the application or import provider jobs against temporary DB. Empty dump Transactions mean result sets are empty, not end-to-end report acceptance |
| Isolation | temp targetguard in same actual connection/transaction; no app config reference, no other sessions; three PM2 PIDs remain unchanged except independently explained scheduled activity |
| Live noninterference | fresh before/after identity/schema/extension/count baseline, read-only connectivity and HTTP health; document legitimate concurrent changes without repairing them |
| Capacity | actual data-volume bytes/inodes before/after and observed peak,512MiBbudget,2GiBremaining reserve |
| Cleanup | explicit approval and exact DROP confirmation, positive temporary connection/OID, fresh admin identity/no sessions, target absent afterward, live metadata/health rechecked |

Index names are reconciled from explicit dump indexes plus dump constraint-backed names; catalog assertions are not based on a mistaken “one total index” count. Prepared SQL checks counts/object names, read-only mode, tablefunc and crosstab. Comparing full definitions/sequence setval state and reviewing private restore logs remains part of Phase B evidence; no assertion is waived because the dump's application tables are empty.

### Separately authorized cleanup — no automatic DROP

Only after explicit cleanup authorization, positively reconnect to the temporary target with the verify helper (read-only) to recheck exact name/OID/identity, close it, and confirm no app configuration references it. Reverify EC2/root/capacity, then explicitly type:

```sh
python3 "$RUN/recheck-host.py"
"$NODE" "$RUN/restore-psql.mjs" --operation verify \
  --run-directory "$RUN" --temporary-oid "$TARGET_OID"
printf 'Type DROP %s to remove only this temporary database: ' "$TARGET"
read -r CLEANUP_CONFIRMATION
[ "$CLEANUP_CONFIRMATION" = "DROP $TARGET" ] || exit 1
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -h /var/run/postgresql -p5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1 -v expected_oid="$TARGET_OID" \
  -v cleanup_confirmation="$CLEANUP_CONFIRMATION") \
  < "$RUN/proposed-cleanup.sql" > "$RUN/cleanup.stdout.log" 2> "$RUN/cleanup.stderr.log"
```

The drop SQL independently verifies admin connection, active data directory/live staging identity, exact temporary name/OID, no other sessions and exact confirmation. It does not use wildcards, FORCE, DROP IF EXISTS or session termination. Cleanup must not run after an earlier restore/verification failure without reviewing that failed state and getting explicit cleanup approval; positive identity may be checked with the targetguard alone if full acceptance cannot pass. Missing/mismatched database or receipt stops cleanup. Retain logs even after successful drop. If cleanup is not approved or fails, report the isolated database's actual state and leave it intact.

### Phase A result and approval boundary

Phase A passes host, three read-only connection identities, administrative identity, exact backup, target absence/isolation, tablefunc availability, capacity and basic connectivity. Local script syntax, documentation links and both Git diff checks must pass before final report; SQL has not been executed or PostgreSQL-acceptance-tested. Restore recoverability remains **unverified**. PM2 version/startup/email/push issues remain deployment blockers, but are not prerequisites for this isolated rehearsal that keeps PM2 running.

Request fresh Phase B approval for the exact temporary database on this EC2 instance: create, temporary-only tablefunc, restore and read-only verification. Ask whether cleanup is included explicitly; otherwise preserve the database. No tax release deployment, historical conversion, PM2/systemd/reboot change, migration, live database mutation or production access is authorized.

## Authorized Phase B attempt — October 24, 2026: restore succeeded; verification stopped

Source HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The operator explicitly authorized creation, temporary-only tablefunc, restore, verification and **successful-verification-only cleanup**. Production, live database mutation, PM2/systemd/reboot/release changes and deployment remained excluded.

Fresh EC2/account/root, exact pinned backup SHA `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a`, temporary absence/configuration isolation, independent pg/pgLog/execution read-only identities, separate administrator identity and capacity checks passed. Each mutation phase repeated admission; the actual administrative or temporary execution session additionally checked its precise database/server/user/OID before SQL.

The first attempt stopped during evidence-folder setup because the parent script-output directory was absent; it reached **no CREATE or restore SQL**. That setup error was corrected, the initial diagnostic was retained, and all preflight guards repeated before proceeding. The actual backup restore was attempted exactly once.

| Stage | Actual outcome |
| --- | --- |
| CREATE | succeeded: `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, owner ubuntu, OID **17260** |
| Extension | tablefunc CREATE succeeded in that temporary database only, behind same-session target admission |
| Restore | psql exit **0**, ON_ERROR_STOP, complete backup in one transaction; committed successfully |
| Read-only verification | **failed** at proposed-verification.sql line177, intentional error assertion `constraint_inventory_mismatch` |
| Extended full-dump/hash comparison | **not run** because the preceding SQL acceptance gate failed |
| Cleanup | **not run**, as required on verification failure; no DROP or automatic retry |

The restored catalog printed **51 constraints**:27 primary keys,17 foreign keys,2 unique and5 CHECK constraints, all marked validated. The prepared expected inventory had only46 names parsed from ADD CONSTRAINT statements. It omitted the five CHECK constraints represented by the table-definition path. The existing source/live catalog has those five CHECK constraints as well. This establishes an inadequate verification expectation; it does **not** establish a restore defect or full restore acceptance. No assertion was weakened or rerun. Next review must include inline CHECK definitions in the expected inventory, then separately authorize a verification retry and conditional cleanup; do not restore again automatically.

The preserved verification log had already produced the table/index/constraint/sequence and migration-count outputs and synthetic crosstab result42 before the failing inventory assertion. Per-table count assertions and earlier object checks reached before line177 did not fail. Later index/validation assertions, independent full-definition/COPY-data/sequence-state hashing and final acceptance remain **incomplete**, not passed by inference.

Last successful restore capacity measurement: **2,921,373,696 bytes** free (~2.721GiB), above the2GiBreserve. Sampled additional storage was only several MiB, within the512MiBbudget; no capacity guard failed. Measurements are sampled, not a guarantee of an exact instantaneous peak. The failed verification does not publish a successful phase metric.

Read-only post-failure inspection confirmed the temporary database remains present, no temporary sessions remain, and live staging identity/schema fingerprint/representative counts remain unchanged:48Transactions,3Accounts,27Categories,100migration rows. PM2 PIDs115426(queue),115432(plaid-cleanup),118658(prod-server) remained alive; local HTTP and staging HTTPS both returned200. This is metadata/connectivity noninterference evidence, not a claim to have exported/compared every live financial value. All connections to live spendcraft in this task used read-only transactions.

Local evidence: `script-output/staging-restore-rehearsal-x8e0zc8a/`, including phase-b-summary.json, per-stage results and private failure evidence. Remote preserved evidence: `/spendcraft_staging/server/script-output/isolated-restore-guxei2lz/`; the verification's private psql log and temporary database remain for investigation. Logs may contain private diagnostics; do not commit them. No password or financial row contents were included in the public report.

**Restore recoverability is not yet accepted.** The current attempt is stopped, and its authorization is closed; no further mutation, verification retry or cleanup will occur without fresh direction. Remaining staging deployment gates include corrected/reexecuted restore verification and cleanup, PM2 startup/reboot readiness, PM2 version compatibility review and integration isolation. No tax release deployment or historical conversion occurred.

## Verification-inventory correction — October 24, 2026; offline only

HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. No SSH or PostgreSQL connection occurred in this correction task. The temporary database is preserved; its **last observed** identity is `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID17260. Its current identity must be reverified after fresh authorization. No CREATE, restore retry, DROP, migration or deployment is authorized here.

The defect was in the expected inventory:46 ADD CONSTRAINT names omitted five CHECK constraints included by the table-definition path. The corrected inventory is independently reconciled from the **pre-restore source catalog**, the pinned dump's prior ADD-name inventory, and actual migration declarations—not from the failed restore's total. PostgreSQL classifications are `p` primary key(27), `f` foreign key(17), `u` unique(2), and `c` CHECK(5).

| Independently established CHECK | Actual source declaration |
| --- | --- |
| `account_transactions_provider_check` | `database/migrations/1657230337124_account_transactions.ts` |
| `categories_recurrence_range_check` | `database/migrations/1792000000000_categories_recurrence_range_check.ts` |
| `plaid_item_cleanups_attempt_count_check` | `database/migrations/1791500000000_plaid_item_cleanups.ts` |
| `plaid_item_cleanups_check` | `database/migrations/1791500000000_plaid_item_cleanups.ts` |
| `plaid_item_cleanups_status_check` | `database/migrations/1791500000000_plaid_item_cleanups.ts` |

The provider enum is implemented as a PostgreSQL CHECK; the three unnamed cleanup checks acquire PostgreSQL-generated names shown by the captured source catalog. The recurrence check is explicitly named. Reviewed source declarations and file hashes accompany all five. Catalog definitions preserve PostgreSQL's normalized forms (IN/BETWEEN may appear as ANY or comparisons). No constraint expression is changed.

Implementation: `scripts/prepareStagingRestoreVerification.mjs`; reviewed metadata: `scripts/fixtures/stagingRestoreConstraintInventory.json`; non-DB regressions: `scripts/prepareStagingRestoreVerification.test.mjs`. The fixture records exact definitions and validation states from the independently captured pre-restore catalog with evidence SHA/provenance. That earlier catalog did not include relation names; table associations are mapped by longest existing table-name prefix, with the CHECK associations cross-checked against their migrations. Future SQL explicitly checks actual relation/schema membership; it cannot accept an incorrect association merely because a name/count matches. Whole-backup legacy constraints remain included for restoration fidelity, without reactivating deprecated application behavior.

The offline generator reconciles every non-CHECK name with the original dump ADD inventory, verifies all CHECK source references/hashes, and replaces **only** the faulty assertion. The generated SQL compares schema, relation, name, pg_constraint.contype, pg_get_constraintdef and convalidated using bidirectional EXCEPT ALL. Missing/extra/changed constraints fail; a changed total is not the acceptance criterion. LEFT JOIN preserves unexpected domain/other constraints as mismatches instead of silently excluding them. Existing read-only/OID guards, schema/data/sequence/index/report checks and failure behavior are retained. Source drift, duplicate identities and ambiguous replacement fail closed. No database driver is imported by the offline preparer.

Prepared output: `script-output/restore-verification-correction-vlxmo1to/restore-verification-c8kUho/corrected-verification.sql`, constraint-inventory.json and a read-only live probe that requires the existing OID17260. Original failed scripts/logs remain untouched. Generate another unique output if needed; never patch the old failed evidence in place. The saved tax installer/archive is unchanged and must not be rebuilt for this operational correction.

### Exact future retry commands — fresh verification/conditional-cleanup approval required

First, on staging after approved read-only identity checks, run the existing recheck helper; it verifies IMDS account/region/instance, canonical staging root/config, pinned backup and capacity. Create a new private **evidence directory only**. No database creation or restoration command is part of this retry.

```sh
# On staging only AFTER fresh authorization:
set -euo pipefail
umask 077
ROOT=/spendcraft_staging/server
ORIGINAL="$ROOT/script-output/isolated-restore-guxei2lz"
NODE=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node
python3 "$ORIGINAL/recheck-host.py"
NEW_RUN=$(mktemp -d "$ROOT/script-output/verification-retry-XXXXXX")
printf '%s\n' "$NEW_RUN"
# Preserve the original attempt. Copy only its metadata/unchanged guarded tools.
cp "$ORIGINAL/create-receipt.json" "$ORIGINAL/proposed-target-guard.sql" \
  "$ORIGINAL/restore-psql.mjs" "$ORIGINAL/verify-restored-dump.mjs" "$NEW_RUN/"
"$NODE" -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(r.database!=="spendcraft_restore_verify_20261024_2429cd_huh_tnmi"||String(r.oid)!=="17260"||r.owner!=="ubuntu")process.exit(1)' "$NEW_RUN/create-receipt.json"
```

Copy the following two local prepared files to the **printed** new evidence directory. On the local workstation, set NEW_RUN to that exact printed path, not an installed release directory. Compare transferred SHA-256 values with local prepared files before executing.

```sh
# Local, only after the same fresh authorization:
INPUTS="$PWD/script-output/restore-verification-correction-vlxmo1to/restore-verification-c8kUho"
# NEW_RUN must be the exact newly printed staging evidence directory.
scp -i "$SPENDCRAFT_STAGING_SSH_KEY" "$INPUTS/corrected-verification.sql" \
  "ubuntu@staging.spendcraft.app:${NEW_RUN}/proposed-verification.sql"
scp -i "$SPENDCRAFT_STAGING_SSH_KEY" "$INPUTS/read-only-live-existing.mjs" \
  "ubuntu@staging.spendcraft.app:${NEW_RUN}/read-only-live-existing.mjs"
```

Then, in the verified staging session, repeat identity/capacity admission and use the read-only probe. It independently checks configured/live pg, pgLog and execution connections, server/peer/socket addresses, authenticated user and database. It requires temporary catalog OID17260 and no other temporary sessions. The actual temporary execution connection is independently guarded again inside the psql transaction before any verification query.

```sh
python3 "$ORIGINAL/recheck-host.py"
"$NODE" "$NEW_RUN/read-only-live-existing.mjs" > "$NEW_RUN/live-before.json"
# Capture current PM2 PID files/process metadata and HTTP/HTTPS health, without PM2 control.
"$NODE" "$NEW_RUN/restore-psql.mjs" --operation verify \
  --run-directory "$NEW_RUN" --temporary-oid 17260
"$NODE" "$NEW_RUN/verify-restored-dump.mjs" "$NEW_RUN"
"$NODE" "$NEW_RUN/read-only-live-existing.mjs" > "$NEW_RUN/live-after.json"
"$NODE" -e 'const fs=require("node:fs");const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).database,b=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).database;if(a.schemaSha256!==b.schemaSha256||JSON.stringify(a.representativeCounts)!==JSON.stringify(b.representativeCounts))process.exit(1)' "$NEW_RUN/live-before.json" "$NEW_RUN/live-after.json"
"$NODE" -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(r.status!=="verified"||r.database!=="spendcraft_restore_verify_20261024_2429cd_huh_tnmi"||String(r.identity.oid)!=="17260")process.exit(1)' "$NEW_RUN/verified.json"
```

The existing runtime tool retains a restore branch for its original purpose; **only --operation verify is used here**. Never pass --operation restore. The corrected psql payload runs under enforced read-only mode and ON_ERROR_STOP. Independent extended verification compares table definitions (including inline CHECKs), ADD constraints, indexes, defaults, owners, sequence definitions/ownership/setval state and hashes of every raw COPY block without persisting financial rows. A fresh verified.json is written only if all those checks pass. An empty/old marker cannot authorize cleanup.

Refresh the same PM2 process metadata, local HTTP localhost:3334 and staging HTTPS health afterward; compare with the new baseline, not stale PIDs. If the live schema/counts or health differ, investigate legitimate concurrent activity and **stop before cleanup** rather than changing live data. No invented financial conservation rule applies.

### Conditional cleanup after successful verification only

Fresh authorization must explicitly include conditional cleanup. If any identity, SQL assertion, extended comparison, live noninterference, application-health or capacity check fails, stop and preserve the database/logs. Do not retry automatically. Only after all checks above pass:

```sh
python3 "$ORIGINAL/recheck-host.py"
"$NODE" "$NEW_RUN/read-only-live-existing.mjs" > "$NEW_RUN/live-before-cleanup.json"
# This positive temporary-session check repeats full read-only verification and closes.
"$NODE" "$NEW_RUN/restore-psql.mjs" --operation verify \
  --run-directory "$NEW_RUN" --temporary-oid 17260
printf 'Type DROP spendcraft_restore_verify_20261024_2429cd_huh_tnmi: '
read -r CLEANUP_CONFIRMATION
[ "$CLEANUP_CONFIRMATION" = 'DROP spendcraft_restore_verify_20261024_2429cd_huh_tnmi' ] || exit 1
(cd /tmp && sudo -n -u postgres env -i PATH=/usr/bin:/bin \
  /usr/lib/postgresql/15/bin/psql -X -h /var/run/postgresql -p5432 \
  -U postgres -d postgres -v ON_ERROR_STOP=1 -v expected_oid=17260 \
  -v cleanup_confirmation="$CLEANUP_CONFIRMATION") \
  < "$ORIGINAL/proposed-cleanup.sql" > "$NEW_RUN/cleanup.stdout.log" 2> "$NEW_RUN/cleanup.stderr.log"
# The original probe requires temporary absence and rechecks live identities.
"$NODE" "$ORIGINAL/read-only-database.mjs" > "$NEW_RUN/live-after-cleanup.json"
```

The cleanup SQL independently validates the actual administrator socket/server/data-directory/live DB identity, exact temporary name/OID17260, absence of other sessions and exact confirmation immediately before the single non-FORCE DROP. No wildcard, forced session termination, CREATE or restore is used. Compare the final live schema/count snapshot and health with the new baseline, retain all evidence and report cleanup. Fresh authorization can provide the exact target confirmation directly for agent execution; do not ask twice when conditional cleanup has been expressly approved and all gates pass.

Current status: corrected verification is prepared and non-DB-tested, **not run against PostgreSQL**. Database OID17260 remains last observed, not freshly asserted in this task. Restore acceptance/cleanup and all PM2/reboot/deployment gates remain pending.

## Corrected verification execution attempt — October 24, 2026: SSH blocked

HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. Fresh authorization covered corrected read-only verification and conditional cleanup of the existing temporary database only. The corrected SQL was regenerated offline, source-reconciled and confirmed byte-identical to the reviewed prepared SQL. No expected result or assertion changed.

The first SSH connection to `staging.spendcraft.app:22` timed out before any remote command. One bounded read-only connection retry also timed out (both exit255). **No command reached staging in this attempt.** The attempt stopped; no further retry, verification query, dump comparison or DROP was attempted.

Consequently actual EC2/account/root and PostgreSQL/server/user/socket/OID identities could not be freshly established. Expected host is EC2 `i-0b24684c411b4b829` in us-west-2; temporary target is `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, **last observed** OID17260. Current existence/state, schema/constraint/sequence/extension/report results, backup rehash, live noninterference snapshots, PM2/HTTP health and disk measurements are **not newly verified**. Earlier evidence remains historical; do not mark it as current acceptance.

The previous successful atomic restore and tablefunc installation remain unchanged by this task. The temporary database was not recreated, restored, altered or dropped by this attempt. Backup recoverability remains unaccepted pending actual corrected verification. Conditional cleanup was not eligible because verification did not execute. No claims of51constraints passing, successful cleanup, reclaimed disk space or current service health are made.

Local evidence: `script-output/staging-restore-corrected-verification-wnyz4qpk/attempt-summary.json`, reviewed SQL/hash and initial/final Git audit files. No new remote evidence directory was created. Restore SSH connectivity before a freshly directed/authorized verification attempt; do not change networking, AWS resources, services or applications automatically. Existing PM2 startup/reboot, version-compatibility and integration-isolation deployment gates also remain unresolved. This attempt is complete and its task-specific authorization ends without any database operation.

Only this recovery record and the staging-verification addendum changed. Existing .gitignore changes, seven staged audit deletions, implementation/tests and unrelated work remain preserved. No production access, live staging write, PM2 control, systemd change, reboot, installed-release change, monetary conversion, migration, deployment, AWS modification or commit occurred.

## Renewed corrected-verification attempt — October 24, 2026: definition-text mismatch

Source HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The operator renewed verification/conditional-cleanup authorization with “Try again.” SSH connectivity returned. Existing reviewed helper hashes and corrected SQL bytes were verified; no assertion or expected definition was changed during execution. Only fresh private evidence files were created, outside installed releases.

Host admission independently reverified account011038405378, us-west-2, EC2i-0b24684c411b4b829, canonical root/staging environment and pinned backup identity. Configured/live pg/pgLog/execution connections passed their independent read-only safeguards. The actual temporary diagnostic connection confirmed database `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID**17260**, current/authenticated userubuntu, server/peer127.0.0.1/32, port5432, actual socket127.0.0.1:5432 and read-only on. No recreation, restore or extension installation occurred.

**Corrected SQL still failed** at proposed-verification.sql line240: `constraint_inventory_mismatch`. Execution stopped, no further acceptance stages ran, and conditional cleanup was not eligible. The database remains present with zero temporary sessions observed after diagnostic reads.

Read-only diagnostic catalog comparison found **51constraints**, with49 matching all six expected fields exactly. Two CHECKs differ only in the reported definition string:

| Constraint | Expected representation | Restored representation |
| --- | --- | --- |
| plaid_item_cleanups_status_check | varchar array cast to text[] before ANY | each varchar literal cast to text inside the array before ANY |
| plaid_item_cleanups_check | varchar array cast to text[] before ALL | each varchar literal cast to text inside the array before ALL |

For example, `(ARRAY['cancelled'::character varying, 'completed'::character varying])::text[]` is deparsed after restoration as `ARRAY[('cancelled'::character varying)::text, ('completed'::character varying)::text]`. Status literals/operator structure and the encrypted-token-null branch match. Schema/table/name/type/validation state match for both. No missing or extra constraints were found; the preserved actual classification remains27primary keys,17foreign keys,2unique and5CHECK, all validated.

This is an exact-text/deparser round-trip mismatch, **not a demonstrated change to the intended rule**. It is also **not accepted as passing** merely because the forms appear equivalent. A separate, narrow verifier review must establish permitted equivalence from migration/pinned-backup evidence, add regression tests and account for any corresponding raw-DDL comparison sensitivity. Do not simply replace expected strings with observed strings, strip arbitrary casts, relax other constraint fields or alter restored constraints/data. No code correction or automatic verification retry occurred here.

Earlier corrected-SQL checks reached before this assertion did not fail (read-only mode, tablefunc/crosstab, migration/representative/per-table counts, table and sequence-name inventory). Subsequent index/validation assertions and full schema/column/default/owner/sequence-state/COPY-data-hash comparison **did not execute**. Complete recoverability remains unaccepted; a synthetic crosstab check alone is not full application/report acceptance.

Live schema fingerprint, extension inventory and representative counts remained unchanged compared with the fresh baseline. PM2 PID/saved-configuration snapshots matched before/after: queue115426, plaid-cleanup115432, prod-server134277. The server PID differs from older historical observations but was already134277 at this attempt's baseline; this task issued no PM2 control. Local HTTP and public staging HTTPS both remained200. No live financial row values were exported or mutated.

Final data-volume free space: **2,917,793,792bytes** (~2.717GiB), 182,708free inodes; capacity admission passed before verification. No DROP occurred, so no cleanup-related disk recovery is claimed.

Private local evidence: `script-output/staging-restore-verification-retry-d7sr5fq4/` (attempt-summary.json, exact constraint-differences.json, final-health.json, command/result audit). Remote evidence: `/spendcraft_staging/server/script-output/verification-retry-a7xkc02z/`, including corrected SQL and private psql diagnostics; original restore/failure evidence remains untouched. Current execution authorization ends with this stopped attempt. Fresh direction is required for a verifier correction and another verification/conditional-cleanup run.

Remaining gates: resolve the definition-comparison false positive with reviewed evidence/tests; complete every remaining restore check and eligible cleanup; separately address PM2 startup/reboot/version compatibility and integration isolation before tax deployment. No production access, live staging write, PM2/systemd change, reboot, installed-release change, monetary conversion, schema migration, deployment, AWS modification or commit occurred.

## Narrow CHECK cast comparison correction — October 24, 2026

Source baseline: `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. This correction is offline only; no PostgreSQL connection or cleanup was performed.

The saved `constraint-differences.json` in `script-output/staging-restore-verification-retry-d7sr5fq4/` records exactly two mismatches: `public.plaid_item_cleanups.plaid_item_cleanups_status_check` and `public.plaid_item_cleanups.plaid_item_cleanups_check`. All 51 constraints were present; 49 definitions matched exactly. Both mismatches retain type CHECK and validated=true.

Migration `database/migrations/1791500000000_plaid_item_cleanups.ts` defines `status` using `table.string(...).notNullable()` (PostgreSQL varchar(255)) and `encrypted_access_token` as nullable text. The first rule admits the five literal statuses protected, pending, review_required, cancelled and completed. The second requires a NULL token for cancelled/completed statuses. The saved PostgreSQL definitions explicitly cast status to text.

The original array-wide form `(ARRAY['cancelled'::character varying, 'completed'::character varying])::text[]` and restored element-wise form `ARRAY[('cancelled'::character varying)::text, ('completed'::character varying)::text]` produce the same ordered text array. The same reasoning holds for the five-status array. All elements are non-NULL ASCII literals cast to unbounded varchar, then text: no truncation, padding, locale conversion, differing element count, or NULL element is introduced. Both sides compare status as text with the identical ANY/ALL operator, and preserve the token IS NULL branch. Thus both truth values and CHECK's SQL NULL acceptance behavior agree, including hypothetical NULL status; the actual source also requires non-NULL status. This conclusion does not extend to arbitrary casts or expressions.

`scripts/fixtures/stagingRestoreCastEquivalences.json` records only the two complete expression pairs. `prepareStagingRestoreVerification.mjs` maps the exact restored expression to the exact original expression only for its exact schema/table/name/CHECK/validated identity. The SQL uses explicit CASE branches, not regex stripping or general SQL rewriting. All other definitions remain exact. Bidirectional inventory comparison still rejects missing/extra constraints and identity changes. A new read-only column-type assertion requires status varchar(255) NOT NULL and encrypted_access_token nullable text before comparison; this independently confirms the source-defined column assumptions at the next authorized execution. No new live type observation is claimed in this offline task.

Verification: 40 focused non-database tests passed, including both positive pairs and rejection of altered operators, constants, columns, casts, schema, table, name, validation state and added predicates. Source hashes and all five CHECK source references remain verified. Changed-file ESLint, Node syntax and both Git diff checks passed.

The existing restoration remains preserved at `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, expected OID 17260, based on the last authorized observation. Fresh authorization is required to rerun corrected read-only verification and conditionally clean up. Do not recreate or restore it again. Regenerate the corrected SQL from the original base assertion using the offline preparer; use a new private script-output run folder and repeat all host/database/OID/backup/capacity guards. Cleanup remains conditional on the entire verification matrix passing. The later raw dump DDL comparison is still exact and may independently report PostgreSQL deparser differences; do not bypass that gate or clean up on any failure.


## Authorized reverification — October 24, 2026, 11:26 p.m. MDT

HEAD `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The authorized corrected read-only verification established staging instance `i-0b24684c411b4b829` in `us-west-2`, reviewed host/account/root and backup admission, configured/live PostgreSQL localhost:5432 user ubuntu, and temporary database `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`, OID 17260. Actual execution identity/read-only guards passed.

The corrected SQL verification completed successfully (exit 0), including column types, all 51 constraint identities/definitions/validation states with only the two reviewed cast equivalences, table/index/sequence inventories, all 27 table row-count assertions, migration metadata, tablefunc and the synthetic crosstab query. The subsequent independent read-only pg_dump comparison stopped at `restored_tables_mismatch`. This is the exact CREATE TABLE DDL comparison gate; its cause was not further investigated or normalized during this execution. Subsequent dump comparisons and final acceptance were not completed. Backup recoverability therefore remains unverified overall.

No cleanup or automatic retry occurred. The existing temporary database remains preserved. No restoration, extension installation or data mutation was performed. Local evidence: `script-output/restore-cast-reverification-tq1b8ujj/`; remote evidence: `/spendcraft_staging/server/script-output/verification-retry-oyl0hrqu`. Saved execution results and failure diagnostics were collected without further database queries after failure.

Before verification, live staging metadata reported 48 Transactions, 3 Accounts, 27 Categories and 100 migration rows. Intended PM2 PIDs were unchanged from the prior recorded baseline; HTTP and HTTPS returned 200. These are pre-run observations, not a completed post-run noninterference comparison. All database operations in this run were read-only; no PM2/service or installed-release changes were made. After stopping, host capacity check reported 2,917,679,104 available bytes (about 2.72 GiB). No post-cleanup checks apply because cleanup did not occur.

Remaining gates: investigate the exact table-DDL mismatch separately without weakening assertions; obtain fresh verification/conditional-cleanup authorization; then resolve the existing PM2 reboot/startup, version compatibility and integration-isolation readiness issues before deployment. This authorization is closed with the failed run. No deployment, production access, AWS change, migration, historical conversion or commit occurred.

## Catalog comparison preparation — October 25, 2026

A new guarded read-only collector and offline comparison are prepared in `scripts/compareStagingRestoreCatalogs.mjs`; see [catalog comparison procedure](staging-postgresql-catalog-restore-comparison.md). Current live catalog structure is compared separately from pinned backup-time data counts. Meaningful attributes are compared directly; uncertain expression differences remain unresolved. No general cast stripping or generated-DDL normalization is added.

The prior raw CREATE TABLE gate remains intact pending authorized catalog evidence and reviewed integration; raw COPY hashes and other independent backup checks remain mandatory. 88 non-database regressions passed. No PostgreSQL connection or cleanup occurred. Existing temporary database OID 17260 remains untouched; restore recoverability and deployment readiness are not marked passed. Fresh read-only comparison authorization is required.


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
