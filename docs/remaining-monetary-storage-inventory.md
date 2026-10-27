# Remaining monetary storage inventory

Reconciled against HEAD `744419e1d41edf5fb9c0736e57fbd8e928521eef`, branch `dollar-to-cents-2`, after the operator-accepted production conversions. This refresh uses current source and accepted completion evidence; it makes no new database observation. Schema definitions describe repository migrations, not independently verified live schema.

Scope follows [monetary migration scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md). Loans, every deprecated `transaction_categories` dependency and deprecated BalanceHistory are excluded. Plaid logs are permanently excluded from conversion: preserve provider-supplied types, including additional provider monetary paths.

## Counts and reconciliation

Count one relational column or named JSON leaf pattern; `[]` represents any array position. Optional leaves count once. Currency/percentage modes share a location and are not counted twice. These are storage locations, not row counts.

| Storage category | Remaining in scope | Disposition |
| --- | ---: | --- |
| Exact relational decimal | **7** | All `numeric(12,2)`; no representation migration needed |
| Floating-point relational | **1** | Fixed-mode auto-assignment amount; next candidate for audit/precision approval |
| Application/configuration JSON-number paths | **3** | Funding configuration and snapshots; deferred |
| Confirmed diagnostic JSON-number paths | **0** | The two confirmed TransactionLog money leaves are completed |
| Integer minor-unit storage | **0 found** | Runtime integer-cent calculations are not persisted cent columns |
| **Remaining in-scope monetary locations** | **11** | Seven exact columns plus four unresolved representation candidates |
| Completed decimal-string paths, outside remaining count | **21** | Category (1), Transaction Tax (1), Statement income (4), Tax forecast (13), TransactionLog (2) |
| Permanently excluded named Plaid diagnostic paths | **6** | Descriptive only; not active migration candidates |

The old **32** comprised 7 exact columns + 1 floating column + 16 application JSON paths + 8 diagnostic JSON paths. Source reconciliation confirms that 13 of the 16 application paths were the completed Tax leaves, while 2 of the 8 diagnostic paths were the completed Log leaves. The other 6 diagnostics were already excluded Plaid paths. Thus **32 − 13 − 2 = 17** is the descriptive remainder *including excluded Plaid*, whereas **17 − 6 = 11** is the remaining in-scope count. Only **4** of those 11 lack an exact cent-storage boundary. There is no overlap with the six earlier completed paths: the known descriptive total remains **38 = 21 completed + 11 remaining in scope + 6 excluded**.

Open-ended diagnostic containers are not assigned invented finite counts. Unknown historical nested money requires separate characterization, not automatic conversion or reopening a completed leaf.

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

**Migration disposition:** all seven `numeric(12,2)` money columns above already have exact scale-2 storage. No representation conversion is needed merely because models hydrate them as JavaScript numbers. PostgreSQL scale/range enforcement does not prove preceding JavaScript arithmetic exact; changing that arithmetic is outside this inventory.

The eighth relational location, `auto_assignment_categories.amount`, remains PostgreSQL `real` in deployed databases. **Implemented and locally PostgreSQL-accepted: `numeric(12,2)` for the shared column, with two-decimal percentages.** Counts remain unchanged until deployment and migration. The NOT NULL amount, nullable `percentage` DEFAULT false, IDs and unrelated schema are preserved. Null/false modes remain fixed dollars; true means percentage points (`12.75` means 12.75%). The approved ingress and historical policy is `Math.round(value * 100) / 100`, including negative half ties; finite/range/safe-cent validation rejects invalid inputs.

