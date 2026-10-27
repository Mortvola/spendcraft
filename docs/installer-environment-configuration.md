# Installer environment configuration

The release contains one checked-in configuration file, `installer/installer.env.required.json`. It holds automatic nonsecret values and metadata for values supplied privately by the operator. It must never contain secrets. APP_KEY, VAPID, JWT and Plaid cleanup keys are excluded because their key-generation commands handle them. The separate `installer.env.defaults` payload and defaults-appending installer step have been removed; all fourteen former defaults are `type: "value"` entries in the consolidated file.

`deploy.sh RELEASE_DIRECTORY production` or `deploy.sh RELEASE_DIRECTORY staging` selects the upload destination for the saved release package. It generates one unified `install.sh` and uploads it; it does not run the installer remotely. The installer accepts no arguments and reads `SPENDCRAFT_ENV` and `SPENDCRAFT_ROOT` directly from `/etc/spendcraft/environment`. Inherited target variables are not authoritative. NODE_ENV stays production for both runtime environments and is not the deployment target selector. Preserve production/staging root, database, provider and PM2 isolation independently; the server-local settings do not replace ordinary rollback target checks.

After extracting spendcraft.new, fencing PM2 restarts/stopping writers, linking the shared .env and installing dependencies, the installer initializes APP_KEY, then runs `ENV_PATH= NODE_ENV=production node ace generate:web-push-keys`, `ENV_PATH= NODE_ENV=production node ace generate:jwt-keys` and `ENV_PATH= NODE_ENV=production node ace plaid:rotate-cleanup-keys --if-missing`. It invokes `installer/configureInstallerEnv.mjs` with the server-local target, creates the database backup, then runs migrations and `node ace db:seed`. Seeding is automatic; there is no SEED/SKIP/ABORT prompt. The DEPLOY and RESUME confirmations remain. The metadata and helper are included by Adonis metaFiles; the release packager archives the build before deploy.sh generates the upload installer.

The required-settings helper reads the shared .env through its symlink. Nonempty configured values are preserved. Explicit empty values are also preserved when allowEmpty=true; otherwise they require configuration. Environment-specific entries are skipped outside their selected target. A configured value conflicting with a fixed value or a prompt entry's choices aborts without changing it. Staging's PLAID_ENV must be sandbox; it never requests PLAID_PRODUCTION_SECRET. This does not enable provider operations or establish sandbox credentials; optional provider integration remains separately controlled.

Current metadata covers database/Redis password fields (explicit empty permitted where authentication allows), SMTP host/port/user/password, target-specific Plaid environment/production identity, automatically generated cleanup encryption configuration. Shared production SMTP host/port and Plaid credential placeholders were moved from defaults into prompts; the Plaid environment is assigned automatically from the deployment target. Never reuse production provider, cleanup, notification or SMTP credentials in staging. Use independent keys and a local capture SMTP service where appropriate. No database roles/passwords or external provider resources are created by these prompts. Other existing application environment requirements still need configuration.

Missing prompt-type values require a real interactive terminal. Public input is echoed normally; secret input is masked with asterisks and confirmed. Empty disallowed values, invalid choices/encodings and mismatched secret confirmation reprompt without displaying answers. Ctrl+C, EOF, missing TTY, invalid metadata or file errors abort before subsequent installation steps. Existing fully configured files need no input. Shell tracing or external session recording can expose later file access; do not enable tracing or publish environment/recovery files.

All prompted answers are collected before writing. A mode-0600 file in the shared file's directory is written and synced; the helper checks that the original path/content has not changed while prompting, then renames the new file onto the resolved target and syncs the directory. The .env symlink itself remains intact. Concurrent manual configuration edits are not supported; detected changes abort rather than overwrite. This is not a configuration-file lock or a database lock. Original text is retained; a filled empty placeholder receives a final overriding assignment so existing comments/metadata remain. Node/Adonis parsing round-trip tests cover that behavior. A cancellation before save writes neither automatic values nor prompted values. A failure after rename may mean answers were saved even if final directory sync failed; inspect privately before retrying. No automatic database/application recovery is performed.

