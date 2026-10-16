# Account-balance writer concurrency design

Status: APPROVED bounded design; implemented with non-DB verification, PostgreSQL acceptance passed. The inventory/timelines below retain the pre-correction characterization; see [implementation record](account-balance-writer-concurrency-implementation.md) for current changes. HEAD inspected: `7fdc6369d787869dd5859341f832c0733a6496f1`; committed delta from f8af214 is the two reconciliation documents only. Runtime remains f8af214. Existing staged/unstaged documentation, earlier OFX source test and unrelated untracked files were preserved. No runtime change, DB connection, DB test or historical repair occurred.

## Invariant and conclusion

For supported financial operations on a surviving Account, committed balance effects must compose exactly once in an allowed serial order. No delta may disappear because another operation saves a balance calculated from stale state. An intentional absolute/derived write can supersede an earlier balance in that order; that is different from losing a delta through a stale read. Currency representation and a particular locking mechanism are not part of this invariant.

**Recommendation: extend the existing Budget gate to the bounded set of existing-Account financial posting writers and their lifetime/eligibility boundaries.** Begin transaction, establish authorized Budget, acquire its row FOR UPDATE before financial work, reload authoritative state, perform transaction-bound financial work, then commit/rollback. No new schema, universal application-wide gate, helper framework or lower-resource prelocks are required by this design.

This is not the theoretical narrowest contention boundary: one Account can be protected by a consistently used Account lock. It is the smallest repository-compatible protocol change for the current combined Account/Category writers because several already acquire Budget first, PATCH updates Categories before Account, CREATE does the opposite, and provider sync handles multiple Accounts. An Account-only protocol would require changing existing resource acquisition order and complete multi-Account discovery as well as adding locks. A limited extension of existing Budget gates avoids that redesign.

Do not include every monetary writer merely because a Budget exists. New Account initialization, pure Category/report writes and separate Loan model operations are not existing-Account lost-update writers. Other correctness risks they pose are explicitly separate below.

## Evidence and search coverage

Searched production app/, commands/, start/ and database migrations for balance assignments/merges/fills, Account creation/query updates, increments/decrements, row/advisory/table locks and indirect helpers. Read the matched implementations and their callers; client cache and Category/Loan/history balance properties were distinguished from Account.balance. Current HTTP routes, queue worker, InstitutionSync command and OFX command were traced. No production SQL increment/decrement of accounts.balance, Account optimistic version check, balance-save hook, Account FOR UPDATE or financial advisory/table lock was found.

Primary evidence:

- [AccountsController](../app/Controllers/Http/AccountsController.ts): addTransaction167, addBalance291, updateBalance361, deleteBalance426, update471, uploadOfx572, Statements661/766/901.
- [TransactionsController](../app/Controllers/Http/TransactionsController.ts): update95, delete495.
- [Account](../app/Models/Account.ts): Plaid add/update/remove helpers, processOfx708, opening917.
- [Institution](../app/Models/Institution.ts): updateAccountBalances65, syncUpdate195.
- [InstitutionController](../app/Controllers/Http/InstitutionController.ts): online add/update, offline add173/addOfflineAccount563, syncAll661/sync700, deleteAccount846/deleteAccounts877/delete964.
- [QueueListener](../commands/QueueListener.ts), [InstitutionSync](../commands/InstitutionSync.ts), [OfxUpload](../commands/OfxUpload.ts).
- [CheckBalances](../commands/CheckBalances.ts), [CheckUnassigned](../commands/CheckUnassigned.ts), [LoansController](../app/Controllers/Http/LoansController.ts), [Loan](../app/Models/Loan.ts), [UsersController](../app/Controllers/Http/UsersController.ts).

## Writer inventory and classifications

Each balance-writing branch has one classification. Account type means current source reachability, not a new accounting approval.

