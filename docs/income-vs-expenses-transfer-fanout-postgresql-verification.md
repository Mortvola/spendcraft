# Income Vs. Expenses transfer deduction / fan-out PostgreSQL verification

## Baseline and authority

Verification HEAD: `756cf3a8f8d52bb9b11255a5bf80341d3f00fdcc`. Existing implementation, review/test work, unrelated local files and the initially empty index were preserved. Only ReportController.incomeVsExpenses differs in production from HEAD. Verification requires no additional production change.

The earlier relational-only task was explicitly superseded by product direction: “Income vs Expenses should use JSON for the transfer deduction.” The implementation record documents that authority change. This acceptance therefore verifies AccountTransaction.amount as movement authority MINUS the sum of CURRENT Transaction.categories JSON amounts matching the owning Budget's Account Transfer Category. It does not approve JSON-only income accounting, a new transfer inclusion/sign policy or historical attribution reconstruction.

The Budget-scoped CTE groups by Transaction ID before joining selected AccountTransaction movements. It returns at most one attribution total per Transaction. Each movement link contributes once, including existing multiple-link semantics: each link subtracts that Transaction's aggregate. Duplicate-valued JSON entries count individually; no SUM(DISTINCT), relational fallback, merge or repair exists. Structural legacy Loan ownership and the deferred Budget Progress relational reader remain untouched.

## Independently safeguarded database

Fresh task-specific authorization permits only localhost:5432/spendcraft_test. Read AGENTS, current source, required reviews/invariants and accepted verification records. Inspected all31 prepared cases, related report tests, bootstrap, configuration and centralized driver guard before financial tests. All27 standalone inert safeguard tests passed first. New fixtures use guarded ORM/Knex operations, with no separate driver/psql client or local cleanup bypass. Existing extension/constraint setup and teardown likewise pass through the guard.

Configured pg and pgLog both identify localhost, port5432, spendcraft_test. Both live sessions independently identify database spendcraft_test, port5432, server `::1/128`, peer `::1/128`. Before EVERY destructive SQL statement the centralized interceptor independently rechecks configured/live pg AND pgLog and identifies the exact execution connection. Transaction clients inherit interception. Setup explicitly verifies; returned teardown independently verifies again, and per-statement interception remains installed through cleanup. Earlier setup never authorizes later cleanup.

Original31-case run:31 passed,0 failed,0 skipped/pending;1,445 independent checks protecting1,442 guarded SQL operations. Expanded33-case run:33 passed,0 failed,0 skipped/pending;1,532 checks protecting1,529 operations. Conservative guard matching also covers SELECT FOR UPDATE and SQL containing selected keywords; these counters are guarded SQL operations, not a count of actual destructive effects. Small counter lines from inert driver tests are not additional database targets.

## Real HTTP cardinality results

Authenticated GET /api/v1/reports/income-vs-expenses returns the existing numeric row arrays.

| Movement | Matching current JSON amounts | Returned contribution |
| --- | --- | --- |
| 50 | 50 | 0 |
| 50 | 20+30 | 0 |
| 50 | 10+15+25 | 0 |
| 50 | 20+20 | 10 |
| 50 | 20 | 30 |
| 50 | none | 50 |
| 50 | 0, or0+0 | 50 |
| 50 | 50+0 | 0 |

The frozen pre-correction actual method in inert tests still demonstrates `(50−20)+(50−30)=50`, versus one-row50→0. Corrected PostgreSQL HTTP results make those equivalent partitions both0 without deduplicating two legitimate20 entries.

| Current JSON deduction | Legacy attribution | Report on movement50 |
| --- | --- | --- |
| 50 | absent | 0 |
| 50 | 20 | 0 |
| 50 | 50 | 0 |
| empty | 50 | 50 |
| empty | absent | 50 |
| 20+30 | 99 | 0 |

Legacy-only attribution no longer supplies a deduction; that is intentional compatibility behavior, not a deletion or repair of legacy data. Raw snapshots prove those rows remain unchanged. No persisted JSON means no corresponding current deduction, rather than a request for historical fallback.

## Signs, selection and security

Original movement sign still selects income versus expenses. Results include −50−(−20−30)=0 in expenses; −50−40=−90 in expenses;50−(−40)=90 in income;50−80=−30 STILL in income;−50−(−80)=30 STILL in expenses;0−40=−40 in income. Multiple movements/Accounts and a Transaction with two Account links preserve original per-link arithmetic with no cross-movement fan-out.

Selection remains Transaction Budget, transaction-tracked Account and type!=4. Existing pending/deleted/pre-start/closed-Account inclusion remains, including linked types0/1/2/3. Balance-tracked Accounts and accountless Transactions are absent from movement joins. Request date-range parameters remain unused; persisted Transaction dates determine calendar year/month, sorted ascending. Empty results remain[]. No count/pagination contract exists. Response stays `[month,income,expenses,net][]` with JSON numbers; no eligibility predicate or new date boundary is imported.

Both the outer movement query and CTE restrict Transaction.application_id to the authorized Budget. The CTE matches only that Budget's Account Transfer Category. Foreign Transactions with owned Category IDs and owned Transactions with foreign Category IDs do not introduce foreign attribution. Unassigned, Pool and nonexistent IDs are not matching transfer attribution and do not crash/expose metadata; valid sibling deduction remains20→report30. No Category names/private metadata are selected by this report. Foreign Budget selection is not accepted from request parameters; the authenticated user's Budget is authoritative.

