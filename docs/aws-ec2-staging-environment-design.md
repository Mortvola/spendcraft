# SpendCraft AWS EC2 staging environment design

## 1. Baseline, scope and recommendation

Prepared October 20, 2026 (America/Denver), at Git HEAD `1a71a3f9f0b79cfbf7a6be007239d738ba3f33ae`, branch `dollar-to-cents-2`. Tracked working tree and index were clean at entry. Existing unrelated untracked generated/editor/backup/key/scratch files were preserved; none was used as staging financial data or credentials.

**Design complete; provisioning requires separate approval.** Recommend an independent x86-64 Ubuntu 22.04 EC2 `t3a.medium` in production's region, `us-west-2`, with local PostgreSQL/Redis/Nginx, 4 GiB RAM, 30 GiB encrypted gp3 root and 30 GiB encrypted gp3 data volume. Start with on-demand operation and stop between rehearsals if desired. This is reusable staging, not local `spendcraft_test` or `spendcraft_sandbox`.

No resources, production configuration, application, database or services were changed. No PostgreSQL connection, financial-record query, deployment, rollback or historical conversion occurred. SSH commands were limited to OS/runtime/configuration and EC2 metadata reads. IMDSv2 token acquisition was used only to read instance identity/network metadata; no IAM credentials were fetched. AWS account API access was not established; no AWS CLI was available locally. Unknown control-plane facts remain explicit.

## 2. Production inventory established

Sources: current repository scripts/configuration; listed accounting/storage/rollback/readiness records; read-only authenticated SSH to `spendcraft.app`; allowlisted local file inspection; EC2 instance metadata. No environment dump, full process command lines, private keys or passwords were printed. Earlier deployment/readiness records remain historical observations, not fresh deployment proof.

| Item | Established production fact |
| --- | --- |
| AWS location | Oregon `us-west-2`, Availability Zone `us-west-2c` |
| EC2 / AMI | `t2.small`; AMI `ami-03f65b8614a860c29`, reported by instance identity metadata. AMI owner/launch provenance not verified. |
| OS / architecture | Ubuntu 22.04.5 LTS, x86_64; one vCPU; 1,963 MiB OS-reported memory; no swap |
| Root filesystem | 8 GiB device, ext4 root; `df` reports 7.6 GiB used, about 32 MiB available, 100% full at inspection |
| Separate data device | 4 GiB XFS mounted `/spendcraft-prod`; about 1.3 GiB used / 2.8 GiB free |
| EBS properties | Device sizes/filesystems verified; gp2/gp3 class, encryption, IOPS, throughput, volume IDs and snapshot policy not available from guest inspection |
| Node / npm | Node 24.15.0, npm 11.12.1, installed under `/home/ubuntu/.nvm/versions/node/v24.15.0` |
| PostgreSQL | Local running `postgresql@15-main`; installed server and client binaries 15.16 (`15.16-1.pgdg22.04+1`). This task did not SQL-query live server version. |
| PostgreSQL files | Config `/etc/postgresql/15/main/postgresql.conf`; data `/spendcraft-prod/postgresql/15/prod`; HBA `/etc/postgresql/15/main/pg_hba.conf` |
| Application DB configuration | `localhost:5433/budget`, role `ubuntu`; both `pg` and `pgLog` derive from the same PG_* variables. Ownership is not inferred from the role name. |
| Redis | Local running service; installed binary 8.6.1. App targets `127.0.0.1:6379`. Protected Redis config was unreadable; persistence/auth details remain unknown. |
| PM2 / runtime user | PM2 5.4.1; `pm2-ubuntu.service` running; deployment/PM2 user `ubuntu` |
| Application root | `/spendcraft-prod/server`, live `spendcraft`, prior `spendcraft.old`; external `spendcraft-env` |
| Application port | `HOST=localhost`, `PORT=3334`, `NODE_ENV=production` |
| Reverse proxy | Nginx 1.18.0 Ubuntu package, running; spendcraft.app configuration forwards to `127.0.0.1:3334$request_uri`; default site also enabled |
| HTTPS | Nginx 443 with Certbot-managed certificate paths under `/etc/letsencrypt/live/spendcraft.app`; port 80 also configured. No certificate key was read. Certbot renewal timer present. |
| Backup | Host-side `/spendcraft-prod/server/backup.sh` exists, uses pg_dump and gzip, refers to backups directory; no custom-format flag or restore command detected. Existing readiness record places backups in root/backups. Script not executed. |
| Logs | PM2 `/home/ubuntu/.pm2/logs/`; systemd journal/rsyslog running; Nginx distribution defaults unless explicitly overridden. Effective Nginx/Postgres log paths/retention need confirmation. |
| Relevant services | PostgreSQL 15, Redis, Nginx, PM2, SSH, cron, chrony, journald/rsyslog, unattended-upgrades, SSM agent |
| Timers | Certbot renewal, logrotate, apt update/upgrade, filesystem trimming and standard OS timers. No complete all-user financial scheduler inventory was established. |

