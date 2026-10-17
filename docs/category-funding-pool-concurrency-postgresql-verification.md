# Category / Funding Pool concurrency PostgreSQL verification

## Scope and baseline

Verification HEAD: `e49bebe3bf29e8a773709a59bd9c2780014944f0`. The staged bounded implementation and existing user work were preserved. Only InstitutionController.addOffline and CategoriesController.deleteCategory differ from HEAD: AST comparison confirms 15 other Institution controller methods and 11 other Category controller methods byte-identical. Verification changed tests/documentation only; no additional production correction was needed.

Accepted Account-writer serialization, OFX accounting/provider authority, BalanceHistory runtime removal, ordinary eligibility/startDate, funding preview/submission, immutable type2 replacement date, replacement admission and CategoryTransfer DELETE retirement remain present. The scope is two additional Budget-gated paths, not certification of all Category writers.

## Database safety

Authorization applies only to `localhost:5432/spendcraft_test`. All 27 standalone inert safeguard tests passed before financial verification. Configured pg and pgLog both identify host localhost, port5432, database spendcraft_test. Independent live identities for both report database spendcraft_test, port5432, server `::1/128`, peer `::1/128`.

Reviewed bootstrap, returned teardown, driver interception and prepared fixtures before execution. The test-only driver guard independently checks configured/live pg AND pgLog and identifies the exact execution connection immediately before every destructive SQL statement. This includes ORM fixture mutations, setup, temporary test constraints, direct SQL and cleanup. Setup verification is not reused for cleanup; returned teardown independently verifies and interception remains installed through every cleanup statement. No separate pg/psql connection bypass was introduced. New cases have no direct cleanup SQL or temporary DDL.

## Initialization results

Both controlled orders of Pool100 / initialization+10 / funding−20 finish at **90**, with one new opening, one funding Transaction, recipient Category20 and new Account10. The initializer-first barrier pauses immediately after Pool hydration, before Institution creation, and observes the competitor waiting on applications FOR UPDATE through pg_blocking_pids. Thus a late Pool row-write lock is not substituted for the Budget protocol.

A separate real-HTTP instrumentation case holds funding after its Pool save, observes initialization waiting on Budget, then captures initialization's transaction-bound Pool hydration at **80**. It uses that committed value to save90. No pre-gate Pool object controls the calculation. The inverse case hydrates100 before the competitor can proceed. The pure actual-method regression separately poisons pre-gate state.

| Case | Verified result |
| --- | --- |
| Initialization / initialization |100+10+20=130; both new Accounts and openings once |
| Initialization / startDate | Pool120 from initial100, offline10 and opening100→110; existing Account110 unchanged by startDate; ordinary Category10→0; opening date follows March1 |
| Initialization / Plaid first sync | Pool140; provider accounting Account120, signed posting−10 and opening130 replace old100; offline adds10; Unassigned−10 and cursorc1 |
| Shared mixed batch | Transactions10+20−5 give Pool125 once; separate Balances7 creates Statement; four total openings include original100 |
| All-Balances batch | Pool100 unchanged, two Statements, no new transaction-tracked opening |
| Existing-Institution creation | Existing no-opening/no-Pool contract unchanged; no new gate added |
| Late initialization failure | New Institution/Account/opening and Pool effects roll back; funding waiter posts20 from original100→80 |
| Different Budgets | Second initializer progresses while first is held; each independent Pool110 |

Provider overlap uses a mocked first Plaid sync with real financial persistence. New OFX imports allocate to Unassigned; no fictitious OFX auto-assignment contract is assumed. A normal initialized provider sync without a Pool/opening effect does not intersect this initialization Pool race. No change to provider balance, cursor, precision or currency semantics occurred.

## Category deletion results and fresh admission

DELETE now gates before scoped Group/Category reload and the active/nonzero Transaction JSON membership check. Admission still means the CURRENT contract: scoped resources must exist; active nominal JSON amount !=0 blocks with409/HAS_CHILDREN. There is no newly invented balance-zero, system-type, funding-rule or startDate exemption. Optional Loan dependency lookup/delete occurs after membership, on the owning transaction. Missing/foreign resources retain404; successful deletion204.

| Controlled order | Verified result |
| --- | --- |
| CREATE or PATCH addition first | DELETE waits, sees committed JSON usage and returns409; Category10 survives |
| Type2/type3 first | DELETE409; recipient10, Pool90; posted allocation survives |
| OFX restoration or Plaid allocation first | DELETE409; Category10 and active JSON allocation survive; Pool100 |
| DELETE first, CREATE/PATCH/type2/type3 waiter | DELETE204, waiter404/rollback; raw state differs only by intended Category deletion |
| DELETE first, OFX/Plaid waiter | Existing OFX500 wrapper / Plaid404; rollback preserves Account/provider/cursor/Pool/Transaction/link/log state; no orphan JSON |
| PATCH removes final usage first | DELETE waiter204; allocation moves to Other10 once, version1, Pool100 |
| startDate crossing first | Category effect becomes0, Account110 and Pool110; active nominal JSON still blocks DELETE409 |
| Same Category DELETE/DELETE |204 then404; waiter reloads absence, no second action |
| Different Categories, same Budget | Both204 in serial order; intentional same-Budget contention |
| Late DELETE failure | Deleted row rolls back; waiting CREATE sees restored Category and posts once; Account110/Category10/Pool100 |
| Different Budgets | Deletions progress independently |
| Foreign Group/Category |404; raw financial state unchanged |

