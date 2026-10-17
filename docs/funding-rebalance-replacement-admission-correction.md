# Funding/rebalance replacement admission correction

## Status and baseline

Implemented against HEAD `e9e3f006fe7832cd048992fd65a8f4fb5884fd97`. Tracked tree/index were clean before work; unrelated untracked local files were preserved. The commit contains the accepted Account-writer gate, OFX authority, BalanceHistory deprecation, ordinary eligibility, funding preview and immutable funding-date corrections. Its delta from d4c374d is verification/review/test documentation, not unexpected runtime changes.

**PostgreSQL-accepted:** see the [dedicated verification record](funding-rebalance-replacement-admission-postgresql-verification.md). The implementation-stage results below are historical; subsequent task-specific verification uses independent configured/live pg/pgLog/execution safeguards before every destructive operation.

## Reconfirmed defect before correction

`PATCH /api/v1/category-transfer/:tfrId` calls CategoriesController.transfer for both modern funding and rebalance. Before correction it resolved a Budget Transaction by ID, checked the existing type2 date, authorized referenced Categories, then blindly reversed old nominal rows and applied new rows. No deleted/type/link/Loan admission existed. It did not convert type or restore deleted state.

The original actual-method inert reproduction passed before editing. Expanded characterization then reproduced10 invalid shapes (12 tests including the two unrelated remaining-review findings): deleted type2/type3; ordinary0/5; opening4; unknown99; both cross-type requests; fabricated one/multiple Account linkage dimensions ignored by this code. Source has no link query or Account ownership check, so supplied ID resolution reaches the same replacement for any link count; this is not a claim that a DB fixture was run. A legacy Loan ownership pointer also was never read; the new prepared fixture makes that relationship explicit.

Concrete result: deleted type2 with A+10/Pool−10 nominal rows and zero applied balances accepted replacement A+20/Pool−20. A became+10 and Pool−10 while deleted remained true. Current-state accountless replacement is not a restore operation. Canonical amounts, zero-sum new rows and Budget ownership alone cannot justify this target.

Historical characterization is preserved here; its executable deleted-target test now asserts early rejection rather than approving the old financial change.

## Independent lifecycle contracts

### Type2 funding

A request declaring type2 may replace only a fresh same-Budget, active (`deleted=false`), stored type2 Transaction, with **zero AccountTransaction links**, no legacy Loan ownership, and a nonempty readable nominal allocation array. After admission, its persisted calendar date is immutable. Direct date changes retain the existing422 error/message. Creation still chooses its date; deletion is unchanged.

Stored funding baseAmount, source configuration, funder/transfer flags and comments are optional under current server validation and editor fallbacks. Their absence does not disqualify an otherwise supported target. In particular, no new frozen proposal/configuration schema is imposed. The new replacement request is still validated with the existing percentage and split rules.

### Type3 rebalance

A request declaring type3 may replace only a fresh same-Budget, active, stored type3 Transaction, with zero AccountTransaction links, no legacy Loan ownership and a nonempty readable nominal allocation array. Its date remains editable. Rebalance has no required funding base/source/funder metadata; plain Category allocations remain valid.

There is no supported cross-type conversion contract: type2→type3 or type3→type2 rejects422 rather than mutating an unrelated record or silently preserving a mismatched type. Request type0/1/4/5/unknown likewise cannot replace either lifecycle.

### Shared structural/ownership facts, not shared date semantics

`hasReplacementAllocations` is a small local shape predicate: array, at least one row, nonnull object rows, integer numeric Category ID and finite numeric amount. It does not require cents, canonical decimal spellings, strict monetary scale, safe-money range, distinct Category IDs or any rounding/representation policy. Zero/signed amounts, duplicate IDs/order and binary artifacts are retained. No old-record conservation/reconstruction or economic-repair validator was added; this checks only the fields needed to read nominal reversal rows. Category existence/ownership still follows the existing scoped authorization before financial mutation.

Any AccountTransaction row disqualifies the target, regardless of pending, Account tracking/type, or whether there are one or several links. The direct AccountTransaction query deliberately does not trust the hasOne relation as a cardinality guarantee.

A Loan-related target is identified through actual ownership: an Account link (including a Loan Account), or loan_transactions.transaction_category_id→transaction_categories.id with that legacy row's transaction_id equal to the target. The legacy Loan relation is commented out in the model, so the guard uses a read-only transaction-bound join. It does not mutate/repair legacy rows. A Category of type Loan is **not** by itself Loan transaction ownership; valid funding/rebalance allocations to such a Category remain allowed. No Loan accounting semantics change.

