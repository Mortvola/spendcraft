# Account/Category eligibility PostgreSQL verification

Status: ACCEPTED — ready for the next correctness task.

Verification baseline: `9c6635b526f37631040462c9fee750e17bc96eec`. Accepted Budget serialization, OFX accounting/provider-balance separation and BalanceHistory runtime deprecation were present. The eligibility implementation was uncommitted working-tree code and was preserved, along with unrelated untracked local files. No index change, reset, deployment or commit was performed.

## Authorized target and safety

This task's authorization covers only `localhost:5432/spendcraft_test`. No database configuration was redirected. Configured pg and pgLog independently specified host localhost, port 5432, database spendcraft_test. Before destructive bootstrap, both independent live connections reported database spendcraft_test, server port 5432, server `::1/128`, peer `::1/128`. These are positively recognized loopback addresses. No credentials were recorded.

Read current `tests/bootstrap.ts`, `tests/helpers/databaseSafety.ts`, `config/database.ts`, test environment selection and prepared/retained fixture/cleanup paths before connecting. All **27 inert safeguard tests passed first**. No safety-infrastructure change was necessary.

The accepted test-only Knex driver guard independently rechecks configured/live pg and pgLog and the actual execution connection immediately before every destructive SQL statement, including ORM fixture mutations, temporary constraints/extensions and cleanup. Setup verifies immediately before invoking Lucid setup. Returned teardown independently verifies before cleanup, and interception remains installed through every cleanup statement. All temporary-object/direct cleanup inspected uses these guarded Lucid/Knex connections; no separate pg/psql bypass was introduced. An earlier setup check is never reused as cleanup authorization.

The first sandbox attempt could not connect/listen (EPERM) and stopped before destructive setup. The same authorized command then ran with the required local-network permission and the unchanged safeguards. HTTP used port 3349; the PostgreSQL target remained 5432. Existing occupied Vite HMR port 24678 produces a nonfatal warning.

## Account and Category results

| Area | Persisted result |
| --- | --- |
| Manual CREATE | Before/equal/after × negative/zero/positive: nominal Transaction/link/splits persist; before has zero Account/Category delta; equality/after applies the signed amount/allocation. Pool/opening noninterference asserted. |
| Pending | Manual API has no pending input capability. Seeded pending records undergoing date-only PATCH cross Category effects normally while Account delta stays zero. Provider pending additions/transitions are separately exercised. |
| PATCH date-only | Nonpending before→equal/after adds the effect; reverse crossing removes it. Pending crossings change only Category effects. Identity, nominal amount and version/log lifecycle persist. |
| PATCH amount/categories | Eligible Account replacement uses new minus old amount. Categories follow nominal allocation replacement independently. Ineligible partial edits have zero financial delta. Type-0 amount-only PATCH retains existing explicit splits; type-5 incompatible amount-only validation still rejects. |
| Mixed PATCH | Date+amount+allocations in either crossing direction applies final old/new effects once, including changed sign and duplicate Category IDs without nominal reordering. |
| Metadata / Statements | Name/comment/Statement-only changes preserve Account/Category balances; existing Statement membership/response regression remains unchanged. |
| Deleted | Existing deleted-target PATCH/DELETE rejects without financial mutation; startDate and opening exclude seeded deleted rows. OFX restoration separately applies new eligible effects once. |
| Historical nonrepair | Deliberately inconsistent old Category 999/pre-start allocation10 remains unreconstructed. An unrelated eligible+5 operation produces Category 1004 and Account 105, preserving the old row. |

## startDate, opening and Pool

Later and earlier changes use the half-open crossing interval with the new boundary inclusive. Pending ordinary rows cross; deleted/opening/accountless/special shapes do not enter ordinary nonloan crossing discovery. Account.balance remains unchanged, including raw persisted balance equality assertions.

A→B→A and unchanged-date requests preserve current Account balance, restore ordinary Category effects for the consistent forward fixtures, and do not duplicate opening/Pool effects. Opening's date follows Account.startDate. Simple signed+10 and mixed+30−20 persisted sums against Account 100 both yield opening 90 and Pool 90, including repeated same-date maintenance proving self-exclusion.

The dedicated pending/deleted/accountless fixture has Account 100, posted 20 and pending 10. At the early boundary, both ordinary allocations contribute to Categories, but only 20 enters the opening sum: opening/Pool 80. At the later boundary neither ordinary allocation applies: opening/Pool 100. Returning restores80. Deleted 30 never contributes; independent accountless funding/rebalance effects remain 3 throughout. Opening is handled separately and never crosses as an ordinary Category allocation.

## Final supported-writer audit