Input is single-line. For multiline keys, use the literal escaped newline format required by the application's existing key configuration; the installer initializes missing cleanup keys separately. Quoted/hash/space-containing input is encoded only when it round-trips exactly. Dollar interpolation, file: identifiers, control characters and values that cannot be safely represented on one .env line are rejected rather than silently changed. These restrictions avoid Adonis interpolation changing secret meanings; they are not a complete application credential/key-format validator. Existing nonempty values are not automatically rewritten or repaired. No secrets are printed or passed as shell/Node command arguments.

Tests use temporary synthetic files and real local pseudo-terminals (Python 3) for echo, Ctrl+C and EOF checks. Builds/tests do not authorize an installation or database connection. The production/staging servers were not contacted during this implementation. Stage the metadata/helper changes together with deploy.sh, installer/install.sh0 and adonisrc.ts; build a new saved release package before testing new installer behavior. Promoting an already-tested package never rebuilds it.

Metadata behavior is explicit:

- `type: "prompt"` requires nonempty `prompt`, boolean `secret` and boolean `allowEmpty`. Optional `choices` constrain operator input; even a single choice is prompted.
- `type: "value"` requires `value`, either a string or finite number common to both targets, or an object mapping `production` and `staging` to strings or finite numbers. It never prompts and must not contain `prompt`, `secret`, `allowEmpty` or `choices`. An optional `environments` list restricts applicability; every applicable target must have a mapped value. Unknown targets and unsupported value types are rejected. These checked-in values must never contain secrets.

One entry now configures Plaid for both targets:

```json
{
  "name": "PLAID_ENV",
  "type": "value",
  "value": { "production": "production", "staging": "sandbox" }
}
```

For a common automatic value, use `{"name":"EXAMPLE","type":"value","value":"fixed"}`. Existing matching values are preserved, missing/empty placeholders are filled, and existing conflicting values abort installation for operator review. Automatic values and prompted answers are saved together only after all required input succeeds.

Consolidation uses the same fixed-value conflict policy for former defaults: matching assignments are preserved, missing/empty placeholders are filled, and different existing values abort without overwriting the shared file. In particular, an existing nonempty `PLAID_WEBHOOK` conflicts with its configured empty value; review the metadata/environment intentionally before deployment.

Key generation runs before interactive configuration. All key-initialization commands preserve existing keys. VAPID generation creates a pair when both are missing/empty; a partial pair aborts installation without replacing it. EnvEditor keeps the shared .env symlink and adds empty .env.example placeholders if that file exists. These commands can save newly generated keys even if subsequent prompting is cancelled.

JWT generation uses `ssh-keygen -q -t rsa -b 3072 -m PEM -N ''` in a unique temporary directory and `ssh-keygen -e -m PKCS8` to export the public key as PEM. Both keys are validated as a matching RSA pair and saved with EnvEditor as quoted multiline PEM, which Node and Adonis parse into real newlines for the existing RS256 guard. Existing complete pairs remain untouched; a partial pair aborts. Temporary private-key files are removed in a finally block, and key material is not printed. The host must provide `ssh-keygen` (OpenSSH client); failures stop installation before interactive configuration, backup and migration. No installed server is changed by preparing/testing this code.

Installer key commands are registered explicitly with Ace via `ListLoader` in `adonisrc.ts`. This lets Ace resolve them without scanning unrelated application command modules, some of which import `start/env.ts` and trigger full environment validation. `startApp: false` alone does not prevent validation during command discovery. Normal application commands still use the existing discovery and environment validation. A real CLI test with an incomplete synthetic environment reproduces the original discovery failure and verifies all three key-generation commands succeed with the explicit registration.

## Release-manifest failure diagnosis

Manifest capture still fails closed before directory deletion/swap. Its CLI now emits a `Diagnostic:` JSON line containing the failing phase, release/record path, safe error code, and relative file entry when available. It never prints file contents or raw parser errors. The deployment directory printed before failure may be incomplete; its existence does not indicate successful capture.

To inspect a stopped, partially prepared installation without rerunning installation, migration, seeding or manifest-record creation, use the updated tooling:

```bash
node /spendcraft_staging/server/spendcraft.new/installer/captureDeploymentManifests.mjs \
  --inspect-root /spendcraft_staging/server
```

