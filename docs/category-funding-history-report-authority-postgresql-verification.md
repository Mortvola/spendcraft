# Category / Funding History allocation authority — PostgreSQL verification

## Scope and baseline

Verification HEAD: `b06de7575eda2354d30ac3d741b8ff7aba3ad74c`. Existing staged implementation, documentation/tests and unrelated user work were preserved; the index was not modified. Only category/fundingHistory ReportController bodies differ from HEAD in production. No additional runtime correction was necessary during verification. Accepted accounting eligibility, OFX authority, Budget serialization, funding preview/submission, immutable funding date, replacement admission, Loan settings persistence and runtime deprecations remain intact.

## Database authorization and independent safeguards

Task-specific authorization covers only `localhost:5432/spendcraft_test`. Before financial verification,27 standalone inert safeguard tests passed,0 failed/skipped. Audited the31 prepared cases, related report tests, bootstrap and driver guard. The new report cases have no direct destructive SQL/teardown helper. Existing report extension setup/teardown and fixture/ORM mutations go through the same driver guard; teardown does not inherit setup authorization.

Both configured pg and pgLog identify host localhost, port5432, database spendcraft_test. Both live identities identify database spendcraft_test, port5432, server `::1/128`, peer `::1/128`. Immediately before EVERY destructive statement the installed guard independently rechecks BOTH configured/live targets and separately identifies the exact execution connection. It remains installed until after returned cleanup, which explicitly verifies again. No connection was redirected. No credential is recorded here.

Initial sandbox networking was denied before destruction. The authorized network retry completed guarded setup but HTTP port3337 was occupied; no tests executed. Verification therefore used local HTTP port3349, preserving the database target. The existing HMR port24678 warning is unrelated to PostgreSQL. One intermediate multi-file CLI invocation was rejected before test setup because Japa expects a comma-separated file filter; it was corrected. All started database runs retained independently guarded cleanup.

Original31-case gate:31 passed,0 failed/skipped,1,550 checks protecting1,547 guarded SQL operations. Expanded narrow gate:43 passed,0 failed/skipped,2,165 independent checks protecting2,162 guarded SQL operations. An intermediate expanded core had235 passes/2 failures: both were test-only EXPLAIN replay placeholders (`$n` versus Knex `?`), after report assertions had passed. Corrected instrumentation only. No production query/arithmetic change was made. Its cleanup was guarded (15,609 checks/15,606 operations).

## Exclusive authority matrix — verified for BOTH reports

| Current JSON | Legacy relational | Attribution |
| --- | --- | --- |
| 50 | absent | 50 |
| 50 | 20 | 50 |
| 50 | 50 | 50, never100 |
| empty | 50 | 0 |
| empty | absent | 0 |
| 20+30 same Category | any | 50 |

Zero attribution uses existing response conventions: Category returns no matching aggregate row; Funding History retains the owned Category row with history null. Legacy-only rows are intentionally omitted, not deleted/invalidated/repaired. Snapshot comparisons prove legacy rows and current JSON remain unchanged across report GETs. Test-only fixture insertion and guarded cleanup are not historical allocation repair. No historical/applied effect is inferred from either source.

## Category selection, cardinality and compatibility

Real HTTP tests verify current nominal JSON for manual type5 and provider type0. Duplicate allocations count separately:20+30 gives50/count2; an additional accountless Transaction5 gives55/count3. Multiple Categories, explicit Unassigned, current-name rename/order, inclusive date boundaries, empty/omitted filters, filter binding, shared Budget access and validation/not-found errors pass. Response keeps groupName/categoryName/sum/count/rowNumber; sum/count remain JSON numbers. No pagination exists to alter. Grouping remains by current group/category names, not IDs or historical names.

Type0/5 inclusion and type2/3/4 exclusion remain. Deleted/pending/pre-start allocations remain nominal report inputs; before/equal/after Account.startDate tests do not add accounting eligibility. No Account join or Loan principal/interest interpretation appears. Missing JSON IDs are dropped by the scoped Category join while valid siblings report normally. Foreign Category metadata and foreign Transaction attribution are excluded through independently scoped ownership. Current-ID filter404 and malformed-ID422 behavior remains. Actual OFX import/replay and Plaid additions now assert report amount/count after the real workflows.

## Funding History net/date behavior

Type2 current net rows are authoritative. Explicit baseAmount3 versus net2 reports2; Pool−2 is excluded. Fixed/percentage/goal/mixed/transfer persisted amounts report without recalculating rules. Existing real funding preview/submission tests now also GET Funding History after CREATE/replacement for every scenario, including chain2→2, goals, residual, low Pool and duplicate funding sources. The report sums persisted signed Category amounts, not gross/requested/baseAmount metadata.