| Writer | Account rule | Category rule / boundary | Result |
| --- | --- | --- | --- |
| Manual CREATE | active/nonpending/on-or-after startDate | active/on-or-after, pending independent | Corrected and verified for ordinary nonloan lifecycle |
| Ordinary types0/5 PATCH | new eligible signed effect minus old | new eligible allocation minus old | Corrected and verified, including date-only and ineligible partial edits |
| OFX HTTP/command | independent old/new effects | active/date eligible; pending independent | Accepted behavior retained; ledger→plaidBalance, replay/restore identity and no history preserved |
| Plaid posting/modification/removal | independent date/pending effects; deleted local identities not resurrected | date eligible regardless of pending; explicit allocations/Unassigned preserved | Existing behavior verified; no provider source change |
| startDate | Account current balance invariant | active ordinary crossings include pending; exclude deleted/opening/accountless | Corrected and verified; Loan special behavior retained |
| Opening | no Account current-balance addition/recompute | separate Pool replacement; active/nonpending/date applicable linked sum excludes itself | Existing formula/date verified |
| Initialization | separate route/provider initialization authority | existing opening/Statement and new/existing Institution distinction | Unchanged regressions verified |
| Statements | separate balance-tracked ending-balance authority | membership does not post ordinary effects | Unchanged regressions verified |
| Accountless types2/3 | no Account contribution | independent accountless Category lifecycle; no startDate gate | Unchanged regression and explicit isolation verified |
| Transaction DELETE / parent cascade | existing current behavior retained | historical applied-effect ambiguity remains unresolved | Deferred, not certified as historically safe; no guard or authority inference added |
| BalanceHistory | no supported runtime authority | deprecated; only approved parent cleanup/model remains | Source and functional deprecation regression verified |

This matrix certifies supported ordinary forward paths, not unknown multi-link/transfer/Loan ownership or historical reversal authority. Category membership indexes, nominal JSON, current balances and timestamps are not proof of old applied effects.

## Concurrency, binding, rollback and security

Actual PostgreSQL wait-state barriers (`pg_blocking_pids`/`pg_stat_activity`) establish Budget contention; arbitrary sleep is not the synchronization mechanism. startDate commits before a waiting CREATE/PATCH/OFX, and each waiter uses the freshly committed boundary rather than pre-gate state. Assertions include Account, Category, opening/Pool, nominal Transaction/link state and versions/logs. Reverse ordering and different-Budget independence retain accepted regression results.

A new late startDate-save failure rolls back persisted Account/startDate and opening/Pool changes while CREATE waits on the Budget. The waiter then uses the old committed boundary, yielding Account 105, Category 5, opening/Pool 100 at the original date, exactly one manual Transaction and no failed-operation log. Existing late PATCH/startDate/provider failures and provider retry/rollback cases also preserve atomicity.

Protected model-save instrumentation asserts Account, Transaction, AccountTransaction, Category and applicable logs use the same owning transaction. Source/unit gate barriers and scoped-query audits cover authoritative reads; waiting-writer tests prove fresh startDate controls financial calculations. No lower-resource lock hierarchy or cross-Budget operation was introduced.

Tenant, foreign Account/Transaction/Category/Statement/Institution and nonexistent-resource regressions preserve authorization and financial noninterference. Source scanning retains only four allowed BalanceHistory cleanup/model files. No standalone runtime history reader/writer or replacement authority reappeared.

## Verification runs and changes

Initial core: **44 passed, 0 failed, 0 skipped/pending**; 2,465 independent safety checks / 2,462 guarded SQL operations, including returned teardown.

Initial expanded focused run: **981 passed, 0 failed, 0 skipped/pending**; 53,199 independent checks / 53,196 guarded SQL operations. It covered the original 18 prepared cases plus explicit partial PATCH, mixed replacement, historical nonrepair and simple/mixed opening checks.

Test-only strengthening then adds pending Plaid additions at all date positions, both pending-only transition directions before/equal/after, and deterministic late startDate rollback with a waiting CREATE. No production or safety-infrastructure correction was required.

Final focused acceptance: **994 passed, 0 failed, 0 skipped/pending**. It recorded **53,905 independent checks / 53,902 guarded SQL operations**, including returned teardown. All required focused criteria passed before the complete suite was started. No unexplained 500, 40P01 deadlock or lock timeout occurred; injected failures deliberately exercise existing 500/rollback behavior.

Complete suite: **1,382 passed, 0 failed, 0 skipped/pending**. Its fresh setup again independently verified both configured/live connections, and every subsequent destructive statement/cleanup was safeguarded. The run recorded **56,525 independent checks / 56,522 guarded SQL operations**, including returned teardown. Existing migrations were already up to date; no application schema migration was created or applied. The accepted 1,306 baseline increases by 34 pure and 42 functional cases.

## Final static/build verification

Both server and client TypeScript checks, ESLint, Knip and circular regression passed after the final test changes. Circular analysis retains the accepted 11-model / 26-edge component and no new component. Server and separate client builds passed. Working-tree and staged `git diff --check` passed; no files were staged by this task.

Warnings: existing client bundle 1,030.62 kB before gzip exceeds the 500 kB advisory threshold; occupied test Vite HMR port 24678 remains nonfatal. The initial sandbox EPERM prevented connection/setup and was resolved with authorized local execution, not a database/safety/configuration change. No unexpected financial failure, deadlock or lock timeout remained. Synthetic failures intentionally emit asserted 500 logs.

No database activity followed the completed full-suite cleanup. This task's authorization is expired.

## Changes and historical boundary

Verification strengthened four functional test files: transactions/eligibility.spec.ts, accounts/startDate.spec.ts, concurrency/accountBalanceWriters.spec.ts and institutions/plaidSync.spec.ts. The production implementation and test-safety infrastructure were unchanged during this verification. Updated accounting-invariants.md, post-f8af214-correctness-review.md and account-category-eligibility-correction.md, plus this new verification record. Existing uncommitted production/helper/unit work was retained.

All database destruction was confined to the authorized test target, including test fixture resets and temporary-object cleanup. No historical production balance/history repair or reconstruction occurred. BalanceHistory stays deprecated, and no exact-money/MinorUnits, new DELETE guard, schema migration, deployment or commit was introduced. This verification is complete: task-specific authorization is expired and must not be reused.
