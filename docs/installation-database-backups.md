# Packaged installation database backups

`backup.sh` is a standalone operator tool included in the Adonis build through `adonisrc.ts` metaFiles. `deploy.sh` already archives the complete build directory; no extra packaging step or root-level backup-script copy is needed.

After extraction and dependency preparation, before migration status/run, `install.sh0` invokes:

```bash
bash "$SPENDCRAFT_ROOT/spendcraft.new/backup.sh" \
  --env-file "$SPENDCRAFT_ROOT/spendcraft-env" \
  --output-parent "$SPENDCRAFT_ROOT/backups"
```

It can also be invoked independently from an installed release with the same explicit paths. Preparation/package tests do not authorize running a backup against production or staging. The installer still requires operator decisions; do not run it simply to test backup tooling.

## Configuration and outputs

Requires Node.js with native parseEnv support (current production/staging Node 24.15.0), Bash and a compatible pg_dump on PATH. The environment file must explicitly contain PG_HOST, PG_PORT, PG_USER, PG_PASSWORD and PG_DB_NAME. PG_PASSWORD may be empty if the target's authentication permits it; it must not be omitted. No shell sourcing/eval occurs. Host is restricted to hostname/IP syntax; database/user to letters, digits and underscores; port to 1–65535. Unsupported identifiers fail rather than becoming connection strings. Existing production settings budget/5433 are no longer embedded in the script; staging can use its own database/port/credentials. This does not create a database or role or validate migration readiness.

Both --env-file and --output-parent are required. Choose an output parent outside all release directories, on the intended mounted data volume with sufficient space. The installer supplies these paths; the tool does not choose an environment or infer production. It creates the parent if needed, then a unique mode-0700 `database-backup-XXXXXX` directory and prints its absolute location **before database work**. Existing output directories and backups are never rotated, renamed, deleted or overwritten.

Files in a run directory:

- `backup.sql.partial`: plain SQL pg_dump output while running, mode 0600. Failed, interrupted or empty dumps cannot become successful backups.
- `pg_dump.stderr.log`: private pg_dump diagnostic output, mode 0600. Inspect privately when troubleshooting; it is not printed into installer logs.
- `backup.sql`: published by rename only after pg_dump exits successfully with nonempty output and the file is synced.
- `summary.json`: completed target metadata (host/port/user/database, no password), timestamps, bytes, SHA-256 and plain format; mode 0600. A completed summary and successful command exit are required before considering the run successful.

pg_dump receives explicit host/port/user/database with --no-password; password is passed through its child environment, not command arguments. Inherited PGDATABASE/PGSERVICE/PGOPTIONS settings are not passed through. The dump is a database read; no INSERT/UPDATE/DELETE/restore/schema mutation is issued by this tool. It does not globally pause other writers or certify application-consistent multi-system recovery. Its normal PostgreSQL backup locking behavior is unchanged.

Failures exit nonzero, causing the installer's existing set -e behavior to stop before migrations and release swap. Diagnostic/partial files remain private evidence; do not restore or treat them as complete. A crash between publication and summary completion also leaves an incomplete run, even if backup.sql exists. No automatic historical repair, cleanup or database restore occurs.

## Recovery and operational limitations

A successful dump/hash is not proof of a rehearsed restore. Verify recovery separately in an authorized isolated environment using the correct PostgreSQL version/roles/extensions. This output is **plain SQL**, not a custom pg_restore archive; use an explicitly targeted psql restore procedure with fail-on-error handling after separate authorization. Never restore into production as a verification step. Compare completion/checksum and retain a durable off-instance copy under an approved policy.

There is no retention deletion or compression in this revision. Previous numbered gzip backups remain untouched; the new runs no longer renumber them. Plan disk usage/retention separately. Keep backup SQL, stderr and environment files private and out of Git/staging fixtures. A fresh installation still needs database/roles/authentication configured before pg_dump can succeed. The script does not bypass fresh-install backup failure.

## Verification

Non-DB tests in tests/unit/installerBackup.spec.js execute the actual shell/Node tool against an inert pg_dump executable. They cover explicit connection arguments, no inherited target overrides, private permissions, unique folders, previous-backup preservation, nonzero/empty/interrupted dumps, invalid/missing configuration, required paths, payload registration and pre-migration invocation. Existing installer manifest/seeding tests remain in the focused selection. No real backup, database connection, installation, upload or server change was performed during implementation.
