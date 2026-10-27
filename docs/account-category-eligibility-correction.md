# Account/Category eligibility and startDate correction

## Status and baseline

Implemented against HEAD `9c6635b526f37631040462c9fee750e17bc96eec`, with an initially clean tracked tree. The accepted shared Budget gate, OFX accounting/provider-balance separation and BalanceHistory runtime deprecation are retained. The implementation phase made no database connection. Subsequent task-specific PostgreSQL verification is **accepted**: 994 focused / 1,382 full-suite passed, 0 failed, 0 skipped/pending. See verification evidence. Existing local untracked files are untouched.

This is a forward correctness correction using existing monetary types and arithmetic. It introduces no schema, representation, parser, precision, API capability, historical repair or DELETE guard.

## Rules and scope

Ordinary active account-linked Transactions have two independent eligibility decisions:

- Account: `!deleted && !pending && date >= Account.startDate`.
- Category: `!deleted && date >= Account.startDate`.

Signed AccountTransaction.amount adds to Account.balance. Signed JSON allocations add to Category.balance. Replacement deltas are new eligible effect minus old eligible effect. Equality is eligible; positive, negative and zero have the same eligibility rules.

`app/services/transactionEligibility.ts` implements the distinct decisions and grouped Category replacement deltas. Grouping sums duplicate Category IDs independently on each side before subtracting; identical allocations therefore have zero delta even with floating decimal values. JSON identity/order/comments are not normalized. Floating representation remains intentionally unchanged.

Controller corrections cover nonloan transaction-tracked ordinary types 0 (provider/import) and 5 (manual). Opening/type 4, type 1 transfers, Loan special handling and accountless types 2/3 are separate lifecycles. There is no current active ordinary transfer writer establishing a replacement policy for multi-Account shapes; this change does not invent one. Existing special PATCH/Loan branches are preserved.

## Reconfirmed defects and final writer matrix

| Writer / source | Previous Account rule | Previous Category rule | Correction / remaining issue |
| --- | --- | --- | --- |
| AccountsController.addTransaction | Unconditionally added amount (Loan principal separately) | Unconditionally added splits | Nonloan ordinary CREATE now uses independent eligibility. Nominal amount, date and splits persist even before startDate. |
| TransactionsController.update | Reverse/add only for link-field edits; ignored pending/date; no date-only effect | Reverse/add only when categories supplied, ignoring date | Ordinary PATCH now applies old/new Account and Category effects, including date-only changes. Special/Loan branch retained. |
| AccountsController.update startDate | Already preserved Account.balance | Active nonopening rows crossing boundary, but pending excluded | Nonloan crossings now include pending and select only ordinary types 0/5. Deleted/opening/accountless/special types excluded. Existing Loan behavior retained. |
| Account.updateStartingBalance | No Account.balance assignment | Separate opening/Pool maintenance | Formula/date already correct; unchanged. Linked active nonpending on/after-start rows, excluding type 4, form the signed sum. Accountless types 2/3 cannot enter the Account relationship. |
| Account.processOfx, both gated entry points | Active, nonpending, on/after start; old/new delta | Active, on/after start; pending independent | Already correct in accepted OFX correction; unchanged, including restore/replay/identity and LEDGERBAL→plaidBalance. |
| Account.addTransaction / autoAssign / assignUnassigned (Plaid) | Eligible posted amount returned for Institution accumulation | Date-gated explicit allocations; Unassigned nominal amount returned only when date eligible | Already correct; unchanged. Nominal allocations may exist before the boundary without balance contribution. |
| Account.updateTransaction (Plaid) | Independent old/new date/pending effects; deleted local records ignored | Date crossing plus Unassigned remainder; no pending suppression | Already correct for supported provider updates; unchanged. Local-deleted matches are intentionally not restored by this path. |
| Account.deleteAccountTransaction (Plaid removal) | Reverse active nonpending on/after amount | Reverse active on/after allocations regardless of pending | Current forward rules already implemented; unchanged. Historical applied-effect risk remains. |
| TransactionsController.delete | Account reversal checks pending but not date | Reverses nominal splits/fallback without date eligibility | **Deferred historical reversal ambiguity; no runtime change.** Current state alone cannot prove old applied effects. |
| InstitutionController.deleteAccounts and Account/Institution cascades | Deleted Account's own balance disappears | Nominal Category reversal with broad shape/historical ambiguity | **Deferred**, no change or guard. Surviving Categories may retain historical errors. |
| Offline/provider initialization | Route-specific initialization/first-provider balance semantics | Opening/Pool or initial Statement, route-specific | Initialization is separate authority, unchanged. New/existing Institution distinction retained. |
| Statements | Latest Statement authority only for balance-tracked Accounts | Membership does not post ordinary effects | Separate lifecycle, unchanged. |
| Accountless type-2 funding/type-3 rebalance | No Account balance contribution | Their accountless Category lifecycle | Unchanged; no synthetic Account/startDate context. |
| BalanceHistory | Deprecated | Deprecated | No runtime readers/writers restored. Minimal parent cleanup remains. |