**Operational finding:** production root is effectively full. This is a separate production capacity concern, not authorization to delete logs, resize volumes or repair production. Do not clone this disk constraint into staging. Builds/install failures and normal database/log writes can be affected by inadequate space.

### AWS infrastructure observations and unknowns

Metadata confirmed a VPC, subnet and security-group attachment and a public IPv4 address. Resource IDs were inspected but omitted here because staging should not reuse those resources and the IDs are not required to understand the design. Authorized operators can locate them from the production instance in the EC2 console. Metadata reported no attached IAM instance profile, despite an installed/running SSM agent; SSM functionality must not be assumed.

Not established: security-group rules, routing/NACLs, VPC peering, Elastic IP allocation versus ephemeral public IP, DNS provider/record configuration, load balancer association, CloudWatch agents/log groups/alarms, detailed monitoring, EBS encryption/class/snapshots, AWS Backup policies and retention. Direct Nginx on the instance is proven; absence of an upstream load balancer/CDN is not proven. No control-plane inspection credentials were requested or inferred.

Before provisioning, collect a read-only console/authorized CLI inventory of instance networking/storage, security-group rules, attached profile, DNS target chain, load balancer target groups, CloudWatch configuration and snapshot/backup policies. Keep account IDs, full ARNs, public IPs and keys out of general documentation unless needed for an approved target manifest. This information improves parity; it is not a reason to postpone writing the isolated design.

Database/schema owners, extensions, collation/locale, timezone, authentication rules, connection limits and live migration ledger were not queried. A future separately authorized catalog-only check can retrieve these without financial tables. Do not copy a production dump merely to discover them. `ReportController` uses crosstab; investigate whether tablefunc is installed/required rather than assuming a fresh database supplies it. Historical migration dependencies also require a real empty-database rehearsal.

## 3. Proposed EC2 and operating system

| Component | Proposal |
| --- | --- |
| Region / AZ | `us-west-2`; any suitable AZ with capacity; same AZ is unnecessary for parity |
| Instance | `t3a.medium`: two vCPUs, 4 GiB RAM, AMD x86-64 |
| OS | Fresh official Canonical Ubuntu 22.04 LTS x86-64 AMI; record exact verified AMI ID/owner at provisioning. Do not snapshot/clone production. |
| Root | 30 GiB encrypted gp3, ext4 |
| Data | 30 GiB encrypted gp3, XFS mounted `/spendcraft-staging`; mount by UUID and fail closed if missing |
| Baseline storage performance | Default gp3 3,000 IOPS / 125 MiB/s; no paid performance increase initially |
| Runtime user | Dedicated staging `ubuntu` on this separate host; no production SSH key/credentials copied |
| Database / Redis | Same host, loopback only; PostgreSQL 15 and Redis 8.6.1 where packages are available |
| Reverse proxy | Nginx matching the production 1.18 Ubuntu package series; staging-only vhost/TLS if browser tests need it |

Production is smaller, but 2 GiB is restrictive for simultaneous Node builds, PostgreSQL and retained release operations. Four GiB gives a practical starting point; it is not a load-test capacity promise. Prefer building artifacts on the development/build host as current deploy.sh does, while retaining ability to rebuild/recover on staging. Temporarily use 8 GiB if measured build memory requires it; approve resize separately. Burstable CPU credit exhaustion can slow repeated builds, restores and large SQL work. Monitor credit balance; choose Standard versus Unlimited deliberately to avoid unexpected credit charges. Do not use Spot for interrupted-maintenance correctness baselines.

Match Node 24.15.0, npm 11.12.1, PostgreSQL 15.16 client/server and PM2 5.4.1 initially. PostgreSQL minor package availability/security may require a documented newer 15.x; do not silently change major versions. PM2 5.4.1 is especially important because rollback verifies exact reviewed PM2 implementation hashes. Match Redis 8.6.1 and required native library/toolchain support (`pg`, optional pg-native/libpq, argon2, archive utilities) as actually required by lockfile/install. Use the same lockfile and npm ci options. Preserve runtime architecture; ARM would require a separate compatibility exercise.

