# Post-reset remaining correctness review

## 1. Current accepted baseline

Review HEAD: `d4c374d17de861ad996d56ef3b0db6f10c05223f`. Tracked working tree and index were clean before review; unrelated untracked generated/editor/backup/scratch files were preserved. This task changes documentation and adds inert characterization tests only. No application bootstrap or PostgreSQL connection is permitted or used.

Read the accounting invariants, original correctness review, concurrency design/verification, OFX design/verification, BalanceHistory deprecation/verification, eligibility correction/verification and funding correction/verification. Current source was searched independently; historical document status labels are not treated as current code.

| Accepted correction | Current source confirmation | Existing verification |
| --- | --- | --- |
| Bounded Account writer serialization | AccountsController.addTransaction/update/uploadOfx, TransactionsController.update/delete and commands/OfxUpload acquire Budget before fresh financial state; Institution.syncUpdate refreshes after gate; shared provider branches sequential | Concurrency record:214 focused /1,256 full; later suites retain regressions |
| OFX accounting/provider authority | Account.processOfx independently computes eligible old/new effects, adds their sum to balance, assigns supplied ledger to plaidBalance; validates supplied ledger/identity before mutation; opening uses accounting balance | OFX record:681 focused /1,305 full |
| BalanceHistory runtime removal | Production references limited to Account relation, minimal BalanceHistory model, Institution/User parent cleanup; no CRUD/provider/history authority | Deprecation record:822 focused /1,306 full |
| Ordinary eligibility/startDate | services/transactionEligibility.ts; ordinary CREATE/PATCH use separate eligibility; startDate crosses active types0/5 including pending, preserves balance; opening separate | Eligibility record:994 focused /1,382 full |
| Funding preview/submission | calculateFunding.ts is shared by preview/submit; original recursion is test-only; Pool replacement reversal retained | Funding record:1,086 focused /1,428 full |
| Subsequent funding date invariant | FundingDialog disables date and submits persisted date; CategoriesController.transfer rejects different date on existing type2; cross-month compensation/prop plumbing removed |PostgreSQL-accepted:2 narrow /1,098 focused /1,443 full; see immutable-funding-date-postgresql-verification.md |

No material source contradiction of these accepted, **bounded** corrections was found. The1,428 full-suite record predates the subsequent immutable-date change; it is not rebranded as DB verification of that change. Subsequent task-specific immutable-date verification now passed1,098 focused/1,443 full with no failure/skip; see [dedicated acceptance](immutable-funding-date-postgresql-verification.md). Its authorization is expired.

## 2. Classification and reconciliation of original findings

Each row has exactly one primary classification. A=CONFIRMED CORRECTNESS DEFECT; B=REPRESENTATION / PRECISION ISSUE; C=UNRESOLVED PRODUCT QUESTION; D=HISTORICAL DATA / REVERSAL LIMITATION; E=DEFERRED CLEANUP / DEPRECATION; F=CONFIRMED INTENTIONAL BEHAVIOR; G=NO LONGER APPLICABLE / RESOLVED. Detail rows below separate different issues previously bundled under one ID.

Source abbreviations: AC=[AccountsController](../app/Controllers/Http/AccountsController.ts), TC=[TransactionsController](../app/Controllers/Http/TransactionsController.ts), CC=[CategoriesController](../app/Controllers/Http/CategoriesController.ts), IC=[InstitutionController](../app/Controllers/Http/InstitutionController.ts), A=[Account](../app/Models/Account.ts), I=[Institution](../app/Models/Institution.ts), RC=[ReportController](../app/Controllers/Http/ReportController.ts). Function names identify concrete evidence; test names/files identify established coverage, not newly executed DB results.

