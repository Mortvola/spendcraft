# Remaining monetary storage inventory

Source characterization on October 23, 2026. HEAD: `5d98bbc558b8af21f6482805510e684acbcf3489`; branch: `dollar-to-cents-2`.

This inventory does not select or design another migration. No database was accessed. Types, defaults and nullability below are source-defined, not an independent certification of the current live schema. PostgreSQL `numeric` is exact decimal storage; JavaScript `number` hydration and JSON-number APIs are separate boundaries.

## Baseline and preservation

At entry the index contained changes to `adonisrc.ts`, `installer/Installation.md`, `scripts/sql/stagingCategoryAmountsToNumbers.sql`, and `tests/unit/historicalConversionPackaging.spec.js`. There were no tracked unstaged changes. Existing untracked files included generated `.adonisjs/`, editor configuration, SQL dumps, a PEM file and assorted local reports/test artifacts. They were not opened for financial data or credentials and were preserved. This task adds only this document, unstaged.

Read the monetary scope, accounting invariants, correctness readiness, Transaction Category storage design, implementation and historical readiness documents. Older documents contain dated pre-conversion evidence and pending work; the operator's newly accepted completion supersedes those status descriptions. They are not evidence that conversion remains outstanding.

**Loans and the entire `transaction_categories` architecture are deprecated and excluded from the exact-money migration, regardless of where they are referenced.** No fields from those paths are included in the active counts. BalanceHistory is also explicitly deprecated by the accounting invariants and has no supported balance-write lifecycle. Historical schema presence alone does not make a field active.

## Counts and counting rules

A relational field means one table/column; a JSON path means one named leaf pattern, with `[]` representing any array position. Optional paths count once. Polymorphic fields count once as a monetary location and are additionally described in rate mode; they are not counted twice. These are source fields, not populated-row or runtime-occurrence counts.

| Measure | Count | Basis |
| --- | ---: | --- |
| Remaining known active monetary locations | **37** | 8 relational columns + 29 named JSON-number paths, including diagnostic copies |
| Active relational monetary columns | **8** | Seven exact decimal columns and one polymorphic floating column |
| A: exact decimal relational money | **7** | All `numeric(12,2)` |
| B: floating relational money | **1** | `auto_assignment_categories.amount` in fixed mode, PostgreSQL `real` |
| C: integer minor-unit monetary columns | **0 found** | Integer schema fields are IDs, counts, years, versions or recurrence, not persisted cents |
| D: remaining application/configuration JSON-number money paths | **21** | 4 Transaction/config paths + 4 Statement paths + 13 forecast paths |
| D: additional named diagnostic JSON-number money paths | **8** | Two TransactionLog paths + six Plaid response paths |
| E: completed canonical decimal-string money paths | **1** | `transactions.categories[].amount`; outside remaining 37 |
| Polymorphic money/percentage locations | **3** | Auto-assignment relational amount; Category funding rule amount; Transaction funding-rule snapshot amount |
| H: named money fields with unresolved type/meaning | **0 among the 37** | Live presence is not queried |
| Open diagnostic payload surfaces with unbounded/unspecified additional paths | **3** | Transaction changes, raw Plaid responses/errors, raw verified webhooks; not three additional confirmed money fields |

There are **38 known monetary storage locations including the completed path**. This finite count is not a claim that arbitrary provider payloads can contain only the enumerated paths. The open payload contract and its limitations are recorded below rather than inventing a count of undocumented fields. Currency variants use the same leaf and are not separately counted.

Classification: A exact scaled relational decimal; B floating relational; C integer minor unit; D JSON numeric money; E decimal text; F mixed/legacy representation; G rate/percentage, not money; H insufficient source evidence. Diagnostic historical values can be absent/null and are not monetary zero.

## Relational field inventory

Runtime/API types refer to active model paths. All seven decimal money fields have explicit model `consume` functions using `parseFloat`; generated schema classes describe raw decimal values as strings. No global PostgreSQL numeric-to-number parser was found. Raw SQL decimal aggregates can remain strings until explicitly parsed or cast to float.