## 4. Network, AWS access and isolation

Preferred separation is a dedicated staging AWS account if one already exists, otherwise a dedicated staging VPC with no production peering/transit routes. Do not reuse production's security group or permit production SG ingress from staging. One public subnet and an internet gateway avoid a dedicated NAT gateway's fixed cost. Dedicated staging IAM role grants only reviewed Session Manager and staging-specific logging/backup access, never production Secrets Manager/S3/EC2 administration. Require IMDSv2 and appropriate hop limit. Tags should include Environment=staging, Application=SpendCraft, owner and cost allocation.

Preferred operator access is SSM Session Manager: it does not require inbound SSH, but needs a managed-node role/agent and outbound service connectivity. Production's agent installation alone does not establish those prerequisites. AWS documents the no-inbound model in [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html). A public address is not intrinsically needed for SSM/browser tunneling if private connectivity already exists; do not introduce a costly NAT/endpoints/VPN merely to claim no public IP. Baseline estimate uses one public IPv4 for outbound access, with no public application ingress. Optional SSH fallback is restricted to explicit administrator /32 or VPN ranges, with a new staging-only key.

Do not expose PostgreSQL 5433, Redis 6379 or Node 3334 on the security group. Bind all three to loopback. Use SSM port forwarding for initial browser rehearsals. If shared browser access is needed, provision a distinct staging hostname and staging-only certificate, restrict 443 to administrator/VPN ranges and add an access gate; use HTTP-01 only if explicitly accepting limited port 80 access, otherwise use DNS-based certificate validation. No production webhook DNS/URLs/certificates. No ALB is required for the observed single-host Nginx architecture.

Outbound controls must distinguish packages/SSM/backup destinations from application side effects. Security groups cannot filter HTTPS by hostname and do not express deny rules. A future reviewed host firewall/egress proxy policy must deny production/private networks and block provider/SMTP/APNs/web-push destinations for application processes, while allowing local services and approved management/package destinations. Dedicated network separation plus separate credentials is required; an empty Plaid secret alone is not a full egress fence. Include IPv6 in the policy or leave it unconfigured. Verify attempted provider access cannot leave the host before enabling workers.

## 5. PostgreSQL and Redis configuration

Create isolated database **`spendcraft_staging`**, application role `spendcraft_staging_app`, separately controlled owner/migration role, and optionally a read-only audit role. Generate unique passwords; grant application access only to this database/schema. Runtime role is not superuser. Migration execution uses an explicitly approved staging role/env, not production role credentials. Never create aliases that make staging appear to be `budget`, `spendcraft_test` or `spendcraft_sandbox`.

Use loopback port **5433** to exercise the actual port handling, PostgreSQL 15 data under `/spendcraft-staging/postgresql/15/staging`, and a dedicated database cluster. Set/record locale/timezone after collecting required production parity facts. Do not guess owner/extension parity. Install only reviewed required extensions; migrations via Adonis/Lucid `node ace migration:status` and `node ace migration:run` are exercised only after later authorization. A failed fresh migration is a reproducible release issue, not permission to import production schema/data or silently fake migration records.

Both `pg` and `pgLog` must resolve from the same staging `.env` PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DB_NAME. Redis and BullMQ are separately configured (`REDIS_*` versus `BULLMQ_REDIS_*`); explicitly target the staging loopback service in both, not merely Redis sessions. Match the application's hardcoded db 0/key prefix on this isolated Redis instance. Use staging-only authentication and record persistence/restore policy; never share queues with production.

## 6. Directory and configuration layout

```text
/spendcraft-staging/
  postgresql/15/staging/       # dedicated PostgreSQL cluster data
  server/
    spendcraft/               # current installed artifact
    spendcraft.old/           # prior installed artifact
    spendcraft.new/           # installer extraction/preparation
    spendcraft-env            # staging-only environment; mode 0600
    .npmrc                    # staging read-only registry credential, if required
    PushNotificationKey.p8    # independent nonproduction test key; never production's
    spendcraft/installer/backup.sh  # versioned environment-aware backup wrapper
    backups/                  # installer logical dumps
    releases/deployment-.../  # paired release manifests and deployment record
    maintenance/              # reviewed operator tools/plans outside swapped releases
    rollback-output-.../      # unique private output/journals as script creates them
    logs/                     # staging host/rehearsal evidence; no secrets
```