| Original item | Primary | Current evidence / disposition |
| --- | --- | --- |
| P1 Account eligibility | F | services/transactionEligibility.accountEligible; AC.addTransaction and TC.update; transactions/eligibility.spec.ts |
| P2 Category eligibility | F | categoryEligible ignores pending; TC categoryEffectDeltas; same eligibility tests |
| P3 startDate balance preservation | F | AC.update never assigns balance; accounts/startDate.spec.ts and concurrency/startDate waiters |
| P4 Opening formula/date | F | A.updateStartingBalance: current balance minus linked active/nonpending sum on/after startDate, exclude type4; updates opening date; startDate tests |
| P5 Accountless effects | F | CC.transfer has no Account/date context; funding/previewSubmission and categories/conservation tests |
| P6 History evidence feature | G | Superseded by stronger runtime deprecation, not a repaired observation lifecycle; balanceHistoryDeprecation.spec.js |
| P7 Statement authority | F | AC.addStatement/updateStatement/deleteStatement only replace balance for Balances tracking; statementCorrectness/Deletion/Reconciliation tests |
| P8 Provider/account separation | F | A.processOfx now separates outputs; I initialization semantics remain distinct; ofxBalanceAuthority/ofxReimport tests |
| P9 No lost effects | F | Representation-independent invariant; accepted architecture bounded to participants, not a guarantee for every Category outsider; see R1/R2 |
| P10 Preview equality | F | FundingDialog and FundingItem consume calculateFunding; fundingPreview/fundingRounding/functional previewSubmission |
| D1 CREATE eligibility | G | AC.addTransaction now gates Account/Category effects separately; before/equal/after signed matrix verified |
| D2 PATCH eligibility | G | TC.update ordinary old/new deltas include date-only and pending crossings; no new pending API |
| D3 Pending startDate crossing | G | AC.update includes ordinary pending rows; opening sum still excludes pending correctly |
| D4 DELETE broad reversal | D | TC.delete still subtracts nominal Categories and nonpending Account amount without startDate weighting; no historical effect evidence. The independently demonstrable forward contradiction is separated as R5 |
| D5–D7 History CREATE/UPDATE/DELETE | G | Controller paths/routes removed; legacy rows inert; old Account overwrite defect preserved as historical finding |
| D8 History client mutation | G | State Balance/Balances CRUD/cache ownership removed; deprecation and financialState tests |
| D9 Missing ledger | G | A.processOfx checks presence; absence valid, supplied malformed rejected |
| D10 OFX eligible deltas | G | Old/new Account effects and Category effects independent; date/restoration/replay cases verified |
| D11 Funding3/2 mismatch | G | Same calculation now previews2/posts2; no posting-policy change |
| D12 Binary transfer artifact | B | calculateFunding category.amount += sum/100; artifact remains explicitly tested; economic algorithm unchanged |
| D13 Replacement target scope | G (PostgreSQL-accepted) | Fresh scoped active target, matching type2/3, no Account/Loan ownership and readable allocations required before reversal; see admission correction |
| D14 OFX command scope | G | commands/OfxUpload scoped identity reload after Budget gate; command collision/foreign tests |
| D15 Ledger destination | G | Valid ledger writes plaidBalance only; independent accounting sum |
| D16 Ledger-contaminated opening | G | processOfx saves accounting balance before single opening maintenance; ledger-only isolation verified |
| S1 Former absolute-ledger claim | G | Withdrawn under explicit provider-observation product direction; not an invariant to preserve |
| S2 OFX identity/allocation | F | A.processOfx scoped FID:ACCTID:FITID matching, explicit allocation/remainder preservation, deleted restoration; ambiguity fails closed |
| S3 Plaid date/pending | F | A.addTransaction/updateTransaction/deleteAccountTransaction; I.syncUpdate; plaidSync/plaidConcurrency tests |
| S4 Provider history helper | G | Helper removed; no provider evidence writer remains |
| S5 baseAmount | F | calculateFunding snapshots pre-transfer request; CC persists metadata; fundingPreview tests distinguish gross/net/base |
| S6 Category deletion restriction | F | CC.deleteCategory rejects active nonzero JSON membership and does not reallocate; deletionLifecycle tests. Admission race separately R2 |
| Q1 Statement equal-date winner | C | AC authoritative queries order only endDate DESC; no id tie rule. Different ending balances can win; no approved winner contract |
| Q2 Offline routes | C | IC.addOffline calls opening/Pool for Transactions; addOfflineAccount leaves that call commented; both Balances routes initialize Statements |
| Q3 Fixed funding priority | C | computeSpread comparator ignores b, fixed-first comment only; CategorySpread shows ordered rows/$/% without priority contract; second fixed source wins characterized test |
| Q4 History duplicate-date contract | G | Removed validators/API make former duplicate validation question irrelevant to supported runtime; physical rows retained |
| Q5 Statement membership filters | C | AC.addStatement versus updateStatement reconcileAll filters differ; statementEligibility/Reconciliation tests; membership posts no effects |
| Q6 Loan/transfer ownership | C | TC hasOne Account link versus cascade's all links; Loan principal-specific paths; no ordinary-rule generalization |
| Q7 Money ingress/quantization | C | Existing number validation/rounding does not decide future accepted scale, rounding, currency or observation precision |
| F1 Metadata-only PATCH robustness | E | TC.update still loads/validates financial data for comment+version; accepted noninterference tests show no effect from metadata alone |
| F2 Account writer gate gaps | G | Required Account writers migrated/verified. Category outsiders are separately R1/R2, not an unaccepted redesign of Account locking |
| F3 Provider shared branches/cursor | G | I.syncUpdate refreshes Institution/cursor after gate; I.updateAccountBalances and IC.syncAll sequential; plaidConcurrency verifies shared Pool/cursor/rollback |
| F4 Cascade nominal reversal | D | IC.deleteAccounts reverses unfiltered nominal allocations; H1/H3 and R5 counterexample apply. Concurrency independent R1 |
| F5 Remote removal ordering | C | IC.delete removes remote item before local cascade; local rollback cannot restore remote item. Desired failure/recovery/deletion contract not established; no compensating action invented |
| F6 Parent cleanup coverage | E | IC.deleteAccounts explicitly removes links/Transactions/history/Accounts, not Statements/logs; Statement/log migrations have plain integer references. Cleanup review needed; no live orphan-count claim |
| F7 Legacy transfer DELETE | G (runtime removal PostgreSQL-accepted) | No supported DELETE caller found; route/handler/delete-only wrappers removed. Modern Transaction POST/PATCH retained; see deprecation record |
| F8 Loan financial model | C | Loan.updateBalance no-op/getProps zero placeholder; Account Loan principal/interest paths separate. Settings persistence contradiction separated as R4 |
| F9 Auto-assignment real | B | auto_assignment_categories.amount float migration, AutoAssignmentCategory.consume parseFloat; percentage=false money config versus true ratio; autoAssign affects posted allocation |
| F10 Reporting/repair floats | B | RC CAST AS float, parseFloat, Category/Budget sums; legacy-reader logic separated R6, administrative repair restriction below |
| F11 Test DB safety | G | Current databaseSafety.ts and bootstrap independently safeguard configured/live pg/pgLog/execution before destructive SQL/setup/cleanup; prior verified tests, not run here |
| H1 Historic Category application | D | Nominal JSON/current dates/pending/balances do not prove applied effects before fixes |
| H2 Prior history balance damage | D | Runtime removal cannot identify/reverse earlier Account overwrites from observations |
| H3 Historical cascade compatibility | D | Multi-link/opening/deleted/legacy states cannot establish reversal authority from nominal canonical money |
| X1 Abandoned exact-money machinery | G | Not current requirements; helpers/guards/DTO architecture must not be restored by historical acceptance |
| X2 Abandoned locking/deadlock | G | Old fine-grained deadlock does not describe present bounded gate; current accepted protocol stands |
| X3 Frozen proposals/DELETE machinery | G | No approved quote/version/provenance/representation guard architecture; current funding same-state fix needs none |
| X4 Inferred provenance/repair | G | Rejected design is not a next task; historical limitations remain D, not permission for reconstruction |

