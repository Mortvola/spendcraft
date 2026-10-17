# Allocation / reporting authority characterization and design

## Baseline, scope and recommendation

HEAD `b06de7575eda2354d30ac3d741b8ff7aba3ad74c`. Tracked tree/index were clean at the start; unrelated local/generated/editor/backup files were preserved and not inspected. Current source matches the accepted corrections, including the committed Loan configuration gate/save. Read accounting invariants, both correctness reviews and accepted eligibility, funding, admission, Loan, OFX and BalanceHistory verification records. Their database results are prior evidence, not tests rerun here. Database authorization is expired. No PostgreSQL connection/bootstrap/test/setup/cleanup, runtime change, schema change, historical repair or monetary migration occurred.

**Recommendation B — REPORT AUTHORITY PARTIALLY READY.** The source-of-truth defect is confirmed in four ACTIVE PRODUCT REPORTS. Category and Funding History have clean **current nominal attribution** correction candidates using current JSON numbers, with existing selection/count/group/name behavior frozen for a narrowly approved source correction. They must not be advertised as reconstructed historical applied effects. Income Vs. Expenses needs specialized Account movement minus transfer attribution, not a generic Category sum. Budget Progress additionally needs a supported expense-Category selection contract. Legacy-only compatibility and any change to deleted/pending/pre-start selection require explicit decisions before a general rollout. Precision is separable; waiting for exact-money would not itself resolve these semantic questions.

No report is marked runtime corrected by this design. Existing source inclusion rules below are characterized behavior, not newly approved product policy. A candidate can be implementable mechanically while its broader reporting policy remains unresolved.

## 1. Economic concepts and authority

| Concept | Definition / boundary |
| --- | --- |
| Nominal current allocation | The Transaction's currently stored ordered Category rows; current ordinary, funding and opening writers persist these in transactions.categories JSON |
| Applied Category effect | Ordinary effect requires active/nondeleted and date>=Account.startDate; pending does NOT suppress it. Type2/3 and opening have separate lifecycles. A nominal row is not automatically an eligible effect |
| Historical applied effect | What actually changed balances in the past. Current JSON, old relational rows, current Account boundary/status and current balances do not establish that history |
| Reporting attribution | The fact a report is defined to attribute: spending, funding, Account transfers, tax income, etc. Its selection rules need not equal Category posting eligibility |
| Legacy relational allocation | transaction_categories rows: no current normal writer synchronization; may contain old nominal values and structural Loan ownership evidence |
| Modern JSON allocation | transactions.categories array of Category ID/amount rows, plus lifecycle metadata; modern nominal authority, not a historical ledger |

Current nominal JSON is authoritative for WHAT current writers stored, not automatically WHICH rows every report should include. Statements.data and transactions.taxes are different attribution sources. Tax configuration, Account movement and provider observations are different again. No BalanceHistory authority returns.

## 2. Complete report / derived-view inventory

All /api/v1 endpoints below require the authenticated route group. App /reports renders Reports.tsx with all six choices; Taxes is reachable at /taxes. No production CSV/PDF/XLSX/download/export implementation was found in app/client/commands; TypeScript `export` declarations are not data exports.