Actual rollback output naming follows its script arguments; the layout above reserves space, not an invented CLI. Scripts must generate private unique output directories, print locations before DB work, preserve earlier outputs and read explicit .env connection configuration. Match symlinks `.env -> ../spendcraft-env`, `.npmrc -> ../.npmrc`, push-key link and release names. Do not copy production env, tokens, Apple keys, VAPID keys, Redis persistence, backups or manifests. Generate APP_KEY and cleanup encryption keys separately. Use `NODE_ENV=production` for build/runtime parity; deployment target identity `staging` is a distinct operational concept, not a currently supported NODE_ENV value.

Keep PM2 state in an explicitly distinct canonical staging home (proposed `/home/ubuntu/.pm2-spendcraft-staging`), with systemd configured to use it. Never rely on shell default PM2_HOME. Preserve identities across release renames with shared releaseManifest/captureDeploymentManifests tooling. Capacity must accommodate live + old + new artifacts, rollback staging copy/retained release, at least two logical dumps, restored DB and logs. Refuse maintenance when the measured space requirement plus margin is unavailable. Alert on root/data utilization rather than reproducing production's full root disk.

## 7. PM2, jobs and restart semantics

Production saved definitions show:

| Name | Command / cwd | Behavior |
| --- | --- | --- |
| prod-server | live `bin/server.js`, live release cwd, node | fork/autorestart; nightly cron `0 0 * * *` |
| queue | root `queue.sh`, root cwd, bash | fork/autorestart; wrapper starts `queue:listener`, potentially a child Node process |
| plaid-cleanup | live `ace.js plaid:cleanup-listener`, live cwd, Node 24.15.0 | fork/autorestart; kill timeout 30 seconds, restart delay 5 seconds |

Those are saved definitions, not a new exhaustive live process census. Earlier readiness evidence observed their live processes. Current running `pm2-ubuntu.service` confirms daemon service presence, not worker financial health. User crontab retrieval was unsuccessful; no claim that all external jobs are absent. Root/other-user cron, manual commands, other hosts and reboot definitions remain a required maintenance inventory.

Propose `staging-server`, `staging-queue`, `staging-plaid-cleanup` with identical relative entry points, fork behavior, timeout/restart-delay and explicitly pinned interpreter, all in the isolated PM2 home. Rehearse nightly restart then disable live AND saved cron restart for conversion/rollback. Verify descendants stop; do not mistake stopping a shell wrapper for stopping Node. Flush/drain synthetic jobs before shutdown and verify no other DB sessions/writers. Preserve and verify both PM2 dump and fallback dump; test reboot recovery only on staging under separate approval.

Current installer hardcodes production process names; rollback hardcodes production/sandbox names. They need one reviewed environment configuration interface before these proposed staging names work. Do not maintain forked staging copies or disguise staging as production. An alternative is identical process names on a wholly isolated host, but the target/environment/rollback checks still need explicit staging support and operator review.

## 8. Existing installation/deployment flow and required adaptations

Repository flow:

1. `deploy.sh` calls `build.sh`; server build includes Vite assets. Build source provenance is written to `build/release-source.json`.
2. It zips build, appends base64 payload to the template `installer/install.sh0`, creates executable installer, then scps it to `ubuntu@${SPENDCRAFT_SERVER}` using a hardcoded local SSH-key path. Packaging assumes development-host `base64 -i`; do not assume portable Linux build-host syntax without checking.
3. Installer requires existing SPENDCRAFT_ROOT and an explicit DEPLOY confirmation. It extracts payload, stops named existing PM2 applications, prepares spendcraft.new and external symlinks, runs `npm ci --omit dev --omit optional` on the target.
4. The original inspected installer invoked host-side `./backup.sh`. The current installer invokes its versioned `spendcraft.new/installer/backup.sh` payload instead. It shows migration status, requires MIGRATE confirmation, invokes Lucid migration command (with its production consent behavior), then independently asks SEED/SKIP/ABORT.
5. It captures paired manifests before deleting the old rollback target; removes existing spendcraft.old, renames current to old, new to current. These are directory renames, not a source rebuild in place.
6. RESUME confirmation precedes PM2 restart/start and saved definitions. Logs are shown; external maintenance must be manually removed only after health verification. `set -e`/pipefail stop on errors, but there is no general automatic restoration of directories/DB or complete child/scheduler fence.