| Writer / trigger | Classification | Account type / input | Old balance / calculation / persistence | Existing lock and overlap |
|---|---|---|---|---|
| Manual POST Account Transactions | DELTA WRITE | Any tracking except Balances; Loan uses principle | Reads hydrated Account inside trx, adds signed amount or Loan principle, Account.save | No Budget/Account lock; overlaps CREATE/DELETE/PATCH/OFX/Plaid |
| Transaction PATCH amount/name/principle/statementId branch | DELTA WRITE | Linked active row, tracking!=Balances; Loan special branch | Account read after Budget gate; subtract old, merge link, add new, save Account; date-only/comment-only do not take Account balance branch | Budget FOR UPDATE; protects only against cooperating writers |
| Transaction DELETE | DELTA WRITE | Optional Account link; rejects Balances; Loan principle | Reads Account inside trx; nonpending subtraction and Account.save; soft deletes Transaction | No gate; overlaps other posting writers |
| OFX supplied ledger branch, HTTP/command | ERRONEOUS / SUSPECT | Rejects Balances, no explicit Loan rejection | Absolute this.balance=ledger; Account.save | HTTP gate only; approved product says this must stop |
| OFX null-ledger fallback, HTTP/command | DELTA WRITE | Same current scope | this.balance += raw accumulated sum; Account.save | HTTP gate only; date/pending correctness separately defective |
| Approved future OFX correction | DELTA WRITE | Scope per approved OFX design | Fresh balance + sum(new eligible signed effect-old eligible effect) | Must share protocol with manual/Plaid writers; not implemented |
| Plaid initialized Account, syncUpdate callers | DELTA WRITE | Skips Balances; provider-linked ordinary and Loan Accounts reachable | Fresh Account array after Budget gate; accumulate old/new effects in $extras.addedSum, add to acct.balance, save | Budget gate; unsafe against ungated manual writers |
| Plaid first financial sync, !initialized | ABSOLUTE AUTHORITY WRITE | Provider Account may already be committed/published | Assigns plaidBalance or0, marks initialized, opening then Account.save | Budget gate. Not necessarily creation of a new row: manual activity could have occurred before first sync. Preserve this existing provider policy; not a lost-update fix target |
| Statement CREATE/UPDATE/DELETE | DERIVED RECOMPUTATION | Balances tracking only for balance assignment | Latest Statement endingBalance, or final-delete0; Account.save, not balance delta | Budget gate, fresh reads; serializes Statement/Statement already. No same-mode ordinary posting overlap |
| Manual BalanceHistory CREATE/UPDATE/DELETE | ERRONEOUS / SUSPECT | Rejects Balances; no explicit Loan exclusion | Latest history balance or final0; Account.save | Ungated, contradicts evidence-only product invariant. Do not legitimize by designing a history authority lock |
| Offline Institution+Accounts / add Account | INITIALIZATION | New Account; Transactions/Balances/Loan according to current validator | Sets requested balance in insert; initial Statement/opening as route specifies | No gate, but new row is not available to ordinary committed readers until commit; no stale existing Account balance to overwrite |
| Online addOnlineAccounts / missing provider Account | INITIALIZATION | Newly inserted provider Account | Provider current balance assigned on create; firstOrCreate existing match does not merge defaults | Setup/sync Budget gate. Existing match not an absolute replacement from create defaults |

### Nonwriters and false positives

