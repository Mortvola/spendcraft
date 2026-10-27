# Category / Funding Pool concurrency implementation

## Status and baseline

**PostgreSQL-verified and accepted.** See the verification record:32 narrow,1,213 focused and1,568 full-suite passes,0 failed,0 skipped/pending. No production correction was required during verification. The implementation-stage evidence below is retained as history.

Implementation HEAD `e49bebe3bf29e8a773709a59bd9c2780014944f0`. The accepted design/review and characterization tests were staged before implementation; they and unrelated local files were preserved. No agent index mutation, reset or commit occurred. Current source matches the approved bounded design; accepted Account-writer gates, OFX authority, BalanceHistory removal, ordinary eligibility/startDate, funding preview, immutable type2 date, replacement admission and legacy DELETE removal remain present.

During implementation, no PostgreSQL connection, DB bootstrap/test, setup, reset or cleanup was executed. Prior DB authorization is expired. At that implementation stop, prepared tests below were executable/type-checked source without claimed database acceptance; the acceptance follow-up below supersedes that status. The bounded guarantee excludes ungated Account/Institution cascades and their historical reversal/lifetime issues.

## Exact production changes

| File/function | Change |
| --- | --- |
| app/Controllers/Http/InstitutionController.ts / addOffline | Existing transaction-bound owning Budget query now uses FOR UPDATE before the existing Pool read and all Institution/Account/opening writes |
| app/Controllers/Http/CategoriesController.ts / deleteCategory | Bind authenticated user to owning transaction; acquire owning Budget FOR UPDATE before scoped Group/Category reads; bind existing JSON membership query with useTransaction(trx) |

No other production file or financial method changes. AST comparison to HEAD confirms only addOffline changed in InstitutionController (15 other methods byte-identical) and only deleteCategory changed in CategoriesController (11 other methods byte-identical). In particular addOfflineAccount, deleteAccount, delete, deleteAccounts, existing transfer arithmetic and Category configuration methods are untouched. No lower-resource prelock, coordinator, advisory lock, increment/version architecture or new public error is added.

Tests changed: tests/unit/categoryPoolConcurrency.spec.js replaces gap characterizations with actual-method gate/fresh-state/binding regressions while preserving the cascade limitation; tests/unit/client/financialState.spec.js adds rejected/successful Category cache coverage. New prepared DB file: tests/functional/concurrency/categoryPoolWriters.spec.ts. Documentation changes: approved design status, both correctness reviews and this implementation record.

## New-Institution offline initialization

POST /api/v1/institution without publicToken still validates the same request before beginning its transaction. It binds user, locks the owning Budget, then freshly queries Funding Pool with client:trx. Institution and Account creation remain after that point. Account request amounts/startDate are unchanged input, not stale pre-gate financial state. Newly created Accounts have no concurrently committed prior opening to reload; opening helper's applicable signed sum and opening lookup use each Account's inherited owning transaction.

The original read100 / concurrent funding−20 / stale initialization+10→110 schedule cannot occur among participants. If funding commits first, the initialization Pool read follows the wait and reads80, saving90. If initialization owns Budget first, funding waits, reloads110, then posts−20→90. No monetary compensation or arithmetic change was introduced.

Promise.all still creates batch Accounts using the SAME freshly hydrated Pool object. Each helper mutates it synchronously after its own awaited reads and does not save Pool; one final Pool.save follows all branches. The no-DB batch test confirms10+20−5 accumulates once to125 from100. No unnecessary batch redesign or sequentialization was introduced.

Balances-tracked Accounts still create initial Statements without opening/Pool deltas. A uniform handler gate also covers mixed/all-Balances batches, but does not change those semantics. New Account.balance, opening formula/date, accountless eligibility, signs and floating arithmetic remain unchanged.

Existing-Institution POST /institution/:instId/accounts is intentionally UNGATED BY DESIGN for this issue: it creates a new Account/optional Statement, reads Pool/Unassigned for response, but posts no opening and saves no existing Pool. Its unresolved route-policy difference is preserved, not repaired for symmetry.

## Category DELETE

DELETE /api/v1/groups/:groupId/categories/:catId now follows:

1. Authenticate and read existing route parameters; begin transaction.
2. Bind user and resolve/lock its Budget.
3. Fresh scoped Group and Category lookups using client:trx, after waiting.
4. Existing active/nonzero Transaction JSON usage check on the SAME trx.
5. Existing in-use409 rollback, or existing fresh Loan lookup/delete when applicable.
6. Category deletion, commit,204; existing errors roll back/rethrow.

No Category/admission Boolean is loaded before the gate. Ownership/missing-resource errors remain404; in-use is409/HAS_CHILDREN; success204. The new owning-Budget lookup precedes Group/Category scope without revealing foreign existence. Existing validation and error architecture are preserved.

