# Plaid orphan Item recovery

Deploy the `plaid_item_cleanups` migration before enabling the updated onboarding
code. Provision dedicated secrets in the environment/secret manager:

- `PLAID_CLEANUP_KEY_VERSION`: immutable active version name, e.g. `v1`.
- `PLAID_CLEANUP_KEYS`: JSON object mapping version names to independently generated
  secrets (at least 32 characters; use 32 random bytes encoded as base64).

Never use APP_KEY as the cleanup key. Keep previous versions available until their
outstanding records are resolved. Encryption is authenticated AES-256-GCM with
record ID, provider context and Item ID bound as an unambiguous JSON tuple purpose.
Ciphertext is marked `binding-v2:`; earlier experimental delimiter-bound ciphertext
is rejected into administrative review, without an automatic legacy fallback.
Do not deploy over existing experimental recovery records without a separately
reviewed credential-format migration. No historical credentials are migrated here.
Changing a version's secret breaks old ciphertext. Database backups and key backups have separate
retention; clearing the live field does not erase older backups.

Run `node ace plaid:cleanup-listener` alongside the existing webhook listener.
It sweeps PostgreSQL on startup and every minute. Redis jobs contain cleanup UUIDs
only. Monitor its infrastructure errors and `Plaid cleanup requires administrative
review` events. A stopped listener cannot perform cleanup or enforce retention.
Expiration runs directly in PostgreSQL before Redis enqueueing and takes the same
attempt lock as removal. Cleanup enqueueing is bounded to five seconds; unavailable
Redis cannot leave the listener permanently stuck before its next retention sweep.

## Administrative recovery

- `node ace plaid:cleanup list`: safe metadata for up to 100 outstanding records.
- `node ace plaid:cleanup retry UUID`: explicitly start another bounded retry
  budget, with the committed-Institution safety check still enforced.
- `node ace plaid:cleanup extend UUID --days 30`: explicitly extend retention.

Commands never display credentials. Missing keys, changed Plaid context, unknown
provider failures and already-absent errors require review. INVALID_ACCESS_TOKEN
is never counted as successful cleanup. ITEM_NOT_FOUND is conservatively escalated
rather than assuming the credential/environment identifies the intended Item.
Resolution proceeds through a provider attempt after configuration review; there
is no command that silently asserts external removal.

## Lifecycle and locking

Protection is independently committed immediately after exchange. Setup locks the
recovery row before the budget row. Setup commit atomically cancels protection and
clears ciphertext. Only setup failures trigger immediate compensation, after
rollback. Failed initial sync and post-commit response failures do not.

Cleanup acquires a transaction advisory lock for the UUID, then locks the recovery
row and checks globally for a committed Institution with that Item ID. The advisory
lock remains held across the separately committed attempt ledger and provider call,
preventing duplicate workers while accounting survives a crash. Setup cannot attach
an Item after cleanup changes its protected state. Removal calls have a 15-second
transport timeout. An ambiguous timeout remains recoverable.

Protected records are due after five minutes. Active setup holds their row lock.
One immediate attempt is followed by at most six asynchronous attempts with delays
of 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours, each with ±20%
jitter. Unrecognized structured errors escalate; transport ambiguity and known
transient errors retry. Exhaustion retains encrypted recovery credentials for
30 days. The sweep destroys expired credentials; extension requires explicit admin
action before destruction. Metadata is retained without credentials for diagnosis.

## Residual limits and rollback

A crash/lost exchange response before protection is durable cannot be repaired by
this local protocol. Existing independent exchange-audit latency is part of that
window. Readiness is checked first; failed protection attempts one bounded removal
with the in-memory token. Historical orphans require separate Plaid-assisted recovery.

Do not roll back by dropping the table or removing keys while recovery is pending.
Keep a compatible listener and administrator commands until outstanding work is
resolved. Reverting onboarding to its former catch behavior reintroduces the risk
of compensating a committed Item. No historical credentials are migrated.

## Production rollout