Both `installer/captureDeploymentManifests.mjs` and `installer/lib/releaseManifest.mjs` must be the updated versions in the prepared release. Inspection only reads the prepared/current release files and their build identities. It creates no deployment record and does not modify releases, contact a database, or manage processes. A successful inspection does not prove that record-directory writes or filesystem syncs will succeed during actual capture. Keep processes stopped and do not manually swap releases while the capture failure remains unresolved. The staging failure reported under `deployment-2026-10-22T02-14-59.185Z-kMjx7X` has no established root cause until its diagnostic is collected; no safety check has been relaxed.

The installer creates the optional `PushNotificationKey.p8` link only when `../PushNotificationKey.p8` resolves to a regular file. A missing target, directory or dangling target symlink is skipped. Apple push requires a separately supplied valid APNs key; this change does not disable notification code or relax manifest validation for links that exist.

Automatic numeric JSON values are written without quotes (`PORT=3334`); string values remain safely quoted (`PORT="3334"`). Environment maps may mix strings and numbers. Zero and negative/decimal numbers are supported; booleans, null, arrays and nonfinite numbers are rejected. Environment variables are always text once parsed, so repeat-install checks compare against the textual form and preserve existing matching assignments. Application schemas continue to control numeric runtime types. JSON number spelling (such as `1.0` versus `1`) is not preserved after JSON parsing; the numeric value is serialized with JavaScript String(number). No application monetary representation changes are involved.

Plaid cleanup key initialization runs before interactive configuration. `--if-missing` creates `PLAID_CLEANUP_KEYS` with a random `v1` secret and sets `PLAID_CLEANUP_KEY_VERSION=v1` only when no keys/version are configured. Existing valid settings are preserved byte-for-byte, without rotation. Partial/malformed settings abort rather than replacing recovery credentials. Both former cleanup prompts are removed from the metadata. Explicit future rotation still uses the command without `--if-missing`.

The installer template lives at `installer/install.sh0`. `build.sh` captures it there; `deploy.sh` uses the saved copy to generate a temporary `install.sh` for upload. The template is saved with each release package outside the application archive. Historical verification records may refer to its former root-level location.


## Shared Nginx configuration

The application payload includes `installer/nginx.conf`. After environment setup,
the installer copies it to `$SPENDCRAFT_ROOT/nginx.conf` if absent, replacing
`spendcraft.app` with `staging.spendcraft.app` only for a newly created staging file.
Existing shared configuration is never overwritten. The enabled site is
`/etc/nginx/sites-enabled/spendcraft.app`, a symlink to that shared file rather
than a config copy inside the swapped release. Conflicting enabled entries stop
installation. `sudo nginx -t` validates before backup/migrations; a failed check
removes only a newly created link. After RESUME and PM2 startup/save, a second
validation precedes `sudo systemctl reload nginx`. Sudo/Nginx/systemd must already
be available. No default or differently named existing sites are removed. HTTPS
and Certbot remain separate operator actions. Tests use temporary files and
mocked sudo/Nginx; they do not modify `/etc/nginx` or real services.


## Installer/rollback tool locations and stable bundle

Installation-only helpers and the release-specific rollback executor/helpers now live under `installer/`, including `lib/categoryRollback.mjs` and `lib/releaseManifest.mjs`. `build.sh`, installer calls, metadata packaging and tests use those paths. Other scripts, including financial audit tooling, remain under `scripts/`.

Before a release swap the installer captures manifests and prepares `$SPENDCRAFT_ROOT/maintenance/rollback/<current-manifest-identity>/` with the rollback executor, both helpers, a standalone verification helper, `pg` and its runtime dependency closure, and `bundle.json`/README. A failed preparation stops installation before deleting or swapping releases; previous bundles remain untouched. Files are published from a unique private staging directory, and an identical existing bundle can be reused only after integrity verification. The release ID and bundle path are printed; this requires additional disk capacity for the small PostgreSQL-client dependency closure, not a second copy of the full application node_modules.

No rollback is run and no database connection is made by bundling. After startup and PM2 save, a separate installer step automatically generates the operational plan using read-only database identity checks. Runtime Node/system tools and existing execution safeguards remain required. See the release-specific rollback document before any use. Run operations from a stable maintenance working directory, keeping plans and outputs outside the immutable bundle.

