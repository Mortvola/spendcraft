# Remaining monetary storage inventory

Reconciled against HEAD `8cf27b0bb68f4f7cd78dc4565418c7fce8977576`, branch `dollar-to-cents-2`, after the accepted production auto-assignment migration. This characterization uses source and prior accepted completion evidence; it makes no new database observation.

Scope follows [monetary migration scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md). Loans, every deprecated `transaction_categories` dependency and deprecated BalanceHistory are excluded. Plaid logs are permanently excluded from conversion: preserve provider-supplied types, including additional provider monetary paths.

## Counts and reconciliation

Count one relational column or named JSON leaf pattern; `[]` represents any array position. Optional leaves count once. Currency/percentage modes share a location and are not counted twice. These are storage locations, not row counts.

| Storage category | Remaining in scope | Disposition |
| --- | ---: | --- |
| Exact relational decimal | **7** | All `numeric(12,2)`; no representation migration needed |
| Floating-point relational | **0** | Auto-assignment is completed `numeric(12,2)` storage |
| Application/configuration JSON-number paths | **3** | Funding configuration and snapshots; storage implementation prepared, PostgreSQL verification pending |
| Confirmed diagnostic JSON-number paths | **0** | The two confirmed TransactionLog money leaves are completed |
| Integer minor-unit storage | **0 found** | Runtime integer-cent calculations are not persisted cent columns |
| **Remaining in-scope monetary locations** | **10** | Seven exact columns plus three implemented paths awaiting PostgreSQL acceptance/deployment/conversion |
| Completed decimal-string paths, outside remaining count | **21** | Category (1), Transaction Tax (1), Statement income (4), Tax forecast (13), TransactionLog (2) |
| Completed relational precision migration, outside remaining count | **1** | Auto-assignment `real` → `numeric(12,2)` |
| Permanently excluded named Plaid diagnostic paths | **6** | Descriptive only; not active migration candidates |

The old **32** comprised 7 exact columns + 1 floating column + 16 application JSON paths + 8 diagnostic JSON paths. Thirteen application paths and two diagnostic paths were the completed Tax/Log leaves; six diagnostics were already excluded Plaid paths. Auto-assignment is now completed too: **32 − 13 − 2 − 6 − 1 = 10** remaining in scope. The final **3** JSON paths have approved precision and a prepared implementation; historical conversion is still separate. The descriptive total remains **38 = 21 completed strings + 1 completed relational migration + 10 remaining + 6 excluded**. Eight relational columns now have exact storage; the original seven never needed representation changes.

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
| `auto_assignment_categories.amount` — completed, outside remaining count | `numeric(12,2)` NOT NULL; nullable percentage DEFAULT false | Fixed allocation dollars or percentage points | A; `number` via `parseFloat`; JSON number | Scoped validation/model rounding uses approved `Math.round(value * 100) / 100`; exact decimal-text preparation | Existing `Account.autoAssign` formulas/order/residuals unchanged | [AutoAssignmentCategory](../app/Models/AutoAssignmentCategory.ts), [rounding](../app/services/autoAssignmentAmount.ts), [migration](../database/migrations/1792100000000_auto_assignment_amount_numeric.ts) |

Funding Pool is a Category, not a separate money table. Opening amount is an AccountTransaction plus the completed Category allocation, not a separate opening column. `account_transactions.principle` and Loan-only amounts are excluded, even where the shared models/DTOs retain them.

**Migration disposition:** all seven `numeric(12,2)` money columns above already have exact scale-2 storage. No representation conversion is needed merely because models hydrate them as JavaScript numbers. PostgreSQL scale/range enforcement does not prove preceding JavaScript arithmetic exact; changing that arithmetic is outside this inventory.

**Auto-assignment completed in staging and production.** The shared column preserves fixed/null/percentage mode semantics and numeric APIs, with approved two-decimal input/historical rounding. Production preserved 31 percentage rules at exactly `100.00`, zero monetary changes and all checked financial hashes. Prior accepted evidence is `script-output/auto-assignment-production-install-dpDFvK/`; do not rerun it here. Existing rollback admission and nonfatal rollback-unavailable behavior remain required.

## Application JSON-number money: three remaining paths

All three are application/configuration or historical snapshot money, with numeric runtime/API values. JSONB numeric tokens are PostgreSQL numeric values but have no fixed scale-2 storage contract. Two-decimal string storage using JavaScript Math.round is approved for all three paths and percentage-mode rules; implementation and historical execution remain separate.

### Funding configuration and snapshots (3 paths)

