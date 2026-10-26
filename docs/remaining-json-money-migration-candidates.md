# Remaining application JSON money: narrow candidate review

October 23, 2026. Source baseline: `f92024df6bd6276d400d7552aa8fc95b13d179e1`, branch `dollar-to-cents-2`.

**Recommendation:** select `transactions.taxes[].amount` for the next separately approved design/audit slice; second choice is the four `statements.data` income-attribution fields. Both have established reporting authority and bounded writers without controlling ledger posting. Neither recommendation authorizes storage rounding or historical conversion. Their server contracts currently accept fractional cents, so a cent policy must be approved before implementation.

This is candidate selection, not an implementation prompt or migration procedure. Read the [remaining storage inventory](remaining-monetary-storage-inventory.md), monetary scope, accounting invariants, correctness readiness, completed Category storage design/implementation/PostgreSQL verification, and historical readiness records. Current source/tests take precedence over dated status text. No live schema, records or financial services were accessed.

## Baseline, exclusions and completed work

Entry status: staged `.gitignore` modification and staged addition of `docs/remaining-monetary-storage-inventory.md`; no tracked unstaged changes. Existing untracked editor configuration, SQL dumps, PEM and assorted local test/report files were left untouched. Their contents were not used as historical financial evidence. The staged diff SHA-256 was `4424d95b30dbaa214f3e9d29c5e5fcf5b83ff368630b3867951288c54a33bc6e` and remained unchanged after review.

Loans and **every** `transaction_categories` dependency are excluded regardless of purpose. No compatibility design for deprecated code is included. BalanceHistory is also retired from active accounting. Original application-release rollback and historic data-recovery scenarios are outside this ranking.

`transactions.categories[].amount` is **COMPLETED — DECIMAL-STRING STORAGE**, with accepted staging/production conversion and numeric runtime/API behavior. All 10,474 eligible production allocation values are canonical strings, per the operator-accepted results. Temporary numeric/string/mixed readers remain supported. This review does not reopen conversion, rounding, conservation or eligibility. Optional funding metadata beside the completed outer amount remains independently numeric.

## Reconciliation and counts

The existing **21 application/configuration JSON money paths are all present in current source**: 4 Transaction/configuration paths + 4 Statement paths + 13 forecast paths. No stale or duplicate path was found. Repeated names in different columns or nesting levels are distinct storage locations. Percentage-mode variants are not extra monetary paths.

- **0/21** have a universal server-enforced cent-only storage contract or an approved new storage-rounding rule demonstrated by current source.
- **18/21** are final entered/reporting/forecast amounts with a plausible narrow currency boundary: Transaction tax amount (1), Statement attribution (4), tax forecasts (13). Their broad API input precision still requires an explicit decision.
- **3/21** are coupled to funding configuration/reconstruction: fixed live rule (1), fixed rule snapshot (1), baseAmount (1). Existing round-on-use and goal/transfer calculations require additional compatibility analysis before quantizing stored values.
- **21/21** therefore require approval of permissible cent scale/input and historical treatment before any mandatory two-decimal conversion. This is a path count, not 21 unrelated policy questions: one coherent decision can cover a proposed group.
- Two of the 21 paths are polymorphic money/percentage fields. The separate relational auto-assignment field is a third polymorphic location, outside these 21.

The zero count is not a claim that amounts lack monetary meaning. It distinguishes clear dollar semantics and a cents-oriented editor from a universal approved precision constraint. No source demonstrates that any of the 21 must intentionally retain subcents forever; no source proves subcent values may safely be discarded either.

Roles below use this task's A–H definitions, not the inventory's storage classifications: A posting money; B financial configuration; C nominal Transaction metadata; D snapshot/observation; E recomputable cache; F reporting attribution; G mixed money/rate configuration; H unknown. No reviewed path is direct A posting authority, no path is merely an E cache, and none has unknown monetary meaning. Unknown historical *contents* do not make known semantics H.

## Shared persistence profiles

Each path in the next table has one of these complete reader/writer profiles. Counts refer to **named mutation entry points and functional read-boundary families**, not an AST call count including generic ORM/serialization calls. This makes reader breadth comparable without claiming every shared serializer invocation is a separate financial algorithm.

