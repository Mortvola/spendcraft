# Staged changes verification

## PostgreSQL acceptance — staged snapshot preserved

**STAGED CHANGES POSTGRESQL VERIFICATION ACCEPTED — READY FOR COMMIT REVIEW.**

### Baseline and preservation

HEAD: `500cef52d2e0a9495db5992cd1fbb6903246dcc1`. All 33 staged files listed in the inventory below remained present. At this PostgreSQL task's entry there were **no tracked unstaged changes**: the formerly unstaged verification-document update had already been staged. Existing unrelated untracked files were preserved and were not executed.

The exact `git diff --cached` snapshot was saved as `/tmp/pg-staged-initial.patch`. Initial and final SHA-256: `fa2d6cd9befe7bd9638a749a81c20a1cbf059cae5aa475380fa67e6aa9f1fbf6`. The final patch was compared byte-for-byte with that initial file. No index operation or production-runtime edit occurred. The earlier non-DB fingerprint below describes its earlier snapshot, not this PostgreSQL task's entry snapshot.

### Authorized database and independent safety gate

Only `localhost:5432/spendcraft_test` was authorized. Both configured connections, `pg` and `pgLog`, identified host `localhost`, port `5432`, database `spendcraft_test`. Both live identities identified that database and port with server and peer `::1/128` (verified loopback). The driver guard additionally identified the exact execution connection immediately before each potentially destructive SQL statement.

Safety tests ran first: **27 passed, 0 failed, 0 skipped**. All 60 prepared cases and their helpers were inspected before financial execution. There was no direct `pg.Client`, external SQL command or destructive connection bypass. `installDatabaseSafety` independently rechecks configured/live `pg`, configured/live `pgLog`, and the actual execution connection before INSERT/UPDATE/DELETE/TRUNCATE/DDL and other conservatively matched SQL. Transaction clients inherit this wrapper. Setup and returned cleanup independently verify; setup does not authorize cleanup. Test-only temporary migration-probe creation and removal also traverse this wrapper; no application schema migration was applied (runner reported already up to date).

Final focused run: outer guard **70,359 independent checks / 70,356 guarded SQL operations**. Complete suite: outer guard **73,296 independent checks / 73,293 guarded SQL operations**. The prepared group also installed its independent nested guard. Counts include fixture work and final guarded truncation. No identity mismatch or ambiguous target was accepted. All destructive PostgreSQL work, including each cleanup, used only the authorized target.

### Changed-method coverage, ordering and binding

The detailed 33-file inventory and before/after method descriptions below remain applicable. PostgreSQL coverage exercised all 13 changed HTTP writer paths and the three command mutation paths:

| Changed path | PostgreSQL evidence |
|---|---|
| `CategoriesController.addGroup/updateGroup/deleteGroup/addCategory/updateCategory` | Same-Budget waiting, owner commit/rollback, different-Budget progress, scoped foreign targets, complete explicit settings in both orders; actual Group-delete versus Category-create in both orders. Fresh membership prevents stale admission/orphans. |
| `InstitutionController.updateOffline/addOfflineAccount` | Budget contention, fresh scoped target, rollback-owner and different-Budget cases. Existing-Institution transaction tracking still posts no opening/Pool effect; optional Statement initialization remains covered by existing Account/Statement suites. |
| `InstitutionController.unlink` | Contention and security; actual `Institution.syncUpdate` versus unlink in both serial orders, with fake external provider. Waiting sync observes removed credentials and does not call the provider or restore identity/cursor. |
| `InstitutionController.deleteAccount/delete` | Both serial orders against actual manual CREATE; fresh post-gate state, existing cleanup, no stale posting to deleted Account, known currently applied Category effects reversed exactly once. Account late failure rolls back and waiting posting proceeds from restored balances. Institution/Account/security and deletion error suites also pass. |
| `TransactionsController.dedup` | Wait/commit/rollback-owner/different-Budget and foreign-target cases; only duplicate marker changes, JSON allocations unchanged. |
| `TaxesController.post` | Complete forecasts, first creation in both orders produces one row, late save failure restores full snapshot, Budget isolation. |
| `UsersController.delete` | Gate/commit/rollback-owner/different-Budget, existing last/shared-user behavior and late error propagation; two real concurrent member deletions leave exactly the last-user Budget cleanup. |
| `PlaidRemoveItem.run`, `PlaidGetItem.run --fix` | Real Budget wait then fresh token/identity revalidation; committed unlink prevents remote removal/stale identity writes. Cursor preservation and existing command interfaces retained. External calls mocked. |
| `CheckUnassigned` | Waiting command reloads JSON and skips an explicit allocation committed before gate acquisition. Existing JSON normalization only; no Category balance mutation added. |
| Removed funding-plan routes/types/validator; split-audit script | Removed endpoints return existing 404 contract; proposed funding remains usable. Removed declarations pass TS/Knip. Audit tool tested offline in complete suite; not run as an operator script. |

Budget is acquired before authoritative mutable target/admission reads and writes. Post-gate queries and saves use the owning transaction, explicitly or through bound Lucid relationships. Prototype hooks require `$trx`; barriers hold real writer mutations and observe `pg_blocking_pids` plus waiting `applications ... FOR UPDATE` SQL. Release is controlled by promises, not arbitrary sleeps. Tests compare fresh persisted state after completion.

No new explicit non-Budget lock, advisory lock, alternate hierarchy or lower-resource write before Budget was introduced in the staged paths. Existing separate recovery/advisory machinery is unchanged; passing the full suite does not newly approve that architecture. The documented cleanup-row exception remains separate. Tax actuals intentionally run as read-only queries after forecast commit; they are not escaped forecast writes. No unexpected PostgreSQL `40P01` or lock timeout was observed in the passing focused/full runs.

### Financial, security and historical boundaries

Known-current-effect fixtures establish cascade serialization and rollback only. They do **not** prove historical reversal authority. Existing cascade helper arithmetic is unchanged. The deferred pre-start ordinary CREATE→DELETE issue and historical policy are not corrected or certified.

Accepted regression selections cover Account and Category/Pool concurrency, Account/Category eligibility and startDate, OFX accounting versus provider authority, Plaid replay/cursor behavior, preview/submission, immutable type-2 date, replacement admission, exclusive Category/Funding History JSON reporting, Income Vs. Expenses, Statements, initialization, BalanceHistory deprecation and removed CategoryTransfer DELETE. Foreign catalog/Institution/Account/Transaction attempts leave full persisted snapshots unchanged and retain 404 behavior. Different-Budget writers progress while another Budget remains held. Late failure and waiter tests prove rollback releases the gate and leaves no partial coupled state.

