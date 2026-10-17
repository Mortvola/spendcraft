# Final monetary-inventory correctness readiness

## Latest accepted status — Income fan-out / JSON deduction

At HEAD `756cf3a8f8d52bb9b11255a5bf80341d3f00fdcc`, the sole ranked pre-inventory Income prerequisite is PostgreSQL-accepted. [Acceptance record](income-vs-expenses-transfer-fanout-postgresql-verification.md):27 safeguard,33 narrow,1,721 focused and1,762 full-suite passes;0 failed,0 skipped/pending in each final gate. The original31 prepared cases also all passed. No production correction was required during verification. This status supersedes earlier pending/readiness recommendations below while preserving their historical context.

The approved contract is AccountTransaction movement minus matching CURRENT JSON transfer sum grouped by Transaction before joining movements. It is NOT JSON-only income accounting. No transaction_categories fallback exists. Duplicate amounts remain additive; movement50 with one50 or20+30 reports0,20+20 reports10, emptyJSON/legacy50 reports50. Other report bodies, tax/Statements and financial writers remain unchanged. All accepted baseline corrections remain present. Broader transfer/Progress/product policy and historical DELETE/cascade limitations remain deferred; monetary representation/precision remains the next inventory, not part of this correction.

**BEHAVIORAL BASELINE READY — BEGIN MONETARY STORAGE/API INVENTORY.** No further unambiguous isolated prerequisite is introduced by this verification. Both TypeScript checks, ESLint, Knip, circular regression, server/client-asset build and normal/staged diff checks pass. Every destructive operation and cleanup was independently safeguarded only on localhost:5432/spendcraft_test. Authorization is now expired. No historical repair, unrelated report authority, DELETE/cascade correction, money/schema migration, deployment or commit occurred.


## 1. Baseline and decision

Reviewed HEAD `756cf3a8f8d52bb9b11255a5bf80341d3f00fdcc`. Tracked working tree/index were clean at entry. Unrelated untracked generated/editor/backup/scratch files were preserved and not inspected. No baseline discrepancy was found. Required accounting/design/review and accepted PostgreSQL records were reconciled with current source/tests. Their database results are prior evidence; no app bootstrap, PostgreSQL connection, setup or cleanup occurred in this review.

**B. ADDITIONAL CORRECTNESS FIXES REQUIRED FIRST:** one narrow prerequisite is recommended: eliminate Account-movement fan-out in Income Vs. Expenses while preserving its current attribution source and all selection/sign policy. This is NOT approval to migrate that report to JSON, settle transfer policy or correct Budget Progress. No runtime correction is implemented here.

A separate current ordinary DELETE defect is real, not merely a hypothetical historical problem. Its safe general activation boundary still depends on historical deletion policy; it is NOT included as a representation-inventory prerequisite. That distinction must remain visible instead of classifying every deletion issue as historical or proposing a blanket eligibility patch.

Classification throughout: A confirmed active correctness defect; B representation/precision; C unresolved product question; D historical authority/data limitation; E deferred cleanup; F intentional behavior; G resolved/superseded; H dormant/unsupported defect. Each row chooses one primary; separate rows distinguish independently classifiable aspects.

## 2. Accepted corrections ledger

All entries are present in CURRENT source. Latest broad accepted baseline is1,697 full-suite passes with0 failed/skipped in the report verification record; counts below identify each correction's dedicated acceptance, not new runs.