Evidence is current production methods above, existing tests in `tests/functional/transactions/lifecycle.spec.ts`, `tests/functional/accounts/startDate.spec.ts`, `tests/functional/accounts/ofxBalanceAuthority.spec.ts`, `tests/functional/institutions/plaidSync.spec.ts`, and `tests/functional/concurrency/accountBalanceWriters.spec.ts`. These tests were prepared/read without execution during implementation; subsequent authorized execution is recorded below.

## CREATE and PATCH details

CREATE retains existing validation, empty-allocation Unassigned fallback, tenant preflight, persistence and response shape. Manual CREATE and PATCH validators do not expose pending; no capability is added. Pending fixtures and provider state still matter for PATCH and startDate.

PATCH computes old and final new eligibility before merging date/link changes. Account delta uses the signed old/new amount and pending independently of Category eligibility. Category delta uses existing explicit allocations, requested replacement, or existing empty-split Unassigned fallback. Duplicate IDs sum without rewriting nominal JSON. Categories-only edits leave Account balance unchanged. Name/comment/Statement-only edits create no Account/Category effects. Version/log and Statement membership lifecycle remain; unnecessary existing monetary loading/validation on metadata edits is a separate robustness concern, not optimized here.

Existing manual split validation is preserved: an amount-only change incompatible with explicit type-5 splits still rejects; callers must supply a valid resulting allocation. A manual PATCH of type-0 amount alone retains existing explicit allocations, rather than adopting provider-import remainder policy. Provider reimport continues its own accepted Unassigned remainder behavior. No new allocation policy is introduced.

## startDate, opening and Funding Pool

Moving later removes ordinary active allocations for `old <= date < new`; moving earlier adds allocations for `new <= date < old`. Pending participates; deleted does not. Nonloan crossing discovery selects only ordinary types 0/5 through the Account relationship. Accountless 2/3 cannot be selected, and opening 4 is excluded. No ordinary crossing occurs for an unchanged date.

Account.balance is never assigned by this endpoint. Existing opening maintenance still runs when a startDate is supplied, including an unchanged value. The opening date follows the new date. Its amount remains:

`unchanged Account.balance - SUM(linked active nonpending signed amounts on/after NEW startDate, excluding opening)`.

The existing Account relationship excludes accountless Transactions. Opening's separate Pool replacement delta is unchanged, so opening is not processed twice as an ordinary Category crossing. A pending crossing changes Categories but contributes nothing to the opening sum. A→B→A restores ordinary effects for consistent forward fixtures while current balance stays fixed; opening follows current financial state/formula throughout. Loan-specific prior crossing behavior is deliberately retained, not generalized from ordinary rules.

## Serialization, atomicity and security

Budget gates still precede financial authority in CREATE, PATCH and startDate. Fresh Account.startDate, Transaction state, links and scoped Categories are read after waiting. All changed reads/writes use the gate's transaction or relationships bound to it. Grouped net Category deltas execute sequentially. No lower-resource locks, new coordinator or cross-Budget operation is introduced. Existing authorization, scoped Category/Statement validation and version conflict handling are preserved.

No new network or provider work was added. OFX/Plaid are audited but untouched. All controller mutations, opening/Pool state and logs remain within existing commit/rollback boundaries.

## Historical limitations and deferred deletion

Forward rules do **not** establish which old effects were actually applied. Existing Account and Category balances may reflect earlier inconsistencies. PATCH replaces effects based on current old/new eligibility; it neither reconstructs nor reconciles an old balance. startDate crosses only the requested boundary, not all historical records. Existing inconsistency can therefore persist.

DELETE/cascade behavior is explicitly not certified by this correction. Applying current eligibility to historical reversal could itself be wrong; no applied-effect authority is inferred from JSON, startDate, membership indexes, timestamps or balances. No repair-on-touch, replay, global recomputation, provenance, guard or automatic resolution is added. These unresolved deletion boundaries do not block forward CREATE/PATCH/startDate correction but require separate product work.

## Non-DB verification

`tests/unit/transactionEligibility.spec.js` executes production eligibility decisions and actual CREATE/PATCH bodies against inert transaction-bound adapters: all date/pending/deleted combinations, signed CREATE, signed date-only round trips, mixed replacements, duplicates, metadata noninterference and ineligible nominal persistence. Opening/source boundaries complement functional tests. Accepted OFX, Budget-gate, BalanceHistory deprecation and real client State tests are rerun without application/database bootstrap.

Final command results and exact focused counts are recorded after verification below.

## PostgreSQL matrix — subsequently verified