| Lifecycle | Finding / scope consequence |
|---|---|
| Account settings/startDate | AC.update gates Budget, reloads Account, changes settings/date and saves; no balance assignment. Lucid dirty-field persistence does not automatically resend unchanged balance. It reads balance for opening, so must retain gate/fresh state, but is not a delta writer |
| Initial Funding/opening | A.updateStartingBalance reads Account.balance, sums links and changes type4/Pool; never changes Account.balance. No BalanceHistory dependency |
| Funding2 / rebalance3 | Category effects only; CC.transfer already gated. Not Account writers |
| Account/Institution deletion | Hard deletes Account and linked financial/history rows, reverses surviving Categories; does not update deleted Account balance. Lifetime race boundary, not a surviving Account delta |
| User / whole-Budget destruction | Removes graph when final user leaves; no surviving Account balance to compose. No need to invent Account reversal before whole-graph deletion |
| Loan model / LoansController | Loan.balance is a different property/table. Creation sets Loan.balance; Loan.updateBalance implementation is commented out. No active Loan-model recomputation of Account.balance. Shared Account endpoints' principle branches remain protocol participants without changing Loan arithmetic |
| Provider auto-assignment | Category allocations inside provider posting; no independent Account.balance save |
| CheckBalances | Active command can diagnose/fix Category balances and locks selected/all Budgets. Entire Account recalculation/write implementation and invocation are commented out. Earlier broad wording suggesting an active Account repair command was inaccurate |
| CheckUnassigned | Repair of Transaction JSON/Unassigned representation; no Account.balance mutation |
| Reports / query results / client State | Derived balances/cache assignments are not persisted Account writers. ReportController Account.query use validates ownership, not an update |
| Unlink / metadata updates | Clears provider identifiers/Institution metadata, saves models without assigning balance. It is not itself an Account balance write; sync lifetime/recovery questions remain separate |

No additional active administrative Account.balance repair writer or normal scheduled Account writer independent of the listed import/sync paths was found. InstitutionSync and QueueListener delegate to syncUpdate. Webhooks enqueue sync rather than posting directly. No current dedicated atomic two-Account transfer posting writer was found; type1 enum/AccountTransfer Category and historical multi-link records are not evidence of an active two-Account writer.

## Current transaction/lock timelines

All model balance math below is hydrated dollar-number arithmetic and saves an absolute computed value. None uses SQL balance increment/decrement.

| Operation | Before transaction / pre-gate | Financial read and write | Commit |
|---|---|---|---|
| CREATE | Budget and request validation before trx; Account not prehydrated | trx → Unassigned read → Account read → link/Transaction → Account save → Categories | Explicit commit/rollback; no gate |
| PATCH | Request validated before trx | trx → user bound → Budget gate → target/version/Account/Categories → Categories reverse/apply → link/Account reverse/apply/save → log/version | Explicit commit/rollback; optimistic Transaction.version is not Account concurrency |
| DELETE | Budget before trx | trx → target/link/Account → Categories → Account subtraction/save → deleted flag | Explicit commit/rollback; no gate |
| OFX HTTP | Tenant/tracking precheck Account before trx | trx → Budget gate → scoped Account reloaded → parse/post/Categories → Account → opening/Pool | Explicit commit/rollback |
| OFX command | File/username, then trx held across selection prompts | User/Budget/choices default connection; final Account findBy(name) bound to trx, no gate; processOfx | Commit or logged rollback |
| Plaid single / worker / command | Institution loaded before its internal gate in caller trx | syncUpdate → Budget gate → Account array → network pagination, link/Category changes → Account balances/opening → cursor save | Caller owns commit; no commit in syncUpdate |
| Plaid syncAll | One trx, Institution array before gate | Promise.all syncUpdate branches each acquire same Budget lock in same trx; no branch serialization | One commit/rollback for all |
| Statements | Request validation/precheck | trx → Budget gate → fresh Statement/Account → derived balance save only in Balances mode | One commit/rollback |
| BalanceHistory | UPDATE validation/lookup partly before trx; other methods vary | Fresh scoped history/Account inside trx, evidence write/delete then erroneous absolute Account save | Transaction-bound but ungated; product defect remains |
| Initialization | Request/selection validation varies | Insert new Accounts in trx; new row initial balance; route-specific related state | Published on commit; shared Pool races are distinct |
| StartDate | Tenant precheck and Budget loaded before trx | Bind Budget/user → gate → fresh Account → crossings/opening → metadata Account save | One commit/rollback |

