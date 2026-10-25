# Transaction tax decimal-string release: commit and deployment preparation

> Current finalized policy: one-way rollback consumes old, verifies filesystem restoration, starts and health-checks the restored application, then removes the outgoing temporary tree. Success leaves only current. Earlier exchange/early-cleanup descriptions below are historical; use the finalization section. Deployment remains separately unauthorized.

Preparation date: 2026-10-23. **No deployment was executed. Deployment is blocked pending tax-compatible recovery review.**

## Exact release and Git reconciliation

Starting/current HEAD: `d62834c4202223557bbffd83cbdc1caffee97553`, branch `dollar-to-cents-2`.
Commit title: `Store Transaction tax attribution as decimal strings`.
Parent: `f92024df6bd6276d400d7552aa8fc95b13d179e1`.

The implementation was already committed before this task began. The index and tracked working tree were clean; there were no missing unstaged acceptance changes or an untracked verification record to collect. The existing commit contains all 25 previously reviewed files: the five runtime files, audit/build metadata, safety and regression tests, implementation/acceptance/audit and inventory documentation, and output-ignore instructions. No duplicate implementation commit, amendment or history rewrite is needed.

Unrelated untracked editor, backup, SQL, key, report and scratch files remain excluded. They were not opened for deployment packaging, staged, removed or overwritten. Private audit results and generated build/output artifacts are not committed. Preparation logs are under `script-output/tax-release-preparation.td4zv6/`, which is ignored. This new deployment document remains unstaged while the recovery blocker is reviewed.

The five committed production blob IDs match the accepted verification snapshot:

| File | Git blob |
| --- | --- |
| `app/Controllers/Http/TransactionsController.ts` | `57d43784edfc7f40bbf16d89e2899a23f5703225` |
| `app/Models/Transaction.ts` | `77db2d77c9811d76ae33d1a8dae1f34ca083b63d` |
| `app/services/taxAmountCodec.ts` | `c9bb947eb8a507faaea04de86b443f4e1898404d` |
| `app/services/taxStorageBinding.ts` | `6a7f47c7e6b00dba95e6264cb3166c4f902ab919` |
| `app/services/transactionTaxStorage.ts` | `4f0cff4e60b6009defc0881a31f7692000da8f53` |

No changes to database/migration files, Category codecs, TaxesController SQL, shared API/client runtime or installer/deployment scripts occurred in this commit. The PostgreSQL evidence still applies to this unchanged production code.

## Accepted verification and final local checks

Accepted PostgreSQL evidence from [the verification record](transaction-tax-decimal-string-postgresql-verification.md): safeguards 28; original PostgreSQL cases 45; expanded focused selection 1,269; one additional raw Category preservation case; full automated suite **2,807 passed**, zero failures/skips/pending. These overlapping selections must not be added together. No database-backed tests were rerun in this preparation task; their authorization has expired.

Final preparation checks: **404 non-database tests passed**, zero failures/skips/pending. This includes tax/Category boundaries, eligibility, audit, client caches, safeguards, installer metadata and PM2/release packaging/application-rollback tests. Both TypeScript projects, changed-file ESLint, Knip, circular regression, server/client builds, shell syntax and both diff whitespace checks passed. No unexpected dependency cycle appeared. Existing >500 kB client bundle warning remains. The earlier full-repository lint finding of 15 unrelated private-artifact errors is not corrected or suppressed here; this task required changed-file lint.

## Compatibility and storage boundary

New explicit tax replacements store `transactions.taxes[].amount` as canonical two-decimal strings using `Math.round(amount * 100)` then divide/toFixed. Numeric runtime/API values remain. Existing numeric/string/mixed arrays remain readable; no historical rewrite occurs on read or unrelated save. No tax conservation equality is added. Tax reports retain their existing real extraction, grouping, signs and selection.

This release requires **no schema migration and no historical conversion**. It does not change AccountTransaction money, Account/Category/Pool balances, Statement attribution, tax forecasts, Category allocation storage or deprecated functionality.

Installer decisions for this release: **decline migration execution at Ace's prompt; choose SKIP for seeding**. The installer still invokes migration status/run; its own command prompt is the decision point. If a new pending migration or missing prompt is observed, stop and review rather than execute it by assumption. Do not pass force flags or add conversion steps.