The current definition of usage remains exactly active Transaction JSON amount !=0 for this globally unique Category ID. No pending/startDate/type exclusion, zero-balance check, system-Category restriction or funding-rule dependency rule is added. Existing default membership query was the task-local connection escape; it is now bound. A posting owner commits first → deletion sees usage and rejects. Deletion commits first → current CREATE/PATCH/funding scoped authorization or provider Category lookup sees the missing row and rolls back. No accepted writer required a production compatibility change.

Ordinary startDate crossing does not erase nominal membership: active nonzero JSON still blocks deletion even if its current balance effect becomes zero. Same-Category deletes serialize to204 then404; different Categories within one Budget intentionally serialize; different Budgets remain independent. Historical empty/system/configuration lifecycle limitations are not redefined by this gate.

## Post-gate transaction-binding audit

| Path / operation | Connection ownership |
| --- | --- |
| Initialization user→Budget gate | user.useTransaction(trx); owning related Budget query |
| Pool lookup / final save | Explicit client:trx; hydrated model retains trx |
| Institution creation | Budget.related institutions create inherits gated Budget transaction |
| Account creation | Institution.related accounts create inherits trx |
| Opening sum / lookup | Account.related accountTransactions query and owning Transaction relation inherit Account.$trx |
| New opening / link | Transaction.useTransaction(Account.$trx), Account-related create inherits trx |
| Statement initialization | New Account.related statements create inherits trx |
| Category DELETE Group/Category | Existing explicit client:trx scoped helpers, now after gate |
| Membership | db.query().useTransaction(trx), corrected default-connection escape |
| Loan dependency | Existing Loan.findBy(...,{client:trx}) and its model.delete |
| Category delete | Fresh transaction-bound Category.delete |

No intentional protected financial/admission connection escape remains in these two paths. Response serialization after commit is unchanged and introduces no new financial read. No new financial log/version event is created by serialization; existing opening/log/error behavior remains. Existing-Institution response-only default Unassigned query is outside the changed path and is not a shared balance writer.

## Client and arithmetic isolation

No client production code changed. Actual bundled State tests show409 preserves Category cache membership and successful deletion removes only that Category; existing response/error handling remains. Offline success/cache behavior remains under existing client tests. No optimistic mutation or concurrency-specific public error is introduced.

Both ordinary and accountless eligibility, funding calculations/priority, OFX ledger→plaidBalance, provider precision/cursor, Statements and Loan formulas are unchanged. No BalanceHistory reader/writer or CategoryTransfer DELETE returns. Monetary API/JSON/ORM/storage representations and rounding are unchanged; the deferred binary artifact remains.

## Final gate matrix and deadlock boundary

| Writer | Current classification |
| --- | --- |
| Manual CREATE | GATED — existing Budget gate/fresh financial reads |
| PATCH | GATED — existing old/new effect lifecycle |
| Current Transaction DELETE | GATED — existing nominal reversal semantics, historical limitation unchanged |
| startDate | GATED — current crossing/opening behavior |
| HTTP and command OFX | GATED — current authority/replay/opening semantics |
| Plaid | GATED — current refresh/sequential provider financial work |
| Type2 funding | GATED — current accountless arithmetic/immutable date/admission |
| Type3 rebalance | GATED — current accountless arithmetic/editable date/admission |
| New-Institution offline initialization | GATED — added here before Pool/creation |
| Category DELETE | GATED — added here before fresh scoped membership/deletion |
| Existing-Institution Account creation | UNGATED BY DESIGN — no existing Category/Pool posting; policy difference preserved |
| Account cascade | DEFERRED/BLOCKED — still ungated; historical reversal/lifetime authority unresolved |
| Institution cascade | DEFERRED/BLOCKED — still ungated; same helper plus remote removal ordering unresolved |

Both additions acquire Budget BEFORE lower financial reads/writes, not after Institution/Account creation, Category deletion or opening mutation. They introduce no Account/Category/Transaction prelocks and no new inverse Budget/financial-row order relative to existing participants. There is no external/network work in either changed path. Immutable parsing/auth/request validation can precede the gate, while authoritative Pool/usage work cannot.

Ungated cascades can still overwrite balances or participate in source-feasible Account/Category lock cycles. These changes do NOT certify those operations or universal Category correctness. No cascade gate/helper/formula changed; no nominal record is treated as evidence of historically applied effects. Whole-Budget physical cleanup and configuration/graph lifetime work remain separate from the bounded financial-posting guarantee.

Deploy the two additions and membership binding together with existing participants retained. Different-Budget operations acquire different rows; there is no global serialization. Waiting within the same Budget is an intentional contention tradeoff.

## Prepared PostgreSQL matrix — implementation-stage record (subsequently verified)

