# Current monetary precision: source characterization

## Baseline and limits

HEAD: `500cef52d2e0a9495db5992cd1fbb6903246dcc1`. Read AGENTS.md, monetary-migration-scope.md, accounting-invariants.md and the latest readiness status. Current source and actual-method tests are authority. This is a description of existing behavior, not a migration design, rounding-policy recommendation or new accounting contract.

Loans and the entire transaction_categories architecture are deprecated and excluded, regardless of reference location. Their fields, readers, dependencies, compatibility behavior and tests do not establish conclusions here. Shared files are examined only for nondeprecated behavior. Deprecated BalanceHistory and commented candidate algorithms are likewise not active precision implementations. Existing candidate BigInt money conversions in policy-design tests are TEST-ONLY proposals, not current production money handling. No proposal is adopted here.

No tracked changes existed at entry; unrelated untracked files and index are preserved. No production code, schemas, APIs or client behavior changed. No PostgreSQL connection, application bootstrap, DB-backed test, setup/cleanup, historical repair, migration, deployment or commit occurred. Storage findings below come from source/migrations and already accepted records, not a new live schema inspection.

## What “cent-exact” means here

| Boundary | Meaning | What does not establish it |
| --- | --- | --- |
| Display precision | Render two fractional digits | A formatted string says nothing about the backing number |
| Input precision | Accept/reject/round/truncate under an identifiable rule | A numeric validator is not necessarily a scale validator |
| Arithmetic precision | Exact integer-cent operations within supported range, or an exact equivalent | General binary dollar-number arithmetic, even with cent-valued operands |
| Storage precision | Persisted scale/representation constraints | numeric(12,2) cannot make an earlier JS computation exact |
| API precision | An agreed monetary decimal meaning survives transmission and consumption | TypeScript number and JSON number alone do not establish a cent contract |

Most paths mix boundaries. “Rounded” below means quantized by the actual expression, not a promise that binary dollars are exact. JS integer-cent accumulation is exact only while operands/results are finite safe integers. No general safe-integer/range proof is enforced by these money paths.

## 1. Display inventory

| Function / source | Inputs → outputs; callers | Actual precision and sign behavior |
| --- | --- | --- |
| Amount, client-src/Amount.tsx | number/string/null → React div with string; register Transactions, duplicate dialog, Account/Institution balances, Category/Group/SystemCategory views, overview bills, funding/rebalance, StatementAmount/View, Category/Payee/FundingHistory reports and tax worksheet components | String input uses parseFloat; number.toFixed(2), comma grouping by regex. Negative amounts retain minus sign and negative CSS; string -0.00 becomes0.00 without negative CSS. Actual -0 also displays0.00. null normally displays0.00; optional noValue placeholder can replace missing value. NaN/Infinity can render their names. No mutation/callback. Display-only |
| AmountInput convertAmount / inactive rendering, client-src/AmountInput.tsx | number/string → two-decimal text; callers detailed below | Uses both toFixed and Math.round(x*100)/100, in different stages. Can hide extra precision without changing parent state. Not equivalent to Amount at all negative ties |
| FundingItem.hide, client-src/Funding/FundingItem.tsx | parseFloat(current).toFixed(2) versus previous.toFixed(2) → boolean for diff-only display | Compares rounded strings, not monetary equality. Tiny differences can disappear; negative tiny value string -0.00 can differ from0.00 |
| FundingHistory comparison, client-src/Reports/FundingHistory.tsx | a.toFixed(2)===b.toFixed(2) → boolean for presentation grouping | Display-level equivalence, not normalization of history amounts |
| Budget.getProposedFunding, app/Models/Budget.ts | planned/monthly amounts → explanation string using toFixed(2) | Explanation formatting is separate from the preceding rounded numerical calculation; some goal amount text uses raw interpolation |
| Google Chart wrappers, client-src/Reports/IncomeVsExpenses.tsx and NetworthContent.tsx | numeric array data → library chart | No application cent-normalization or explicit universal two-decimal monetary formatter; labels/tooltips depend on chart library defaults. Not evidence that underlying data is rounded |
| CSS currency/dollar-amount and negative classes | styles on monetary cells | Alignment/sign presentation; do not parse, round or change values |