| Feature / classification | Route, caller and source | Current economic input / purpose |
| --- | --- | --- |
| Category — ACTIVE PRODUCT REPORT | GET /reports/category?startDate&endDate&c; Reports/Category.tsx→ReportController.category | Legacy Category allocation sum/count, types0/5; selected Categories; UI Amount and Count, not Category current balance |
| Income Vs. Expenses — ACTIVE PRODUCT REPORT | GET /reports/income-vs-expenses; IncomeVsExpenses.tsx→RC.incomeVsExpenses | Monthly signed AccountTransaction movement less Account Transfer attribution; income/expenses/net chart |
| Funding History — ACTIVE PRODUCT REPORT | GET /reports/funding-history; FundingHistory.tsx→RC.fundingHistory | Monthly type2 Category allocation; current Category/group names, excludes Funding Pool rows; UI shows last12 months and totals |
| Budget Progress — ACTIVE PRODUCT REPORT | GET /reports/budget-progress?m=M-yyyy; BudgetProgress.tsx→RC.budgetProgress | Legacy monthly_expenses Category funding plus daily nonfunding spending; running amount and Transaction-ID drilldown |
| Payee — ACTIVE PRODUCT REPORT | GET /reports/payee?startDate&endDate&pc&a; Payee.tsx→RC.payee | AccountTransaction amount/count grouped merchant-or-name/payment channel; types0/5, nonpending, open Accounts; no Category allocation dependency |
| Net Worth — ACTIVE PRODUCT REPORT | GET /reports/networth; NetWorth/NetworthContent→RC.networth | Transaction-linked Account movements/current balance or opening anchor; balance-tracked Statements; no transaction_categories/BalanceHistory |
| Tax actuals/forecast/worksheets — ACTIVE PRODUCT REPORT | GET /taxes/:year, POST /taxes, GET /taxes/categories; State/Taxes and Taxes UI→TaxesController | transactions.taxes + Statements.data actuals; separate forecast Tax.data and client tax formulas, not Category posting |
| Account chart/register — ACTIVE PRODUCT REPORT / derived view | GET /account/:acctId/balances and /account/:acctId/transactions; AccountBalanceChart/State Account | Signed AccountTransaction movements/types0/1/5 for chart; current Account.balance; Statements path for Balances/investment UI; register returns nominal JSON |
| Category register/count — ACTIVE PRODUCT REPORT / derived view | GET /category/:catId/transactions; CC.transactions→Category.getTransactionQuery/transactionsCount | Active nonzero JSON membership; linked Account tracking Transactions and Transaction.date>=Account.startDate OR accountless; pending selection belongs endpoint, not legacy splits |
| Category balance projection — ACTIVE PRODUCT derived view | GET /category-balances?date&id; RebalanceDialog→Category.balances | Current Category.balance minus JSON rows after date, plus excluded target's rows. Projection for editing; not historical-as-posted proof |
| Bills overview — ACTIVE PRODUCT derived view | GET /bills; State/Overview→CC.getBills | Active negative JSON allocations from current month forward, no upper-date boundary or Account eligibility test in this aggregate |
| Funding proposals/goals — ACTIVE PRODUCT derived calculation | GET /funding-plans/proposed?date; FundingPlanController→Budget.getProposedFunding; FundingDialog/calculateFunding | Current balances/config plus active JSON sums from selected month start forward (no upper bound) and goal recurrence; proposal inputs, not an allocation report or quote protocol |
| Funding edit information — ACTIVE PRODUCT derived view | GET /categories?date; Funding/Funding.tsx→CC.get | JSON projection and previous-month expenses/net funding/baseAmount/rebalance snapshots; see below |
| Budget/category tree, pending summaries — ACTIVE PRODUCT derived view | CategoriesController.get/list and Budget.getConnectedAccounts; State/Store/CategoryTree/Accounts | Stored Category balances and AccountTransaction pending aggregates; no relational allocation report. Names/config are current |
| Statement summaries/reconciliation — ACTIVE PRODUCT derived view | Account Statement endpoints, Account UI | Stored Statement ending/start balances, data income fields, linked AccountTransaction debit/credit sums; no transaction_categories join |
| Loan Category report — routed legacy compatibility, financial support unresolved | GET /loans/:catId and /transactions; LoansController/Loan.getProps | Settings read now persists; getProps remains balance0/transactions[] placeholder; commented relational Loan attribution is not active output |
| Rebalance/activity/search/log lists — ACTIVE PRODUCT views | GET /rebalances, /transactions, /transactions/search, /transaction-logs; TransactionsController/Register | Modern Transaction rows/JSON and logs; no legacy allocation aggregate |
| State/Reports.loadReport — DORMANT/LEGACY helper for this UI | Handles netWorth/payee only; actual Reports children fetch directly | Does not make the four affected reports dormant; generic helper payee request lacks required filters and returns[] |
| CheckBalances — INTERNAL/DIAGNOSTIC with explicit repair capability | commands/CheckBalances | JSON-based comparison against Category.balance; --fix/interactive path can save Categories. Do not execute as a report or repair here |
| CheckUnassigned — INTERNAL/OPERATIONAL mutating tool | commands/CheckUnassigned | Finds JSON[] and WRITES an Unassigned JSON row from linked amount; despite diagnostic name, not read-only. No relational write |
| taxes command — INTERNAL/DIAGNOSTIC | commands/Taxes | Hardcoded sample income/brackets and JS calculations, no allocation/DB reader. No tax-law correctness assessment performed |
| Sync/jobs/providers | InstitutionSync/queue/webhooks/OFX command | Posting/diagnostics, no additional report export or transaction_categories report writer found |

The date-qualified CC.get Funding Info branch is a distinct active JSON report input. Its outer Category query scopes the group to Budget; four JSON aggregates select active Transactions: selected-month-start forward (no upper bound) for balance projection; previous month excluding2/3 for previousSum; previous-month type2 for previousFunding and previousBaseAmount; previous-month type3 for previousCatTransfers. No Account pending/startDate eligibility applies to these aggregates. It returns balance minus projected sum and parseFloat numeric previous values. Funding.tsx maps them to initialAmount, previousExpenses, previousFunding, previousBaseAmount and previousCatTransfers; FundingItem displays these distinct concepts. This already separates type2 net amount from pre-transfer baseAmount. No source switch or accepted preview recalculation is proposed here. Budget.getProposedFunding separately scopes its JSON subquery to Transaction Budget and also uses month-start-forward sums, not a month-bounded historical ledger.

## 3. Every active transaction_categories reader

Complete production symbol/table search yields six query sites in two files: five ReportController sites and one CategoriesController admission query. All other server matches are comments; there is no current TransactionCategory model/relation. Client TransactionCategoryInterface means JSON split, not the old model/table.

| Source / columns / grouping | Filters and types | Active consumer; JSON?; financial effect |
| --- | --- | --- |
| RC.category~333: tc.amount/category_id/transaction_id; Category/group names; SUM,COUNT(*) GROUP BY names | g.application_id=actor Budget; selected c.id; t.type0/5; inclusive optional t.date range; no deleted/pending/startDate filter | Category UI; no JSON; read-only |
| RC.incomeVsExpenses~377: LEFT JOIN tc by Transaction and Account Transfer Category ID; subtract tc.amount from at.amount | t.application_id=Budget; Account.tracking Transactions; type!=4 (otherwise any linked type); all dates grouped Transaction year/month; no deleted/pending/startDate/open-Account restriction | Income Vs. Expenses UI; no JSON; read-only |
| RC.fundingHistory~413: correlated tc.amount SUM by Transaction year/month and current Category | Outer g.application_id=Budget, c.type!=FundingPool; inner t.type2, tc.category_id=c.id; no inner Transaction Budget/deleted/date cutoff | Funding History UI; no JSON; read-only; history may be null |
| RC.budgetProgress~441: SUM tc.amount funding total | t.application_id=Budget, month-inclusive t.date, type2, c.monthly_expenses=true, exclude Account Transfer Category | Progress initial funding; no JSON; read-only |
| RC.budgetProgress~458: daily SUM tc.amount and array_agg(t.id) | Same month/Budget/Category restrictions, type NOT2/3/4; no deleted/pending/startDate condition; daily group/order t.date | Progress curve and drilldown; no JSON; read-only; duplicate IDs possible from multiple splits |
| CC.transfer~585: join loan_transactions lt.transaction_category_id→tc.id; filter tc.transaction_id=target.id; first match | Target already freshly scoped/active after Budget gate; supported matching type2/3; structural legacy Loan ownership rejection | Active replacement admission; no amount consumed, not a report; influences whether financial mutation is allowed. MUST retain pending separate deprecation/design |

