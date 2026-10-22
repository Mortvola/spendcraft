# Production EC2 disk capacity review

## 1. Inspection and decision

Read-only inspection October 20, 2026, concluding at **16:41:58 America/Denver (22:41:58 UTC)**. Repository HEAD `1a71a3f9f0b79cfbf7a6be007239d738ba3f33ae`, branch `dollar-to-cents-2`. Tracked tree/index were clean at entry; existing unrelated untracked files and the untracked staging design were preserved.

**Critical capacity shortage, without an observed active disk-related outage. Expansion execution is blocked pending positive AWS root-volume identity/type/state and recovery-point verification.** Production inspection stopped after bounded diagnosis; no cleanup, resource change, snapshot, database connection, process restart or deployment occurred.

Preferred response: separately authorize an increase of the **root volume from 8 GiB to 30 GiB**, preserving its existing type initially, followed by partition/ext4 growth after target and recovery checks. A 16 GiB expansion is a reasonable minimal short-term option. Do not delete spendcraft.old or WAL, move live database files, or combine unrelated changes to gain immediate capacity.

## 2. Reconfirmed host and service facts

Authenticated SSH to `spendcraft.app` and EC2 IMDSv2 confirmed region `us-west-2`, AZ `us-west-2c`, instance type `t2.small`, Ubuntu 22.04.5 LTS, x86-64 and one vCPU. Node 24.15.0, npm 11.12.1, PM2 5.4.1 and PostgreSQL client 15.16 were reconfirmed. PostgreSQL/Redis/Nginx/PM2 systemd units report active; no failed systemd units were listed. Current inspection returned a valid Nginx command but did not capture its stderr version; prior design established Nginx 1.18.0. Application port localhost:3334 and root `/spendcraft-prod/server` remain configuration facts from the immediately preceding inventory, not new authenticated HTTP checks here.

No new production financial queries were needed. The installed PostgreSQL server binary/version and loopback configuration were established in the staging inventory; this task did not connect to SQL to assert live server metadata, table/database sizes or runtime settings.

## 3. Filesystem, partition and inode inventory

| Filesystem | Device / type | Capacity and utilization |
| --- | --- | --- |
| Root `/` | `/dev/root` alias, actual `/dev/xvda1`, ext4 | 8,132,173,824 filesystem bytes; 8,082,759,680 used initially; **32,636,928 available (~31.1 MiB), 100%** |
| Data `/spendcraft-prod` | `/dev/xvdbb`, XFS | 4,284,481,536 filesystem bytes; 1,288,994,816 used, 2,995,486,720 available; 31% |
| EFI `/boot/efi` | `/dev/xvda15`, vfat | About 106 MiB partition; separate from ext4 root |
| Root inode usage | Root filesystem | 259,574 / 1,032,192 used, 26% |
| Data inode usage | Data filesystem | 77,880 / 2,097,152 used, 4% |

Root mount options are `rw,relatime,discard,errors=remount-ro`. The last option specifies error policy, **not** a current read-only mount. Root is writable; no read-only failure was observed. Mounted Snap squashfs images are read-only by design, not filesystem failure.

Physical root disk is `/dev/xvda`, **8 GiB**, GPT, 512-byte sectors. `sfdisk --json` verified:

| Partition | Start sector | Sector count | Purpose |
| --- | ---: | ---: | --- |
| `/dev/xvda14` | 2,048 | 8,192 | BIOS boot |
| `/dev/xvda15` | 10,240 | 217,088 | EFI system |
| `/dev/xvda1` | 227,328 | 16,549,855 | Linux filesystem / ext4 root |

Although numbered 1, root is physically after the boot partitions and at the end of current disk space. Enlarging the disk can provide contiguous space after root; no EFI partition movement is indicated. No LVM layer was shown. Metadata root device mapping is `sda1`, consistent with Xen guest `/dev/xvda1`; it is **not an EBS volume ID**.

Across two snapshots during this investigation, root used space increased only 4,096 bytes and available space fell from 32,636,928 to 32,632,832. This is insufficient to calculate a meaningful growth rate or predict exhaustion time. It does not establish that usage is stable long term. No artificial write load was generated.

## 4. Major disk consumers and cause

Bounded `du -x` directory scans did not cross unrelated mounts. Allocated sizes below are approximate; parent and child rows overlap and must not be added together.

