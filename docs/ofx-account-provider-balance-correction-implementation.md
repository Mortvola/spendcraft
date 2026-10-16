# OFX balance-authority correction: implementation blocker

Status: OFX balance-authority semantic correction remains paused. The separately approved concurrency prerequisite is PostgreSQL-accepted; no OFX semantic runtime correction has been applied. The original blocker analysis below is retained as history.

## Baseline verification

HEAD at task start: `7fdc6369d787869dd5859341f832c0733a6496f1`. Its committed diff from `f8af21435e5279c810a0ab525fdc4a2e1040bf9b` adds only accounting-invariants.md and post-f8af214-correctness-review.md. Runtime app/client/common/commands/start/database/tests source is unchanged. Pre-existing working-tree state includes the earlier OFX design/source test, correctness-review edits and unrelated local untracked files. None was reset/discarded. No unexpected runtime changes were found.

AGENTS.md and all three requested documents were read before edits. Current controllers, Account.processOfx, command and database configuration were inspected without importing/bootstraping the application or connecting to a database.

## Why implementation stopped before runtime edits

Section21 of the approved implementation request permits a task-local concurrency correction but requires STOP if broader concurrency architecture is necessary. Current HTTP OFX cooperates with some writers through a Budget row gate, but other ordinary financial writers do not participate:

| Writer | Read/update evidence | Concurrency consequence |
|---|---|---|
| [HTTP OFX](../app/Controllers/Http/AccountsController.ts:572) | Budget FOR UPDATE, then fresh Account, processOfx | Serializes with cooperating Budget-gated writers only |
| [Manual CREATE](../app/Controllers/Http/AccountsController.ts:167) | Budget read before transaction; Account read without gate; Account.balance += amount; Account.save | Can retain an old Account value across an OFX commit |
| [Transaction DELETE](../app/Controllers/Http/TransactionsController.ts:495) | No Budget gate; Account read, subtraction and absolute model save | Same stale-save risk; it also mutates surviving Categories |
| [Manual PATCH](../app/Controllers/Http/TransactionsController.ts:95) | Budget FOR UPDATE before financial reads | Existing cooperating writer; not the source of this particular missing-gate example |
| [OFX command](../commands/OfxUpload.ts:30) | Transaction, no Budget gate, final global name lookup | Needs local scope/binding/gate correction, but that alone cannot repair other writers |

Account has no balance hook or optimistic balance/version condition which resolves this race. This is a source-derived risk, not a claimed PostgreSQL reproduction.

Source-consistent interleaving, using ordinary nonpending eligible amounts:

1. Account.balance is100. Manual CREATE loads100 but has not saved it.
2. OFX holds its Budget gate, loads100, imports signed amount+10 and commits110 under the proposed corrected semantics.
3. Manual CREATE resumes with its hydrated100, adds signed amount-5 and saves95.
4. Both Transactions remain persisted. The correct combined accounting result would be105.

An OFX-only Account row lock does not make the manual plain SELECT wait/reload its old model. Its later UPDATE may wait for the lock, then still write95. An OFX-only atomic increment also cannot prevent a subsequent stale absolute save. More isolation/retries in OFX alone cannot guarantee cooperation of other transactions. Similar read/modify/save exposure exists for shared Category/Pool state; protecting Account alone is insufficient.

Therefore the smallest complete correction needs participation by relevant competing writers, or a tested shared mutation strategy. Adding an isolated OFX lock would falsely imply safety. Restoring a universal abandoned Budget helper, changing all balances to atomic updates, or broadening locking across unrelated writers is not authorized here. No partial financial fix was applied.

## Proposed prerequisite for approval

Separately scope a concurrency correction for OFX and relevant same-Budget balance/Category/Pool writers. Inventory actual competing writers, establish one compatible coordination/update strategy, require fresh financial reads after acquisition, and preserve existing product effects. Reuse existing Budget gates where suitable; do not assume the abandoned architecture or add a lower-resource lock hierarchy by default.

At minimum test OFX/manual CREATE, OFX/DELETE, OFX/PATCH and OFX/OFX, command/HTTP overlap, different Accounts sharing Categories/Pool, rollback/retry and different-Budget independence. An Account-only solution is incomplete. The paused manual BalanceHistory balance defect is a known independent writer and must be explicitly accounted for in the concurrency scope without silently implementing its semantic correction.

Once this prerequisite is approved and completed, resume the focused OFX correction against the approved product rules below.

## Approved correction retained; none implemented yet