Existing financial Budget gates: TC.PATCH; AC.startDate, OFX HTTP, all Statement mutations; CC.transfer; Institution online add/update and syncUpdate; AutoAssignments configuration mutations; CheckBalances. Plain SELECT does not acquire an Account write lock. UPDATE acquires row locks at save, too late to protect a preceding read/modify/write.

Other locks: plaidItemCleanup uses item/context advisory locks and cleanup-row FOR UPDATE for token recovery. They are not Account balance serialization. No financial table/advisory lock or Account FOR UPDATE is currently present. Cleanup setup can acquire its own lock before a Budget gate; preserve/audit that independent recovery ordering rather than claiming every system lock has Budget first.

## Concrete lost-update schedules

These are source-derived interleavings, not DB reproductions. Use already-initialized nonloan transaction-tracked Accounts and dates satisfying existing eligibility, so representation/eligibility defects do not explain the result.

General schedule: A and B both load100; B commits balance100+b; A later saves100+a. Result is100+a instead of100+a+b. Ordinary model UPDATE does not merge the lost delta.

| Pair | Actual effects / possible result | Assessment |
|---|---|---|
| CREATE / CREATE | +10 and -5; last stale -5 save gives95 instead of105 | Vulnerable, neither gates |
| CREATE / DELETE | Create+10; delete a preexisting eligible+5 row → -5; last stale CREATE can give110 instead of105 | Vulnerable; Category order may also wait/deadlock; choose distinct Categories to isolate Account loss |
| CREATE / current OFX | CREATE-5 reads100; valid OFX ledger110 is saved; CREATE later saves95. A serial OFX-then-CREATE result under current absolute-write behavior would105 | Stale manual save loses OFX result even under current behavior; the ledger destination is independently wrong. Missing ledger currently throws |
| CREATE / future corrected OFX | Same effects, supplied or absent ledger | Vulnerable without shared protocol; approved ledger fix does not solve it |
| DELETE / OFX | DELETE loads100 for eligible old+5, OFX+10 commits110, DELETE saves95 instead of105 | Vulnerable: current ledger110 can be overwritten; future corrected +10 delta is also lost |
| DELETE / DELETE | Two distinct Transactions +5,+10, both Account100; stale saves95 or90 instead of85 | Vulnerable |
| CREATE or DELETE / PATCH | Ungated writer loads100; gated PATCH commits delta+10; stale writer saves its100+a | Vulnerable; one gated writer does not suffice |
| PATCH / OFX HTTP | Both acquire same Budget gate before fresh Account/financial reads | No stale-Account lost update from this pair alone under current binding; current OFX ledger override is a separate semantic defect |
| OFX HTTP / OFX HTTP | Same Budget gate, fresh reload after waiting | Same conclusion; current ledger-authority defects are not evidence of this race |
| OFX command / HTTP or PATCH | Command bypasses gate | Vulnerable; command name selection adds independent scope defect |
| Plaid initialized / CREATE or DELETE | Provider delta+10 after fresh gated read; stale ungated save can lose it (or ungated delta lost by provider save) | Vulnerable; actual sign comes from accumulated signed helper deltas |
| Plaid / PATCH or OFX HTTP | Fresh Accounts after same Budget gate | No same-Account stale-value race among these cooperating operations; cursor/absolute initialization issues remain separate |
| Statements / Statements | Both gated; derived latest selected inside trx | Already serialized for balance writes; equal-date winner ambiguity is separate |

For every other supported same-Account delta pair, the same rule applies: two fresh-after-common-gate writers cannot execute this stale-read schedule; a reachable ungated read/modify/save can. This covers command/provider variants without pretending every interleaving was tested.

### Impossible or different overlaps