Financial formulas, monetary parsing, balance authority, eligibility, opening behavior, JSON allocations and API response contracts were not changed during verification. Loans and the complete legacy relational allocation architecture remain deprecated; existing tests included by the complete-suite runner are nonregression evidence only, not renewed architectural acceptance or migration scope.

### Test results and test-only corrections

| Check | Passed | Failed | Skipped/pending |
|---|---:|---:|---:|
| Safety tests first | 27 | 0 | 0 |
| Original prepared PostgreSQL group (standalone; also included below) | 60 | 0 | 0 |
| Additional real writer-pair group (standalone; also included below) | 10 | 0 | 0 |
| Final focused selection: 55 functional files | 1,185 | 0 | 0 |
| Complete automated suite, without file/suite filter | 1,902 | 0 | 0 |

These counts overlap; they must not be added. No prepared case was marked not applicable. Complete suite ran the repository's existing functional and unit selections. Provider network operations were faked by tests; this is not live-provider acceptance. Local webhook queue tests use existing loopback-only Redis checks and unique temporary queue/key cleanup.

Test-only changes made, all left unstaged:

- `tests/functional/concurrency/stagedBudgetWriters.spec.ts`: remove obsolete NOT YET RUN label; use a 30-second harness timeout around independently bounded deterministic barriers; isolate CheckUnassigned's initial Budget discovery to its own initialized fixture. Other suites intentionally create uninitialized Budgets, which previously made this command abort before reaching the target barrier. Protected post-gate queries remain real and unchanged.
- `tests/functional/concurrency/stagedWriterPairs.spec.ts` (new): ten real writer-pair cases covering cascade/manual posting in both orders, rollback/waiter, Group membership admission in both orders, last-user admission, and sync/unlink in both orders. Hook concrete model prototypes: restoring inherited mocks in existing suites can leave concrete own methods shadowing a BaseModel hook. Assertions retain exact persisted financial results.
- `tests/functional/accounts/ofxBalanceAuthority.spec.ts`: improve failure diagnostics to include actual/expected independently queried balances; no expectation or financial assertion weakened.
- This verification document.

Exploratory runs are not concealed: an early combined run reported 1,181 passed / 4 failed (two OFX command balance assertions, one command save-observation assertion, one Japa contention timeout). Isolated OFX (29/29), its preceding Account selection (106/106), final focused (1,185/1,185) and complete suite (1,902/1,902) subsequently passed without an OFX production or assertion-value change. The precise cause of those four transient failures was not established; retain this as a test reproducibility warning, not evidence of a repaired production defect. Earlier harness runs were interrupted after fixture/barrier problems; they are not acceptance results. Guards remained installed and no manual unguarded cleanup was used. The first HTTP start encountered occupied port3337; final runs used local3349.

### Final static/build verification and warnings

Both TypeScript projects, ESLint, Knip, circular regression, server build including client assets, separate client build, working-tree diff check and staged diff check pass. Final commands ran after the complete test suite. No check was suppressed or weakened.

Nonfatal warnings: Vite development HMR port24678 was occupied; production client bundle exceeds 500kB; pg warns about overlapping queries on one client in existing parallel work/guard verification. The circular checker recognizes the existing accepted 11-model Lucid component and reports no unexpected cycle. Expected injected/404/validation error logs are test evidence, not suite failures. Remote provider success cannot be rolled back with local SQL; existing provider removal may hold Budget across network work. Neither limitation was redesigned.

Logs: `/tmp/pg-staged-safety-unit.log`, `/tmp/pg-staged-focused.log`, `/tmp/pg-staged-pairs.log`, `/tmp/pg-staged-regressions-diagnostic.log`, `/tmp/pg-staged-full.log`, and `/tmp/pg-staged-final-*.log`. Logs are local execution artifacts, not staged repository files.

### Final preservation and authorization

The original staged patch is byte-for-byte unchanged, with the same 33 paths and SHA-256 above. Only the four test/document paths listed above have new unstaged work; unrelated untracked files remain untouched. No production correction was required or made. All database operations are complete and this task-specific authorization is now expired. No historical repair, monetary representation change, application schema migration, deployment or commit occurred.

### Final Git status

```text
M  app/Controllers/Http/CategoriesController.ts
M  app/Controllers/Http/FundingPlanController.ts
M  app/Controllers/Http/InstitutionController.ts
M  app/Controllers/Http/TaxesController.ts
M  app/Controllers/Http/TransactionsController.ts
M  app/Controllers/Http/UsersController.ts
M  app/validation/Validators/category.ts
D  app/validation/Validators/fundingPlan.ts
M  commands/CheckUnassigned.ts
M  commands/PlaidGetItem.ts
M  commands/PlaidRemoveItem.ts
M  common/ResponseTypes.ts
A  docs/account-delete-budget-serialization-implementation.md
M  docs/accounting-invariants.md
A  docs/budget-serialization-architecture.md
A  docs/group-budget-serialization-implementation.md
M  docs/monetary-migration-correctness-readiness.md
A  docs/monetary-precision-source-characterization.md
M  docs/post-reset-remaining-correctness-review.md
A  docs/provider-identity-budget-serialization-implementation.md
A  docs/remaining-budget-serialization-design.md
AM docs/staged-changes-verification.md
A  scripts/auditSplitTotals.mjs
M  start/routes.ts
 M tests/functional/accounts/ofxBalanceAuthority.spec.ts
AM tests/functional/concurrency/stagedBudgetWriters.spec.ts
M  tests/functional/funding/isolation.spec.ts
M  tests/functional/funding/recurrence.spec.ts
M  tests/functional/transactions/moneyPrecision.spec.ts
M  tests/unit/categoryPoolConcurrency.spec.js
A  tests/unit/precision/currentHandling.spec.js
A  tests/unit/remainingBudgetWriters.spec.js
A  tests/unit/splitTotalsAudit.spec.js
A  tests/unit/stagedBudgetVerification.spec.js
?? .adonisjs/
?? .vscode/settings.json
?? backup.sql
?? debertas.pem
?? dump.rdb
?? dump.sql
?? report.json
?? spendcraft.sql
?? stats.json
?? summary.md
?? test.html
?? test.js
?? test.ofx
?? test.sh
?? test2.ofx
?? tests/functional/concurrency/stagedWriterPairs.spec.ts
```