This is an additive migration: it creates only `plaid_item_cleanups` and its indexes
and constraints. It does not scan or rewrite existing financial tables, has no
foreign keys to them, and does not depend on cleanup encryption configuration.
PostgreSQL locks the new table/catalog objects; migration bookkeeping can also
serialize migration runners. Use one migration runner. The old application can
remain running while this migration is applied. Confirm the actual target schema
and pending migration list first; `migration:run` can apply other pending migrations.
The repository cannot establish the live production schema.

Deployment order:

1. Prepare the built release, backup, dedicated keys and matching production Plaid
   context. Keep onboarding traffic paused during application replacement.
2. From the new release, run `node ace migration:status`, inspect all pending work,
   then `node ace migration:run`. Do not use rollback to recover a failed rollout.
3. Load the keys into application and cleanup-process environments before starting
   new code. Verify the table and configuration without exchanging a Plaid token.
4. Replace the release and verify configuration/infrastructure prerequisites before
   confirming startup of all PM2 processes. Verify server and listener health afterward.
5. Resume onboarding only after readiness checks and listener verification.

`install.sh0` (embedded by `deploy.sh` into `install.sh`) stops `prod-server`,
`queue`, and any existing `plaid-cleanup` process before directory replacement.
It runs migrations before switching directories, waits for readiness confirmation,
then starts/restarts all processes and saves the PM2 process list. It also runs the
existing seed command: review that separately; cleanup needs no seeding.
Regenerate the installer through the normal build/package procedure; an earlier
generated `install.sh` does not contain these lifecycle changes.

### PM2 supervision

The installer creates one fork-mode process named `plaid-cleanup`, using the Node
executable on the deployment account's PATH, the stable release directory and its
shared `.env` symlink. Its first-install definition is equivalent to:

```sh
NODE_ENV=production pm2 start "$SPENDCRAFT_ROOT/spendcraft/ace.js" --name plaid-cleanup --cwd "$SPENDCRAFT_ROOT/spendcraft" --interpreter "$(command -v node)" --time --kill-timeout 30000 --restart-delay 5000 -- plaid:cleanup-listener
pm2 save
```

Subsequent installer runs stop it before the directory switch and use
`NODE_ENV=production pm2 restart plaid-cleanup --update-env --time --kill-timeout 30000 --restart-delay 5000`
afterward. They do not create another instance. Update the shared environment/secret
file before deploying, and keep inherited environment values consistent with it;
preexisting process/shell environment variables can override `.env` values.
Verify the existing `pm2 startup` service and saved process list on the host;
the repository documents startup installation but cannot prove it was completed.
Automatic restart is enabled by PM2's default, with a five-second delay to avoid
tight restart loops. PM2 captures stdout/stderr with timestamps in its normal logs.
The installer runs `pm2 save` after all process starts/restarts succeed. Complete
the startup-hook procedure in `Installation.md` once on each host, including the
privileged command printed by `pm2 startup`; save alone does not install that hook.
Existing server/queue initial definitions are not recorded in the repository beyond
the installation guide and installer names; inspect their host definitions rather
than assuming their interpreter/environment matches the new explicit definition.

Ace handles SIGTERM and PM2 SIGINT. Cleanup clears its timer and awaits
`worker.close()`. The 30-second PM2 grace period gives a normal 15-second removal
call time to finish, but a database hang can exceed it. Forced termination leaves
the persisted attempt ledger recoverable. An already-running sweep is not
explicitly awaited by the termination callback.

BullMQ uses `BULLMQ_REDIS_HOST`, `BULLMQ_REDIS_PORT`, and
`BULLMQ_REDIS_PASSWORD` (defaults: 127.0.0.1, 6379, empty), database 0, rather
than the Adonis Redis retry configuration. BullMQ reconnects and the minute sweep
retries failures. PostgreSQL operations use the existing `DB_CONNECTION`/`PG_*`
configuration; failures are logged and later sweeps retry, but database availability
and recovery must be verified operationally. Multiple listeners are correctness-safe
through database locks; they can enqueue duplicates and add load. Start one by default.
Missing cleanup keys do not necessarily crash the listener: onboarding fails closed
and affected attempts enter review. PostgreSQL/sweep and Redis/worker failures are
logged and retried; PM2 online status is not readiness. If application boot itself
fails, the configured restart delay applies. Do not resume onboarding solely because
the installer returned successfully; verify readiness using the checks below.