The [implementation and audit](remaining-json-money-migration-candidates.md#historical-audit-and-allocation-impact-readiness) preserve original `real` evidence and actual allocation-method comparisons. CREATE/PATCH retain their Budget locks and transactions; scoped Vine validation and model hooks quantize writes. Decimal-text preparation and existing parseFloat hydration preserve numeric model/API values. CategorySpread already accepts fractional percentages and keeps its mode-toggle behavior. Account.autoAssign formulas, ordering and residual handling are untouched. No new 0–100 or percentage-total rule is imposed.

## Application JSON-number money: three remaining paths

All three are application/configuration or historical snapshot money, with numeric runtime/API values. JSONB numeric tokens are PostgreSQL numeric values but have no fixed scale-2 storage contract. No new precision policy is approved.

### Funding configuration and snapshots (3 paths)

| Table / JSON path | Optionality / lifecycle | Authority / semantics | Writer, validation and precision | Reader / API / arithmetic | Sources |
| --- | --- | --- | --- | --- | --- |
| `categories.funding_categories[].amount` when `percentage=false` | Column JSONB NOT NULL DEFAULT `[]`; array entries require amount; fixed-mode rule | Configuration money: fixed funding spread | Category CREATE/PATCH copies validated numeric rules; `Category.fundingCategories` JSON.stringify; no cent-scale rule for fixed mode | `Budget.getProposedFunding` passes configuration; `calculateFunding.computeSpread` converts fixed money to rounded cents; client Category settings and spread editor use numbers | [Category](../app/Models/Category.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [category validator](../app/validation/Validators/category.ts), [calculateFunding](../client-src/Funding/calculateFunding.ts); migration `1720894090578_categories.ts` |
| `transactions.categories[].baseAmount` | Optional entry metadata, chiefly type 2; type 3 request shape can also carry it; JSONB categories column | Requested pre-transfer funding base; informational calculation snapshot, not net allocation or reversal authority | `FundingDialog.handleSubmit` / `calculateFunding`, numeric DTO, `CategoriesController.transfer` CREATE/replacement persists `category.baseAmount`; Vine number optional. Allocation encoder copies this metadata unchanged; no cent normalization for this leaf | Funding edit state and `CategoriesController.get` SQL `sum(coalesce(baseAmount,0))`; numeric API; further funding calculations. Could preserve numeric floating artifact even when sibling amount is canonical text. | [FundingDialog](../client-src/Funding/FundingDialog.tsx), [calculateFunding](../client-src/Funding/calculateFunding.ts), [categoryTransfer validator](../app/validation/Validators/categoryTransfer.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [categoryAmountCodec](../app/services/categoryAmountCodec.ts) |
| `transactions.categories[].fundingCategories[].amount` when `percentage=false` | Optional rule snapshot in type 2/3 allocation metadata; required amount within each supplied rule | Fixed-money configuration snapshot used for funding reconstruction | Same transfer CREATE/replacement writes numeric nested metadata; Vine number and funding-percentage validator (percentage mode only); central encoder only changes outer allocation amount | Funding edit/recalculation and transaction API; `computeSpread` rounds fixed-rule use to cents. No decimal-text conversion of this nested amount. | Same transfer/Funding sources as baseAmount; [funding percentages](../common/fundingPercentages.ts) |

There is no top-level `transactions.base_amount` column in generated schema/migrations. `funder`, `includeFundingTransfers`, Category IDs and comment are not additional money. Transfer deductions use the outer allocation amount, already completed, not a separate persisted transfer total.

**Migration disposition:** defer these three paths until stored fixed-rule precision, pre-transfer base precision and funding-edit reconstruction behavior are approved. All participate in future funding calculations or reconstruction; none is an additional authoritative balance. Their percentage-rule modes are rates, not currency. [fundingPercentages](../common/fundingPercentages.ts) validates those percentages separately; it does not impose fixed-money cent precision.

## Completed migrations: 21 paths

All paths below are **COMPLETED — DECIMAL-STRING STORAGE**, including accepted production historical conversion. They are excluded from active migration candidates. Storage uses canonical two-decimal dollar strings; runtime/public API values remain numbers. Preserve numeric/string/mixed compatibility readers, null behavior, no-write-on-read behavior and existing rollback safeguards. Previously approved Math.round policy applies to these paths, not automatically to remaining fields.

| Completed storage path | Status |
| --- | --- |
| `transactions.categories[].amount` | COMPLETED — DECIMAL-STRING STORAGE |
| `transactions.taxes[].amount` | COMPLETED — DECIMAL-STRING STORAGE |
| `statements.data.shortTermCapitalGains` | COMPLETED — DECIMAL-STRING STORAGE |
| `statements.data.longTermCapitalGains` | COMPLETED — DECIMAL-STRING STORAGE |
| `statements.data.dividends` | COMPLETED — DECIMAL-STRING STORAGE |
| `statements.data.taxableInterest` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.taxableInterest` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.qualifiedDividends` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.ordinaryDividends` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.taxableIraDistributions` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.taxablePensionAndAnnuities` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.taxableSocialSecurityBenefits` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.additionalTaxableIncome` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.shortTermCapitalGains` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.longTermCapitalGains` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.qualifiedBusinessIncomeDeduction` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.estimated.expectedAgi` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.estimated.priorYearAgi` | COMPLETED — DECIMAL-STRING STORAGE |
| `taxes.data.estimated.priorYearTotalTax` | COMPLETED — DECIMAL-STRING STORAGE |
| `transaction_logs.changes.amount.old` | COMPLETED — DECIMAL-STRING STORAGE |
| `transaction_logs.changes.amount.new` | COMPLETED — DECIMAL-STRING STORAGE |

Boundaries: [Category codec](../app/services/categoryAmountCodec.ts), [Transaction Tax codec](../app/services/taxAmountCodec.ts), [Statement income codec](../app/services/statementIncomeCodec.ts), [Tax/Log codec](../app/services/taxMonetaryCodec.ts) and their scoped storage bindings/models. Statement income is reporting attribution, not starting/ending balance storage. Tax forecasts are inputs, not persisted Worksheet intermediates. Log amounts are diagnostic copies, not posting authority; the nullable PostgreSQL `json` column is unchanged.

Accepted historical results: Transaction Tax converted 20 numeric values and preserved one existing string; Statement income converted 39 Statements / 156 values and preserved 234 SQL-null data rows; Tax/Log converted 1 Tax / 46 Logs / 105 values with zero monetary differences. Category allocation conversion is also accepted complete. Idempotency, financial noninterference and numeric application compatibility passed. The final Tax/Log Worksheet verification matched all 23 lines and every result field, including floating-point intermediates. Private receipts: `script-output/tax-monetary-production-conversion-q8avcuut/` and `script-output/production-worksheet-verification-66toh3ng/verification.json`. These are accepted prior results, not rerun checks. Preserve original recovery snapshots and backups; completed conversions are not outstanding work.

## Permanently excluded diagnostics and open payloads

| Permanently excluded JSON path | Meaning / source |
| --- | --- |
| `plaid_logs.response.accounts[].balances.current` | Provider current balance observation |
| `plaid_logs.response.accounts[].balances.available` | Provider available funds observation |
| `plaid_logs.response.accounts[].balances.limit` | Provider credit/overdraft limit |
| `plaid_logs.response.transactions[].amount` | Original provider transaction amount |
| `plaid_logs.response.added[].amount` | Original synchronized added amount |
| `plaid_logs.response.modified[].amount` | Original synchronized modified amount |

[Plaid wrapper](../providers/Plaid/Plaid.ts) and [PlaidLog](../app/Models/PlaidLog.ts) preserve provider numeric/null types subject to existing credential redaction. Diagnostic readers do not make these balance authorities. No Plaid logs were accessed; all additional Plaid monetary paths are also permanently excluded.

Three open surfaces remain outside finite path counts: arbitrary `transaction_logs.changes`, Plaid responses/errors (excluded), and signature-verified `webhook_logs.request`. [getChanges](../app/Controllers/Http/transactionFields.ts) skips ordinary top-level array diffs but can retain object/null snapshots; this does not prove additional fixed monetary paths in old nested payloads. [WebhookController](../app/Controllers/Http/WebhookController.ts) defines no fixed monetary leaf in its supported event interface. Do not normalize unknown history or infer that unrelated numbers are money.

## Nonmonetary modes, exclusions and source limits

- `auto_assignment_categories.amount` with percentage=true is a percentage of the remaining transaction base. Its validator does not apply the separate funding-rule percentage constraints.
- `categories.funding_categories[].amount` and `transactions.categories[].fundingCategories[].amount` with percentage=true are percentage rules, not extra monetary locations.
- `accounts.rate` is `numeric(5,3)`, a rate rather than currency. IDs, counts, years, dates, flags and geographic coordinates are not money.
- `categories.amount` was renamed to `balance`; do not count both names. Funding Pool is a Category, not another money table. Opening uses AccountTransaction plus completed allocation storage.
- Retired funding-plan tables and BalanceHistory schema presence do not establish supported active writers. Excluded Loan-only amounts and deprecated `transaction_categories` dependencies remain unchanged.
- Recovery snapshots, dumps and operator evidence can contain historical numeric money; they are not new application storage locations or evidence that a completed migration needs repeating.
- Source cannot establish live populations/schema drift or enumerate arbitrary historical payload extensions. No database was accessed for this refresh.

## Next step and verification

The [candidate review](remaining-json-money-migration-candidates.md) records the implemented auto-assignment migration, approved rounding, prepared PostgreSQL cases and stopped-writer rollout. Funding reconstruction remains deferred; the seven already-exact decimal columns need no representation conversion.

Local acceptance passed the original 11 PostgreSQL cases, 9 supplemental precision/locking cases, 182 existing PostgreSQL regressions, 114 offline precision/rollback cases and 28 safety cases. Both TypeScript projects, changed-file lint/syntax and both diff checks passed. Only localhost:5432/spendcraft_test was accessed/migrated, through independent setup/execution/cleanup guards. The normal Adonis runner journaled the migration and all checked fixture tables were empty afterward. No production code correction, staging/production access, deployment, build or commit occurred. See the [candidate review](remaining-json-money-migration-candidates.md#verification-and-prepared-postgresql-acceptance) for evidence and resolved test-only issues. Future database operations require renewed authorization.