## Established deployment architecture

- `build.sh` builds the server/client, captures `release-source.json`, and packages an immutable release through `installer/releasePackage.mjs`. Output is under the established ignored `releases/release-...` location; no packaging script change is made here.
- `deploy.sh RELEASE_DIRECTORY staging|production` verifies the saved archive/template and produces a target-specific embedded installer. It copies that installer to the selected Ubuntu home directory with scp. **It does not rebuild or run installation remotely.**
- Use the **same release directory, release ID and build.zip SHA-256** for staging and production. The installer target wrapper differs; the application archive must not.
- Staging variables are exactly `SPENDCRAFT_STAGING_SERVER` and `SPENDCRAFT_STAGING_SSH_KEY`; production uses `SPENDCRAFT_SERVER` and `SPENDCRAFT_SSH_KEY`. The source uses `STAGING_SSH_KEY`, not a shortened alias. Staging's known domain is `staging.spendcraft.app`.
- Expected roots from existing operational records are `/spendcraft_staging/server` and `/spendcraft-prod/server`. Verify each actual host/root before installation; do not infer identity from the shell variable alone.

### Installer order and failure behavior

`installer/install.sh0` requires target/root validation and DEPLOY confirmation. It extracts `build.zip`, stages `spendcraft.new`, and calls manifest-driven PM2 stop. The process manifest names are `queue` (`ace.js queue:listener`), `plaid-cleanup` (`ace.js plaid:cleanup-listener`) and `prod-server` (`bin/server.js`, nightly cron restart). It prints selected process names. If the installed release lacks a PM2 manifest, the explicitly approved legacy fallback stops **all processes in that PM2 daemon**; inspect that daemon before authorizing this fallback.

The installer links shared environment/npm configuration and optional push key, installs production dependencies, preserves/generates missing application keys, and applies environment metadata. It validates the shared Nginx configuration/link. It invokes the bundled backup against the explicit shared env file before migration prompts, seeding choice and directory swap.

The bundled backup creates a unique directory under `$SPENDCRAFT_ROOT/backups`, runs a plain SQL pg_dump, and records nonempty-file completion/size/SHA-256. A successful dump and checksum do not alone prove restore recoverability; a recovery review/isolated restore rehearsal is still required. Do not copy production backups or data into staging.

It captures release identities and the stable maintenance bundle, deletes the **older** `spendcraft.old`, renames installed `spendcraft` to `spendcraft.old`, and promotes `spendcraft.new`. Preserve any older sole recovery artifact separately before authorizing replacement. Shared secrets stay outside releases.

After RESUME confirmation it starts manifest processes, saves PM2 state, generates an application-only rollback plan, tests/reloads Nginx and reports the health/maintenance reminder. External traffic fencing is an operator responsibility; the installer neither creates nor lifts it. Failures stop subsequent steps; there is no general automatic undo or safe fallback to an old binary. In particular, plan generation occurs after process startup and is not proof that the previous release understands new tax data.

## Packaging and future staging procedure — not executed

First resolve/rehearse the recovery blocker below. Then obtain separate staging deployment approval.

Use a clean checkout/worktree of the intended exact release for packaging. This working tree contains unrelated untracked files, and `writeBuildSource` deliberately records untracked files in `source.dirty`; do not claim a dirty build is identified solely by a commit. Do not delete user files to make it clean. In a separate clean checkout of the release:

```sh
npm ci
bash build.sh
```

Record the printed release directory/ID/archive hash and verify `release-source.json` names `d62834c4202223557bbffd83cbdc1caffee97553` with `dirty: false`. If a later reviewed documentation/recovery commit becomes the release candidate, pin that new exact commit and document the unchanged tested production blobs. Do not build from a moving branch or manually edit package metadata.

After approval, from the repository containing the established deployment tools:

```sh
bash deploy.sh "$RELEASE_DIRECTORY" staging
ssh -i "$SPENDCRAFT_STAGING_SSH_KEY" "ubuntu@${SPENDCRAFT_STAGING_SERVER}"
```