RC methods use default connections, no owning read transaction, snapshot or Budget gate. Multiple queries can observe different committed states (not a new writer race). TaxesController actuals and net worth likewise have multistatement reads. No point-in-time snapshot contract was found; do not add locks for a source correction.

## 4. Relational writers and retained schema

**ZERO current normal production transaction_categories INSERT/UPDATE/DELETE writers found.** Modern CREATE/PATCH/import/funding/opening never maintains it. TransactionsController's Loan row construction/associate is commented; InstitutionController old transfer helper is commented; Category.syncBalance and Loan.updateBalance/getProps relational code are commented. LoanTransaction still maps transactionCategoryId/principle for legacy schema/ownership. Test fixture writes are TEST ONLY (reports/security deliberately seeds matching rows; admission/Loan fixtures seed ownership); they do not prove synchronization. The one-time1720992448419 migration READS old rows and copies them into JSON, not a request-time dual writer. It catches errors/rolls back; migration presence does not establish successful historical conversion on every installation.

Migration-derived schema, not live inspection:

- 1626492161245 creates id primary key, transaction_id, category_id, amount numeric(12,2), created_at/updated_at.1628345299926 adds nonnull Transaction/Category FKs.1628688426189 adds comment.1667570958555 makes amount nonnull and adds expected numeric(12,2).
- 1721923889149 DROPS Transaction FK; Category FK remains by supplied migration history. No unique(transaction_id,category_id) or equivalent found. Duplicate relational allocation rows ARE representable; relational storage is unordered unless explicitly ordered. There is no automatic soft-delete synchronization with Transaction.deleted.
- LoanTransactions retain FK transaction_category_id→legacy allocation id. These IDs are structural evidence used by active admission, not replaced by JSON array indexes.
- JSON migration copies categoryId/amount/optional comment, uses parseFloat for string money, and does not copy expected or preserve relational row IDs. No ongoing sync exists.
- Historical rows may remain populated; accepted tests seed them. Actual deployed row counts/indexes/schema state were NOT queried. Never infer the table is empty, safe to drop or authoritative historical applied evidence.
- Legacy Category FK can block deletion while a row exists; it has no approved blanket cascade removal. A missing Category with a retained legacy row is not a normal fixture under that FK. JSON alone has no such FK.

**Table classification: C — MIXED / NEEDS PRODUCT DECISION.** Legacy for modern nominal reporting synchronization; still a live structural Loan-admission dependency. No active monetary report has established legacy rows as the intended continuing authority, but legacy-only compatibility/history cannot be silently discarded. A blanket A (remove all use) or table-drop conclusion is unsupported.

## 5. Modern JSON writers/readers and lifecycle matrix

Persisted general shape is ordered `transactions.categories=[{categoryId:number,amount:number,comment?:string},...]`. Transaction model.prepare JSON.stringify writes numbers. Client row id is usually array index, NOT relational allocation ID. Duplicate IDs/order remain meaningful input; additive effects sum duplicate amounts without normalizing stored rows. Unassigned is an explicit Budget-owned Category ID on most normal writer paths, not a null ID.

Type2/3 rows can additionally persist funder:boolean, fundingCategories:[{categoryId,amount,percentage}], includeFundingTransfers:boolean, baseAmount:number. These are allocation/configuration snapshots; type2 posted amount is NET signed row amount, not necessarily gross allocation or pre-transfer baseAmount. Source of transfers is funder/negative rows and current funding metadata. Transactions.taxes is a SEPARATE array `[{type:string,amount:number}]`; UI temporary ids/empty type are not persisted. No Transaction income JSON field was found: reporting income is Statement.data, taxes or signed movement, depending feature.

