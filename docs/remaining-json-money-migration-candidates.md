# Remaining application JSON money: narrow candidate review

Refreshed October 26, 2026 against HEAD `64a04aa022bad1fc1bc22f5c81d269a693ee68aa`, branch `dollar-to-cents-2`. This review supersedes the October 23 ranking, later pending Statement gates, and the earlier two-field recommendation. The operator selected all 13 monetary leaves in `taxes.data` plus the two confirmed TransactionLog amount leaves as one migration project. The established Math.round cent policy is explicitly approved for all 15 leaves. Compatible application storage is accepted in staging and production; historical conversion/recovery is prepared below and still requires separate execution authorization. PlaidLog money is permanently excluded. No database connection or deployed-application change occurred during conversion-tool preparation.

## Completed work and counting boundary

Three migrations are complete and verified in production: `transactions.categories[].amount`, `transactions.taxes[].amount`, and the four Statement income leaves `shortTermCapitalGains`, `longTermCapitalGains`, `dividends`, `taxableInterest` under `statements.data`. These are **six completed paths**, not candidates. Their numeric runtime/API contracts and numeric/string/mixed readers remain supported. Their approved rounding policies do not automatically apply to remaining fields.

The accepted Statement production conversion changed 156 values in 39 Statements with zero monetary differences; 234 SQL-null Statements and 60 reporting-group totals remained unchanged. Conversion, idempotency and financial noninterference are complete. Prior preparation/acceptance status in older revisions of these documents is historical, not remaining work. Execution evidence is preserved privately in `script-output/statement-production-conversion-h7s3lbyx/completion.json`.

The [remaining inventory](remaining-monetary-storage-inventory.md) has **32 remaining locations**: seven already-exact `numeric(12,2)` columns, one polymorphic `real` configuration column, 16 application JSON-number paths and eight diagnostic JSON-number paths. Thus **17 application/configuration locations lack a cent-scale storage boundary** (one relational + 16 JSON). Diagnostic copies add eight; six Plaid copies are permanently excluded from conversion and two TransactionLog leaves require audit-fidelity review. They are not eight accounting migration priorities. Seven exact relational columns require no storage migration solely because their models/API return numbers. There are 38 known locations including completed paths; three open diagnostic payload surfaces are not a finite additional field count.

Loans, every deprecated `transaction_categories` dependency, retired BalanceHistory and inactive funding-plan schema remain excluded. This refresh does not reopen completed migrations, alter accounting authority or propose new conservation rules.

## Remaining application JSON fields