On the verified staging host, confirm `$SPENDCRAFT_ROOT`, release/recovery identities, available disk, writers and backup destination, then run the uploaded installer:

```sh
bash "$HOME/install.sh"
```

Type DEPLOY only after reviewing its actual target and maintenance conditions. Decline migrations, select SKIP for seeding, and confirm RESUME only after its stated checks. Verify the promoted release source/complete manifest against the tested package, and archive deployment evidence under a private `script-output/` directory without editing release contents.

## Staging acceptance matrix

Use synthetic data and retain raw before/after financial snapshots in private `script-output/` evidence. No production data is needed.

| Check | Acceptance |
| --- | --- |
| Identity/startup | Correct release ID/commit/root/archive; all manifest PM2 processes healthy; no old or uncontrolled writer; HTTP/HTTPS startup and logs healthy. |
| Authentication | Login and a protected read work; anonymous and foreign-Budget requests retain their contracts. |
| Existing numeric taxes | Retrieve seeded numeric attribution, confirm numeric JSON API values and unchanged raw storage. |
| New writes | PATCH positive, negative, zero and duplicate entries; inspect raw jsonb_typeof and exact two-decimal strings. |
| Rounding | Include 12.345→12.35, -1.005→-1.00, ±0.125 half ties, binary artifacts and negative zero. |
| Numeric/mixed reads | Canonical-string and mixed arrays return numeric DTO values; metadata/read-only operations do not normalize history. |
| Invalid input | Invalid/missing/null required amount and overflow reject without partial state. |
| Reporting | Existing tax monthly/type grouping and real totals unchanged for cent-valued numeric/string/mixed fixtures. |
| Category/financial isolation | Tax-only PATCH preserves raw Category amount strings, duplicate order, metadata, AccountTransaction amounts and Account/Category/Pool balances. |
| Lifecycles | Provider/replacement/opening/deletion/report reads retain accepted behavior and tax attribution where required. |
| Recovery | Rehearse the approved tax-compatible recovery strategy, including a failure after new strings exist. Generic Category-based rollback acceptance is insufficient. |

Review and record staging acceptance of that exact immutable archive before requesting production approval. No synthetic write against production is authorized by a staging test plan.

## Future production procedure and safeguards — not executed

Before approval, require all of:

1. Exact source commit, clean package identity/archive hash and staging acceptance evidence for that same archive.
2. Fresh verified production backup/recovery point, readable completion manifest and a documented recoverability procedure; preserve legitimate activity after that recovery point.
3. Sufficient live free disk for unpacked new/current/previous releases, dependencies, backup and recovery copies. The historical 16 GiB expansion is not current free-space evidence.
4. Actual current and prospective previous release manifests, shared config/secret links, PM2 inventory and controlled shutdown/drain procedure; no incompatible writer may survive.
5. Approved, rehearsed **tax-compatible** recovery/fallback strategy. Do not treat a generated rollback plan as sufficient.
6. Confirmed environment variables/SSH target/root and production database identity for the later operation, explicit migration decline and SKIP seed decision.
7. Explicit operator deployment approval after reviewing these facts. Do not infer approval from this document.

After separate approval, use the identical release directory:

```sh
bash deploy.sh "$RELEASE_DIRECTORY" production
ssh -i "$SPENDCRAFT_SSH_KEY" "ubuntu@${SPENDCRAFT_SERVER}"
# On the verified production host, after all gates:
bash "$HOME/install.sh"
```

Verify release/process/HTTP health, authentication, existing Transactions and numeric tax API responses, tax reports and ordinary Category/report functionality without altering real financial records. New-write verification requires a separately approved safe production procedure; otherwise label that path unobserved in production and cite staging/PostgreSQL evidence. Monitor provider and listener errors. Do not automatically restore a backup or swap to an incompatible previous release on failure; fence writers and retain evidence.

## Rollback compatibility blocker

**Installed-release identities were not inspected on either EC2 host in this task.** No SSH, database or AWS connection was made. Actual `spendcraft` and `spendcraft.old` release manifests, availability and tax-codec behavior remain execution-preflight prerequisites. During the next deployment, today's `spendcraft` becomes tomorrow's `spendcraft.old`; do not confuse it with today's older directory.