No active application Intl.NumberFormat or monetary toLocaleString helper was found. DateTime.toLocaleString is date display, not currency. InstitutionInfoDialog's percent toFixed(0) is a ratio display, not money. Funding/Category/Statement/Transaction/Tax reusable table cells primarily use Amount rather than an independent currency parser. Raw arithmetic may feed Amount, e.g. Transaction.tsx subtraction, account sign multiplication, Group/Category totals; formatting never repairs those values.

Examples executed against the real Amount expression:0.30000000000000004→0.30;1.005→1.00;−1234.567→−1,234.57;−0.001 and−0→0.00; string12abc→12.00. No dollar symbol is added by Amount itself.

## 2. AmountInput end to end

Public value is number|string, default0. Local inputAmount and initialValue are strings; focus/equation/previousAmount are local UI state. Input is type=text, not valueAsNumber or a decimal-validated HTML number control.

- Initialization: string parseFloat(value).toFixed(2), or numeric value.toFixed(2).
- Typing: stores event.target.value exactly and forwards the original event to onChange. Intermediate empty, minus, decimal point and invalid strings are not rejected here.
- Focus: records parseFloat(current DOM text).toFixed(2). That rounded text is the delta baseline, not necessarily the parent's original number.
- Blur: newAmount=Math.round(parseFloat(DOM text)*100)/100. NaN becomes0; Infinity is not rejected. delta=newAmount−parseFloat(initialValue), an ordinary binary subtraction. Calls onDeltaChange(number,number) only when delta!==0; signed zero compares equal to0. Then stores newAmount.toFixed(2) locally. onBlur receives the ORIGINAL event/text, not a synthesized normalized event. Blur does not invoke onChange with rounded text.
- Controlled mode (onChange supplied): render uses the incoming value prop rather than local inputAmount. Numeric props first use toFixed(2); string props are preserved while focused. When not focused, it parses, multiplies/divides by100, then applies Math.round(x*100)/100 and toFixed(2), with NaN→0. This is display calculation; no parent-state normalization occurs.
- Delta mode (no onChange): uses local text, with rounded number callback on blur. Prop changes do not automatically synchronize local state through an effect. Callback delta itself is not cent-normalized:0.30−0.10 gives0.19999999999999998.
- Negatives are accepted. Math.round ties tend toward +Infinity, including −0 for−0.005*100. toFixed on a negative nonzero magnitude can disagree:−0.125.toFixed(2) is−0.13, but blur Math.round yields−0.12. toFixed(-0) displays0.00. No general signed-zero canonicalization of parent numeric state exists.
- Inactive empty/invalid text can LOOK like0.00 while the controlled parent still has empty/invalid input. A parseable prefix such as12abc can be displayed as12.00; this is not server acceptance of that syntax.