## Latest re-verification — 33-file staged snapshot

**STAGED CHANGES NON-DB VERIFICATION PASSED — POSTGRESQL AUTHORIZATION REQUIRED.**

This section supersedes the earlier failed/stale-index results retained below as history. HEAD remains `500cef52d2e0a9495db5992cd1fbb6903246dcc1`. The user staged the reviewed test updates, audit tests and both unused-declaration removals before this run. There were no tracked unstaged changes at the final run's start. The staged snapshot's SHA-256 is `73dfe0f3ec0f5d65d9e36346f53aa0003510b58218c72542b66c09240b35283e`; it is compared byte-for-byte again at completion. The index was not modified by verification.

### Current staged inventory

- `app/Controllers/Http/CategoriesController.ts`
- `app/Controllers/Http/FundingPlanController.ts`
- `app/Controllers/Http/InstitutionController.ts`
- `app/Controllers/Http/TaxesController.ts`
- `app/Controllers/Http/TransactionsController.ts`
- `app/Controllers/Http/UsersController.ts`
- `app/validation/Validators/category.ts`
- `app/validation/Validators/fundingPlan.ts`
- `commands/CheckUnassigned.ts`
- `commands/PlaidGetItem.ts`
- `commands/PlaidRemoveItem.ts`
- `common/ResponseTypes.ts`
- `docs/account-delete-budget-serialization-implementation.md`
- `docs/accounting-invariants.md`
- `docs/budget-serialization-architecture.md`
- `docs/group-budget-serialization-implementation.md`
- `docs/monetary-migration-correctness-readiness.md`
- `docs/monetary-precision-source-characterization.md`
- `docs/post-reset-remaining-correctness-review.md`
- `docs/provider-identity-budget-serialization-implementation.md`
- `docs/remaining-budget-serialization-design.md`
- `docs/staged-changes-verification.md`
- `scripts/auditSplitTotals.mjs`
- `start/routes.ts`
- `tests/functional/concurrency/stagedBudgetWriters.spec.ts`
- `tests/functional/funding/isolation.spec.ts`
- `tests/functional/funding/recurrence.spec.ts`
- `tests/functional/transactions/moneyPrecision.spec.ts`
- `tests/unit/categoryPoolConcurrency.spec.js`
- `tests/unit/precision/currentHandling.spec.js`
- `tests/unit/remainingBudgetWriters.spec.js`
- `tests/unit/splitTotalsAudit.spec.js`
- `tests/unit/stagedBudgetVerification.spec.js`

There are33 staged files. All staged production changes were inspected; the detailed changed-method/read-write inventory in the earlier section3 remains applicable. This snapshot additionally removes `app/validation/Validators/fundingPlan.ts`, `FundingPlanDetailsProps` and its now-unused private helper types, and includes the reviewed tests and implementation records. `scripts/auditSplitTotals.mjs` is a read-only operator tool, not an application financial writer or a migration. Its fixed count query and read-only collector were reviewed and tested offline; it was not executed against any database.

### Changed writers, lock and binding audit

- `CategoriesController.addGroup/updateGroup/deleteGroup/addCategory/updateCategory`: now owning-transaction Budget gate before fresh scoped Group/Category/dependency/name-uniqueness queries, followed by bound creation/save/delete. Existing catalog fields, current uniqueness scopes, direct-child deletion rules, errors and balances are preserved. Four validator filters now take required transaction metadata.
- `InstitutionController.updateOffline/addOfflineAccount/unlink/deleteAccount/delete`: now Budget-first fresh scoped Institution/Account state. The existing-Institution initialization still makes no transaction-tracked opening/Pool effect; balance-tracked Statements remain separate. Pool and Unassigned response reads are bound. The shared cascade helper is byte-identical to HEAD. Account/Institution deletion semantics are not silently changed or certified historically.
- `TransactionsController.dedup`: fresh active Budget-scoped Transaction on owner, duplicate marker only, void response unchanged.
- `TaxesController.post`: plain Budget/year lookup and save/create after Budget, replacing locking Tax upsert. Forecast replacement and public response remain unchanged. Tax actuals are intentionally a separate read-only default-connection calculation after commit. Existing duplicate tax rows are not repaired.
- `UsersController.delete`: owning Budget gate precedes User deletion and fresh remaining-member decision; existing graph cleanup uses the bound Budget and inherited related clients. Existing parallel deletion/error paths and remote ordering remain unchanged.
- `PlaidRemoveItem.run`: identity/scope discovery before gate; fresh ID/Budget/token lookup on owner, existing remote removal and two-field save afterward. `PlaidGetItem.run --fix`: existing external fetch stays before gate, fresh scoped token revalidation before item save; non-fix remains read-only.
- `CheckUnassigned.checkUnassigned`: one Budget transaction at a time, fresh locked Budget/Unassigned/empty-JSON Transaction+link reads, same JSON updates on owner. No new financial balance write. Per-Budget commits intentionally replace the former multi-Budget transaction; failure stops after rolling back the failing Budget while earlier commits remain.
- Funding-plan `getPlan`, `updateOrCreateCategory` and their GET-root/PUT-item routes are removed. Proposed funding GET and its FundingDialog caller remain; removed routes are expected to return404. Unused validator/types are removed in the index now.

All newly explicit serialization locks in these changed paths target Budget. No new Account, Category, Transaction, Institution, provider or configuration row prelock, advisory lock, version scheme or lower-resource-before-Budget write was introduced. Existing separate recovery/advisory machinery is unchanged and is not certified by this review. Cleanup-row-before-Budget exception is now present in staged architecture documentation; it does not approve advisory locks.

The actual installed Lucid query/relationship transaction inheritance was inspected. Group/Category uniqueness filters explicitly use the owning client; dependency/ownership queries and all protected saves use that owner or bound models. CLI stale discovery objects are not saved. The actual Plaid sync body is tested to refresh after Budget and refuse an earlier committed unlink. No new transaction-binding escape was found in the changed mutation work.

### Meaningful competitors and outstanding real concurrency acceptance