Source comparison establishes a concrete compatibility gap for parent `f92024d` → tax release `d62834c`: the parent has the Category codec but no tax codec/binding. Its Transaction model hydrates/serializes raw tax strings unchanged; it does not preserve the numeric Transaction tax API contract. The parent's SQL real report extraction may work with strings, but that does not certify all readers/editors or numeric DTO compatibility. Treat that predecessor as unapproved for tax-string rollback.

The normal stable rollback launcher selects `installer/rollbackApplication.mjs`, which performs application-only restoration. Its `verifyReleases` currently requires Category codec presence in both releases plus exact manifest/config/schema/secret checks. **It does not check for loss of tax-string decoding.** It can therefore admit a Category-compatible but tax-incompatible pair; release-difference fingerprints are not a semantic tax-compatibility proof. Do not execute the generated rollback plan for this pair merely because generation or dry-run succeeds.

The original first-Category-release conversion rollback has a different guard and purpose. Leave it unchanged; never select it to reverse tax strings, weaken its identity guard, or use Category historical recovery to change taxes.

Required next recovery review: prepare and rehearse a fallback release that preserves the accepted tax reader/API compatibility, or approve and rehearse retaining/reinstalling this compatible release for forward recovery while preserving both installed copies and database activity. Strengthening automatic rollback admission to reject loss of tax compatibility is a narrowly identified tooling requirement for separate review. No such tooling change or recovery procedure was implemented/tested here. There is no approved tax reverse-conversion script; do not invent one or round historical values again. A full database restore is not an automatic rollback, and could lose legitimate activity.

Before any new tax strings exist, a rollback decision still needs proof of the actual database representation, source identities and writer fence; this preparation provides no database authorization or proof of that condition.

**Until tax-compatible recovery is approved and rehearsed, do not execute staging write smoke tests or production deployment.** The release source is committed and accepted; operational rollback readiness is unresolved.

## Historical tax conversion remains separate

The earlier production audit observed 21 numeric tax entries; the count may have changed. Installation must not convert these records. A later historical conversion task needs a fresh authorized read-only audit, a separate conversion-specific original-JSON recovery design/script, synthetic staging rehearsal, fresh production backup, stopped financial writers and independent execution approval. It must not be combined with deployment or change other monetary storage.

No staging/production database changed, historical tax conversion, PM2 stop/restart, schema migration, deployment or AWS modification occurred during this preparation. No new commit was created: the accepted source was already committed, and the new deployment document is left reviewable while the recovery blocker remains.

## Recovery design revision — no preserved application copies

The operator rejected automatic full recovery copies. The installer retains the existing `spendcraft`/`spendcraft.old` layout. There is no preservation CLI, alternate-target recovery plan or accumulating `maintenance/tax-recovery` directory.

The new tax compatibility guard remains. Ordinary rollback selects `spendcraft.old` only when its reviewed compatibility and existing safeguards pass. If the predecessor cannot safely handle tax strings, rollback is unavailable: retain the compatible current release and build/test/deploy a compatible forward fix through the established process. No automatic database reversal or restore is added. The legacy first-Category-release converter/guard remains unchanged.

Read-only installed-release observations and the revised procedure/matrix are in [the recovery document](transaction-tax-decimal-string-recovery.md). Both installed current releases are labeled `5d98bbc558b8af21f6482805510e684acbcf3489`; production previous is `2259bb6d152edc01dfc0093aae9d4267667ac13a`, staging previous is `5d98bbc558b8af21f6482805510e684acbcf3489`. All report dirty builds and lack the new tax boundary; none is an approved tax-string rollback target. Full live identities and actual runtime admission must still be verified at execution time.

Fresh staging authorization and rehearsal of incompatible rollback rejection, compatible release-pair rollback and compatible forward correction remain required. Production also needs exact same-artifact staging acceptance, a fresh recoverable backup, capacity and writer checks, declined migrations, SKIP seeding and independent approval. Historical tax conversion stays deferred. Prior verification of the now-removed preservation feature is historical only; current local checks are recorded below.