Calculator: '=' opens the equation popover. EquationParser tokenizes decimal digits/dot, spaces, +/−/*// and parentheses; parseFloat creates JS numbers, operators perform binary arithmetic. More than one dot is rejected; no currency/grouping/exponent grammar is implemented by this calculator. Division by0 produces Infinity and0/0 produces NaN; there is no finite check. handleCalcChange formats the result with toFixed(2) into LOCAL text; it does not call parent onChange or onDeltaChange. Parse exceptions are logged and previous input text remains; empty equation sets empty local text. Escape restores previous local text; Enter closes/focuses. In controlled mode local calculator text can be overridden by the value prop. DOM focus/blur scheduling is not simulated by the inert tests; callback/data-flow observations follow current handlers.

Representative active callers:

| Callers | Data passed onward |
| --- | --- |
| CategorySplitItem; TransactionTaxCategory; Rebalance/CategoryRebalanceItem | onDeltaChange receives rounded amount and floating delta; split/remainder state then uses number arithmetic |
| TransactionDialog amount, CategoryDialog fundingAmount, CategorySpread fixed/percentage amount, OfflineAccountDialog, AmountField/FormField | Controlled/Formik raw event string can remain in form state; submit handlers parseFloat where shown, not universally round |
| Taxes/Income, CapitalGains, TaxAndCredits, Worksheet2-1 | Controlled onChange immediately parseFloat(event.target.value) into tax state; empty/partial input can become NaN; blur does not send normalized text to those handlers |
| AccountView/StatementAmount | Controlled local string; Enter submits parseFloat(amountValue) if !== existing amount; no cent round on this Enter path. Escape cancels |
| Funding/FundingItem | onDeltaChange plus Formik field props; controlled rendering and rounded delta callback coexist; FundingDialog handles baseAmount strings/numbers and recalculates current numeric preview |

## 3. Input and external boundaries

| Source / current files | Conversion, acceptance and rejection | Cent guarantee? |
| --- | --- | --- |
| Manual Transaction: TransactionDialog; validation/Validators/transaction.ts; AccountsController.addTransaction / TransactionsController.update | Client parseFloat amount; split numbers/sign transformation. Server vine.number for movement, allocations and tax allocations. Numeric strings may coerce;1.005 is accepted unchanged. Current validator also accepts empty/whitespace string and false as0, true as1, hexadecimal string0x10 as16. Null, grouped1,234.56, invalid suffix12abc and nonfinite values reject. Required/optional fields remain route-specific | No two-decimal constraint. Separate rounded conservation is not per-field cent validation |
| StatementDialog/StatementAmount; Validators/statement.ts | Form money/income strings parseFloat; starting/ending balance and income values vine.number. Subcent numeric input is not normalized by validator | Relational balances get storage scale later; Statement income JSON does not |
| OfflineAccountDialog; Validators/institution.ts; InstitutionController | parseFloat form balance; vine.number incoming balance, raw numbers assigned to Account. Transaction-tracked new Institution invokes opening/Pool; balance-tracked initialization creates Statement | No ingress cent validator/rounder. Existing-Institution route difference remains unchanged |
| Funding baseAmount/configuration; calculateFunding; Validators/category.ts and categoryTransfer.ts | baseAmount string parseFloat, numeric base unchanged. Flat allocations/baseAmount/fixed amounts vine.number. Generated allocations pass rounded zero-sum validator. Rules may contain amount with percentage flag | No monetary cent-input constraint; percentage-only precision validation is different |
| RebalanceDialog; categoryTransfer validator/controller | Local adjustment numbers, integer-rounded sum==0; server numbers and same rounded conservation; persists submitted JSON amounts | No per-field cent normalization |
| OFX: Account.processOfx and fast-xml-parser | Default XMLParser handles decimal text; TRNAMT negation coerces parsed number/string into number. Present LEDGERBAL.BALAMT must be number or nonempty string with finite Number(value); providerBalance=Number(value). This accepts numeric syntax, not a cent-scale contract. Transaction movement rows receive no dedicated universal cent-input validator | Allocation effects/remainder are rounded later; movement/provider observation need not first be cent-exact |
| Plaid SDK → Institution/Account.addOrUpdateTransaction | SDK amount and balances.current are already JS numbers; movement sign inverted, observation assigned, eligible deltas accumulated. No application decimal-text recovery or cent validation | No; auto-assignment uses temporary cents, modifications use other dollar arithmetic |
| Category fixed/goal configuration, fundingCategories; auto-assignment config | Form strings parseFloat or controlled form values; server vine.number. AutoAssignmentCategory.consume parseFloat; amount field's meaning depends on percentage flag | Fixed money not scale-validated; funding percentage rule constrains rates only; auto-assignment has no same percentage validator |
| Tax forecasts/estimated inputs; Validators/tax.ts | Client parseFloat onChange; server vine.number fields; tax.data JSON | No cent rounding before JSON persistence |
| Transaction list amount search | TransactionsController parseFloat(amountSearch) for numeric equality | Search conversion, not monetary ingress normalization |
| Operational CheckUnassigned / CheckBalances (not executed) | JSON copy of AccountTransaction.amount; diagnostic SQL sum parseFloat; rounded comparison/difference in CheckBalances | Operational paths are not cent-normalization at ordinary ingress; no repair was run |

parseFloat accepts a prefix, whitespace, decimal/exponent notation and Infinity; empty string and bare '-' giveNaN. It is not a currency parser: '$1.23'→NaN, '1,234.56'→1, '12abc'→12. Number has different whole-string/coercion rules. Most parseInt uses found are IDs, dates or recurrence, not monetary truncation. No active universal decimal-money parser, valueAsNumber ingress or unary-plus cent-normalizer was found.

Vine numeric coercion is distinct from parseFloat; pure tests execute the installed current validator, not a proposed schema. Direct callers can therefore submit values that silently coerce to0/1; AmountInput is not an API-wide safeguard. No blanket promise is made about every HTML form's pre-submit validation. Rejection at request validation/conservation does not establish that every accepted monetary value is cent-exact.

## 4. Existing rounding mechanisms and their limits

There is no single reusable dollar-to-cent normalization helper used across the application. The following are distinct actual mechanisms.

| Mechanism / callers | Rounding rule and boundary | Edge behavior / exactness |
| --- | --- | --- |
| Amount.toFixed(2) | Nearest decimal rendering of represented binary value; exact represented half magnitudes format away from zero |1.005 already lies below intended tie→1.00;−0.125→−0.13; no numeric mutation. Nonfinite values stringify; at huge magnitude toFixed may use exponential notation |
| AmountInput Math.round(x*100)/100 | Scale binary dollar number, nearest integer with ties toward +Infinity, divide back |0.005→0.01,−0.005→−0,1.005→1; no finite/safe-integer guard except NaN→0 locally. Rounded result remains binary dollar number |
| validateTransactionSplits | Round EACH sign-normalized allocation to integer cents, sum, compare EXACTLY with rounded absolute movement cents | Returns void/throws422, does not rewrite allocations; can accept1.234 against1.234, or0.004 against0. No overflow/safe-sum check. Not decimal validation |
| calculateFunding.computeSpread | Round source/fixed money to cents; round percentage products in cent space; cap fixed withdrawals; residual added to last percentage entry | Returns Map<number,number> integer-cent allocations. Arithmetic after conversion is exact only for safe integers; fractional percentage multiplication/conversion still floating. Negative half behavior retained; zero funding omitted; no universal finite/range guard |
| Account auto-assignment | Rounded movement cents; rounded fixed amounts and percentages, last-entry residual; divide by100 when writing JSON/adding Category balances | Percentage product is computed from dollar transactionAmount after fixed deductions, distinct from funding's cent-space algorithm. Final dollar balance addition is floating |
| OFX applyAllocations and remainder; Account startDate crossings | Round each split/base balance to cents, accumulate deltas, divide by100 | Local cent-space accumulation bounded by JS safe integer behavior; input conversion/ties not decimal-exact; returned dollar number not an integer representation |
| Budget.getProposedFunding goal/monthly calculations | Floating goal difference/month division → Math.round(...*100)/100; planned allocation separately rounded | Rounds final monthly/proposal boundary, not all source money. Direct goalDiff>0 and monthlyAmount!==plannedAmount comparisons |
| common/fundingPercentages.ts | Number conversion, finite/nonnegative check, decimal-string/exponent decomposition to BigInt hundredths of a percentage point; reject finer precision, validate10000 units total | Exact validation of the number's canonical percentage representation, not MONEY arithmetic or recovery of original decimal text. This production BigInt use does not make currency cent-exact |

No money-wide epsilon tolerance, Number.EPSILON adjustment, checked safe-integer multiplication, overflow rejection or nonfinite normalization was found across examined paths. Scaling a huge number can overflow to Infinity; summing beyond2^53 loses integer precision. Round/divide is commonly stable at ordinary values tested, but production has no universal checked idempotence/range contract. Repeating formatting does not recover lost input digits. Test-only candidate parsers in older precision-design tests must not be mistaken for reusable runtime helpers.

## 5. Arithmetic and classification by active path

Classification uses the requested A–E labels where they apply. “Unrounded floating arithmetic” below identifies a missing cent boundary rather than falsely calling it cent-validated. A applies only to a demonstrable bounded subcalculation; none of these whole dollar lifecycles establishes A end to end. No general B (cent-validated monetary input followed by floating arithmetic) is proven: current monetary validators are number validators, not cents validators.

| Pattern / source | Operands/intermediates → boundary/output | Classification |
| --- | --- | --- |
| Manual CREATE, AccountsController.addTransaction | JS movement/splits; account.balance+=amount and category.balance+=split.amount; model saves and response constructed from current instances | E for relational saved balances/movement; unrounded JSON allocations and response numbers. Rounded conservation is C validation-only, not normalization |
| Ordinary PATCH, transactionEligibility.categoryEffectDeltas / TransactionsController | Sum old/new JSON effects by Category in number Map; floating old/new eligible Account delta; delta===0 skip; balance+=delta | Unrounded floating arithmetic; E on relational persistence, raw JSON/API otherwise |
| Current ordinary DELETE / parent cleanup, nondeprecated branches | Category/Account subtraction of existing amounts, saving surviving balances | E/unrounded upstream arithmetic; no new historical-reversal policy is inferred by this characterization |
| startDate maintenance, AccountsController.update | Per-split rounded-cent signed deltas; existing balance rounded to cents before addition and division | C; A only for safe integer-cent delta sum after conversion. Separate opening remains floating |
| OFX | Cent-rounded Category delta/remainder; Account old/new effects and sum+=amount remain dollar numbers; balance+=sum; optional provider observation assigned | Mixed C Category path, unrounded Account/provider path and E saved numeric columns. New nominal JSON may preserve raw imported amount while applied cents differ |
| Plaid creation/modification/removal, Institution and Account | Number amount/sign, old/new difference; JSON allocation sum via reduce; delta=newAmount−sum and delta!==0 may add/adjust Unassigned; Category += effect; Institution sums changes | Unrounded floating arithmetic, with C auto-assignment subpath and E numeric writes. Tiny delta can influence a branch |
| Opening/Initial Funding, Account.updateStartingBalance | Account balance minus SQL signed sum, new opening minus prior amount, Pool += opening/delta; JSON and links saved | Unrounded floating subtraction/addition; E only at numeric columns, JSON not scale-constrained. Formula/eligibility unchanged |
| Offline initialization batch | Shared fresh Pool, opening arithmetic per transaction-tracked Account, one final Pool save; Statement balance initialization separate | Same mixed E/unrounded behavior; serialization protects composition, not precision |
| Fixed/percentage funding spread | Temporary integer-cent map; last-entry percentage residual; divide to funder dollars | C; A only for safe integer additions after quantization |
| calculateFunding transfer-inclusive destination | category.amount += incomingCents/100 without final round; aggregate funder/destination rows by dollar reduce | Unrounded dollar arithmetic after C spread; raw allocation/baseAmount JSON and API can retain artifacts |
| Funding/rebalance server replacement | Rounded zero-sum check, raw ordered JSON rows; Map old-negative/new-positive dollar deltas; Category.balance += delta | C validation-only; E balances, unrounded allocation JSON/API. Does not reround each persisted row |
| Split remaining / rebalance available / preview available | TransactionDialog abs(total)−sum(raw splits); rebalance unassigned−delta; preview Pool balance plus current calculated Pool effect and replacement adjustments | Unrounded floating arithmetic, then D through Amount |
| Group/Category client balance totals | reduce children.balance + own balance; register running balances and sign display arithmetic | Unrounded client arithmetic, then D |
| Statement credits/debits and closing balance | SQL sums, parseFloat; client debit/credit/difference calculations, latest Statement balance assignment | E storage; SQL read-side totals then floating hydration/arithmetic; no universal cent round |
| Category/Funding History reports | JSON SQL decimal expansion/SUM, Category float output conversion; Funding JSON aggregation | Read-side SQL decimal aggregation of CURRENT numeric text, not recovered intended cents; numeric JSON API, then D in Amount |
| Income Vs. Expenses | SQL decimal JSON transfer SUM grouped per Transaction; numeric movement minus sum; parseFloat income/expenses, JS net addition | SQL aggregation followed by unrounded hydration/net; D or chart defaults at display |
| Net worth, chart/account-history, Payee | SQL numeric sums/windows/crosstab or float casts; chart numeric arrays/Amount cells | Read-side aggregation; no application universal quantizer |
| Tax actuals | Statement JSON text cast ::real; Transaction taxes expanded amount real; SQL sums and monthly merging | Floating SQL aggregation, not cent-exact; numeric API input to client tax calculations |
| Tax client Income/Taxes/Estimated/Worksheet2_1/Worksheet2_9 | JS sum, bracket thresholds, percentages, divisions, min/max, cap/loss calculations; some Math.round(line*100)>0 guards; Amount display | Unrounded floating calculation with local rounded branch checks, D display. Rate precision is not posted-money precision; no new tax rule inferred |

## 6. Rounding order and decisions

- Splits and rebalance round each operand BEFORE summing. This differs from rounding the aggregate:0.005+0.005 rounds per-row to2 cents but aggregate0.01 rounds to1 cent. Validation can reject a mathematically equal raw-dollar total for this reason; it can also accept subcent rows that round to0. Amounts are not changed by passing that check.
- TransactionDialog validates positive-oriented split amounts before submitting signed splits. Server sign-normalizes using movement sign. Math.round is not symmetric about zero; this sign handling matters at half ties.
- Funding rounds source cents, applies fixed withdrawals, then percentages to the remainder with last-recipient residual. Auto-assignment subtracts rounded fixed dollars from a floating dollar base before percentage multiplication. These are not interchangeable rounding pipelines.
- Goal funding rounds after dividing goal difference across months; it separately rounds planned recurrence amount. Funding destination transfer additions occur AFTER converting cents back to dollars and have no final round.
- OFX remainder rounds movement and EACH explicit split separately, not their raw total. startDate and OFX Category effects round existing Category balance as well as effect operands. Manual/PATCH Category addition does not generally do that.
- AmountInput rounds a blur result but computes delta by unrounded subtraction from rounded initial text. Controlled onBlur/onChange do not receive the rounded result automatically.

Monetary decisions include exact rounded conservation equality, direct delta!==0/===0, original amount>=0/<0 report classification, goalDiff>0, fixed cap categoryAmount<fundingAmount, remaining!==0 residual, StatementAmount value!==amount, FundingItem/FundingHistory rounded-string comparisons, Category deletion JSON amount!=0 and numeric tax thresholds/min/max. Client finite guards on API responses reject nonfinite numbers but do not validate cent scale. No general tolerance was found. Negative zero passes zero comparisons; tiny nonzero artifacts can trigger delta/remainder/usage decisions even when Amount renders0.00. This is a precision observation, not approval to change admission or reporting semantics.

## 7. Concrete artifact chain

Actual calculateFunding inputs: destination10 base0.1 funded100% from Pool99, includeFundingTransfers=true; destination20 base0.2 funded100% from10. Incoming20 cents become0.2 dollars; destination10 adds0.1+0.2→0.30000000000000004. Its baseAmount remains0.1. Spread can re-quantize that result to30 cents for funder calculation, but does not overwrite destination amount.

JSON serialization transmits0.30000000000000004. The server's rounded conservation can accept its30-cent contribution without rewriting the number. Transaction JSON retains current submitted numbers; accepted prior funding/report verification already recorded this persistence boundary, not rerun here. Category numeric columns constrain saved balance scale independently, while in-memory response values can still reflect unrounded arithmetic before a fresh read. Reports reading current JSON may expose the artifact; Amount displays0.30 and later client/server arithmetic can consume the original value. It is not merely cosmetic at every stage, nor evidence of a different intended economic amount.

Other executed examples: calculator0.1+0.2 retains the artifact;0.30−0.10 delta is0.19999999999999998;1.005 at Math.round/toFixed boundaries becomes1.00;−0.005 scaled rounding yields−0. Display-only rounding does not establish input/arithmetic exactness.

## 8. Storage and API observations, limited to traced paths

Migrations define Account/Category balances, AccountTransaction.amount, Statement starting/ending balances and Category.funding_amount as decimal/numeric commonly12,2. Models consume numeric strings with parseFloat; Account null balance becomes0, nullable provider balance staysnull. No common prepare-time cent normalizer exists on those columns. Saves need not reload database-rounded values before building a response. Database-scale enforcement is distinct from upstream calculations; this task does not independently execute PostgreSQL tie/overflow behavior.

Transaction.categories/taxes, funding baseAmount/nested configuration, Statement income data and tax forecasts are JSON numeric values, without a numeric(…,2) constraint on each entry. AutoAssignmentCategory.amount uses migration table.float (PostgreSQL real), read with parseFloat, and represents fixed money OR a percentage according to its flag; not every amount there is money. No schema/design conclusion follows.

API DTOs generally use numbers, sometimes number|string in input/form boundaries; SQL aggregate drivers can yield numeric strings until explicitly parsed or emitted through JSON construction. Income report parseFloat and net addition are explicit; Category casts sums to float; Funding History JSON emits numeric amounts; Statement props parseFloat aggregate extras. Client Account/Category/Statement state stores numbers and recomputes totals without a decimal arithmetic layer. String formatting is not the general API money contract. JSON serialization preserves the finite funding artifact but serializes−0 as0 and NaN/Infinity asnull; those serialization facts are not intentional validation/rounding policy. No API-wide cent precision is demonstrated.

## 9. Missing guarantees, without a replacement design

1. Numeric monetary request fields generally lack per-value decimal-cent validation; rounded conservation only constrains sums at its own boundary.
2. Client display/blur rounding does not consistently normalize controlled parent state or submission payloads.
3. Raw monetary JSON has no common cent-scale boundary; fixed configuration and monetary snapshots can contain subcents.
4. Dollar additions/subtractions/products/reductions remain binary in manual posting, PATCH, Plaid, opening, Pool, transfers, totals and taxes.
5. Temporary cents improve local accumulation but conversion ties, finite/range safety and conversion back to binary dollars remain separate issues.
6. SQL numeric storage scale can disagree with in-memory/JSON/API values; hydration reintroduces binary arithmetic. SQL real/float aggregation is another precision boundary.
7. Equality/zero/threshold branches mostly have no tolerance; formatting can conceal differences relevant to those decisions.
8. There is no single shared runtime rounding policy for all money. This document does not choose one, define new cent admission rules or recommend a representation.

## Verification

Nine new actual-component/helper/validator characterization cases in tests/unit/precision/currentHandling.spec.js run without DOM, app bootstrap or DB. They test Amount formatting, controlled raw-event flow, delta artifacts, invalid/Infinity behavior, negative tie disagreement, current numeric validator acceptance/rejection, non-mutating split validation, calculator floating/nonfinite behavior and funding JSON artifact. Existing funding spread/preview and funding-percentage tests run as current-behavior regressions, not migration proposals.

Focused standalone Japa run:76 passed,0 failed,0 skipped/pending (including9 new cases). No DB-backed test was run. Both TypeScript checks, ESLint, Knip and circular regression pass. Circular analysis retains the accepted11-model/26-edge component (416 files/493 repository nodes). An initial lint failure in the NEW inert test (empty logging stub) was corrected without suppression; no runtime code changed. Normal/staged diff checks and new-file whitespace checks pass. No runtime build is necessary for documentation and inert test additions.