The same relative directory swap works on staging. Installer does not create the initial root, PostgreSQL, Redis, nginx, external env/registry/push-key files or backup wrapper. Those are explicit provisioning prerequisites. Root and scp target are configurable; SSH key/user, PM2 names, backup wrapper targeting and prompt language need reviewed configuration improvements. Add explicit stage/host/DB/root identity checks before process stops, backup, migrations, seeding and swap. Preserve current consent gates. Do not run installer as rollback: it deletes the prior old directory and can run migrations/seeders.

Use a staging-only environment-aware backup wrapper (eventually shared/versioned mechanism) with explicit target verification; production host wrapper references pg_dump/backups/gzip but does not appear to load `.env`, and its exact target/authentication/rotation semantics were not fully reviewed. Do not copy it unreviewed. Initially choose SKIP seeding unless the seed set has been reviewed against an empty synthetic database; ABORT must leave a documented recoverable state.

`/health` is commented out in routes. Existing procedure is application root/frontend/authenticated reads plus worker startup/log checks; PM2 online alone is insufficient. Define expected responses in a future rehearsal harness rather than inventing a functioning /health endpoint. No installer or configuration change was made now.

## 9. Rollback compatibility and requirements

The actual release-specific `scripts/rollbackTransactionCategoryStorage.mjs` verifies complete current/previous manifests, reviewed difference fingerprint and database-config hash, external configuration symlinks, exact PM2 definitions/runtime hashes, target connection and no other writers/sessions. It fences processes, preserves stopped reboot dumps, creates/verifies a fresh custom-format recovery dump, copies the previous release before conversion, atomically reverses supported string amount leaves with nonfinancial snapshots, swaps directories while retaining copies, then separately confirms restart and checks health. It journals/fsyncs phases; failures do not automatically restore an old DB or restart an incompatible release. Operator tools must live outside both swapped directories.

**Current hard blockers to executing it against this staging design:**

- validatePlan allows only environment production or sandbox; sandbox requires database `spendcraft_sandbox`, sandbox-prefixed process names and excludes specific production paths/PM2 homes. A legitimate `spendcraft_staging` target cannot currently use sandbox mode.
- Reclassifying staging as production to evade those checks is not an acceptable workaround. Propose an explicit staging mode with strict independent host/EC2/DB/root/PM2 identity and disjoint target checks. Existing production and sandbox protections must remain tested and unchanged.
- `verifyIdentity` still compares `inet_server_addr()::text`/client text with bare addresses. Readiness characterized `/32` rejection; fix using a reviewed canonical-address query/comparison and add IPv4/IPv6 tests before rehearsal. Do not strip arbitrary text or loosen identity checks.
- PM2 5.4.1 exact-source verification, external writer fencing and no-schema-differences checks must remain. Another required representation reversal/schema difference stops execution rather than expanding the release-specific script.

These require separately authorized implementation, not bypasses or changes in this design task. The prior operator-reported sandbox rehearsal is useful historical evidence but does not establish future staging-mode acceptance.

The previous installed artifact is not necessarily the previous Git commit. Obtain an identified, secret-free known numeric-compatible package/source baseline and review actual manifest differences. Never rsync production's installed directory wholesale: it contains environment/key links and dependencies/provenance that need deliberate handling. Install the baseline package fresh on staging, then deploy the target with the real installer so the baseline naturally becomes spendcraft.old. A package created from an arbitrary parent commit is not adequate proof of rollback compatibility.

## 10. Synthetic data and external integration isolation

Seed only fictional identities and generated amounts. Do not use production database rows, dumps, provider IDs, user emails, push endpoints, app/cleanup keys or audit artifacts as fixtures. Use two Budgets/users with distinct credentials to exercise tenant security and different-Budget independence, Groups/Categories/Pool, offline Institutions, transaction- and balance-tracked Accounts and Statements.

Fixture families:

- Ordinary 0/5 and opening 4 with one valid in-Budget AccountTransaction and same-sign individually rounded split totals; signed amounts, duplicates, Unassigned, pending/deleted, pre/equal/post-startDate.
- Funding 2 with explicit scoped Pool and non-Pool+Pool cents=0, fixed/percentage/goal/mixed rules, transfers/net/baseAmount distinction and replacement immutable date.
- Rebalance 3 with checked cent sum=0, ordered duplicates and metadata.
- Numeric-only historical arrays, string-only new arrays and mixed arrays. Create raw historical fixtures only with a separately reviewed staging-only fixture tool; normal current writers encode strings. Never weaken production validation to create fixtures.
- Synthetic deleted empty ordinary/funding allocations and deleted funding +9-cent discrepancies that remain intentionally unrepaired. Use synthetic IDs, not copied production records. Active ordinary/funding/rebalance/opening rows conserve. Add invalid/overflow fixtures only in an isolated rejection test phase, not the normal deploy dataset.
- Synthetic provider-labelled Transactions for OFX/Plaid read/reimport tests using local mocks or separately approved provider sandbox credentials; no production bank access. Compare financial and metadata snapshots before/after every conversion and rollback.