Simplified-design verification: 343 non-DB tests passed with zero failures/skips/pending; both TypeScript checks, changed-file ESLint, Knip, circular regression, syntax, server build and both diff checks passed. All nine protected emitted files still match the profile; no preservation CLI is packaged. Client runtime/assets were unaffected. No database, PM2, installed-release, deployment or commit operation occurred. Logs are under `script-output/tax-recovery-simplification-d6c9twca/`.

## Fresh staging preflight — blocked, 2026-10-23

HEAD remains `d62834c4202223557bbffd83cbdc1caffee97553`, branch `dollar-to-cents-2`. Thirteen recovery files are staged, not committed; their index entries were preserved. Only these two documentation files gained unstaged preflight updates. See [the detailed staging evidence and blockers](transaction-tax-decimal-string-recovery.md#fresh-read-only-staging-evidence).

Read-only SSH/EC2 metadata/file inspection confirmed staging instance `i-0b24684c411b4b829`, root `/spendcraft_staging/server`, APP_URL `https://staging.spendcraft.app`, and approximately 2.73 GiB available. Installed current identity is `abe55d888b4119cb96d832b1cdf1465eabd09e38271b3ef54845543b6fd175c8`; previous is `b261e79dc7395bef240743993318a372e3209f37fef93860ceb8273658afb662`. Both dirty builds are labeled `5d98bbc558b8af21f6482805510e684acbcf3489` and lack tax decoding. PM2 daemon/three Node processes were observed without process-control commands; backups exist but recoverability is unverified. Configured staging database is `spendcraft` on localhost:5432, role ubuntu; no live database connection was made.

Execution blockers:

1. Existing rollback code still retains `spendcraft.forward-recovery-*` after its staged-copy swap. Despite two completed installer slots, rollback therefore retains a third application directory. A reviewed two-slot swap/interruption design is needed before compatible rollback rehearsal; no production fix or safety bypass was made here.
2. No pinned saved artifact contains the staged tax compatibility guard. Nine existing local packages predate the tax commit. Commit/review the intended corrected tooling separately, then build and verify one exact clean-source archive/template.
3. Live database/execution identity, fresh backup recoverability, full PM2/cron/writer admission and capacity peak remain incomplete. Complete those read-only gates only after the design/artifact issues are resolved. Existing installed releases cannot be used to manufacture a compatible tax pair.

The staged guard itself rejects unknown tax compatibility before database access/process shutdown and retains Category/identity safeguards. Fresh local verification: 343 non-DB tests passed, zero failures/skips/pending; both TypeScript checks, changed-file ESLint, Knip, circular regression, both builds, syntax and both diff checks passed. Existing client bundle warning remains. No database tests ran.

Future staging execution still requires fresh explicit approval after these blockers are resolved. Use synthetic data and the same exact artifact for subsequent production review; decline migrations, SKIP seeding, verify raw tax strings/numeric API/report behavior and financial noninterference. Rehearse incompatible rejection and only positively verified compatible rollback, plus controlled interruption behavior under separately authorized execution. No extra recovery slot, automatic tax reversal or database restore is allowed. Historical conversion and production deployment remain unauthorized.

Evidence and full final Git status: `script-output/tax-staging-preflight-ua8mvwa5/`. No database connection, process control, installed-release change, deployment, schema migration, historical conversion, AWS modification or commit occurred. Production was not accessed.

## Artifact finalization — corrected two-directory rollback

This correction starts from `1a9d382d1f9dd06019a67c8aca407afce27ebe86`, which already commits the tax guard (the earlier staged-only finding is historical). No unrelated staged work existed. The finalized source commit is the commit containing this section; post-commit exact provenance is recorded in `script-output/tax-two-directory-finalization-per_cpsz/artifact-receipt.json` and the saved package's `release-source.json`/`release.json`. Refer to the final report for that exact hash and package/archive identity; generated hashes are not self-embedded into the source commit.

The normal rollback now performs a journaled exchange: current → temporary, old → current, temporary → old. Both original complete identities remain, only `spendcraft` and `spendcraft.old` persist, and the temporary rename path disappears on success. No full tree is copied/deleted or retained in a third slot. The installer itself is unchanged. See [the finalized swap and interruption table](transaction-tax-decimal-string-recovery.md#finalized-two-directory-swap--supersedes-the-preflight-design-blocker) for exact phases, writer/restart behavior and manual recovery requirements. A rename/journal interruption keeps both trees but blocks blind retry; actual identities determine recovery. Unknown tax compatibility is rejected before stop/journaling/swap. Existing Category, bundle, database, PM2 and backup safeguards remain.

After successful local checks, review/stage only correction/helper/test/documentation files, commit without rewriting earlier commits, and build **once from a clean detached checkout** using `bash build.sh`. Verify the package against the new source commit, the reviewed nine compiled monetary boundary hashes, and committed guard/corrected executor/helper/bundle. Generate the staging installer locally from that saved archive through `installer/releasePackage.mjs installer`; do not use `deploy.sh` yet because it copies remotely. A production wrapper may be generated from the same archive without rebuilding. Exclude secrets, private audit output and unrelated files. Retain the verified saved package for future same-artifact promotion.

This removes the code/commit blockers only after artifact verification succeeds; it does not grant staging execution approval. Fresh staging preflight must reverify EC2 identity, root, live DB/execution identities, recoverable backup, capacity, PM2 writers/cron and both full installed identities. Decline migrations, SKIP seeding. Initial incompatible rollback must reject without changing data, processes, directories or execution journal; positive exchange/failure rehearsal requires a genuine compatible release pair and separate authorization. If the only compatible installed release is unavailable, keep writers stopped and require reviewed manual recovery/forward correction. No tax reversal or automatic database restoration is permitted.

Production deployment and historical tax conversion remain separately deferred. No staging/production database access, PM2 operation, installed-release modification, migration, seeding, AWS change or deployment occurs in artifact preparation.

Final local verification: 377 non-DB tests passed (34 new swap cases), zero failures/skips/pending; both TypeScript checks, changed-file ESLint, Knip, circular regression, server/client builds, syntax and both diff checks passed. Existing large-client-bundle warning remains. The approved tax arithmetic/API/reporting files are unchanged. No database tests or server operations ran. The post-commit artifact receipt supplies exact source/package/archive identities; staging execution remains separately unauthorized.

## Current rollback revision: one-way restoration

The approved behavior supersedes the earlier exchange design: rollback consumes old, restores it to current, verifies the complete restored identity, then removes the outgoing temporary tree. After success only `spendcraft` remains. It cannot toggle forward; no further rollback is available until a later deployment creates old again. A missing old is rejected explicitly before executor dispatch/database access/shutdown/mutation. Existing compatibility and execution safeguards remain.

See [the one-way interruption and cleanup policy](transaction-tax-decimal-string-recovery.md#current-policy-one-way-rollback--supersedes-directory-exchange). The outgoing temporary tree protects the restoration steps only, and is deleted after guarded verification. Interrupted deletion can leave partial cleanup residue; abort before startup and require verified manual cleanup, never recreate an old release slot or restore a database. A subsequent startup failure cannot return automatically to the removed outgoing version.

The one-way revision is uncommitted and no new deployment installers have been generated. Previously saved `7871889` artifacts still use exchange and are not the deployment candidate for this changed behavior. They were not altered. A later reviewed commit/artifact and fresh staging approval are required; no deployment or historical conversion is authorized here.

One-way revision verification: 381 focused non-database tests passed, zero failures/skips/pending, including actual shell rejection when old is missing, second-attempt rejection, guarded cleanup/partial-removal failure and interruption tests. Both TypeScript checks, changed-file ESLint, Knip, circular regression, Node/shell syntax, server build and both diff checks passed. Existing client bundle-size warning remains. Logs: `script-output/one-way-rollback-d25r1649/`. No database connection, actual rollback, PM2 operation, server access, deployment, installer regeneration or commit occurred.

## Finalization of the one-way release and rebuilt installer

Actual starting HEAD is `160a6e7b578a29cb7a70f14d8e97778638f3521e`, branch `dollar-to-cents-2`; the one-way changes were already committed and no tracked/index work was pending. This task adds the health-ordering safety correction and filesystem admission before database connections, then commits and packages only those accepted changes. Earlier uncommitted/staged findings and the 7871889 exchange artifact are historical.

Outgoing deletion is now deferred until filesystem restoration **and** automatic PM2/HTTP checks, fresh DB identity verification and explicitly confirmed authenticated read-only/startup-error checks pass. Unknown compatibility, missing old and stale journals stop before database connection/shutdown. Success leaves restored current only; a second rollback fails. Before health or cleanup failure, preserve the outgoing temporary tree, stop managed writers and require manual review. Manual-startup-required mode remains incomplete and never authorizes cleanup. See [the finalized ordering and failure matrix](transaction-tax-decimal-string-recovery.md#one-way-finalization-retain-outgoing-until-runtime-health-passes).

Normal installer rotation remains unchanged: current → old, incoming → current. The one-way rollback does not recreate old or a persistent third release. No database restore, tax reversal, schema migration or historical conversion is performed. Fresh database/writer exclusivity is still required before rotation; post-health outgoing-only cleanup instead checks the restored processes and expected live DB identities without rejecting the restored application's own connections.

Local verification: **387 focused non-DB tests passed**, zero failures/skips/pending; both TypeScript checks, changed-file ESLint, Knip, circular checks, syntax, server/client builds and both diff checks passed. Existing client bundle warning remains. The 2,807-test PostgreSQL baseline is historical evidence for unchanged tax runtime; no DB tests reran.

The exact final committed release, clean checkout, build timestamp, package ID/archive SHA-256 and wrapper hashes are supplied post-commit in `script-output/one-way-finalization-3nhy2qo5/artifact-receipt.json` and saved package metadata. The source commit is the commit containing this finalized section; self-referential generated identifiers are not embedded into the source. Build from that clean checkout using `bash build.sh`, verify guards/one-way health-and-cleanup implementation and assets, then generate both wrappers locally from the **same saved ZIP**. Never reuse the prior exchange ZIP SHA `63d24c0a49afa2c30081e3cbad0eaea20596b35fc6dae4018b6df180649c4dec`.

Before later staging deployment, independently repeat EC2/root/database/current-and-old identities, backup recovery, capacity and complete PM2/cron/writer checks; earlier observations are not current evidence. Pin the new exact artifact, obtain fresh staging approval, DECLINE migrations and SKIP seeding. Confirm incompatible rollback is nondestructive, and run positive/negative synthetic functional, runtime-health, cleanup and interruption tests with a truly compatible release pair. Production remains blocked until same-artifact staging acceptance and separate approval. No server/database/PM2/AWS change or deployment occurs during finalization.

## Current pinned-artifact staging preflight — October 23, 2026

Source `2429cd32250430d5238ea6d79a066096ccbe8c87`, branch `dollar-to-cents-2`. The [current staging verification record](transaction-tax-decimal-string-staging-verification.md) supersedes older uncommitted/artifact/swap status statements above. Package `13f88fb1a5465e1d40c4a4194b2596c0c276f04a31c79113ccf8fb63e9f208b7`, archive SHA-256 `cd64e9afb929b287f763a5af0a26621f6ce17b8f6fed8b1c53721be898f4a3c1`, was verified without rebuild or upload; wrappers embed the identical ZIP and committed one-way/guard bytes.

Read-only staging preflight reverified EC2 identity, current/old full identities, three live read-only database identities, 2.73 GiB data-volume headroom, PM2 PID/manifest mapping and HTTP/HTTPS 200. Both installed releases lack tax decoding and remain inadmissible rollback targets. The finalized rollback is one-way, keeps outgoing temporary files until filesystem/runtime verification, then removes them; it never recreates old or reverses tax storage. Installer rotation remains unchanged.

**Execution remains blocked:** backup completion/checksum/footer pass, but successful restore recoverability is not established. PM2 daemon exists, but no PM2 systemd unit is listed and reboot recovery is unverified. Resolve these gates, repeat volatile writer/identity/capacity checks, then request fresh staging execution approval. Decline migrations, SKIP seeding. No staging-changing operation, production access, historical conversion, process control, deployment, stage or commit occurred. Detailed evidence is under `script-output/tax-staging-acceptance-preflight-rf3bkjwt/`; future smoke/guard/interruption matrices and exact saved-package commands are in the linked record.