Installation also publishes `$SPENDCRAFT_ROOT/maintenance/rollback.sh`. Invoke it
with only `--dry-run` or `--execute`; it automatically selects and verifies the
bundle matching the actual installed release. The reviewed plan must exist at
`$SPENDCRAFT_ROOT/maintenance/rollback-plan.json`; the installer generates it after startup, while the launcher itself does not create or repair a plan.
A missing/corrupt matching bundle, mismatched plan, or edited managed launcher
stops rather than guessing. Versioned launcher implementations are retained under
`maintenance/rollback/launcher-<launcher-id>/`, and the managed shell is updated
atomically. The release-specific executor repeats integrity/release checks before
any database connection. Authorization and existing confirmation requirements
remain unchanged.


Rollback supports separate EC2 `production` and `staging` targets through the
reviewed `maintenance/rollback-plan.json`. Neither requires a machine ID; target
checks use the installation, release, database and PM2 configuration.
Staging can use the installer's normal process names and Ubuntu PM2 home on its
own host. See [application rollback](application-release-rollback.md) for current release-restoration behavior.


## Automatic rollback plan

After PM2 startup/save, the installer calls `installer/generateRollbackPlan.mjs`
with the explicit installation target and root. It captures release/config hashes,
process definitions and independently verified local database identities, then
publishes private `maintenance/rollback-plan.json` atomically. No operator JSON
assembly is required. An output directory retains the plan, previous active plan
and differences. Passwords and PM2 environment maps are excluded. Fresh installs
or incompatible release pairs publish an unavailable marker; unexpected failures
stop before final Nginx reload without reverting already-started processes.
Generated plans require execution-time compatibility/maintenance confirmation;
plan generation does not authorize rollback. See the rollback guide for details.


## Release-owned PM2 process manifest

`installer/pm2-processes.json` is the operational source of truth, packaged with
each release. It belongs under `installer/`, rather than Adonis `start/`, because
installation and offline rollback consume it without bootstrapping the app.
The current ordered definitions are:

| Process | Release-relative script | Arguments | Special settings |
|---|---|---|---|
| queue | ace.js | queue:listener | Timestamped logs |
| plaid-cleanup | ace.js | plaid:cleanup-listener | 30,000 ms shutdown timeout; 5,000 ms restart delay; timestamped logs |
| prod-server | bin/server.js | none | Daily `0 0 * * *` restart; timestamped logs |

All use the release directory as cwd, the invoking Node interpreter, and the
existing runtime `NODE_ENV=production` on both EC2 environments. Paths are relative
to the release; credentials and environment maps are forbidden. Schema version 1
validates unique names, relative in-release paths, arguments and supported settings.

The shell unpacks the new payload, then delegates shutdown to
`installer/managePm2.mjs --root ROOT --release ROOT/spendcraft.new --action stop`.
This built-in-only helper runs before npm dependency installation and financial
setup. It stops the union of old/new manifest names. On an upgrade from a
pre-manifest release, it explicitly stops ALL applications in the selected PM2
daemon using `pm2 stop all`, including applications outside the installation root.
This operator-approved legacy fallback avoids guessing the old process inventory.
With an existing manifest, unknown in-root writers, foreign same-name processes
and duplicates still block the operation; unrelated applications are untouched. Failure may leave some managed processes stopped; no automatic
resume is attempted.

After swap and RESUME, `--release ROOT/spendcraft --action start` verifies existing
managed processes are stopped, removes their old PM2 definitions and creates the
incoming definitions in manifest order. This deliberately replaces stale wrapper
paths/arguments/settings instead of blindly restarting them. Old-only manifest-managed processes
are removed. On a legacy upgrade, unknown stopped processes are left stopped and
are not adopted or restarted; unrelated applications stopped by the fallback must
be reviewed/restarted manually by the operator. A failure stops further startup commands; inspect partial state
before resuming. PM2 save, generated rollback plan and Nginx validation/reload
remain separate existing shell steps. No new daemon, service, cron or database
operation is introduced by manifest parsing.

Plan generation compares live process identity/arguments, single fork mode,
shutdown/restart settings and the declared schedule with the current manifest.
It captures separate hashed process inventories from current and previous
manifests. Rollback verifies both inventories against the exact releases, stops
the current set and starts the previous set, even when process names/arguments
changed. Maintenance startup suppresses cron restart until separately reviewed
restoration. A previous release without a manifest records `manualRestart: true`: an otherwise
valid rollback restores that release but leaves the managed processes stopped for
operator-directed startup and verification. No previous process definition is
guessed or patched in place. All existing
release-specific monetary compatibility checks remain unchanged.