Catalog writers compete with same-name creation/rename and parent deletion/moves; Category settings compete with other settings and accepted funding writers. Unlink/identity commands compete with Plaid sync/setup. Account/Institution removal and creation/rename compete with posting, Statements and each other. Dedup competes with PATCH/DELETE. Tax first-save/update competes by Budget/year. User deletion competes with another member's deletion and same-Budget graph writers. CheckUnassigned competes with allocation PATCH/provider writers.

For each, the protected waiter must use the winner's committed state or the pre-winner state after rollback. Inert tests demonstrate gate ordering and simulated state composition, not database lock scheduling. Both real endpoint orderings, persistence, late rollback/retry, different-Budget independence, tenant security and financial noninterference remain PostgreSQL acceptance requirements. Deadlocks and lock timeouts cannot be ruled out by a non-DB pass.

No monetary arithmetic or representation was changed. Tests compare accepted financial model/controller methods and reporting bodies to HEAD. Account/Category eligibility, startDate, OFX authority, Plaid posting, funding/rebalance, opening and accepted report semantics remain preserved in source/non-DB regressions. Cascade reversals remain an independently deferred authority/eligibility issue; passing synchronization tests must not bless those calculations.

Known unchanged operational limitations: remote removal may hold Budget and cannot be rolled back after a later local failure; User cleanup retains parallel branches; existing-Institution Account creation retains a post-commit date validation path; report/tax reads are not newly guaranteed to be atomic snapshots. CheckUnassigned's existing normalization/version policy is not made universally valid by locking. These are recorded limitations, not newly implemented fixes.

### Fresh results against the now-staged changes

| Check | Passed | Failed | Skipped/pending |
| --- | ---: | ---: | ---: |
| Focused source/controller/client/precision/audit set |115|0|0|
| Standalone nondeprecated non-DB units (27 files) |478|0|0|
| App-dependent model serialization, fake mail and mocked Plaid errors |140|0|0|
| Anonymous SPA HTTP routes |3|0|0|
| **Complete runnable nondeprecated non-DB set** |**621**|**0**|**0**|

The focused tests are included in the full total. No stale test failure remains in the staged tests. The normal database-bootstrapping test entry point was not used. App-only tests ran under a guard blocking connections and reported zero network attempts. SPA tests permitted only local test HTTP and reported zero non-HTTP attempts. No PostgreSQL connection occurred. The Loan-only unit suite remains excluded as deprecated;61 pre-existing database-backed functional files and the prepared database suite remain unexecuted, not falsely counted as Japa skips.

Both server and client TypeScript checks, ESLint, **Knip**, circular regression, server build including client assets, separate client build, normal diff check and staged diff check pass. Circular regression retains the accepted11-model/26-edge component;421 analyzed files/498 repository nodes. Vite's existing over500kB bundle warning remains; no failure or dependency/schema change was introduced.

Five offline audit tests were added during the interrupted verification continuation and staged by the user before this final rerun. They exercise print-only mode, execution consent, injected read-only client sequencing, fail-closed target mismatch and rollback/redaction. The initial new-test exact-message mismatch and missing process import were corrected in that earlier test-only work; this final rerun has no such failures. No production change was made to satisfy a test.

### PostgreSQL preparation and authorization

The staged `tests/functional/concurrency/stagedBudgetWriters.spec.ts` contains60 executable prepared cases, type-checked but NOT RUN:39 generic HTTP gate commit/rollback/different-Budget cases;2 tax-first-save orderings;1 late tax rollback;2 Category settings orders;4 CLI identity/token cases;1 CheckUnassigned freshness case;10 foreign-target cases;1 Account late-cascade rollback. Existing relevant PostgreSQL files and remaining pair-specific expansion needs are inventoried in the earlier section9. Preparation is not acceptance, and a generic held gate is not proof of every pair of real writers in both orders.

Every future destructive operation, setup/reset and cleanup must independently verify configured/live pg, pgLog and the exact execution connection, only on `localhost:5432/spendcraft_test`. Prior authorization remains expired. The prepared suite uses centralized guards and deterministic gate/save barriers, without arbitrary sleeps, and adds no unguarded direct cleanup helper. No database test or destructive SQL ran here.

### Final preservation / artifacts

Only this verification report is updated after the user staged the final snapshot; the report update remains unstaged. No further tests were needed beyond the now-staged reviewed coverage. The33-file index is unchanged byte-for-byte. All original production, test and documentation changes and unrelated untracked files remain intact; no runtime source was changed during this final verification. The two previously unstaged cleanup files are now staged. No deployment or commit occurred.

Final status: the33 staged files listed above remain staged, with `docs/staged-changes-verification.md` additionally modified in the working tree (`AM`). Existing untracked generated/editor, backup/PEM and scratch paths listed in the earlier Git status remain untouched. The exact final status is captured in `/tmp/staged-review-3-final-status.txt`; final preservation checks compare the index to `/tmp/staged-review-3-index.patch` and every other unstaged path to its entry state.

**Confirmed:** existing staged work preserved; no production runtime change during verification; no database connection or destructive operation; no historical repair; no monetary representation change; no schema migration; no deployment; no commit.

## Earlier verification records — historical, superseded by the latest results above

## 1. Baseline, preservation and decision

HEAD: `500cef52d2e0a9495db5992cd1fbb6903246dcc1`.

**STAGED CHANGES VERIFICATION FAILED — CORRECTIONS REQUIRED.** The working-tree non-DB regressions pass, but the index is not a self-contained passing change set: its writer tests retain superseded expectations, several necessary test updates are unstaged, and Knip fails on newly orphaned funding-plan declarations. No new production concurrency defect was demonstrated by this non-DB review. PostgreSQL acceptance is not established.

AGENTS.md was read before review. The complete staged diff, production diff, staged documentation/test additions, unstaged diff and relevant untracked-file names were inspected. The index and all existing unstaged diffs were saved outside the repository and compared byte-for-byte at completion. Neither was modified. Staged-patch SHA-256: `25d25df3aa8b953acf44b5f945c91b278091c746c4f84bb2c1c4f45392df4106`.

No production source, existing test, existing documentation, index, schema or historical data was changed during verification. Only the three new files listed below were created, all unstaged. Existing untracked implementation records and audit script were read or identified where relevant; SQL backups, PEM material and unrelated scratch files were not examined or executed. No operational command was run against a real database/provider.