The post-wait409 cases prove committed usage is rechecked, not a cached unused decision. Source and actual-method tests prove Category hydration occurs after the gate; same-target deletion demonstrates fresh existence. Runtime membership instrumentation additionally asserts owning transaction binding, checks that its execution session already holds the applications RowShareLock from FOR UPDATE, and compares that SAME transaction object with the freshly hydrated Category used for deletion. Membership cannot escape to a default connection. The JSON tests assert persisted allocations, Category existence/balances and Pool where relevant; relational FKs alone are not treated as protection.

Actual bundled client State tests retain the Category and financial caches on409 and remove only the target after success. No concurrency-specific public error or optimistic cache mutation was added.

## Test corrections and regression isolation

The first30-case run passed28, failed2: prepared OFX cases incorrectly assumed new imports used Plaid auto-assignment. Replaced that fixture with a real import, explicit supported allocation PATCH, DELETE and OFX restoration. This creates an initially unused/deletable Category with a genuine restorable OFX allocation. Production OFX behavior was preserved. Two runtime instrumentation cases bring the narrow total to32. One intermediate instrumentation assertion expected funding to call getFundingPoolCategory, but it uses scoped requested-Category queries; corrected that test expectation without changing funding. Final narrow run:32 passed,0 failed,0 skipped/pending.

Accepted regression slices cover ordinary CREATE/PATCH/DELETE, startDate, OFX, Plaid, funding preview2/posting2, immutable funding date, replacement admission, rebalance, Statements, initialization, Loans, security and existing Budget contention/rollback. BalanceHistory and CategoryTransfer DELETE remain removed. Existing stale-form semantics, fixed priority, rounding and the deferred0.30000000000000004 artifact remain unchanged.

## Final gate matrix and binding

| Writer | Verified classification |
| --- | --- |
| Manual CREATE | GATED AND VERIFIED |
| PATCH | GATED AND VERIFIED |
| Current Transaction DELETE | GATED AND VERIFIED for serialization; historical reversal not certified |
| startDate | GATED AND VERIFIED |
| HTTP/command OFX | GATED AND VERIFIED |
| Plaid | GATED AND VERIFIED |
| Type2 funding | GATED AND VERIFIED |
| Type3 rebalance | GATED AND VERIFIED |
| New-Institution initialization | GATED AND VERIFIED |
| Category DELETE | GATED AND VERIFIED |
| Existing-Institution Account creation | UNGATED BY DESIGN — no shared opening/Pool posting |
| Account cascade | DEFERRED / HISTORICALLY BLOCKED — unchanged/ungated |
| Institution cascade | DEFERRED / HISTORICALLY BLOCKED — unchanged/ungated |

New initialization binds user→Budget gate, explicitly queries Pool with client:trx and inherits that transaction through Institution, Account, opening/link and Statement creation; final Pool save retains it. Category DELETE binds scoped Group/Category, membership, optional Loan and delete to its owner transaction. No intentional protected read/write escape remains. Both paths acquire Budget before lower-resource writes; no new Category/Account lock hierarchy, advisory lock or version protocol exists. Same-Budget waiting and different-Budget independence are intentional.

Cascades were compared/tested for noninterference only. Serialization alone cannot establish whether old nominal Category effects were historically applied. Passing unchanged cascade regressions does not certify historical reversal; no cascade gate, formula or recovery behavior changed.

## Final verification results

Safety gate: **27 passed,0 failed,0 skipped/pending**. Final narrow gate: **32 passed,0 failed,0 skipped/pending**. Focused acceptance: **1,213 passed,0 failed,0 skipped/pending**, completed before the full suite was started. Narrow execution recorded1,971 independent checks protecting1,968 SQL operations; focused execution recorded53,740 checks protecting53,737 operations, including independently verified returned cleanup. Earlier fixture-error runs also completed guarded cleanup; they do not replace final acceptance.

Both TypeScript checks, ESLint, Knip, circular regression, server build and separate client build pass. Circular analysis retains the accepted11-model/26-edge component (407 analyzed files). Warnings: existing HMR port24678 occupancy, chunks above500kB, and pg's concurrent-query deprecation warning observed during the shared batch. Warnings were not suppressed; this task did not redesign batch or driver scheduling. Injected late-failure and missing-resource logs are expected assertions. No deadlock or unexpected lock timeout occurred in focused acceptance.


**ACCEPTED. Complete suite:1,568 passed,0 failed,0 skipped/pending.** Its fresh bootstrap and returned teardown were independently safeguarded;62,801 independent checks protected62,798 SQL operations. Smaller safety-counter lines are inert unit-test driver fixtures, not additional database targets. No deadlock or unexpected lock timeout remained. Standard and staged diff checks pass.

Every destructive database operation used only authorized localhost:5432/spendcraft_test. Setup and every cleanup were independently safeguarded. This task-specific authorization is now expired and cannot be reused for cascades, reporting, Loan settings or exact-money work. No Account/Institution cascade correction, historical reversal inference, historical repair, exact-money/MinorUnits migration, monetary representation change, schema migration, deployment or commit occurred. Existing staged/uncommitted work remains preserved. Test-only bootstrap/temporary constraints and fixture cleanup do not constitute a production schema migration.

Verification files changed: this record, category-funding-pool-concurrency-design.md, category-funding-pool-concurrency-implementation.md, both correctness reviews, and tests/functional/concurrency/categoryPoolWriters.spec.ts. Runtime source, client production code, existing accepted writers and the safety infrastructure were not changed during verification. Physical cleanup, historical deletion authority and all unrelated correctness findings retain their separately scoped status.
