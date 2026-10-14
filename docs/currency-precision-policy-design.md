# Fractional-cent currency persistence: characterization and policy design

No production policy is implemented. Existing sub-cent disagreement is confirmed
by previous runtime evidence. This task performs source inspection and pure unit
characterization only; all database tests below await fresh authorization.

## Representation inventory

| Concept | Persistence | Runtime/API | Financial role |
| --- | --- | --- | --- |
| AccountTransaction.amount / principle | numeric(12,2) | Vine number, ORM parseFloat on reads; saves retain in-memory attributes | Account balance, Statement sums, transaction conservation |
| Account.balance / plaid_balance | numeric(12,2) | number; nullable provider balance | Actual/reported balance |
| Category.balance (formerly amount) | numeric(12,2) | number via consume parseFloat | Posted financial state |
| Category.funding_amount | numeric(12,2) | number | Currency configuration / goal amount, not percentage |
| Statement starting/ending_balance | numeric(12,2) | number | Balance-tracked actual state, reconciliation |
| BalanceHistory.balance | numeric(12,2) | number | Legacy/history balance state |
| Transaction.categories | JSONB | raw categoryId/amount/comment; funding splits add baseAmount/configuration | Current allocation authority; reports/history sum unscaled decimal JSON values |
| Transaction.taxes | JSONB | type/amount numbers | Monetary tax attribution; no relational scale guard |
| Statement.data | JSONB | investment income/gains currency fields | Monetary snapshot, independent of statement balance columns |
| Tax.data | JSONB | forecast/estimated monetary amounts, plus noncurrency year/status | Forecast currency configuration, not posted balances |
| Category.funding_categories and embedded fundingCategories | JSONB | amount plus percentage flag | Fixed amount is currency; percentage has the closed 0.01-percentage-point rule |
| AutoAssignmentCategory.amount | Knex float/PostgreSQL real | number / parseFloat | Fixed currency OR percentage configuration; storage precision defect deferred |
| TransactionLog.changes | JSON / serialized object | raw before/after numeric attributes | Audit snapshots, not authoritative posted state |
| Historic transaction_categories and funding_plan_categories | numeric(12,2); expected fields also scale 2 | Historical migrations/older paths | No active CategoryTransaction model; current allocations use Transaction.categories |
| Loan balance/starting_balance / historical principal rows | numeric(12,2) | number | Precision inventory only; financial semantics remain deferred |

Integer cents are transient in auto-assignment, funding spread/residual handling,
OFX delta accumulation and account start-date/category effect handling. They are
not the global persisted representation. Database numeric values normally arrive
as strings and model consume hooks produce numbers; some raw SQL responses retain
strings. No coherent application-wide rounding policy exists.

Percentage entries, rates (including Account rate numeric(5,3)), recurrence, counts,
IDs and dates are not actual currency and must not receive a universal cents rule.
Fixed funding/auto-assignment configuration is currency despite sharing amount
with a percentage entry. Tax estimates are currency configuration rather than
posted ledger state; precision policy there needs explicit inclusion, not a blanket
number-schema replacement.

## Significant ingress owners

- AccountsController.addTransaction: POST account/:acctId/transactions, addTransaction
  schema; amount, optional principle and categories[].amount all vine.number.
- TransactionsController.update: PATCH transaction/:id, updateTransaction schema;
  optional amount/principle/splits/taxCategories amounts; version validation separate.
- CategoriesController.transfer: POST/PATCH category-transfer; signed split amount,
  baseAmount, and fixed fundingCategories amounts. Percentage rules already closed.
  Zero-sum validation rounds each split but does not normalize or reject raw input.
- Category POST/PATCH: fundingAmount numeric schema to scale-two column; fixed
  funding configuration JSON is not checked for currency precision.
- FundingPlanController.updateOrCreateCategory: PUT funding-plans/item/:catId,
  amount number to Category.fundingAmount. Proposals read persisted Category state.
- InstitutionController offline institution/account creation: supplied balance;
  addInstitutionOffline/addOfflineAccount schemas accept number. Depending on
  tracking, creates opening transactions/funding-pool effects or initial Statement.
- AccountsController addBalance/updateBalance: amount number, BalanceHistory then
  latest Account balance/initial funding adjustment; no cent precision validation.
- AccountsController addStatement/updateStatement: startingBalance/endingBalance
  and income/gain data number fields; direct scale-two balances plus raw JSON data.
- Loan creation/update: amount/startingBalance currency, rate not currency; no
  financial/principal redesign proposed.
- TaxesController POST: JSON forecast currency fields; no decimal-column backstop.
- AutoAssignmentsController POST/PATCH: fixed configuration and percentage mode
  stored as real; that storage defect is separate, not repaired by cents validation.
- Plaid Institution sync/create/update and Account addOrUpdateTransaction:
  provider balance/transaction amount numbers, sign reversal for transaction amount;
  no Vine currency precision boundary. Pending/date applicability does not normalize.
- Account.processOfx / uploadOfx: XMLParser numeric TRNAMT/BALAMT; amount sign
  conversion, cent-rounded delta/remainder paths, but raw AccountTransaction and
  new JSON split writes can still use provider numeric values.