## 2. Staged-file inventory (19)

- `app/Controllers/Http/CategoriesController.ts`
- `app/Controllers/Http/FundingPlanController.ts`
- `app/Controllers/Http/InstitutionController.ts`
- `app/Controllers/Http/TaxesController.ts`
- `app/Controllers/Http/TransactionsController.ts`
- `app/Controllers/Http/UsersController.ts`
- `app/validation/Validators/category.ts`
- `commands/CheckUnassigned.ts`
- `commands/PlaidGetItem.ts`
- `commands/PlaidRemoveItem.ts`
- `docs/accounting-invariants.md`
- `docs/budget-serialization-architecture.md`
- `docs/monetary-migration-correctness-readiness.md`
- `docs/monetary-precision-source-characterization.md`
- `docs/post-reset-remaining-correctness-review.md`
- `docs/remaining-budget-serialization-design.md`
- `start/routes.ts`
- `tests/unit/precision/currentHandling.spec.js`
- `tests/unit/remainingBudgetWriters.spec.js`

The first ten files are production controllers, validators and commands; `start/routes.ts` is the other production file. The six documents contain architecture/design/precision characterization, and the two unit files contain characterization tests. There are no client-runtime, model, provider, migration or dependency changes in the staged diff.

## 3. Changed-method inventory

All newly gated HTTP writers authorize via the authenticated user's Budget relationship. Budget-scoped target lookups remain in place. Budget is acquired in the owning transaction before authoritative target/state reads. Public routes, fields and responses are retained except the explicitly removed funding-plan endpoints.

| File / method | Previous → staged behavior; reason | Reads → writes; transaction / financial effects |
| --- | --- | --- |
| `app/Controllers/Http/CategoriesController.ts` `addGroup` | Ungated read/validate/create → managed Budget transaction; serial name/parent admission | NoGroup, name uniqueness, optional scoped parent → new Group; explicit new-model binding; no balance effect |
| Same file, `updateGroup` | Ungated target/validator/save → gate then fresh target and dependencies | Group/NoGroup/parent/uniqueness → name, hidden, parent; same transaction; no new hierarchy rule |
| Same file, `deleteGroup` | Unprotected usage check/delete → gate then fresh scoped Group and Category-membership query | Direct child Categories → Group deletion or existing 409; same transaction; no child-Group policy added |
| Same file, `addCategory` | Ungated parent/uniqueness/create → gate then fresh admission | Group, name uniqueness, funding Category ownership → zero-balance Category and unchanged configuration; bound new model |
| Same file, `updateCategory` | Stale Category snapshot possible → gate then fresh Group/Category/uniqueness/reference state | Current optional fields → name/group/type/visibility/funding settings; same transaction; no Category balance arithmetic |
| `app/validation/Validators/category.ts` four Group/Category unique filters | Default connection → required transaction metadata and `useTransaction` | Existing table/column/name scope and exclusion predicates preserved; callbacks introduce no other lock |
| `app/Controllers/Http/InstitutionController.ts` `updateOffline` | Existing transaction without gate → Budget before fresh Institution | Scoped Institution → name only; unchanged response |
| Same file, `addOfflineAccount` | Budget loaded outside transaction, Unassigned read escaped → gated Budget and explicit Pool/Unassigned transaction clients | Scoped Institution, response balances → Account and optional initial Statement; transaction tracking still creates no opening/Pool effect; pure validation before lock |
| Same file, `unlink` | Existing transaction without gate → gate before fresh identity/Account/link state | Institution credentials/item/cursor, Account provider IDs, AccountTransaction provider IDs cleared; remote removal inside gate; no balances/allocations changed |
| Same file, `deleteAccount` | Budget loaded outside transaction before try → transaction-bound gate inside rollback boundary | Fresh scoped Institution/Account, existing cascade reads → unchanged Category/Unassigned/Pool reversal and row cleanup; Account query explicitly transaction-bound |
| Same file, `delete` | Budget loaded outside owner → gate before fresh Institution/Accounts | Same shared cascade plus Institution deletion; remote removal still precedes local cascade, now under Budget |
| `app/Controllers/Http/TaxesController.ts` `post` | Default-connection locking `updateOrCreate` → managed Budget transaction with plain scoped lookup/save/create | Budget/year Tax → full forecast JSON replacement; existing duplicates untouched; specialized actuals read remains outside transaction after commit |
| `app/Controllers/Http/TransactionsController.ts` `dedup` | Default target/save → fresh active Budget-scoped target under gate | Transaction → duplicate marker null only; no version/allocation/balance change; void response retained |
| `app/Controllers/Http/UsersController.ts` `delete` | User deleted before ungated last-user decision → Budget gate before User deletion and fresh member query | User/Budget graph → User and, if last, existing graph cleanup; related models inherit owning transaction; remote work and parallel cleanup unchanged |
| `commands/PlaidRemoveItem.ts` `run` | Ungated token lookup/remote/save → ID/Budget discovery, managed gate, fresh ID/Budget/token match | Institution identity → remote removal then token/item null only; cursor/Account IDs retain existing CLI semantics |
| `commands/PlaidGetItem.ts` `run --fix` | Remote response then ungated save → owning gate and fresh ID/Budget/token revalidation before item save | Token discovery/provider item → item ID only; network stays before gate; non-fix remains read-only; changed/missing token causes no write |
| `commands/CheckUnassigned.ts` `checkUnassigned` | One transaction and cross-Budget Promise.all → sequential per-Budget managed transactions, fresh locked Budget | Empty JSON Transactions with AccountTransaction, scoped Unassigned → existing JSON assignment only; relationship/preload/saves use owner; no Category balance change |
| `app/Controllers/Http/FundingPlanController.ts` `getPlan`, `updateOrCreateCategory`; `start/routes.ts` | Method and GET root / PUT item routes removed by explicit user direction | Removes old reads and an ungated configuration writer; proposed-funding GET and active FundingDialog caller remain unchanged |

Configuration-only changes retain fields, arithmetic and validation predicates. Some endpoints now check Budget existence before target lookup; tax and existing-Institution creation perform pure validation before Budget acquisition. These can change error precedence for malformed requests combined with missing Budget state, not authorized-target mutation semantics. No new public concurrency error is added.

## 4. Budget-lock and transaction-binding audit

