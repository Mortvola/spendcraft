# Installation database backups

[installer/backup.sh](../installer/backup.sh) is included in compiled releases through `adonisrc.ts`. `build.sh` creates the release package using `installer/releasePackage.mjs`; `deploy.sh RELEASE_DIRECTORY staging|production` generates and uploads its unified installer. `deploy.sh` does not build or archive the application itself.

The installer accepts no arguments and reads `SPENDCRAFT_ENV` and `SPENDCRAFT_ROOT` from `/etc/spendcraft/environment`. After dependency/configuration preparation, with PM2 schedules fenced and writers stopped, it creates a backup before running migrations:

```bash
bash "$SPENDCRAFT_ROOT/spendcraft.new/installer/backup.sh" \
  --env-file "$SPENDCRAFT_ROOT/spendcraft-env" \
  --output-parent "$SPENDCRAFT_ROOT/backups"
```

After successful migrations, the installer runs `node ace db:seed` automatically. There is no SEED/SKIP/ABORT prompt. Backup, migration or seeding failure stops installation; normal writer startup remains behind the existing maintenance/readiness procedure.

## Configuration and output

The backup tool requires Bash, Node.js with native `parseEnv` support and a compatible `pg_dump` on PATH. Both `--env-file` and `--output-parent` are required. The environment file supplies `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD` and `PG_DB_NAME`; the password may be empty but the setting must exist. The script validates connection-setting syntax and does not source the file as shell code or infer a production target.

Use an output parent outside release directories. Each invocation creates a unique mode-0700 `database-backup-*` directory and prints its absolute path before database work. Existing backups are not overwritten, rotated or deleted.

| File | Purpose |
| --- | --- |
| `backup.sql.partial` | Private plain-SQL dump while running; incomplete on failure |
| `pg_dump.stderr.log` | Private diagnostic output |
| `backup.sql` | Published only after a successful, nonempty, synced dump |
| `summary.json` | Completed target, timestamps, byte count, SHA-256 and format; no password |

Output files use mode 0600. A successful exit and completed summary are required; the presence of `backup.sql` alone is insufficient. Passwords are passed through the dump child's environment, not command arguments. Inherited PostgreSQL target overrides are not passed through.

The tool can also be invoked independently from `$SPENDCRAFT_ROOT/spendcraft/installer/backup.sh` with the same explicit environment/output arguments. It does not stop writers by itself, create databases or roles, or verify migration readiness.

## Failure and recovery

Failure exits nonzero and leaves private diagnostics or partial files. The installer stops before migrations and release promotion when backup creation fails. No automatic database restoration occurs.

A dump/checksum verifies the captured file, not a successful restore. This is plain SQL, not a custom `pg_restore` archive. Restore only under separate authorization using an explicitly targeted `psql` procedure with fail-on-error handling and compatible roles/extensions. Do not restore production merely to test a backup.

Backup retention, off-instance storage and disk capacity are operational decisions outside this script. Existing backups remain untouched. Keep SQL dumps, diagnostics and environment files private and out of Git and test fixtures.