| Correction / established invariant | Current source evidence | Verification record / dedicated full passes | Status |
| --- | --- | --- | --- |
| Account writer composition; Budget gate before fresh authoritative state | AC/TC ordinary writers, Institution.syncUpdate, OFX command; shared branches sequential | [Account concurrency](account-balance-writer-concurrency-postgresql-verification.md),1,256 | G accepted |
| OFX net effects→balance, optional LEDGERBAL→plaidBalance, replay0, malformed supplied ledger atomic rejection | Account.processOfx | [OFX](ofx-account-provider-balance-correction-postgresql-verification.md),1,305 | G accepted |
| BalanceHistory no supported accounting/runtime authority | Removed routes/client; minimal model/relation/parent cleanup only | [History deprecation](balance-history-deprecation-postgresql-verification.md),1,306 | G accepted |
| Account !deleted&&!pending&&date>=start; Category !deleted&&date>=start; boundary changes preserve Account balance | transactionEligibility; CREATE/PATCH/startDate/provider helpers | [Eligibility](account-category-eligibility-postgresql-verification.md),1,382 | G accepted for bounded scope; HTTP DELETE separately below |
| Same-input/state funding preview equals posted effects; no calculation redesign | Funding calculateFunding + dialog/item | [Funding](funding-preview-submission-postgresql-verification.md),1,428 | G accepted |
| Existing type2 date immutable; CREATE chooses date; type3 editable | FundingDialog + CC.transfer422 date check | [Immutable date](immutable-funding-date-postgresql-verification.md),1,443 | G accepted |
| Fresh active scoped supported replacement target admitted before reversal | CC.transfer type/link/Loan/allocation admission after Budget | [Admission](funding-rebalance-replacement-admission-postgresql-verification.md),1,511 | G accepted |
| Unsafe standalone CategoryTransfer DELETE absent | No route/handler/delete-only model wrappers; modern POST/PATCH separate | [Transfer deprecation](category-transfer-delete-deprecation-postgresql-verification.md),1,526 | G accepted |
| New-Institution opening/Pool and Category DELETE fresh admission join Budget gate | IC.addOffline; CC.deleteCategory including owner-trx JSON membership | [Category/Pool concurrency](category-funding-pool-concurrency-postgresql-verification.md),1,568 | G accepted for these two paths, not cascades |
| Loan complete settings + Category name persist atomically after fresh gate reload | LoansController.update, both saves; calculation remains inert | [Loan persistence](loan-settings-update-persistence-postgresql-verification.md),1,632 | G accepted for configuration |
| Category current nominal JSON; Funding History current type2 NET JSON; exclusive authority | RC.category/fundingHistory JSON expansion, both ownership boundaries | [Report authority](category-funding-history-report-authority-postgresql-verification.md),1,697 | G accepted for TWO reports; legacy-only omission intentional |

AC=AccountsController; TC=TransactionsController; CC=CategoriesController; IC=InstitutionController; RC=ReportController. Source lives under app/Controllers/Http. No accepted item is reopened based on its old pre-correction review text.

## 3. Remaining confirmed active defects and strict prerequisite test

### A1. Income Vs. Expenses movement multiplication — A; sole recommended prerequisite

Active route GET /api/v1/reports/income-vs-expenses, visible Reports choice/ComboChart. RC.incomeVsExpenses joins Transactions→AccountTransactions→Accounts, then LEFT JOINs legacy transaction_categories for the Budget's Account Transfer Category. The comment says tc.amount removes Account-transfer amounts. The existing formula subtracts attribution from each Account movement and groups income/expenses by ORIGINAL AccountTransaction sign. Legacy schema permits repeated Category allocations; no unique(Transaction,Category) constraint exists. They are valid additive rows, not necessarily corrupted data. Current ordinary writers no longer populate this table, so incidence depends on retained rows; no live population/frequency claim is made.

Actual-method inert tests already distinguish these equivalent transfer partitions:

- One Account movement50, one transfer50:50−50=0.
- Same movement50, transfer20+30: SQL repeats the movement and returns(50−20)+(50−30)=50.

For n transfer rows it computes n×movement−SUM(transfer) instead of movement−SUM(transfer). Merely partitioning identical additive attribution changes income. This is an unambiguous internal cardinality contradiction, independent of currencies, precision, historical application, deleted/pending inclusion or whether JSON should eventually replace legacy attribution. For this fixture, correct result under the EXISTING formula is0. Repeating the base movement is not a defensible alternative transfer policy.

The narrow correction can aggregate the CURRENTLY selected transfer rows per Transaction BEFORE joining Account movements, or an equivalent once-per-movement subtraction. Preserve current source, Account links, sign classification, dates, type4 exclusion, tracking filter, status selection and wire shape. Do not reinterpret multiple Account links as a new transfer lifecycle or change which movements qualify. Broader source/transfer policy remains C below.

All six prerequisite conditions are met: active report; demonstrated wrong arithmetic; once-per-existing-movement intent established by current formula/comment and partition counterexample; no applied-history inference; wrong monetary aggregation risks financial-report accuracy and could be carried into new storage/API aggregation; isolated query-cardinality correction possible without representation changes. The fact that it is read-only reduces severity but does not turn false monetary totals into a precision problem. Eventual PostgreSQL verification is required; no SQL rewrite or database test was performed now.