- All 13 changed HTTP writers and three changed command mutation paths now request the owning Budget gate. No explicit Account/Category/Institution/Transaction/Tax lock was introduced.
- No new advisory lock, version scheme or second lock hierarchy was added. Existing cleanup-row/advisory recovery code is unchanged; this review does not certify that separate lifecycle. The latest user exception permits cleanup-row-before-Budget ordering, but that amendment exists only in unstaged documentation at entry.
- Group/Category dependency and uniqueness queries use the gate owner, including the actual installed Vine filter callback. Funding Category ownership helpers receive `{ client: trx }`.
- Installed Lucid relationships use the parent transaction; new Group/Category/Account models are explicitly bound. Cascades use `budget.$trx` for Transaction/link/Category/Unassigned/BalanceHistory cleanup queries. Related child saves/deletes inherit the owner. No shared cascade helper changed.
- CLI discovery uses default reads only to establish identity/scope; both commands reload ID/Budget/token after the gate. Get-item's remote result is applied only if that identity remains matched. Plaid sync already refreshes Institution after acquiring Budget and refuses a null access token; an added executable inert regression proves this waiter's behavior.
- CheckUnassigned discovers Budget IDs outside transactions, then freshly queries each Budget and target JSON/link state inside its transaction. Its distinct Transaction saves remain parallel; no shared Category balance object is mutated. It never intentionally holds multiple Budget locks. A disappearing discovered Budget aborts through existing log-and-return error handling.
- Tax actuals intentionally use their existing default-connection read-only helper after forecast commit. Response is not an atomic forecast+actuals snapshot; this is unchanged, and there is no protected write on that connection.
- No changed path writes a lower resource before acquiring Budget. The pre-authenticated User is used for identity/ownership; last-user deletion does not save stale User fields. It queries remaining membership after waiting.
- AddOfflineAccount retains a pre-existing post-commit `startDate.toISODate()` check that can throw and enter its rollback catch after commit. This is unchanged, not silently repaired or treated as rollback acceptance.

## 5. Concurrency and lifecycle risks

| Writer set | Meaningful competitor / both serial outcomes to verify in PostgreSQL |
| --- | --- |
| Group/Category catalog | Same-name create/rename; Group deletion vs Category creation/move. First committer controls fresh uniqueness/parent/membership checks; waiter must receive the existing validation/404/409 outcome |
| Category settings | Another settings request or gated funding/posting writer. Fresh optional-field application must produce a valid serial state; no stale dirty-field hybrid |
| HTTP unlink / CLI identities | Plaid sync, setup or each other. Sync-first then unlink clears committed identity; unlink-first makes waiter reject/skip without resurrection; stale CLI provider response must not reconnect |
| Account/Institution deletion | CREATE, PATCH, startDate, Statement, sync, initialization. Posting-first leaves fresh graph for cleanup; parent-delete-first makes waiter reject missing scope. Financial reversal authority remains separate |
| Existing-Institution creation/rename | Gated parent deletion. Creation/rename-first is visible to deleter; deletion-first causes a fresh missing-target error |
| Dedup | PATCH/DELETE. Only marker changes after fresh active lookup; deletion-first rejects |
| Tax forecast | Same Budget/year first save/update. One creation and a complete last serial forecast; no absent-key duplicate insertion among cooperating requests |
| Last-user deletion | Other user's deletion and same-Budget writers. The final member performs one cleanup; waiter sees committed or rolled-back graph |
| CheckUnassigned | Allocation PATCH/provider posting. PATCH-first removes target from fresh empty-JSON selection; command-first is observed/replaced by later supported writer |

These are source/inert findings, not observed PostgreSQL schedules. Existing recovery races, ungated metadata, missing constraints and independent cleanup completeness are not fixed by asserting a Budget gate. Real contention, deadlocks (40P01), unexpected lock timeouts and different-Budget progress still require database acceptance.

Provider removal in unlink, remove-item, Institution deletion and last-user cleanup can hold Budget across network work. Remote success cannot be rolled back when later local persistence fails. Get-item keeps its network call outside Budget and revalidates afterward. No remote compensation semantics were changed.

CheckUnassigned now commits each Budget separately; if a later Budget fails, prior committed Budgets remain changed and subsequent Budgets are not processed. Its selected types/deleted-state policy and absence of logs/version updates are unchanged. Serialization does not certify that filling every selected empty allocation is appropriate. No command was run against actual stored data.

User graph cleanup retains Promise.all branches; a rejection does not cancel siblings. Existing `users/deletionOrder`, `deleteErrors` and rollback tests must assess pending operations and transaction completion. This review does not newly certify those pre-existing failure paths or incomplete dependent-row cleanup.

## 6. Financial noninterference and deferred authority

An added test compares entire Account/Institution model files, AccountsController and ReportController to HEAD and compares unchanged financial methods: `deleteAccounts`, `addOffline`, online `add/update`, Transaction PATCH/DELETE, Category transfer/DELETE and tax actuals. All comparisons pass. No balance arithmetic, monetary type, accounting eligibility, opening rule, OFX authority, Plaid financial algorithm, report authority or funding/rebalance calculation changed. Category/Pool/income report regressions pass in the non-DB suite.

Cascade behavior now runs under Budget but its subtraction rules remain unchanged. Current allocations do not independently prove historical applied effects. Ordinary pre-start reversal remains tracked as deferred. Successful concurrency tests must not certify historical reversal, Loan accounting or deprecated relational allocation authority. Loans and the complete transaction_categories architecture remain excluded; their physical remnants were not changed or migrated.

## 7. Existing tests executed and results

Normal `npm test` was NOT used: its shared bootstrap verifies/connects and truncates PostgreSQL even for a unit selection. Standalone Japa was used for pure/source/client files, with only the assert plugin. Application-dependent non-DB tests used a temporary Ignitor runner without tests/bootstrap.ts or database lifecycle hooks. A socket guard rejected all network access; it recorded zero attempts. SPA tests used a separate HTTP-only guarded runner permitting only local port3335; zero other connection attempts occurred. Initial sandbox listener denial was resolved by running the same guarded runner with approved local-listener permissions. No PostgreSQL connection was attempted.

