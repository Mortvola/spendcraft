# Account-balance concurrency PostgreSQL verification

> Subsequent product direction: BalanceHistory is deprecated. Its runtime lifecycle is removed and PostgreSQL-verified (physical schema cleanup deferred); earlier proposals to preserve/fix/migrate that feature are superseded. Historical verification facts below remain unchanged. See [deprecation record](balance-history-deprecation.md). No physical table removal or historical repair is authorized.

Task scope: verify the bounded concurrency correction only. HEAD: `7fdc6369d787869dd5859341f832c0733a6496f1`. The existing production correction was preserved; verification introduced no additional production semantic changes. Existing staged/untracked user work was preserved. OFX balance-authority correction remains a separate subsequent task.

## Authorization and safety

Task-specific destructive authorization was only for localhost:5432/spendcraft_test. No environment was redirected to obtain a matching target. The current test environment resolved there before connection. Both configured pg and pgLog reported host localhost, port5432, database spendcraft_test. Independently acquired live pg and pgLog connections each reported database spendcraft_test, port5432, server `::1/128`, peer `::1/128`. Credentials are not part of this evidence.

The reset harness had no destructive guard. Inspection of the installed Lucid version established that testUtils.db().truncate() runs migration:run during setup and RETURNS a db:truncate teardown callback. Merely checking setup would not protect teardown. Existing test-specific SQL adds/drops temporary constraints/extensions/tables and deletes fixture rows; the source audit found no direct pg/psql bypass in tests.

The narrowly scoped correction lives in tests/helpers/databaseSafety.ts and tests/bootstrap.ts, not production:

1. Validate configured host/port/database independently for pg and pgLog before acquiring a connection. Only the authorized endpoint passes; labels/NODE_ENV/acknowledgements are insufficient.
2. Acquire independent verification connections for both names and positively check current_database(), inet_server_port(), inet_server_addr() and inet_client_addr(). Null/remote/mismatched identities fail closed. Explicit recognized loopback renderings include ::1/128.
3. Install a test-only Knex driver-prototype query wrapper. Knex transaction clients inherit this prototype, so ORM fixture deletes, schema helpers, raw cleanup SQL, migrations and application mutations under test pass through the same guard. Conservative detection includes INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP/CREATE and destructive statements nested in CTEs/batches/comments. All protected statements independently rerun configured/live pg AND pgLog checks; their exact execution connection is also verified before issuing SQL.
4. The setup wrapper reruns verification immediately before invoking Lucid's setup, and the returned teardown wrapper independently reruns it before calling the returned cleanup. The driver guard remains installed through teardown and independently protects each truncation statement. Connections and wrapper are released only afterward.

Transaction rollback undoes uncommitted test work; it is not a committed fixture deletion/reconstruction. Destructive SQL within those transactions is still independently guarded. No direct fixture/temporary-object cleanup path relies on an earlier setup check. Test helpers never print configured credentials or raw monetary records as safety evidence.

Before connection, 27 inert unit tests passed: configured mismatch before connection, supported/invalid loopback identities, destructive SQL detection, inherited transaction-client interception, per-statement checks, and changed pgLog identity rejecting later cleanup. They use fake connections and do not bootstrap the application.

## Original blocker and focused acceptance

The first executed financial case was OFX110 followed by waiting manual CREATE+5. Expected current serial outcome: Account115, Unassigned15, opening/Pool100, two active ordinary Transaction/link rows. PostgreSQL pg_blocking_pids/pg_stat_activity confirmed the waiter blocked on applications FOR UPDATE before continuing. Nine ordered writer pairs passed first; the complete focused run then passed 214 tests, zero failures, zero skipped/pending.

| Pair / boundary | Observed result |
|---|---|
| CREATE/CREATE | Both signed effects persisted once; Account115, Category15 |
| CREATE/DELETE | Serial Account110, Category10, correct soft-delete/link state |
| OFX→CREATE | Account115, Category15; waiting manual writer did not restore stale100+5 |
| CREATE→OFX | Account110, Category20, Pool90 under deliberately unchanged absolute-ledger semantics |
| OFX→DELETE / DELETE→OFX | Current serial outcomes106/110 respectively; Category10; opening/Pool96/100 |
| PATCH→OFX / OFX→PATCH | Current serial outcomes110/112; Category16; version1 and one modification log |
| HTTP OFX/HTTP OFX | Current serial Account120, Category20, opening/Pool100; distinct imports once |
| HTTP OFX/command | Command waited on same gate, reloaded scoped Account, retained current ledger behavior; foreign same-name Account unchanged |
| Plaid/manual CREATE | Account95 and Unassigned-5 from provider-10/manual+5; rows/log/provider cursor correct |
| startDate overlap | Waiting startDate sees Account110; current crossing removes Category10, opening/Pool110 and opening date follows new boundary |
| Same Budget / distinct Accounts | Actual Budget wait observed; final Account110/105, shared Category15, Pool200. Intentional contention tradeoff |
| Different Budgets | Second Budget CREATE committed while first gate remained held; Account/Category/link results correct |
| Late CREATE rollback | Failure after Account110 save rolls back its Transaction/link/balance; waiting CREATE sees100 and commits105/Category5; no extra logs/rows |