## 3. Remaining confirmed correctness defects

### R0 / D13: replacement lifecycle admission (G; PostgreSQL-accepted)

The findings below describe the pre-correction source. The focused [admission correction](funding-rebalance-replacement-admission-correction.md) now rejects deleted/unsupported targets before financial mutation, after the existing Budget gate. Type2 dates remain immutable and type3 dates editable. PostgreSQL acceptance passes:1,075 focused/1,511 full,0 failed,0 skipped/pending; see the [verification record](funding-rebalance-replacement-admission-postgresql-verification.md). No historical repair is performed.

CC.transfer at its `existingTransaction` lookup checks Budget ownership only. The new immutable-date check protects existing type2 dates but does not require an active type2/3 accountless target. It reverses all old nominal rows and adds supplied rows, retaining target type/deleted/link state. Existing category/isolation tests prove foreign-resource rejection, not lifecycle admission.

A concrete source-executed counterexample: deleted type2 has nominal A+10/Pool−10 and zero applied effect; same-date PATCH to A+20/Pool−20 commits A+10/Pool−10 while Transaction.deleted stays true. It therefore creates an economic effect owned by a deleted record. Active ordinary/opening/account-linked targets are also admitted; zero-sum request validation is not a target-lifecycle check. The request validator accepts a general numeric type, so supported creation types should be explicitly characterized in the same focused admission review. Do not conflate this with stored-money validation.

`tests/unit/remainingCorrectness.spec.js` executes the actual transfer method with valid zero-sum rows and inert scoped adapters, reproducing the deleted-target contradiction without DB/bootstrap. Correct behavior is clear: accountless funding/rebalance replacement cannot edit a deleted or unrelated lifecycle. That characterization is now a rejection regression; the admission document records the independently derived type2/type3 contracts, precedence and prepared PostgreSQL matrix.

### R1: surviving Category/Pool updates (bounded initialization PostgreSQL-accepted; cascades deferred)

Current follow-up: [the bounded verification](category-funding-pool-concurrency-postgresql-verification.md) is ACCEPTED at HEAD e49bebe:32 narrow,1,213 focused and1,568 full-suite passes,0 failed,0 skipped/pending. New-Institution initialization gates before fresh Pool hydration; Category DELETE gates before transaction-bound fresh JSON membership admission. Existing-Institution creation remains ungated/no-opening. Cascades remain historically/semantically deferred. The following read100/save110 schedule is the historical pre-correction finding, now prevented among participating writers; it is not current initialization behavior.

IC.addOffline reads Budget without FOR UPDATE, loads the existing Pool, calls opening helpers for new Transaction-tracked Accounts, then saves that hydrated Pool. New Account initialization itself cannot lose a prior Account effect, but its **existing shared Pool** can lose another writer's effect. Source schedule: Pool100 read by initialization; gated funding commits withdrawal20→80; initialization adds opening10 to stale100 and saves110. Correct composition is90. The new Account/initial opening persist while the competing funding debit disappears. Promise.all shares one Pool object here; that is not the already-fixed separate-hydration Plaid branch race.

IC.deleteAccount/delete/deleteAccounts likewise modify surviving Categories without the Budget gate. Even a consistent eligible nonpending fixture can race a gated Category writer and overwrite one delta. This scheduling defect is separate from uncertain historical reversal authority; adding a gate would not resolve that authority.

Evidence: IC.addOffline, deleteAccount/delete/deleteAccounts; A.updateStartingBalance Pool += delta/startingBalance; CC.transfer's gated hydrated += delta. The accepted concurrency design explicitly excludes these Category/Pool outsiders (its “Category-only writers”/fresh-binding discussion); no accepted Account result is reopened. Existing initialization/cascade tests are serial; no PostgreSQL reproduction of this schedule is claimed in this review. Next work should characterize the bounded remaining shared-Category writer set using the accepted gate, not invent a lock hierarchy or broadly alter opening policy.

### R2: Category deletion admission race (PostgreSQL-accepted)

