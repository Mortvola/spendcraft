# OFX balance-authority PostgreSQL verification

> Subsequent product direction: BalanceHistory is deprecated. Its runtime lifecycle is removed and PostgreSQL-verified (physical schema cleanup deferred); earlier proposals to preserve/fix/migrate that feature are superseded. Historical verification facts below remain unchanged. See [deprecation record](balance-history-deprecation.md). No physical table removal or historical repair is authorized.

Status: ACCEPTED. Focused 681 / full-suite 1,305 passed, 0 failed, 0 skipped/pending.

Verification HEAD: `3b01c34067e61e778916ebda5a80527540ccef00`. The committed, accepted Account-balance concurrency correction was present. The OFX correction was initially uncommitted; existing files and subsequent externally staged work were preserved. No agent commit, reset or index mutation was performed. Scope: OFX authority correction only, retaining current monetary representations and the bounded concurrency foundation.

## Safety and authorization

Fresh task-specific destructive authorization applied only to `localhost:5432/spendcraft_test`. No PostgreSQL environment was redirected. Configured pg and pgLog both resolved to host localhost, port 5432, database spendcraft_test. Before destructive setup, independent live connections both reported database spendcraft_test, port 5432, server `::1/128` and peer `::1/128`, positively accepted by the centralized loopback validator. Credentials were not logged.

Reviewed current tests/bootstrap.ts, tests/helpers/databaseSafety.ts, database config, Lucid setup/returned teardown and all OFX/concurrency fixture/cleanup paths. Twenty-seven inert safeguard tests passed before DB tests: configured mismatch before connection, positive loopback and negative target checks, inherited transaction driver interception, per-destructive-statement rechecking and changed pgLog identity blocking later cleanup.

The accepted driver-prototype guard remains unchanged. Immediately before each destructive statement it independently reruns configured/live pg AND pgLog checks, then verifies the actual execution connection. Setup explicitly verifies before Lucid bootstrap. Returned teardown explicitly verifies again before cleanup; the per-statement guard remains installed throughout. Test-specific ORM deletes, fixture mutations, temporary constraints/extensions and their cleanup use the guarded Lucid/Knex driver. Full-suite source scan found no separate raw pg Client/Pool cleanup connection bypass. New OFX tests add no destructive raw SQL or temporary DDL; injected failure mocks are restored in finally blocks.

Initial sandbox execution denied local sockets before safety could establish a live connection/destructive setup. Authorized execution then used the escalation path. HTTP test port 3349 was used; database configuration was not changed. Vite's existing HMR port 24678 was occupied, which did not affect HTTP/database results.

## Financial acceptance evidence

| Area | Result |
|---|---|
| Independent balances | Starting accounting1000/provider1400, new signed TRNAMT−50 and ledger1500 produce accounting950/provider1500; ledger never replaces accounting balance |
| Ledger observations | Positive, negative and zero persist independently; absent ledger permits posting and preserves old provider value; malformed/empty/nonfinite supplied values reject atomically |
| New/boundary | Signed positive/negative amounts before/equal/after startDate persist once; pre-start has neither Account nor Category effect; equal is eligible |
| Replay/modification | Original link/Transaction identities remain; identical active replay adds zero financial effect; new ledger updates only provider observation; amount/date changes apply independently eligible new−old effects |
| Pending | Current parser has no mapped pending indicator. New links retain DB false default; matched true stays true, with no Account contribution but eligible Category contribution. No new pending→posted conversion exists |
| Restoration/omission | Deleted match has zero old applied effect; eligible new effects apply once; replay is zero; omission does not delete/reverse existing rows |
| Identity/allocation | Parsed FID/ACCTID/FITID normalization retained, including leading zeros collapsing under current parser; multiple existing matches reject before earlier incoming rows mutate; explicit allocation metadata/order and Unassigned remainder preserved |
| History | Seeded BalanceHistory rows remain unchanged through HTTP and command. No inserts, updates, deletes or restoration. History model save instrumentation fails if invoked; no invocation occurs |
| Opening/Pool | Both entry points run opening once using post-Transaction accounting950 while provider1500 differs. Opening/Pool remain1000 in consistent fixtures. Ledger-only changes do not alter opening/Pool; absent-ledger posting still uses new accounting balance |
| Raw persistence | Account.balance and plaid_balance decimal text assertions, persisted link amounts/JSON allocations and raw Category snapshots agree under current number representation; no exact-money policy is asserted |
| Response/client | Real connected-accounts response returns accounting950/provider1500 independently. Bundled client State tests refresh financial caches on success and preserve shared identities, without history refresh; rejection leaves caches unchanged. No browser end-to-end automation is claimed |
| Late failure | Pool save and post-opening failures roll back Transactions, links, Categories, both balances, opening/Pool and logs; history remains untouched |
| Transaction binding | HTTP and command Account/AccountTransaction/Transaction/Category/TransactionLog saves share one owning transaction. One dirty Account monetary save records950/1500; relation-parent no-op saves are distinguished from SQL monetary mutation |
| Security | Foreign/missing Account rejection and existing Account/Institution/Budget/shared-user/command scope regressions preserve state |

