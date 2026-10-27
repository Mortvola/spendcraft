# Application release rollback

Normal rollback restores the previous installed application without converting monetary values, running migrations or restoring the database. It is a one-way operation: successful rollback consumes `spendcraft.old` and removes the outgoing release after health verification.

## Installation and entry point

The installer uses [captureDeploymentManifests.mjs](../installer/captureDeploymentManifests.mjs) to record release identities and prepare an immutable, release-bound rollback bundle before swapping directories. After startup, [generateRollbackPlan.mjs](../installer/generateRollbackPlan.mjs) publishes the ordinary application-only plan under `$SPENDCRAFT_ROOT/maintenance/`.

The stable entry point selects the installed release's exact bundle and plan:

```bash
"$SPENDCRAFT_ROOT/maintenance/rollback.sh" --dry-run
"$SPENDCRAFT_ROOT/maintenance/rollback.sh" --execute
```

Execution requires authorization for the selected environment and the existing maintenance/readiness confirmations. A dry run can access the selected database read-only and writes inspection output; it does not stop writers, create a backup, swap releases or restart processes.

## Admission and unavailable rollback

[rollbackApplication.mjs](../installer/rollbackApplication.mjs) retains ordinary release manifests, bundle integrity, reviewed release differences, database/schema-file consistency, shared-secret links, database connection identity and PM2 process-definition checks. Missing releases, incomplete journals and abandoned swap state block execution. The launcher does not fall back to another bundle or dispatch to a monetary conversion tool.

The completed monetary migration's compiled hash profiles and codec-presence gates have been removed. There is no automatic migration-specific certification of old readers or writers. Operators must still review the proposed release pair; removing those gates does not make arbitrary older application or schema versions interchangeable.

A fresh installation without a previous release reports rollback unavailable. Database/schema-file or shared-secret differences also produce a nonfatal unavailable plan during installation. Such a plan is not executable. Other discovery failures remain errors; they are not silently treated as unavailable rollback.

## Execution and interruption

The established workflow verifies admission and readiness, stops the selected writers, creates a fresh database backup, then journals the directory changes:

1. Move outgoing `spendcraft` to a temporary swap path.
2. Promote `spendcraft.old` to `spendcraft` and verify identities.
3. Start the restored release using its process definitions and verify health.
4. Remove the outgoing temporary tree only after successful verification.

Each rename is atomic; the sequence is not. The temporary path is not a permanent recovery slot. If the previous release has no process manifest, rollback requires manual startup and leaves managed writers stopped. Failures after shutdown do not automatically resume writers or restore a backup. Preserve the journal and remaining release directories for explicit recovery review; do not automatically retry an interrupted operation.

Successful rollback leaves only `spendcraft`. A second rollback fails because `spendcraft.old` has been consumed. A later installation must create a new previous release before rollback is available again.

The executor performs no financial repair, JSON representation reversal or database restore. See [installation backups](installation-database-backups.md) for backup format and limitations, and [installer configuration](installer-environment-configuration.md) for the deployment environment.