The approved implementation now acquires Budget before fresh scoped Category/admission reads and binds the active-nonzero JSON membership query to that transaction. PostgreSQL verification passed32 narrow/1,213 focused/1,568 full-suite tests with no failures/skips. Runtime instrumentation proves membership uses the Budget-owning transaction. The following ungated/default-query schedule describes the pre-correction defect. Preserve current scoped404/usage409/success204 semantics; do not invent zero-balance, system-type or funding-rule guards. Ordinary startDate crossings retain nominal membership, so an existing nonzero allocation already blocks deletion; legacy/system fallback cases are separate. Metadata/configuration and ambiguous cascade overlaps are not silently certified by the financial-posting boundary.

CC.deleteCategory reads scoped Category, checks active nonzero JSON membership through a default connection, then deletes within its transaction, without Budget serialization/rechecking after waiting. Source-permitted schedule: deletion sees no membership; a gated manual CREATE commits a nonzero JSON allocation to that Category; deletion then deletes the Category using its old admission result. Transaction JSON has no FK enforcing that logical membership. A normal UPDATE row lock can delay DELETE but does not rerun its earlier membership SELECT.

This contradicts the established “cannot delete a Category containing active nonzero Transactions” restriction, independently of monetary precision. The existing deletionLifecycle tests establish serial restrictions/rollback; they do not prove this overlap safe. No DB race is claimed executed here. Include this admission boundary in a focused Category/Pool concurrency follow-up; do not make Category deletion reallocate money or repair legacy references.

### R3 / F7: legacy transfer DELETE authorization/completion (G; PostgreSQL-accepted)

The following is the historical pre-removal finding. Current [DELETE deprecation](category-transfer-delete-deprecation.md) removes the route, handler and unused legacy model wrappers after confirming no supported DELETE dependency. Modern funding/rebalance POST/PATCH, conditional type1 compatibility UI and Transaction DELETE remain unchanged.Implementation-stage204 non-DB tests passed; subsequent verification passed10 core,1,171 focused/1,526 full,0 failed,0 skipped/pending. See [the verification record](category-transfer-delete-deprecation-postgresql-verification.md). Legacy tables were already absent; retained-row/legacy-cascade checks are not applicable. No historical data or schema change occurred.

Authenticated `DELETE /api/v1/category-transfer/:tfrId` still routes to CC.transferDelete. The handler neither receives/uses the authenticated Budget nor scopes CategoryTransfer or Category lookups. Given a retained legacy transfer with splits, another authenticated tenant can select its ID and subtract from the owner's Categories. An inert actual-method test demonstrates the handler mutates a Category belonging to Budget2 with an actor in Budget1. It also invokes category.save without await and has no Budget gate; no promise of atomic completion/serialization can be made.

This is not merely a dormant model reference: it is a reachable mutation surface conditional on retained legacy rows. No claim is made about their live population. Repository caller search finds no internal DELETE to this path: modern State.Transaction.delete uses `/transaction/:id`; POST/PATCH use the modern Transaction architecture. Retirement versus compatibility support needs a focused endpoint decision, but leaving a reachable cross-tenant mutation uncontained is a confirmed defect. Do not redesign legacy economic effects here.

### R4: Loan settings UPDATE persistence (G; PostgreSQL-accepted)

Before correction, LoansController.update validated/merged rate, startDate and startingBalance, invoked Loan.updateBalance (currently no-op), saved only Category name and returned success. That original path never saved the dirty Loan. This is an unambiguous persistence contradiction, separate from how interest/principal should be calculated. The original actual-method inert test reproduced persisted rate5/base100 remaining unchanged after accepted rate8/base200 while name changed; it now asserts the corrected persistence. Original loans/isolation.spec.ts characterized unchanged settings (and getProps returning0/[]); those security regressions did not approve losing edits as a product promise. Current isolation tests verify persistence while preserving the placeholder and financial noninterference.

The Loan Category API remains routed/tested, but repository client search finds no active Loan settings caller; ordinary Account Loan UI is a different lifecycle. Do not infer a safe full Loan recalculation from this defect. A focused future persistence/support-contract decision can separate saving settings from unfinished balance behavior. Current follow-up at dcdf0d0 reconfirms the missing save but blocks a save-only correction: concurrent complete requests can produce hybrid settings through stale Lucid dirty-field saves. See [the focused investigation](loan-settings-update-persistence-correction.md). The approved follow-up now acquires the existing owning Budget gate BEFORE fresh Loan/Category reads, saves both in the owning transaction, and preserves the inert calculation/placeholder. PostgreSQL verification is accepted:32 narrow/1,277 focused/1,632 full pass,0 failed/0 skipped; no historical repair or Loan accounting redesign is included.

### R5: forward DELETE/cascade contradiction versus historical authority (A)

Separate from primary D4/F4 historical limitation, current source has a reproducible forward counterexample requiring no old data: ordinary nonpending +10 before startDate is created with Account100/Category0 unchanged; TC.delete subtracts the stored10 anyway, leaving Account90/Category−10. Parent Account deletion similarly subtracts nominal10 from a surviving Category that never received it. This violates current eligibility; it is not a floating-point problem.