### A2. Current ordinary HTTP DELETE eligibility — A; not an unconditional deployment recommendation

TC.delete holds the Budget gate and reloads active owned Transaction/Account, but subtracts every nominal split (or Unassigned fallback) and every nonpending linked ordinary amount without date>=Account.startDate. It does NOT use the accepted eligibility helpers here. Provider deletion is a different helper/path.

New non-DB tests execute actual CURRENT AC.addTransaction followed by actual TC.delete with inert persistence and no historical data:

| Trace | After CREATE | After DELETE | Correct CURRENT forward roundtrip |
| --- | --- | --- | --- |
| Account100/Category0; nonpending+10 BEFORE start |100/0 |90/−10 |100/0 |
| Same with−10 BEFORE start |100/0 |110/+10 |100/0 |
| +10 ON start |110/+10 |100/0 |100/0 |

Therefore a current forward defect exists even if every historical row were perfect. For a record KNOWN to have been created/maintained under the corrected lifecycle, current date/status/splits and current startDate are enough to calculate its currently eligible contribution; no provenance is needed to prove that trace or define its correct reversal. Pending still suppresses Account only.

However, the SAME production-visible pre-start record may be an older writer's already-applied10. Skipping reversal then preserves that old offset, whereas subtracting10 repairs it accidentally. Neither current timestamps, global correction commit, current balances nor current nominal JSON is accepted evidence distinguishing these histories. There is no persisted current-era authority marker or approved production cutoff. A test trace is not a queryable admission predicate. The same current-rule calculation is therefore NOT certified as a historically correct reversal for arbitrary stored rows. A current-contribution-only forward policy might intentionally preserve old offsets (as opposed to reconstructing actual application), but that deletion policy must be explicitly established; it is not assumed here.

Do not claim historical ambiguity makes current arithmetic correct, or that provenance is required to understand a newly created record. Do not claim a safe new-only rollout can automatically identify all such records without an approved boundary. The general correction fails prerequisite condition4 until activation/historical handling is decided. No guard, timestamp cutoff, replay, provenance, special DELETE architecture or repair is proposed.

## 4. Full remaining-findings reconciliation