The deployed baseline has numeric leaves for these 16 application paths. Current uncommitted source now implements canonical storage for the 13 Tax paths; the three funding paths remain unchanged. Numeric runtime/API values are retained. JSONB numeric tokens are decimal, but have no two-decimal scale constraint and originate from JavaScript numbers. A JSON number is not proof of binary floating-point database storage; the precision/scale boundary is the issue here. The [inventory](remaining-monetary-storage-inventory.md#application-json-number-money-16-remaining-paths) gives exact writer/reader references and optionality.

| Exact storage path | Unit and role | Precision and dependency assessment | Disposition |
| --- | --- | --- | --- |
| `taxes.data.estimated.priorYearAgi` | Currency; entered prior-year AGI observation used by estimated-tax configuration | No storage rounding; number compared with a high-income threshold in Worksheet 2-1 | **Implemented within the 15-path project; PostgreSQL verification pending** |
| `taxes.data.estimated.priorYearTotalTax` | Currency; entered prior-year tax total, not a computed stored liability | No storage rounding; multiplied by 1 or 1.10 for prior-year safe-harbor calculation | **Implemented within the 15-path project; PostgreSQL verification pending** |
| `taxes.data.estimated.expectedAgi` | Currency; user-entered current-year forecast | Same persistence object; feeds projected taxable income and tax calculations, rather than a finalized prior-year observation | Same project; implemented, PostgreSQL verification pending |
| `taxes.data.taxableInterest` | Currency; taxable interest forecast | Numeric forecast used by Income/Taxes calculations; no cents restriction | Same project; implemented, PostgreSQL verification pending |
| `taxes.data.qualifiedDividends` | Currency; qualified dividend forecast | Forecast feeds gains/tax worksheets; not a rate | Same |
| `taxes.data.ordinaryDividends` | Currency; ordinary dividend forecast | Forecast income/annualization calculations | Same |
| `taxes.data.taxableIraDistributions` | Currency; taxable distribution forecast | Forecast input, not deprecated Loan functionality | Same |
| `taxes.data.taxablePensionAndAnnuities` | Currency; taxable pension/annuity forecast | Forecast income calculations | Same |
| `taxes.data.taxableSocialSecurityBenefits` | Currency; taxable benefits forecast | Separate from completed Transaction tax attribution actuals | Same |
| `taxes.data.additionalTaxableIncome` | Currency; additional income forecast | Forecast income calculations | Same |
| `taxes.data.shortTermCapitalGains` | Currency; signed gain/loss forecast | Loss limits and downstream worksheet calculations do not establish stored precision | Same |
| `taxes.data.longTermCapitalGains` | Currency; signed gain/loss forecast | Same distinction from intermediate worksheet results | Same |
| `taxes.data.qualifiedBusinessIncomeDeduction` | Currency; entered deduction forecast | Not the deduction percentage or a persisted derived worksheet result | Same |
| `categories.funding_categories[].amount` (`percentage=false`) | Currency; mutable fixed funding configuration | Rounded to cents on use by computeSpread; configuration also participates in transfer-inclusive calculation | Defer funding calculation/reconstruction precision |
| `transactions.categories[].baseAmount` | Currency; requested pre-transfer funding snapshot | Can preserve subcents/goal-derived artifacts; edit reconstruction and prior-month SQL sums use it | Defer; not the completed outer allocation amount |
| `transactions.categories[].fundingCategories[].amount` (`percentage=false`) | Currency; historical fixed-rule configuration snapshot | Reused in funding edits; ordering, duplicates and round-on-use matter | Defer alongside live funding rules |

The corresponding percentage modes of the two rule paths are percentages, not currency, and must stay outside a currency-only conversion. The third polymorphic location, `auto_assignment_categories.amount`, is relational `real`: fixed mode is currency, percentage mode is a rate. `AutoAssignmentsController.post/patch` persists both unchanged after numeric validation; `Account.autoAssign` rounds fixed amounts and percentage products during allocation. Its stored precision and ordering affect Category allocations. A shared-column schema/compatibility decision and allocation analysis make it a poorer candidate than the selected Tax forecast/TransactionLog project. No schema change is proposed.

TransactionLog money is included in the analysis below. **All `plaid_logs` monetary fields are permanently excluded from conversion by explicit product decision.** They must remain untouched and preserve the data types supplied by Plaid synchronization; this includes known and additional provider money paths, not just the six enumerated examples. Credential redaction remains unchanged. See the [diagnostic inventory](remaining-monetary-storage-inventory.md#diagnostic-monetary-copies-8-named-paths).

## TransactionLog monetary fields — included in the same project

| Exact path | Meaning, origin and storage | Precision / readers / risk |
| --- | --- | --- |
| `transaction_logs.changes.amount.old` | Signed original AccountTransaction movement copied from model attributes by `getChanges`; JSON number in PostgreSQL JSON | Normally exact decimal column hydrated to number; no log-specific rounding. Not balance or reversal authority. |
| `transaction_logs.changes.amount.new` | Signed proposed replacement movement from manual update or transformed Plaid update; JSON number in PostgreSQL JSON | Captured from input before database scale enforcement, so it may retain subcents the saved decimal movement does not. Rounding it could change evidence of what was requested. |

Writers: [TransactionsController.update](../app/Controllers/Http/TransactionsController.ts), [Account.updateTransaction](../app/Models/Account.ts), [getChanges](../app/Controllers/Http/transactionFields.ts) and [TransactionLog](../app/Models/TransactionLog.ts). Logs are persisted through the related Transaction/owning transaction; JSON.stringify applies no cent quantization. The log endpoint returns model changes, but current [TransactionLog client state](../client-src/State/TransactionLog.ts) retains only metadata/message and no monetary calculations use these leaves. No extra monetary paths come from message-only logs.

Top-level array diffs are skipped by getChanges; null/object branches can retain nested snapshots. Unknown historical nested allocation, tax or funding amounts are an open diagnostic surface, not an automatic extension of the two fixed log paths. Loan-only `principle` is excluded. The operator explicitly included both scalar leaves in the same future conversion project as the 13 Tax forecast leaves: **15 confirmed monetary paths total**. The prepared audit now reads both tables in one consistent read-only snapshot. A future conversion must preserve unrelated log changes and the original raw log evidence. **TransactionLog policy is approved:** numeric money uses `Math.round(amount * 100)` then `(cents / 100).toFixed(2)`, including existing negative-half behavior, zero as `"0.00"`, canonical-string preservation and rejection of malformed/nonfinite/unsafe amounts. Subcent historical proposals may therefore change monetary value under this approved policy; report the exact difference before execution and retain exact originals for recovery. Tax forecast uses the same approved policy; no conversion execution is authorized. Unknown nested historical shapes require inventory review rather than being silently converted or silently certified complete. **The TransactionLog storage boundary is deployed; historical conversion/recovery tooling is prepared below and has not been executed.**

## Complete Tax forecast project: 13 monetary leaves

All 13 Tax paths above belong to the same future migration project as the two confirmed TransactionLog paths. Ten are required top-level numeric inputs; optional `estimated` contains three required numeric children when submitted. Current model, validator, save payload and controller define **no monetary arrays, dynamic money keys, imported money or persisted derived results** inside `taxes.data`. Unknown historical properties/arrays remain possible because JSONB itself does not enforce this contract; the audit preserves them and flags their paths for review without assuming their units.

`filingStatus` is a string enum, not money. Tax row `year`, IDs, Budget ownership and timestamps are outside `data` and nonmonetary. Bracket percentages, annualization factors, period counts, thresholds and effective/marginal rates are calculation constants/results, not additional stored money leaves. Monthly `actuals`, including Statement income and Transaction taxes, are a separate API response sourced from the completed storage paths and must not be converted again.

### Shared persistence and public interface

[TaxesController.post](../app/Controllers/Http/TaxesController.ts) is the only identified application mutation route for these 13 leaves. It validates with [addTax](../app/validation/Validators/tax.ts), acquires the owning Budget lock, and creates/updates [Tax.data](../app/Models/Tax.ts) within that transaction. New rows use the validated forecast; existing rows use the scoped replacement helper to preserve unrelated JSON. The source now has the Tax monetary codec and prepare/consume/serialize save boundary described below. The database column is NOT NULL JSONB without a monetary-scale constraint; no historical population is inferred from that definition.

[State.Taxes](../client-src/State/Taxes/Taxes.ts) loads numeric forecast values and POSTs all 13 fields, including `estimated`; the server allows that object to be omitted. [Income form](../client-src/Taxes/Income.tsx), gains/deduction editors and [Worksheet2-1 form](../client-src/Taxes/Worksheet2-1.tsx) use numeric event parsing. `vine.number()` allows fractional numeric input (and supported numeric-string request coercion), without a cent or whole-dollar restriction. AmountInput's two-decimal display does not establish persistence quantization. Explicit null/missing historical leaves are not evidence of zero; UI defaults are read behavior, not authorization to fill stored objects.

GET and POST spread `tax.data` into `forecast`; [TaxProps](../common/ResponseTypes.ts) and client state expect JavaScript numbers. No direct forecast SQL aggregate was found; `getActuals` SQL independently reads Statement and Transaction actuals with its existing `real` arithmetic. No model, controller or provider path was found that writes worksheet outputs back into these 13 leaves.

### Precision classification and calculation dependencies

All 13 are **entered currency amounts**, not percentages, per-unit prices or stored intermediate calculations. Their names and usage support dollar semantics but do not establish mandatory cent-scale or whole-dollar input. Whole-dollar tax-return observations are possible values, not a server-enforced rule. No field was found to intentionally require stored precision beyond cents. Product approval now specifies individual Math.round cent storage for fractional inputs, while historical numeric reads keep their original precision.

| Fields under `taxes.data` | Input classification | Active calculation dependency / risk |
| --- | --- | --- |
| `taxableInterest`, `ordinaryDividends`, `taxableIraDistributions`, `taxablePensionAndAnnuities`, `taxableSocialSecurityBenefits`, `additionalTaxableIncome` | Six user-entered forecast currency amounts | [Income](../client-src/State/Taxes/Income.ts) adds them to current-period income with actuals; AGI, taxable income and tax/annualization worksheets inherit changes. No per-leaf rounding. |
| `shortTermCapitalGains`, `longTermCapitalGains` | Two signed gain/loss forecasts | Income combines forecast and actual gains, with existing filing-status loss limits; preferential-tax selection also distinguishes long-term gains. Rounding near zero/loss limits can change results. |
| `qualifiedDividends` | Entered forecast qualified distribution amount | Preferential tax calculation in Taxes.run and [Worksheet2_9](../client-src/State/Taxes/Worksheet2_9.ts) callback to Worksheet 2-10, including annualization factors. Not a stored percentage. |
| `qualifiedBusinessIncomeDeduction` | Entered forecast deduction amount | Taxes.getTaxableIncome subtracts it before ordinary/preferential liability calculation. Current Worksheet2_1 state does not pass it into its pure worksheet call; audit must preserve that existing call shape rather than silently supplying it. |
| `estimated.expectedAgi` | Entered expected annual AGI, not a saved derived AGI | [Worksheet2_1](../client-src/State/Taxes/Worksheet2_1.ts) feeds it directly into Worksheet 2-1 taxable income, liability, payment-required decision and installment calculation. |
| `estimated.priorYearAgi` | Entered prior-year currency observation | Current [Estimated.ts](../client-src/State/Taxes/Estimated.ts) uses strict `>` 75,000 (MarriedFilingSeparate) or 150,000 (other statuses), selecting 1.10 versus 1.00 prior-year tax multiplier. A subcent value above a threshold can round down to it and change the branch. |
| `estimated.priorYearTotalTax` | Entered prior-year tax-total observation | Multiplied by selected 1.00/1.10, then compared with current-year liability percentage for safe harbor. Feeds estimated-payment and installment outputs. |

These describe existing source, not independent certification of tax-law correctness. No tax rules are changed or newly endorsed.

**Calculation precision is separate from storage scale.** Estimated worksheets use ordinary floating arithmetic, min/max, percentages, annualization and installment division without universal cent or whole-dollar rounding. For example, cent input 10,000.01 can produce installment 2,500.0025. That intermediate is not stored in `taxes.data` and must retain current behavior. Taxes.run has existing `Math.round(line17 * 100) > 0` / `Math.round(line20 * 100) > 0` eligibility branches for preferential gain amounts, rather than global result quantization. Input rounding can also cross brackets, loss limits, the Worksheet 2-1 1,000-dollar payment test or zero-payment boundaries. Preserve all arithmetic, current-period selection, sign conventions and actuals aggregation.

## Prepared read-only historical precision audit

[`scripts/auditTaxForecastPrecision.mjs`](../scripts/auditTaxForecastPrecision.mjs) adapts the existing Statement/Tax precision audits; no new framework or application behavior is introduced. It enumerates all 13 Tax paths and two TransactionLog paths, scans `public.taxes` and `public.transaction_logs` by ID in the same snapshot, and preserves whole raw PostgreSQL `data::text` / `changes::text` plus each exact amount token in private `taxes.jsonl` and `transaction-logs.jsonl`. It never reads `plaid_logs`. TransactionLog has its own counts, null/root/amount-object shapes and other change-key inventory; it does not receive tax-calculation comparisons. Unknown keys/arrays are explicitly listed as unclassified, not automatically migrated.

Per field it reports examined/present/missing/null, numeric/string/canonical-string counts, malformed/unsafe values, whole-dollar, cent-scale and fractional-cent values, signs, hypothetical numeric changes and source-to-JavaScript precision loss. Whole-dollar is a subset of cent-scale; counts are not mutually exclusive. Optional estimated-object shapes and numeric/string mixed rows are separate summary dimensions. The audit previews numeric rounding using `Math.round(amount * 100)` and `(cents / 100).toFixed(2)` (approved for all 15 paths, audit preview only), with exact decimal differences from raw tokens using the established scalar inspector. Existing strings are characterized without numeric rounding; malformed values are never turned into zero. SQL-null data, JSON null, missing parents, null leaves and unsupported root/parent shapes remain distinguishable.

**Calculation-impact scope:** the audit executes the existing pure `worksheet2_1_2026` and existing Taxes.standardDeduction getter against original versus hypothetically rounded estimated inputs, matching the actual Worksheet2_1 state call. It records original/hypothetical inputs/results, changed lines and AGI threshold-branch changes, with hashes of the calculation/state/enum source used. It loads only the trusted source calculation and enum through TypeScript transpilation, not an application/service bootstrap. Local operator dependencies, including TypeScript and Luxon, must be available.

This comparison is available only for 2026 rows with a recognized filingStatus and three safe numeric estimated inputs. Other years, missing/null/string/unsupported inputs or nonfinite results get explicit `not_compared` reasons; a completed data audit does not imply complete calculation verification. It does **not** reconstruct live cumulative actuals, current-period state, Taxes.run, Worksheet 2-9 or all 13 fields' combined reporting effects. Those calculations depend on additional current actuals and date context. If any other forecast input would change, a later focused impact review with that context remains necessary before historical conversion; no synthetic zero-actuals scenario is presented as live report evidence. Existing floating output differences are retained as such, not rounded away or automatically classified as accounting damage.

The CLI requires explicit database selection matching the selected `.env` PG settings. It uses default read-only connection options and one repeatable-read read-only transaction, checks configured/live/actual connection identity through existing helpers, reverifies before read-only COMMIT, and has statement/lock/idle/run timeouts. It exposes neither execute nor recovery mode. Each run prints its unique absolute private output directory before configuration or database work. Files use exclusive creation and summaries are published only after successful completion. No server-identity checks exist.

Future execution requires separate read-only database authorization. Commands, run from a source checkout with its dependencies:

```bash
# Offline inspection only; no connection:
node scripts/auditTaxForecastPrecision.mjs --print-sql

# Staging audit, only after separately authorized:
node scripts/auditTaxForecastPrecision.mjs   --env /spendcraft_staging/server/spendcraft-env --database spendcraft   --output-parent "$PWD/script-output"

# Production audit, only after separately authorized:
node scripts/auditTaxForecastPrecision.mjs   --env /spendcraft-prod/server/spendcraft-env --database budget   --output-parent "$PWD/script-output"
```

Keep raw values and calculation results private. An audit error leaves partial evidence and exits incomplete; do not infer live precision counts from non-database fixtures. This task made no PostgreSQL connection.

## Implemented storage boundaries — PostgreSQL verification pending

The committed compatible release implements all 15 approved paths through [taxMonetaryCodec](../app/services/taxMonetaryCodec.ts) and [taxMonetaryStorage](../app/services/taxMonetaryStorage.ts). The scoped codec reuses the existing scalar cent/string functions without changing Category, Transaction Tax or Statement codecs. All numeric writes use `Math.round(amount * 100)` and `(cents / 100).toFixed(2)`; finite/safe representable cents are required, negative half ties retain JavaScript behavior, and zero stores as `"0.00"`. Missing/null values remain missing/null; canonical strings are validated, preserved and decoded to numbers. Legacy numeric reads retain their original precision and never save merely because they were read.

**Tax:** [Tax model](../app/Models/Tax.ts) owns native JSONB prepare/consume/serialize and before/after-save hooks. Raw originals are retained separately from decoded runtime state, so unrelated column saves omit data and metadata-only JSON saves retain the original numeric/string/null leaves. Explicit forecast replacement encodes submitted income values even when equal to legacy values. [TaxesController.post](../app/Controllers/Http/TaxesController.ts) validates monetary inputs before coercion/persistence and uses the replacement boundary for existing rows, retaining unrelated root/nested JSON. Omitted estimated data is not manufactured as zeros. Existing Budget locking, transaction binding, ownership, year lookup and numeric GET/POST response shapes remain. Supported decimal numeric-string request syntax is still accepted through Vine; booleans/blanks/hex/nonfinite/unsafe amounts reject. No client/shared API contract or worksheet/report SQL changed.

**TransactionLog:** [TransactionLog](../app/Models/TransactionLog.ts) prepares only `changes.amount.old/new` for new writes, with numeric consumption/serialization and save-completion cleanup. Message-only logs and missing/null changes are preserved. Manual/Plaid-driven update logging continues using the existing getChanges structure; direct model persistence now encodes its amount leaves. Existing logs are not scanned or rewritten by ordinary app operations; metadata-only saves preserve historical raw monetary representations. Unrelated change properties, including deprecated Loan properties, are untouched. The nullable PostgreSQL `json` column is unchanged; no JSONB cast/schema conversion is introduced. Historical raw JSON recovery, including any duplicate-key/payload concerns, belongs to separately prepared historical conversion.

**Calculation preservation:** all actual Tax input consumers still receive numbers. No formula, AGI comparison, safe-harbor percentage, installment calculation, intermediate precision or actuals query is modified. Non-DB tests run the existing pure worksheet with encoded/decoded inputs on both sides of the AGI threshold and retain subcent installment outputs. No new conservation/subset relationship is added.

**Rollback admission:** the existing [compiled capability profile](../installer/tax-storage-profile.json) now pins the emitted Tax model, Tax controller, TransactionLog model and both new services, alongside existing Category/Transaction Tax/Statement files. [taxReleaseRecovery](../installer/lib/taxReleaseRecovery.mjs) requires both reviewed boundaries and reports `tax_forecast_storage_compatibility_unknown` or `transaction_log_storage_compatibility_unknown` for incompatible/unknown compiled implementations. Commit labels and marker files do not confer compatibility. Actual rollback admits releases before database access, PM2 shutdown or directory changes. Category/Transaction Tax/Statement safeguards and the one-way lifecycle are unchanged.

**Nonfatal plan handling:** [generateRollbackPlan](../installer/generateRollbackPlan.mjs) handles both new reasons as rollback unavailable. It publishes only a non-executable unavailable status, replaces any stale active plan safely, and lets an otherwise successful installation finish. Actual rollback continues to reject. A genuinely compatible compiled release remains eligible regardless of its Git label.

## Accepted historical audit and remaining gates

The read-only production audit examined one Tax record and 9,007 TransactionLogs: 13 Tax and 92 log monetary values, all numeric and cent-scale, with no malformed/unsafe/subcent values or rounding differences. All supported 2026 Worksheet 2-1 comparisons were unchanged. This is dated evidence, not a future allowlist. Full details are private in `script-output/tax-monetary-production-audit-a4aueeil/verification.json`. No complete tax-report equivalence claim is made beyond the supported calculation comparison.

The cent policy is approved for all 15 paths; no additional rounding decision is pending. The acceptance and deployment gates recorded below have since passed: compatible release `64a04aa022bad1fc1bc22f5c81d269a693ee68aa` is accepted in staging and production. Historical conversion and recovery remain separate operations; the preparation section below describes their tooling and remaining approvals. None of the 105 historical values was converted by application deployment. Historical conversion must preserve original raw JSON, ownership/row versions and all unrelated data, serialize through the owning Budget and refuse recovery after subsequent edits. Plaid logs remain permanently excluded.

## Prepared PostgreSQL acceptance

[monetaryStorage.spec.ts](../tests/functional/taxes/monetaryStorage.spec.ts) prepares **14 cases** using the existing authorized-test-database infrastructure, not a new framework. They have not been executed. Coverage includes real HTTP Tax POST/GET raw strings/numeric APIs and rounding; historical numeric/mixed reads without normalization; metadata preservation and optional/null semantics; unchanged persisted worksheet inputs; TransactionLog `json_typeof`/numeric log APIs, append-only history, message-only entries and the distinction between explicit JSON null and omitted SQL-null changes; owning Budget transaction rollback across both models; financial table snapshots; and cross-Budget isolation. Local execution requires separate authorization for `localhost:5432/spendcraft_test`, with the existing independently guarded setup/cleanup. No staging/production database access is part of acceptance preparation.

## Verification and preservation

Focused non-database tests cover all paths, numeric/string/mixed/null/malformed/unsafe values, raw decimal fidelity, whole-dollar/cent/fractional classification, no mutation, unknown arrays, actual worksheet threshold/payment effects, higher-precision installment outputs, explicit calculation limitations, identity/read-only admission and CLI safety. The original audit selection passed 48 non-database cases. The final focused selection passed **469 non-database cases**, zero failures/skips, including the 48 audit cases plus storage, calculations, existing codec compatibility, rollback, unavailable-plan, immutable bundle and one-way interruption checks. Changed-file ESLint, script/test syntax, documentation checks and both Git diff checks passed. Both TypeScript projects passed using the existing source-only context for the server (excluding generated release checkouts; repository tsconfig unchanged). No full suite, builds, database connection, historical conversion or deployed-environment modification occurred. Existing documentation edits and unrelated untracked work are preserved; nothing is staged or committed.


## Tax monetary PostgreSQL acceptance — October 26, 2026

Verified HEAD `a506dce0cc92e4f992da394fa944ac6bbc5852e1`, branch `dollar-to-cents-2`, with the existing uncommitted 15-path implementation. **14 original prepared cases passed, zero failed/skipped/pending**, without any production-code or test correction. All database execution was restricted to `localhost:5432/spendcraft_test`; configured, authenticated and execution user `spendcraft_test`, live server/peer `::1/128`, actual execution socket `::1:5432`. The ordinary `.env` points to a different database and was not used for test access. Explicit test connection settings and `.env.test` selected the authorized target. The first sandboxed read-only probe was denied local socket access; it performed no database operation, and the permitted probe then independently established identity before setup.

Existing centralized safeguards verified configured/live `pg` and `pgLog` identities and each actual destructive execution connection before setup, every mutation and cleanup. **28 non-database safeguard cases passed** separately. Prepared-case execution recorded **641 independent checks / 638 guarded SQL operations** and successful truncation cleanup. Test setup reported migrations already current; no schema change was needed.

The original cases establish canonical raw strings for all 13 Tax leaves, fractional-cent/negative-half/binary-artifact/zero rounding and numeric POST/GET/model responses; numeric/mixed historical reads without write-on-read; metadata-only representation preservation; unrelated root/nested JSON and missing/null behavior; and unchanged persisted worksheet inputs. TransactionLog cases establish string old/new leaves, numeric ORM/API reads, unchanged PostgreSQL `json` column semantics, explicit JSON-null versus omitted SQL-null changes, unrelated changes, message-only appends and preservation of raw historical entries. Financial hashes cover Accounts, AccountTransactions, Categories (including Funding Pools), Statements and Transaction JSON; the tested monetary edits do not change those rows. Owning Budget rollback across Tax and log writes and cross-Budget isolation passed.

**Expanded focused regressions: 637 passed, zero failed/skipped/pending**, separately from the 14 prepared cases and 28 safeguard tests:

- **168 PostgreSQL cases:** 162 existing Tax isolation/reporting, transaction lifecycle/TransactionLog-producing updates, Category/Transaction Tax/Statement storage and financial regression cases; six Tax-specific Budget contention/concurrent creation/late-save rollback cases selected explicitly from stagedBudgetWriters. Other unrelated operations in that file were not selected.
- **469 non-database cases:** approved storage/rounding/null/metadata/API behavior; actual Worksheet 2-1 threshold, safe-harbor, estimated-payment and subcent installment preservation; existing monetary codecs; compiled release compatibility; nonfatal rollback-unavailable plan publication; immutable executor bundles; one-way swaps and interruption/health-before-cleanup safeguards. No operational rollback, PM2 command or installed-directory mutation ran.

The six Tax concurrency cases verify same-Budget waiting after commit/rollback, independent progress in another Budget, one persisted forecast under concurrent first creation in either request order, and full rollback after a deliberately injected late save failure. Their nested safety layer recorded **350 checks / 348 guarded operations**, with outer bootstrap **352 / 349**; these layers overlap and must not be summed as distinct SQL writes. The 162-case run recorded **8,474 / 8,471** and successful cleanup. All three database runs independently safeguarded setup and cleanup. Detailed selections and evidence remain private at `script-output/tax-monetary-postgresql-t6j25tiy/`.

Rollback tests accept actual reviewed emitted Tax/TransactionLog implementations, reject missing/changed/unknown implementations before database access or destructive orchestration, preserve Category/Transaction Tax/Statement guards, and verify specific nonfatal unavailable reasons with no executable plan. Compatible previous releases remain eligible. These are temporary-file/non-database verification, not a live rollback rehearsal.

**Static checks:** source-only server TypeScript and client TypeScript, changed-file ESLint, relevant syntax, documentation links and both Git diff checks passed. Server checking reuses the established temporary config excluding generated release checkouts; repository tsconfig is unchanged. The existing occupied Vite HMR port 24678 emitted a nonfatal warning while HTTP tests used port 34591; no existing listener was stopped. Expected 422/404 and injected-error logs are negative-path evidence, not failures.

No production implementation, test, staged file or unrelated work changed during acceptance; only the two existing monetary migration documents gained results. No staging/production database was accessed, no historical data was converted, and no deployment or commit occurred. Task-specific local database authorization expired when the specified runs and safeguarded cleanup completed. The 15-path implementation and rollback safeguards are **accepted for commit review**. Packaging/deployment and historical conversion remain separately authorized future work; no additional rounding-policy decision is pending.

## Historical Tax and TransactionLog conversion preparation — October 26, 2026

Prepared against HEAD `64a04aa022bad1fc1bc22f5c81d269a693ee68aa`, branch `dollar-to-cents-2`, after compatible application deployment to both environments. This section supersedes the earlier pending deployment gates, without claiming that historical conversion has occurred.

[`convertHistoricalTaxMonetary.mjs`](../scripts/convertHistoricalTaxMonetary.mjs) adapts the established Statement/Transaction Tax conversion and recovery procedure. **One command and one atomic repeatable-read transaction cover both tables**, so failure in either boundary rolls back the other. Only numeric leaves in the 13 Tax paths and two log paths listed above are converted. Existing canonical strings, missing/null values, unrelated JSON and all other row columns are preserved. No schema, model, report, calculation or ordinary application reader changes are involved; no conservation rule is added. Plaid logs are never queried.

The converter reuses the existing scalar conversion/precision inspection, explicit CLI target validation, configured/live/execution connection checks, loopback normalization, PM2 stopped-writer guard and atomic transaction helper. `.env` supplies `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD` and `PG_DB_NAME`; `--database` must agree. There is no default database or production target, and no server-identity check. Importing the module does not connect. Every CLI invocation creates and immediately prints a unique absolute directory under `script-output`, before database work; files are private, exclusive-create and never overwrite earlier runs.

**Dry run:** default read-only mode, also selected explicitly with `--dry-run`, uses no Budget locks or database writes. `records.jsonl` identifies each source/table, record ID, Budget, Tax year or parent Transaction, original raw JSON, every proposed string, original amount token and exact rounding difference. `preflight.json` and `summary.json` give aggregate counts and separate table/candidate counts. Malformed/noncanonical/unsafe values, unsupported shapes, ambiguous targeted log keys or unavailable candidate ownership block the entire conversion. Null amounts are preserved, not treated as malformed or manufactured as zero. Counts of 13/92/105 from earlier production evidence are observations, never a fixed allowlist.

**Execution:** `--execute` is separate from dry run. It requires the existing PM2 guard to establish exactly the intended processes are stopped, locks owning Budgets in ascending ID order, and repeatedly checks writers and database identity. Operators must also use the established maintenance procedure to suppress scheduled restarts and fence non-PM2/child writers. Admission rejects unexpected column types, nonordinary tables, RLS, rules or user triggers. Every payload update compares ownership, original row hash and `xmin`, then verifies exact proposed raw payload, resulting full-row hash, unchanged other columns and conversion transaction ID. Only `taxes.data` and `transaction_logs.changes` can be assigned; `updated_at`, balances, IDs, messages and ownership columns are not assigned.

### TransactionLog JSON preservation

Tax uses parameterized `jsonb_set(..., false)` at the approved leaves. TransactionLogs stay PostgreSQL **`json` throughout**: ordered `json_each`/`json_object_agg` patch only numeric `amount.old/new` and carry other JSON values as raw `json`, without a JSONB cast or JavaScript object reserialization. This retains member order, duplicate **unrelated** keys, numeric token precision (including unrelated integers beyond JavaScript precision), null values and nested metadata. Message-only and other noncandidate rows receive no UPDATE. Duplicate `amount` keys, or duplicate `old/new` keys inside `amount` (including escaped spellings of the same key), are refused for review rather than collapsed or silently updated. Unsupported JSON extraction cases fail closed.

Only separators/key escaping in the reconstructed root and `amount` objects may be reformatted during conversion; byte-identical formatting of those objects is not promised. Unrelated value tokens are retained. Log row/other-column hashes use ordered JSON values from `row_to_json`, never conversion of the payload to JSONB. **Recovery restores the original raw log text exactly**, including original whitespace, escaping, duplicate keys and number spellings. This SQL behavior still requires the separately authorized PostgreSQL rehearsal; offline fixtures are not evidence of live SQL execution.

### Commands and recovery

Run from an approved tooling checkout with its existing dependencies and process manifest available. Do not change installed application files merely to run tooling. The examples below are prepared commands, not execution authorization.

```bash
# Read-only staging audit and complete conversion preview.
node scripts/auditTaxForecastPrecision.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --output-parent "$PWD/script-output"
node scripts/convertHistoricalTaxMonetary.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --dry-run \
  --output-parent "$PWD/script-output"

# Only after explicit conversion authorization and the established maintenance procedure.
node scripts/convertHistoricalTaxMonetary.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --execute \
  --pm2-home /home/ubuntu/.pm2 --pm2-manifest installer/pm2-processes.json \
  --output-parent "$PWD/script-output"

# Verify the pinned conversion snapshot without recovery writes.
node scripts/convertHistoricalTaxMonetary.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --recover --dry-run \
  --snapshot "$SNAPSHOT" --snapshot-sha256 "$SNAPSHOT_SHA256" \
  --output-parent "$PWD/script-output"

# Requires separate recovery authorization and stopped writers.
node scripts/convertHistoricalTaxMonetary.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --recover --execute \
  --snapshot "$SNAPSHOT" --snapshot-sha256 "$SNAPSHOT_SHA256" \
  --pm2-home /home/ubuntu/.pm2 --pm2-manifest installer/pm2-processes.json \
  --output-parent "$PWD/script-output"
```

Production preparation uses the same commands with `--env /spendcraft-prod/server/spendcraft-env --database budget`. Production execution needs its own fresh audit, complete approved candidate/proposed-value set, backup, maintenance window and explicit authorization. Never infer production approval from a staging rehearsal.

Before any conversion UPDATE, the tool fsyncs `original-tax-monetary.jsonl` and `snapshot.json`, records the data SHA-256 in the manifest, and prints the manifest path/SHA-256 as a recovery point. Preserve that original pin independently as `$SNAPSHOT_SHA256`; do not replace it with a newly calculated hash to make a changed snapshot pass. The manifest binds the complete target identity, operation, candidate count and conversion transaction ID; each entry records source, ID, Budget, parent Transaction where relevant, original/converted raw JSON, full-row hashes, other-column hash and original `xmin`.

Recovery verifies both hashes and the full target identity, obtains the same Budget serialization, and refuses any missing/moved/edited row or equal-value later save using the converted payload/hash and conversion `xmin`. It restores only affected payloads, using `::json` for logs and `::jsonb` for Tax, and verifies original raw JSON/full-row hashes. Recovery of both boundaries is atomic. No recovery, database-backup restoration or application rollback is automatic. After any failure or uncertain COMMIT, preserve evidence and establish committed state before a retry or restarting writers.

### Required staging rehearsal

1. With separate staging authorization, verify target identity and existing candidates first. Use the established PM2 maintenance procedure and a fresh backup. Do not assume all preexisting staging data is synthetic.
2. Use minimal isolated synthetic fixtures for all 15 paths: numbers/strings/mixed values, signs, fractional cents and half ties, missing/null parents/leaves, message-only logs, unrelated large-number/nested JSON and unrelated duplicate keys. Record every ID; do not modify preexisting financial records.
3. Run audit and dry run; require the full candidate set to be exactly the approved fixtures. Confirm duplicate monetary keys are rejected. Stop on unrelated candidates rather than changing scope or filters.
4. Execute conversion; inspect raw JSON types/tokens, unchanged IDs/ownership/order/messages and financial snapshots. Verify numeric application responses and existing Worksheet calculations without changing intermediate arithmetic.
5. Execute again and require zero candidates/updates, preserving the first snapshot and pin.
6. With separately authorized recovery, restore that synthetic snapshot exactly, including log text/whitespace, and compare hashes. In a separate synthetic case, edit after conversion and confirm recovery refuses to overwrite the new state.
7. Clean up fixtures only if specifically authorized and ownership is certain; restore normal restart schedules and service availability using the established procedure after verifying database safety.

Focused offline coverage is in [`historicalTaxMonetaryConversion.spec.js`](../tests/unit/historicalTaxMonetaryConversion.spec.js). It tests codec parity, malformed/unsafe rejection, complete dry-run details, JSON-preserving SQL structure, combined atomicity, idempotency, pinned exact recovery, later-edit/equal-save/ownership refusal, writer/schema/identity admission, commit uncertainty and unchanged cent-scale Worksheet behavior. Actual PostgreSQL `json_object_agg` persistence, locking and recovery remain unexecuted until separate staging authorization. No database or deployed environment was touched during preparation.

Preparation verification: **295 focused non-database cases passed, zero failures/skips**, including **53 new cases** and the existing Statement income, Transaction Tax, Category conversion/recovery and Tax precision-audit cases. Changed-file ESLint, script/test syntax and both Git diff checks passed. No TypeScript/application code changed; no full suite, build or PostgreSQL test ran. Staging audit, synthetic conversion, recovery, cleanup and any production operation still require their respective explicit authorizations.