Injected failures intentionally produce expected500/error logs. No unexpected500, 40P01 deadlock or lock timeout occurred in focused acceptance. These outcomes prove concurrency under current accounting semantics, not correction of known OFX/eligibility/history defects.

## Fresh state, binding and shared branches

Financial-state ordering is supported by actual PostgreSQL waits, final financial values, source contracts and inert behavioral barriers: CREATE/DELETE/command acquire Budget before their authoritative reads; PATCH/HTTP OFX/startDate retain fresh post-gate queries. Plaid waiting sync starts from the committed cursor/token state after refresh. Existing overlapping pagination, modification, pending replacement, removal and rollback cases pass with fresh-cursor expectations.

Five instrumented real endpoint cases wrap Account, AccountTransaction, Transaction, Category and TransactionLog model saves. Protected writes have a non-null owning transaction and one shared transaction client per operation. Existing relation/query source inspection confirms authoritative post-gate reads and opening helpers use the same client; no task-local default-connection escape was observed. The test-only safety verification connections are separate read-only identity probes, not financial authority.

Shared-state Plaid behavior was verified financially, not only by checking for-loop syntax. Two first-sync Accounts and two first-sync Institutions sharing one Budget each result in Account100/100, Unassigned-30, individual openings110/120 and Pool230, with correct Transaction/log counts. This exercises both sequential balance/opening helpers and HTTP syncAll's sequential Institution branches. Different Budgets remain independent.

Security coverage includes foreign/nonexistent Account, Transaction, Institution/Budget and shared-Budget users; the command case proves a foreign same-name Account is not selected. No participating legitimate multi-Budget financial operation was found. Scope violations are rejected, not treated as cross-Budget posting.

## Corrections during verification

- Test infrastructure: added the fail-closed guard and setup/returned-cleanup lifecycle protection described above. No abandoned-branch safeguard was imported.
- Test fixture: supplied the required Account subtype; the first prepared fixture run failed before any regression executed because subtype was missing. Corrected only the test fixture.
- Strengthened tests: actual startDate and same-Budget/distinct-Account contention, five model transaction-binding cases, actual shared-Pool financial cases for both Plaid branch shapes, and stronger late CREATE rollback barrier. Existing production concurrency implementation needed no further correction.
- Runner: an initial substring test-title filter executed zero tests; corrected to the exact title. Existing HTTP test port3337 was occupied, so the runner used local HTTP port3349 without changing PostgreSQL configuration or terminating another process. Sandbox initially denied local socket access; authorized runs used the approved execution path.

## Isolation and remaining issues

Account.processOfx and the monetary validators/client/common representations remain unchanged from f8af214. LEDGERBAL still targets Account.balance; plaidBalance behavior, OFX BalanceHistory writes and old/new eligibility arithmetic remain unchanged. Tests deliberately preserve and characterize them. No BalanceHistory gate/correction, new exact-money helper, JSON/API money change, provider rename, historical repair or new application schema migration was introduced.

BalanceHistory's separately erroneous callable Account writes remain excluded by approved scope. Category-only outsiders/parent-cascade scope limitations remain documented; acceptance is the bounded participating-writer concurrency foundation, not universal accounting correctness. Same-Budget provider calls hold the existing gate over network pagination; this contention tradeoff is preserved.

## Final suite, static checks and authorization

Full suite: **1,256 passed, 0 failed, 0 skipped/pending**. Focused acceptance: **214 passed, 0 failed, 0 skipped/pending**. Core database concurrency groups comprise 19 Account-writer cases and 20 Plaid concurrency cases. The final full run recorded 52,791 independent checks and 52,788 guarded SQL operations, including its returned teardown. Focused run recorded 13,766 checks and 13,763 guarded SQL operations. Initial nine-pair regression run passed all 9 after fixture correction.

Both TypeScript checks, ESLint, Knip, circular regression, server build (including client asset build) and standard/staged diff checks passed. Circular analysis retained only the accepted 11-model/26-edge component. Warnings: existing large client bundle; build emitted plugin-timing information; test Vite HMR port24678 was occupied, without affecting HTTP3349 test results. Initial lint warnings and one unused test-helper export were corrected in test infrastructure. No unexpected test500/deadlock/lock timeout remained; synthetic failure scenarios intentionally log their expected errors.

Verification added tests/helpers/databaseSafety.ts, tests/unit/databaseSafety.spec.ts, tests/unit/databaseSafetyLifecycle.spec.js and updated tests/bootstrap.ts. It strengthened tests/functional/concurrency/accountBalanceWriters.spec.ts and tests/functional/institutions/plaidConcurrency.spec.ts, and updated the five requested design/implementation/review records plus this verification document. No production file was changed during verification beyond the already implemented correction under test. No new application migration was created or applied: bootstrap reported existing migrations already up to date; test-specific temporary DDL was independently guarded. The test-specific authorization expires at completion and cannot be reused for OFX semantic verification. No deployment or commit was performed.