## Missing-manifest compatibility policy

Only an absent manifest triggers fallback. Malformed JSON, invalid schema or
permissions failures remain errors. The incoming release still requires its own
valid manifest for installation startup. The selected daemon is the operator's
normal PM2 context (`PM2_HOME` when set); no other user's daemon is targeted.
On the first legacy upgrade, every process in that daemon is stopped, regardless
of application path. An empty daemon needs no stop command. Normal incoming
manifest startup still checks ownership of same-name apps and refuses to replace
a running process. The fallback does not authorize deleting or restarting unknown
apps. Installation does not stop/restart systemd, Redis, PostgreSQL or Nginx via
this PM2 fallback.

When the rollback target has no manifest, the generated plan records manual
startup instead of declaring the release unavailable solely for that reason.
All independent monetary release-pair, backup, database and maintenance gates
remain. After a successful conversion/swap, rollback journals
`manual-restart-required`, does not claim completion, and returns instructions to
the operator. PM2 definitions remain durably stopped; they may contain the newer
release's arguments and must not be blindly restarted. The operator determines
startup commands/settings, verifies application and financial read paths, reviews
PM2 persistence/schedules, and only then resumes traffic. No automatic smoke test
or scheduler restoration is attempted in this mode.


## Build once and promote the saved release

`build.sh` now runs the existing server/client asset build, captures
`build/release-source.json`, then creates a unique local package under
`releases/release-<build-time>-<commit-prefix>-<unique-suffix>/`. It prints the
absolute package path, content-based release ID and application archive SHA-256.
Each package contains:

- `build.zip`: the complete application archive, including its build-source metadata.
- `install.sh0`: the exact installer template captured for this release.
- `release-source.json`: Git commit, dirty flag and build timestamp.
- `release.json`: format version, source metadata, file sizes/SHA-256 checksums
  and an identity derived from that content. This package ID is distinct from the
  installed-file manifest identity used to select a rollback bundle.

Packages are treated as immutable: packaging always creates a unique directory,
never replaces an earlier package, and marks completed files read-only. A failed
package may leave an incomplete directory; without a valid `release.json` it
cannot be deployed. Local `releases/` is Git-ignored; preserve approved packages
outside any disposable build cleanup. These local packages are separate from the
server's installation-time `releases/deployment-*` records.

Example (replace the illustrative path with the path printed by build.sh):

```bash
./build.sh
./deploy.sh releases/release-<printed-name> staging
# Run the uploaded installer on staging and complete acceptance.
./deploy.sh releases/release-<same-printed-name> production
```

There is no implicit latest release or automatic build fallback. `deploy.sh`
requires exactly an explicit environment and package path. It verifies package
identity/checksums, generates a target-bound installer from the saved template and
archive in a private temporary directory, and uploads it as `~/install.sh` using
the existing selected SSH key/server settings. Temporary upload files are cleaned
up on success or failure; the saved package is never modified. Deployment still
does not run installation remotely. Staging uses `SPENDCRAFT_STAGING_SERVER` and
`SPENDCRAFT_STAGING_SSH_KEY`; production uses `SPENDCRAFT_SERVER` and
`SPENDCRAFT_SSH_KEY` as before.

Both environments receive the exact same application archive and saved installer
logic, with only `INSTALL_TARGET` specialized in the shell wrapper. Subsequent
source/template/build-directory changes do not affect an existing package. A
checksum mismatch aborts before scp; rebuild as a new release rather than editing
an approved package. Logs show the same release ID/archive checksum on both
uploads. Target-specific `.env`, credentials and generated keys remain on each
server; server-side npm installation still uses the packaged lockfile, so runtime
and platform parity remain part of staging acceptance. No production/staging
upload or installation was executed while implementing this workflow.

The common local implementation helper is `installer/releasePackage.mjs`; no
separate `package.sh` command was introduced. It does not bootstrap the app,
connect to a database or control services. ZIP and Node must be available on the
build machine. Root build/deploy scripts resolve their own tooling paths; a
relative package argument is interpreted relative to the caller's directory.
