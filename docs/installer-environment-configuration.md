# Installer environment configuration

The release contains one checked-in configuration file, `installer/installer.env.required.json`. It holds automatic nonsecret values and metadata for values supplied privately by the operator. It must never contain secrets. APP_KEY, VAPID, JWT and Plaid cleanup keys are excluded because their key-generation commands handle them. The separate `installer.env.defaults` payload and defaults-appending installer step have been removed; all fourteen former defaults are `type: "value"` entries in the consolidated file.

`deploy.sh production` or `deploy.sh staging` embeds that target in generated `install.sh`, before its archive payload. The operator still uploads and runs the installer manually; deploy.sh does not execute remotely. A packaged installer accepts no target argument, or the identical target; a conflicting argument aborts before installation. The unpackaged template requires an explicit target argument. NODE_ENV stays production for both runtime environments and is not the deployment target selector. Preserve production/staging root, database, provider and PM2 isolation independently; this setting does not itself prove host identity or fix the release-specific rollback script's missing staging mode.

After extracting spendcraft.new, linking the shared .env and installing dependencies, the installer first initializes APP_KEY, then runs `ENV_PATH= NODE_ENV=production node ace generate:web-push-keys`, then runs `ENV_PATH= NODE_ENV=production node ace generate:jwt-keys` and `ENV_PATH= NODE_ENV=production node ace plaid:rotate-cleanup-keys --if-missing`, and then invokes `scripts/configureInstallerEnv.mjs` with its embedded target. It next runs the backup and proceeds to migration/seeding decisions. The metadata and helper are copied by Adonis metaFiles into build; the existing deploy archive includes them.

The required-settings helper reads the shared .env through its symlink. Nonempty configured values are preserved. Explicit empty values are also preserved when allowEmpty=true; otherwise they require configuration. Environment-specific entries are skipped outside their selected target. A configured value conflicting with a fixed value or a prompt entry's choices aborts without changing it. Staging's PLAID_ENV must be sandbox; it never requests PLAID_PRODUCTION_SECRET. This does not enable provider operations or establish sandbox credentials; optional provider integration remains separately controlled.

Current metadata covers database/Redis password fields (explicit empty permitted where authentication allows), SMTP host/port/user/password, target-specific Plaid environment/production identity, automatically generated cleanup encryption configuration. Shared production SMTP host/port and Plaid credential placeholders were moved from defaults into prompts; the Plaid environment is assigned automatically from the deployment target. Never reuse production provider, cleanup, notification or SMTP credentials in staging. Use independent keys and a local capture SMTP service where appropriate. No database roles/passwords or external provider resources are created by these prompts. Other existing application environment requirements still need configuration.

Missing prompt-type values require a real interactive terminal. Public input is echoed normally; secret input is masked with asterisks and confirmed. Empty disallowed values, invalid choices/encodings and mismatched secret confirmation reprompt without displaying answers. Ctrl+C, EOF, missing TTY, invalid metadata or file errors abort before subsequent installation steps. Existing fully configured files need no input. Shell tracing or external session recording can expose later file access; do not enable tracing or publish environment/recovery files.

All prompted answers are collected before writing. A mode-0600 file in the shared file's directory is written and synced; the helper checks that the original path/content has not changed while prompting, then renames the new file onto the resolved target and syncs the directory. The .env symlink itself remains intact. Concurrent manual configuration edits are not supported; detected changes abort rather than overwrite. This is not a configuration-file lock or a database lock. Original text is retained; a filled empty placeholder receives a final overriding assignment so existing comments/metadata remain. Node/Adonis parsing round-trip tests cover that behavior. A cancellation before save writes neither automatic values nor prompted values. A failure after rename may mean answers were saved even if final directory sync failed; inspect privately before retrying. No automatic database/application recovery is performed.

Input is single-line. For multiline keys, use the literal escaped newline format required by the application's existing key configuration; the installer initializes missing cleanup keys separately. Quoted/hash/space-containing input is encoded only when it round-trips exactly. Dollar interpolation, file: identifiers, control characters and values that cannot be safely represented on one .env line are rejected rather than silently changed. These restrictions avoid Adonis interpolation changing secret meanings; they are not a complete application credential/key-format validator. Existing nonempty values are not automatically rewritten or repaired. No secrets are printed or passed as shell/Node command arguments.

Tests use temporary synthetic files and real local pseudo-terminals (Python 3) for echo, Ctrl+C and EOF checks. Builds/tests do not authorize an installation or database connection. The production/staging servers were not contacted during this implementation. Stage the metadata/helper changes together with deploy.sh, installer/install.sh0 and adonisrc.ts; the generated installer is ignored and must be rebuilt before testing the new behavior.

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
node /spendcraft_staging/server/spendcraft.new/scripts/captureDeploymentManifests.mjs \
  --inspect-root /spendcraft_staging/server
```

Both `scripts/captureDeploymentManifests.mjs` and `scripts/lib/releaseManifest.mjs` must be the updated versions in the prepared release. Inspection only reads the prepared/current release files and their build identities. It creates no deployment record and does not modify releases, contact a database, or manage processes. A successful inspection does not prove that record-directory writes or filesystem syncs will succeed during actual capture. Keep processes stopped and do not manually swap releases while the capture failure remains unresolved. The staging failure reported under `deployment-2026-10-22T02-14-59.185Z-kMjx7X` has no established root cause until its diagnostic is collected; no safety check has been relaxed.

The installer creates the optional `PushNotificationKey.p8` link only when `../PushNotificationKey.p8` resolves to a regular file. A missing target, directory or dangling target symlink is skipped. Apple push requires a separately supplied valid APNs key; this change does not disable notification code or relax manifest validation for links that exist.

Automatic numeric JSON values are written without quotes (`PORT=3334`); string values remain safely quoted (`PORT="3334"`). Environment maps may mix strings and numbers. Zero and negative/decimal numbers are supported; booleans, null, arrays and nonfinite numbers are rejected. Environment variables are always text once parsed, so repeat-install checks compare against the textual form and preserve existing matching assignments. Application schemas continue to control numeric runtime types. JSON number spelling (such as `1.0` versus `1`) is not preserved after JSON parsing; the numeric value is serialized with JavaScript String(number). No application monetary representation changes are involved.

Plaid cleanup key initialization runs before interactive configuration. `--if-missing` creates `PLAID_CLEANUP_KEYS` with a random `v1` secret and sets `PLAID_CLEANUP_KEY_VERSION=v1` only when no keys/version are configured. Existing valid settings are preserved byte-for-byte, without rotation. Partial/malformed settings abort rather than replacing recovery credentials. Both former cleanup prompts are removed from the metadata. Explicit future rotation still uses the command without `--if-missing`.

The installer template lives at `installer/install.sh0`. `deploy.sh` reads it there and continues generating `install.sh` in the repository root for upload. The template is not part of the application build payload. Historical verification records may refer to its former root-level location.