- Balances-mode Statement balance writes and ordinary manual/OFX/Plaid postings cannot both apply to the same Account in the same unchanged mode: posting endpoints reject/skip Balances; Statements do not write current balance for Transactions mode. Mode mutation is an eligibility/lifetime boundary handled by AC.update, not a reason to invent a normal Statement/delta mixture.
- Different newly inserted Accounts cannot lose each other's Account balance. Uncommitted fresh rows are not normal endpoint targets; a caller's own sequential work inside one trx is not a concurrent external writer.
- Distinct Accounts cannot overwrite the same Account row, though they can share Categories/Pool. Different Budgets have no legitimate shared Account balance.
- Accountless funding/rebalance, Category deletion, Loan.balance and opening changes do not secretly write Account.balance.
- Plaid !initialized absolute replacement after a manual delta is a serial product-policy result, not necessarily stale arithmetic. This policy is not changed here.
- Erroneous BalanceHistory replacement must not be reclassified as a legitimate absolute authority. Serialization alone cannot make it preserve valid Transaction effects.

## Options evaluated

| Option | Benefits | Repository-specific costs / limitations | Verdict |
|---|---|---|---|
| A Account FOR UPDATE | Narrow per-Account contention, no schema; handles delta/absolute writers if all cooperate | Must acquire before reads; PATCH currently writes Categories before Account; batches must discover all Accounts and lock ascending IDs before any Category work. Existing Budget-first paths and ungated paths would need a consistent combined order; Category-sharing Accounts still race | Feasible alternative but larger acquisition-order redesign for complete posting operations |
| B Budget FOR UPDATE for bounded writer set | Already used by main replacement/import/provider paths; one gate covers multi-Account discovery and eligibility; no lower-resource prelocks; transaction rollback releases it | Serializes unrelated Accounts in same Budget; network-held lock duration; branches in one trx still unsafe; outsiders unprotected | Recommended incremental protocol, not universal application serialization |
| C Atomic SQL balance=balance+delta | Serializes concurrent SQL increments at row update; no stale source number for purely additive balance | Every delta writer must stop stale saves; absolute/derived writers and eligibility still require coordination. Shared Categories/opening need consistent views; model must reload after UPDATE. Changes arithmetic execution/persistence rounding boundary, which this project must assess separately | Not an OFX-only solution; retain as future alternative, not extra machinery now |
| D Account version/CAS + retry | Detects collisions, supports finer concurrency | No Account version column/contract currently; Transaction.version covers a different row. Compare-old-balance alone has ABA/membership/Category issues. Must roll back/retry whole operation including logs/provider state; external requests/cursors complicate retries/API conflicts | Larger schema/API/retry design; not smallest no-schema correction |
| Combination | Account locks plus ordered multi-Account locking/atomic deltas can work | Adds mechanisms without removing need to handle Category order/absolute writes | No demonstrated benefit over limited existing Budget-gate extension for this task |

## Account/Category lock interaction

Implicit UPDATE locks already matter even without explicit Category FOR UPDATE. A source-consistent cycle: CREATE saves Account A, holding its row lock, then wants Category C. PATCH holds Budget B, saves C, then wants Account A. CREATE waits for C; PATCH waits for A. CREATE never requests Budget, so PATCH's Budget lock alone cannot break the cycle. This is a current potential wait-for graph, not the previously reproduced abandoned-branch deadlock and not a new DB observation.

Adding an Account lock only to CREATE keeps this order mismatch. Adding Account locks to every path before Category work, plus deterministic ascending IDs for batches, can avoid this particular cycle, but requires restructuring existing PATCH/provider acquisition order. Different Accounts sharing multiple Categories can still deadlock if Categories are updated in opposite order.

With the recommended common Budget gate acquired before any protected Account/Category writes, only one participating transaction in that Budget reaches lower rows at a time. No same-Budget cross-writer cycle among participants can form from their Account/Category order. Assumptions: one owning Budget, no lower-resource locks acquired before the gate, no hidden default-connection writer, no attempt to acquire another Budget, and serial/shared-state-safe branches inside the transaction. Nonparticipating Category-only writers can still race or deadlock with participants; do not claim global deadlock freedom.