| Lifecycle / production writer | CREATE authority / later updates | Category posting reader | Relational coexistence / affected reporting |
| --- | --- | --- | --- |
| Ordinary manual type5; AC.addTransaction, TC.update | JSON supplied rows; empty input becomes explicit Unassigned for Transactions tracking; PATCH persists replacement rows/date etc | Separate current Account vs Category eligibility; Category duplicates additive; nominal stored rows survive ineligible dates | New writes have no relational rows; old retained rows can disagree after PATCH; Category/progress legacy reports omit/stale |
| Provider type0 OFX; Account.processOfx | New JSON Unassigned+signed amount; reimport retains explicit splits, computes explicit remainder, date/restore old-new logic | JSON old/new effects, active/date eligibility; Account adds nonpending eligible net; ledger→plaidBalance independent | No relational sync. Reports omit new rows or retain old amounts; do not alter replay/identity/authority |
| Provider type0 Plaid; Account.addTransaction/updateTransaction/autoAssign/assignUnassigned | JSON auto-assignment or Unassigned; user PATCH edits JSON; provider modification/removed/pending lifecycle preserves current approved handling | JSON; date controls Category, pending only Account; initialized/opening separate | No relational sync. A pending-only transition need not change Category contribution, but reports currently have their own pending policy |
| Type2 funding; CC.transfer | JSON zero-sum signed posted net rows plus optional snapshots; replacement reverses old rows and writes new, immutable existing calendar date | Accountless grouped JSON new−old; no Account.startDate | Legacy missing/stale; Funding History/progress miss modern postings; do not substitute baseAmount/gross/metadata for posted net |
| Type3 rebalance; CC.transfer | Same Category row representation, date editable; valid target admission | Accountless JSON grouped deltas | Funding History excludes by type; progress excludes3; Category report excludes3. Generic migration must preserve these distinctions |
| Type4 opening; Account.updateStartingBalance | JSON Funding Pool allocation plus signed AccountTransaction link; updates both representation/date from approved opening formula | Specialized Pool new−old; does not itself add to Account current balance | No relational sync; category/progress/income/fundingHistory explicitly exclude by type selections; net worth uses linked opening, NOT JSON sum |
| Loan-type Account ordinary posting | Current manual/provider JSON may be reachable, but principle/interest special branches differ; Loan legacy model settings create no allocations | Special current Account/Category behavior; do not generalize ordinary effect formula | Category type0/5 report can include its nominal splits; a principal/interest interpretation is BLOCKED/product semantics. Legacy Loan relation is NOT JSON mapping |
| Type1 compatibility | Conditional CategoryTransferDialog/TrxDialog retains modern POST/PATCH name, payload currently lacks required type; direct supported shape admission not established | Existing transfer helper handles input types; no normal new relational writer | Category report0/5 excludes1; progress includes linked/rows1 because NOT2/3/4; income includes linked1. Do not invent type1 money meaning |
| Deleted / restoration | DELETE soft-deletes nominal Transaction; JSON retained, OFX restoration may reactivate/update | Current forward rules differ from unresolved historical reversal | Legacy rows not synchronized with deletion; most affected reports lack deleted exclusion |
| Operational CheckUnassigned | Writes JSON to empty splits; not normal supported automatic writer | Does not prove/report historical effect; do not execute | No legacy write. Earlier shorthand “diagnostic” must not hide its mutation capability |

JSON reader inventory: AC/TC posting, PATCH old/new, current DELETE and startDate; Account provider helpers/OFX/opening; IC cascade nominal reversal (historically ambiguous); CC funding/rebalance/target shape/DELETE membership/Bills/register; Category.balances/register/count; Budget.getProposedFunding; CheckBalances/CheckUnassigned; Transaction response serializer; State.Transaction/categories/taxCategories/getAmount; split/funding/rebalance editors and register display. These are posting, lifecycle admission, projections, operational tools and nominal UI—not all reports. None makes JSON proof of historical applied effects. Complete source search found no hidden active TransactionCategory preload/model reader beyond the six queries above.

## 6. Per-report policy and inclusion matrix

“Current” means source behavior. Neither lack of a filter nor a test of tenant scope approves a broader financial policy.

| Report | Current date/types/deleted/pending/pre-start | Economic interpretation / desired authority candidate |
| --- | --- | --- |
| Category | t.date inclusive optional range; only0/5; deleted INCLUDED; no Account join/pending/startDate test | Current nominal Category attribution is the clean candidate: UI Amount/Count and security fixture assert10 for Category.balance20, so not current balance or proved historical ledger. MODERN JSON NOMINAL ALLOCATION, preserving selection initially. If product wants applied spending, explicit eligibility/type/sign policy is required |
| Funding History | t.date month/year (all queried history; UI last12); type2 only; deleted INCLUDED; no Account context; current Category names; Pool excluded | Current type2 net posted allocation by immutable funding date, not base/gross/quote or historical-as-originally-posted. MODERN JSON NOMINAL ALLOCATION specialized to2. Editing changes nominal history at retained date; historical-as-posted would need evidence not stored here |
| Income Vs. Expenses | All t.date months; linked Accounts tracking Transactions; type!=4; deleted/pending/pre-start INCLUDED; no Account.closed filter | SPECIALIZED LIFECYCLE DATA: AccountTransaction.amount ONCE per intended movement, subtract aggregate current Account Transfer JSON allocation ONCE. Source comment explicitly says transfers are removed. Sign is classified using ORIGINAL at.amount, before subtraction; treatment of net sign flips, Loans, multi-links and pending/deleted needs policy before broader correction |
| Budget Progress | Selected Transaction calendar month; type2 funding; daily NOT2/3/4; c.monthly_expenses true; no status/Account eligibility filters | Candidate current nominal month funding plus spending, NOT historical applied balance. BLOCKED — PRODUCT SEMANTICS REQUIRED: flag still exists in migration but absent Category model/current create/update/UI persistence. Optional monthlyExpenses remains in Category validators and UpdateCategoryResponse typing, which does not make it persisted configuration. What defines expense Categories now? Also decide ordinary spending/special shapes and zero-funding/empty-day handling |
| Payee (unaffected source) | t.date range, type0/5, pending=false, open Accounts; deleted/pre-start INCLUDED | Account movement merchant/channel attribution, not Category splits. Keep AccountTransaction source. Deleted selection is an independent policy question; no automatic ordinary eligibility change |
| Tax actuals (unaffected source) | Transaction.date tax year/month; all types/deleted/pending/pre-start currently eligible if taxes present. Statements filtered by START date in year, grouped END month; retirement subtypes excluded | SPECIALIZED LIFECYCLE DATA: explicit taxes and Statement income data, not Account Transfer/category amounts. Date/status selection and type mapping require separate tax product authority, not this migration |
| Net worth/chart (unaffected source) | Existing source-specific Account/Statement/opening filters; accepted opening history has current startDate anchor, active/nonpending movements | SPECIALIZED LIFECYCLE DATA; retained accepted behavior. No relational Category source to switch |