Isolation controls are layered:

| Integration | Staging treatment |
| --- | --- |
| Plaid | No production credentials/tokens/items; default no remote activity. Separate sandbox evaluation only with approved sandbox credentials. SDK config recognizes sandbox/production, not a general disable switch. Egress denial and empty synthetic queues/recovery ledger are required until verified test adapters exist. |
| OFX | Use fictional local OFX upload files; no downloaded real statements or scheduled external imports. |
| Webhooks / sync | No production URL registrations or incoming callbacks; restrict/block webhook/sync ingress by reviewed proxy/access policy except explicit mocked tests. Stop external schedules. |
| Mail | SMTP variables target a staging-local capture sink, never SES/real SMTP; fictional test recipients. |
| Apple/web push | Independent generated test keys and no real device/browser endpoints; block external delivery. APNs code reads PushNotificationKey.p8 on demand and contains fixed Apple identifiers; do not assume changing a key fully mocks delivery. Separate approved no-op/test transport may be required for positive send-flow tests. |
| Redis/BullMQ | Separate local Redis, explicit app and BullMQ target, empty queues; no restored production persistence. |
| Registry/other services | Least-privilege staging-only read credentials where needed; inspect locked dependencies and build scripts before granting network access. |

There is no established universal SIDE_EFFECTS_DISABLED flag in current inspected source. Do not invent one in deployment instructions. Verify ordinary boot/login/manual flows with unused integrations, valid independent local test configuration and egress enforcement first. Any required mock/no-op runtime transport is separate scoped implementation. Installer creates three process definitions; worker readiness with an empty synthetic queue is distinct from permission to contact providers.

Loans and the entire transaction_categories architecture remain deprecated and excluded from monetary migration fixtures/acceptance. Schema migrations may retain historical tables; do not remove them as part of staging setup.

## 11. Backup, restore and recovery design

Rehearse both logical backups and optional encrypted EBS snapshots, using synthetic data only:

- Logical database backup: reviewed wrapper verifies target before pg_dump; unique timestamped output, mode 0600, explicit staging .env target and checksum/size/completion record. Prefer custom format for new recovery tooling because pg_restore supports verification/listing and controlled restores. Exercise the installer's existing plain SQL/gzip path separately for actual procedural parity, with psql restore and fail-on-error behavior. Do not treat a plain dump as a pg_restore archive.
- Verify archive contents (`pg_restore --list`, full archive read), then actually restore to a separately identified disposable staging recovery DB/cluster with explicit authorization. Verify counts, schema, synthetic financial hashes and API reads. Archive readability alone is not restore proof. Inventory roles/extensions and role-creation procedure, since a single database dump does not supply all cluster prerequisites.
- EBS snapshots: optional pre-rehearsal host/data recovery checkpoint, taken only after writers/DB are quiesced or with a reviewed consistency procedure. Record coordinated volume identities/timestamps. Live snapshots are not automatically application-consistent and do not replace logical restore testing.
- Retain last seven daily synthetic logical backups and four weekly recovery points initially; preserve any active rehearsal's pre-operation point until acceptance. Stage-only encrypted object storage prefix/bucket for off-host copies; minimal staging-only IAM. Never restore over production. Disk requirement is measured before execution; retention cleanup is independently guarded, never generic rm wildcards.
- Keep complete current/previous package artifacts, manifests, reviewed configuration references and unique operation journals. Do not put secrets/production evidence into Git. Logs have finite retention; configure size/disk alerts on staging before sustained use.

## 12. Deployment and rollback rehearsal sequence

Each step below is future work requiring its relevant authorization:

