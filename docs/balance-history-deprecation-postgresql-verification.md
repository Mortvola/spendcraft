# BalanceHistory runtime-deprecation PostgreSQL verification

Status: ACCEPTED — physical schema cleanup deferred.

Verification HEAD: `5b96abe8818200d9ef791cfc66af9bc6ae4c1f32`. Accepted concurrency and OFX corrections were committed and present. Runtime deprecation, including the restored `AccountsController.balances` method name, was present as staged user work. All staged/uncommitted changes and unrelated local files were preserved. No agent commit, index mutation, reset or discard occurred.

## Authorization and safety

Fresh authorization applies only to localhost:5432/spendcraft_test. No DB configuration was redirected. Configured pg and pgLog both specify host localhost, port 5432, database spendcraft_test. Before destructive bootstrap, independent live pg and pgLog verification reported database spendcraft_test, port 5432, server `::1/128`, peer `::1/128`; the centralized validator positively recognizes these loopback addresses. No credentials were logged.

Read current test bootstrap, centralized driver safety helper, configured pg/pgLog, new deprecation fixture/cleanup paths, retained parent cleanup and existing temporary DDL helpers before destructive execution. All 27 inert safety tests passed first. They prove configured mismatch stops before connection, invalid live identity rejects, inherited transaction queries are intercepted, every destructive statement reruns both identities and later cleanup cannot reuse setup authorization.

The accepted safety infrastructure was unchanged: immediately before each destructive SQL operation it revalidates both configured/live pg and pgLog and the exact execution connection. Bootstrap verifies before invoking setup; returned teardown independently verifies before cleanup, with interception installed until all cleanup completes. ORM fixture mutations/deletes, test-specific temporary constraints/extensions and their cleanup all use guarded Lucid/Knex connections. The new deprecation tests contain no destructive raw SQL cleanup; no new temporary schema object is introduced by them.

HTTP tests use port 3349; PostgreSQL target is unchanged. Existing Vite HMR port 24678 occupancy emits a warning but does not affect HTTP/database results.

## Core and inertness results

Initial core run: **62 passed, 0 failed, 0 skipped/pending**, with 4,090 independent safeguard checks and 4,087 guarded SQL operations including returned teardown. This includes removed routes, history inertness, Statement authority, ownership and source boundaries. Subsequent focused verification adds stronger initialization and whole-Budget cleanup coverage.

| Supported path | Evidence |
|---|---|
| Former CRUD | POST nested collection, PATCH row, DELETE nested row and DELETE standalone alias return the normal routing404; raw history and full Account/Category/Transaction/link/Statement/log snapshots unchanged in both tracking modes |
| Former stored GET | Balances-tracked GET returns422 directing to Statements; no historical rows exposed. Transactions GET remains the existing derived series through controller balances; no observation IDs or history lookup |
| Manual CREATE/PATCH/DELETE | Conflicting legacy balance98765.43 does not replace Account100. Signed+10 →110, PATCH+7 →107, DELETE →100; legacy raw rows unchanged; chart returns accounting110 rather than legacy value |
| Statements | Existing Statement create/update/date/delete/reconcile authority retained; legacy rows remain unchanged; removed routes cannot override a later Statement result. Transaction-tracked Statement behavior remains unchanged |
| startDate/opening | Conflicting history does not alter Account100 or Pool100 during startDate mutation; old source-compatible category/opening rules retained |
| Offline initialization | New/existing Institution × Transactions/Balances tracking: all create Account12 without history. New+Transactions creates opening and Pool112; existing+Transactions retains no opening/Pool delta; Balances creates initial Statement12 without transaction opening |
| OFX | Accepted core/reimport/command tests retain ledger→plaidBalance and net Transaction→Account.balance, stable opening/Pool and raw legacy-row equality, with no history saves |
| Plaid | Existing 20 concurrency/provider cases seed conflicting positive/negative observations for both fixture Accounts; after each case raw legacy rows are unchanged while existing Account/provider/Category/opening/cursor assertions remain |
| Funding/rebalance | Current Category-only lifecycle/regressions remain unchanged; source boundaries show no history input or writer |
| Charts/net worth/reports | Existing Transaction chart and Statement UI remain supported; active net-worth tests prove later snapshots and old pre-start history cannot change points, grouping or financial values; reporting uses Transactions/opening/Statements |
| Client | Bundled client State tests retain read-only chart points, no persisted observation IDs or add/update/delete methods, no old Store.balances mutation cache; Statement UI uses its existing endpoint; OFX never refreshes history |
| Rollback/concurrency | Accepted OFX/manual contention and rollback/waiter cases retain Budget gates, fresh state and transaction binding. Existing late financial failures roll back remaining state without needing history persistence |

