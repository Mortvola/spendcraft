# CategoryTransfer DELETE deprecation PostgreSQL verification

## Baseline and scope

Verification HEAD: `03b3a89d9e9d537b1d9f0b0a090ec6645282f3ef`. Existing staged deprecation implementation/tests/docs and unrelated untracked files were preserved; no index mutation, reset or commit occurred. Accepted Account-writer serialization, OFX authority, BalanceHistory runtime deprecation, ordinary eligibility/startDate, funding preview/submission, immutable funding date and replacement-admission corrections remain present.

The correction removes legacy CategoryTransfer DELETE rather than repairing it. No production source changed during verification. Comparing parsed CategoriesController method source against HEAD establishes **all12 retained methods byte-identical**, including transfer, Category deletion and reporting helpers; only transferDelete and its import were removed. The sole DELETE registration and its otherwise-unused CategoryTransfer/CategorySplit wrappers are absent. TransactionsController, validator, client/shared source and migrations are unchanged by deprecation.

## Database safety

The sole authorized destructive target was `localhost:5432/spendcraft_test`. Before execution, inspected current tests/bootstrap.ts, tests/helpers/databaseSafety.ts, pg/pgLog configuration, returned teardown and all10 prepared cases/related fixture paths. All27 standalone inert safeguard tests passed first. No test-infrastructure correction was necessary.

Configured pg and pgLog independently reported host `localhost`, port5432, database `spendcraft_test`. Independent live identities for each reported database `spendcraft_test`, port5432, server `::1/128`, peer `::1/128`. Credentials are not recorded; no DB configuration was redirected. HTTP used port3349, which does not change PostgreSQL port5432.

Immediately before every destructive SQL operation, the accepted Knex driver guard independently revalidates configured/live pg AND pgLog plus the exact execution connection. Transaction clients inherit interception. Bootstrap explicitly verifies before setup; returned teardown independently verifies before cleanup with interception still installed. Fixture inserts/deletes and existing regression-test temporary constraints/cleanup use the same guarded driver. New deprecation tests add no destructive cleanup helper, direct pg connection, temporary table or DDL. Full test source scan found no separate pg/psql bypass. Setup evidence is never substituted for later cleanup verification.

## Core route/security acceptance

Initial narrow run: **10 passed,0 failed,0 skipped/pending**,748 independent safety checks/745 guarded SQL operations including returned teardown. Strengthened the six route cases before execution to give the foreign Category balance100, instrument Category.prototype.save to fail if invoked during the request, and inspect the real controller prototype. No production correction was needed.

Own IDs, foreign IDs, missing/guessed IDs, collection DELETE, plural and nested paths all return404 through the real HTTP router. Every case records zero Category/Pool save invocations, unchanged raw Transaction/Category/Account/AccountTransaction/log rows and unchanged legacy-table presence. The foreign Category remains exactly100, rather than the pre-removal inert counterexample's90. The controller prototype has no transferDelete. Source/AST route audit shows only modern POST/PATCH under /category-transfer, with no DELETE alias, proxy, stub or financial replacement.

The original legacy transfer-ID fixture cannot be recreated in the current schema because its tables are absent. The foreign-ID HTTP case therefore tests route absence using foreign Category IDs; it does not falsely claim to exercise legacy-table lookup. Route absence is independent of the supplied ID and closes the former financial code path. The original100→90 actual-method reproduction remains historical evidence in the deprecation record.

## Historical tables and cleanup applicability

Before constructing any historical fixture, reviewed current/archived migrations. Bootstrap reported existing migrations up to date. Read-only live schema probes reported **category_transfers=false; category_splits=false**. This is baseline schema, not a table removal performed by this task. The current transaction_categories table is a separate retained allocation/report/Loan schema, not recreated deprecated transfer storage.

Consequently, historical CategoryTransfer row inertness and legacy-specific FK/parent cleanup are **not applicable to this test schema**. No legacy row was inserted, migrated, normalized or deleted, and neither table was recreated. Conditional fixture branches do not run when tables are absent. Do not interpret passing absence snapshots as retained-row execution coverage.

The two general parent regressions still pass: deleting an empty Category returns204 and last-user Budget deletion returns200, without legacy-table runtime dependence. These prove current cleanup is intact, not a newly certified old-table cascade policy. Original archived legacy definitions contain plain integer references rather than FKs; installations with independently retained/altered legacy tables require separate schema/retention characterization before physical cleanup.

## Modern behavior and isolation

The core type2/type3 cases create allocations+10/Pool−10, replace with+20/−20, then delete through the existing Transaction DELETE lifecycle. Category0/Pool100 becomes10/90, then20/80, then0/100. Type2 retains March1; type3 replacement permits April1. No call uses the removed DELETE endpoint.