1. Verify staging EC2 identity, explicit host/root/database/roles/PM2 home and outbound isolation. Prove production endpoints/DB networks are not usable from the app context without attempting any financial mutation.
2. Perform an empty-host prerequisite installation and fresh known-baseline installer run. Review schema migrations and seed decisions; record failure or success without fake schema ledgers. Establish fictional data in the baseline's supported format.
3. Capture baseline manifests and financial/metadata fingerprints, create and restore-test a staging recovery point. Deploy new artifact with the real installer and verify baseline becomes spendcraft.old with identical manifest identity.
4. Confirm PM2 web/queue/cleanup startup and reboot recovery in staging; inspect child processes. Validate no remote provider/email/push side effects. Test explicit SEED/SKIP/ABORT consent paths on disposable synthetic instances/databases where necessary.
5. Perform synthetic new writes through APIs: raw category JSON is two-decimal strings, API remains numeric; old numeric and mixed allocations read without normalization. Cover ordinary, provider-mocked, funding/rebalance replacement and opening/startDate lifecycles; run approved reports/security tests.
6. Stop/fence all writers, disable scheduled restart in saved/live definitions, back up again, then rehearse separately implemented/reviewed historical conversion. That forward conversion tool is not supplied by the present design. Verify only amount leaves change, duplicates/metadata/deleted exceptions persist, all unrelated amounts/balances and conservation outcomes remain unchanged.
7. Rehearse actual rollback dry-run with explicit staging plan, then separately authorize execution. Verify rollback numeric representation, cent meanings, complete prior artifact restoration, preserved postdeployment synthetic activity, no balance recalculation and healthy old-version API/client/report reads. Do not automatically reverse newer schema changes.
8. Inject controlled failure at installer pre-swap, between renames, npm failure, seed ABORT, insufficient disk, rollback before/during SQL conversion, verification failure, postconversion swap failure and restart failure. Verify DB atomic rollback, stopped writers, preserved release copies, durable journals and explicit recovery instructions. Never emulate power loss on production.
9. After acceptance, restore staging to a known synthetic baseline using the rehearsed procedure and retain report/artifacts. Review cost and disk use. Do not leave deliberately malformed active fixtures or external integrations enabled.

## 13. Target safeguards to implement separately

Create one explicit reviewed target descriptor for environment=staging: expected AWS account/region/instance identity and tags, exact SSH/SSM host, canonical root, explicit .env path, PG target/user/server/peer/port, PM2 home/names, backup/journal paths and release identities. Confirm it from independent live identity rather than trusting environment strings alone. Do not accept production host/IP/root/database/provider endpoints or a symlink resolving into them. Never default to production when an argument is missing.

Require destructive confirmation naming staging DB and release, and checks immediately before setup, fixture writes, migrations, restore, conversion, cleanup, directory swap and process changes. Configured/live pg/pgLog and actual execution connection must agree. Keep a strict allowlist of stage process definitions and external jobs; no pm2 stop all. No generic force option. Preserve existing production protections and require regression tests that a staging plan cannot select production. Do not hardcode ephemeral account IDs in prose; bind actual approved identities at provisioning.

Budget remains the sole explicit application-level serialization lock. Offline conversion/rollback fences all writers instead of introducing new explicit data-row/advisory locks. Existing deprecated paths and financial semantics are not redesigned.

## 14. Estimated monthly cost and lifecycle