## Parent deletion boundary

Account and Institution deletion fixtures include legacy rows. Existing explicit cleanup removes own dependent history, preserves foreign Account/history and applies only current Transaction/Category reversal semantics. History supplies no financial reversal. Last-user deletion now has a dedicated fixture containing an Account, opening and conflicting history: authorized graph destruction removes own Account/Budget/history while foreign Budget/account/history remain unchanged.

This is permitted physical parent cleanup, not standalone BalanceHistory CRUD. The table and Account FK remain. Original FK migration does not specify ON DELETE CASCADE, so explicit cleanup/minimal model/relationship cannot simply be dropped. No general historical cleanup was performed; only authorized test fixtures/setup/teardown were mutated.

## Final production reference inventory

| Remaining production source | Classification | Role |
|---|---|---|
| app/Models/BalanceHistory.ts | CASCADE / CLEANUP | Minimal retained model mapping for physical dependent cleanup |
| app/Models/Account.ts import/hasMany balanceHistory | CASCADE / CLEANUP | Relation for whole-user graph cleanup and legacy test fixtures; no callable history upsert remains |
| app/Controllers/Http/InstitutionController.ts | CASCADE / CLEANUP | Existing query/delete solely when deleting parent Accounts |
| app/Controllers/Http/UsersController.ts | CASCADE / CLEANUP | Existing relation/query/delete solely when deleting the last-user Budget graph |

Source audit of app/client/common/commands/start finds zero other history references: no product reader/writer, public CRUD handler, provider dependency, command/job, Account/provider fallback or client mutator. Migrations/schema/schema.xmi, legacy fixtures/traps and historical documentation remain explicitly classified in the deprecation inventory. Existing investment-conversion migration is schema history, not a request/job; it was not changed or replayed. No startup migration-on-touch, repair or standalone repopulation path was introduced.

## Corrections and verification scope

No production or test-infrastructure change was required by the initial core results. Test-only strengthening replaces one initialization assertion with four explicit route/tracking cases and adds last-user cleanup with foreign-data preservation. Original defect scenarios remain documented; removal is tested as unavailable API plus raw-state invariance rather than restoring old behavior.

No active product dependency was found. Preserve Account/Statement/chart/net-worth, accepted concurrency/OFX, Plaid and unrelated accounting semantics. Current floating monetary representation is unchanged. No physical table/FK/column removal, migration, exact-money policy or historical Account repair is part of this verification.

## Final verification

Focused acceptance: **822 passed, 0 failed, 0 skipped/pending**. The run recorded **43,385 independent checks and 43,382 guarded SQL operations**, including returned cleanup. Covered all relevant account, OFX, Plaid, Statement, initialization, chart/report/net-worth, parent cleanup, manual Transaction, funding/rebalance, Loan, concurrency and client/source/guard cases before full-suite execution. No active product dependency, unexpected500,40P01 deadlock or lock timeout remained; injected failures intentionally exercised existing rejection/rollback logging.

Both server/client TypeScript checks, ESLint, Knip and circular regression pass after final test changes. Circular analysis retains only the accepted 11-model/26-edge component. Complete suite: **1,306 passed, 0 failed, 0 skipped/pending**. Its fresh bootstrap independently reverified both configured/live targets; the full run recorded **54,338 independent checks and 54,335 guarded SQL operations**, including returned teardown. Existing migrations were already up to date. No application schema migration was created/applied; temporary test DDL and cleanup remained safeguarded. No BalanceHistory table/column/FK removal occurred.

No production or safety-infrastructure fix was needed during verification. Only tests/functional/accounts/balanceHistory.spec.ts was strengthened, alongside verified-status documentation and this record. Method-level comparison with HEAD confirms Account.processOfx, ordinary posting, opening and all Account controller financial/Statement methods are unchanged; only intended history helper/CRUD removal and the chart's stored-history branch differ. Server and separate client builds passed. Standard and staged git diff --check passed. The existing >500kB bundle warning remains (1,030.62kB before gzip); the occupied Vite HMR port 24678 during tests was the only other environment warning. Source audit after testing again found only the four allowed cleanup/model files.

Database verification is complete and **task-specific authorization is now expired**. No historical observation outside authorized test fixture/reset/cleanup was changed; no historical Account repair, exact-money migration, unrelated accounting/provider change, deployment or commit occurred. A future physical cleanup needs separate policy/authorization for retention/drop, FK/migration replay, model/relationship and parent-cleanup removal.