However, the same current nominal record might be an old pre-fix CREATE that **did** apply10. Reversing zero based on current eligibility would leave the old applied effect. The current DB record does not tell these histories apart. A known test operation sequence proves the forward bug; it does not create a durable production authority marker. No blanket current-eligibility fix, account-linked guard, canonical-money guard or provenance inference is recommended. Policy/resolution is required for a generally safe deployment. Exact representation cannot remove this limitation.

### R6: active report readers still use obsolete allocation storage (A; read side)

RC.category, fundingHistory and budgetProgress aggregate `transaction_categories`, while current manual/provider/type2 writes populate Transaction.categories JSON and do not maintain that old table. RC.incomeVsExpenses subtracts Account-transfer allocations through the same legacy join. Reports.tsx exposes Category, Income Vs. Expenses, Funding History and Budget Progress, so these are active outputs, not only old commands.

A current JSON-only +10 funding row has no legacy split; fundingHistory cannot report its10. Category reports omit modern JSON-only allocations; Account transfers cannot be reliably excluded through an unmaintained legacy join. These are source-of-truth/selection defects independent of whether arithmetic is float or exact. Existing reports/security.spec.ts seeds legacy splits and proves tenant/filter safety, not modern JSON-only report completeness. No new DB/report result is asserted. Deleted/pending/date selection policies and the budgetProgress monthly_expenses legacy flag must be characterized separately rather than silently changed while switching the allocation reader.

Net-worth uses current Transaction/opening/Statement sources and no BalanceHistory; its existing opening/report regressions remain valid. Tax JSON precision is B; no separate tax logic defect was established.

## 4. Representation / precision backlog

No representation solution is selected. Existing `Math.round(...*100)` arithmetic is not new MinorUnits architecture and is not proof of exact ingress/storage.

| Funding value | Semantic classification | Existing boundary / finding |
| --- | --- | --- |
| Fixed currency/configured fundingAmount/goal target | SNAPSHOT/METADATA (money configuration) | Number/numeric/JSON values; not themselves applied postings; preserve their currency units in inventory |
| Requested baseAmount | SNAPSHOT/METADATA | Requested pre-transfer snapshot, distinct from gross/net effect; not reversal authority; precision contract unresolved |
| Percentage source amount | PERCENTAGE/RATIO | Existing percentage validation/number arithmetic; not currency |
| Goal difference/month count/percentage product | CALCULATION INTERMEDIATE | SQL sum hydration, subtraction/division/multiplication and existing rounding |
| Spread/residual/funder Map | CALCULATION INTERMEDIATE | JS scaled numbers/addition/Math.round; residual assignment/order retained |
| Gross destination/negative funder row | POSTED ACCOUNTING MONEY | JS/JSON numbers; transfer can retain0.30000000000000004 |
| Net Category effect | POSTED ACCOUNTING MONEY | Grouped nominal rows; JS arithmetic then relational numeric scale |
| Preview Pool demand/available | CALCULATION INTERMEDIATE | Projection of posted rows/current balance; persisted Pool delta/balance is POSTED ACCOUNTING MONEY |

Same-state preview now matches posting. Fixed priority, cyclic closure and Pool-cap policy are C, not fresh algorithm defects. Low Pool becoming negative is existing submission semantics, not a newly approved availability limit. Binary representation artifacts alone are B; no rounding-policy fix is recommended.

Consolidated later inventory: Account/Category/AccountTransaction/Statement numeric money hydrated through parseFloat; Transaction Category and tax/funding JSON numbers; API numeric money; client AmountInput/form/State/formatting and arithmetic; OFX parser Number/normalization and signed accumulation; Plaid current/provider/pending monetary values; opening signed sums/Pool deltas; provider auto-assignment `auto_assignment_categories.amount` (migration1718921355278 uses float, PostgreSQL real), mixed fixed-money versus percentage role; Loan starting/principal/interest/rate fields; reporting FLOAT/crosstab/sums; operational diagnostics. PostgreSQL real is schema-source evidence from the migration, not a live-schema audit in this task. Its limited precision can alter autoAssign's rounded posted allocations; it belongs to provider assignment, not type2 funding configuration.

## 5. Product-question backlog

- Q1 equal Statement end-date winner: order only endDate DESC; tie can select different current balances. No established id-desc or other winner contract was found; choose policy before deterministic tie correction. Net-worth tie aggregation is not approval of an API winner.
- Q2 new versus existing offline Institution opening/Pool distinction: preserve until product intent is established. Not justification for symmetry changes.
- Q3 fixed priority: array ordering and insert/remove UI do not establish first/last winner; comparator characterization is not a product rule.
- Q5 Statement membership, pending/opening inclusion and reconciliation selection, separately from confirmed Account authority.
- Q6 Loan principal/interest/payment and multi-link transfer/deletion ownership; incomplete getProps/updateBalance support contract, separately from R4 persistence.
- Q7 rounding/quantization, currencies, sub-cent valuations/observations, money versus snapshot precision. Decide in the new project, not by restoring abandoned validators.
- Historical deletion/resolution policy; remote Institution removal versus local failure/recovery; missing/duplicate/deleted/malformed opening shapes.
- Future stale funding proposal policy, cycle closure and Pool limits. Current forms submit supplied instructions after existing validation; no frozen-quote/version protocol is implied.
- OFX identifier normalization/leading-zero identity policy and unmapped pending distinctions are known input-contract limitations. Multiple matches already fail closed; no new provider-format capability is inferred.
- Account mode-change initialization/authority transitions beyond the verified unchanged-mode separation are not defined by ordinary effect rules.