| Table / column | PostgreSQL definition; null/default | Semantics / authority | Class; model runtime; API | Active writers / input / precision | Active readers / arithmetic | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| `accounts.balance` | `numeric(12,2)`; nullable; no monetary default | Accounting balance for transaction tracking; latest relevant Statement ending balance for balance tracking; initialization snapshot | A; `number` (SQL null consumed as 0); JSON number | `InstitutionController.addOffline`, `addOfflineAccount`, online `add`; `Account.addTransaction`, `updateTransaction`, `deleteAccountTransaction`, `processOfx`; `Institution.updateAccountBalances`; `AccountsController.addTransaction`, `update`, Statement add/update/delete; `TransactionsController.update/delete`. Numeric DTO/provider inputs and numeric deltas. No universal pre-save cent quantizer; startDate Category adjustment uses cents separately. DB enforces scale. | Budget/Institution account responses, Account lifecycle arithmetic, opening formula, account charts, net worth; client numeric cache/display | [Account](../app/Models/Account.ts), [Institution](../app/Models/Institution.ts), [AccountsController](../app/Controllers/Http/AccountsController.ts), [InstitutionController](../app/Controllers/Http/InstitutionController.ts), [TransactionsController](../app/Controllers/Http/TransactionsController.ts); migration `1626490244844_accounts.ts` |
| `accounts.plaid_balance` | `numeric(12,2)`; nullable; no default | Provider-reported observation, distinct from accounting balance | A; `number \| null`; JSON number/null | Plaid `Institution.updateAccountBalances` and online setup; OFX `Account.processOfx`. Plaid numbers; OFX decimal text validated then `Number(value)`. No generic cent validator at this column; DB scale. | Display/provider comparison; Plaid initialization can copy observation into accounting balance. OFX LEDGERBAL never directly replaces accounting balance. | [Institution](../app/Models/Institution.ts), [Account](../app/Models/Account.ts); migration `1630751986203_accounts.ts` |
| `account_transactions.amount` | `numeric(12,2)`; nullable; no default; active nominal writers supply amount | Signed nominal account movement and ordinary/opening conservation reference | A; model `number` despite SQL nullability; JSON number | Manual CREATE/PATCH: Vine number; OFX parsed amount; Plaid signed transformed number; opening calculation. `Account` and controllers above, `updateStartingBalance`. Storage codec conservation checks individual rounded cents on applicable allocation writes, not a universal ban on sub-cent movement input. Database applies scale on persistence. | Account/Category eligibility, opening sums, statements, reports and tax/report source selection; raw SQL SUM then parse/cast, server/client arithmetic | [AccountTransaction](../app/Models/AccountTransaction.ts), [transaction validators](../app/validation/Validators/transaction.ts), [ReportController](../app/Controllers/Http/ReportController.ts); migration `1626493234339_account_transactions.ts` |
| `categories.balance` | `numeric(12,2)`; NOT NULL; no monetary default; originally column `amount`, later renamed | Authoritative Category state, including Unassigned and Funding Pool rows | A; `number`; JSON number | Initial zero via Category/Budget creation; ordinary/manual/provider/startDate effects; funding/rebalance and supported DELETE/cascades. Direct numeric `+=`/`-=` and some cent deltas; not globally exact arithmetic before DB storage. | Funding proposals, Category/report balances, Pool sufficiency, API caches and Category tables | [Category](../app/Models/Category.ts), [Budget](../app/Models/Budget.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts); migrations `1626492670876`, `1626808419563`, `1699459162542` |
| `categories.funding_amount` | `numeric(12,2)`; NOT NULL DEFAULT 0 | Configuration: fixed planned/goal amount; goalDate/recurrence change interpretation/timing, not monetary representation | A; `number`; JSON number | `CategoriesController.addCategory/updateCategory`, Vine `fundingAmount: number` optional; direct model save, DB scale, no explicit two-decimal input requirement | `Budget.getProposedFunding` fixed/goal/recurrence calculations, client Category settings and Funding UI | [Category](../app/Models/Category.ts), [category validator](../app/validation/Validators/category.ts), [Budget](../app/Models/Budget.ts); migration `1699460928824_categories.ts` |
| `statements.starting_balance` | `numeric(12,2)`; NOT NULL; no default | User-entered Statement snapshot; initialization can seed from Account | A; `number`; JSON number | `AccountsController.addStatement/updateStatement`; initial offline Statements in `InstitutionController.addOffline/addOfflineAccount`. Vine number/direct numeric assignment, DB scale, no universal cent check. | Statement reconciliation/read DTOs, statement UI; balance-difference computations | [Statement](../app/Models/Statement.ts), [statement validators](../app/validation/Validators/statement.ts); migration `1733332231416_statements.ts` |
| `statements.ending_balance` | `numeric(12,2)`; NOT NULL; no default | Statement snapshot; latest relevant Statement is accounting balance authority only for balance-tracked Accounts | A; `number`; JSON number | Same paths and validation as starting balance; add/update/delete Statement can copy latest ending balance into Account. | Statement UI, balance tracking, net worth and reconciliation/reporting | Same sources as starting balance; [ReportController](../app/Controllers/Http/ReportController.ts) |
| `auto_assignment_categories.amount` — `percentage=false` | Knex `float`, PostgreSQL `real`; NOT NULL; no amount default. `percentage` DEFAULT false, nullable | Fixed allocation configuration money | B; `number` via `parseFloat`; JSON number | `AutoAssignmentsController.post/patch` stores Vine numeric amount unchanged; no two-decimal constraint, DB binary floating precision, no monetary decimal scale | `Account.autoAssign`: `Math.round(cat.amount * 100)`, fixed entries applied before percentage entries; rounding on use does not make the stored rule cent-exact | [AutoAssignmentCategory](../app/Models/AutoAssignmentCategory.ts), [AutoAssignmentsController](../app/Controllers/Http/AutoAssignmentsController.ts), [autoAssignment validator](../app/validation/Validators/autoAssignment.ts); migration `1718921355278_auto_assignment_categories.ts` |

Funding Pool is a Category, not a separate money table. Opening amount is an AccountTransaction plus the completed Category allocation, not a separate opening column. `account_transactions.principle` and Loan-only amounts are excluded, even where the shared models/DTOs retain them.

## Application JSON-number money (21 paths)