| Run | Passed | Failed | Skipped/pending | Scope |
| --- | ---: | ---: | ---: | --- |
| Focused existing working-tree source/client/precision tests |104|0|0| Remaining writers, accepted Account/Pool concurrency, funding preview/configuration, precision characterization |
| Added non-DB verification file |6|0|0| Four real validator callbacks, Plaid post-unlink fresh reload, unchanged-method isolation |
| Complete standalone nondeprecated non-DB unit set, final |473|0|0|26 files, including the six added cases |
| App-dependent unit suites |140|0|0| Mailbox/fake mail, model serialization, mocked Plaid errors; zero network attempts |
| Non-DB SPA HTTP suite |3|0|0| /, /signin, /signup |
| **Combined complete runnable nondeprecated non-DB set** |**616**|**0**|**0**|Working tree, not index-only acceptance |
| **Isolated staged remainingBudgetWriters snapshot** |**1**|**4**|**0**|Copied verbatim from index into /tmp; reads production code, which matches index |

Focused runs are subsets of the combined totals, not additional test counts. The first isolated-index command had a temporary Japa path-resolution setup error; corrected invocation produced the 1/4 result above. The CheckUnassigned staged timeout is a stale inert harness waiting for removed behavior, not an observed database lock timeout.

The deprecated Loan-only unit suite was deliberately excluded because no Loan production path changed. The other61 pre-existing functional files require persisted/database-backed fixtures or routes that write the database and were not executed; the new functional file was also not executed. The full DB suite is excluded, not counted as skipped Japa cases. Existing model/mail/provider suites do not require database queries and were included via safe app-only boot.

## 8. New tests (unstaged)

- `tests/unit/stagedBudgetVerification.spec.js`: six tests exercising current validator filter code and active sync behavior and checking financial/reporting noninterference.
- `tests/functional/concurrency/stagedBudgetWriters.spec.ts`: **60 prepared cases**, type-checked but never executed. Thirteen HTTP writers × commit/rollback/different-Budget barriers =39; two tax first-save request orderings; one late tax rollback; two complete Category-settings orderings; four provider CLI/token cases; one CheckUnassigned post-wait selection case; ten foreign-target cases; one late Account-cascade rollback.
- `docs/staged-changes-verification.md`: this report.

The prepared DB suite uses centralized `installDatabaseSafety` and the accepted bootstrap; every destructive statement independently checks configured/live pg, pgLog and the exact execution connection. No manual truncate/reset/temp object/deletion cleanup was added. Its returned teardown independently verifies before closing its guard. Barriers use held Budget transactions, post-save hooks and observed pg_blocking_pids; wall-clock timers are failure deadlines, not sleep-based scheduling. All mocked provider calls stay local. The suite asserts persistence, current known-effect state, fresh funding settings, tenant security, raw rollback snapshots and no duplicate first tax row.

These prepared cases are not exhaustive certification: remaining full provider sync-versus-unlink orderings, command-first overlap, concurrent last-user endpoints, catalog collision/delete/move outcomes, cascade special lifecycles and complete financial raw-state matrices should be expanded and exercised in the later authorized DB task. Existing suites listed below provide much of the financial/lifecycle characterization. Do not mistake generic gate-holder cases for every pair of real endpoints winning in both orders.

## 9. Existing PostgreSQL acceptance inventory (NOT RUN)

| Area | Existing relevant files / missing acceptance |
| --- | --- |
| Catalog / settings | `tests/functional/categories/categories.spec.ts`, `isolation.spec.ts`, `deletionLifecycle.spec.ts`, `budgetRollbackOrder.spec.ts`; funding `configuration`, `recurrence`, `isolation`, `aggregateIsolation`. Add real simultaneous uniqueness/deletion-admission pairs |
| Institution / Account lifecycle | `tests/functional/institutions/isolation.spec.ts`, `onboarding.spec.ts`, `plaidSync.spec.ts`, `plaidConcurrency.spec.ts`, `plaidCredentials.spec.ts`, `cleanup.spec.ts`, `cleanupAdversarial.spec.ts`; account `creationIsolation`, `isolation`, `openingSnapshot` |
| Account/Pool concurrency | `tests/functional/concurrency/accountBalanceWriters.spec.ts`, `categoryPoolWriters.spec.ts`; existing acceptance records establish prior baseline only |
| User graph cleanup | `tests/functional/users/users.spec.ts`, `deleteErrors.spec.ts`, `deletionOrder.spec.ts`, `rollbackOrder.spec.ts`; add actual simultaneous last-two-user deletion and teardown-vs-financial-writer orders |
| Tax | `tests/functional/taxes/isolation.spec.ts`; new suite adds forecast first-save contention, persistence, rollback and cross-Budget independence |
| Transaction / marker | `tests/functional/transactions/isolation.spec.ts`, `lifecycle.spec.ts`, `eligibility.spec.ts`, `postCommit.spec.ts`, `statementResponse.spec.ts`, `moneyPrecision.spec.ts`; add dedup-versus-delete/PATCH endpoint orders |
| Accepted accounting regressions | Account `startDate`, `trackingInvariant`, `ofxBalanceAuthority`, `ofxReimport`, `statementCorrectness`, `statementEligibility`, `statementDeletion`, `statementReconciliation`, `balanceHistoryAuthority`; funding `previewSubmission`, `replacementAdmission`; categories `conservation`, `legacyTransferDelete` |
| Read-only report isolation | `tests/functional/reports/allocationAuthority.spec.ts`, `incomeFanout.spec.ts`, `networthHistory.spec.ts`, `networthInitialFunding.spec.ts`, `security.spec.ts` |

Later DB authorization must be task-specific for **localhost:5432/spendcraft_test only**, with independent configured/live pg, pgLog and destructive execution-connection safeguards immediately before setup and every destructive operation/cleanup. Nothing in this review grants it.

## 10. Static/build results

| Check | Result |
| --- | --- |
| Server TypeScript (`npx tsc --noEmit -p tsconfig.json`) | PASS, including prepared DB tests |
| Client TypeScript (`npx tsc --noEmit -p client-src/tsconfig.json`) | PASS |
| ESLint | PASS final; an empty logger stub in the newly added verification test initially failed lint and was corrected without changing production or existing files |
| Knip | **FAIL**: unused `app/validation/Validators/fundingPlan.ts`; unused exported `FundingPlanDetailsProps` at `common/ResponseTypes.ts:492` |
| Circular dependency regression | PASS: accepted11-model/26-edge SCC; no new cyclic component;418 files/495 nodes after added tests |
| Server build including client assets | PASS |
| Separate client build | PASS |
| Working-tree diff check | PASS |
| Staged diff check | PASS |