## 6. Historical-data limitations

H1/H3: account-linked DELETE and parent cascade cannot infer historical Category application from canonical JSON, current startDate/pending/deleted fields, balances or timestamps. Historical eligibility errors and startDate changes can leave indistinguishable nominal states with different applied effects. Current forward PATCH/startDate does not globally reconcile those offsets.

H2: old manual BalanceHistory overwrites and earlier OFX LEDGERBAL replacements can leave Account/opening/Pool offsets. Current history is not authority to reconstruct them; accepted fixes are forward-only. Initial Funding duplicate/malformed/multi-link special histories need separate handling; normal current formula does not certify them. Existing funding JSON and relational scale may already have lost original precision.

No replay, reconstruction, repair-on-touch, automatic balance repair, inferred/persisted provenance or historical audit execution is approved. A read-only future audit can estimate nominal shapes/compatibility, not prove absent applied-effect history.

## 7. Deferred cleanup / deprecation

- BalanceHistory table/rows, minimal model/Account relation and parent cleanup remain until separately authorized schema/data-retention work. No product reader/writer remains; no reason to precede inventory with a table drop.
- plaidBalance/plaid_balance naming→providerBalance/provider_balance is deferred naming/API/schema coordination; corrected authority already uses it correctly.
- Legacy CategoryTransfer DELETE and its unused model wrappers are removed and PostgreSQL-accepted (R3). Archived schemas/historical rows remain untouched. Modern names and conditional type1 UI remain; broader compatibility cleanup is separate.
- F1 metadata-only PATCH loading/validation isolation is robustness cleanup; ordinary metadata tests establish financial noninterference.
- F6 orphan/log/Statement cleanup coverage needs an authorized lifecycle audit. Plain integer migrations and omitted explicit cleanup are evidence of a gap, not live proof of orphan counts or permission to delete evidence.
- CheckBalances' explicit Category --fix/interactive recomputation remains administrative, gated across selected Budgets; Account repair is commented. CheckUnassigned is diagnostic. These are not normal posting authority or approved historical reconstruction; do not execute them as migration preparation. Multi-Budget administrative scanning does not imply normal cross-Budget financial transfers.

## 8. Writer audits

| Writer family | Account.balance authority / concurrency | Category/Pool behavior / remaining issue |
| --- | --- | --- |
| Manual CREATE | Eligible signed delta, post-Budget fresh state | Independently eligible allocation, gated; no new defect found |
| Ordinary PATCH | Eligible new−old delta, gated | Independent old/new Categories; dates/pending/duplicates covered; metadata validation cleanup only |
| HTTP/command OFX | Net Transaction effects; optional ledger→plaidBalance; fresh after Budget | Old/new eligible allocations; opening once from accounting; no history; representation/identity policy limitations only |
| Plaid sync | Date/pending deltas or approved first-sync absolute initialization; gated/refreshed | Date-only Category eligibility; sequential shared branches; local-deleted updates ignored, removals soft-delete; cursor atomic. No new ordinary provider logic defect found |
| startDate | No current Account balance assignment; gated | Active ordinary crossings include pending; opening separate; no double Pool crossing found |
| Opening | No Account delta; current balance minus the active/nonpending/on-or-after linked sum (`balance - sum`) | Pool new−old replacement; regular and new-Institution offline gated callers verified; ungated cascades remain R1. Accountless cannot enter Account relationship; type4 excluded |
| Statement CREATE/PATCH/DELETE | Latest ending balance/final zero for Balances only; gated | No Category posting; equal-endDate winner C. Transactions-mode membership never becomes authority |
| New Account initialization | New Account assignment; cannot stale-overwrite a previously existing Account | New-Institution Pool path now gated/fresh and PostgreSQL-accepted; existing-Institution no-opening policy unchanged; cascade R1 remains |
| Accountless funding/rebalance | No Account effect | Gated sequential grouped Category new−old; no startDate context; D13 admission PostgreSQL-accepted; funding date immutable |
| HTTP Transaction DELETE | Gated nonpending subtraction; legacy date/type behavior remains | R5 forward contradiction; D4 historical authority unresolved, no new guard |
| Account/Institution cascade | Account disappears; no surviving Account delta to serialize | Surviving nominal Category/Pool reversal D/F4, independent ungated race R1; physical history cleanup permitted |
| Legacy transfer DELETE | Removed | No replacement financial path; R3 retirement PostgreSQL-accepted; historical-table cases not applicable to the current absent schema |
| Category deletion | No Account writer | Budget gate + transaction-bound fresh membership PostgreSQL-accepted. Same admission/no reallocation |
| Loan Category API | Separate Loan.balance/config, not ordinary Account.balance | No-op derivation/placeholder response C; R4 configuration persistence PostgreSQL-accepted after Budget gate/fresh reload; Loan-type Account branches not generalized |
| Operational repair/diagnostics | Active Account repair code absent | Explicit CheckBalances Category repair is administrative; not supported automatic posting/migration authority |
| User/whole-Budget cleanup | Deletes graph when last Budget user leaves | No surviving graph requiring ordinary financial reversal; external cleanup/retention separate |