## Multi-Account topology and cross-Budget boundaries

Plaid syncUpdate processes all Accounts of one Institution; syncAll can process multiple Institutions in one Budget in a single transaction. Accounts are read after the sync Budget gate. Online/offline batch setup creates multiple Accounts, not multiple stale existing balances. FirstOrCreate defaults only initialize new rows. Cascades remove multiple Accounts but do not compose their old balances. No active dedicated two-Account transfer writer or legitimate cross-Budget financial posting was found; historical multi-link Transactions need separate shape characterization, not an invented transfer implementation.

Account-lock alternative would require collecting all existing Account IDs before any balance/Category mutation, sorting ascending and reloading under locks; dynamically discovering a new existing Account mid-sync must not acquire it out of order. Budget gating avoids that requirement for this topology. Future cross-Budget transfer support must separately define multi-gate order; it is not approved here. Existing unscoped command/cascade lookups are scope defects, not legitimate cross-Budget operations.

## Recommended protocol and rollout set

1. Begin one transaction. Establish/authorize owning Budget using only nonfinancial identity checks; do not trust preloaded balances or Account mode/startDate.
2. Acquire that Budget row FOR UPDATE through owning transaction before protected financial work. Do not first lock Accounts/Categories/Transactions in an inconsistent hierarchy.
3. Reload affected Account(s), target/link/status/version/allocations, and eligibility state after waiting. Reject missing/foreign/deleted targets under their existing semantics. Scope the command's actual selected Account, not only its displayed choices.
4. Calculate and persist using current accounting semantics and money representation. Keep intentional absolute/derived operations ordered; do not convert them to deltas. Keep callbacks/helpers on owning transaction; no independent commits.
5. Make shared-state branches sequential or use one grouped application when necessary; a gate owned by one trx is reentrant, not a JavaScript branch mutex.
6. Commit once or roll back entire operation. A waiting writer must reread the resulting committed state; no cached-model arithmetic after gate acquisition.

### REQUIRED NOW for the supported existing-Account posting protocol

- Manual Transaction CREATE and Transaction DELETE: add participation before financial reads, keeping existing financial semantics for the separate eligibility task.
- Manual PATCH: retain existing gate and fresh reads; verify binding/order; no new locking mechanism.
- OFX HTTP: retain gate/fresh Account. Operational OFX command: join same gate, fix scoped selection/transaction binding, reload after selection and gate. OFX authority implementation remains separate and blocked until this prerequisite is approved and verified.
- Plaid syncUpdate via single sync, syncAll, post-setup sync, InstitutionSync and QueueListener: retain existing gate/fresh Accounts. Refresh preloaded authoritative Institution/cursor state after waiting rather than treating the old instance as fresh. Audit branch behavior described below; do not change posting precision or provider policy.
- AC.update mode/startDate boundary: retain existing gate/fresh Account to prevent eligibility changes during posting. Statement mutations retain gates/derived authority; no extra Statement lock scheme is required.

These balance/eligibility protocol participants must roll out together; an OFX-only or CREATE-only extension does not close the set. Existing-gated paths need verification and targeted freshness/binding corrections, not arbitrary rewrites.

### CAN REMAIN UNCHANGED for the Account-balance lost-update correction

- Initialization-only balance assignments; funding/rebalance and Category-only operations; opening balance formula; Statement accounting semantics; Loan.balance model implementation; report reads and diagnostic commands.
- Cascades do not need an Account-balance recalculation. Parent-delete versus posting lifetime coordination is a separate issue; do not label their Category reversal or external item removal “fixed” by this protocol. If OFX release claims parent-delete serialization too, join those deletion boundaries to the gate before graph discovery, without redesigning reversal semantics. This is a separately stated release guarantee, not necessary to demonstrate two surviving-Account delta composition.
- No demand to gate every Category configuration update, every report or every operational command merely for Account.balance.

### DEFERRED / ERRONEOUS boundaries and release caveats