Scope qualification remains important: existing outer AccountTransaction/Account joins assume lifecycle ownership coherence. This bounded correction does not certify arbitrary corrupted cross-Budget Account links or introduce a new Account/Institution coherence policy. It does prove the new deduction aggregate is independently scoped in both cross-linked JSON directions. Guessed/unrelated JSON Category IDs cannot change the matching owned Category ID.

## Read-only evidence and query observations

Raw before/after snapshots cover Accounts, AccountTransactions, Transactions including JSON/version, Categories including Pool, legacy transaction_categories, Statements and transaction_logs. Representative cardinality, authority and cross-Budget GETs change no rows. SQL observation captures exactly one JSON report aggregate query, zero transaction_categories queries and zero INSERT/UPDATE/DELETE/DDL from report execution. Authentication/owned system-Category resolution remain separate read lookups; no per-Transaction application query loop exists.

EXPLAIN ANALYZE/BUFFERS replays the exact captured query and bindings. Original narrow fixture:26 movements,51 JSON entries; planning0.218ms, execution0.459ms. The left join is inner-unique on the grouped Transaction key and emits26 movement rows before monthly aggregation. PostgreSQL selected small-fixture nested loops, including rescans of the grouped side; this is one SQL execution, not application N+1. No additional allocation-row movement multiplicity or Cartesian output appeared. These timings are fixture sanity, not a production-scale benchmark. Existing all-history selection and JSON expansion still require volume measurement in future performance work; no index/schema optimization was introduced.

## Isolation, regressions and precision

Hash tests compare Category, Funding History, Budget Progress, Payee and Net Worth method bodies against accepted HEAD. They remain byte-identical. Category/Funding History retain exclusive JSON authority and legacy-only omission. Tax/Statement runtime, client source and all financial writers remain unchanged. Accepted eligibility, Account and Category/Pool gates, OFX balance authority, Plaid, preview/submission, immutable funding date, admission, Loan settings, deprecations, Statements, initialization and current DELETE tests are regression coverage. Passing DELETE/cascade tests is NOT certification of unresolved historical reversal.

Money remains AccountTransaction stored numeric, current JSON numbers, SQL numeric aggregate/subtraction, existing parseFloat hydration, JS-number net addition, numeric API arrays and client chart consumption. No precision/rounding/storage/JSON/API migration occurred. Rate/percentage is not reclassified as money. Existing binary arithmetic limitations remain for the monetary inventory; correct cardinality is separate from exactness.

## Final verification

**ACCEPTED.** Safety gate27 passed; original narrow31 passed; expanded narrow33 passed; focused acceptance1,721 passed; complete suite1,762 passed. Every final gate has0 failed and0 skipped/pending. Focused acceptance completed before the full suite started. Focused setup/returned cleanup recorded67,307 independent checks protecting67,304 guarded SQL operations. Full setup/returned cleanup recorded68,349 checks protecting68,346 operations, with the same configured/live/execution identity restriction. Existing migrations were already up to date. No deadlock40P01 or unexpected lock timeout occurred.

Both TypeScript checks, ESLint, Knip and circular regression pass after the final test changes. Only the accepted11-model/26-edge component remains (415 analyzed files/492 repository nodes). Server build passes including Vite client assets; no separate client build is required because client source is unchanged. Normal and staged git diff --check pass; untracked new files are separately whitespace-checked. HEAD/index remain unchanged. Expanded EXPLAIN execution0.378ms/planning0.224ms; focused execution3.427ms/planning0.590ms. Small fixtures and accumulated test data explain different plans/timings; no production-volume guarantee is asserted.

Warnings retained, not suppressed: occupied HMR port24678, existing pg concurrent-query deprecation during shared-batch regressions and client chunk above500kB (1,030.68kB before gzip). Expected injected failure/security/validation logs are passing assertions, not unexplained suite failures. No production or test-infrastructure correction was required. Only the two additional test cases and acceptance documentation were needed.

Every destructive operation used ONLY authorized localhost:5432/spendcraft_test. Setup and EVERY cleanup were independently safeguarded. No database operation followed completed full-suite cleanup. **Task-specific authorization is now EXPIRED** and cannot be reused for Budget Progress, transfer policy, historical reversal or monetary work. No historical repair, unrelated report-authority change, Transaction DELETE/cascade correction, exact-money/MinorUnits migration, monetary representation change, application schema migration, deployment or commit occurred. Guarded test fixture insertion/deletion and existing temporary test constraints are not historical repair or an application migration.

## Changed files and boundaries

Verification adds this record, strengthens tests/functional/reports/incomeFanout.spec.ts with single-zero and unrelated/missing-ID coverage, and updates the correction record, monetary readiness and both correctness reviews. Existing implementation files are preserved: ReportController.ts, unit/reports/incomeFanout.spec.js, fixtures/reports/legacyIncomeBody.js and unit/reports/allocationAuthority.spec.js. Earlier finalReadiness characterization remains unrelated preserved work. No production or safety-infrastructure correction was required during verification. No commit/index mutation occurred.