| Finding / original IDs | Primary | Current status / prerequisite? |
| --- | --- | --- |
| Income movement fan-out (R6 arithmetic subissue) | A | Narrow A1 above; sole FIX BEFORE MONETARY INVENTORY recommendation |
| Income allocation authority/transfer inclusion (R6 policy subissue) | C | Legacy join misses JSON-only transfers. Which attribution/current-vs-history/status/link policy the whole report should use is not approved. Do NOT copy Category's exclusive JSON decision automatically; no broader prerequisite |
| Budget Progress authority/expense selection (R6) | C | Active UI, legacy type2 funding/daily non2/3/4 rows restricted by monthly_expenses. Modern JSON omitted; no established supported expense selector. Do not select all Categories or migrate generically |
| monthly_expenses validator-only accepted input | C | Both Category validators accept optional monthlyExpenses; controllers omit it, model has no column mapping, response/model does not demonstrate persisted setting. Direct accepted input is ignored. Retain-vs-persist support contract unclear; source-level no-op is real, but no evidence of an ACTIVE visible editor claiming to save it. Not a proven independent supported-setting persistence promise |
| Monthly expense checkbox/form initial value | H | Commented out in CategoryDialog; State update has no monthlyExpenses property/cache mutation. Dormant intended editing is not an active UI save defect. Reinstating/retiring it needs product scope |
| Budget Progress no-funding SUM→NaN/null and missing-day behavior | C | SQL SUM null is parseFloat'd, running values may be NaN; correct no-funding/no-activity display and expense set not established. Not a posting defect; preserve until report policy chosen |
| Current ordinary DELETE (D4/R5 forward) | A | A2 proves current failure. Safe general deployment depends on separately stated historical/current-contribution policy; not prerequisite now |
| Historical account-linked DELETE (D4/H1) | D | Applied effects not proven by nominal state. No replay/guard/provenance inferred |
| Current cascade pre-start/deleted trace (F4/R5 forward) | A | Nominal loop can reverse a current never-applied pre-start effect or repeat a previously deleted effect. Known trace is wrong; broad cascade activation remains historically/specially blocked, not prerequisite |
| General surviving Category/Pool cascade reversal (F4/H3) | D | Ungated loops cannot infer applied history. Adding a gate alone cannot certify reversal |
| Remote provider removal before local preflight (F5) | C | IC.delete removes remote Item before local deleteAccounts; local rollback cannot undo remote removal. Recovery/deletion contract requires explicit policy |
| Fixed funding-rule priority (Q3) | C | Comparator uses only a.percentage; comment establishes fixed-before-percent, not first-vs-last among fixed rules. UI order/$/% and characterized reversed fixed winner establish behavior, not approved priority. No priority correction |
| Funding cycles, Pool limit, stale proposal guarantees | C | Existing supplied-instructions/current-state semantics remain. No frozen quote, cyclic solver or enforced nonnegative Pool contract approved |
| Same-state preview, immutable date, admission, Category/Funding History legacy-only omission | G | Accepted; no new contradictory evidence. Historical-versus-current reporting already explicitly resolved for these TWO reports |
| Statement equal-end-date winner (Q1) | C | Equal dates allowed by validators/schema; different ending balances possible. Account authority queries order endDate DESC without tie key. Winner can affect balance; no established id-desc/other tie rule. No prerequisite |
| Statement CREATE/reconcileAll membership filters (Q5) | C | Pending/opening selection differs; reconciliation itself posts no financial effects. Accepted Account authority is unchanged; no new independent logic defect established |
| Offline NEW vs EXISTING Institution opening (Q2) | C | New route invokes opening/Pool, existing route omits it; both balance-tracked routes use Statements. Concurrency fix did not approve symmetric accounting |
| Loan principal/interest/payment/starting balance and transfer ownership (Q6/F8) | C | Legacy Loan.updateBalance inert/getProps0/[], Account Loan CREATE/PATCH use principle-specific branches. Desired amortization/interest/payment/eligibility contract not established; no ordinary-rule substitution |
| Loan settings save/concurrency (R4) | G | Fresh gate + both saves; all four required fields/placeholder preserved. No lost-setting repair or activation of financial calculation |
| Category deletion substantive restriction (S6) | F | Fresh gated active-nonzero JSON membership blocks deletion; no reallocation. No zero-balance/system/funding-rule checks invented. Missing/deleted/zero history and remaining FKs have current documented behavior |
| Category system/config deletion policies beyond current contract | C | No new established invariant proving another guard is required. Do not redesign deletion because it is surprising |
| Legacy CategoryTransfer DELETE (F7/R3) | G | Route/handler/wrappers absent. No alternate financial deletion surface reappears |
| Retained type1 compatibility UI/save contract | C | Conditional TrxDialog branch exists; payload lacks required type and type1 replacement is outside supported type2/3 admission. No normal modern type1 creator/approved restoration-to-support contract found. Decide support/retirement separately; no supported financial mutation through rejected save is proven |
| BalanceHistory supported lifecycle (D5–D8/P6/S4) | G | Removed; model/relation and parent cleanup are not accounting authority |
| Plaid date/pending/cursor/shared branches (S3/F3) | F | Accepted forward old/new effects; post-gate refresh and sequential shared work. No new provider behavioral contradiction found |
| OFX identity/reimport/allocation (S2) | F | Scoped identity, fail-closed ambiguity and explicit allocation/remainder preservation; accepted independent balances |
| Provider identifier/currency/precision capability questions | C | Leading-zero/normalization, unsupported currency/observation scale and provider-format extension not established new correctness rules |
| Report/tax/Payee selection dates/status | C | Taxes use Transaction.taxes + Statement income; Payee AccountTransaction movement. No approved new deleted/pending/pre-start/tax-period rule; not generic Category posting eligibility |
| Net-worth/chart/Statements authority | F | Accepted Account/opening/Transaction/Statement sources, no BalanceHistory or legacy allocation dependence. No new contrary source evidence |
| Opening formula/current boundary (P4) | F | balance−active/nonpending linked on/after sum excluding opening; date=startDate, Account balance unchanged. Gated callers verified |
| Missing/duplicate/legacy opening shapes, old provider/history offsets | D | Current opening helper is not historical reconstruction; bad old shapes or offsets cannot safely be repaired from canonical state |
| Account tracking-mode transitions | C | Unchanged-mode Transaction/Statement separation accepted; switching modes/initialization contract remains separate |
| Conditional cross-linked report/projection data scope | E | Corrected two reports scope both ends. Income/Payee/Progress/Funding Info still have conditional join-coherence gaps described in design; no supported owned writer creating cross-Budget links found. No proven active cross-tenant exploit/financial mutation. Future defensive scope tests remain valuable, not a newly proven prerequisite |
| Metadata-only PATCH broad validation (F1) | E | Existing noninterference tests prove no balance change. Robustness/loading cleanup only |
| Parent Statement/log orphan cleanup coverage (F6) | E | Explicit cleanup omissions/plain integer references are source evidence; live orphan existence not inspected. Retention/cleanup task, not permission to destroy evidence |
| Manual CheckBalances/CheckUnassigned | E | Administrative repair/JSON-write tools; not normal automatic posting or inventory authority; must not run as migration preparation |
| Commented Loan derivation, Category.syncBalance, provider/history repairs | H | No supported active financial body/caller. Do not revive abandoned algorithms |
| Old branch architecture/provenance/locks (X1–X4) | G | Abandoned decisions are not requirements; no restored MinorUnits, quote protocol or inferred repair |
| Numeric money, fixed-rule values, binary artifacts, reports/auto-assignment real (D12/F9/F10) | B | Representation inventory below; no precision fix masquerading as a behavioral prerequisite |

