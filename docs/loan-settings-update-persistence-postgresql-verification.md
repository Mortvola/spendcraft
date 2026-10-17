# Loan settings persistence / concurrency PostgreSQL verification

## Baseline and scope

Verification HEAD: `dcdf0d0e60bba52f1c8cd236a9631b034d5d6126`. Existing staged runtime implementation, tests/documentation and unrelated local files were preserved. Only LoansController.update differs in production from HEAD; verification made no further production change. Accepted Account serialization, Category/Pool bounded serialization, OFX authority, ordinary eligibility/startDate, funding preview, immutable funding date, replacement admission and both runtime deprecations remain present.

The contract is one complete submitted configuration: Category.name plus Loan.rate/startDate/startingBalance. All four fields remain required. The owning Budget gate precedes fresh scoped Loan and associated Category queries, flat assignment, Loan.save, Category.save and commit. updateBalance remains inert, getProps remains the existing0/[] placeholder and no Loan accounting behavior is implemented.

## Database safety

Fresh authorization is only for localhost:5432/spendcraft_test. Inspected bootstrap, driver guard, configured pg/pgLog, returned teardown, all24 prepared cases and modified isolation tests before connecting. All27 standalone inert safety tests passed first. New fixtures use guarded Lucid/Knex inserts and no separate client, destructive cleanup helper or temporary DDL. The repository test scan found no pg/psql bypass.

Configured pg and pgLog both identify host localhost, port5432, database spendcraft_test. Independent live identities for each report database spendcraft_test, port5432, server `::1/128`, peer `::1/128`. The installed guard independently rechecks configured/live pg AND pgLog plus the exact execution connection immediately before EVERY destructive SQL statement. Setup explicitly verifies before bootstrap; returned teardown independently verifies before cleanup, and every cleanup SQL statement remains intercepted. Setup evidence is never reused to authorize cleanup.

SQL observation added during verification wraps, calls and restores that INSTALLED guard; it never calls an unguarded driver or creates another connection. Model/barrier hooks likewise use owning transactions. Counter totals include conservative guard matches such as SELECT FOR UPDATE. Smaller counter messages from inert safety unit tests are not extra real database targets.

## Fresh-read persistence and validation

All persistence assertions discard request models and use a new default raw query after HTTP completion plus a fresh Category lookup. Subsequent independent GET also returns the persisted settings. The cases separately cover no-op, rate-only intent, startingBalance-only intent, startDate-only intent, name-only intent, all fields, zero and accepted negative values. Complete required payloads are used even when only one field meaningfully changes. Category name and all three Loan configuration fields persist; Loan.balance remains−100.

The first observed raw storage boundary is starting_balance **"100.00" (string)** and rate **5 (number)**. Numeric-string inputs8.25/200.75 persist under current representation. False rate and empty-string startingBalance retain existing Vine coercion to0. No money normalization, new rounding, decimal-string API or rate-as-currency treatment was introduced. startingBalance/Loan.balance remain monetary numeric fields; rate remains a double rate/ratio. Dates retain current validation/date storage behavior and are editable for Loans.

Each of the four individually omitted fields rejects422 with JSON content negotiation, as do null rate, invalid date, empty name and an incomplete body; raw Loan/Category/financial snapshots remain unchanged. No fields became optional. Successful responses remain exactly `{name,loan:{balance:0,transactions:[]}}`.

## Complete-state concurrency and runtime binding

Both deterministic orders of the known case pass:

- Original: name Original, rate5, January1, startingBalance100.
- A: name Request A, rate8, February1, startingBalance100.
- B: name Request B, rate5, March1, startingBalance200.
- A→B finishes EXACTLY B; B→A finishes EXACTLY A. No8/200 or name/date hybrid appears.

The first request is paused after real Loan persistence inside its transaction. pg_blocking_pids/pg_stat_activity proves the second is waiting on applications FOR UPDATE. SQL instrumentation records the actual execution connection's order for BOTH requests:

`Budget gate acquired → Loan SELECT → Category SELECT → Loan UPDATE → Category UPDATE → COMMIT`.

It captures the first read at5/100, then the waiter's Loan rate/base/date and Category name exactly matching the preceding committed complete request. Thus dirty-field comparison uses the fresh serial predecessor, not the original stale snapshot. Gate, both reads and both writes share the same execution connection/transaction; an escaped read/write fails the test. Separate model instrumentation confirms Loan.$trx equals Category.$trx and its session holds the applications RowShareLock from FOR UPDATE. No lower-resource write precedes Budget.

Identical complete requests and a later request restoring all original values also pass. Dirty-field no-op optimization is preserved without losing the complete-state contract. Different Loans within one Budget intentionally serialize and each persists its own complete state. Different Budgets progress independently while another request remains paused. A same-Budget funding request waits behind settings, then preserves its own Pool−10/Category+10 effect; Loan settings add no financial effect.

