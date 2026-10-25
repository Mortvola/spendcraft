# Staging catalog-based restore comparison

Prepared October 25, 2026. Source HEAD: `2429cd32250430d5238ea6d79a066096ccbe8c87`; branch `dollar-to-cents-2`. This preparation has made no PostgreSQL connection. Backup recoverability remains unverified.

## Evidence and comparison boundary

The preceding authorized attempt is recorded under `script-output/restore-cast-reverification-tq1b8ujj/`. Corrected SQL verification exited 0, including the 51 constraints. The subsequent independent dump verifier exited with `restored_tables_mismatch`. Its exact `CREATE TABLE` comparison does not establish which attribute differs; no new live observations are asserted here.

Pinned backup: `/spendcraft_staging/server/backups/database-backup-MeTelm/backup.sql`, 61,112 bytes, SHA-256 `878e49a903cf761b09db1423a5993ec39f9101d6317fcedb4916e26c0f32385a`. Recorded creation interval: October 23, 2026, 14:06:01.508–14:06:01.727 UTC. It contains 27 tables; COPY evidence records 100 migration rows, one migration-version row and three tax-category rows; other tables were empty. This is an old staging snapshot, not a description of current live data.

`tablefunc` was installed after this backup in live staging and separately before the temporary restore. It is a documented external prerequisite rather than evidence that the SQL dump installed it. No other post-backup schema change is established by available evidence. Migration differences must remain unresolved until independently explained.

## Implementation and invocation

- `scripts/stagingRestoreCatalogQueries.mjs`: PostgreSQL 15 SELECT-only catalog queries.
- `scripts/compareStagingRestoreCatalogs.mjs`: guarded collector and offline comparison.
- `scripts/compareStagingRestoreCatalogs.test.mjs`: representative catalog, identity and read-only regressions.
- `scripts/fixtures/stagingRestoreBackupDataBaseline.json`: backup-time count evidence copied from the original independent restore inventory.
- Existing `prepareStagingRestoreVerification.mjs` and its reviewed complete-expression cast-pair fixture remain in use.

Future collection requires fresh, explicit read-only staging authorization. Copy these scripts and their imported preparer/fixtures together into a new private evidence directory, preserving relative paths. Do not overwrite installed application files. From `/spendcraft_staging/server`, invoke the explicit Node executable against that evidence copy:

```sh
cd /spendcraft_staging/server
/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node \
  "$REVIEWED_EVIDENCE_DIRECTORY/scripts/compareStagingRestoreCatalogs.mjs" \
  --target staging --collect
```

`REVIEWED_EVIDENCE_DIRECTORY` must identify the newly reviewed evidence copy, not the installed application or an older helper. No file transfer or command above was executed in this implementation task. The collector creates and prints an absolute unique `script-output/catalog-comparison-*` path before database work. It does not accept arbitrary database names, production targets or cleanup arguments.

To compare already collected private snapshots offline:

```sh
node scripts/compareStagingRestoreCatalogs.mjs --target staging \
  --live /absolute/path/live.json --restored /absolute/path/restored.json
```

Outputs: `host.json`, `backup-identity.json`, `live.json`, `restored.json`, `comparison.json`, `summary.txt`; on failure, `failure.json`. Offline mode produces comparison/summary only. Exact expression/body differences are private evidence; no financial row values or credentials are printed. Counts and migration names are recorded. Preserve earlier runs.

## Identity and snapshot safeguards

Collection first verifies canonical root `/spendcraft_staging/server` and IMDSv2 account `011038405378`, region `us-west-2`, instance `i-0b24684c411b4b829`. It reads the existing shared `.env` settings and requires host localhost, port 5432, user ubuntu, live database spendcraft and the staging APP_URL. The existing reviewed compiled database-config SHA verifies pg/pgLog map to these settings. It verifies backup bytes and hash before connecting.

Separate connections capture `spendcraft` and `spendcraft_restore_verify_20261024_2429cd_huh_tnmi`; the latter must have OID 17260. Each connection independently checks current/session user, database, actual server/peer loopback addresses, socket address/port and read-only/repeatable-read state. Only the temporary identity OID is compared; semantic schema identities never compare object OIDs across databases. Host identity is repeated before the second connection.