Transaction's actual soft-deletion field is `deleted`; no archived state was found. Ordinary duplicate pointers are not invented as another deletion state; ordinary0/5 targets are excluded by lifecycle type. This is not a general Transaction representation classifier.

## Exact endpoint ordering and errors

Before: authenticate → current Vine request validation → begin transaction → bind user → Budget FOR UPDATE → scoped target lookup → type2 date check → Category authorization → new zero-sum validation → old-row reversal/target JSON+date save → new-row application → sequential Category saves → serialize → commit.

Now:

1. Authenticate; preserve current request validation (including required categories/type/date) before transaction/resource lookup. Malformed request validation can still precede404; no transport architecture redesign.
2. Begin owning transaction, bind user, acquire the existing owning Budget FOR UPDATE.
3. Fresh target lookup through the transaction-bound Budget relationship, ID plus `deleted=false`. Foreign, missing and deleted targets use existing firstOrFail404 semantics. ID binding/parsing is unchanged; no raw ID interpolation/new coercion is added.
4. Independently require request/stored type2 match or request/stored type3 match; validate required old allocation structure. Unsupported/malformed targets throw existing Exception422.
5. Query AccountTransaction by target ID with `{client:trx}`; query actual legacy Loan ownership using `.useTransaction(trx)`. Any Account or Loan link throws422. No detach/conversion is attempted.
6. Only after admission, retain the unchanged stored-type2 immutable-date check. Type3 has no immutable-date predicate.
7. Existing scoped authorization for old/new Category IDs and embedded funding references; existing new-row zero-sum validation.
8. Existing grouped old-negative/new-positive deltas, target date/JSON replacement and sequential Category saves; serialize and commit. Catch rolls back and rethrows as before.

No financial write or reversal/application occurs in steps1–7. Target version, type, links, deleted state and logs are not changed by admission. Valid replacement's existing version/log behavior is unchanged; no new versions/events are introduced. CREATE bypasses target admission because there is no target; its validator/type behavior is deliberately unchanged. Legacy CategoryTransfer DELETE and generic Transaction DELETE are untouched.

| Situation (otherwise valid request) | Result / precedence |
| --- | --- |
| Foreign/missing/deleted target |404 before shape/date checks; no foreign existence/monetary evidence exposed |
| Wrong type/cross-type/unreadable required rows |422 before link reads/date check/reversal |
| Any Account link or legacy Loan ownership |422 before date validation/financial work |
| Valid funding target, different date | Existing422 “The date of a funding transaction cannot be changed.” |
| Cross-type request plus changed funding date |422 unsupported-target error first; cannot bypass date rule or claim conversion |
| Valid rebalance, different date | Existing success behavior and financial deltas preserved |
| Invalid Category ownership or new splits after target admission | Existing scoped404/validation422, before mutation |

Existing Exception/content-negotiation conventions remain. No new error enum/DTO or raw monetary diagnostics are returned.

## Client, arithmetic and isolation

FundingDialog and RebalanceDialog call State.Transaction.updateCategoryTransfer, which sends this.type and only updates transaction/register/Category caches inside a successful validated response. Funding dialog disables date editing and explicitly submits the original date; rebalance keeps its date input. Rejections propagate through existing editor error handling, leave the editor open and do not apply success-shaped rejected response data. No UI/error architecture change was needed.

The dormant legacy type1 CategoryTransferDialog uses the same route without the now-required request type and already fails the current validator. This task does not reactivate/fix that compatibility feature or redesign CategoryTransfer.

Valid type2 retains the shared calculateFunding preview/submit algorithm, old Pool reversal and original-month projection. Type3 retains its existing zero-sum replacement arithmetic/date edits. Fixed/percentage/goal/transfers/residual/baseAmount/ordering/rounding are unchanged. Category JSON and API money remain numbers; artifact0.30000000000000004 is explicitly not blocked by structural admission. Accountless effects acquire no Account.startDate context.

## Concurrency and historical limitations

All new authoritative reads occur after the existing Budget gate and use its owning transaction. After a wait, the target and its links are queried rather than trusting pre-gate models. No lower-resource prelocks, new coordinator, Account versioning or Category/Pool concurrency redesign is introduced. Helpers execute sequential reads; no external network work is added.

A waiting replacement must observe a committed deletion/type/link change and reject before reversal. Valid same-Budget replacements continue composing in serial order; rollback restores old raw target/date/metadata and balances. Different Budgets remain independent. Arbitrary direct external SQL is not promised serialization; controlled shape changes are test fixtures, not new supported conversion APIs.