Fresh task-specific authorization is required only for `localhost:5432/spendcraft_test`. Use current independent configured/live pg, pgLog and destructive execution-connection safeguards before every destructive statement, setup and cleanup. No authorization from earlier tasks applies.

| Area | Executable coverage prepared / retained |
| --- | --- |
| CREATE | New `transactions/eligibility.spec.ts`: before/equal/after × negative/zero/positive; raw Account read, Category delta and nominal persisted state. Existing lifecycle: allocation replacement, security, validation. Manual API does not accept pending. |
| PATCH | New eligibility cases: pending/nonpending date round trips, ineligible replacement, duplicate nominal IDs, mixed state, metadata/Statement-null, type-0 amount-only; new late-failure rollback. Unit production-method coverage adds categories-only, signs, ineligible noninterference. Existing lifecycle covers eligible amounts/categories, empty fallback, Statements, validation/security and rollback. |
| startDate/opening | Extended `accounts/startDate.spec.ts`: A→B→A, unchanged, pending Category inclusion versus opening-sum exclusion, deleted exclusion, opening date/amount, preserved Account balance, accountless types2/3 inertness and Pool. Existing tests: late Account failure rollback and Balances mode separation. |
| Providers | Retained accepted OFX functional matrix: new/replay/modify/restore/date/pending/ledger independence; Plaid sync tests: added/pending/modified/date crossings/removal/local-deleted behavior. No provider source change. |
| Concurrency | Extended `concurrency/accountBalanceWriters.spec.ts`: actual Budget wait observed through PostgreSQL lock state; startDate commits first and CREATE/PATCH/OFX must reload boundary. Existing reverse-order startDate/CREATE, rollback/gate release, different Budget, transaction binding and log/version assertions retained. No arbitrary sleep barrier. |
| Regressions | Accepted concurrency, OFX, Statement, initialization, funding/rebalance, BalanceHistory deprecation, Loan and current DELETE suites retained for future authorized focused run. DELETE tests characterize existing behavior, not historical correctness. |

All focused criteria subsequently passed before full-suite execution. The historical prepared matrix below remains implementation evidence; final persisted results are in the verification record.

## Original non-DB implementation verification results

- Focused standalone Japa run: **124 passed, 0 failed, 0 skipped/pending** across eligibility, Budget-writer, OFX, BalanceHistory-deprecation and actual client State suites. The new eligibility file contains 34 cases, including real CREATE/PATCH execution and the unchanged monetary-validation rejection contract. No application/DB bootstrap was loaded.
- Both server and client TypeScript checks: passed.
- ESLint and Knip: passed.
- Circular regression: passed; accepted Lucid SCC remains 11 models / 26 internal edges, with no new component.
- Server and client builds: passed. The existing client chunk-size warning (>500 kB) remains nonfatal.
- Working-tree and staged `git diff --check`: passed; no staged changes created.
- 18 additional executable PostgreSQL cases are prepared across the new eligibility file and extensions to startDate/concurrency files. They were **not run**. Existing provider/security/rollback/regression suites are retained for the authorized focused verification matrix.

No database connection or destructive DB operation occurred. No historical repair, BalanceHistory restoration, MinorUnits/exact-money migration, monetary/API/JSON/schema change, DELETE guard, deployment or commit occurred. No separate provider, Statement, Loan, funding/rebalance or initialization semantics were changed. Fresh task-specific authorization is required before PostgreSQL verification.

## Subsequent PostgreSQL verification

Accepted against the same HEAD with working-tree implementation preserved. Before connecting, all 27 inert safeguard cases passed; configured/live pg and pgLog plus the actual destructive execution connection were positively restricted to localhost:5432/spendcraft_test. Every setup and cleanup independently reverified safety. No safety code change was necessary.

Final focused acceptance: **994 passed, 0 failed, 0 skipped/pending** (53,905 independent checks / 53,902 guarded SQL operations). Complete suite, started only after focused acceptance: **1,382 passed, 0 failed, 0 skipped/pending** (56,525 independent checks / 56,522 guarded SQL operations including returned teardown). The full baseline increases from 1,306 by 34 pure and 42 functional cases.

The original 18 prepared DB cases pass. Verification adds 24 functional cases: partial/mixed PATCH and historical nonrepair, explicit signed opening sums, pending provider additions/transitions, and late startDate rollback with a waiting CREATE. No production or test-safety correction was required. Account.balance invariance, opening/Pool, raw persistence, fresh-state Budget contention, transaction binding, security and accepted provider/deprecation regressions pass. DELETE/cascade historical reversal remains deferred.

No historical balance repair, BalanceHistory restoration, representation/schema change, DELETE guard, deployment or commit occurred. Task-specific database authorization is now expired. See the dedicated record for metadata, writer matrix, warnings and final static/build results.