| Profile | Writers / validation / persistence | Readers / arithmetic / API | Historical shape and authority |
| --- | --- | --- | --- |
| FC | **2 mutation entry points:** `CategoriesController.addCategory/updateCategory`; `addCategory/updateCategory` validators accept numeric amount + boolean mode; percentage validator applies only to percentage rules. `Category.fundingCategories` uses JSON.stringify. No money cent-scale normalization. JSONB column NOT NULL DEFAULT `[]`. | **3 read families:** Category GET/model serialization and client Category state/settings; `Budget.getProposedFunding`/FundingPlan proposed response; `calculateFunding.computeSpread` and FundingDialog/CategorySpread. Runtime/API numbers. Fixed amounts round with `Math.round(rule.amount * 100)` on use, not save. | Empty arrays valid, duplicate ordered rules possible; malformed/missing historical mode unknown. Mutable financial configuration, role G (money mode B). |
| BM | **1 mutation entry point:** `CategoriesController.transfer`, both CREATE/replacement, numeric optional `baseAmount`; mapped into outer allocation metadata; completed allocation codec shallow-copies it unchanged. | **3 families:** Transaction model/API and State.Transaction; FundingDialog edit reconstruction/calculateFunding; `CategoriesController.get` prior-month SQL `sum(coalesce(baseAmount,0))` then numeric response. Runtime/API number. No save-time cent rounding of base. | Optional, may be missing; client fallback `baseAmount ?? amount`. Existing explicit `1.005` preservation tests. Requested funding snapshot, role C; not net/Pool reversal authority. |
| FS | **1 mutation entry point:** same transfer CREATE/replacement, optional nested numeric/percentage rules validated with fundingPercentage rule; outer amount codec preserves nested metadata. | **2 families:** Transaction API/State.Transaction/FundingDialog reconstruction; calculateFunding/computeSpread and CategorySpread. Runtime/API numbers; fixed money rounds to cents when used. | Optional array snapshot, duplicates/order matter; can differ legitimately from current live Category rules. G (money mode B/C). |
| TT | **1 mutation entry point:** `TransactionsController.update` consumes optional `taxCategories`; retains entries with nonempty `type`, copies number amount into `transaction.taxes`; model JSON.stringify. Vine number, no server cent check. Column JSONB NOT NULL DEFAULT `[]`. | **2 families:** Transaction responses/edit state/dialog; `TaxesController.getActuals` monthly/type SQL SUM feeding client Taxes actuals and worksheets. Numeric API, read SQL declares recordset `amount real`. No posting balance adjustment uses taxes. | Ordered array, duplicate tax types and empty arrays supported by current shape; missing/null/malformed historical values unknown. F attribution, not ordinary allocation authority. |
| SI | **2 mutation entry points:** `AccountsController.addStatement/updateStatement`; numeric `data` supplied as a whole optional object, four numeric fields required when present. Model data is native JSONB. No cent rounding. Offline initial Statement paths store `data:null`, not monetary values. | **3 families:** Statement list/model serialization + CREATE/PATCH DTOs/client State.Statement; StatementDialog/View; TaxesController.getActuals SQL extraction/SUM feeding tax state/worksheets. Runtime/API numbers. Four SQL `->>` text extractions cast to real. | Nullable column and omitted data; response defaults missing income to zero without writing zero. D user-entered snapshot with F reporting use. Not Statement ending-balance authority. |
| TF | **1 mutation entry point:** `TaxesController.post` upserts forecast through Tax within Budget transaction; `addTax` validates numeric leaves, not two-decimal scale. JSONB data NOT NULL. | **2 families:** TaxesController.get/post forecast response and State.Taxes load/save; tax form components and Income/Worksheet2_1/Worksheet2_9/Estimated calculations. Runtime/API numbers. No storage quantization. Client input event handlers parseFloat raw strings; derived tax results are not persisted as these fields. | Ten required direct forecast inputs; optional estimated object has three required fields when present. Mutable by Budget/year. D user-entered forecast/snapshot inputs, used as configuration for derived reporting; not posted tax liability. |