Category report count is currently allocation ROW count, not proven distinct Transaction count. Grouping is by current group/category NAME, not ID; duplicate names can merge where schema/data permits. Income transfer LEFT JOIN can fan out Account movement when duplicate relational Account Transfer rows exist. Funding sum must sum duplicate JSON amounts; it must not count baseAmount in addition. Progress array_agg can duplicate Transaction IDs. These are explicit design edges, not permission to normalize JSON or change output grouping/count.

## 7. Reproduced omission, disagreement and join-cardinality cases

New tests/unit/reports/allocationAuthority.spec.js compiles actual current RC methods against an inert adapter for the known join/filter/aggregate subset. No ORM/app bootstrap or PostgreSQL SQL execution occurs. Source capture confirms exact tables/predicates; fixture arithmetic is a characterization of that subset, not a claimed PostgreSQL plan/result.13 focused cases pass initially.

For ordinary Category10 allocation50:

| Case | Current Category report | Current income-transfer/funding implications | Decision boundary |
| --- | --- | --- | --- |
| A relational50=JSON50 |50,count1 | Matching rows can mask missing writer sync | Both representations agreeing does not prove a sync contract |
| B relational missing, JSON50 | No row (NOT Category.balance50 or JSON50) | JSON-only transfer50 on movement50 leaves income50 instead of transfer-free0; type2 JSON10 cannot appear in legacy funding subquery | Confirmed wrong/incomplete source, not float precision |
| C relational50, JSON[]/missing |50,count1 | Legacy still contributes; switching source may remove it | Legacy-only compatibility/empty JSON semantics require policy; never infer/repair/backfill |
| D relational20, JSON50 |20,count1 | Reimport/PATCH can leave stale report values; transfer deduction stale | Current nominal candidate is JSON50; historical application still unknown |
| E JSON20+30 sameCategory, no relational | No row | Future SUM must50; preserve duplicate rows. Relational schema also permits duplicates | Count policy can remain row-count2; distinct-Transaction count requires decision |
| F missing Category | INNER JOIN drops row; requested missing filter ID fails404; Funding History enumerates existing Categories only | JSON can survive deletion when active nonzero usage no longer blocks; old relational Category FK normally prevents deleting its parent | Historical naming/orphan bucket cannot be invented. Test missing-Category legacy fixture is conceptual, not a valid FK bypass |
| G Unassigned remainder | Omitted if remainder JSON-only; stale if old relational values differ | Explicit Unassigned JSON is a real allocation; included by source report policies if that Category is selected/eligible for that report | Do not drop, synthesize or replace IDs with null; JSON[] does not universally mean legacy allocation |

Additional source-executed example: movement50 with TWO legacy transfer rows20/30 yields `(50−20)+(50−30)=50`, whereas once-per-movement minus total transfer is0. This is join-cardinality logic, independent of precision. Future JSON expansion must aggregate transfer rows per Transaction before joining movements; otherwise a supposedly modern query can repeat the same error.

Deleted+pending+pre-start ordinary fixture still reports legacy50 because RC.category has none of those predicates. This proves CURRENT inclusion, not intended applied-effect reporting. Funding History raw SQL ignores JSON/baseAmount and filters type2; modern funding omission is a direct source proof, not a newly executed DB test.

## 8. Security findings — separate from authority

**Confirmed query-scoping defect with a conditional legacy-data precondition:** RC.category constrains Category/group Budget but does not constrain t.application_id. A relational row linking an owned Category to another Budget's type0/5 Transaction passes its data query. The inert method fixture demonstrates an aggregate90 from such a linkage despite a valid owned Category filter. HTTP filter-ID validation does not fix that join predicate. This is not a demonstrated supported API exploit: no current allocation writer was found that creates this linkage; it needs legacy/inconsistent data or privileged fixture creation.

RC.fundingHistory has the same incomplete inner scope: outer owned Category, inner Transaction joined by ID/type with no Budget condition. Future predicates must scope BOTH owning Transaction and Category/group, never trust historical linkage coherence. A valid legacy row is not a substitute for a tenant predicate. This can be corrected before exact-money with no product choice about tenant isolation. It remains UNFIXED here.

Progress scopes Transaction Budget but not Category/group Budget; inconsistent cross-Budget allocation can let another Budget's monthly_expenses flag affect output. Income Vs. Expenses scopes Transaction Budget but not the linked Account/Institution owner; Payee scopes Account/Institution and selected IDs but lacks a separate Transaction Budget predicate. These are conditional join-coherence gaps needing adversarial DB fixtures; do not claim a normal supported writer can exploit them. Net-worth ownership is bounded through scoped Account/Institution sources; accepted filter/security tests remain evidence for their tested shape only.

CC.get date-qualified Funding Info also scopes outer Category/group but its four JSON Transaction aggregates lack an explicit Transaction Budget predicate. Cross-linked JSON can therefore affect those projections; no normal writer creating such a foreign linkage was demonstrated. Treat this as a separate conditional scoping audit, preserving accepted funding calculation semantics.

Existing reports/security.spec.ts seeds relational rows matching JSON and Budget ownership, validates selected IDs, binds filters, and asserts no foreign results. It does NOT cover cross-linked relational rows or JSON-only completeness. No live data or foreign resources were accessed in this task.