| Location | Allocated size | Interpretation |
| --- | ---: | --- |
| `/var` | 2.90 GiB | Snap/package state, journal and caches dominate |
| `/usr` | 2.44 GiB | Installed OS libraries/binaries and headers |
| `/home` | 1.90 GiB | Multiple Node versions and npm/build caches |
| `/boot` | 245 MiB | Boot/kernel artifacts; not a manual cleanup candidate |
| `/var/lib/snapd` | 1.33 GiB | Installed Snap images/state, multiple revisions observed in mounts |
| `/home/ubuntu/.nvm` | 1.03 GiB | Runtime installations plus nvm state/cache |
| `/home/ubuntu/.nvm/versions/node` | 943 MiB | Four versions; details below |
| `/var/log/journal` | 784 MiB | Persistent system journal retained across many months |
| `/usr/src` | 613 MiB | Installed source/header tree; exact package retirement not reviewed |
| `/home/ubuntu/.npm` | 599 MiB | `_cacache` ~598 MiB; npm logs ~1.35 MiB |
| `/var/cache/apt` | 327 MiB | Package cache; eligibility needs package-manager review |
| `/var/lib/apt` | 322 MiB | Package metadata; not equivalent to disposable archives |
| `/home/ubuntu/.cache/node-gyp` | 240 MiB | Native-module build cache |
| `/home/ubuntu/.pm2` | 31.7 MiB | Includes PM2 state/logs; preserve state and credentials |
| `/tmp` | 2.62 MiB | Not the cause |
| `/var/tmp` | 40 KiB | Not the cause |
| `/var/lib/redis` | ~508 KiB | Persistence directory is small |
| `/var/lib/postgresql` | 38.4 MiB | Separate root-resident PostgreSQL directory; active production data is elsewhere |

Installed Node version sizes: v24.15.0 ~246 MiB, v24.14.1 ~245 MiB, v22.17.0 ~239 MiB and v20.15.0 ~213 MiB. v24.15.0 is the reviewed current interpreter. The other three total about 697 MiB, but are **not verified disposable**: PM2/systemd/old-release/manual commands may reference them. Never remove a runtime based on directory age alone.

**Cause supported by evidence:** an undersized 8 GiB root filesystem is carrying accumulated normal OS/runtime/package data, multiple Node/Snap revisions, caches and a large retained journal. No single runaway financial-data file was identified. Much of the space could eventually be managed through retention, but deleting a few artifacts would not provide durable operational headroom.

## 5. PostgreSQL and WAL

Active configured production data directory `/spendcraft-prod/postgresql/15/prod` is on the separate XFS data volume, not root. It occupies **83,193,856 bytes (~79.3 MiB)**:

- pg_wal: **33,554,432 bytes (32 MiB)**.
- base directories: about 46.6 MiB.
- pg_replslot and pg_tblspc allocated usage: zero in this scan; WAL is not a symlink.
- Root `/var/log/postgresql`: about 100 KiB.

Main configuration explicitly contains max_wal_size=1GB and min_wal_size=80MB. The main file has no active archive_command or primary_conninfo, no standby.signal was present, and postgresql.auto.conf had none of the inspected archive/retention/primary-connection overrides. Included configs, live replication slots/settings were not exhaustively SQL-verified. Current 32 MiB WAL provides **no evidence of abnormal retention**; it is not a reason to edit WAL configuration. File-system sizes are not SQL-reported database sizes.

Bounded current PostgreSQL log inspection found zero matches for no-space, disk-full, read-only-filesystem or I/O-error patterns. This is limited historical coverage, not proof that a failure never occurred. Do not remove WAL, run VACUUM FULL/REINDEX, move this live cluster, or restart PostgreSQL for root-space remediation.

## 6. Application releases, temporary artifacts and recovery material

All these paths are on **the separate data volume**, so deleting them would not free root filesystem blocks:

| Path | Allocated size / finding |
| --- | --- |
| `/spendcraft-prod/server` | About 1.01 GiB total |
| `spendcraft` | 305.8 MiB, including 297.8 MiB node_modules and ~2.8 MiB public assets |
| `spendcraft.old` | 305.7 MiB, including 297.8 MiB node_modules |
| `backups` | 410.5 MiB allocated |
| `releases` | 14.5 MiB of manifest/release records |

No spendcraft.new/build directory was shown in the inspected root-level directory-size listing. Root-level archives and other files are not individually certified disposable; the aggregate leaves only a small amount beyond listed directories. No independently identified rollback journal/output directory was reported by that listing. Preserve both complete installed releases, external environment/keys, manifests and any rollback journals. The installer rotates current to old and deletes an earlier old generation; manual deletion of spendcraft.old defeats the established recovery strategy and is not recommended.