The new file contains30 cases. All use the current test harness, controlled model/query hooks and pg_blocking_pids; no arbitrary sleep is primary synchronization. Timeouts bound barrier failure, and finally blocks release hooks/waiters. Fixtures use normal guarded Lucid/Knex paths; no new direct connection, destructive cleanup helper or temporary DDL is added. Future execution must independently safeguard configured/live pg, pgLog and the actual execution target before EVERY destructive setup/mutation/cleanup.

| Group | Prepared assertions |
| --- | --- |
| Original initialization/funding, both orders (2) |100+10−20=90, Category recipient20, Account/opening/link/type2 state. Original barrier holds initialization immediately after Pool hydration and before Institution creation; competitor must wait on Budget, not just a late Pool UPDATE |
| Initialization/initialization (1) | Pool130, new Account10/20 and three total openings including existing100 |
| Initialization/startDate (1) | Both opening deltas survive; Account balance unchanged by boundary change; ordinary Category effect removed and opening date/amount follow current formula |
| Initialization/provider first sync (1) | Mocked first Plaid initialization posts its current opening delta alongside offline opening; Account/provider, Pool, Unassigned and cursor checked |
| Initialization rollback/waiter (1) | Late failure rolls back new Institution/Account/opening/Pool; funding waiter sees original state and posts once |
| Different-Budget initialization (1) | Independent progress with correct Pool/openings |
| Mixed/all-Balances batches (2) | Shared Pool25 once for10+20−5, Statement branch7 separately; all-Balances gives no Pool/opening change |
| Existing-Institution (1) | No opening/Pool post, unchanged current Account-creation semantics |
| Posting before Category DELETE (6) | CREATE, PATCH addition, type2, type3, actual OFX, mocked Plaid: waiter409, Category/JSON/balances/Pool preserved correctly |
| DELETE before posting (6) | CREATE/PATCH/type2/type3 missing-Category404; current Plaid404 / HTTP OFX500 wrapper preserved. All failed financial work rolls back; raw Institution/Account/Category/Transaction/link/Statement/log snapshots differ only by intended Category deletion |
| PATCH removes final usage (1) | Waiter204; target JSON moved to other Category, version1, no duplicate effect |
| startDate before DELETE (1) | Active nominal usage still409 after Category effect becomes zero; Account/current opening/Pool correct |
| DELETE/DELETE same/different Category (2) | One deletion per target; same-target waiter404; distinct same-Budget requests serialize |
| Deletion rollback/waiter (1) | Late deletion failure restores Category; CREATE waiter posts once from authoritative state |
| Different-Budget deletion (1) | Independent progress |
| Foreign Group/Category (2) |404 with raw financial state unchanged |

DB assertions include Category/Pool values, Account balances, opening dates/amounts/links, Transaction JSON/type/version, Statements and raw noninterference snapshots where relevant; mocks require owning transaction on controlled financial/deletion work. Existing security, cascade, initialization, eligibility, OFX, provider, funding/admission/date and deprecation DB suites are regressions for later authorization, not executed now. Passing unchanged cascade regressions would not certify historical reversal authority.

## Non-DB verification and stop

Focused **211 passed,0 failed,0 skipped/pending** across actual-method source/pure/client tests, including9 bounded protocol cases and the new Category cache case. Initial test-only typing issues in the prepared harness were corrected using distinct save/delete function references and mutable dataset inputs; no casts/suppressions or runtime redesign were needed. Both server/client TypeScript checks, ESLint, Knip, circular regression, server build, separate client build and standard/staged diff checks pass. Circular analysis retains only the accepted11-model/26-edge component (407 analyzed files). Builds retain the existing over500kB chunk warning; no warnings were suppressed. Explicit whitespace checks cover new test/document files. No DB-backed test, cascade regression or full automated DB suite was run; existing DB cases are prepared for later authorization only.

No database connection or destructive DB operation occurred. No historical inference/repair, cascade correction, exact-money/MinorUnits or representation change, schema migration, deployment or commit occurred. Fresh task-specific authorization is required for DB-backed verification only against localhost:5432/spendcraft_test, using accepted safeguards independently before every destructive operation. Prior authorization is expired.


## PostgreSQL acceptance follow-up

At the same HEAD e49bebe, authorized verification proves Pool100+10−20=90 in both orders, transaction-bound post-wait Pool80 hydration, fresh Category/JSON deletion admission, owning membership execution transaction, rollback and different-Budget independence.32 narrow and1,213 focused tests passed before the full suite;1,568 complete-suite tests passed, with no failure/skip. Both TypeScript checks, lint, Knip, circular regression, server/client builds and diff checks pass. Only tests/documentation needed correction: OFX fixtures now use real explicit-allocation restoration, not unsupported auto-assignment, and runtime binding assertions were added. Existing-Institution initialization and cascades remain excluded; historical reversal is not certified. See the dedicated record for safeguards, counts, warnings and the final gate matrix. Authorization expired after guarded teardown; no further DB work is authorized.