## 9. Tax, income, Statements and Loan separation

TaxesController.getActuals reads explicit Transaction.taxes via jsonb_to_recordset(type varchar,amount real), groups Transaction date month/type, and adds independently aggregated Statement.data (long/short gains, dividends, interest). Statement selection uses startDate within year while grouping by endDate month; no tracking filter or startDate posting eligibility is imported. Pending/deleted filters are absent. These semantics are not corrected here, and the SQL real casts are representation concerns. Forecast Tax.data is separate user input; global TaxCategory definitions are lookup metadata, not Budget financial rows. Client State/Taxes accumulates monthly actuals into cumulative3/5/8/12-month periods and applies tax/rate formulas. Do not infer tax attribution from Category names, positive allocations or type2 funding.

No active allocation report joins Statements to transaction_categories. Statements' balance authority and reconciliation remain unchanged. Net worth consumes Statement ending balances or signed AccountTransaction/opening histories; category JSON migration should not affect it. Loan getProps remains a legacy placeholder; modern Loan Account principal metadata is not the same as tc.amount. Any report claiming principal/interest/payment decomposition is BLOCKED by the separately unresolved Loan lifecycle; type0/5 inclusion alone proves only nominal allocation/movement, not that decomposition.

## 10. Intended correction boundary / per-report final classification

| Active affected report | CURRENT AUTHORITY | DESIRED AUTHORITY candidate | CONFIRMED DEFECT? | PRODUCT DECISION? | CAN FIX BEFORE EXACT-MONEY? | HISTORICAL LIMITATION? |
| --- | --- | --- | --- | --- | --- | --- |
| Category | Legacy allocation amount/row count | MODERN JSON NOMINAL ALLOCATION for current attribution | Yes: missing/stale modern rows; separate conditional tenant gap | Broader applied-vs-nominal/deleted policy and legacy-only exceptions; do not change count/name semantics silently | Yes, bounded current-nominal source correction with existing filters/count/grouping frozen and both Budget predicates; broad legacy-only rollout needs decision | Cannot reproduce past applied/as-posted effects or old names |
| Funding History | Legacy type2 Category monthly sums | MODERN JSON NOMINAL ALLOCATION, specialized type2 NET rows | Yes: modern funding absent/stale; conditional tenant gap | Legacy-only/deleted inclusion and any historical-as-posted claim; gross/base would be different report | Yes for current nominal funding, preserving immutable date/net/Pool exclusion; not a gross/history reconstruction | Replacement erases old nominal allocations; metadata baseAmount is not prior applied effect |
| Income Vs. Expenses | Account amounts minus legacy Account Transfer join | SPECIALIZED LIFECYCLE DATA: movement plus grouped modern transfer attribution | Yes: JSON transfer not deducted; duplicate legacy join can multiply movement | Classification before/after subtraction, pending/deleted/pre-start and Loan/multi-link handling must be explicit | Clean numeric source correction is possible; full definition should be settled before implementation; no reason it requires exact-money | Cannot recover previously applied transfer attribution from current nominal rows |
| Budget Progress | Legacy funding/spending under monthly_expenses | BLOCKED — PRODUCT SEMANTICS REQUIRED; then specialized nominal funding/spending candidate | Yes: omitted JSON amounts, stale configuration source; null sum can propagate NaN | Supported expense-selection source, inclusion and no-funding behavior | Yes technically with current JSON after product choice; DO NOT substitute every regular Category for flag | Not historical Category.balance; stored balance offsets/provenance cannot be inferred |

No report here is approved to use CURRENT APPLIED-EFFECT CALCULATION merely because Category.balance uses it. If that is chosen, implementation needs lifecycle-aware Account/link/pending/type rules and explicit historical limitations; it must not just reuse accountEligible (which wrongly suppresses pending for Category reporting). LEGACY RELATIONAL ALLOCATION has no demonstrated current synchronization contract for normal report money; retaining its structural admission use is a separate matter.

## 11. Names, missing IDs, duplicates and Unassigned

Reports currently resolve names from current Category/group rows, so renaming changes report labels for old dates; historical names are not stored in normal split JSON. The Category register resolves current names through State.CategoryTree; getCategoryName throws on unknown IDs, while Transaction construction preserves IDs/numbers without a referential lookup and getAmountForCategory sums matching duplicate rows but falls back to the whole Transaction.amount if no row matches. That display/helper fallback is not a generic report-attribution rule. Do not promise universal graceful orphan rendering. Normal CREATE/PATCH/funding validate owned Categories after Budget gate; provider missing Category lookups can reject and roll back; legacy reads may silently drop via INNER JOIN.

Current Category DELETE gates active nonzero JSON usage, not historical existence; deleted/zero allocations can remain after deletion, subject to separate remaining FKs. Future report choices are inner-join/current selection versus explicit Unknown/deleted bucket, not “convert to Unassigned.” No names/IDs/JSON are normalized here. Both old relational and JSON can hold duplicate Category IDs, but only JSON naturally retains ordering/current metadata. Aggregate sums additive; COUNT and drilldown multiplicity need deliberate preservation or approved change.

## 12. Monetary/API/client inventory