The versioned build/deploy procedure builds locally and uploads a self-extracting installer; target npm installation still consumes root-side npm caches. Rollback may additionally need a copied prior release, retained current release and fresh recovery dump on the data volume. Root expansion does not automatically enlarge that volume: measure data-volume headroom independently before a conversion/rollback rehearsal.

## 7. Backups

Metadata-only inspection found **592 backup files**, logical total **429,226,925 bytes (~409 MiB)**, under `/spendcraft-prod/server/backups` on the data volume. Oldest file timestamp is October 20, 2023.

Recent files:

| File | Logical size | Modified UTC |
| --- | ---: | --- |
| backup.sql | 6,598,285 bytes | 2026-10-20 17:22:45 |
| backup_1.sql.gz | 919,524 bytes | 2026-10-19 02:42:55 |
| backup_2.sql.gz | 915,079 bytes | 2026-10-14 03:40:06 |
| backup_3.sql.gz | 914,211 bytes | 2026-10-10 15:20:42 |

The host backup wrapper uses pg_dump and gzip; no deletion/retention limit or S3/scp/rsync transfer was detected in that script. This does not rule out other automation. Off-instance copies, successful completion records and restore recoverability are **not established**. One older file is under 100 bytes: metadata cannot establish whether it is an intentionally tiny dump or a failed backup. Do not declare all backups valid from filenames/size alone and do not delete it on inference.

A recent dump exists, but a recent **complete recoverable** backup is not verified. A future authorized operation should verify/create a recovery point without writing to the full root filesystem, then verify durable off-instance storage and restore procedure. Moving/retaining backups in encrypted staging-independent production S3 storage is a sensible later task, but saves data-volume space, not root space. Do not copy financial backups into staging.

## 8. Logs and rotation

`/var/log` totals about 847 MiB, dominated by the 784 MiB journal. Nginx logs occupy about 664 KiB, PostgreSQL logs about 100 KiB, Redis logs about 172 KiB, Let's Encrypt logs about 7.8 MiB, and Amazon agent logs about 48.6 MiB. PM2's complete state directory is only about 31.7 MiB, so its logs are not the dominant cause. Exact individual PM2 log sizes were not retained from the bounded top-log report.

Largest reported individual logs were archived system journals of 48 MiB (July/August 2026), 40 MiB (September 2026), and multiple 32 MiB journals dated as early as June 2025. This supports long retention, not a measured current log storm. No explicit active SystemMaxUse/SystemKeepFree/MaxRetentionSec settings or journald drop-ins were found in inspected configuration; defaults apply unless other configuration sources intervene.

Nginx rotation: daily, 14 rotations, compressed with delaycompress. PostgreSQL common rotation: weekly, 10 rotations, compressed with delaycompress. No pm2-logrotate module directory was present; other external PM2 log management was not exhaustively established. Do not truncate active logs or manually remove journals. Separately approved journal archival/retention and PM2 rotation can prevent recurrence, after required incident/audit retention is decided.

Bounded last-2-MiB reads of current PostgreSQL, Nginx and three PM2 error logs found zero disk-error pattern matches. The last 200 warning-or-higher journal messages within 24 hours also contained zero no-space/read-only/I/O-error matches. Raw messages, financial details and tokens were not exposed. Full rotated archives/deployment logs were not read, so failed older deployments/backups cannot be excluded.

## 9. Deleted-but-open files

`lsof +L1` identified deleted mapped executables held by system processes: Python 3.10 (shared by networkd-dispatcher/unattended-upgrades), systemd-logind and agetty, plus a ~791-byte deleted unattended-upgrade log. Counting shared device/inode once, about **6 MiB** of logical file sizes is retained. Duplicate process references are not additive disk allocation.

No large deleted PostgreSQL/application log was identified. Restarting the holding processes or rebooting could release those mappings, but introduces availability/session risks and would recover immaterial capacity. No restart is justified for this purpose; none occurred.

## 10. EBS identity, availability and stop gate

Linux devices, sizes, partition layout and region/AZ were positively verified. AWS CLI is unavailable locally and on the inspected host; no AWS control-plane credential source was established. **Root/data EBS volume IDs, type, encryption, snapshot coverage and current modification states remain unverified.** IMDS provides the root mapping, not a positive volume-ID/attachment/type match.