Sources: [Category](../app/Models/Category.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [category validator](../app/validation/Validators/category.ts), [categoryTransfer validator](../app/validation/Validators/categoryTransfer.ts), [Transaction](../app/Models/Transaction.ts), [TransactionsController](../app/Controllers/Http/TransactionsController.ts), [transaction validator](../app/validation/Validators/transaction.ts), [Statement](../app/Models/Statement.ts), [AccountsController](../app/Controllers/Http/AccountsController.ts), [statement validator](../app/validation/Validators/statement.ts), [Tax](../app/Models/Tax.ts), [TaxesController](../app/Controllers/Http/TaxesController.ts), [tax validator](../app/validation/Validators/tax.ts).

## Reconciled field-by-field evaluation

All 21 currently persist **JSONB numeric leaves**, hydrate to JavaScript numbers, and expose numeric API amounts. Optionality and historical unknowns are given in the profile above. No provider importer, job or CLI was found assigning a nonempty tax/Statement/forecast value independently of those profiles; initial/imported Transactions can start with empty taxes. Read-only diagnostic scripts and fixture writers are not additional production mutation entry points.

| # | Table / column / property path | Role | Profile | Monetary meaning and cent suitability | Candidate disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | `categories.funding_categories[].amount` (percentage=false) | G/B | FC | Fixed funding rule, already rounded to cents at application time; rounding storage is not yet equivalent to preserving all funding behavior | Defer; precision decision plus funding replay |
| 2 | `transactions.categories[].baseAmount` | C | BM | Requested pre-transfer base; can retain subcents, goal proposal or binary calculation artifact; need not equal net allocation | Defer; explicit metadata precision decision |
| 3 | `transactions.categories[].fundingCategories[].amount` (percentage=false) | G/B/C | FS | Historical fixed rule snapshot; used again when editing; not the posted signed allocation | Defer; paired rule/reconstruction decision |
| 4 | `transactions.taxes[].amount` | F | TT | Entered tax attribution amount (e.g. benefits/payments); cents-oriented delta editor, broader numeric API | **First candidate**, conditional cent policy |
| 5 | `statements.data.shortTermCapitalGains` | D/F | SI | Entered short-term gain/loss snapshot; no per-share price/intermediate in this path; subcent input still allowed | **Second candidate group**, conditional cent policy |
| 6 | `statements.data.longTermCapitalGains` | D/F | SI | Entered long-term gain/loss snapshot; same precision boundary | Second group |
| 7 | `statements.data.dividends` | D/F | SI | Entered distribution total, not a rate or per-share unit; SQL maps to ordinaryDividends | Second group |
| 8 | `statements.data.taxableInterest` | D/F | SI | Entered interest total; provider fractional-unit policy cannot be inferred from its currency label | Second group |
| 9 | `taxes.data.taxableInterest` | D | TF | Forecast input, not monthly actuals; user may enter estimated fractional dollars | Defer larger forecast object; cent policy |
| 10 | `taxes.data.qualifiedDividends` | D | TF | Forecast qualified distribution amount; later annualized/calculated with numbers | Same |
| 11 | `taxes.data.ordinaryDividends` | D | TF | Forecast ordinary distribution amount | Same |
| 12 | `taxes.data.taxableIraDistributions` | D | TF | Entered taxable distribution forecast; retirement income is not deprecated Loan functionality | Same |
| 13 | `taxes.data.taxablePensionAndAnnuities` | D | TF | Entered pension/annuity forecast | Same |
| 14 | `taxes.data.taxableSocialSecurityBenefits` | D | TF | Forecast taxable benefits; independent from Transaction tax actuals | Same |
| 15 | `taxes.data.additionalTaxableIncome` | D | TF | Additional forecast income amount | Same |
| 16 | `taxes.data.shortTermCapitalGains` | D | TF | Forecast gains/losses; tax loss limits apply downstream, not storage cents | Same |
| 17 | `taxes.data.longTermCapitalGains` | D | TF | Forecast gains/losses; downstream gains worksheets do not define stored precision | Same |
| 18 | `taxes.data.qualifiedBusinessIncomeDeduction` | D | TF | Entered deduction amount, not the deduction percentage or recomputed worksheet output | Same |
| 19 | `taxes.data.estimated.expectedAgi` | D | TF | Entered expected AGI used by Worksheet2_1; not its resulting calculated tax | Same |
| 20 | `taxes.data.estimated.priorYearAgi` | D | TF | Prior-year user observation, used for estimated-tax calculations | Same |
| 21 | `taxes.data.estimated.priorYearTotalTax` | D | TF | Prior-year tax observation, not a new tax computation result | Same |

`baseAmount` is a JSON property, not a standalone transactions column. Statements' starting/ending balances and Category fundingAmount/goal money are relational numeric columns and not additional JSON paths. Funding Pool is already an outer Category allocation. No separate active persisted JSON transfer total or recurrence money was found. Category goal proposals may feed baseAmount but are not a new stored goal JSON field. These distinctions avoid double counting.

## Rounding-policy findings

1. **No general rounding in these server JSON writers.** Vine number coercion and JSON serialization preserve accepted numbers; there is no storage-wide decimal scale. Existing validators are not proof of cent precision.
2. **Transaction tax UI is the strongest cent-oriented input evidence.** `TransactionTaxCategory` passes `AmountInput.onDeltaChange`; AmountInput blur computes `Math.round(parseFloat(value) * 100) / 100`, invokes the numeric callback, and the tax editor forwards that value. The delta itself remains number subtraction. Server PATCH still accepts values such as 1.005. A cents-oriented UI does not approve retrospective rounding or negative-half behavior for every API caller.
3. **Statement/forecast editors can retain more than displayed cents.** StatementDialog uses AmountField (Formik onChange/onBlur), then parses strings with parseFloat. Tax forecast form handlers use onChange + parseFloat. AmountInput can locally display toFixed(2) while forwarding the original controlled-input event. No evidence establishes that controlled form state was normalized merely because the display rounded. Statement amount signs are copied as entered; the Account sign multiplier is used on starting/ending balances, not these four income leaves.
4. **Funding is round-on-use.** computeSpread first rounds category dollars to cents, rounds fixed-rule dollars separately, then rounds percentage products of remaining cents. Its last percentage allocation receives the remainder. `includeFundingTransfers` can add incoming amounts into a raw category dollar value and recompute spreads. Fixed-order comparator and duplicate/order behavior must remain as characterized, not improved during representation work.
5. **Goals are not an unrounded stored allocation.** Budget.getProposedFunding calculates goalDiff/months and rounds its monthly proposal to cents; raw config, proposals, requested base and final net/Pool amounts have distinct roles. Generalizing goal rounding to every metadata/config input is unsupported.
6. **Different rounding methods already differ.** Actual AmountInput and Amount render tests show `-0.125` gives numeric -0.12 via Math.round while toFixed(2) on the raw value displays -0.13. Binary cases such as 1.005 and 0.30000000000000004 require explicit handling, not a claim every method is interchangeable.
7. **Existing metadata fidelity is tested.** `tests/functional/categories/decimalStringStorage.spec.ts` and `tests/unit/categoryAmountStorage.spec.js` deliberately preserve `baseAmount:1.005` when the sibling amount becomes text. Changing it is a new policy change, not completion of the old scope. Tests for funding preserve calculation order and floating artifacts; representation review must not silently weaken them.

Sources: [AmountInput](../client-src/AmountInput.tsx), [AmountField](../client-src/AmountField.tsx), [Amount](../client-src/Amount.tsx), [TransactionTaxCategory](../client-src/Transactions/TransactionTaxCategory.tsx), [StatementDialog](../client-src/AccountView/StatementDialog.tsx), [tax Income form](../client-src/Taxes/Income.tsx), [forecast Worksheet form](../client-src/Taxes/Worksheet2-1.tsx), [computeSpread/calculateFunding](../client-src/Funding/calculateFunding.ts), [Budget.getProposedFunding](../app/Models/Budget.ts).

## Conservation and consistency

| Profile | Established relationship | What must not be inferred |
| --- | --- | --- |
| TT | Monthly/type attribution aggregation supplies Taxes actuals; signed amounts are retained. Multiple entries/types can coexist. Client `validateTaxCategories` is a TODO, not an implemented equality rule. | No requirement that tax amounts sum to AccountTransaction amount, Category splits, withholding, benefits, or zero. Do not create that rule. Deleted/date/Budget selection must remain exactly as current tax queries. |
| SI | Four independently entered income/gain snapshots aggregated for tax actuals. Starting/ending Statement balance authority is separate. | Dividends + gains + interest need not equal ending minus starting balance: deposits, withdrawals, valuation and other effects exist, and source defines no equality. Negative gains are not automatically invalid. |
| TF | Forecast input amounts feed arithmetic/estimates, sometimes together with observed actuals. Qualification/subsets do not imply a storage equality in validators. | No required equality with Statement/Transaction sums, no mandated qualified<=ordinary validator, no storage identity tying AGI to displayed computed totals. Do not synthesize or validate these rules. |
| FC/FS/BM | computeSpread uses fixed-first allocation and percentage-remainder mechanics; submitted final allocations must conserve under completed type2/type3 rules. Base is requested pre-transfer; Pool allocation has the opposite signed sum of non-Pool net allocations. | Rule dollar amounts need not sum to baseAmount; percentage entries total 100% as percentage units only. Metadata is not conservation authority. No metadata-to-final-total equality or historical reconstruction is justified. |

For a later cent-approved reporting slice, per-value integer-cent comparisons can verify conversion meaning and expected *round-each* totals, without asserting a new relationship to ledger money. They must not silently replace current SQL real aggregation/tax arithmetic with a new sum/round order. Histories with no authoritative external equality can still be audited for malformed representations and rounding deltas; they cannot be proven economically correct by conservation reconstruction.

## Storage-boundary feasibility and hazards

The completed allocation pattern is conceptually feasible for TT, SI and TF: decode only the selected field/object to current numeric runtime values, encode only explicit new/changed selected money leaves, preserve numbers in API DTOs, and tolerate legacy numeric/string/mixed representations temporarily. This is a recommendation for scope assessment, not authorization to reuse the Category rounding policy or change implementation.

| Profile | Boundary feasibility / direct hazards | SQL and metadata considerations |
| --- | --- | --- |
| TT | One array amount leaf; optional type/order/duplicates preserved. Changing only model prepare would expose strings through Transaction API and State.Transaction. Its hooks already handle Category storage; a tax boundary must be independently scoped to active nondeprecated rows, not a global Transaction/Loan normalization. | Existing `jsonb_to_recordset(...amount real)` is a numeric extraction boundary that must be tested with strings/mixed values. It need not imply changing tax sum precision. Blank-type filtering, default empty array, versioning and metadata-only saves remain unchanged. |
| SI | One nullable JSON object with four money leaves; dedicated Statement model is a strong central boundary. GET list, CREATE/PATCH DTOs and nested statement responses must all retain numbers. Null/absent stored data must not be rewritten to response zeros on read. | Existing `->>` + real accepts textual content as cast input in principle, but mixed representation/invalid-data behavior needs PostgreSQL verification. No need to change starting/ending numeric columns or balance authority. |
| TF | One forecast object is centrally persisted but has 13 inputs plus nonmoney filingStatus and optional nested estimates. A field-specific decoder could keep current APIs. Larger whole-object edit surface than TT/SI. | No tax forecast SQL money extraction identified; direct runtime arithmetic is the main risk. For example Income.getTotalIncome uses `+`, so leaked strings can concatenate; comparisons and worksheet thresholds can change. No reason to persist recomputable worksheet results. |
| FC/FS | Must condition on percentage flag and preserve numeric percentages exactly. Live rules and historical rule snapshots are distinct storage paths; migrating one cannot silently rewrite the other. TypeScript number declarations do not decode JSON strings. | Category model JSON.stringify, Budget proposal pass-through, State.Category map/spread and FundingDialog replay would leak strings without a boundary. `/100` and `*100` may coerce strings but are not validated adapters. Round-on-use must be distinguished from save rounding. |
| BM | Scope is one metadata property but many reuse paths: prior-month SQL, State.Transaction, FundingDialog `baseAmount ?? amount`, computeFunding inputs and submission. | Converting only SQL reader is insufficient. Changing raw base precision can change displayed request history and transfer-inclusive recalculation. No reason to change completed Category allocation conservation to accommodate it. |

Concrete numeric-consumer hazards: State.Taxes.updateValues uses `+=` on actuals; Income.getTotalIncome adds forecast values; `qualifiedBusinessIncomeDeduction` participates in `standardDeduction + deduction`; runtime string leakage can concatenate. Statement response expressions `statement.data?.dividends ?? 0` only substitute nullish values and will return a string unchanged. State.Transaction maps `t.amount` without conversion. CategorySpread and FundingItem assume numeric amounts for calculation/toFixed. Existing SQL casts consume numbers/strings but malformed text may fail; no decoder should turn that into silent zero.

Source references: [State.Transaction](../client-src/State/Transaction.ts), [State.Statement](../client-src/State/Statement.ts), [State.Statements](../client-src/State/Statements.ts), [State.Taxes](../client-src/State/Taxes/Taxes.ts), [Income arithmetic](../client-src/State/Taxes/Income.ts), [State.Category](../client-src/State/Category.ts), [FundingDialog](../client-src/Funding/FundingDialog.tsx), [CategorySpread](../client-src/CategorySpread/CategorySpread.tsx), [common response DTOs](../common/ResponseTypes.ts).

## Candidate comparison across the twelve requested dimensions

Qualitative comparison prioritizes independent boundaries, established units and risk of changing financial decisions. No weighted numerical score is used. Reporting authority is meaningful but less balance-critical than posting authority; choosing a low-coupling reporting field does not claim it has a greater accounting impact.

| Dimension | TT: tax attribution (1) | SI: Statement attribution (4) | TF: forecast (13) | FC/FS: fixed rules (2 paths) | BM: baseAmount (1) |
| --- | --- | --- | --- | --- | --- |
| Cent-scale evidence | Strongest UI evidence; server policy absent | Currency totals; controlled input can retain subcents | Currency inputs; estimates can be fractional | Explicit cent application rounding, mixed units | Explicit high-precision metadata retention |
| Authority importance | Actual tax reporting input | Statement tax reporting input | Forecast/estimation input | Controls future funding distribution | Request/edit reconstruction, not posting authority |
| Active reader breadth | 2 functional families | 3 families | 2 broad families, many worksheets | 3 live / 2 snapshot families | 3 families |
| Mutation entry points | 1 PATCH | 2 CREATE/PATCH | 1 upsert | 2 live / 1 snapshot CREATE+replace | 1 CREATE+replace |
| Arithmetic coupling | Reporting aggregates | Reporting aggregates | Wide tax formulas/thresholds | High: fixed/percent/residual/order | High: requested vs net and transfer replay |
| API compatibility | One amount in arrays; generic Transaction responses | Four leaves in list and mutation/nested responses | Thirteen leaves and optional nested object | Mode-sensitive, several response paths | Transaction metadata + aggregates/edit UI |
| Historical uncertainty | Array shapes/types/subcents unknown | Null/data shape/subcents unknown | Old optional fields/subcents unknown | Old modes/order/subcents unknown | Explicit existing subcent support; historical extent unknown |
| Conservation clarity | No ledger equality; preserve attributed sums | No balance equality; preserve attributed sums | No forecast-to-ledger equality | Final outer allocations conserve; rules don't | Explicitly not conservation authority |
| Independence | One leaf; shared Transaction scope needs care | One object; strong separation from balances | One object; independently stored inputs | Narrow storage possible, behavior coupled | One leaf but funding metadata fidelity coupled |
| Isolated testing | Good: PATCH/read/tax sums/no balance effect | Good: data-only PATCH/read/null/tax sums | Feasible but broad tax regressions | Requires funding matrix and fixed ordering | Requires reconstruction/preview/request-history matrix |
| Behavior-change risk | Low relative to alternatives, subject to policy | Low/moderate, null and API paths | Moderate due to estimate/threshold changes | Higher risk to future posting instructions | Higher risk of changing submitted history/replay |
| Production scope | Validator/model boundary/controller audit + tax read verification | Statement boundary/controller DTO audit + tax read verification | Forecast boundary and broad reader verification | Two distinct rule stores and mixed-rate boundaries | Metadata boundary plus funding read/replay audit |

All historical-data uncertainty entries mean **UNKNOWN** until a separately authorized read-only audit. No historical counts for these 21 fields are inferred from the completed Category allocation audit.

## First recommendation: Transaction tax attribution

**Exact scope:** `transactions.taxes[].amount` only, for active nondeprecated supported Transactions. Keep array type tags/order/duplicates, Transaction metadata, Category amounts and all relational money unchanged.

**Why:** one leaf, one public mutation entry point, explicit tax/reporting authority, numeric callback UI, no new conservation relationship, and no need to change another monetary authority. The sibling completed Category storage offers architectural precedent without permission to alter it. Compared with SI, there is fewer field/DTO scope and stronger existing input rounding evidence. Shared Transaction hooks and excluded lifecycle scoping are its principal disadvantages.

**Potential compatibility:** centralized, independently scoped tax storage reader/writer boundary; maintain numeric runtime/API amounts and temporary legacy decoding. Verify current SQL recordset extraction and tax sums under mixed storage, preserving current Budget/date/status/type selection and real-cast arithmetic. This is not a tax calculation redesign.

**Approval required:** confirm that tax attribution is cent-scale money, choose the write conversion rule and treatment of historical fractional cents, establish supported active shape/type scope while preserving deprecated paths, and approve behavior on malformed/unsafe values. Do not assume the prior Category Math.round decision applies here. Existing absence of a split-total rule should be preserved, not filled with a new rule.

**Historical audit:** enumerate array/object/type/amount shapes, numeric vs canonical/other strings, missing/null/nonfinite/unsafe/range cases, per-value rounding changes under the selected prospective policy, deleted/nondeleted distinction, duplicates and tax-type aggregates. Record exact source value, do not repair or require equality with AccountTransaction. All nonamount properties must be preservable. The 13 Category conversion exceptions do not establish special tax-array exceptions.

## Second recommendation: Statement income attribution

**Exact scope:** `statements.data.{shortTermCapitalGains,longTermCapitalGains,dividends,taxableInterest}` as one closely related four-field object. Exclude starting/ending balances and Account balance.

**Why:** dedicated model, two explicit writers, no percentage mode, no direct balance effect from these leaves, and a small field-complete reporting object. This can be verified with data-only updates under the accepted Statement lifecycle. It is second because controlled form behavior does not normalize raw input, optional/null data and multiple response paths add compatibility work, and four values require review rather than one.

**Potential compatibility:** central Statement data storage boundary, numeric models/DTOs, temporary per-leaf mixed decoding, preserve null/omitted object and unrelated properties. SQL text extraction still needs representation tests. Do not broaden the work into Statement balance precision, reconciliation or tie-breaking policy.

**Approval required:** whether these entered income totals must be cents, how to handle subcent imports/API submissions and historical values, and exact rounding/range behavior. Source provides no evidence of a deliberate per-share/valuation intermediate here, but that absence is not approval to quantize all history.

**Historical audit:** null vs object, absent/extra properties, types, precision and signed gains; Account subtype/currency dimensions; independent rounding changes and tax aggregate impact. No new income-total-to-Statement-balance equality. Preserve dates and all balance/Account effects.

## Deferred fields and genuine decisions

- **Tax forecasts (13):** semantically clear monetary inputs, not stored worksheet intermediates, but whole-object edits and downstream tax formulas make the group larger. A single forecast subfield could technically be isolated, yet mixed representation and whole-object save behavior still need coverage across all data users. Defer until the smaller reporting boundary is reviewed; cents vs estimate precision and historic rounding remain undecided. No IRS/legal tax-rounding policy is inferred or proposed.
- **Fixed funding configuration and snapshots (2):** defer because one key means either dollars or percent, current code rounds when used, historical replay is meaningful, and active configuration/snapshots can differ legitimately. Percentage precision rules are already established and must remain separate. No global two-decimal conversion of either polymorphic path.
- **baseAmount (1):** defer until explicit metadata precision semantics are approved. Existing tests require preserving subcents; read/edit reconstruction and prior-month requests depend on it. Do not force it equal to net Category or Pool amounts.
- **Separate relational candidate:** `auto_assignment_categories.amount` is PostgreSQL real, numeric runtime/API, Vine number, fixed rule rounds on apply and percentage uses remainder-based percentage arithmetic. Source confirms monetary risk in fixed mode but it is not a JSON candidate. Do not convert the entire column as dollars; its two modes need a separate product/schema review.
- **Diagnostics (8 named paths):** TransactionLog old/new movement values and six Plaid monetary observation paths remain diagnostic. Plaid functional sync consumes the live SDK return object, not PlaidLog rows; log endpoint reads/redaction/retention do not reconstruct postings. WebhookController processes the live verified request, not stored WebhookLog money. No active financial feedback from persisted diagnostic values was found. Defer, retaining open-payload caveats from the inventory.

Shared decisions for any selected slice are: cent-scale contract; rounding/tie/negative-zero/range policy; invalid/missing values; treatment of historical subcents and malformed rows; numeric API compatibility and temporary legacy support. These are not permission to change completed Category policy, provider precision globally, tax selection, funding order, Account eligibility, or historical balances.

## Future read-only audit and independent acceptance needs

No audit script or database execution is included here. A later authorized audit should read only the selected JSON scope plus ownership/type/subtype fields needed for interpretation, process deterministically with bounded memory, retain original values privately and separate malformed/unsupported records from rounding changes. It should not infer contents from TypeScript annotations, timestamps, displayed two-decimal values or the Category allocation conversion counts. Include deprecated exclusion and numeric/string/mixed/null/empty classification. Candidate-specific aggregate comparison must preserve existing query selection and must not be called a new financial conservation rule.

Later independent acceptance would need raw JSON type/scale checks, numeric API responses, mixed reads with no write-on-read, explicit new-write conversion, metadata-only noninterference, malformed/overflow atomic rejection, tenant isolation/Budget transaction binding, negative and tie cases, optional/null behavior, deleted-record preservation, report actuals and client caches. Existing SQL real computation remains distinct from exact stored decimal text; exact-cent storage alone would not certify exact tax arithmetic. Historical conversion/recovery and execution authorization would remain separately scoped.

## Existing test evidence and verification

Inspected current non-DB precision/funding tests, `tests/functional/accounts/statementCorrectness.spec.ts`, Statement reconciliation tests, `tests/functional/taxes/isolation.spec.ts`, funding preview/replacement/configuration tests, and completed allocation metadata-preservation tests. Existing tests cover numeric Statement attribution persistence/API/null handling, tenant-scoped tax actuals, preserved base metadata, and funding arithmetic/percentage policy; they do **not** certify decimal-string storage for these new candidates. No database-backed tests ran.

Ran only existing standalone non-DB suites `tests/unit/precision/currentHandling.spec.js` and `tests/unit/fundingPercentages.spec.ts`: **39 passed, 0 failed, 0 skipped**. These exercise actual input/calculator/funding/percentage code without application/database bootstrap. In particular they demonstrate controlled-input subcent propagation and negative-half rounding differences. No test expectations or runtime code were modified.

All local document links validated. Working-tree and staged whitespace checks passed. Staged diff fingerprint remained unchanged. Only this new document is unstaged; existing work was preserved. TypeScript/lint/Knip/circular/build checks were not needed because no code/test/configuration changed. No database connection, historical change, monetary representation change, schema migration, deployment or commit occurred.


## Statement income audit preparation — October 25, 2026

HEAD `009d377adef5cdd3adc33f427e84a6396a849133`, branch `dollar-to-cents-2`. The original recommendations above are historical; the two accepted Transaction migrations remain complete. This update concerns only the four Statement income paths characterized in the [inventory](remaining-monetary-storage-inventory.md#statement-income-attribution-characterization--october-25-2026).

### Prepared audit, not executed

The existing Transaction audits cannot enumerate Statement objects or reproduce their report selection. [auditStatementIncomePrecision.mjs](../scripts/auditStatementIncomePrecision.mjs) is a small Statement-specific adaptation using the existing `.env` configuration, configured/live/actual-socket identity checks and exact raw-token `inspectAmount` analysis. It introduces no migration framework and has no write mode.

Future separately authorized invocation, from the repository or compatible tooling directory:

```bash
node scripts/auditStatementIncomePrecision.mjs \
  --env /absolute/path/to/selected-environment-file \
  --database EXPLICIT_DATABASE_NAME \
  --output-parent "$PWD/script-output"
```

The operator must choose the actual environment file and exact database; there is no default database or production target. Settings come exclusively from that file's `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DB_NAME`, and explicit selection must match it. No server-identity check is added. `--print-sql` prints the SELECT statements without connecting. There is no execution/conversion/recovery option.

Before any connection, the CLI creates and prints an absolute unique `script-output/statement-income-audit-*` directory. Private `statements.jsonl` retains each Statement ID, Account/Budget, dates, original `data::text`, raw amount tokens, types and per-value precision findings, including unrelated JSON properties. JSONB raw tokens preserve stored numeric precision that JavaScript hydration may lose; they cannot recover pre-storage lexical input. `summary.json` records total Statements, object/null/malformed shapes, mixed numeric/string objects and per-field presence, numeric, string, canonical string, missing, null, malformed/unsafe, fractional-cent, hypothetical numeric-change and source-to-number-loss counts. Missing fields in SQL-null/JSON-null objects are counted as missing, with the parent shape recorded separately. Explicit null leaves are present/null and not silently converted to zero.

Hypothetical reference rounding for **numeric** leaves is `Math.round(amount * 100)` followed by `(cents / 100).toFixed(2)`, compared against raw decimal tokens using existing exact audit arithmetic. It is analysis only, not an approved Statement policy. Strings are independently characterized for syntax, canonical form, safe range and fractional cents and preserved unchanged in the hypothesis; the audit does not decide to convert or round historical strings. Unsafe or malformed inputs are retained and flagged, not repaired or zeroed. Per-value changed flags/difference cents and raw values are in private findings. Values beyond the helper's supported safe-cent/range bounds are blockers for a hypothetical conversion; their fractional-cent analysis is not certified.

One repeatable-read, read-only transaction covers all pages and report comparisons. Connection defaults enforce read-only mode before identity discovery; transaction mode is checked, identity is reverified at completion, and query/idle/session duration limits bound the scan. It uses separate SELECTs against Statements and existing ownership relationships; it does not query deprecated dependencies. No public application bootstrap, providers, workers, schema writes or normalization-on-read occur. Partial/error output is explicitly incomplete, never a successful historical audit.

For report impact, a parameterized SELECT compares current report sums against hypothetical numeric-leaf rounding within the **same snapshot**, retaining all existing strings. Both sides use PostgreSQL `real` casts/SUM, existing retirement-subtype exclusions, Budget selection, start-date year and end-date month. It reports all groups and exact changed-group inventory; dividends use the same source field that the API names ordinaryDividends. SQL-null/missing leaves retain existing `COALESCE` behavior. Malformed/unsupported values prevent report comparison and produce an explicit `not_compared_unsupported_values` result; a real-cast/query failure makes the run incomplete. This measures impact of hypothetical round-each input changes, not a proposal to change tax aggregation precision. Floating artifacts must not be misclassified as ledger damage. Report differences need review before any policy approval.

No historical counts or report differences are known yet; no PostgreSQL connection was made. Historical audit execution requires separate authorization. Findings contain financial data and must remain private under script-output.

### Minimum later compatibility work, conditional on approval

Use a narrowly scoped four-leaf Statement encoding/decoding boundary; keep numeric runtime/API values and support numeric/string/mixed historical objects. Cover native model/list/nested serialization and both explicit mutation DTOs; `?? 0` is not decoding. Encode only explicitly submitted/replaced income data, preserve unrelated metadata and null/missing semantics, and do not normalize old data on read or metadata-only saves. Confirm existing `->>`/`real` SQL compatibility against PostgreSQL without changing its arithmetic, selection or public response shape. Historical conversion would require its own audit, authorization, atomic tax-independent recovery snapshot and unchanged-row safeguards following established conventions. Do not modify balance columns or reinterpret the existing reconciliation/Account balance lifecycle.

### Decisions still required

1. Confirm whether all four entered currency totals must be cent-scale, including historical gain/loss and interest totals; source establishes monetary meaning but not a mandatory two-decimal contract.
2. Choose how new and historical fractional cents should be handled: preserve greater precision, reject new subcents, or approve a specific rounding policy. JavaScript negative half ties and binary artifacts must be explicitly accepted if Math.round is chosen; Category/Tax approval does not carry over.
3. After the audit, resolve any malformed/unsafe/noncanonical historical values, string treatment and report differences before authorizing compatibility implementation or conversion. No automatic repair is proposed.

These decisions block a storage migration, not the prepared read-only audit. There is no newly discovered four-field semantic split requiring a broader investigation, and no conservation requirement tying income to Statement balance changes.


## Statement income implementation and acceptance

October 26, 2026; baseline `009d377adef5cdd3adc33f427e84a6396a849133` on `dollar-to-cents-2`. The operator approved cent-scale storage and the same JavaScript Math.round policy for all four Statement income leaves. Earlier pending-policy text above is historical characterization, not an outstanding implementation decision. See the [implemented boundary](remaining-monetary-storage-inventory.md#statement-income-decimal-string-implementation--october-26-2026).

**Non-database verification:** 179 focused cases passed, zero failures/skips: 64 new [Statement income cases](../tests/unit/statementIncomeStorage.spec.js), plus 115 existing Category/Tax codec and storage-boundary regressions. Tests use actual production codecs, real Statement column/hook declarations with an inert Lucid adapter, and actual CREATE/PATCH method bodies with inert collaborators. Coverage includes mixed reads, rounding/ties/artifacts/negative zero, malformed/unsafe rejection, numeric serialization and mutation responses, raw persistence payloads, null/missing data, unrelated JSON preservation, no write-on-read, no normalization on unrelated saves, failed-save staging, financial/balance noninterference, rollback paths, Budget isolation and deterministic waiting before authoritative reads. No application/database bootstrap or PostgreSQL tests ran.

Changed-file ESLint, JavaScript syntax and client TypeScript passed. The direct root TypeScript command includes ignored old release-source checkouts under script-output and fails with conflicting project/type declarations. A temporary verification config extending the real server config and excluding only those generated copies (alongside its existing exclusions) passes for current source, including prepared PostgreSQL cases. The repository TypeScript configuration was not changed. No full suite or builds ran. Check logs are under `script-output/statement-income-storage-j1opafag/`.

**Prepared PostgreSQL gate — not executed:** [statementIncomeStorage.spec.ts](../tests/functional/accounts/statementIncomeStorage.spec.ts) defines 15 executable cases using the existing authenticated HTTP, fixture, transaction and database-safety infrastructure:

- Four CREATE cases verify raw `jsonb_typeof` string storage, exact canonical values and numeric API rounding, including fractional cents, negative ties, binary artifacts and negative zero.
- Two income-only PATCH cases cover transaction-tracked and balance-tracked Accounts, raw metadata preservation, unchanged Statement balances and snapshots of Account/AccountTransaction/Transaction/Category state (including Funding Pool rows).
- Two legacy numeric/mixed cases verify numeric list responses, unchanged raw rows after reads, and preservation on unrelated PATCH.
- One mixed-to-string tax-report case verifies existing production real aggregation; one SQL-null/omitted-data case verifies null semantics.
- Three rejected-input cases verify no partial raw Statement or financial mutation.
- One owning-transaction rollback case verifies exact raw-row recovery after a deliberate exception under the Budget lock; one foreign-Budget HTTP case verifies isolation.

These tests require separate database authorization and the existing centralized safeguards for all setup, fixture writes and cleanup. They have been type-checked but must not be described as PostgreSQL acceptance until executed successfully. Existing Statement correctness/reconciliation/tracking suites remain unchanged and are appropriate focused regressions during that later gate. No new test framework was introduced.

**Remaining work:** authorized PostgreSQL acceptance, compatible release/deployment and rollback review, then separately prepared/authorized historical conversion and recovery. Do not convert the 156 previously observed numeric values, reinterpret nulls as zero, or change tax-report arithmetic as part of compatible code verification.


## Statement income PostgreSQL acceptance — October 26, 2026

HEAD `009d377adef5cdd3adc33f427e84a6396a849133`, branch `dollar-to-cents-2`; tested the staged Statement implementation without production-code changes. All execution was local to **localhost:5432/spendcraft_test**, configured and authenticated user **spendcraft_test**, live server/peer **::1/128**. Existing centralized safeguards independently checked configured/live `pg` and `pgLog` identities plus the actual execution connection before every destructive SQL operation, including setup and cleanup. The safeguard suite ran first: **28 passed**, zero failed/skipped/pending.

**Original prepared cases: 15 passed, zero failed/skipped/pending.** The first attempt encountered occupied HTTP port 3337 before running any cases; subsequent runs used an available per-run HTTP port without changing server configuration or stopping an existing process. The first actual case run had 13 passes/two failures because invalid-input requests omitted JSON Accept headers. Adonis session middleware renders browser validation failures as redirects, which the API client followed to a 200 page. The test-only correction adds `.accept('json')` consistently and asserts zero redirects on rejected inputs. The 422 assertions and raw-state comparisons remain intact. All 15 then passed; production code was unchanged.

The accepted cases establish raw JSON string types/canonical values for all four leaves, fractional-cent/negative-tie/artifact/zero rounding, numeric CREATE/PATCH/list responses, numeric and mixed historical reads, SQL-null preservation, unchanged metadata and Statement balances, financial snapshots, unchanged historical storage after reads/unrelated PATCH, existing real-aggregation reports, invalid/unsafe atomic rejection, owning-transaction rollback, and foreign-Budget rejection. Nonfinite scalar rejection and additional positive/negative ties remain covered by the focused non-DB production-code tests; JSON cannot directly represent Infinity/NaN. No report arithmetic was changed.

**Expanded focused regression: 261 passed, zero failed/skipped/pending**, separately from the original 15. This comprises 197 PostgreSQL cases and 64 non-DB Statement income cases: 233 cases in the main selection plus 28 existing Statement correctness cases. Selection covers Statement eligibility, creation/update/reconciliation and balance authority, AccountTransaction behavior, actual Budget-lock contention/transaction ownership, rollback, reporting isolation, and existing Category/Tax decimal-string storage. Schema-changing older fault-injection cases were deliberately outside this selection: five `statementCorrectness` constraint-injection variants and the separate `statementReconciliation`/`statementDeletion` suites were not executed. No schema safeguard or assertion was disabled; rollback is covered by the new acceptance case and existing non-DDL regressions. This is focused acceptance, not a full-suite claim.

Safety evidence for successful runs: original 15 **705 independent checks / 702 guarded operations**; main expanded selection **9,108 / 9,105**; Statement correctness selection **1,297 / 1,294**. Each run completed independently safeguarded truncation cleanup. Initial failed attempts and their cleanup are also retained in evidence. Test setup reported migrations already up to date; no schema changes were required or performed.

**Static verification:** source-only server TypeScript, client TypeScript, changed-file ESLint, relevant script/unit syntax and both Git diff checks passed. Server verification reused the existing temporary config extending the real project and excluding generated source archives under script-output; repository tsconfig remains unchanged. The normal root check's archived-source contamination remains a separate workspace limitation. No full builds or complete automated suite ran. The occupied Vite HMR port 24678 emitted a nonfatal warning; existing listeners were left untouched. Expected negative-path logs (422/404 and deliberate injected errors) do not indicate acceptance failures.

Evidence: `script-output/statement-income-postgresql-p438yqyl/`, including original attempts, corrected prepared-case log, exact regression selections, safety evidence, static logs and Git inventory. Only the acceptance test and these two migration documents gained unstaged verification changes; the pre-existing staged implementation/index and unrelated work were preserved. No staging/production access, historical conversion, deployment or commit occurred. Local test-database authorization expired when verification completed.

The implementation is accepted for commit review. Release/deployment review and separately authorized historical conversion remain subsequent work; none of the previously observed 156 production numeric values was converted here.