| Boundary | Classification / current representation |
| --- | --- |
| transactions.categories[].amount; taxes[].amount; Statement.data income | POSTED/ATTRIBUTED ACCOUNTING MONEY, JSON numbers; reporting attribution is not necessarily posting authority |
| tc.amount/expected; AccountTransaction.amount; Account/Category/Statement balances | Money numeric storage; ORM parseFloat/JS number or raw numeric SUM strings. expected is legacy metadata, not consumed by current reports |
| RC.category/payee sums | READ-SIDE AGGREGATION, SUM cast float; responses number sum, integer count; rowNumber SQL bigint can be string; group/category/name/channel strings |
| Income Vs. Expenses | READ-SIDE subtraction/SUM, parseFloat income/expenses and JS net addition; `[month,income,expenses,net]` numbers |
| Funding History | json_agg/json_build_object year/month/amount; aggregate numeric embedded as JSON number, history null when absent; client sums totals with += and compares toFixed(2) |
| Progress | SQL numeric SUM→parseFloat; runningBalance JS +=; `[date,number,transactionIds[]]`; no funding SUM can parseFloat(null)→NaN and JSON null. Client fills missing days with prior row/first0; don't change without characterization |
| Net worth/chart | SUM/window arithmetic/crosstab FLOAT; parseFloat chart, mixed date/string-number arrays, client gap filling/sign/total arithmetic; read-side precision deferred |
| Tax actuals | SQL ::real / recordset amount real, SUM and JS/client period additions; numeric JSON actuals/forecast and worksheet number arithmetic |
| Funding metadata | baseAmount/fixed monetary targets are snapshots/config; percentage fields are PERCENTAGE/RATIO, not cent money; do not sum them as postings |
| Formatting | Amount/NumberFormat, toFixed(2), chart display are DISPLAY ROUNDING, not storage/ingress policy |

Client Category/Payee components store server result rows and format Amount without reconstructing allocation authority. FundingHistory recomputes column totals from server history; BudgetProgress fills day gaps and drills down IDs; IncomeVsExpenses inserts chart headers, not allocation sums. State/Reports' narrow data type does not describe every active component; actual components have their own interfaces. No monetary response/client type changes are proposed here. Binary artifacts and PostgreSQL real/FLOAT hydration belong to the later storage/API inventory; authority omission and join fan-out are independent logic defects.

## 13. Performance and concurrency design

A future JSON query should scope Transaction Budget/type/date BEFORE lateral expansion, expand only needed rows, then join/validate Category ownership. Sum duplicate rows, and aggregate Account Transfer per Transaction BEFORE joining AccountTransaction amounts. Do not UNION old and new rows or add both representations; that doubles A and can preserve D's stale allocation. Legacy-only fallback needs its explicit policy, not a convenient COALESCE of unrelated histories.

Current supplied migrations show primary-key indexes but no allocation-pair uniqueness, report-specific Category/date index or declared GIN index for Transaction JSON. FKs do not prove indexes; live/external indexes and row counts are unknown because no DB query occurred. JSON expansion changes plan shape to Transaction filtering + per-array work; worst-case work grows with selected Transactions×splits. Date/Budget indexes and EXPLAIN should be evaluated during separately authorized verification, not guessed now. No new schema/index is required by this design; no benchmark or planner result is claimed.

Reports use nonlocking default queries; no point-in-time snapshot guarantee is established. Do not join Budget writer gates just to change attribution authority. If snapshot coherence becomes a product requirement, choose a separate read-transaction/isolation contract rather than serializing all reports with posting. This task changes neither writer protocol nor report transactions.

## 14. Future PostgreSQL behavioral matrix — design only, NOT RUN

Use only fresh task-specific authorization and independently safeguard configured/live pg, pgLog and each destructive execution connection before setup/fixtures/temporary objects/every cleanup. Do not bootstrap existing DB suites now. Expected inclusion must be signed off per report before converting this matrix to acceptance tests.

| Group | Required future assertions |
| --- | --- |
| Manual modern-only | CREATE type5 JSON-only; Category sum/count match nominal rows under approved filters; no need to backfill relational storage |
| Matching / disagreement / legacy-only | A–D cases; never double-count; JSON-current choice explicit; C handled only by approved compatibility policy; raw data unchanged |
| OFX | New Unassigned, explicit user PATCH, reimport modification/restoration; current JSON rows reflected; replay zero accounting effect does not duplicate report attribution |
| Plaid | Auto-assignment/Unassigned, user edits, amount/date/pending transitions, removed/local-deleted policy; distinguish movement and reporting attribution |
| Eligibility matrix | Before/equal/after Account.startDate × pending/nonpending × active/deleted; assert REPORT contract separately from unchanged Account/Category effects |
| Type2 | Fixed/percentage/goal/mixed/transfers/residual/Pool; net amount versus base/gross/snapshot; original funding date retained through replacement; no type2-as-income invention |
| Type3 / opening | Preserve report-specific exclusion/inclusion; do not count rebalance as ordinary expense or type4 as income; opening/chart/net-worth independent |
| Loan/type1/multiple links | Characterize only approved nominal facts; block any unapproved principal/interest decomposition or movement duplication |
| Duplicates | Repeated same Category rows additive; approved count semantics, names/IDs grouping, Account Transfer rows aggregated before movement join; no stored JSON reordering |
| Unassigned | Explicit remainder included by approved Category selection; JSON[] separate from legacy-only fallback; no synthetic remainder in generic reports |
| Category rename/deletion | Current names by default; missing-ID policy approved; JSON-only deleted/zero history; Category FK compatibility means some legacy orphan fixtures are not representable normally |
| Tax/income | Transaction taxes and Statement income unchanged; type/date/status policy separately defined; no accidental tax sum from Category funding rows |
| Security | Foreign selected IDs, own Category→foreign Transaction relational/JSON link, own Transaction→foreign Category, cross-linked Account; all ownership boundaries checked and no foreign value/label leakage |
| Progress | Supported expense selector, no funding/null SUM, no activity/first-day/gap days, end-of-month boundaries, drilldown IDs and duplicates |
| Dates | Inclusive selected range, year/month rollover, Transaction vs Statement start/end dates unchanged, immutable funding replacement month |
| Precision/regressions | Current numbers/storage/API preserved; no new rounding; accepted posting/concurrency/Loan/deprecations/net-worth/Statement/tax regressions unchanged |