### Configuration and rotation

The two cleanup-specific variables are optional at application boot but required
for successful onboarding readiness:

- `PLAID_CLEANUP_KEY_VERSION`: a nonempty, immutable version name selected for new
  ciphertext, for example `v1`.
- `PLAID_CLEANUP_KEYS`: valid JSON object mapping version names to secret strings.
  The selected secret must have at least 32 JavaScript string characters. Base64
  is a recommended provisioning encoding, not a parser requirement: generate
  32 cryptographically random bytes and store their base64 text in the secret manager.
  The encryption driver derives its AES key from this secret text; do not decode
  or replace an existing version's secret.

Synthetic shape only (placeholders below are not usable keys):
`{"v1":"<base64-of-random-32-bytes>","v2":"<different-base64-secret>"}`.
Use unique JSON property names; JSON parsing accepts duplicate names with the last
value winning. Do not put real secrets in command arguments, logs or this document.

Existing Plaid configuration must also agree across processes: `PLAID_ENV`,
`PLAID_CLIENT_ID`, and the applicable `PLAID_PRODUCTION_SECRET` (or sandbox secret
in non-production). Readiness checks context agreement, not provider authentication
over the network. Restart processes after changing configuration; the SDK client
captures its context when constructed.

Malformed JSON, missing active version or too-short selected secret fails readiness
before token exchange, not necessarily application/listener startup. A missing old
version moves its attempted record to review rather than silently trying another
key. An idle listener and a successful metadata list alone do not validate keys.

Initial deployment: provision the map and active version for both server and
listener before enabling new onboarding. For rotation:

1. Add a new independently generated version to the map, retaining all old entries.
2. Roll that expanded map to every server/listener/admin process; keep the old active
   version until all consumers can read the new version.
3. Switch the active version and restart processes. New records use it; old records
   continue using their recorded version.
4. Retain old secrets while any ciphertext still references them, including review
   records. Never replace a secret under an existing name.
5. Before removal, pause producers or otherwise complete a coordinated restart so
   no old-active process can create another old-version record. Check the entire
   ledger, then remove the unused version and restart all consumers.

The list command exposes key version but is limited to 100 records. It cannot prove
an old key is unused. An authorized operator must use a read-only aggregate over
the complete ledger (no tokens selected):

```sql
SELECT key_version, count(*) AS credentials
FROM plaid_item_cleanups
WHERE encrypted_access_token IS NOT NULL
GROUP BY key_version;
```

Keep backup/key-retention policy separate: removing a live key can make old backup
credentials unrecoverable. Automatic re-encryption is not provided.

### Experimental records: explicit deployment gate

The migration and subsystem are committed in repository history; that does not
prove deployment. Test/development records do not establish production contents.
If production never had this table, it cannot have experimental cleanup rows and
no format migration is needed. If an earlier implementation was deployed, it can.
Have an operator confirm table/migration history before rollout; do not assume.
If the table exists, count incompatible retained ciphertext without displaying it:

```sql
SELECT count(*) AS incompatible_credentials
FROM plaid_item_cleanups
WHERE encrypted_access_token IS NOT NULL
  AND encrypted_access_token NOT LIKE 'binding-v2:%';
```

Any nonzero result blocks an unattended rollout pending a separately reviewed
disposition/migration. Do not drop the table, overwrite credentials, add a legacy
fallback, or reset the migration ledger to force this migration to run.

### Startup windows

| Window | Result |
| --- | --- |
| New server before migration | Onboarding fails readiness before exchange; no new Item from this path |
| Migration before new server | Old behavior unchanged; additive table unused |
| New server before cleanup keys | Onboarding fails closed before exchange |
| Keys before new server | Old behavior unchanged; new variables unused |
| New onboarding before listener | Failed setup remains durable; asynchronous recovery/retention delayed |
| Listener before new servers, after migration/configuration | Safe; processes existing due records |
| Listener before migration | Sweep errors; retries later; not a successful readiness check |
| Listener with Redis unavailable | Enqueue/worker errors; PostgreSQL responsibility survives, expiration runs before enqueue, recovery delayed |

The exchange-to-durable-protection crash window remains; ordering cannot eliminate
that distributed-system limit. Neither keys nor migration corrects old onboarding
behavior while old servers continue accepting requests.