Broader funding regressions preserve original preview2/posting2, fixed/percentage/goal/mixed/transfers/residual/baseAmount, immutable-date rejection and replacement admission. Ordinary Transaction DELETE retains its current historical-reversal limitations; it is not replaced, guarded or redesigned here. Current Category deletion, ordinary eligibility, OFX, Statements, initialization, Plaid, Loans, Budget contention/fresh reload and late rollback run as accepted regression slices. The known0.30000000000000004 artifact and current rounding/priority remain unchanged.

The conditional type1 CategoryTransferDialog and TrxDialog branch remain compiled/reachable for type1 records and expose no legacy DELETE action. Their existing POST/PATCH payload omits the currently required type; this compatibility limitation was not repaired. Client source and build verification establish this boundary; no browser end-to-end interaction is claimed. Modern State.Transaction.delete continues targeting /transaction/:id; success/rejection cache tests remain unchanged.

## Final production reference audit

| Remaining source | Classification / reason |
| --- | --- |
| start/routes.ts | Active modern POST/PATCH /category-transfer only; no legacy DELETE |
| app/Controllers/Http/CategoriesController.ts | Active Transaction-backed transfer method/validator reference; no transferDelete/model/raw old-table reference |
| app/validation/Validators/categoryTransfer.ts | Modern POST/PATCH validation; no DELETE validator |
| common/ResponseTypes.ts | CategoryTransferProps and insert/update guards used by modern financial DTOs |
| client-src/State/Register.ts, State/Transaction.ts, State/Types.ts | Modern POST/PATCH methods/contracts; separate Transaction DELETE |
| client-src/Funding/FundingDialog.tsx, Rebalance/RebalanceDialog.tsx | Active modern editors, using Transaction-owned deletion |
| client-src/CategoryTransferDialog.tsx, Transactions/TrxDialog.tsx | Conditional non-DELETE type1 compatibility UI |
| client-src/CategorySplits.tsx, CategorySplitItem.tsx, Transactions/TransactionDialog.tsx | Shared ordinary allocation editing, not old model/table authority |
| Categories/Rebalances.tsx, Categories/CategoryView/CategoryView.tsx, Funding/FundingItem.tsx | Generic “Category Transfers” labels for modern type3/system Category behavior |
| TransactionsController.ts | Generic/commented “category splits” terminology, unrelated to old wrappers; unchanged |

No production CategoryTransfer/CategorySplit wrapper, category_transfers/category_splits query, standalone deletion helper, command/job/provider replacement, client DELETE caller or alternate route remains. No external SDK/documented supported DELETE contract was found. Archived create/alter/drop/rename migrations, test fixtures/boundaries, generated compiler metadata and historical documents remain classified in [the complete inventory](category-transfer-delete-deprecation.md). No unexplained reachable DELETE path or active product dependency was found.

## Results and future boundary

Final results are recorded below. Existing injected failures intentionally emit error logs for rollback assertions; they are not unexplained failures. This task authorizes no Category/Pool concurrency fix, Transaction DELETE policy, report/Loan correction, money representation change or physical schema cleanup. Any future retained-table cleanup requires separate product scope and database authorization.

Focused acceptance: **1,171 passed,0 failed,0 skipped/pending**. The run recorded51,749 independent checks protecting51,746 destructive SQL operations, including returned cleanup. All10 narrow cases remained passing. Both TypeScript checks, ESLint, Knip and circular regression pass (only accepted11-model/26-edge component;405 analyzed files). Server and separate client builds pass. Existing test Vite HMR port24678 occupancy and build chunks above500kB are nonfatal warnings; none was suppressed. No deadlock or unexpected lock timeout was observed in focused acceptance. Standard/staged diff checks pass.

## Final acceptance and authorization expiration

**ACCEPTED. Complete suite:1,526 passed,0 failed,0 skipped/pending.** Its fresh bootstrap independently reverified both targets, and60,810 checks protected60,807 destructive SQL operations, including returned cleanup. Smaller safety-counter lines are inert unit-test driver fixtures, not additional database targets. No unexpected500, deadlock or lock timeout remained. Expected injected500/security404 logs are test assertions.

Both TypeScript checks, ESLint, Knip, circular regression, server build, separate client build and normal/staged git diff checks pass after final test changes. New verification documentation is separately whitespace-checked. Verification changed only tests/functional/categories/legacyTransferDelete.spec.ts and the four requested documentation records; existing and externally staged work were preserved; the agent did not mutate the index.

Every destructive DB operation used only authorized localhost:5432/spendcraft_test; setup and every cleanup were independently safeguarded. No historical CategoryTransfer rows outside authorized tests changed (old tables are absent here). No CategoryTransfer table/schema removal, modern funding/rebalance redesign, Transaction DELETE redesign, Category/Pool concurrency correction, exact-money/MinorUnits migration, monetary representation change, application schema migration, deployment or commit occurred. This task-specific database authorization is now expired and cannot be reused for physical schema cleanup or subsequent correctness/representation work.