## 5. Account/Category/Pool writers and cascade branches

| Path | Current authority / gate | Remaining status |
| --- | --- | --- |
| Manual CREATE/PATCH | Budget, fresh linked state, independent Account/Category eligibility | Accepted; current DELETE separate |
| Transaction DELETE | Budget + fresh state, nominal Category/nonpending Account reversal | A2/D historical split; lock is present, arithmetic is the issue |
| startDate | Budget; ordinary Category crossings, separate opening, unchanged Account balance | Accepted |
| OFX HTTP/command | Budget; eligible old/new net, optional provider observation | Accepted |
| Plaid sync/provider initialization | Budget; refresh Account/Institution/cursor, sequential shared Pool branches | Accepted bounded protocol; first initialization keeps separate authority |
| Type2/3 | Budget; active supported fresh target then grouped Category new−old | Accepted; type2 immutable/type3 editable |
| New-Institution offline | Budget before fresh Pool, shared batch object/final save | Accepted; no independent same-request lost update found in approved batch |
| Category DELETE | Budget before fresh scoped Category/active-nonzero membership, same transaction | Accepted; admission uses JSON, not relational FK protection |
| Loan settings | Budget before fresh Loan/Category, both config saves | Accepted; no balance/Pool writer added |
| Statement mutations | Budget; Balances latest-ending authority only, final delete0 | Accepted authority; equal-date policy C |
| Existing-Institution Account creation | Ungated by design; new Account/Statement, no opening/Pool save | No competing existing financial balance overwrite; route distinction C |
| Account/Institution cascades | Ungated, surviving nominal Category/Pool reversals | D/C blocked; not certified by other gates |
| Whole Budget/User graph cleanup | Parent cleanup, no surviving graph requiring artificial reversal | F; no ordinary reversal needed solely to delete rows |
| Operational repair | Explicit administrative writes, not normal posting | E/D; no automatic historical reconstruction permission |

No new normal non-cascade writer escaping the intended accepted protocol was identified. Gates serialize future participating operations; they do not correct old offsets or certify ungated cascades. No lower-resource locking/optimistic version architecture is proposed.

Cascade branches must not be bundled: known current active eligible single-link ordinary rows have a calculable reversal in a known coherent trace; current pre-start rows have zero effect and current deleted rows should not be reversed twice (A counterexamples). Arbitrary persisted versions of those rows remain D. Unique coherent opening/Pool reversal is specialized, not ordinary Account delta; malformed/multi-link openings are D. Loan/multi-Account ownership is C. Physical Account/link/Transaction/history cleanup is nonfinancial when no surviving balance needs adjustment; whole-Budget deletion is F. Remote provider removal is its own C failure/recovery issue. These distinctions preclude a mechanical “gate all cascades” prerequisite.

## 6. Final representation backlog — inventory, NOT a design

A value can cross several separately listed boundaries; rate/percentage is explicitly not money. No quantization/currency policy is decided here.