### Rollback after onboarding traffic

Pause onboarding before reverting application code: the previous implementation
does not maintain recovery state and can compensate a committed Item. Existing
records alone do not make resuming old onboarding safe. Other application rollback
compatibility must be reviewed separately.

Keep the current compatible cleanup listener/admin release, table, keys and original
Plaid context available. Pin that listener to a retained compatible release directory
if the server's stable directory is reverted. Let existing work resolve or undergo
explicit review; keep retention running. Do not reverse this migration: `down()`
unconditionally drops durable recovery responsibility, even with outstanding rows.
Only consider removal after producers are permanently disabled, no retained
credentials/responsibility remains, queues and in-flight work are drained, and
metadata/backup retention has been reviewed. It is safer to leave the additive table.

### Operational health and smoke checks

At minimum monitor PM2 process uptime/restarts, infrastructure/sweep error logs,
review events, outstanding counts, oldest due time and expired retained credentials.
Use the existing list command for individual safe metadata; use aggregates for
complete coverage:

```sql
SELECT status, count(*) AS records, min(next_attempt_at) AS oldest_due
FROM plaid_item_cleanups GROUP BY status;
SELECT count(*) AS overdue, min(next_attempt_at) AS oldest_due
FROM plaid_item_cleanups
WHERE status IN ('protected','pending') AND next_attempt_at <= now();
SELECT count(*) AS expired_credentials
FROM plaid_item_cleanups
WHERE encrypted_access_token IS NOT NULL AND credential_expires_at <= now();
```

Urgent attention: missing listener, persistent sweep/enqueue/database errors,
overdue work that is not progressing, expired credentials surviving repeated sweeps,
decryption/context failures, or unexpected restart loops. Review-required records
need operator assessment before their retention deadline; unknown/absent-provider
errors are not proof of removal. No success heartbeat is emitted, so process-online
and silence alone are insufficient evidence of functioning cleanup.

After deployment, an authorized operator can run migration status, metadata list,
the aggregates above and PM2 checks without contacting Plaid. Current Ace commands
do not provide a complete safe synthetic smoke test: retry may contact Plaid and
list does not verify encryption, Redis delivery or worker progress. Do not feed a
synthetic credential into the live cleanup queue.

A separately reviewed one-off probe can boot the deployed application, call
`ready()` (no provider request), round-trip a synthetic string using the configured
driver/version and JSON binding, and exercise terminal cancellation inside a
rolled-back database transaction. Check Redis through a uniquely named temporary
queue/worker, enqueue only a generated nonexistent cleanup UUID, call `attempt()`
for that missing UUID (which returns before any provider call), assert completion,
and obliterate/close only that temporary queue. This tests deployed infrastructure
and logic, not the production listener's consumption; observe the actual listener
separately. No such production probe was added or executed here. The existing
synthetic cleanup/onboarding/adversarial suites remain the non-production release
gate; do not run their truncating bootstrap against production.

### Deployment checklist

The installer requires three explicit operator confirmations: `DEPLOY` for reviewed
configuration/database/experimental-record prerequisites and external onboarding
maintenance, `MIGRATE` after displaying pending migrations (including approval of
the existing seed step), and `RESUME` before starting any PM2 process. Use a second session for readiness checks. These are human review
gates, not automated readiness probes; do not blindly pipe confirmations into the
installer. Wrong input or EOF aborts with no automatic rollback or traffic resume.
After the final confirmation, verify normal server health before manually removing
external maintenance. Maintain that external gate during failures/reboots too.

- Confirm schema, pending migrations and absence/disposition of experimental records.
- Provision dedicated versioned keys and consistent Plaid/DB/BullMQ configuration.
- Pause onboarding; stop existing cleanup before replacing its release directory.
- Apply reviewed migrations first; preserve table and backup/key recovery capability.
- Deploy servers and start/restart the PM2 cleanup listener from compatible code.
- Verify PM2 reboot/crash recovery, configuration, database and Redis access.
- Check complete-ledger counts, due-age and expiry; inspect infrastructure/review logs.
- Resume onboarding; retain compatible cleanup code and keys during any rollback.