- Account.adjustInitialFunding: current balance minus relational transaction sum;
  creates/updates STARTING_BALANCE AccountTransaction + JSON split and pool balance.
- Internal auto-assignment and FundingDialog allocations convert to rounded cents,
  allocate residuals, then divide by 100. Budget.getProposedFunding rounds goal/month
  division and planned amounts; no-goal branch returns persisted fundingAmount.
- CheckBalances command reads JSON sums vs scale-two balances using rounded cents;
  its optional correction mode writes balances. Do not run it for this design.
- Webhook/jobs reach provider sync; historical migrations copied amounts and JSON.
  Fixture/direct ORM writes bypass HTTP entirely. No general model cent guard exists.

All current numeric HTTP schemas above accept finer precision by source. Only the
original manual transaction POST is previously runtime-characterized for sub-cent
persistence; other route consequences remain source predictions until focused runs.

## Confirmed source path

POST 0.004 -> addTransaction vine.number -> raw transaction.categories JSON and
AccountTransaction.amount attribute. AccountTransaction create/save sends numeric
value to numeric(12,2), but does not reload its rounded value into the model. Account
balance adds the in-memory amount; each Category adds the raw JSON split amount.
Their saves independently round at the database boundary. Response category/account
balances use saved in-memory models; the preloaded AccountTransaction can reflect
relational scale-two value while JSON splits retain 0.004. Subsequent ORM reads use
rounded columns, while Category.balances and reports parse JSON amount as unscaled
decimal. Three 0.004 writes therefore retain JSON total 0.012 while decimal total
and persisted balance effects are 0. PostgreSQL normalization is rounding, not a
shared application normalization step.

Previously observed 0.005 -> decimal 0.01 and -0.005 -> decimal -0.01; raw JSON and
some response balances retain +/-0.005. PostgreSQL numeric ties are expected away
from zero; the prepared installed-server probe verifies all signed thresholds.
Update paths similarly undo/add raw JSON effects and merge raw monetary attributes;
existing row reloads do not remove the risk for newly supplied amounts. Transfer
writes JSON and uses raw per-category deltas before scale-two Category saves.

## Rounding and product evidence

Money inputs are text inputs, not number inputs with step=0.01. AmountInput formats
with toFixed(2), rounds on blur, but forwards the original form event; that is not
an API or form-value precision guarantee. Amount displays two decimals. Relational
money columns, split conservation, residual cent allocation and existing cent tests
all support two-decimal *posted* currency intent. No evidence requires sub-cent
posted balances. Provider SDK numeric types and generic XML parsing impose no
source precision limit; legitimate provider precision beyond cents is not established
or excluded by repository evidence. Do not assume a provider business contract.

Pure JS results: Math.round(-0.005*100)/100 is negative zero, unlike the previously
observed numeric -0.01. Math.round(1.005*100)/100 and 1.005.toFixed(2) produce 1.00,
not expected PostgreSQL 1.01. Sign*round(abs(value)*100) fixes sign symmetry but
still gives +/-1.00 for +/-1.005. No tested ordinary floating rounding strategy
universally matches decimal half-away-from-zero.

## Policy comparison and recommendation

A. Reject sub-cent actual currency inputs: simplest explicit manual API policy,
no silent value change, aligns JSON with scale-two storage for supplied amounts.
Breaks historical callers that send fractional cents or even canonical JS values
such as 0.30000000000000004. Must validate every split independently, not just sum.

B. Normalize at ingress: requires a product-approved decimal rounding rule,
preferably half-away-from-zero if matching numeric storage. Normalize *before*
JSON, balance effects and responses. Per-entry rounding can break source/split
conservation; a second coherent allocation decision is needed. Binary Math.round
or toFixed is insufficient. Silent mutation of manual input is a product choice,
not a safe default. Raw import/provider provenance should remain separate.

C. Higher precision everywhere: schema changes for all money/balance/statement
columns, UI formatting, conservation, aggregates, provider conversions, reversals
and JSON. Merely widening AccountTransaction.amount would not suffice. No current
product evidence justifies this broad migration.

D. Boundary-specific: distinguish explicit actual-currency input, computed
intermediates and provider provenance. This is compatible with A for manual input
and an explicit provider policy later; does not license inconsistent posted state.

Recommend A for manual actual-currency input, within D's distinction between
posted state and transient/provider values. Require an explicit product decision
before implementation, including the compatibility impact on binary-derived JSON
numbers. Keep decimal currency-unit runtime numbers and scale-two schema; exact
signed integer cents are a validation/calculation boundary, not a database rewrite.
The test-only exact-decimal candidate handles canonical exponent representations
without binary multiplication or epsilon. Storage range numeric(12,2) is a separate
limit: +/-9,999,999,999.99; do not invent another business maximum.

Do not deploy a global persistence rejection guard until provider and internal
writers have explicit compatible behavior. HTTP validation alone is not complete:
cent-exact additions/subtractions still create binary noise, and raw provider
amounts, audit snapshots, Statement data/taxes, fixed funding config and legacy
JSON remain outside relational rounding. Derive posted generated allocations from
exact cent inputs/sums where already naturally cent-based; keep raw unposted
provider information distinct. Do not silently reinterpret provider values.