| Values / source | Classification | Current representation concern |
| --- | --- | --- |
| Account.balance, Category.balance including Pool, AccountTransaction.amount/principle, Statement starting/ending balance, Loan.balance/startingBalance | STORED ACCOUNTING MONEY | Relational numeric (commonly12,2) hydrated with parseFloat into JS number; scale may already have lost input precision. Loan monetary semantics remain C separately |
| Transaction.categories[].amount; explicit transfer/funding net/signed rows | STORED ACCOUNTING MONEY | Ordered JSON/JSONB numbers; duplicates meaningful, no relational FK in JSON, binary ingress/serialization precision |
| Transaction.taxes[].amount; Statement.data gains/dividends/interest | STORED ACCOUNTING MONEY (attributed reporting money) | Numeric JSON and SQL real extraction; not Category.balance authority |
| plaidBalance/provider reported amounts, fundingAmount/fixed money/goal targets, baseAmount, starting snapshots/legacy expected | STORED MONETARY SNAPSHOT | Different observation/configuration/request meanings; not interchangeable with posted net effects; preserve units/metadata purpose |
| auto_assignment_categories.amount with percentage=false | STORED MONETARY SNAPSHOT | Migration1718921355278 uses table.float (PostgreSQL real); AutoAssignmentCategory.consume parseFloat. Fixed currency configuration can influence posted amounts |
| auto_assignment_categories.amount with percentage=true; Loan/Account rate; funding percentage | RATE/PERCENTAGE — NOT MONEY | SAME amount column changes semantic dimension by percentage flag; no third configured quantity found. Cannot mechanically convert every field named amount into money |
| Transaction/balance/Statement/Loan/provider/funding/report responses and request DTOs | API MONEY | Current JSON numbers; hydrated/raw response versus persisted scale may differ |
| AmountInput, forms, State Transactions/Accounts/Categories/Statements/Funding/Taxes, chart data | CLIENT MONEY | JS numbers and some intermediate form strings; formatting does not establish exact ingress/storage |
| Opening balance−sum, old/new effect deltas, provider accumulation, source allocations, goals, residuals, gross/net/Pool demand, tax worksheets | CALCULATION INTERMEDIATE | JS addition/subtraction/multiplication/division, Math.round scaled values, parseFloat/Number; timing/policy must be recorded before representation work |
| Funding transfer-inclusive0.30000000000000004 | CALCULATION INTERMEDIATE and separately persisted net JSON boundary above | Current accepted behavior explicitly retained; preview/submission agree, exact storage is later work |
| SQL SUM/window/crosstab/float/real, JSON recordset sums; Category/Funding History, Income/Progress, Payee, net worth/chart/tax totals | READ-SIDE AGGREGATION | Numeric hydration and JS client totals/toFixed/display rounding; cardinality/source defects separately classified, never solved merely by decimals |
| Legacy transaction_categories.amount/expected and LoanTransaction principal | STORED ACCOUNTING MONEY / STORED MONETARY SNAPSHOT respectively by field meaning | Historical/structural retention still exists; two corrected reports never fallback. Do not migrate duplicate amounts as additive current authority without feature analysis |

Classify display rounding as a presentation boundary attached to CLIENT MONEY/READ-SIDE AGGREGATION, not an approved new rounding policy. Provider currency/valuation/sub-cent support and exact API compatibility need explicit decisions in the next project. No proposed encoding/library/storage architecture is part of this review.

## 7. Historical-authority backlog

- Ordinary DELETE and Account/Institution cascades: missing record of the actual Category/Account effects old writers applied and whether earlier reversal occurred correctly. Current dates/status/nominal JSON do not supply it. Known current traces are distinguishable in tests, not automatically in production admission.
- Pre-correction Category CREATE/PATCH/startDate/pending inconsistencies and old BalanceHistory/OFX Account overwrites: missing applied-delta history/causal provenance. Current balances contain unrelated offsets; replay cannot safely reconstruct them.
- Historical-as-posted Category/funding attribution: current JSON is edited nominal state, old relational rows are not a certified historical ledger, names are current, replacements erase former snapshots. Two accepted reports intentionally answer CURRENT attribution instead.
- Historical opening malformed/duplicate/multi-link shapes and old scale/JSON input precision: missing unique lifecycle/economic evidence or original precision. No normalization/repair-on-touch.
- Historical Loan settings requests silently lost before correction: original intended request values are not recoverable from current Loan state.

