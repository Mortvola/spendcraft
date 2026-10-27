# BalanceHistory runtime deprecation

Status: **PostgreSQL-verified and accepted**. Focused 822 / full-suite 1,306 passed, 0 failed, 0 skipped/pending. Implementation made no database connection; subsequent fresh verification authorization applied only to guarded localhost:5432/spendcraft_test and is now expired. Physical schema cleanup is deferred. See verification evidence.

## Product decision and baseline

BalanceHistory is deprecated. Supported product accounting must neither read nor write it, and historical observations must not influence any current Account/provider/Category/Transaction/Statement/opening/initialization/funding state. Remove the obsolete API instead of repairing its known Account-balance mutation defect. There is no replacement history system.

HEAD before edits: `5b96abe8818200d9ef791cfc66af9bc6ae4c1f32` (accepted OFX correction), whose parent baseline includes accepted Budget-row concurrency. Tracked tree/index were clean initially; unrelated untracked files were preserved. Some edits were externally staged during work; no agent index mutation, commit, reset or discard occurred. OFX source and gating matched accepted behavior. No material unexplained baseline difference was found.

Read AGENTS.md and the requested invariant, review, OFX design/implementation/verification and concurrency design/verification records before implementation. Current source/tests, not abandoned-branch architecture, establish the boundary.

## Decision gate: no active product blocker

The misleadingly named client BalanceHistory component was active, but its data did not come from the deprecated table: Transactions Accounts used an existing Transaction-derived GET series; Balances/Investment UI used Statements. ReportController.networth already uses Statements, Transactions, Account balance and opening; it does not query balance_histories. Preserve all those chart/report calculations. No provider, normal command/job, initialization or Statement lifecycle needs a stored observation. The unused Account upsert helper has no active production callers after accepted OFX removal.

No active feature fundamentally depends on stored BalanceHistory. Removal proceeds. There is no new history reconstruction, provider snapshot, event stream or semantic substitute; existing chart SQL and Statement chart logic remain.

## Initial reference inventory and disposition

Each row classifies the identified reference group exactly once. One file can contain separate groups with different classifications. Generic Category balances, provider payload balances, RebalancesInterface and Loan.updateBalance are not BalanceHistory references.

| Reference before removal | Classification | Consumer / disposition |
|---|---|---|
| AccountsController.budgetHistory | PRODUCTION READER | Tenant-scoped lookup for deprecated mutations; removed with its callers |
| AccountsController.balances stored-history branch | PRODUCTION READER | GET returned table rows for Balances tracking; no active client requests this branch; removed, now422 directing to Statements |
| AccountsController.addBalance/updateBalance/deleteBalance | PRODUCTION WRITER | Insert/update/delete plus defective Account overwrite/latest-or-zero synchronization; handlers removed entirely |
| start/routes.ts nested POST/PATCH/DELETE and standalone DELETE | PUBLIC API SURFACE | Authenticated manual CRUD exposed to API callers; removed |
| start/routes.ts GET /account/:acctId/balances | PUBLIC API SURFACE | Active Transaction chart also used this path; retained for derived points only, handler name balances retained; no model/table dependency |
| account.ts addBalance/updateBalance validators | PRODUCTION READER | Date uniqueness queried table; no other callers; removed along with custom messages |
| Account.updateAccountBalanceHistory | PRODUCTION WRITER | Potential observation upsert but no active callers; removed, not left as a way to repopulate history |
| Account's commented provider/helper calls | PROVIDER | Inactive dead references, not live provider writers; removed stale history calls |
| Account import/hasMany balanceHistory | CASCADE / CLEANUP | Used by user-destruction cleanup and legacy fixtures; retained minimal relationship |
| Models/BalanceHistory model | CASCADE / CLEANUP | Minimal table mapping for existing explicit parent cleanup and tests; retained |
| InstitutionController.deleteAccounts history query/delete | CASCADE / CLEANUP | Removes dependent rows before parent Accounts; retained unchanged, no financial reversal from history |
| UsersController.delete history relation/query/delete | CASCADE / CLEANUP | Whole-graph destruction; retained unchanged |
| State/Balances.load | REPORTING / HISTORY | Transport/cache for existing Transaction chart, despite observation typing; replaced by read-only AccountBalanceSeries with identical endpoint/data meaning |
| State/Balances add/insert/remove and State/Balance update/delete | DORMANT CLIENT CODE | Compiled mutation methods with no active editor/button; removed |
| Store.balances and Types BalanceInterface/BalancesInterface | PUBLIC API SURFACE | Internal client contract mixed chart and obsolete CRUD; removed; only read-only series interface remains |
| common BalanceProps/isBalancesResponse/AddBalanceResponse/UpdateBalanceResponse | PUBLIC API SURFACE | Old observation response/mutation contracts; removed, read-only chart points retain date/string and balance/number |
| AccountView/BalanceHistory.tsx + stylesheet and AccountDetails imports | CLIENT UI | Active chart/Statement UI, not stored-history feature; renamed AccountBalanceChart, calculations/navigation preserved |
| AccountView/Balance.tsx commented showBalanceDialog | DORMANT CLIENT CODE | Old disconnected editor hint; removed comment; active Statement row component remains |
| resources/openApiSchema.yaml balance POST | PUBLIC API SURFACE | Documented obsolete writer; removed and GET chart schema documented instead |
| OFX HTTP/command/processOfx | PROVIDER | Already has no history access after accepted correction; unchanged |
| Plaid/model/provider wrappers | PROVIDER | No active history reader/writer; explicit Account/provider state and cursor logic unchanged |
| Other imports, initialization, Statements, commands/jobs | OPERATIONAL / COMMAND | Audit found no BalanceHistory access to remove; no replacement or repair command left |
| Reports/net worth/Transaction chart SQL | REPORTING / HISTORY | No table dependency in net worth; stored-history GET branch removed while existing derived query preserved |
| Functional/unit fixtures and old-authority assertions | TEST ONLY | Retain legacy fixtures; replace unsupported CRUD expectations with404/full noninterference; keep Statement/OFX regression scenarios |
| Current/old migrations, generated schema and schema.xmi | MIGRATION / SCHEMA ONLY | Retained untouched, including old investment-history conversion migration; not a production request lifecycle |
| Existing design/review/verification/audit documents | DOCUMENTATION ONLY | Preserve historical findings; mark BalanceHistory-specific preservation/fix/migration proposals superseded |
| Local SQL backups / stale bundled stats | DOCUMENTATION ONLY | Inert untracked historical artifacts, not callable product paths; inspected by filename/reference search only; left untouched |