## Atomicity, security and financial isolation

Injected failures after Loan.save and after Category.save restore raw Loan/Category state, with no partial name/settings commit. Retry succeeds. A failed gate owner releases the lock; its waiter reloads authoritative rolled-back state and commits complete B, with no remnants from A. All hooks release barriers/restore interception in finally; no arbitrary sleep is primary synchronization.

Raw before/after financial snapshots cover seeded Account accounting/provider balances, Category balances including associated Loan Category17 and Pool100, Transactions/type4 opening, AccountTransactions, Statements, transaction logs, LoanTransactions and Loan.balance/ownership. They remain unchanged for settings operations. The funding overlap changes only its intended Category/Pool/posting state; Account and Statement rows remain unchanged. No principal/interest/payment algorithm, opening maintenance or provider writer is activated.

Foreign Budget Loan/Category IDs, nonexistent IDs and an owned Category without a Loan return404 with raw state unchanged. Existing owner/shared-Budget isolation cases preserve access and now verify persisted settings, unchanged Loan.balance and unrelated foreign Loan state. Scope remains Category→Group→Budget; the URL is a Category ID, not permission to select a second Category independently. Invalid input is still validated before target lookup. No historical lost requests are inferred, replayed or repaired.

Client search still finds no active /loans settings caller or LoanUpdateProps consumer. No new UI/cache path was created; existing client success/rejection tests for unrelated financial operations remain regressions, not invented Loan settings UI coverage.

## Corrections and narrow results

Initial24-case run:20 passed,4 failed. All persistence/contention/rollback/security cases passed. Four validation cases omitted Accept:application/json and followed the existing HTML validation redirect to200. Corrected those TEST request headers, preserving runtime validation/error semantics. Added individual required-field omissions (4), accepted coercion (2) and identical/original-value contention (2), and strengthened existing contention with SQL hydration/binding evidence. No production or safety-infrastructure correction was needed.

Final narrow: **32 passed,0 failed,0 skipped/pending**. Its setup and teardown completed1,857 independent checks protecting1,854 SQL operations. Initial fixture-header run completed1,449 checks/1,446 guarded operations, including guarded cleanup; it does not replace final acceptance.

## Regression scope and final results

Focused acceptance includes current Account/Category and Category/Pool Budget contention, fresh reload/rollback, ordinary eligibility/startDate, OFX authority, Plaid, funding preview2/posting2, immutable type2 date, replacement admission, rebalance, Statements, initialization, Loans, BalanceHistory removal, CategoryTransfer DELETE absence and source/client boundaries. Existing unresolved historical reversal, reporting allocation, priority, Statement tie, offline-route and Loan financial questions remain separate. Passing Loan/cascade regressions is noninterference, not certification of unresolved financial semantics.

Focused acceptance: **1,277 passed,0 failed,0 skipped/pending**, completed before starting the full suite. It recorded55,599 independent checks protecting55,596 SQL operations, including independently safeguarded cleanup. All32 narrow Loan cases remained passing. No deadlock40P01, unexpected lock timeout or hybrid coupled state was observed.

Both TypeScript checks, ESLint, Knip, circular regression and server build including client assets pass. Only the accepted11-model/26-edge circular component remains (409 analyzed files). No separate client build is required because client/shared production source is unchanged. Existing HMR port24678 occupancy, pg concurrent-query deprecation during batch regressions and client chunks above500kB remain warnings; none was suppressed. Injected late failures and security/validation errors are expected test assertions, not unexplained failures.


**ACCEPTED. Complete suite:1,632 passed,0 failed,0 skipped/pending.** Its fresh bootstrap and returned teardown independently safeguarded configured/live pg, pgLog and every destructive execution connection;64,660 independent checks protected64,657 SQL operations. No deadlock, unexpected lock timeout or hybrid coupled state remained. Standard/staged diff checks and explicit new-document whitespace checks pass.

Verification changed only tests/functional/loans/settingsPersistence.spec.ts (JSON validation headers,8 additional cases, SQL fresh-read/binding evidence and raw boundary recording), docs/loan-settings-update-persistence-correction.md, both correctness reviews and this new record. No production or safety-infrastructure change was necessary. Existing staged/uncommitted implementation and unrelated files were preserved; the index was not mutated. Source comparison confirms get/add/getTransactions unchanged and only the approved update differs from HEAD; Loan model/validator/client/shared/schema sources remain identical to baseline.

Every destructive DB operation used only authorized localhost:5432/spendcraft_test. Setup and every cleanup were independently safeguarded. Task-specific authorization is NOW EXPIRED and cannot be reused for allocation reports, Loan financial semantics or exact-money work. No historical Loan repair, principal/interest/payment redesign, Account/Category balance behavior change, exact-money/MinorUnits migration, monetary representation change, application schema migration, deployment or commit occurred. Existing authorized test bootstrap and temporary test constraints do not constitute an application schema migration.