## 8. Consolidated genuine product questions

Income report source/current-vs-historical attribution, transfer inclusion and original-vs-net sign/status/multi-link/Loan policy (not whether to repeat a movement per split); Progress expense selection/monthly flag support/no-funding display; funding fixed winner/cycles/Pool limits/future stale proposals; Statement equal-date winner and reconciliation selection; offline new/existing Institution opening difference; Loan principal/interest/payment/starting balance and type1 compatibility support; historical deletion/remote-removal recovery and opening ambiguity; Account tracking-mode transitions; provider identity/currency/observation capabilities; future ingress/quantization/rounding/API compatibility. Existing approved current nominal two-report authority is NOT reopened.

## 9. Deferred cleanup / dormant code

BalanceHistory minimal model/relationship/table/rows/parent cleanup; plaidBalance→providerBalance naming; legacy relational allocations retained for Loan admission; retained type1 UI/API compatibility; commented Loan/repair/sync algorithms and old migrations; metadata PATCH robustness; parent orphan/retention audit; explicit operational tooling. None becomes a prerequisite merely because it is old. Physical CategoryTransfer tables were absent in its accepted verification environment; do not recreate/drop them from source assumptions or remove archived migrations. No data-retention decision is inferred.

## 10. Behavioral guardrails for monetary inventory/migration

Preserve Account versus Category eligibility (pending differs); Account balance invariant under startDate changes; opening formula/date and independent Pool effect; OFX accounting/provider separation and atomic optional-ledger validation/replay; Plaid distinct first-initialization authority/cursor refresh; no BalanceHistory authority; same-state funding preview/posting with unchanged rounding/order; immutable type2 date and editable type3 date; fresh supported replacement admission before reversal; accountless type2/3 effects; exclusive nominal Category/net Funding History JSON including legacy-only omission/counts; specialized tax/Statement/net-worth sources; complete Loan configuration persistence without activating financial code; Budget-first/fresh-owning-transaction boundaries including new-Institution and Category DELETE. Do not treat current DELETE/cascade or legacy Income/Progress queries as automatically approved semantics when porting money types. Do not repair historical state during representation changes.

## 11. Prerequisite ranking and sequencing

1. **Income Vs. Expenses transfer-join fan-out only — FIX BEFORE MONETARY INVENTORY.** Preserve selection/legacy attribution policy and wire shape, aggregate selected transfer attribution before movement join, verify equivalent one-row versus split-row totals and unchanged single/no-transfer results. No schema/representation/history work. Future DB verification must cover no/one/multiple transfer rows, positive/negative movement, multiple linked movements under unchanged rules, tenant scope, read-only snapshots and unchanged other reports. Authorization must be fresh and safeguards independent before every destructive operation. This is a recommendation for a separate focused task, not runtime approval from this review.

No other finding satisfies ALL six conditions. A2/current cascade traces remain confirmed defects but need a safe historical/activation contract before a general correction; do not relabel them intentional or claim they are solved by this decision. Budget Progress/monthly editing, fixed priority, Statement ties, offline symmetry and Loan financial semantics require genuine product choices. Precision/cleanup/dormant/history cannot manufacture further prerequisites.

Read-only inventory could technically proceed in parallel if it records these known boundaries explicitly; the requested ordering recommendation is to complete the isolated A1 correction first so its known wrong aggregation is not adopted into the monetary design. This does not require settling every reporting policy before inventory.

## 12. Review verification

Three new tests in tests/unit/finalReadiness.spec.js execute real current CREATE→DELETE methods with inert adapters to prove the current forward defect; they deliberately characterize wrong behavior, not acceptance of a fix. Existing actual-method Income fixtures prove the equivalent-partition discrepancy. No broad speculative test suite, runtime change or DB test was added/run. Final focused non-DB selection:233 passed,0 failed,0 skipped/pending, including all3 new current-forward characterizations and the existing Income partition fixtures. Both TypeScript projects, ESLint, Knip and circular regression pass. The first lint run flagged empty inert methods/this alias in the NEW test only; these were corrected without suppression, and the final selection/lint passed. Circular audit retains only the accepted11-model/26-edge component (412 files/489 repository nodes). Normal/staged diff whitespace checks pass; new files are separately checked. No builds were needed for documentation/inert test changes; no full DB suite, app bootstrap or database connection ran. Production-directory diff is empty; index remains unchanged. No deployment/commit, historical repair, monetary/schema migration or index mutation occurred.