## Prepared verification

moneyPrecision.spec.ts preserves closed auto-assignment tests and extends manual
POST to 15 inputs: zero, signed one cent, signed .004/.005/.006, +/-1.234, numeric
strings, and 0.1+0.2. Adds a 12-value SELECT numeric(12,2) signed threshold probe
(no schema objects), 13-case transaction PATCH + transfer POST/PATCH controls, and 12-case Category
PATCH/funding-plan PUT/Statement POST+PATCH currency and JSON controls.
Transfers may reject signed half-cent pairs because Math.round(+.5)+Math.round(-.5)
is 1 rather than 0; this is a source hypothesis to record, not a rounding fix.
Logs distinguish JSON, raw decimal strings, ORM reads, response and persisted
balances. Existing three-write 0.004 evidence is retained.

Remaining focused writer follow-ups before a broad implementation: Category
POST, offline opening balance, history balance, monetary tax snapshots, and provider
add/update controls with sub-cent supplied values. Source inventory establishes
candidate boundaries; it does not runtime-prove each one. No loan behavior work.

currencyPrecisionDesign.spec.ts runs pure signed exact-scale detection and all 12
JS rounding values. A strict candidate deliberately rejects 0.1+0.2's canonical
number while accepting separately supplied .1/.2/.3, 0.29, numeric trailing zeroes
and scientific notation. It is test-only; no new production money helper exists.

## Read-only legacy audit plan (not executed)

Choose and explicitly authorize the actual application-data target separately.
Use a read-only repeatable-read transaction and SELECT JSON as text. Inspect
transactions.categories[].amount, baseAmount, fixed fundingCategories amounts,
transactions.taxes[].amount, Category fixed funding config, Statement.data currency
fields, Tax.data currency fields and relevant change-log snapshots. Do not apply
cent checks to percentages, rates, counts or dates. Separate authoritative current
state, forecast configuration and historical audit records.

Join transactions to account_transactions by transaction_id for signed allocation
sum comparison (exclude/category-label transfers without an account relation and
flag multiple associations separately). Distinguish per-entry precision violation,
exact signed cent-total disagreement, unknown/unassessable totals and harmless
binary representation noise requiring policy interpretation. Compare Category
stored balances with dated/applicable nondeleted JSON effects only after respecting
opening/pending/account tracking semantics; never assert a naive sum is a repair.
Relational numeric(...,2) already has cent scale; JSON snapshots and provider logs
may not. Restrict output to relevant record IDs, monetary values and mismatch
classes; no raw unrelated provider/account/user data. No repair can be inferred
from these differences alone.

Database execution required next: only localhost:5432/spendcraft_test, with fresh
fractional-cent monetary persistence characterization authorization and both
configured/live pg/pgLog safeguards before bootstrap/reset. No full suite in design.

## Runtime results (unchanged production)

The final authorized moneyPrecision characterization passed 72 cases. Both pg and
pgLog configured/live targets were verified localhost:5432/spendcraft_test before
each run. No application-data database was queried and no policy was implemented.

All 12 numeric(12,2) casts matched decimal nearest rounding with ties away from zero:
+/-0.004 -> 0; +/-0.005 and +/-0.006 -> +/-0.01; +/-1.004 -> +/-1; +/-1.005 and
+/-1.006 -> +/-1.01. Manual Transaction POST/PATCH accepted sub-cent amounts and
strings; JSON preserved coerced values while relational amounts and fresh balances
rounded. Immediate Account/Category response balances retained input precision.
Three 0.004 writes reproduced JSON 0.012 versus relational/balance totals 0.

Transfer POST/PATCH accepted .004 and .006 (and their negatives), but .005/- .005
zero-sum pairs returned 422 due to asymmetric per-split Math.round. Failed requests
left records/balances unchanged. Transfer JSON retains raw amounts; unchanged PATCH
responses can instead show already-rounded balances because the net update is zero.

Category fundingAmount PATCH and funding-plan PUT accepted raw values and returned
raw currency configuration while a reload used scale-two values. Future proposals
read reloaded configuration by source; generation was not executed in this run.
Statement POST/PATCH similarly returned raw supplied balances while columns rounded;
Statement income JSON retained raw amounts. Balance-tracked Statement controls
confirmed fresh current Account balances 0/.01/-.01/.3 for inputs .004/.005/-.005/
.30000000000000004, while endingBalance responses retained the raw values.

.30000000000000004 returned 200 across the added controls; JSON and fresh JSON reads
retained it, scale-two persistence became .30, and fresh actual balances became .3.
Strict-decimal rejection would reject it. Binary-near-cent recognition requires an
explicit, tightly bounded product rule plus canonicalization before JSON/calculation
and cannot be justified as arbitrary epsilon rounding. Neither policy is implemented.

Additional policy/characterization remains for provider, opening/history, forecast
and fixed-currency configuration boundaries before any global persistence guard.
The leading manual-input reject policy remains provisional.