A real January31 CREATE followed by changed net replacement reports only the CURRENT replacement amounts in January; an attempted February1 replacement is422, so the immutable persisted date still controls month attribution. Unassigned reports its current net row. Type3/opening are excluded. Existing all-month/deleted selection, accountless semantics, group/name order and nullable history remain. There is no count/pagination field. Monthly array order remains unspecified as before; tests do not introduce an order guarantee.

## Security, query observation, nonmutation and performance

Cross-linked fixtures in BOTH directions prove an owned Transaction cannot expose a foreign Category and a foreign Transaction cannot contribute to an owned Category. Missing JSON IDs produce no crash/fallback. The existing report filter/security suite covers foreign/nonexistent/guessed IDs and ownership. Actual SQL capture for both corrected GETs shows one JSON aggregate query, ZERO transaction_categories queries, and no INSERT/UPDATE/DELETE/DDL from the GET. Authentication and filter lookups remain separate reads; no per-Transaction or per-Category application query loop was added.

Raw before/after snapshots cover Transactions/JSON, legacy allocations, Categories/Pool, Accounts, Account links, Statements and transaction logs. Reports do not save, normalize, backfill or repair anything. Structural legacy Loan-ownership admission remains in CategoriesController and its regression suite; only these two monetary report readers changed.

Read-only EXPLAIN ANALYZE replayed the exact captured SELECT/bindings for26 selected Transactions. Narrow-run Category execution0.101ms (planning0.128ms), Funding History0.645ms (planning0.103ms); HTTP9.28/9.97ms respectively. These are small-fixture sanity observations, not production-volume benchmarks. No Cartesian multiplication/N+1 SQL appeared. Funding History retains correlated per-Category work inside one query, so large-volume performance remains a measurement boundary. No schema/index change was needed or made.

## Isolation, precision and historical limits

Source hash tests prove Income Vs. Expenses, Budget Progress, Payee and Net Worth bodies byte-identical to HEAD. Tax/Statement runtime and all posting writers remain unchanged. Income transfer fan-out/inclusion policy and Progress monthly_expenses/expense-selection remain separately deferred. Accepted Statements, opening/initialization, providers, concurrency, Loan settings, eligibility, funding/rebalance and deprecation regression slices run before full-suite acceptance. Cascades/historical reversal and Loan financial semantics are not newly certified.

`0.30000000000000004` remains in persisted JSON/report output for the characterized transfer amount. Category casts SUM to float as before; Funding History emits JSON numbers from numeric aggregation; client totals remain JS numbers. No string money, MinorUnits, new rounding, parsing, storage/API/JSON migration or tax policy change occurred. Legacy-only reporting disappearance is an intentional authority consequence, not evidence that prior historical posting was wrong. Historical-as-posted reporting would require a separate authority model.

## Final counts and status

Focused acceptance: **1,656 passed,0 failed,0 skipped/pending**, completed before the full suite began. It recorded65,779 independent checks protecting65,776 guarded SQL operations, including independently verified returned cleanup. Small safety-counter lines elsewhere in the log are inert driver fixtures, not additional targets. All43 narrow report cases and all applicable focused criteria passed. No PostgreSQL40P01, unexpected lock timeout, report authority error or unintended data mutation remained.

Both TypeScript checks, ESLint, Knip, circular regression and server build (including Vite client assets) pass after final test changes. No client source changed, so a separate client build is unnecessary. Circular analysis retains the accepted11-model/26-edge SCC (411 analyzed files/488 repository nodes). Build warning: existing client chunk above500kB. Test warnings: occupied HMR port24678 and pg concurrent-query deprecation from existing shared batch scheduling. Expected injected failures/404/422 logs are passing regression assertions, not unhandled acceptance errors. Warnings are not suppressed. Normal and staged diff checks pass; new verification documentation is separately whitespace-checked.

**ACCEPTED. Full suite:1,697 passed,0 failed,0 skipped/pending.** Fresh setup and returned cleanup were independently safeguarded:66,821 checks protected66,818 guarded SQL operations. No deadlock/unexpected lock timeout or report failure occurred. No database operation followed completed cleanup. Task-specific database authorization is now expired.

Verification changes: this record, authority design, implementation record, both correctness reviews; report authority/security tests and report assertions in existing funding preview/submission, OFX reimport and Plaid sync tests. No additional production change was required. Existing staged work/index and unrelated files remain preserved. The only application runtime diff from HEAD remains the already-staged two report methods.

Every destructive test operation used only authorized localhost:5432/spendcraft_test; setup and EVERY cleanup were independently guarded. Report GETs changed no transaction_categories data or other financial rows; only isolated authorized test fixtures were inserted/cleaned. No historical allocation repair, exact-money/MinorUnits migration, monetary representation change, application schema migration, deployment or commit occurred. Structural relational use remains. Authorization cannot be reused for the deferred reports or exact-money work. No deployment or commit occurred. Task-specific authorization expires when this verification completes and must not be reused for Income Vs. Expenses, Budget Progress or exact-money work.