No UNKNOWN reference remains in the audited source. No normal provider/operational writer can repopulate the table.

## Routes, compatibility and effects

All former routes were inside the existing authenticated `/api/v1` group. CRUD callers were the dormant client State methods; no active editing UI or concrete external integration was found. An external client could have called them, and the POST was advertised in OpenAPI. Removal is an intentional compatibility break explicitly approved by feature deprecation; hypothetical unknown callers do not justify keeping the writer.

| Method/path | Former controller / response | Result |
|---|---|---|
| POST /api/v1/account/:acctId/balances | addBalance; ApiResponse of id/date/balance/accountBalance | Removed; verified404; no Account mutation |
| PATCH /api/v1/account/:acctId/balances/:id | updateBalance; ApiResponse of observation | Removed; verified404 |
| DELETE /api/v1/account/:acctId/balances/:id | deleteBalance; empty success | Removed; verified404 |
| DELETE /api/v1/balance/:id | deleteBalance; empty success | Removed, including balance.delete route alias; verified404 |
| GET /api/v1/account/:acctId/balances, Transactions tracking | Existing derived date/balance array | Retained unchanged data source/arithmetic, no observation IDs; auth/ownership remains |
| Same GET, Balances tracking | Former stored history array | Stored-history branch removed;422 “Balance-tracked accounts use Statements”; active UI already uses Statement endpoint |

No CRUD route is retained as a hidden fallback. The GET name alone does not imply a table read. Current API routing has no supported deprecated feature handler; real unavailable-status checks await DB authorization. No public money number is changed to a string, renamed or quantized.

## Client, reports and provider isolation

Removed State/Balance.ts and State/Balances.ts, their Store property and mutation types. AccountBalanceSeries caches only read-only date/balance points and does not mutate Account.balance. Its response guard validates a real array/all points instead of treating arbitrary first-row/length objects as observation responses. No observation IDs/update/delete operations remain. It uses the same existing GET route and preserves cache-on-account-selection behavior.

Renamed BalanceHistory.tsx/scss to AccountBalanceChart.tsx/scss to describe the active feature accurately. Transactions chart uses the existing derived series; Balances/Investment use the existing Statements. Statement row/editor/dialog remains. No generic chart, Statement feature, route/navigation entry or net-worth capability was removed. No dormant editor was restored. No new series calculation was added.

OFX retains Transaction net effects→Account.balance, optional LEDGERBAL→plaidBalance, no history write, accepted Budget serialization and accounting-derived opening maintenance. Plaid explicit Account/provider observations/posting/cursor state remain untouched. Statement authority/reconciliation remains separate; initialization still uses its existing route-specific Account/opening/Statement behavior. Source boundaries prove these writers do not access history. Provider, funding/rebalance, Loans and Transaction DELETE semantics are unchanged.