- Manual BalanceHistory's current Account replacement remains a known product defect while correction/deprecation is paused. It is excluded from legitimate accounting authority, not silently grandfathered. Locking it would still allow its erroneous absolute overwrite in a serial order. Global “no current endpoint can overwrite accounting balance” cannot be claimed while these paths remain callable; choose retirement/correction separately before claiming that guarantee.
- First Plaid sync can intentionally replace a previously committed Account's balance under current initialization policy. Preserve it; test serial absolute-write outcomes rather than requiring sum-of-deltas across that policy.
- Pure Category/Pool outsiders, ungated offline initialization's shared Pool writes and cascades are a separate Category concurrency scope. The selected Account protocol does not certify their effects. Any OFX activation claiming complete Category/Pool concurrency must explicitly include those relevant shared writers or carry that separate blocker; do not inflate Account.balance inventory to hide this dependency.
- Legacy/multi-link transfers and historical reversal authority remain separate unresolved accounting work.

## Transaction binding and long-held locks

HTTP/gated PATCH/startDate/Statements generally bind the user/relations to the owning trx. Institution sync requires this.$trx and reads related Accounts after the Budget gate. Verify relations inherit that client at runtime. Budget.getUnassignedCategory/getFundingPoolCategory call Category.query(options); a transaction-bound Budget alone does not supply options automatically. Existing protected callers pass client explicitly; command's User/Budget/selections do not, and its Budget helper binding must be repaired. Existing InstitutionController.addOfflineAccount reads Unassigned without client near response preparation; initialization response freshness is separate, not an Account delta.

OFX reads raw text/parser after the HTTP gate; syntactic parsing/validation could move before the gate, but persisted identity/old effect reads must stay after it. No performance refactor is required to establish correctness. Command interactive prompts should complete before opening a lock-held financial phase; reauthorize/reload the chosen ID inside that phase.

Plaid sync currently holds the Budget gate over network calls and pagination. Preserve correctness first; do not move fetched changes outside the gate without a cursor/revalidation design. Token exchange is partly outside financial gate, whereas online Institution lookup/addOnlineAccounts network calls can occur inside it. Same-Budget users can wait for a provider round trip; different Budgets remain independent. Proposal/read calculations not writing Account balance need no new gate.

Promise.all cases: syncAll branches share one transaction and Budget; repeat acquisition of its own row lock does not serialize branches. Institution.updateAccountBalances handles distinct Account instances in parallel, so no same Account balance is inherently shared there, but separate opening helpers can load/save the same Pool and lose effects. Offline batch initialization shares one Pool object and saves it later; do not assume it has the identical separate-hydration race. Helpers' actual await/read/save order must be tested. Required provider financial safety should process shared Pool mutations once/sequentially; no broad async cleanup is proposed. Account-only guarantees and complete posting guarantees must be reported separately.

## Future PostgreSQL verification (design only)

Fresh authorization and configured/live target safeguards are prerequisites. Current test bootstrap truncation is not proof of safety. No tests below were executed.

Use explicit barriers/signals: A acquires gate, signals; B signals attempt, assert B has not reached authoritative read; release A; B reloads and commits. For current-risk reproduction, pause A immediately after its ungated Account read, allow B to commit, then resume A. Use instrumented helper/query boundaries, not sleep-based assumptions. Use distinct allocations to isolate Account loss, then shared allocations for full posting checks.