The operator was asked for console metadata: root volume ID, size/type, encryption and current modification state. No response is assumed. Further production inspection was stopped after diagnosis. Do not substitute `/dev/xvda`, the hostname, an arbitrary volume with size 8 GiB, or a volume from another instance for verified AWS identity.

Before execution, an authorized console/operator must locate the exact production instance in us-west-2/us-west-2c; match root block mapping sda1 to its attached volume; record volume ID, attachment instance/device, size=8 GiB, type, encryption, health, snapshot/recovery details and modification state. Also identify the distinct 4 GiB data volume. Do not create credentials or broaden IAM to bypass this gate. Existing and pending modification/Elastic Volumes eligibility must be confirmed in AWS.

## 11. Online expansion feasibility

The observed guest layout is a conventional GPT root partition/ext4 on Xen. `growpart` and `resize2fs` are already installed, and the installed growpart script supports TMPDIR. Subject to verified AWS Elastic Volumes support and no active prior modification, online enlargement is the expected approach; no routine reboot/application restart is normally required. This is conditional feasibility, not execution acceptance.

[AWS's filesystem extension procedure](https://docs.aws.amazon.com/ebs/latest/userguide/recognize-expanded-volume-linux.html) requires a recovery snapshot, successful volume enlargement, then partition/filesystem extension. [Ubuntu's resize2fs documentation](https://manpages.ubuntu.com/manpages/jammy/man8/resize2fs.8.html) supports growing mounted ext4. The actual sequence here is root disk `/dev/xvda`, partition **1**, filesystem `/dev/xvda1`; never use xfs_growfs for this root and never resize the unrelated data device by substitution.

At only 31 MiB free, do not install tools/build packages or write a dump on root. growpart normally needs temporary files; its TMPDIR can use a separately approved private directory on the healthy data filesystem after verifying that mount. No temporary directory was created now. If the partition cannot be reread online, tools fail, or guest disk does not show the new size, stop rather than improvising fdisk/partition deletion or an unapproved reboot. Do not run e2fsck against the mounted root.

## 12. Capacity options and cost assumptions

| Option | Root size | Added provisioned capacity | Approximate resulting headroom at current use |
| --- | ---: | ---: | --- |
| A — minimal safe expansion | 16 GiB | 8 GiB | Roughly 7–8 GiB available after filesystem overhead/reservations |
| B — recommended | **30 GiB** | **22 GiB** | Roughly 20–21 GiB available after overhead/reservations |

Choose B for OS updates, native-module installs, retained runtimes, journal growth and operational recovery margin. Root cannot safely be sized at present usage plus a few hundred MiB. Production database/backup/release growth currently belongs to the **separate** 4 GiB volume, with about 2.79 GiB currently available; root expansion does not create space there. Review that volume independently before heavy future conversion/rollback work, without bundling an unmeasured data-volume change into the immediate root operation.

Cost is **conditional**, because the actual root type is unknown. Planning assumptions for Oregon, to confirm in AWS Pricing Calculator/account quote: gp2 $0.10/GiB-month, gp3 $0.08/GiB-month at included performance, snapshot standard $0.05/billed GiB-month. [AWS EBS pricing](https://aws.amazon.com/ebs/pricing/) describes regional provisioned storage and snapshot billing; these are estimates, not a verified volume-specific quote.

| Same-type increase | A: +8 GiB/month | B: +22 GiB/month |
| --- | ---: | ---: |
| If current gp2 | ~$0.80 | ~$2.20 |
| If current gp3, no extra performance | ~$0.64 | ~$1.76 |

For reference, assumed current 8 GiB storage is $0.80 gp2 or $0.64 gp3/month. Do not use this table for io1/io2 or other unverified types. Keeping type unchanged makes the immediate correction narrower; gp2-to-gp3 evaluation can follow separately. No compute increase is required by this capacity plan.

One initial 8 GiB root snapshot could cost up to roughly $0.40/month under the snapshot assumption; billing depends on actual stored blocks and later incremental retention, not simply used-file bytes. Additional data-volume recovery snapshots/backups, off-instance storage, transfer and tax are separate. Growing empty provisioned capacity does not imply that every new GiB is immediately billed as snapshot data. No snapshot or purchase was performed.

## 13. Operational risk and remediation comparison

**Urgency: high / address promptly before another deployment, OS update or historical conversion.** No present disk-related service failure, read-only root or inode exhaustion was detected in bounded checks. Active units do not certify full application/provider/database transaction health. Capacity could fail on a modest cache/log/package write; neither a measured exhaustion deadline nor a claim of financial corruption is supported.

| Option | Capacity effect | Risk / interruption | Complexity and reversibility | Recovery effect |
| --- | --- | --- | --- | --- |
| Expand verified root EBS/partition/ext4 | +8 or +22 GiB | Low relative to deleting runtime/data; online expected, not guaranteed | Moderate; EBS cannot simply shrink back. Recovery uses snapshot/replacement, not in-place undo. | Preserves all recovery artifacts; preferred immediate action |
| Move backups to verified off-instance S3/other storage | Up to ~409 MiB on **data**, zero root | Low/moderate after copy/checksum/restore verification; no DB restart normally | Moderate; retain originals until approved retention; reversible if copied safely | Improves durable recovery; not immediate root remedy |
| Move PostgreSQL data | Negligible root benefit: active data is already separate | High relative to need; usually requires planned DB downtime | High; careful copy/mount/auth/recovery changes | Unnecessary for this root incident |
| Journal retention/archive | Potentially several hundred MiB root | Retention/evidence risk; service restart generally unnecessary with reviewed tooling | Moderate; deletion is irreversible without archive | Archive first as required; separate approval |
| npm/node-gyp cache management | Up to ~0.8 GiB root before future rebuilds refill it | Lower financial risk, but can affect offline/reinstall/native dependency recovery | Low/moderate after verifying package manager idle; recover by download/rebuild | Supplemental relief, not a substitute for capacity |
| Retire old Node/Snap/header packages | Candidate upper bounds ~697 MiB old Node, 613 MiB headers, portion of 1.33 GiB Snap | Can break PM2/old release/SSM/boot/certificates if misidentified | Moderate/high; use package/runtime tools and dependency review, not rm | Must preserve actual rollback interpreter/dependencies |
| Backup retention | Subset of ~409 MiB data | Can remove the only useful recovery point | Moderate; policy/off-instance verification first | Not a root fix; no deletion now |
| Restart deleted-open holders | ~6 MiB root | Disruption disproportionate to benefit | Operational interruption; files cannot be recovered from references once closed | Not recommended as capacity response |

Do not delete spendcraft.old, node_modules from either release, active logs, WAL, database files, secrets or manifests. Do not adjust ext4 reserved-block settings merely to mask full usage. Optional cache/log cleanup should be a separate tightly reviewed operation after adequate capacity is restored, unless an explicitly authorized emergency requires a verified temporary measure.

## 14. Safeguards and future execution procedure — NOT EXECUTED

This is a conditional operator runbook, **not authorization**. It cannot be made executable against a concrete AWS volume until the identity/recovery gate above is satisfied. No fake volume or instance IDs are supplied.

1. Obtain explicit approval naming production instance, root volume ID, region, size (prefer 30 GiB), unchanged type, expected online procedure and snapshot/recovery plan. Reconfirm service health, writable root, exact disk/partition layout and adequate data-volume TMPDIR space. If active ENOSPC/database failure/read-only mount occurs, stop normal execution and use an incident recovery plan rather than blindly proceeding.
2. In authorized AWS console/CLI, verify instance attachment/device and volume type/encryption/modification status. Read-only CLI templates, with operator-reviewed real IDs/profile, are `aws ec2 describe-instances --region us-west-2 --instance-ids "$PRODUCTION_INSTANCE_ID"`, `aws ec2 describe-volumes --region us-west-2 --volume-ids "$ROOT_VOLUME_ID"`, and `aws ec2 describe-volumes-modifications --region us-west-2 --volume-ids "$ROOT_VOLUME_ID"`. Reject empty IDs or mismatched attachment. Do not install/configure AWS CLI credentials on the full production host merely to execute these from it.
3. Verify a recent recoverable logical database backup/off-instance procedure on the separate data filesystem; record completeness/restore evidence and exact installed release identity. Create a new root EBS snapshot only after separate authorization, record ID/time/completion and recovery procedure. If coordinated database/data snapshots are required, plan their consistency separately: a root-only snapshot does not back up PostgreSQL on xvdbb. Do not stop/freeze services without additional explicit authorization.
4. Approved snapshot command template: `aws ec2 create-snapshot --region us-west-2 --volume-id "$ROOT_VOLUME_ID" --description "SpendCraft pre-root-expansion recovery point"`; wait for that specific snapshot to complete using `aws ec2 wait snapshot-completed --region us-west-2 --snapshot-ids "$ROOT_SNAPSHOT_ID"`. Record tags/retention as approved; never overwrite the only recovery point.
5. After independent target recheck, approved size-only template: `aws ec2 modify-volume --region us-west-2 --volume-id "$ROOT_VOLUME_ID" --size 30` (use 16 only if Option A explicitly approved). Do not add type/IOPS/throughput changes. Monitor the exact volume with describe-volumes-modifications; proceed only when size is reflected and state is optimizing or completed, with no error. AWS documents those states in [volume modification monitoring](https://docs.aws.amazon.com/ebs/latest/userguide/monitoring-volume-modifications.html). If Elastic Volumes is unsupported or initialization/stop-start is required, stop for revised authorization.
6. On the verified host, recheck `findmnt /`, `lsblk`, and `sudo sfdisk --json /dev/xvda`. The disk must show new capacity while root remains partition 1; boot partitions/start sectors must match the preflight. Create a unique private temporary directory on the confirmed data mount only after authorization and point growpart TMPDIR there. Run `sudo env TMPDIR="$APPROVED_GROWPART_TMPDIR" growpart -N /dev/xvda 1` to review the proposed change. This dry-run is deferred too because it may create temporary files. If it proposes moving starts/other partitions or cannot operate safely, stop.
7. After review, approved partition command: `sudo env TMPDIR="$APPROVED_GROWPART_TMPDIR" growpart /dev/xvda 1`. Confirm root partition grew, start sector remained 227328 and EFI/BIOS partitions are unchanged. Do not use fdisk delete/recreate, format or force options. If kernel partition reread fails, do not auto-reboot.
8. Approved filesystem command, after target verification: `sudo resize2fs /dev/xvda1`. It grows the existing mounted ext4 filesystem to its enlarged partition. Never substitute `/dev/xvdbb`. No formatting, LVM or XFS command applies to this root.
9. Verify `df -hT /`, `df -B1 /`, `df -i /`, `findmnt /`, `lsblk`, and exact partition starts/types. Check systemd services, authenticated nonmutating application/report reads, current logs for disk/I/O/filesystem errors, and provider/queue health without creating financial test records. Record AWS modification completion and observed free capacity. Preserve outputs off root or in approved data-volume evidence directory without secrets.
10. Monitor at short intervals after growth, then daily; establish root/data space and inode alarms (e.g. warning 75–80%, critical 90%, plus absolute free-space thresholds and WAL/log rates). Configure finite log/cache/backup retention separately. Clean up only the newly created temporary directory under an explicitly approved path/identity check, not wildcard cleanup. No automated release rollback or database restore is part of successful expansion.

Failure recovery: EBS size cannot be reduced in place. If a root/filesystem issue occurs, stop further mutation and use the verified root snapshot to create/attach a replacement volume under a separately authorized recovery procedure, potentially requiring downtime. Preserve original volume and current data volume; root snapshot recovery must not blindly restore an older application/configuration against newer allocation data. Existing decimal-string rollback constraints remain relevant. Do not automatically restore a database backup or revert binaries.

## 15. Remaining blockers, evidence limits and verification

- Actual EBS volume ID/type/encryption, modification/Elastic Volumes eligibility and usable completed snapshots must be verified by the operator with authorized AWS access. This is the immediate execution blocker; no destructive target is inferred.
- Recent backup exists, but completion/recoverability/off-instance retention are unverified. No snapshot/backup was created or contents opened here.
- No exhaustive historical incident search, application HTTP smoke, live database metadata/replication query or all-user PM2/scheduler census occurred. Bounded error checks and active service units do not prove all application behavior healthy.
- Configuration checks do not prove every live PostgreSQL override; measured WAL is small and not implicated. Root-resident PostgreSQL directory is not approved for deletion merely because main configuration points elsewhere.
- Exact cleanup eligibility and future growth rates require separate retention/dependency review. Production urgency does not authorize disposal of recovery material.

Validation: reviewed current install/deploy/build/backup characteristics, PM2/log configuration and the staging/rollback/historical-readiness records; consulted AWS and Ubuntu primary documentation. Both Git whitespace checks passed. No production builds/tests were run. Only this new local document was created, unstaged; no index changes or unrelated work overwrites occurred.

No production files were deliberately deleted/modified by investigation commands, no AWS resources modified, no database records changed, no services stopped/restarted, no deployment or commit occurred. Normal OS audit/log/access-time bookkeeping and ongoing application activity are not frozen by read-only inspection. No real financial data or credentials were exposed.