## Retained physical references

The original `1626493060807_balance_histories.ts` creates the table. `1628345647950_balance_histories.ts` adds a required Account FK without specifying ON DELETE CASCADE. Therefore dropping application cleanup/relationship now would risk failing parent deletion. Preserve existing explicit cleanup; do not assume database cascade exists. Institution and whole-user/Budget graph destruction may still physically delete dependent rows as before; it is not BalanceHistory product accounting. No parent cleanup was executed during implementation; subsequent verification exercised only authorized test fixtures.

Retain Models/BalanceHistory, Account.balanceHistory, both parent cleanup paths, database/schema.ts metadata, schema.xmi, migrations and legacy fixtures. Historical migration `1785956002715_alter_statements_table.ts` reads/converts/deletes investment observations during schema migration; it is not called by product requests and was not changed/run. Retain old-migrations files as history. Do not rewrite old migrations or infer a current observation authority from them.

A future separately approved physical cleanup must decide data retention/export/drop policy, review migration replay and the FK, remove the table/model/relationship/explicit cleanup and adapt surviving legacy-data tests together. No table drop, FK/schema change or deletion migration is created here.

## Historical data policy

Existing rows remain physically unchanged. No normalization, replay, conversion, reconstruction, audit execution or Account repair is approved/performed. Removing former Account overwrite endpoints is forward protection only; it does not identify or repair earlier damage. Rows are inert to supported accounting even if their balances/dates conflict with current state.

## Verification and prepared PostgreSQL matrix

Non-DB focused run: **132 passed, 0 failed, 0 skipped/pending**. Covers five source/inert deprecation boundary tests, 21 production-method OFX cases, 11 Account-writer source/inert concurrency cases, 53 bundled client State regressions and 42 response guard cases. Source scan allows only the four model/cleanup files. Actual chart method executes against inert adapters that reject any legacy-table lookup. Client confirms no observation IDs/CRUD/cache property, chart loading cannot change Account balances, malformed/rejected reads preserve cache, and Statement/OFX state remains supported.

Old tests encoding deprecated Account synchronization were not retained as product contracts. Replaced old CRUD/newest/backdated/final-delete expectations with unavailable-endpoint/full-state invariance; retained Statement authority with seeded inert legacy rows. The obsolete history-specific late-save failure path disappears with its endpoint; independent Statement/OFX rollback tests remain.

Both TypeScript projects, ESLint, Knip and circular regression pass. Existing 11-model/26-edge cycle is unchanged. Server and separate client builds passed; standard and staged git diff --check passed. The established >500kB bundle warning remains (1,030.62kB JS before gzip); no other warning remained. New task source/doc files also passed explicit whitespace/final-newline checks; the renamed stylesheet is byte-for-byte unchanged from baseline. No DB-backed test/bootstrap ran during implementation. Subsequent verification established 822 focused and 1,306 full-suite passes; the prior 1,305 baseline belongs to OFX acceptance.

Executable cases prepared during implementation and subsequently verified under fresh authorization:

| Area | Prepared tests |
|---|---|
| API removal/security | balanceHistory.spec: four mutation routes × two tracking modes reject404 and preserve full financial/history snapshots; isolation.spec retains foreign/wrong-parent/shared-user rejection with unchanged legacy rows |
| Legacy Transaction inertness | CREATE/PATCH/DELETE with visibly conflicting history; current Account/Category effects preserved; active chart derives current balance without observation IDs |
| GET boundary | Balances GET no stored rows,422; Transactions GET retains derived values; client read-only guard/cache tests |
| Statement authority | balanceHistoryAuthority: six Statement lifecycle cases keep historical rows unchanged; removed history API cannot override Statement result; old rejection status422 becomes404 |
| OFX | Accepted ofxBalanceAuthority/reimport fixtures already seed and snapshot legacy rows, both entry points/history-save trap, ledger/Account independence and opening/Pool |
| Plaid | Existing 20 concurrency/provider cases now seed conflicting observations in both fixture Accounts and assert full legacy row equality after each case, while existing financial/cursor expectations remain |
| startDate/opening | Current balance/Pool/date behavior unchanged with conflicting legacy observation; row contents unchanged |
| Initialization | New offline Institution/Account creates no history; existing legacy data unchanged; provider/Statement initialization source boundaries and existing regression suites retained |
| Cascades | Institution isolation adds explicit own-history cleanup and foreign-history survival checks; existing Account deletion/user graph tests keep legacy fixtures |
| Financial/concurrency regressions | Accepted Account/Category/Statement/Transaction/opening/Pool/provider suites remain; no gate removed or locking redesign |