- Signed AccountTransaction.amount equals OFX TRNAMT. Account delta is new eligible amount minus old eligible amount, with active/nonpending/date>=startDate evaluated independently for each state.
- Category deltas use active/date>=startDate; pending does not suppress them. Preserve explicit allocations, metadata/duplicates and Unassigned remainder semantics.
- Ledger updates plaidBalance only. Absent is valid and preserves it; empty/malformed supplied ledger fails atomically before committed mutations.
- Replay has zero financial delta; modification applies old/new difference; deleted restoration has zero old effect and applies eligible new effect once. No removal by file omission.
- Current new OFX rows default nonpending; matched pending status is preserved. No new pending mapping.
- Preserve current composite parsed identity and fail closed on ambiguous existing logical matches before financial mutation.
- Remove the single OFX updateAccountBalanceHistory call shared by both entry points. No generic/manual history behavior changes or historical history cleanup. No opening code reads history.
- Existing opening maintenance must see the resulting accounting balance. For consistent state, `(B+d)-(S+d)=B-S`; ledger-only changes cannot alter opening/Pool. Do not rebuild historical opening state.
- No new observation timestamp exists in the active Account model; do not invent one. No plaidBalance rename, currency/precision policy or representation change.
- Client upload currently has no success cache refresh; future correction must refresh authoritative independent balances and affected financial state on success, without history refresh or assumed equality.

## PostgreSQL matrix prepared as design only

No DB-backed test code or destructive fixture helper was added after this stop. The approved design's detailed matrix remains the preparation for subsequent implementation. Extend it with these required acceptance assertions:

| Group | Required cases |
|---|---|
| Ledger | Positive/negative/zero/absent versus supplied empty/malformed; ledger-only, transaction-only, both, replay with changed ledger |
| Transactions | Signed new amount; before/equal/after startDate; replay0; amount/date modifications and crossings; matched pending preserved; restoration once |
| Identity/allocation | Duplicate existing logical match rejects atomically; current FID/ACCTID/FITID preserved; explicit split metadata and Unassigned remainder preserved |
| History | Seed existing rows, compare complete before/after rows; no insert/update/delete through either OFX entry point |
| Opening | Post-Transaction accounting balance controls calculation; provider ledger does not contaminate opening/Pool |
| Atomicity | Late failure rolls back rows, both balances, Categories/opening/Pool; no history activity |
| Concurrency | Deterministic stale-read schedules above, both orders; same-Account and shared-Category contention; cooperating command/HTTP; rollback/retry; different Budgets |
| Security/regressions | Foreign Account/Institution/Budget; manual Transactions, startDate, Statements, funding/rebalance, offline initialization, Plaid and Loan boundaries |

Future DB verification requires fresh task-specific authorization and verified safety mechanisms. Current tests/bootstrap.ts directly truncates the database; no abandoned safeguard or authorization should be assumed available. Do not request destructive execution as the next step while this implementation remains blocked.

## Representation and historical limitations

Floating-dollar arithmetic remains in OFX raw old/new amount differences, operation accumulation, Account addition, Category rounded-cent remainder/deltas, and opening subtraction/Pool addition. All are unchanged by this stop. Existing ledger-overwritten balances and previously inserted history remain untouched; no repair/replay is approved.

## Verification and mutation boundary

Documentation-only changes record the approved rules and blocker. Runtime/client/test implementation was not changed during this attempt. No DB connection, DB-backed test, destructive setup/cleanup, historical balance repair, BalanceHistory cleanup/general correction, exact-money migration, rename, schema migration, deployment or commit occurred.

## Shared Account concurrency design (no implementation)

The source-based recommendation is now documented in [Account-balance writer concurrency design](account-balance-writer-concurrency-design.md). Required normal existing-Account posting set: manual CREATE, PATCH, DELETE, OFX HTTP/command, Plaid syncUpdate through all callers; retain existing mode/startDate and Statement gates. The missing participation is principally CREATE/DELETE/OFX command; existing gated paths require fresh-state/transaction-binding verification, including preloaded provider state. Recommend extending the existing Budget gate to this bounded set before financial reads, not introducing universal application serialization or Account prelocks.

Initialization-only writes and Category-only operations do not become Account writers. Erroneous manual BalanceHistory writes remain paused and cannot be legitimized by locking. Full OFX activation must explicitly account for any additional shared Category/Pool and parent-lifetime guarantees; Account-delta serialization alone must not be advertised as global financial correctness. No OFX runtime implementation resumed; approval and separately authorized DB verification remain necessary. See the concurrency design for rollout boundaries, remaining product scope choices and deterministic future tests.

## Concurrency prerequisite implemented, DB verification pending

See [bounded concurrency implementation](account-balance-writer-concurrency-implementation.md). CREATE, DELETE and the OFX command now join existing Budget gates; Plaid reloads after waiting and shared financial branches are sequential. This resolves the missing-protocol implementation prerequisite within the approved participant set, subject to PostgreSQL verification. The OFX processing method, its LEDGERBAL/account assignment, plaidBalance behavior and BalanceHistory coupling are unchanged. No BalanceHistory, eligibility or monetary-representation correction occurred. Do not resume OFX semantic work implicitly.

## Concurrency prerequisite PostgreSQL acceptance

The bounded concurrency prerequisite is accepted:214 focused and 1,256 full-suite tests passed, 0 failed,0 skipped/pending. The [verification record](account-balance-writer-concurrency-postgresql-verification.md) documents safeguards and exact writer-pair results. This supersedes earlier prerequisite-pending status; historical blocker analysis remains as evidence. OFX semantic implementation has NOT resumed: LEDGERBAL still writes Account.balance, plaidBalance/history/eligibility behavior remains current. A subsequent OFX task may resume separately; this task's DB authorization expires and cannot be reused.