Warnings separate from failures: Vite bundle over500kB; SPA HMR port24678 already occupied, while all three HTTP tests passed. No HMR configuration was changed. Build/log output and temporary runners are in /tmp/staged-verification-* and /tmp/spendcraft-staged-verification; none are staged or production changes.

## 11. Failures, recommended minimal corrections and open concerns

1. **Staged tests are stale (commit blocker).** The index version of `tests/unit/remainingBudgetWriters.spec.js` still expects ungated unlink and CLI writers, stale CheckUnassigned overwrite, and a Category hybrid. Against staged production it yields1 pass/4 failures. Its corrected replacement is already unstaged; preserve it and review/stage deliberately. This verification did not stage it.
2. **Other necessary test changes are unstaged (commit blocker).** `tests/unit/categoryPoolConcurrency.spec.js` still has index-only expectations that existing-Institution initialization and cascades are ungated. The index versions of functional funding `isolation`, `recurrence` and Transaction `moneyPrecision` still expect removed funding-plan APIs to succeed. These existing working-tree updates were present at entry and remain untouched. Database-backed failures are inferred from removed routes, not falsely reported as executed failures.
3. **Knip leftovers (commit blocker under required checks).** Remove or otherwise explicitly retire the now-unused funding-plan validator and unused response type after review. No suppression or runtime correction was applied. Any adjacent private types becoming unused should be handled in that focused follow-up.
4. **Staged documentation is stale.** It still says several changed writers are ungated/design-only, Tax upsert remains active, funding-plan PUT must participate, and additional provider/catalog work has not happened. The cleanup-row exception and later implementation statuses largely exist only unstaged or in untracked implementation records. Reconcile the staged record with the final code rather than presenting old tables as current verified state.
5. **Real database acceptance pending.** Inert adapters show code ordering and simulated serial composition, not PostgreSQL persistence, actual model transaction propagation, constraint behavior, rollback timing or deadlock freedom. Historical reversal remains separately unresolved under this task's instructions; no arithmetic inference or repair was made.

No product decision was invented to bypass these findings. The smallest next step is test/documentation staging reconciliation plus unused-declaration cleanup, followed by fresh authorized PostgreSQL verification. Production code was not changed to make any test pass.

## 12. Final Git status and preservation

The following status includes the existing work and the three new unstaged verification artifacts. Untracked implementation records, audit script, backups and scratch material predate this review and were preserved.

```text
M  app/Controllers/Http/CategoriesController.ts
M  app/Controllers/Http/FundingPlanController.ts
M  app/Controllers/Http/InstitutionController.ts
M  app/Controllers/Http/TaxesController.ts
M  app/Controllers/Http/TransactionsController.ts
M  app/Controllers/Http/UsersController.ts
M  app/validation/Validators/category.ts
M  commands/CheckUnassigned.ts
M  commands/PlaidGetItem.ts
M  commands/PlaidRemoveItem.ts
M  docs/accounting-invariants.md
AM docs/budget-serialization-architecture.md
MM docs/monetary-migration-correctness-readiness.md
A  docs/monetary-precision-source-characterization.md
MM docs/post-reset-remaining-correctness-review.md
AM docs/remaining-budget-serialization-design.md
M  start/routes.ts
 M tests/functional/funding/isolation.spec.ts
 M tests/functional/funding/recurrence.spec.ts
 M tests/functional/transactions/moneyPrecision.spec.ts
 M tests/unit/categoryPoolConcurrency.spec.js
A  tests/unit/precision/currentHandling.spec.js
AM tests/unit/remainingBudgetWriters.spec.js
?? .adonisjs/
?? .vscode/settings.json
?? backup.sql
?? debertas.pem
?? docs/account-delete-budget-serialization-implementation.md
?? docs/group-budget-serialization-implementation.md
?? docs/provider-identity-budget-serialization-implementation.md
?? dump.rdb
?? dump.sql
?? report.json
?? scripts/auditSplitTotals.mjs
?? spendcraft.sql
?? stats.json
?? summary.md
?? test.html
?? test.js
?? test.ofx
?? test.sh
?? test2.ofx
?? tests/functional/concurrency/stagedBudgetWriters.spec.ts
?? tests/unit/stagedBudgetVerification.spec.js
?? docs/staged-changes-verification.md
```

At completion, `git diff --cached` and the pre-existing `git diff` remain byte-identical to their saved originals; new untracked files are not included in those comparisons. Exact final status is also captured in /tmp/staged-verification-final-status.txt. No files were staged, unstaged, reset, restored or committed.

Confirmed: no production runtime change during verification; no database connection/destructive operation; no historical repair; no monetary representation or schema change; no deployment; no commit.

## Follow-up: test expectation review

At the user's subsequent request, the working-tree tests were checked against current source and explicit product direction. Their substantive expectations already cover fresh Budget-first reads, owning-transaction writes, serial Category settings, no provider-identity resurrection, unchanged initialization/cascade arithmetic, and removed funding GET/PUT routes returning404. The remaining funding proposed GET is still expected to succeed. The installed Lucid upsert race test is a helper characterization, not an assertion that Tax.post still uses that helper. The pre-start CREATE→DELETE contradiction deliberately remains a known-defect characterization because that correction is deferred.

This follow-up changes tests only: clarify old offline/funding test names; explicitly require lock presence before testing order (so indexOf=-1 cannot falsely pass); assert both deletion entry points gate while the shared cascade adds no second gate; and tighten prepared HTTP success status from any2xx to the existing exact200/204 contracts. No business expectation was weakened to hide a production defect. Affected files are `tests/unit/categoryPoolConcurrency.spec.js`, functional funding `isolation.spec.ts`/`recurrence.spec.ts`, Transaction `moneyPrecision.spec.ts`, and the new prepared `concurrency/stagedBudgetWriters.spec.ts`.

Follow-up verification:110 focused non-DB tests passed,0 failed/skipped; server TypeScript and ESLint passed; both diff checks passed. DB-backed expectations were reviewed/type-checked but not executed. No runtime or index change occurred. **The index still contains the stale versions identified above until the user deliberately stages the reviewed test changes.** This follow-up does not resolve the separate Knip unused-declaration failures or grant PostgreSQL authorization.