## Deterministic concurrency

The existing actual PostgreSQL Budget-wait barriers remain; arbitrary sleeps are not primary synchronization. Account and Category state, link/Transaction counts, deleted/version/log state and opening/Pool are asserted. Provider observation is now also asserted in the nine-pair matrix.

| Serialized order | Final accounting / provider | Category / Pool |
|---|---|---|
| OFX(+10,L110) → CREATE(+5) |115 /110 |15 /100 |
| CREATE(+10) → OFX(+10,L110) |120 /110 |20 /100 |
| OFX(+10,L110) → DELETE(seed+4) |110 /110 |10 /100 |
| DELETE(seed+4) → OFX(+10,L110) |110 /110 |10 /100 |
| PATCH(seed4→6) → OFX(+10,L110) |116 /110 |16 /100 |
| OFX(+10,L110) → PATCH(seed4→6) |116 /110 |16 /100 |
| OFX(+10,L110) → OFX(+10,L120) |120 /120 |20 /100 |

Seeded cases start accounting104; others100. OFX/OFX has explicitly controlled first L110 then L120 ordering: both posting effects survive, and final provider observation belongs to last writer. HTTP/command overlap retains scoped identity and Budget gating. CREATE/CREATE and CREATE/DELETE remain valid serial compositions.

Two added rollback/waiter cases save both balances in OFX, hold the Budget, observe a waiter, then force rollback. Waiting manual CREATE sees original state and yields accounting105/providerNULL/Category5; waiting OFX sees original state and yields accounting110/provider120/Category10. Each has one surviving ordinary Transaction, correct logs and Pool100. Existing late CREATE rollback, same-Budget/distinct-Account serialization, different-Budget independence and startDate overlap remain covered.

No 40P01 deadlock or unexpected lock timeout was observed in the core focused run. Same-Budget contention is intentional; different Budgets remain independent. Existing Plaid fresh-cursor/sequential shared-Pool tests are regression gates without semantic changes.

## Corrections and limitations

No production or safety-infrastructure correction was needed during the initial core verification. Strengthened test-only instrumentation initially counted Lucid relation creation's parent no-op Account.save as a monetary write; inspecting Lucid dirty-field handling established that it issues no balance update. The assertion now captures actual dirty monetary writes and still requires exactly950/1500 once. Added opening-call count, both-entry binding/history instrumentation, identity-normalization endpoint test, malformed command rollback, final provider ordering and OFX rollback/waiter cases.

An initial multi-file CLI invocation supplied the second file as a positional suite, so it failed before test setup; corrected to repeated --files flags. The strengthened core rerun passed 69 cases. Synthetic error scenarios intentionally emit existing500/error logs; they are asserted rollback/rejection, not unexplained failures.

No historical baseline is inferred or repaired. Old ledger-overwritten Account/opening/Pool state and old OFX history remain. Generic/manual BalanceHistory's known Account mutation defect remains deliberately uncorrected. Manual eligibility, Plaid, Statement, funding/rebalance, offline, Loan and Transaction DELETE semantics are unchanged. Remaining floating parsing/hydration, Account delta accumulation, JSON split arithmetic and opening/Pool math remain inventoried in the implementation record. No rename, exact-money migration, application schema migration or persisted provenance was introduced.

## Final results

Focused acceptance passed **681 tests, 0 failed, 0 skipped/pending**. Its setup/cleanup recorded 35,239 independent safety checks and 35,236 guarded SQL operations. The strengthened core subset passed 69, with 3,969 checks and 3,966 guarded operations. The original 25-case run passed before expansion. Counts from earlier intermediate runs are not added to the focused result.

Both TypeScript checks, ESLint, Knip and circular regression passed after final test changes; only the accepted 11-model/26-edge cycle remains. Account model AST comparison against HEAD confirms that processOfx is the only changed method: generic history, Plaid posting helpers and opening implementation remain identical to baseline. Complete suite passed **1,305 tests,0 failed, 0 skipped/pending**. Before full bootstrap the same configured/live pg and pgLog target was independently reverified. The full run recorded **54,388 independent checks and 54,385 guarded SQL operations**, including returned teardown. Bootstrap reported existing migrations already up to date. No new application migration was created/applied; existing temporary test DDL and cleanup remained guarded.

No production or test-infrastructure correction was required during verification. Only the OFX/concurrency tests and the requested documentation were strengthened. The final test state retains all initial staged/uncommitted work. No unexpected500,40P01 deadlock or lock timeout remained; synthetic failure cases intentionally exercise existing rejection/rollback logs.

Server and separate client builds passed. Both standard and staged git diff --check passed. The established >500kB client-bundle warning remains (approximately 1,035.67kB before gzip); the test HMR-port conflict noted above was the only additional environment warning. Database verification is complete: **task-specific authorization is now expired**. No further DB operation is authorized by this task. No historical repair or BalanceHistory cleanup, generic BalanceHistory change, exact-money migration, provider rename, unrelated provider change, application schema migration, deployment or commit occurred.