| Table / JSON path | Optionality / lifecycle | Authority / semantics | Writer, validation and precision | Reader / API / arithmetic | Sources |
| --- | --- | --- | --- | --- | --- |
| `categories.funding_categories[].amount` when `percentage=false` | Column JSONB NOT NULL DEFAULT `[]`; array entries require amount; fixed-mode rule | Configuration money: fixed funding spread | Category CREATE/PATCH copies validated numeric rules; `Category.fundingCategories` scoped funding string encoding with numeric hydration | `Budget.getProposedFunding` passes configuration; `calculateFunding.computeSpread` converts fixed money to rounded cents; client Category settings and spread editor use numbers | [Category](../app/Models/Category.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [category validator](../app/validation/Validators/category.ts), [calculateFunding](../client-src/Funding/calculateFunding.ts); migration `1720894090578_categories.ts` |
| `transactions.categories[].baseAmount` | Optional entry metadata, chiefly type 2; type 3 request shape can also carry it; JSONB categories column | Requested pre-transfer funding base; informational calculation snapshot, not net allocation or reversal authority | `FundingDialog.handleSubmit` / `calculateFunding`, numeric DTO, `CategoriesController.transfer` CREATE/replacement persists `category.baseAmount`; Vine number optional. The outer allocation codec remains unchanged; the scoped binding applies funding metadata encoding with numeric historical/string/mixed reads | Funding edit state and `CategoriesController.get` SQL `sum(coalesce(baseAmount,0))`; numeric API; further funding calculations. Could preserve numeric floating artifact even when sibling amount is canonical text. | [FundingDialog](../client-src/Funding/FundingDialog.tsx), [calculateFunding](../client-src/Funding/calculateFunding.ts), [categoryTransfer validator](../app/validation/Validators/categoryTransfer.ts), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [categoryAmountCodec](../app/services/categoryAmountCodec.ts) |
| `transactions.categories[].fundingCategories[].amount` when `percentage=false` | Optional rule snapshot in type 2/3 allocation metadata; required amount within each supplied rule | Fixed-money configuration snapshot used for funding reconstruction | Same transfer CREATE/replacement writes numeric nested metadata; Vine number and funding-percentage validator (percentage mode only); existing allocation binding now separately maps approved funding metadata; outer allocation/conservation behavior is unchanged | Funding edit/recalculation and transaction API; `computeSpread` rounds fixed-rule use to cents. The scoped binding encodes this nested amount as a two-decimal string and decodes it to a number. | Same transfer/Funding sources as baseAmount; [funding percentages](../common/fundingPercentages.ts) |

There is no top-level `transactions.base_amount` column in generated schema/migrations. `funder`, `includeFundingTransfers`, Category IDs and comment are not additional money. Transfer deductions use the outer allocation amount, already completed, not a separate persisted transfer total.

**Migration disposition:** characterization and the [read-only historical audit](remaining-json-money-migration-candidates.md#historical-audit-and-funding-impact-readiness) are prepared; two-decimal string storage and JavaScript Math.round are approved for all three paths and both funding-rule modes; implementation and historical execution remain separate. All three participate in future funding calculations or edit reconstruction; none is an authoritative balance. Percentage modes are rates, not currency. [fundingPercentages](../common/fundingPercentages.ts) requires nonnegative percentages and an exact 100% total after approved individual two-decimal rounding when any percentage rules exist; it imposes neither cent precision nor nonnegativity on fixed dollars.

The saved allocation shape is `{categoryId, amount, comment?, funder?, baseAmount?, fundingCategories?: [{categoryId, amount, percentage}], includeFundingTransfers?}`. The outer amount is already completed canonical storage and is excluded from this project. Validators require numeric monetary leaves and boolean rule flags; optional snapshots remain missing, not zero. Historical SQL-null/JSON-null/missing/unknown shapes must remain evidence. Missing/null rule flags follow the calculator's falsey fixed branch but require separate historical eligibility review, not silently approved new input.

`computeSpread` rounds its supplied base and fixed caps to cents, caps fixed withdrawals by remaining cents, combines duplicate funder IDs and gives the last percentage rule the residual. Its comparator does not establish reliable equal-mode priority; preserve actual array/order evidence. `calculateFunding` retains the unrounded requested base and adds transfer-inclusive cent funding in a single ordered pass. Distinguish raw request artifacts from changed posted integer cents. The server posts/reverses outer allocations, not these metadata leaves, under the existing Budget transaction and conservation validator.

`FundingDialog.initialFunding` reuses saved bases/rules, falls back from missing/null base to the decoded outer amount, resolves absent rules through the Category tree and adds current zero-input Categories. `CategoriesController.get` also sums `baseAmount` as SQL decimal for prior-month display. Full replay needs those contexts; neither these leaves nor current balances establish historical applied effects. The audit preserves raw JSON and executes bounded comparisons through actual funding code; unsupported reconstruction is explicit. See the [candidate review](remaining-json-money-migration-candidates.md) for remaining precision and compatibility decisions.

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

Run the prepared audit only after separate database authorization; review raw values, calculation sensitivity and unsupported historical contexts before implementation and separately authorized historical conversion. No database, application behavior or deployed environment changed during this characterization. Verification is limited to focused offline audit tests, syntax/lint, documentation consistency/links and both Git diff checks; see the [candidate review](remaining-json-money-migration-candidates.md#verification).

## Funding JSON implementation prepared

Implementation is based on audit HEAD `592288550a9ca1b4ecdba2cab7cc3129d46393c8`; no database or historical conversion is part of this change.

- [Funding codec](../app/services/fundingAmountCodec.ts) visits only Category rule amounts and Transaction base/rule metadata. Fixed dollars and percentage points retain distinct mode flags but share approved `Math.round(value * 100)` / `(cents / 100).toFixed(2)` encoding. Existing scalar checks reject nonfinite, unsafe or unrepresentable encodings; missing/null and unrelated JSON remain intact.
- [Storage lifecycle](../app/services/fundingStorage.ts), Category hooks and the existing scoped Transaction allocation binding decode historical numeric/string/mixed leaves to numbers. Numeric historical reads retain subcents. Reads, balance/comment saves and metadata-only JSON edits do not normalize untouched leaves. Explicit Category CREATE/PATCH arrays and funding-transfer replacements encode supplied leaves even when their numeric values match history.
- Percentage validation accepts excess precision and applies the approved individual policy before the existing exact-100% check. Nonnegative percentage validation remains; fixed-dollar and base signs remain supported. Funding calculations/order/intermediate precision/residual handling and Budget locks are unchanged.
- Prior-month `jsonb_to_recordset` already extracts `baseAmount` as `decimal`; SQL is unchanged. PostgreSQL mixed-representation verification remains mandatory.
- The existing compiled-release profile pins ten funding reader/writer files, including the model, codec, binding, controller and validators. Unknown/incompatible funding storage fails admission before database/PM2/directory operations. Plan discovery treats `funding_storage_compatibility_unknown` as nonfatal rollback-unavailable, publishes no executable incompatible plan and preserves one-way rollback.
- [Ten prepared PostgreSQL cases](../tests/functional/funding/decimalStorage.spec.ts) await explicit `spendcraft_test` authorization. Existing funding configuration and preview/submission regressions are adjusted for raw string persistence; their Budget serialization/atomicity tests remain part of later acceptance.

The production audit found 6,682 numeric leaves in 93 records, including 26 rounding changes in deleted Transactions 4596/4597 only; no posted-cent or conservation differences were observed in supported comparisons. These are prior observations, not fixed execution expectations. Preserve deleted history; historical conversion/recovery tooling, pinned raw snapshots, idempotency and execution authorization remain separate work. Do not infer full historical balance reconstruction from these metadata fields.

## Local PostgreSQL acceptance result — blocked pending application correction

Tested at HEAD `592288550a9ca1b4ecdba2cab7cc3129d46393c8`, branch `dollar-to-cents-2`, using only `localhost:5432/spendcraft_test`, authenticated user `spendcraft_test`. The existing safety hook independently verified configured/live `pg` and `pgLog` identities plus the exact execution connection before destructive SQL, including setup and cleanup.

- Original prepared cases: **10 passed, 0 failed, 0 skipped**. The SQL case was then strengthened, without changing application SQL, to exercise the actual prior-month Categories endpoint across numeric/string/mixed storage, missing/null leaves, grouping, date/type/deleted selection and Budget filtering; all 10 passed again.
- Expanded PostgreSQL regressions: **242 passed, 5 failed, 0 skipped (247 total)**. Two assertions still expect the obsolete numeric `baseAmount` representation; one funding-preview scenario timed out. Two Loan-Category exclusion regressions exposed an application ordering defect and both failed again in isolation.
- Offline funding/monetary/compiled-release rollback selection: **376 passed, 0 failed, 0 skipped**. Both TypeScript projects and changed-file ESLint passed.

**Application blocker:** `Transaction.encodeActiveCategories` calls `stageFundingStorage` before `prepareNewCategoryStorage` resolves the existing Loan exclusion. Explicit replacement can therefore encode funding metadata on an excluded path; its subsequent read bypasses the scoped decoder and exposes strings (`"3.00"`, `"100.00"`). This violates exclusion/numeric-runtime preservation. Application code was not corrected during acceptance: separate authorization/review is required before implementation and renewed regression verification. Do not weaken the failing assertions or treat this run as commit acceptance.

Supported active-path cases passed raw JSON string persistence, numeric APIs, historical/deleted reads, metadata-only preservation, reconstruction, prior-month SQL, isolation and injected-failure rollback. Full acceptance remains blocked; no claim is made that all regression requirements passed. No historical conversion or deployment occurred. Evidence: `script-output/funding-postgresql-DxEcK5/`.