No attempt is made to infer whether old invalid targets applied balances correctly. This prevents new unsupported replacements, not old damage. No historical replay, repair, persisted provenance, DELETE guard or cascade policy is introduced. CategoryTransfer DELETE, remaining shared Category/Pool races, reports, Loan settings persistence, historical reversals, funding priority, Statement ties and offline route differences remain separate.

## Implementation-stage tests and prepared PostgreSQL matrix

Pure/source/inert tests execute the actual controller/helper, production zero-sum validator and real client State code without ORM/app/database bootstrap. They cover valid types2/3; deleted, both cross-types, ordinary/provider/opening/type1/unknown, one/multiple/Loan Account links and legacy Loan ownership; unreadable arrays/rows/amounts; missing/foreign target; zero/duplicates/missing optional metadata and binary artifact allowance; immutable type2 and editable type3 dates; changed target state after gate; owning-transaction query assertions.

The actual reversal and application loops are instrumented in the compiled test body. Every blocked scenario asserts zero loop invocation, target merge/save, Category/Pool save, authorization or commit, with unchanged nominal target/balances and rollback. Valid paths assert ownership reads precede reversal. These are current-source tests, not a claimed PostgreSQL execution.

Prepared `tests/functional/funding/replacementAdmission.spec.ts` uses the repository harness; no new direct connection, destructive cleanup helper or schema change. Existing per-statement safeguards must protect all future fixture mutations/cleanup.

| Future DB group | Assertions |
| --- | --- |
|18 unsupported shapes | Deleted2/3; cross-type both; ordinary0/5, opening4, type1, unknown stored/request type; one/multiple/Loan Account links; actual legacy Loan ownership; null/object/empty/string-amount required state. Raw Transaction JSON/date/deleted/version, Categories/Pool, Accounts/links and logs/Loan tables unchanged; Category.save never invoked |
| Foreign/missing |404 before unsupported request-type/date checks, full raw snapshots unchanged |
| Valid2/3 | Same-Budget accountless targets, Loan Category allocation not misclassified; funding date retained, rebalance date editable; old effects replaced once, final Category3/Pool7 and JSON exact under current representation |
| Fresh state | Owner holds Budget then commits deleted/type/link changes; actual PostgreSQL waiter observed; waiter rejects using fresh state without extra effects |
| Public DELETE overlap | Valid accountless type2/type3 DELETE holds Budget; replacement waits, then sees committed deleted row and404. Only deletion writes balances; no replacement reversal/application |
| Concurrent replacement | Types2/3, owner commit/rollback, waiting replacement reloads current old rows; final Category4/Pool6, correct immutable/editable date, one target |
| Late failure | Both types pass admission, target/Category/Pool work begins, late Pool failure restores every raw snapshot, including an edited rebalance date |
| Different Budget | Other Budget replacement progresses while first gate held |
| Existing regressions | Funding preview and immutable date; ordinary eligibility, OFX, history deprecation, Statements, initialization, Loan, rebalance and accepted concurrency suites retained for separately authorized verification |

Existing immutable-date cross-type DB assertion is updated to expect the admission error before date validation; valid funding date-error assertion remains unchanged. Old invalid-target characterization becomes a rejection regression; the unrelated legacy DELETE and Loan settings characterizations remain intact.

## Verification and activation

Non-DB verification: **199 passed, 0 failed** across focused admission, funding preview/rounding, client cache, eligibility, Account-writer, OFX, BalanceHistory and remaining-review tests. Both server/client TypeScript checks, ESLint, Knip, circular regression (accepted11-model/26-edge SCC,405 analyzed files), server build and separate client build pass. Builds retain the existing chunk-size warning above500kB; no warning was suppressed. Working-tree and staged diff whitespace checks pass. The34 new PostgreSQL cases remain prepared only; the existing immutable-date DB assertion was updated but not run. No full DB suite was run. Fresh task-specific authorization must be requested before any DB-backed verification; existing safeguards independently verify configured/live pg/pgLog and actual execution identity immediately before every destructive operation on localhost:5432/spendcraft_test. No prior authorization is reusable.

## Subsequent verification

The original34 prepared cases pass after correcting required Account subtype in test fixtures. Verification adds an explicit optional-metadata/immutable-date case. No production correction was needed; see the dedicated record for final focused/full results and authorization expiration.

Final verification: **1,075 focused /1,511 full-suite passed,0 failed,0 skipped/pending**. All35 admission cases pass. Both TypeScript checks, lint, Knip, circular, server/client builds and diff checks pass. Only test fixture subtype and explicit optional-metadata/date coverage changed during verification; no production correction was needed. See [verification](funding-rebalance-replacement-admission-postgresql-verification.md). Task-specific database authorization is expired.