No unexplained normal Account.balance writer was found outside the accepted participant set beyond initialization/Statement/special Loan authority already documented. Current production history references are exactly Models/BalanceHistory.ts, Account.balanceHistory and Institution/User cleanup. Query-return objects, commented repairs and `Loan.balance` are not miscounted as existing Account writers. No legitimate normal multi-Budget posting was identified. Category/Pool concurrency coverage is explicitly narrower than a blanket all-financial-writers claim.

## 9. Ranked recommendations and deployment boundaries

| Rank | Finding | Timing recommendation | Reason / bounded next work |
| --- | --- | --- | --- |
|1| R0/D13 modern replacement lifecycle | **RESOLVED** | Admission/noninterference/concurrency/rollback verified;1,075 focused/1,511 full pass. No historical repair |
|2| R3/F7 legacy DELETE removal | **RESOLVED** | Route/handler/wrappers removed;10 core,1,171 focused/1,526 full pass; no financial replacement or physical schema removal |
|3| R1 bounded initialization + R2 deletion admission | **RESOLVED FOR APPROVED BOUNDED SCOPE** | PostgreSQL-accepted:32 narrow/1,213 focused/1,568 full pass; fresh Pool and membership binding instrumented. Cascades remain historical/lifetime-blocked; no universal guarantee |
|4| R6 report allocation source | **CAN DEFER UNTIL AFTER REPRESENTATION MIGRATION** | Active incorrect read outputs need a separate correction, but do not mutate financial state. Inventory both modern JSON authority and obsolete readers now; do not preserve their join algorithm as intended semantics |
|5| R4 Loan settings persistence | **RESOLVED FOR CONFIGURATION PERSISTENCE** | PostgreSQL-accepted:32 narrow/1,277 focused/1,632 full pass. Principal/interest/payment semantics remain unresolved; no financial redesign |
| Policy-blocked | R5 forward DELETE/cascade contradiction | **CAN DEFER UNTIL AFTER REPRESENTATION MIGRATION** (historical policy prerequisite) | Current forward bug is real, but a generally safe reversal cannot be derived from existing state. Resolve product deletion/resolution policy before activation; no mechanical current-eligibility patch or guard recommended |

The rank3 scope must explicitly address independent concurrency without pretending that a Budget gate proves historical reversal authority. If parent deletion cannot be safely included without policy, report that activation boundary rather than silently inferring history. Existing Account-gated participants must keep their gate/fresh-state/transaction binding in any later deployment. No partial ungated/gated writer rollout can claim a complete shared-Category guarantee.

Prioritize one focused task at a time, with modern replacement admission now accepted; legacy DELETE removal is now accepted; the bounded Category/Pool writer/admission correction is now PostgreSQL-accepted. No new exact-money architecture is selected. Unresolved priorities/Statement ties/offline symmetry and historical risks alone would not force another correctness task; the concrete A findings do.

## 10. Exact-money readiness decision and verification

**Current follow-up:** R0/D13 and R3/F7 are resolved; the approved bounded R1/R2 correction is now PostgreSQL-accepted. The original recommendation to complete that correction first is satisfied. Historical cascade/deletion policy and the separately ranked report/Loan issues retain their stated deferred status; this verification does not resolve them. The monetary storage/API inventory may record all affected boundaries now, but should not assume these behavioral defects are accepted accounting semantics.

Added only tests/unit/remainingCorrectness.spec.js: three actual-method non-DB characterizations for deleted replacement, unscoped legacy DELETE and unsaved Loan settings. These intentionally document defects; they are not acceptance tests of corrected behavior. They use inert adapters and the production zero-sum validator; no ORM/app/bootstrap/database is imported. Race schedules and report source mismatches are source-based findings, not newly executed PostgreSQL results. Existing DB records are used only for their accepted scopes.

Verification: all3 new inert characterization tests passed (0 failed,0 skipped). Both server/client TypeScript checks, ESLint, Knip and circular regression passed; only the accepted11-model/26-edge circular component remains. Working-tree and staged diff checks passed, including explicit new-file whitespace checks. No builds or DB tests were needed/run. Production-directory diff against HEAD is empty. No runtime behavior, provider, monetary representation, schema, historical state, deployment or commit changed; no PostgreSQL connection or destructive DB operation occurred. Existing untracked local files and the index were preserved.

Current follow-up: replacement admission has been implemented with 199 passing non-DB tests. The earlier three-test characterization baseline above is historical; deleted replacement now asserts rejection. Subsequent PostgreSQL verification passed1,075 focused/1,511 full,0 failed,0 skipped/pending; task-specific authorization is expired.

Subsequent F7 follow-up: the old unsafe inert DELETE assertion is replaced with route/handler absence assertions, with historical reproduction retained in [the deprecation record](category-transfer-delete-deprecation.md). No production reader/writer of category_transfers/category_splits remains; similarly named modern Transaction code is retained. Subsequent task-specific verification now accepts removal:1,171 focused/1,526 full pass,0 failures/skips; see the dedicated verification record. No production correction was needed; authorization is expired.

## Category/Pool concurrency design follow-up (no implementation)