All rows below are D, runtime/API `number` unless noted. JSONB represents numeric tokens as PostgreSQL numeric, but these writers start with JavaScript numbers: no fixed two-decimal scale follows from JSONB. JSON serialization is not the decimal-string storage boundary implemented for allocation `amount`.

### Transaction and funding configuration (4 paths)

| Table / JSON path | Optionality / lifecycle | Authority / semantics | Writer, validation and precision | Reader / API / arithmetic | Sources |
| --- | --- | --- | --- | --- | --- |
| `categories.funding_categories[].amount` when `percentage=false` | Column JSONB NOT NULL DEFAULT `[]`; array entries require amount; fixed-mode rule | Configuration money: fixed funding spread | Category CREATE/PATCH copies validated numeric rules; `Category.fundingCategories` JSON.stringify; no cent-scale rule for fixed mode | `Budget.getProposedFunding` passes configuration; `calculateFunding.computeSpread` converts fixed money to rounded cents; client Category settings and spread editor use numbers | [Category](../app/Models/Category.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [category validator](../app/validation/Validators/category.ts), [calculateFunding](../client-src/Funding/calculateFunding.ts); migration `1720894090578_categories.ts` |
| `transactions.categories[].baseAmount` | Optional entry metadata, chiefly type 2; type 3 request shape can also carry it; JSONB categories column | Requested pre-transfer funding base; informational calculation snapshot, not net allocation or reversal authority | `FundingDialog.handleSubmit` / `calculateFunding`, numeric DTO, `CategoriesController.transfer` CREATE/replacement persists `category.baseAmount`; Vine number optional. Allocation encoder copies this metadata unchanged; no cent normalization for this leaf | Funding edit state and `CategoriesController.get` SQL `sum(coalesce(baseAmount,0))`; numeric API; further funding calculations. Could preserve numeric floating artifact even when sibling amount is canonical text. | [FundingDialog](../client-src/Funding/FundingDialog.tsx), [calculateFunding](../client-src/Funding/calculateFunding.ts), [categoryTransfer validator](../app/validation/Validators/categoryTransfer.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [categoryAmountCodec](../app/services/categoryAmountCodec.ts) |
| `transactions.categories[].fundingCategories[].amount` when `percentage=false` | Optional rule snapshot in type 2/3 allocation metadata; required amount within each supplied rule | Fixed-money configuration snapshot used for funding reconstruction | Same transfer CREATE/replacement writes numeric nested metadata; Vine number and funding-percentage validator (percentage mode only); central encoder only changes outer allocation amount | Funding edit/recalculation and transaction API; `computeSpread` rounds fixed-rule use to cents. No decimal-text conversion of this nested amount. | Same transfer/Funding sources as baseAmount; [funding percentages](../common/fundingPercentages.ts) |
| `transactions.taxes[].amount` | JSONB NOT NULL DEFAULT `[]`; supplied via PATCH `taxCategories`; nonempty type strings retained | Tax/reporting attribution money, not posting or Account balance authority | `TransactionsController.update` constructs `{type, amount}` numbers; Vine numeric field; `Transaction.taxes` JSON.stringify; no cent-scale validation/rounding | Transaction API/editing, `TaxesController.getActuals` `jsonb_to_recordset(... amount real)` then SQL SUM; client tax attribution/calculations. SQL real here is a reader cast, not relational column storage. | [Transaction](../app/Models/Transaction.ts), [TransactionsController](../app/Controllers/Http/TransactionsController.ts), [transaction validator](../app/validation/Validators/transaction.ts), [TaxesController](../app/Controllers/Http/TaxesController.ts); migration `1787243890453_alter_transactions_table.ts` |

There is no top-level `transactions.base_amount` column in generated schema/migrations. `funder`, `includeFundingTransfers`, Category IDs and comment are not additional money. Transfer deductions use the outer allocation amount, already completed, not a separate persisted transfer total.

### Statement attribution (4 paths)

`statements.data` is nullable JSONB with no default. Data is optional; when supplied, its four monetary fields are required by the validator. Each is a user-entered reporting snapshot, not posting authority. `AccountsController.addStatement/updateStatement` copies numbers after Vine validation, within the owning Budget transaction; no two-decimal rule or rounding is applied. `Statement.data` is decoded JSON, returned numerically in Statement DTOs. `TaxesController.getActuals` casts these leaves to `real`, sums them and uses them in tax actuals. Client Statement editing uses AmountInput; client tax state performs number arithmetic. The database imposes no monetary scale on these JSON leaves.

| Table / path | Class | Meaning | Writer / reader references |
| --- | --- | --- | --- |
| `statements.data.shortTermCapitalGains` | D | Short-term gains attribution | [statement validators](../app/validation/Validators/statement.ts), [AccountsController](../app/Controllers/Http/AccountsController.ts), [Statement](../app/Models/Statement.ts), [TaxesController](../app/Controllers/Http/TaxesController.ts) |
| `statements.data.longTermCapitalGains` | D | Long-term gains attribution | Same functions/sources |
| `statements.data.dividends` | D | Dividends attribution; read as ordinaryDividends in tax actuals | Same functions/sources |
| `statements.data.taxableInterest` | D | Taxable interest attribution | Same functions/sources |

Schema: `1785956002715_alter_statements_table.ts`. Historical migration initialization is not an active BalanceHistory writer and does not make that deprecated subsystem part of this inventory.

### Tax forecasts (13 paths)

`taxes.data` is JSONB NOT NULL, no default. `TaxesController.post` validates forecast numbers and stores `requestData.forecast` through Tax on CREATE/update, under the owning Budget lock/transaction. `Tax extends TaxSchema` overrides data typing, not monetary representation. There is no decimal conversion or two-decimal validation. `TaxesController.get/post` returns these values in `forecast`; client `State/Taxes` computes income, gains, tax and estimates with numbers. They are user-entered forecast/configuration snapshots, not ledger postings. Sources: [Tax model](../app/Models/Tax.ts), [tax validator](../app/validation/Validators/tax.ts), [TaxesController](../app/Controllers/Http/TaxesController.ts), [client Income](../client-src/State/Taxes/Income.ts), [client Taxes](../client-src/State/Taxes/Taxes.ts), [client Estimated](../client-src/State/Taxes/Estimated.ts). Schema: `1785801445008_create_taxes_table.ts`; Budget ownership added by `1786590318871` / `1786637621875`.

| Table / JSON path | Required? | Class | Monetary meaning |
| --- | --- | --- | --- |
| `taxes.data.taxableInterest` | Yes | D | Taxable interest forecast |
| `taxes.data.qualifiedDividends` | Yes | D | Qualified dividend forecast |
| `taxes.data.ordinaryDividends` | Yes | D | Ordinary dividend forecast |
| `taxes.data.taxableIraDistributions` | Yes | D | Taxable IRA distribution forecast |
| `taxes.data.taxablePensionAndAnnuities` | Yes | D | Taxable pension/annuity forecast |
| `taxes.data.taxableSocialSecurityBenefits` | Yes | D | Taxable benefit forecast |
| `taxes.data.additionalTaxableIncome` | Yes | D | Additional taxable income forecast |
| `taxes.data.shortTermCapitalGains` | Yes | D | Short-term gains forecast |
| `taxes.data.longTermCapitalGains` | Yes | D | Long-term gains forecast |
| `taxes.data.qualifiedBusinessIncomeDeduction` | Yes | D | Deduction amount, not a rate |
| `taxes.data.estimated.expectedAgi` | Only if optional estimated object supplied | D | Expected adjusted gross income |
| `taxes.data.estimated.priorYearAgi` | Same | D | Prior-year adjusted gross income |
| `taxes.data.estimated.priorYearTotalTax` | Same | D | Prior-year tax amount |

No separate persisted tax total, tax liability column, income snapshot table or Budget target money column was found in the active schema. Calculated client worksheets, tax brackets and standard-deduction constants are not persisted forecast fields simply because their interfaces contain monetary numbers.

## Diagnostic monetary copies (8 named paths)

These are persisted observations/audit information, not accounting authorities. They are included rather than silently treating logs as nonmonetary. Null/optional values remain null/absent. Their schemas do not constrain monetary scale.

| Table / column.path | Type / class | Writer and source input | Reader / API / precision / authority |
| --- | --- | --- | --- |
| `transaction_logs.changes.amount.old` | JSON number; D | `getChanges` called by manual `TransactionsController.update` and Plaid `Account.updateTransaction`, records old numeric AccountTransaction amount; `TransactionLog.changes` JSON.stringify | Transaction log endpoint / audit UI; numeric old value; informational snapshot, no posting; no rounding |
| `transaction_logs.changes.amount.new` | JSON number; D | Same paths, proposed replacement numeric movement amount | Same; proposed value can have more precision than final numeric(12,2) column; no automatic scale enforcement for the log |
| `plaid_logs.response.accounts[].balances.current` | JSON number/null; D | `PlaidWrapper.getAccounts/getBalance/getTransactions/syncTransactions` logs SDK response.data, through `PlaidLog.response` redaction then JSON.stringify | Diagnostic log readers retain provider response; provider-reported observation; no application quantization |
| `plaid_logs.response.accounts[].balances.available` | JSON number/null; D | Same | Available funds observation; no posting authority |
| `plaid_logs.response.accounts[].balances.limit` | JSON number/null; D | Same | Credit/overdraft limit observation, still money; no posting authority |
| `plaid_logs.response.transactions[].amount` | JSON number; D | `PlaidWrapper.getTransactions` logs original SDK response | Provider transaction observation; retained provider sign, not assumed equal to AccountTransaction sign |
| `plaid_logs.response.added[].amount` | JSON number; D | `PlaidWrapper.syncTransactions` logs SDK added rows | Same; original provider money before accounting transform |
| `plaid_logs.response.modified[].amount` | JSON number; D | Same for modified rows | Same |

Sources: [transactionFields.getChanges](../app/Controllers/Http/transactionFields.ts), [TransactionLog](../app/Models/TransactionLog.ts), [Account](../app/Models/Account.ts), [TransactionsController](../app/Controllers/Http/TransactionsController.ts), [Plaid wrapper](../providers/Plaid/Plaid.ts), [PlaidLog](../app/Models/PlaidLog.ts), [redaction](../providers/Plaid/redactDiagnostics.ts). Local installed SDK `node_modules/plaid/dist/api.d.ts`: AccountBalance, AccountsGetResponse, TransactionsGetResponse, TransactionsSyncResponse establish numeric provider shapes. Loan-specific SDK fields are excluded.

`PlaidWrapper.log` writes through the separate `pgLog` connection, outside the owning financial transaction/Budget gate; this is diagnostics, not financial serialization authority. `config/database.ts` currently points pg and pgLog at the same configured PG database. TransactionLog creation is through the owning Transaction relationship/transaction. Do not assume a financial rollback also removes an independently persisted Plaid response.

### Open payloads and representation uncertainty

1. `transaction_logs.changes` is `Record<string, unknown>` JSON. The two active known movement-money paths above are definite. `getChanges` skips normal array diffs (TODO), so it does not systematically snapshot Category/tax arrays. Object/null branches can copy values; historical or externally written changes may contain numeric or string nested allocation metadata. Those arbitrary residual paths are **H/F possibilities**, not a countable additional fixed monetary schema. No guarantee that the outer allocation migration changed audit history.
2. `plaid_logs.response` accepts unknown response/error payloads, redacts credential keys but preserves other numbers. The six known nonloan monetary paths above are explicit examples from actual invoked SDK methods; extra provider/error fields are an **open H surface**. Source cannot certify an exhaustive list of arbitrary provider extensions or historical payloads, nor their live frequency.
3. `webhook_logs.request` is JSON of the entire signature-verified request body (`WebhookController.post`), redacted on prepare. Supported transaction/item events carry IDs/counts/status, with no fixed money leaf in their application interface. The raw body can retain additional properties; no confirmed monetary leaf is counted. Additional monetary content is **H**, not an assertion that counts such as new_transactions are money. Sources: [WebhookLog](../app/Models/WebhookLog.ts), [WebhookController](../app/Controllers/Http/WebhookController.ts).

JSON column declarations do not establish current historic content. No live JSON scan was authorized or performed. The inventory is complete for statically defined active monetary paths and explicitly leaves these open containers unbounded.

## Completed allocation storage — E

**`transactions.categories[].amount`: COMPLETED — DECIMAL-STRING STORAGE.**

`categoryAmountCodec.storedCategoryAmount` validates supported numeric/canonical values, checks safe cents, uses approved `(Math.round(amount * 100) / 100).toFixed(2)` behavior for numeric input, and verifies the cent representation. Encoding shallow-copies metadata and changes only the outer amount. Duplicate positions, Category IDs and optional properties remain. Canonical storage is decoded for numeric runtime/API consumers; temporary numeric/string/mixed reader support remains intact. Reads do not normalize rows by saving them.

Boundary: [categoryAmountCodec](../app/services/categoryAmountCodec.ts), [categoryStorageBinding](../app/services/categoryStorageBinding.ts), [transactionCategoryStorage](../app/services/transactionCategoryStorage.ts), [Transaction hooks](../app/Models/Transaction.ts). Supported active types 0/5 ordinary, 2 funding, 3 rebalance and 4 opening; scoped away from deprecated lifecycles. Applicable new/replacement state uses checked individual-cent conservation, including opposite-signed Pool and non-Pool funding, and same-signed ordinary/opening AccountTransaction amounts. Metadata-only updates and historical deleted exceptions are not globally revalidated as new financial submissions.

Operator-accepted production post-conversion audit: 6,268 Transactions; 10,474 canonical allocation strings; zero numeric amounts, candidates or malformed records; 6,255 conservation passes, 10 failures and 3 unsupported, with all 13 exceptions deleted and preserved. Staging conversion/recovery/idempotency/reconversion and functional checks passed. These are supplied accepted execution results, not a database inspection performed for this inventory. No migration is reopened. The temporary decoder compatibility (potential F input) does not reclassify the completed production E storage as unfinished.

## Rate/percentage modes — G, not additional money

| Field/mode | Representation | Semantics and validation |
| --- | --- | --- |
| `auto_assignment_categories.amount` when percentage=true | PostgreSQL real; JS/API number | Percent of transaction remainder after fixed allocations. `Account.autoAssign`: `Math.round(transactionAmount * (cat.amount / 100) * 100)`. Numeric validator does not apply the funding-rule percentage constraints. SQL percentage can be null; falsy runtime branch treats it as fixed. No assertion made about historical null prevalence. |
| `categories.funding_categories[].amount` when percentage=true | JSONB number | Percentage spread, not dollars. `fundingPercentagesRule` / `validateFundingPercentages` enforce finite nonnegative percentages with at most two decimal places and exactly 100% total when percentage entries exist. Fixed-money entries are not subjected to percentage precision validation. |
| `transactions.categories[].fundingCategories[].amount` when percentage=true | JSONB number | Persisted percentage-rule snapshot, same validation on new transfer submissions. Outer amount string encoding leaves this percentage numeric. |
| `accounts.rate` | `numeric(5,3)`, nullable; number/null after consume | Rate, not currency. Shared model/offline Account request can carry it. Loan-specific use is excluded, and no active nonloan monetary authority is inferred. |

Identifiers, funding recurrence, goal dates, booleans, filingStatus, years, sort order, versions, latitude/longitude, status codes, token timestamps, request counts and SDK transaction counts are not money. There is no separate goal-amount column: goal money uses `categories.funding_amount`.

## Reader, writer and precision boundaries

- **Relational decimal storage:** seven columns store exact decimal values at scale 2, maximum finite magnitude 9,999,999,999.99 for numeric(12,2). PostgreSQL scale rounding/range enforcement occurs on assignment; it does not prove preceding JavaScript sums exact. Model consume functions produce binary floating-point numbers; numeric API serialization is intentional. AccountTransaction SQL nullability versus model `number` is a representational mismatch, not certification all active rows are nonnull.
- **Floating configuration:** Knex's PostgreSQL compiler emits `real` for `float`; the auto-assignment amount is binary floating storage. Rounding in `autoAssign` happens when applying the rule, after storage. Fixed money and percentages share a column and have different units.
- **JSON:** Category funding configuration, baseAmount/rule snapshots, Statement attribution, tax forecast and tax attribution writers use numeric DTOs/direct object assignment/JSON.stringify without the completed outer-amount codec. No universal two-decimal constraint exists for those 21 paths. JSONB's numeric token support cannot recover intended decimals lost before serialization. JSON logs likewise preserve number serialization, not a scale rule.
- **Validation:** Vine `number()` is numeric validation/coercion, not `.decimalPlaces(2)` or an integer-cent guarantee. AmountInput and Amount/`toFixed(2)` display/edit boundaries do not establish persistence-wide cent validation. Some allocation/conservation calculations use checked cents; Account balance, funding metadata, forecasting and many aggregate paths still use ordinary number arithmetic.
- **SQL reads:** Category/Funding History/Income Vs. Expenses use approved Transaction JSON allocation authority with explicit decimal extraction; response builders parse/cast as needed. Tax actuals explicitly cast JSON money to `real`, introducing a floating computation boundary even though the originating JSONB token is decimal. Report crosstab float output and SQL SUM results are derived responses, not additional stored columns. Budget Progress's deprecated relational allocation queries are excluded entirely.
- **Client reads:** Account/Category caches and Funding/Tax MobX state hold numeric API values for arithmetic. AmountInput and reusable [Amount](../client-src/Amount.tsx) formatting are presentation/input behavior, not persistent exact-decimal state. Inspecting localStorage use found UI expansion flags, not an additional persisted financial cache. JWT Redis values and webhook-key Redis caches hold auth IDs/keys, not money. No active monetary queue payload store was identified by the application writer search.

### Transaction binding / Budget gate characterization

| Writer family | Observed boundary |
| --- | --- |
| Manual CREATE/PATCH/DELETE; Account startDate; Statement operations | Controllers begin DB transaction, bind user/owning Budget, acquire Budget FOR UPDATE, reload resources and save through that transaction. Monetary inputs/deltas remain numeric except encoded outer allocations. |
| OFX/Plaid; opening; offline/online initialization | Account/Institution helpers use caller transaction (`$trx`); sync/setup and financial controller gates own Budget serialization. Helpers are not independent lock mechanisms. Opening computes Account balance minus applicable movements and persists type 4. |
| Category settings, funding/rebalance and Category/Account/Institution deletion | Controller-owned Budget gate and transaction; numeric configuration/Category balance saves, with allocation storage boundary applied separately. No new concurrency claim about historical reversal accuracy. |
| Auto-assignment configuration | Controller post/patch takes Budget gate, authorizes Categories, writes parent/child through transaction-bound relationships; applying rules occurs inside Account lifecycle. |
| Tax forecast | Controller post's Budget-gated transaction performs Tax read/create/update; subsequent actuals query is a read outside the mutation transaction. |
| Audit/provider logs | Transaction logs through related transaction; Plaid diagnostics explicitly separate pgLog save and retention. Webhook logging independent of a Budget mutation; no financial amount authority. |

This is a storage-oriented source trace, not a repeat of real concurrency acceptance or a complete new lock audit. No extra locks or infrastructure changes are proposed.

## Schema reconciliation and exclusions

- Migrations originally call `categories.amount` monetary state; `1699459162542_categories` renames it to `balance`. Generated schema and active model agree on balance. Do not count both names.
- `FundingPlanCategorySchema` and physical funding-plan tables remain in generated schema/migration history, but no active FundingPlan model/writer is present; `FundingPlanController.getProposed` delegates to current Category configuration. Old amount/expected_to_spend columns are inactive historical storage, not active configuration fields. No removal or migration is proposed.
- `database/schema.ts` maps decimal columns to raw string types, while hand-written active Account, AccountTransaction, Category and Statement models convert decimals to numbers. This is explained hydration, not evidence that PostgreSQL stores floating values in those decimal columns.
- `1630751986203_accounts.ts` down migration spells the drop column `place_balance`, while up/model/generated schema say `plaid_balance`. This historical rollback discrepancy is recorded, not executed or corrected.
- No generated type file certifies numeric precision, current database extensions, schema drift or live JSON shape. Source types cannot rule out old/ad-hoc writes. Those are limits of source-only characterization; no live verification is implied.
- Other JSON columns were inspected: AccountTransaction location is geographic/address data; auto-assignment search_strings, User roles/OTP, push subscriptions, cleanup recovery metadata and Budget/Group catalogs have no source-defined active monetary leaves. Runtime environment requirements contain ports/counts/credentials, not monetary settings.
- Operator audit/conversion evidence, exact-original-JSON recovery files, logical dumps and external logs can contain numeric historical money. They are recovery/diagnostic artifacts, not a newly counted application financial field. Their presence does not undo the completed allocation storage conversion. No private dump or recovery file was opened for this task.

## Findings and limitations

Confirmed remaining nontext money: the eight relational columns and 29 named JSON paths above. Seven relational columns already have exact scaled database storage; one polymorphic column has inexact floating storage. Many numeric ingress paths rely on database-only scale enforcement or have no JSON cent-scale enforcement. Active runtime/API values commonly remain numbers even where storage is exact.

Open unknowns are live schema drift, actual record populations and extra monetary properties in three opaque diagnostic containers. No unbounded payload is falsely certified finite, and no monetary policy is inferred from its arbitrary keys. These limits do not require selecting a new money representation or changing any authority. No migration recommendation, priority or sequence is part of this record.

## Verification

Documentation-only change. Source/migration/generated-schema/validator/model/provider/client persistence inspection performed without application bootstrap or database access. No code or tests changed, so TypeScript, ESLint, Knip, circular/build and database-backed tests were not run. Both working-tree and staged `git diff --check` passed. Original staged work and unrelated untracked files were preserved; this document remains unstaged.

No production runtime behavior changed. No database connection, historical data change, monetary representation change, schema migration, deployment or commit occurred.


## Statement income-attribution characterization — October 25, 2026

Source HEAD: `009d377adef5cdd3adc33f427e84a6396a849133`; branch `dollar-to-cents-2`. No PostgreSQL connection or live historical observations were made. The original inventory above is dated evidence; the operator has since accepted both Transaction Category and Transaction Tax decimal-string migrations. Neither is reopened here.

| Exact JSON path | Monetary meaning | Authority / cent suitability |
| --- | --- | --- |
| `statements.data.shortTermCapitalGains` | Entered short-term capital gain/loss total for the Statement period | Reporting attribution; signed currency total, plausible cents boundary but not yet approved |
| `statements.data.longTermCapitalGains` | Entered long-term capital gain/loss total for the Statement period | Same; negative gains remain supported |
| `statements.data.dividends` | Entered dividend total, exposed as `ordinaryDividends` in tax actuals | Reporting attribution; neither a rate nor per-share value; cents policy undecided |
| `statements.data.taxableInterest` | Entered taxable interest total | Reporting attribution; neither an interest rate nor an accrual calculation; cents policy undecided |

**Shared storage/write boundary.** [Statement](../app/Models/Statement.ts) declares all four leaves as numbers inside nullable native JSONB `data`, with no income codec or `prepare`/`consume` conversion. Migration `1785956002715_alter_statements_table.ts` adds nullable JSONB without a default. [AccountsController](../app/Controllers/Http/AccountsController.ts) `addStatement` copies these four validated values into a new object or stores SQL null when omitted; `updateStatement` replaces `data` only when supplied and otherwise preserves it. The [validators](../app/validation/Validators/statement.ts) use optional whole objects with four required `vine.number()` leaves. They accept fractional cents and supported numeric strings via numeric coercion; there is no cent limit, explicit checked-cent conversion, sign restriction, or rounding. The actual Vine validator treats explicit `data:null` like omission (it returns no `data` property): CREATE stores SQL null and PATCH preserves existing data. Incomplete non-null submitted objects fail validation. Initial offline Statement creation in `InstitutionController.addOffline/addOfflineAccount` writes `data:null`. No active provider/calculation writer supplying these income leaves was identified.

Both mutation routes acquire the owning Budget lock before authoritative resource reads and bind changes to its transaction. Income data is not used to compute starting/ending balances, AccountTransaction amounts or Category/Funding Pool effects. Nevertheless, the existing Statement lifecycle can reconcile membership when requested, and recomputes/saves the latest ending-balance authority for balance-tracked Accounts even on a data PATCH. That is existing lifecycle behavior, not authority granted to the four income amounts. Do not invent an equality between income totals and balance differences, credits, debits or allocations.

**Read/API boundary.** Statement list/model serialization, CREATE/PATCH DTOs, nested Statement responses, [shared StatementProps](../common/ResponseTypes.ts), [State.Statement](../client-src/State/Statement.ts), [State.Statements](../client-src/State/Statements.ts), StatementDialog/View and tax actuals expect numeric amounts. CREATE/PATCH and client state substitute zero for nullish/missing income fields without writing those zeros back. List serialization can preserve `data:null`; missing and null are not historical zero. The model has no decoder for stored strings, so TypeScript declarations and `?? 0` alone do not preserve numeric APIs if strings are later stored.

**Current precision.** StatementDialog passes AmountField's Formik events to AmountInput, then uses `parseFloat` on submitted strings. It applies Account sign only to balance fields, not income. AmountInput formats local display to two decimals and computes `Math.round` for its delta callback, but AmountField uses the original change/blur events, not that callback; formatted display is not proof that submitted state was quantized. No server storage rounding occurs. No calculation intentionally writing higher-precision derived results into these four fields was found. Existing tax sums and subsequent client tax arithmetic retain floating-point results without a universal cent quantizer; this must be preserved independently of any future storage policy.

**SQL reader.** [TaxesController.getActuals](../app/Controllers/Http/TaxesController.ts) selects Statements through Account/Institution/Budget, excludes subtypes `401k`, `Roth 401k`, `Roth`, `ira`, selects by Statement **start_date** within the requested year, groups by the month of **end_date**, and computes `SUM(COALESCE((data->>'field')::real,0))`. It maps dividends to ordinaryDividends. All four casts accept suitable numeric text in principle; malformed text can fail. No PostgreSQL compatibility test was executed here. Keep this selection, mapping, signs, `real` arithmetic and response shape unchanged. Client State.Taxes aggregates numeric actuals into periods; Income uses numeric addition and gain-loss limits. Those derived results are not persisted into Statement income fields.

**Tests inspected.** `tests/functional/accounts/statementCorrectness.spec.ts` covers data replacement, omitted-data preservation, response zeros, balance/reconciliation boundaries and explicit zero resets; related tracking/deletion tests cover the Statement lifecycle. These database tests were inspected, not executed. New non-DB audit tests exercise the actual Statement validators and preserve their accepted subcent behavior.

Audit methodology and outstanding product decisions are recorded in the [candidate review](remaining-json-money-migration-candidates.md#statement-income-audit-preparation--october-25-2026). There is no storage, schema or accounting change in this characterization.


## Statement income decimal-string implementation — October 26, 2026

Implementation baseline HEAD: `009d377adef5cdd3adc33f427e84a6396a849133`, branch `dollar-to-cents-2`. This section supersedes the earlier pending precision decision for these four fields only. Their canonical two-decimal storage and JavaScript `Math.round(amount * 100)` policy are now explicitly approved. Fractional cents round individually; negative half ties follow JavaScript, and zero is stored as `"0.00"`. Nonfinite values, malformed inputs and unsafe/unrepresentable integer-cent results reject with HTTP 422. No aggregate conservation rule is added.

**Implemented boundary:** [statementIncomeCodec](../app/services/statementIncomeCodec.ts) reuses only the existing Category scalar cent/string codec; no Category or Tax implementation changes. [statementIncomeStorage](../app/services/statementIncomeStorage.ts) and the [Statement model](../app/Models/Statement.ts) encode the four leaves before adapter persistence, decode numeric/string/mixed JSON into numeric runtime and serialized API values, and return newly saved rounded numeric values. Legacy numeric reads retain their original precision. Missing leaves and null leaves remain missing/null on reads; the nullable data column stays SQL NULL rather than becoming a zero-filled object. New submitted objects retain existing whole-object validation. Unrelated JSON properties are preserved without monetary normalization.

The storage binding retains original raw income representations separately from decoded runtime state. Unrelated Statement-column saves omit `data`; changes only to other JSON properties preserve the original income leaves, including historical subcent numbers and optional/null leaves. Successful saves refresh runtime values and clean originals; failed-save staging cannot leak into a subsequent unrelated save. Explicit income replacement persists canonical strings even when submitted amounts equal the decoded historical values.

**Writers:** `AccountsController.addStatement/updateStatement` validate the four income amounts before mutation. Existing supported decimal numeric-string request syntax still passes through Vine to finite numeric values; boolean/blank/hex/object coercions reject. PATCH replaces the submitted four leaves while retaining unrelated existing data properties. CREATE continues supporting omitted/null data, and offline initial Statement paths continue storing SQL NULL. Existing Budget locking, ownership checks, authoritative post-lock reads, owning transactions, reconciliation and starting/ending-balance authority remain unchanged.

**Readers:** central model consumption/serialization covers Statement lists, nested model responses and mutation DTOs; client forms and arithmetic still receive numbers. No client or shared response contract changed. `TaxesController.getActuals` is unchanged: `->>` text extraction followed by `::real` already accepts decimal-string amounts. Existing selection, signs, date grouping, dividends mapping, floating aggregation and response shapes are preserved. PostgreSQL mixed-storage/report verification remains required.

The accepted historical audit observed 273 Statements, 39 complete income objects/156 numeric amounts, 234 SQL-null data objects and no subcent/unsafe/malformed/rounding/report differences across 60 groups. These are dated observations, not future assertions. The audit was not rerun, and no historical values were converted during implementation. Historical conversion remains separately authorized work after compatible runtime verification/deployment.

Changed production files: Statement model, AccountsController and the two Statement-specific services above. New unit and prepared PostgreSQL tests are linked in the [candidate review](remaining-json-money-migration-candidates.md#statement-income-implementation-and-acceptance). No schema, balance, Transaction monetary representation, deployment or installed application was changed.


### Statement income acceptance result

On October 26, 2026, the existing 15 PostgreSQL cases passed against independently safeguarded `localhost:5432/spendcraft_test`, plus 261 focused regressions (197 database / 64 non-DB) and 28 safeguard tests. Zero failures/skips/pending in the final selections. A test-only JSON Accept-header correction fixed two initial browser-redirect status failures without changing production behavior or weakening assertions. Both TypeScript checks (source-only server context), changed-file lint, syntax and diff checks passed. See the [acceptance record](remaining-json-money-migration-candidates.md#statement-income-postgresql-acceptance--october-26-2026) for raw storage, compatibility, financial noninterference, scope exclusions and safety evidence. Statement income decimal-string storage is ready for commit review; deployment and historical conversion remain separate. No staging or production data was accessed or changed.