Any future DB authorization must name only localhost:5432/spendcraft_test. Existing centralized safeguards must independently verify configured/live pg and pgLog plus execution target immediately before setup and EACH destructive statement/cleanup. Implementation authorization was absent; subsequent verification used fresh scope-specific authorization, which is now expired. No production audit ran.

## Final remaining-reference appendix

The following file inventory classifies every remaining table/model-name reference found in the maintained source/doc/test/schema tree. Generic RebalancesInterface/CategoryBalanceInterface, cached TS build metadata and stale generated/bundled output are not product BalanceHistory dependencies. Builds regenerate ignored output; local backups are not imported by application code.

| Remaining file | Classification | Why retained |
|---|---|---|
| app/Controllers/Http/InstitutionController.ts | CASCADE / CLEANUP | Minimal model/relationship or unchanged parent-deletion cleanup only; no accounting/read API. |
| app/Controllers/Http/UsersController.ts | CASCADE / CLEANUP | Minimal model/relationship or unchanged parent-deletion cleanup only; no accounting/read API. |
| app/Models/Account.ts | CASCADE / CLEANUP | Minimal model/relationship or unchanged parent-deletion cleanup only; no accounting/read API. |
| app/Models/BalanceHistory.ts | CASCADE / CLEANUP | Minimal model/relationship or unchanged parent-deletion cleanup only; no accounting/read API. |
| database/migrations/1626493060807_balance_histories.ts | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| database/migrations/1628345647950_balance_histories.ts | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| database/migrations/1785956002715_alter_statements_table.ts | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| database/old-migrations/1591022288456_balance_history_schema.js | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| database/old-migrations/1591482865526_balance_histories_schema.js | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| database/schema.ts | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| docs/account-balance-writer-concurrency-design.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/account-balance-writer-concurrency-implementation.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/account-balance-writer-concurrency-postgresql-verification.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/accounting-invariants.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/balance-history-deprecation.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/currency-precision-policy-design.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/integer-cents-domain-design.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/integer-cents-implementation-plan.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/legacy-monetary-json-audit-design.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/ofx-account-provider-balance-correction-design.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/ofx-account-provider-balance-correction-implementation.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/ofx-account-provider-balance-correction-postgresql-verification.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| docs/post-f8af214-correctness-review.md | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| resources/openApiSchema.yaml | DOCUMENTATION ONLY | Historical findings/acceptance or current deprecation/API description; no runtime dependency. |
| schema.xmi | MIGRATION / SCHEMA ONLY | Physical retained schema, original migration or historic conversion; unchanged and not executed. |
| tests/functional/accounts/balanceHistory.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/balanceHistoryAuthority.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/creationIsolation.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/isolation.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/ofxBalanceAuthority.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/ofxReimport.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/accounts/openingSnapshot.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/institutions/isolation.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/institutions/onboarding.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/institutions/plaidConcurrency.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/reports/networthHistory.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/reports/security.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/functional/transactions/isolation.spec.ts | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/unit/balanceHistoryDeprecation.spec.js | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |
| tests/unit/ofxBalanceAuthority.spec.js | TEST ONLY | Legacy fixtures, isolation/ignored-data assertions, or traps preventing history access; legacy-data and noninterference assertions; DB cases passed during separately authorized verification. |

Local backup.sql, dump.sql and spendcraft.sql remain inert historical data artifacts (DOCUMENTATION ONLY); stats.json is a stale generated build report (DOCUMENTATION ONLY). They were not modified or used as accounting input. Ignored .adonisjs/build/client assets and TS build metadata are generated mappings/copies rather than additional source lifecycles. No normal runtime imports those local SQL/JSON archives. No seed/command/job reader or writer was found.

## Verification completion and physical-cleanup boundary

Fresh task-specific PostgreSQL verification completed only against localhost:5432/spendcraft_test with independent configured/live pg, pgLog and execution safeguards before every destructive statement, setup and cleanup. Focused acceptance: **822 passed, 0 failed, 0 skipped/pending**; full suite: **1,306 passed, 0 failed, 0 skipped/pending**. No further production or safety-infrastructure correction was required. Tests strengthened all four offline initialization combinations and last-user graph cleanup with foreign-data preservation. Current-source audit retains only the four documented cleanup/model files. See verification evidence.

Authorization is now expired. No historical rows outside authorized test fixtures/cleanup were changed; no Account repair, physical table/model/schema removal, monetary migration, unrelated accounting/provider change, deployment or commit occurred. Physical retention/drop policy, FK/migration replay, removal of the minimal model/relationship and retained cleanup require a separate task and authorization. No active product blocker was found.