| Case | Final assertions |
|---|---|
| CREATE/CREATE | Signed +10,-5 from100 yields105; both Transaction/link rows, Category effects and logs reflect both |
| CREATE/DELETE | Correct serial result105 for create+10/delete old+5; target soft-delete/link state and both Category effects; no lost delta |
| CREATE/OFX; DELETE/OFX | Both orderings, supplied/absent ledger under future corrected OFX; final accounting sum, independent plaidBalance; no history writes once OFX correction exists |
| PATCH/OFX | Version semantics, amount/date eligible cases, final old/new deltas once, preserved allocations/logs |
| OFX/OFX | Different batches compose; identical identities replay once; same Account and different Accounts sharing Pool; each provider observation follows chosen serial policy |
| Plaid/manual | Initialized delta and first-sync absolute cases separately; add/modify/remove/pending transitions preserve serial result and current policy |
| Statements | Balances Statement/Statement serialized; Transactions Statement membership has zero Account delta; no fabricated Balances manual-post overlap |
| Rollback/retry | A rolls back after financial writes; B sees old committed balance and state; no partial links/Categories/logs; gate released; retries do not double-post |
| Different Accounts / same Budget | Under recommendation, B waits even if Account differs; document chosen contention; shared Categories correct among participants |
| Different Budgets | B reaches protected reads/commit while A holds its Budget; no global gate |
| Multi-Account/provider branches | Same Budget syncAll and first-sync openings; correct Account states and shared Pool, no branch lost updates; fresh cursor after wait |
| Lifetime/mode | startDate/mode waits and rereads; optional parent-delete boundary has deterministic reject/success and no orphan effects if included in release scope |
| Security/binding | Foreign Budget/Account/Transaction rejected without mutation; every protected query uses owning trx; no scope-changing command name collision |

Snapshot Account.balance, relevant Transaction deleted/date/version/JSON, AccountTransaction amount/pending/linkage, Categories/Pool/opening, logs and provider cursor/observation as applicable. Checking only status/no deadlock is insufficient. Arithmetic expectations use the current representation contract; no new exact-money policy is introduced.

## Verification and implementation boundary

Documentation and optional isolated source characterization only. No architecture is implemented and OFX remains blocked. Verification passed without app bootstrap: six focused source-characterization tests (0 failures), both TypeScript projects, ESLint, Knip and circular regression. Circular analysis found only the accepted 11-model/26-edge SCC (390 analyzed files). Standard/staged diff checks and separate whitespace checks for new documents/tests passed. These are source checks, not proof of PostgreSQL scheduling or an implemented concurrency correction. No builds are needed for documentation/test-only changes.

The source's null-ledger fallback is not assumed reachable from a normal OFX XML numeric field: the earlier isolated test injected parsed null. Current valid-ledger overwrites suffice to establish the stale-save risk, and future Transaction-delta OFX needs the same shared protocol.

## Implementation status

The approved extension adds the existing Budget gate to manual CREATE/DELETE/OFX command. Existing PATCH/HTTP OFX/startDate gates remain. Plaid refreshes its Institution after waiting and serializes shared-transaction Institution/Account financial branches. No lower-row prelocks, new coordinator, balance versioning, atomic SQL money migration or accounting change was introduced. See the implementation record for executable PostgreSQL matrix, source/behavior tests and safety prerequisites.

Product scope explicitly excludes manual BalanceHistory, initialization, new Statement work and unresolved Loan correctness. These exclusions are not promises that erroneous history writes or independent Category/lifetime writers are now correct. OFX semantic correction is not resumed until separately authorized after concurrency verification.

## Product decisions required before Account-balance concurrency correction

None. The bounded scope and explicit exclusions were approved. PostgreSQL verification passed; this verification authorization has expired.

## PostgreSQL acceptance

Bounded correction accepted after 214 focused tests and 1,256 full-suite tests passed (0 failures, 0 skipped/pending). See [verification evidence](account-balance-writer-concurrency-postgresql-verification.md) for current test-only configured/live pg/pgLog safeguards, returned cleanup protection, actual lock waits, binding instrumentation and shared-Pool financial results. No further production correction was needed. Original fixture subtype omission was corrected in tests. OFX semantic correction did not resume; it can be taken up as a separate task after this accepted prerequisite. No historical/eligibility/BalanceHistory/representation change occurred. Database authorization was limited to localhost:5432/spendcraft_test and expires with this task; it cannot be reused for OFX semantic verification.