## 13. Final readiness decision

**B. ADDITIONAL CORRECTNESS FIXES REQUIRED FIRST.** Rank1 is Income Vs. Expenses movement fan-out only. All accepted corrections remain accepted. Broader reporting/product/historical/precision/cleanup work is explicitly NOT bundled into that prerequisite. The new monetary storage/API inventory must preserve the ledger and guardrails above and must not adopt known wrong query cardinality as intended monetary semantics.


## Income Vs. Expenses cardinality follow-up — implemented, DB verification pending

At HEAD756cf3a8, the sole approved prerequisite A1/R6 arithmetic correction is now implemented in incomeVsExpenses only; see [correction record](income-vs-expenses-transfer-fanout-correction.md). A Budget-scoped relational CTE SUMs the CURRENT qualifying transfer rows by Transaction ID before the unchanged Account-movement join/SUM. Equivalent50 versus20+30 now both report0; legitimate20+20 reports10 on movement50. Current relational attribution, sign classification, selection/group/order/response and client remain unchanged; this does NOT approve JSON migration or broader transfer policy. Other report methods and Transaction DELETE/cascades remain untouched. Historical review findings above describe pre-correction source. Do not mark A1 PostgreSQL-accepted or monetary readiness fully satisfied until fresh task-specific verification passes. Non-DB tests and executable DB cases are recorded in the correction document; no database connection, destructive operation, data repair, monetary/schema migration, deployment or commit occurred. Previous database authorization is expired.

Implementation non-DB verification:253 focused passes (20 new fan-out cases),0 failed/skipped; both TypeScript checks, ESLint, Knip, circular regression, server/client-asset build and both diff checks pass.25 PostgreSQL acceptance cases are executable/prepared but NOT RUN. Only incomeVsExpenses changes in production; other report hashes pass. Fresh task-specific DB authorization must be restricted to localhost:5432/spendcraft_test with safeguards independently before every destructive operation/cleanup.


## Income transfer-deduction authority clarification — implemented, DB verification pending

Subsequent explicit product direction supersedes the earlier relational-only candidate: Income Vs. Expenses continues to use AccountTransaction.amount for movements, but deducts CURRENT Transaction.categories JSON amounts matching the Budget's Account Transfer Category. A scoped JSON-expanding CTE sums by Transaction ID before the unchanged per-link movement calculation, preventing split fan-out. Empty/missing JSON supplies no deduction; no transaction_categories fallback/merge occurs, and legacy-only attribution is not copied or repaired. Movement selection, original-sign bucket, periods/order/API and other reports remain unchanged. This is not JSON-only income accounting. Broader transfer/status/multi-link/tax policies and Budget Progress/structural legacy uses are not changed. See [current correction record](income-vs-expenses-transfer-fanout-correction.md). Earlier relational-preservation claims and253-test verification describe the superseded candidate, not current authority or DB acceptance. No database connection occurred; authorization remains expired.

JSON-deduction implementation verification:262 non-DB focused passes,0 failed/skipped, including26 dedicated Income cases and25 allocation/source cases. Both TypeScript checks, final ESLint, Knip, circular regression, server/client-asset build and diff checks pass.31 PostgreSQL cases are prepared but not run. Only Income uses the newly approved JSON deduction; movement amounts remain AccountTransaction-based. No database connection, data repair, monetary/schema change or commit occurred.

## Latest Income verification follow-up

See [Income PostgreSQL verification](income-vs-expenses-transfer-fanout-postgresql-verification.md). The subsequent approved runtime scope uses AccountTransaction movement amounts and CURRENT Transaction JSON ONLY for the matching Account Transfer deduction, aggregated by Transaction before joining movements. It supersedes the original relational-only correction recommendation. Movement50 reports0 for50,20+30 or10+15+25;20+20 reports10. Empty JSON with legacy50 reports50, intentionally without fallback. No other report authority changes.33 narrow and1,721 focused tests pass,0 failed,0 skipped/pending. Final full-suite outcome is recorded below when complete. Earlier B/prerequisite and pending entries remain historical evidence.
