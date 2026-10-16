# OFX balance-authority correction implementation

Status: **PostgreSQL-verified and accepted**. Implementation itself made no database connection; subsequent OFX verification received fresh task-specific authorization only for localhost:5432/spendcraft_test. Verification is complete and that authorization is now expired. The earlier concurrency authorization was not reused.

## Baseline and prerequisite

Exact HEAD before edits: `3b01c34067e61e778916ebda5a80527540ccef00` (“Added more budget locking to resolve concurrency issues.”). Tracked worktree/index were clean. Its committed concurrency correction is the required accepted baseline: CREATE/DELETE/command join Budget gates; PATCH/HTTP OFX/startDate retain them; Plaid refreshes after waiting and shared branches are sequential. Prior verification:214 focused /1,256 full-suite passed with no failures/skips. This task does not claim those DB results for the new semantics. Unrelated untracked editor/generated files, dumps and scratch files were preserved.

The earlier OFX implementation attempt stopped before runtime edits because ungated manual stale saves could overwrite OFX. That source defect and its concurrency correction remain documented separately; it is not a new blocker after acceptance. See [concurrency design](account-balance-writer-concurrency-design.md), [implementation](account-balance-writer-concurrency-implementation.md) and [PostgreSQL evidence](account-balance-writer-concurrency-postgresql-verification.md).

## Production changes

- **app/Models/Account.ts, processOfx:** shared correction for HTTP and command. Complete input preflight checks supplied ledger validity and multiple existing matches before financial mutation. Existing parser/identity normalization retained. Missing Transaction list is empty, not an undefined synthetic row.
- Supplied finite numeric ledger writes only plaidBalance. Missing aggregate leaves provider observation unchanged; supplied empty/malformed/nonfinite fails with existing Error→HTTP500/errors or command rollback/log convention. Zero is a supplied value. No precision/range/scale policy is added.
- Account.balance receives accumulated eligible old/new signed Transaction deltas, regardless of ledger presence. AccountTransaction.amount equals TRNAMT; no extra Credit sign.
- Existing Category old/new allocation deltas remain independent of pending. Explicit user splits, metadata/order/duplicate IDs and rounded-cent remainder preserved.
- New rows apply eligible effects once. Active replay has zero financial delta. Amount/date modifications apply new−old eligible effects. Deleted restoration has zero old effect and eligible new effect once. No omission deletion.
- Actual pending mapping unchanged: new DB defaultfalse, matched pending retained; parser does not expose a mapped pending distinction. No conversion invented.
- Multiple existing Account-scoped matches fail before any row in the file mutates. Composite parsed FID/ACCTID/FITID preserved; repeated incoming keys continue sequential replay/modification semantics.
- Removed **only** the OFX updateAccountBalanceHistory call. Both entry points now perform no history insert/update/delete/restore. Generic/manual history methods/routes are untouched; old rows remain.
- Account saves after Transaction net effects, before existing opening maintenance. Opening reads accounting balance, not provider ledger. Existing formula/date/Pool signs and missing-opening creation retained. No new adjustment or reconstruction.
- **client-src/State/Account.ts / Types.ts / AccountView/AccountsToolbar.tsx:** State upload method checks success, reloads authoritative independent balances and Category/Account/pending/loaded Category transaction caches. Toolbar delegates. Existing shared Account objects survive refresh. No history refresh or ledger-derived cache assignment. Rejection causes no refresh/cache mutation. Server response remains unchanged; no new providerBalance field.

HTTP and command Budget gates and scoped post-wait reloads are unchanged. Related Account/Transaction/link/Category/log/opening/Pool persistence still uses the owning transaction. No new Account/Category lock hierarchy, global lock or provider fetch is introduced. Parsing/preflight currently occurs inside the existing Budget transaction; command prompts remain before its gate. No Plaid change.

## Atomicity and opening

Owned mutation set is Transactions, AccountTransactions, Category balances, Account.balance delta, optional plaidBalance, existing opening/Pool and logs. All commit/rollback together under caller transaction. BalanceHistory is outside this set. Malformed ledgers/ambiguous identities preflight before mutation; late persistence/opening failures rely on owning transaction rollback.

For a consistent opening, prior B−S becomes (B+d)−(S+d), so amount/Pool are invariant even when provider observation differs. Example B1000/provider1400, signed new eligible TRNAMT−50, ledger1500 → B950/provider1500, opening unchanged. Existing baseline offsets are not inferred or repaired; retained opening maintenance can create a missing opening according to its existing lifecycle. DTASOF is not opening date; no active provider-observation timestamp is invented.

## Tests changed and prepared

Non-DB unit OFX tests replaced defect expectations, rather than deleting scenarios. They execute the actual processOfx method using real XML parsing and inert model adapters with a history method that throws if invoked. Cover ledger destination (including finite sub-cent acceptance to prove no new precision policy), absent/invalid observation, new/replay/net amount/date crossings, pending, restored eligible/ineligible/pending, user allocations, ambiguous later identity, repeated incoming identity, no omission deletion and existing numeric identity normalization. Opening instrumentation records accounting balance passed to the helper.

Client financial State tests add success independent-balance/cache refresh and rejected-request noninterference. Existing Account-writer pure/source tests prove accepted Budget gate/fresh-state/provider behavior remains. No application bootstrap or database model import is used by these test runs.

Executable DB tests prepared during implementation, subsequently verified:

- tests/functional/accounts/ofxBalanceAuthority.spec.ts: ledger positive/negative/zero/absent/empty/malformed; six sign/date new cases; ledger-only and replay/new observation; date/amount modifications; matched pending; restoration/replay/omission; ambiguous later match; existing history unchanged; raw persisted balances; opening/Pool independence; post-opening rollback; command import and HTTP replay; foreign/missing Account.
- tests/functional/accounts/ofxReimport.spec.ts: retain allocation/identity/restoration/date scenarios with accounting-derived expectations and separate provider assertions. Replace obsolete history-constraint failure with a late Pool save failure and full snapshot rollback. No new temporary DDL or cleanup is required.
- tests/functional/concurrency/accountBalanceWriters.spec.ts: preserve deterministic actual Budget-wait barriers and binding/rollback/security/independence cases. Update four pair expectations that previously depended on ledger replacing accounting balance. OFX/manual CREATE/DELETE/PATCH and OFX/OFX now assert eligible net composition and stable opening/Pool.
- Existing Plaid concurrency, manual Transaction, startDate, Statement, funding/rebalance, offline, command lifecycle, tenant and Loan suites remain future regression gates. No broader semantics changed to satisfy tests.

Existing centralized test-only safeguards remain unchanged: fresh task-specific authorization is required before execution, with independently verified configured/live pg and pgLog plus actual execution connection, immediately before every destructive setup/cleanup/SQL operation. Only localhost:5432/spendcraft_test may be authorized. No environment switch/acknowledgement is used in this task.

## Floating-money inventory retained for later work

| Boundary | Current representation/arithmetic retained |
|---|---|
| Parser | fast-xml-parser numeric normalization; unary minus TRNAMT; Number for valid ledger |
| Hydration | Account/AccountTransaction/Category numeric fields use existing JS numbers/parseFloat |
| Account | Eligible signed new−old subtraction, running sum and prior balance+sum |
| Allocations | JSON number amounts; Math.round(amount*100), explicit split sum/subtraction and remainder /100 |
| Categories | Grouped rounded-cent numeric accumulation, balance*100 plus delta /100 |
| Opening | SQL SUM numeric response, subtraction from hydrated Account.balance; opening new−old and Pool floating addition |
| Persistence/API/client | Existing numeric relational columns, JSON numbers and dollar-number response/client fields |

No new precision policy, exact parser, MinorUnits, money strings or JSON representation exists. Rates/currency/sign/identity normalization are not silently redesigned. CURDEF/DTASOF remain ignored as before. Multi-currency/observation freshness and the future plaidBalance/plaid_balance rename are separate tasks.

## Scope and historical limits

Forward-only. No old accounting balance, Category effect, provider balance or historical OFX history is repaired, deleted or replayed. BalanceHistory's generic current-balance defect remains deliberately untouched. No manual eligibility, Statement, funding/rebalance, offline initialization, Plaid, Loan or Transaction DELETE semantic correction is included. Accepted bounded serialization does not certify excluded erroneous/history/cascade writers.

## Verification

Final focused standalone Japa run: **85 passed, 0 failed, 0 skipped/pending** (21 OFX actual-method cases, 11 Account-writer source/inert behavior cases, 53 bundled client State regressions). No tests/bootstrap.ts or DB-backed suite was loaded. An initial fixture used numeric-only DTPOSTED, which the existing parser normalizes to a number; corrected the fixture to the existing supported timestamp-with-GMT format, without broadening parser behavior. Initial lint identified the new test's missing explicit node:buffer File import and preferred interface spelling; both were corrected.

Both server/client TypeScript checks passed, including type-checking prepared DB cases without running them. ESLint, Knip, circular regression, server build, client build and standard/staged git diff --check passed. Circular analysis retained only the accepted 11-model/26-edge component. Builds emitted the established >500kB bundle warning (JS approximately1,035.67kB before gzip); no other warning remained.

Prepared coverage comprises25 new OFX authority DB cases,19 updated reimport cases and19 existing deterministic Account-writer concurrency cases with corrected semantic expectations. These counts describe the original preparation, not the expanded final verification matrix. Provider/manual/Statement/etc. regressions subsequently passed. The implementation-only phase did not run the full suite; later verification established the new1,305 baseline.

Source audit: both entry points still call the shared method after Budget acquisition/fresh scoped reload; no ledger-to-accounting assignment or OFX history persistence remains; supplied ledger writes plaidBalance; absent ledger leaves it untouched; only Transaction net delta changes accounting balance; opening consumes this.balance; no omission deletion, provider rename or exact-money architecture was added. Generic history methods and unrelated writers remain untouched.

The implementation-only phase made no database connection or destructive DB operation. Subsequent fresh OFX authorization permitted safeguarded verification on the exact test target. Final focused acceptance: **681 passed,0 failed,0 skipped/pending**; full suite: **1,305 passed,0 failed,0 skipped/pending**. See [PostgreSQL evidence](ofx-account-provider-balance-correction-postgresql-verification.md).

Verification strengthened test instrumentation and regressions without further production/safety-infrastructure changes: both entry points use one transaction; opening runs once from accounting balance; a history save would fail the test; current numeric identity normalization replays one row; malformed command rolls back; concurrent final provider value follows serial order; rolled-back OFX releases both balances to fresh waiters. A Lucid relation-parent no-op save was initially mistaken for a financial update; instrumentation now checks dirty monetary fields. Core matrix grew to69 cases (29 OFX authority,19 reimport,21 concurrency), all passing.

No historical repair, historical history cleanup, generic BalanceHistory change, unrelated provider change, exact-money migration, rename, application schema migration, deployment or agent-created commit occurred. Task-specific DB authorization is expired.
