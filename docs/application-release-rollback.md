# Compatible application release rollback

Normal installer rollback now restores the previous compatible application
release **without converting or restoring database values**. Historical
Transaction Category conversion recovery is independently invoked using
`scripts/convertHistoricalTransactionCategories.mjs --recover` and an exact
original-JSON snapshot; it never swaps application directories.

## Installation and selection

The installer captures both releases and publishes an immutable release-bound
bundle containing `installer/rollbackApplication.mjs` and
`installer/lib/applicationRollback.mjs`. The bundle purpose is
`spendcraft-application-rollback`; its generated plan explicitly requires
`rollbackKind: application-only`. `adonisrc.ts` includes these files in the build.
The stable entry point remains:

```sh
"$SPENDCRAFT_ROOT/maintenance/rollback.sh" --dry-run
"$SPENDCRAFT_ROOT/maintenance/rollback.sh" --execute
```

The launcher resolves the currently installed release's exact bundle and plan.
It refuses legacy conversion bundles/plans; there is no fallback to an older
bundle or executor. Both releases must contain `categoryAmountCodec.js`. A
numeric-only predecessor is rejected rather than triggering string-to-number
conversion. Matching codec presence is a necessary compatibility check, not proof
that arbitrary future schema/API changes are reversible: release differences,
shared secrets, database configuration and complete release identities are still
verified. Database/migration file differences block automatic rollback.

The original `installer/rollbackTransactionCategoryStorage.mjs` and its
first-release guard remain unchanged in source for their historical scenario.
Neither that executor nor `lib/categoryRollback.mjs` is included in new normal
rollback bundles. Existing installed bundles remain immutable; deploy a newly
built release to install the new launcher, bundle and plan. Do not patch deployed
bundles or reuse an old plan with the new executor.

## Execution safeguards and behavior

Separate environment-specific authorization is required even for database reads.
Dry-run verifies releases, target and PM2 definitions and writes private local
inspection evidence. It does not stop processes, scan or convert allocations,
create a database backup, swap directories or restart services.

Execution preserves existing maintenance/fencing confirmation, selected-PM2
shutdown, fresh verified logical backup, staged previous-release copy, atomic
filesystem renames/journaling, explicit restart approval and health/read checks.
All three database verification connections enforce
`default_transaction_read_only=on`. The executor contains no monetary conversion,
allocation scan, financial repair, schema migration or database UPDATE/restore.
Backup commands read the database; they do not restore it. Implicit normal writes
by the resumed compatible application's jobs are ordinary application behavior,
not rollback conversion.

CIDR loopback host text is strictly normalized in the new application-only
identity code. Invalid prefixes, networks, wrong database/user/port, remote peers
and unreviewed connection mappings still fail closed. No machine-ID lock,
advisory lock or additional application-level row lock is introduced.

The previous release's process manifest controls restored startup. If absent,
the application files may be restored but all processes remain stopped for manual
operator startup and verification. Failures after stopping writers do not
implicitly resume them. Both releases, recovery copy, backup and journal remain
available; no automatic database restore or Category representation reversal is
attempted.

## Local verification and future staging rehearsal

Non-database tests exercise compatible/numeric-only release pairs, preserved
legacy guard rejection, exact bundle dispatch and exclusion of the legacy tool,
backup/swap/restart ordering, failures, manual startup, CIDR identity and
self-contained payload behavior. No actual rollback, database connection, PM2
operation or installed-file modification is authorized by these tests.

After a separately authorized staging deployment, inspect the generated plan's
kind and bundle purpose, run the read-only inspection, fence writers and rehearse
application-only rollback with synthetic data. Compare raw allocation JSON and
financial state before/after; strings, numeric and mixed values must remain
unchanged by the rollback. Rehearse historical conversion recovery separately,
keeping the compatible application installed. Production requires independent
approval.

Local verification: 241 focused non-database tests passed, zero failed/skipped
(application-only workflow, installer plan/bundle, legacy rollback guard,
historical conversion/recovery and PM2 manifest regressions). Both TypeScript
checks, changed-file ESLint, Knip, circular regression, server build including
client assets, separate client build, syntax and whitespace checks passed.
Repository-wide ESLint retains six pre-existing no-undef errors in the unrelated
`category-conversion-readiness-ajar8i/production-readonly-probe.mjs`; it was left
unchanged. Builds report the existing large-client-chunk warning; server asset
build may also report informational plugin timings. No errors were suppressed.

The pre-existing five-file staged historical-conversion snapshot was preserved
byte-for-byte (SHA256 of cached diff:
`0a98e4711dd6bcc05b4faf8dd85fda56835872f7f52b7e9473a87367be6c1b92`).
New rollback changes are unstaged, including the explanatory addition to the
already-staged historical implementation document. Existing unrelated files were
preserved. No database connection, real rollback/recovery, service operation,
installed-file change, deployment or commit occurred.