At HEAD e49bebe, all accepted corrections remain committed. The new [design](category-funding-pool-concurrency-design.md) inventories Category/Pool writers, transaction/read/save timing, a12-writer pair matrix, existing same-transaction behavior, alternatives and future deterministic PostgreSQL cases. Six inert/source characterizations (82 focused tests total) confirm current stale Pool overwrite110 versus composed90 and Category usage TOCTOU, without app/DB bootstrap. Both TypeScript checks, lint, Knip, circular and both diff checks pass. No runtime, monetary, schema or historical change occurred; no PostgreSQL connection or destructive operation occurred. Next implementation scope is the two identified endpoints plus transaction binding, not cascade redesign. No product choice is needed before that bounded correction; it cannot claim universal Category safety while ungated ambiguous cascades remain. Remaining reversal/recovery/configuration issues stay separately scoped.

## Bounded Category/Pool implementation — database verification pending

At HEAD e49bebe, only IC.addOffline and CC.deleteCategory changed. Gate precedes Pool/Category authority; membership now uses owner trx. Existing-Institution creation, all other15 InstitutionController /11 CategoriesController methods and cascade helpers are byte-identical.211 focused non-DB tests pass; both TypeScript checks, lint, Knip, circular, builds and diff verification are recorded in [implementation](category-funding-pool-concurrency-implementation.md).30 deterministic PostgreSQL cases are prepared, not run. No DB connection, destructive operation, historical inference/repair, monetary/schema change, deployment or commit occurred. This does not mark cascade concurrency/authority resolved; DB authorization must be fresh and target-specific.


## Bounded Category/Pool verification follow-up

The [dedicated record](category-funding-pool-concurrency-postgresql-verification.md) supersedes pending-DB labels for the two approved paths only.32 narrow,1,213 focused and1,568 complete-suite tests pass, no failure/skip. Both TS checks, lint, Knip, circular, builds and diff checks pass. Safeguards independently verified configured/live pg, pgLog and execution connections before every destructive operation including cleanup, only on localhost:5432/spendcraft_test. No extra production change, cascade correction, history inference/repair, monetary/schema change, deployment or commit occurred. Task-specific authorization is expired. Historical review-stage no-DB statements above describe that earlier documentation-only task.


## Loan settings persistence investigation follow-up — blocked

At HEAD dcdf0d0e60bba52f1c8cd236a9631b034d5d6126, R4 remains confirmed and unfixed. UPDATE requires name/rate/startDate/startingBalance, merges flat Loan fields, calls inert updateBalance and saves only Category. A save-only candidate fails composition: requests8/100 and5/200 hydrated from5/100 save disjoint dirty fields and leave8/200, neither complete requested result. Installed Lucid hydration/merge/save with an inert adapter reproduces this in both orders; fresh serial reads produce the expected complete request. A late Category name write lock cannot refresh the earlier Loan read. Per the task's explicit concurrency stop condition, no persistence operation or concurrency architecture was added. [The investigation](loan-settings-update-persistence-correction.md) records validator coercion, scope, atomicity, response/client findings and future DB matrix; executable DB acceptance cases await the prerequisite design revision. No PostgreSQL connection occurred; previous authorization is expired. Historical Loan accounting, monetary representation and all accepted corrections remain unchanged.


## Loan settings approved correction — implemented, DB verification required

The approved [follow-up](loan-settings-update-persistence-correction.md) resolves the save-only blocker in source by joining the existing Budget gate before fresh Loan/Category lookup and persisting both in the owning transaction. Complete four-field request semantics, validation, scope, placeholder response and inert updateBalance remain unchanged. Same-Budget updates serialize; fresh dirty tracking cannot synthesize rate8/base200 from complete8/100 and5/200 requests. Actual-method/inert concurrency and rollback proofs pass;24 executable PostgreSQL cases and existing isolation expectations are prepared but NOT RUN. No DB acceptance, historical repair, financial Loan calculation, Account/Category effect or representation/schema change is claimed. Earlier blocked/missing-save paragraphs remain historical evidence, superseded for this implemented path only. Fresh task-specific DB authorization is still required.


Loan serialization implementation verification:246 focused non-DB tests pass,0 failed,0 skipped/pending; both TypeScript checks, ESLint, Knip, circular regression, server/client-asset build and diff checks pass. Only LoansController.update changes in production.24 new PostgreSQL cases and updated existing isolation tests are prepared/type-checked, not executed. No database connection, destructive DB operation, historical Loan repair, financial-semantics or balance behavior change, money/schema migration, deployment or commit occurred. Previous authorization is expired; fresh task-specific verification authorization is required.


## Loan settings PostgreSQL acceptance follow-up

The [verification record](loan-settings-update-persistence-postgresql-verification.md) resolves R4 for the approved configuration lifecycle:32 narrow,1,277 focused and1,632 full-suite passes,0 failure/skip. Fresh raw reads/subsequent GET, complete-state contention, post-wait hydration, same owning execution transaction, atomic rollback/retry, security and financial noninterference pass. Only tests/docs were strengthened; no extra production fix was needed. Both TS checks, lint, Knip, circular, server/client-asset build and diff checks pass. Every destructive operation including cleanup was independently safeguarded on localhost:5432/spendcraft_test only. Authorization is now expired. Historical lost settings remain unrepaired; unresolved Loan financial semantics, report allocation and historical reversal policies remain separately scoped. Prior blocked/pending sections above are retained chronological evidence, not current R4 status.
