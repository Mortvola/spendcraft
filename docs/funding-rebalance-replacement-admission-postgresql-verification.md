# Funding/rebalance replacement-admission PostgreSQL verification

## Baseline and scope

Verification HEAD: `e9e3f006fe7832cd048992fd65a8f4fb5884fd97`. Existing uncommitted admission implementation, tests/documentation and unrelated local files were preserved. Accepted concurrency, OFX authority, BalanceHistory runtime deprecation, ordinary eligibility/startDate, funding preview/submission and immutable funding-date corrections remain present. No production source changed during verification.

## Safety

Authorization was restricted to `localhost:5432/spendcraft_test`. Reviewed current bootstrap, driver guard, pg/pgLog configuration, returned teardown and all new admission/modified funding fixtures before execution. All27 standalone inert safety tests passed first. Configured pg and pgLog each reported host `localhost`, port5432, database `spendcraft_test`; independent live identity for both reported database `spendcraft_test`, port5432, server `::1/128`, peer `::1/128`. No credentials were recorded or configuration redirected.

The installed test-only Knex guard independently rechecks configured/live pg AND pgLog plus the actual destructive execution connection immediately before each destructive statement. Transaction clients inherit interception. Bootstrap independently verifies before setup; returned cleanup verifies again and retains interception through all truncation. Test-specific fixture changes and temporary constraints in regression tests use this same guarded driver; source scan found no separate pg/psql bypass. Setup proof is not reused for cleanup.

The initial sandbox attempt failed local socket access before destructive setup; the authorized escalated command retained all safeguards. An initial broad filename glob selection executed no tests, with safeguarded setup/cleanup (4 checks/1 guarded operation); this is not counted as a passing test run. Corrected Japa suffix filters were used afterward.

## Admission and noninterference

The existing transaction acquires Budget FOR UPDATE before loading the scoped active target. Type2 request requires stored type2; type3 request requires stored type3. Both require readable nonempty nominal allocation rows, no AccountTransaction links and no legacy Loan ownership. Optional funding metadata remains optional. A Loan Category allocation alone is not ownership and remains valid.

Deleted/foreign/missing targets return404. Wrong/unknown type, cross-type requests, single/multiple Account links, Loan Account linkage, actual legacy Loan ownership and malformed allocations return422. Valid type2 with a changed date retains the separate422 immutable-date response; valid type3 date changes succeed. Request syntax validation still precedes resource lookup; lifecycle admission precedes date checks and financial work.

Blocked DB cases compare raw rows across transactions, categories/Pool, accounts, Account links, transaction logs, loans, Loan links and legacy splits. Category.prototype.save is instrumented to fail if reached and its call count must remain zero. The non-DB actual-method tests instrument both financial loops directly and assert zero reversal/application/target-save calls on rejection. They also assert owning-transaction binding of target/Account/Loan/Category reads. This distinguishes executed PostgreSQL save/snapshot evidence from compiled-method loop instrumentation.

## Valid replacement, concurrency and rollback

Valid type2 replaces old effects exactly once and preserves its calendar date. Valid type3 replaces effects exactly once and permits date edits. Representative old Category2/Pool8 becomes Category3/Pool7 with nominal rows3/−3. Optional metadata absence is explicitly exercised; no legacy marker or exact-money validator is introduced.

Deterministic PostgreSQL barriers observe the waiter through pg_blocking_pids, rather than using arbitrary sleeps. A Budget owner commits deletion/type/link changes before a waiting replacement proceeds; it reloads and rejects without extra effects. Public accountless DELETE versus replacement is exercised for both types: only deletion changes balances, then replacement sees deleted state and404. Concurrent valid replacements commit in the controlled first-then-second order (or first rollback), producing Category4/Pool6 and the final valid immutable/editable date. A different Budget progresses while another gate is held.

Late failures after valid admission roll back target JSON/date, Categories/Pool and raw related snapshots. Injected500 logs are expected assertions, not unhandled acceptance failures. No new lock hierarchy, version protocol, financial logging or historical repair is introduced.

## Regression isolation

The accepted funding preview case remains2→2; fixed/percentage/goal/mixed/transfers/residual/baseAmount and original-month replacement rules remain covered by funding tests. Immutable funding date, type3 date editing, accountless eligibility, OFX, BalanceHistory removal, Statements, initialization, Plaid, Loans, manual Transaction lifecycle and Budget concurrency regressions are retained. Actual client State tests prove rejected funding/rebalance responses do not mutate cached Category/Pool/Transaction data. Stale-form behavior, fixed priority, rounding and the deferred0.30000000000000004 artifact remain unchanged.

## Corrections and results

The first18-case run passed15 and failed3 before reaching requests because linked Account test fixtures omitted required subtype. Added subtype only to test fixtures (including the waiting-link fixture); all34 originally prepared cases then passed. Added an explicit optional-metadata/date-rejection case afterward. No production defect was found or fixed during verification. Final focused/full/static results follow below.

Focused acceptance: **1,075 passed,0 failed,0 skipped/pending**, including35 admission DB cases and the accepted regression slices. This run completed45,505 independent checks protecting45,502 destructive SQL operations, including teardown. The earlier34-case run completed1,714 checks/1,711 guarded operations; the fixture-error run completed813/810 and still performed guarded cleanup. None of those earlier runs replaces final focused acceptance.

Both TypeScript checks, ESLint, Knip and circular regression pass (accepted11-model/26-edge SCC;405 analyzed files). Server build and separate client build pass. Existing Vite HMR port24678 occupancy is nonfatal during tests; builds retain the existing over500kB chunk warning. No warnings were suppressed. Expected injected failure logs and security404 logs are part of assertions. No deadlock or unexpected lock timeout was observed in focused acceptance.

## Final acceptance

**ACCEPTED. Full suite:1,511 passed,0 failed,0 skipped/pending.** Focused gate:1,075 passed,0 failed,0 skipped/pending, including35 admission cases. Complete-suite setup and returned cleanup were independently safeguarded:60,066 independent checks protected60,063 destructive SQL operations. Smaller safety-counter lines in suite output are inert driver-unit fixtures, not extra production database connections. No deadlock or unexpected lock timeout occurred. Both diff checks pass; untracked new documentation/test files were separately checked for whitespace. No further database operation is authorized by this completed task; task-specific authorization is now expired.

Every destructive operation used only authorized localhost:5432/spendcraft_test. No historical repair, Transaction DELETE redesign, CategoryTransfer correction, broad Category/Pool concurrency redesign, exact-money/MinorUnits migration, monetary representation change, funding-priority correction, schema migration, deployment or commit occurred. Parent cleanup and existing regression-test temporary constraints remain under the accepted test-only safeguards.