No mutation/backfill, historical reconciliation, provenance, schema cleanup or tax-law redesign is part of these report tests. No historical balance expected value may be inferred from a nominal fixture alone.

## 15. Implementation sequencing and acceptance boundary

1. Confirm the narrow current-nominal scope and freeze current filter/count/name behavior for Category/Funding History, or choose the explicit alternative applied/history contract. Resolve legacy-only compatibility before a broad data rollout; do not infer migration success from metadata.
2. Correct tenant predicates as an independent security requirement. Add adversarial join-coherence fixtures, not only filter-ID validation.
3. Implement narrowly scoped Category/type2 Funding History authority using current JSON numeric rows; retain wire shapes, selection ranges, type exclusions, duplicates and net funding/date semantics. Do not touch posting or the relational table/Loan ownership path. This is cleanly separable from exact-money; future representation work can change amount extraction later.
4. Settle Income Vs. Expenses classification and Budget Progress expense-selection/null behavior, then implement specialized movement/transfer and progress queries. Do not apply a generic Category-balance helper to all reports.
5. Run fresh-authorized DB matrix plus accepted regressions; no runtime implementation is authorized by THIS design task. Keep relational retention/schema cleanup, tax decisions and historical-as-posted reporting separate.

Conservative readiness: current nominal facts and the source-omission defect are sufficiently clear to design/test the bounded candidates BEFORE representation migration. The unresolved policies do not disappear by converting money to exact storage. The broader “every report becomes financially correct by reading JSON” claim is rejected. This document is input to product approval, not approval to rewrite reports.

## 16. Verification record

New characterization tests execute actual Category/income report method bodies through inert adapters and capture source policy/reachability. They establish matching/missing/stale/empty/duplicate allocation behavior, missing-Category conceptual joins, current deleted/pending/pre-start inclusion, conditional cross-Budget predicate gap, JSON-only transfer leakage and duplicate-transfer join fan-out. Source boundaries also verify all four active reports, type2 net history, monthly_expenses dependency and separate tax/net-worth sources. They do not execute SQL, migrations, application/bootstrap or a database connection.

Verification completed: 13 new characterization tests pass; the combined standalone selection passes161 tests,0 failed,0 skipped/pending (report authority/net-worth validation, ordinary eligibility, OFX authority, replacement admission, BalanceHistory boundaries, funding preview and rounding). Both server/client TypeScript checks, ESLint, Knip and circular regression pass. Circular audit retains the accepted11-model/26-edge component with no unexpected cycles (410 files/487 repository nodes). Normal and staged diff whitespace checks pass, including explicit checks of the two new untracked files. No builds or DB/full-suite runs were requested or performed. No new warnings were emitted; the accepted model cycle and Node builtin list are informational. No runtime behavior, accounting eligibility, tax semantics, data, money representation, schema, deployment or commit changed. No DB connection or destructive DB operation occurred. Existing user work and index were preserved.

## Approved bounded implementation follow-up

Product subsequently approved exclusive JSON authority for Category/current nominal and Funding History/type2 net. Legacy-only allocation rows are intentionally omitted from these two reports; empty JSON contributes no attribution, with no relational fallback. Missing Category behavior preserves scoped current-name inner joins. Existing selection/count/order/API semantics remain; current Transaction and Category ownership are explicitly scoped. See [implementation](category-funding-history-report-authority-implementation.md). Runtime implementation is now PostgreSQL-accepted:43 narrow/1,656 focused/1,697 full-suite passes,0 failed/skipped; see [verification](category-funding-history-report-authority-postgresql-verification.md). Task-specific authorization is expired. Earlier inventories are design-stage source snapshots; current remaining active legacy queries are Income Vs. Expenses (one), Budget Progress (two) and structural Loan admission (one). No table cleanup follows from this correction. Earlier unresolved legacy-only statements above are historical design-stage findings superseded for these two reports only. Income Vs. Expenses and Budget Progress remain unchanged and separately blocked; structural legacy Loan ownership use remains.

Product decisions required before allocation-report authority correction

- Define the report contract beyond the narrow current-nominal source correction: which reports intentionally include deleted, pending and pre-start rows, and whether any require historical-as-posted/applied effects rather than current attribution. Do not derive that from Account posting eligibility.
- Category/Funding History legacy-only policy is now resolved: exclusive JSON, no fallback. A future change to current-name INNER JOIN missing/deleted Category labeling would require separate approval; it does not block this bounded implementation.
- For Income Vs. Expenses, establish movement/sign classification after transfer subtraction and inclusion of pending/deleted/pre-start, Loan and multi-link shapes; preserve Account Transfer exclusion without fan-out.
- For Budget Progress, identify the supported replacement or intended use of monthly_expenses, define funding/spending type set and no-funding/no-activity behavior. No current UI/model setting supplies that legacy flag.
- If changing current Category report Count/grouping, choose allocation-row versus distinct-Transaction count and ID-versus-current-name grouping. These changes are NOT prerequisites to a narrowly approved source-only correction that preserves current behavior.