Each uses `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, default read-only sessions, a five-second statement timeout, ten-second idle-transaction timeout and thirty-second checked collection budget. Queries return at most 10,001 rows; reaching 10,000 or 16 MiB per result fails closed. Catalog/data counts use separate database-local snapshots, not cross-database joins or a claimed common instant. Connections close on failure; there are no destructive SQL operations, service controls, cleanup or retries.

## Catalog coverage

| Area | Compared properties |
|---|---|
| Schemas | Every non-internal schema, owner, ACL; unexpected user schemas remain visible |
| Relations | Name/schema/kind, persistence, owner/ACL, storage/access method/tablespace, relation options, RLS and replica identity |
| Columns | Name/order, type namespace/name, raw type modifier and formatted type (including numeric precision/scale), nullability, identity/generated flags, default/generated expressions, collation, storage/compression, options/ACL/statistics |
| Constraints | Identity/type, ordered local and referenced columns, referenced relation, FK update/delete/match actions, deferrability/deferred/validation/inheritance flags, complete definition including exclusions |
| Indexes | Identity/table, method, key and INCLUDE positions, expression/predicate, opclasses/collations, sort and NULL-order option bits, uniqueness/NULL-distinctness, primary/exclusion/valid/ready/live/immediate flags, relation options |
| Sequences | Type, start/increment/min/max/cache/cycle, owner/ACL, owned-by column and dependency kind; current values captured separately |
| Extensions | Name/version/schema/owner; public routines include extension-owned functions with explicit membership flag |
| Views/routines | View/materialized-view definition/kind; routine identity arguments, result, kind, language, source/library, defaults, volatility/strictness/security/leakproof/parallel/config/owner/ACL |
| Triggers/rules/policies | Identity, enabled/internal state, complete deparsed rule/trigger definitions; RLS policy mode/roles/command/expressions |
| Migrations | Names, batch/time metadata and version rows |

Foreign/partitioned/inherited tables, custom non-extension types/domains/enums, application aggregates and event triggers are explicitly detected as unsupported coverage and block acceptance even if present in both databases. This prevents claiming comprehensive semantics for objects outside this bounded PostgreSQL 15 implementation. Additional schema features found during execution require review; the collector must not invent equivalence.

## Expression comparison and classifications

No SQL text is globally stripped or normalized. Structured properties compare exactly. Deparsed expressions/bodies remain exact by default. A differing expression is UNRESOLVED rather than presumed corrupt or equivalent. A changed type, nullability, action or other structured attribute is MATERIAL DIFFERENCE. Missing/extra schema objects are material unless independently reviewed as post-backup changes; migration drift is unresolved. Every differing property and its evidence values is retained.

Only the two previously reviewed complete CHECK expression pairs can compare equivalent, and only for exact schema/table/name/type/validation identities with both snapshots confirming status varchar(255) NOT NULL and encrypted_access_token nullable text. Changed constants, operators, casts, columns or branches cannot match that allowlist.

MATCH means all captured properties of an object category agree. EXPECTED DIFFERENCE applies to current live row counts/sequence values versus historical observations; it does not approve the restored values. MATERIAL DIFFERENCE and UNRESOLVED prevent `schemaComparisonPassed`. The output always sets `fullRestoreVerified: false`: this command cannot substitute schema comparison for complete backup data verification. Reviewed age/environment explanations are documented externally; no blanket ignore or bypass flag exists.

## Data verification and independent gates

The collector records counts of every application table and compares restored counts to pinned backup-time evidence, not to today's live rows. A changed historical count is material. It reads sequence last_value/is_called without advancing them. Foreign-key checks count orphan rows, supporting MATCH SIMPLE and MATCH FULL and preserving their NULL semantics; unsupported forms fail. The synthetic `crosstab` probe must return 42. This checks callability, not every financial report's correctness.

The existing independent corrected SQL checks remain required: all table/count inventories, indexes/sequences, migration metadata, validated constraints, column assumptions, tablefunc and report probe. Retain the independent dump's raw COPY hashes for all 27 tables, sequence setvals, defaults, sequence ownership, owners, ADD CONSTRAINT and explicit index comparisons. These provide backup-time assurance beyond current live catalog structure. The database remains unverified until every required independent gate passes. Counts alone never establish raw data fidelity.

The old `restored_tables_mismatch` gate compares complete generated CREATE TABLE blocks. It has **not been deleted or silently bypassed**. The catalog comparison is a separately prepared gate; authorized collection must first expose any meaningful differences. Only after reviewing its results and confirming no unsupported/material/unresolved objects may a separately reviewed integration replace that one textual table gate. The remaining dump gates must remain independent. This preparation does not claim that integration or complete acceptance has occurred.

Sequence current values must still match backup-time setval evidence via the independent dump check; they are not expected to equal current live values. Migration rows must match the backup's raw COPY hashes. Referential integrity and empty historical financial tables are checked without reconstructing financial state. No invented tax or Category conservation rule is introduced.

## Tests and limitations

88 non-database tests passed across the catalog comparison (48) and existing preparer (40). Tests cover identical schemas; missing/extra objects; type/scale/nullability/default/identity/generated differences; FK actions and CHECK changes; allowed cast forms with column-type prerequisites; index predicates/opclasses/options; sequence ownership/definitions; extensions/views/functions/triggers/rules; migration uncertainty; backup-age observations; pinned historical counts; unsupported objects; deterministic comparison; strict addresses/database/OID/socket identities; and SELECT-only query/explicit CLI behavior. PostgreSQL query execution itself has not been verified in this task.

Changed-file ESLint, Node syntax and both Git diff checks pass. No TypeScript or application runtime code changed, so TypeScript/build/circular/Knip checks are not applicable to this standalone script addition. No database-backed test was run.

ACL arrays and expression deparsing may differ without changing effective behavior; those differences remain visible rather than normalized. Snapshots cannot prove no schema change occurred between the two connections. The collector stops on timeout or unreadable objects. Catalog output is private and bounded; query plans can still encounter legitimate staging load during a later run. No restore, migration, extension installation or cleanup is part of this command.

## Next authorization boundary

Request fresh authorization for **read-only catalog collection/comparison only** against the two named staging databases. Preserve temporary database OID 17260. Full restore acceptance and cleanup remain blocked until catalog discrepancies are reviewed and all independent backup-data checks pass. Dropping the temporary database requires a later explicit cleanup authorization with independent host/server/target/OID/session checks. No production access, PM2/systemd change, reboot, deployment or commit is included.