Planning estimate in USD, 730 hours/month, Linux on-demand, no free-tier/credits/discount assumptions. Verify the exact Oregon quote in AWS Pricing Calculator before provisioning; current AWS T3a public table explicitly quotes Northern Virginia, so its $0.0376/hour is used here as a **budget assumption, not a confirmed us-west-2 quote**. [AWS T3a specifications/pricing](https://aws.amazon.com/ec2/instance-types/t3/) establish 2 vCPU/4 GiB and the reference rate.

| Component | Assumption | Approximate monthly amount |
| --- | --- | ---: |
| t3a.medium | 730 × assumed $0.0376/hour | $27.45 |
| Two gp3 volumes | 60 GiB × assumed $0.08/GiB-month; baseline IOPS/throughput | $4.80 |
| EBS snapshots | Example 20 GiB billed incremental stored data × assumed $0.05/GiB-month | $1.00 |
| One public IPv4 | 730 × $0.005/hour | $3.65 |
| Logs, synthetic dump storage, DNS and modest transfer | Workload/retention allowance, not a quoted bundle | $2–8 |
| **Indicative total** | No ALB, NAT gateway, paid VPC endpoints or RDS | **about $39–45/month; budget $40–50** |

[AWS EBS pricing](https://aws.amazon.com/ebs/pricing/) describes provisioned-size billing and gp3's included performance; rates depend on region and stored snapshot data. [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/) lists $0.005/hour for both in-use and idle public IPv4. Snapshot effective size is not the sum of nominal volume sizes; estimate above is an assumption. Exact S3, CloudWatch, DNS/transfer, tax and CPU surplus charges are excluded from fixed line items and require usage estimates. Optional new Route53 hosted zone, retained Elastic IP, NAT/endpoints or ALB add recurring costs; none is required in this baseline. High logging or transfer can exceed the allowance.

At 100 running hours/month, compute is roughly $3.76 under the same rate assumption; storage/snapshots remain charged while stopped. Budget roughly $12–20/month with small logs and a retained IPv4, depending on actual retained storage/IP choices. A retained Elastic IP still incurs idle charges; releasing it loses address stability and may require DNS updates. Stopping does not delete EBS/snapshots. Scheduling start/stop is a later authorized action, not performed here. Use budgets/tags/retention and review actual bills; reserved capacity is premature for a rehearsal host.

## 15. Later authorized provisioning plan

1. Approve account, region, instance/storage budget, SSM versus restricted SSH/browser access, staging hostname and runtime/package parity. Complete missing read-only control-plane/catalog inventory. Choose separately reviewed scripts' staging-mode changes; do not provision into production's SG/subnet by convenience.
2. Create dedicated network/security/IAM configuration and encrypted volumes from a verified official Ubuntu image, attach no production roles/secrets. Enforce IMDSv2; record the approved host target manifest. Install/configure SSM or new administrator key.
3. Install pinned runtimes/tools, PostgreSQL 15, Redis, Nginx, PM2 and native dependencies. Configure mounts/ownership, time sync, logs/disk alarms and staging-only systemd/PM2 home. Verify root/data free capacity.
4. Create isolated roles/database/cluster, local SMTP capture service and external egress controls. Generate keys/env/registry read credentials. Verify pg/pgLog/Redis/BullMQ targets without leaking credentials. Configure proxy/TLS only for staging access.
5. Install reviewed shared installer/backup/rollback target safeguards and stage support once separately approved/tested. Keep exact release-specific rollback protections, corrected address comparison and explicit confirmations. No copied bypass scripts.
6. Build/package an identified baseline artifact outside production; transfer only source/artifact and independent configuration. Perform fresh install with migration decisions reviewed, initialize synthetic data and capture identities.
7. Configure intended PM2 definitions/startup/schedules, inspect children and side-effect isolation; create/rehearse backups/restores before deploying a new release.
8. Run the complete deployment/conversion/rollback/failure rehearsal above, retaining unique evidence and comparing all synthetic financial/nonfinancial invariants. Document acceptance and leave staging in a known safe state.

## 16. Acceptance criteria and remaining decisions

Acceptance requires demonstrable isolation, installed/runtime version records, real fresh install and upgrade with exact old-release preservation, schema/migration compatibility, verified backup restore, numeric/string/mixed API/storage behavior, approved conversion/rollback nonrepair, stopped-writer/child/reboot safety, target mismatch rejection, expected health and no real provider/notification activity. Test failure recovery rather than treating a green PM2 status as acceptance. No production data/secrets may appear in fixture or recovery artifacts.

Decisions still needed: separate AWS account versus dedicated VPC; SSM/private browser versus restricted public staging HTTPS; exact AMI and verified regional price; on-demand schedule; registry access; previous baseline artifact source; approved staging-mode/target guard implementation; whether positive integration tests need a mock/no-op provider transport or separately approved Plaid sandbox; backup off-host destination/retention and ownership of ongoing operations. None reopens approved monetary rounding, deleted-record nonrepair, report authority or Budget serialization.

Unknown production EBS/network/ownership/extension facts require collection before declaring full parity. They do not prevent this architecture proposal. Actual rollback execution is blocked until explicit staging support and the identity guard correction are tested. Historical forward conversion remains a separate implementation/authorization step. Full root disk is a separately reported production operational concern.

## 17. Verification and changed files

Inspected AGENTS.md, current install/build/deploy/rollback/manifest tools, database/Redis/mail/Plaid/push configuration, relevant commands/routes/migrations and requested accounting/storage/readiness records. Read-only SSH established facts above; protected/unavailable values were left unknown rather than bypassed. AWS public primary documentation was consulted for cost/specification/SSM claims; no account API or provisioning command ran. Bash syntax validation of repository install.sh0/deploy.sh/build.sh and both Git whitespace checks passed. No runtime tests/builds/migrations/database setup were appropriate for a documentation-only change.

Only `docs/aws-ec2-staging-environment-design.md` was created, unstaged. Existing work/index and unrelated untracked files remain intact. No AWS resource was created/modified, no production application/database changed, no production process was stopped/restarted, no real financial data or secrets were copied, no deployment/rollback/conversion occurred and no commit was created.
