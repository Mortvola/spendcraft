# Transaction tax attribution: precision characterization and historical audit

October 23, 2026. Exact HEAD: `f92024df6bd6276d400d7552aa8fc95b13d179e1`; branch `dollar-to-cents-2`.

**Current status: production read-only historical audit completed October 23, 2026. No tax storage-rounding policy or migration is approved.**

See [the historical audit record](transaction-tax-attribution-historical-audit.md): 6,271 Transactions examined, 21 tax entries across 21 Transactions, all numeric and cent-valued; zero malformed/unsupported/fractional-cent findings and zero changes under reference rounding. All 21 monthly/type reporting groups are unchanged in both existing SQL real and separate exact raw-decimal comparisons. No records were modified.

The preparation sections below describe the earlier task; their NOT EXECUTED/authorization statements are historical preparation status, superseded only by the separately authorized read-only execution record. Future conversion remains unapproved. The only monetary field examined for this potential slice is `transactions.taxes[].amount`. The completed Transaction Category string migration and its temporary numeric/string compatibility remain unchanged.

## Baseline and scope

Read the [remaining inventory](remaining-monetary-storage-inventory.md), [candidate review](remaining-json-money-migration-candidates.md), [monetary scope](monetary-migration-scope.md), [accounting invariants](accounting-invariants.md), correctness readiness, Transaction Category storage design/implementation and cent-conservation audit. Current source/tests are authority. Older documents' pending Category conversion statements are historical; accepted staging/production completion is not reopened.

Entry working-tree status: `.gitignore` modified/staged, storage inventory added/staged, candidate-review document already untracked; no tracked unstaged modifications. Existing untracked editor settings, dumps, PEM and test/report artifacts were preserved, not opened for private financial data. Staged fingerprint: `4424d95b30dbaa214f3e9d29c5e5fcf5b83ff368630b3867951288c54a33bc6e`.

Loans and all `transaction_categories` dependencies are entirely excluded. The audit detects current deprecated ownership only to exclude rows; it reads no deprecated relational allocations or Loan monetary fields. No Account/Category/Pool balances, AccountTransaction amounts or Statement money are collected or changed.

## Current JSON shape and authority

Migration [1787243890453](../database/migrations/1787243890453_alter_transactions_table.ts) defines JSONB `transactions.taxes`, NOT NULL DEFAULT `[]`. [Transaction](../app/Models/Transaction.ts) declares `TransTaxCategory { type: string; amount: number }[]` and prepares it with JSON.stringify. It has no tax-specific consume or serialization decoder.

Current writer shape:

```json
[{ "type": "estimated_tax_payments", "amount": 123.45 }]
```

- Identifier is string `type`, not a Category ID. The tax category catalog currently seeds `taxable_social_security_benefits` and `estimated_tax_payments`; the server accepts other nonempty strings and does not validate catalog membership. See [seeder](../database/seeders/tax_category_seeder.ts), [tax_categories migration](../database/migrations/1787244145337_create_tax_categories_table.ts).
- Amount is signed dollar attribution, manually assigned through editing. It is not automatically calculated from the movement, Category allocations or Statement balances.
- Current PATCH rebuilds each submitted entry as `{type, amount}`; other request metadata is not part of that writer's persisted entry. The JSON column can physically retain extra historical properties; their presence and meaning are UNKNOWN. The audit does not output those unrelated properties.
- Array order is retained; duplicates are neither sorted nor deduplicated. Empty arrays clear attribution. Empty-string type entries are filtered out by the writer; whitespace-only and unknown type identifiers are not separately catalog-validated there.
- Missing required entry amount/type is rejected by the current validator; root null/non-array is outside the declared model/schema contract. Actual legacy null/missing/object shapes are UNKNOWN without an audit, not asserted present or absent by TypeScript.
- Soft deletion does not clear taxes. `TransactionsController.delete` and provider `Account.deleteAccountTransaction` mark deleted and preserve tax JSON; parent physical deletion can remove the containing Transaction. The audit includes deleted nondeprecated rows.
- Current PATCH requires an existing nondeleted, correctly versioned, account-linked Transaction belonging to the user Budget and rejects balance-tracked Accounts. It does not expose a general tax-edit route for accountless funding/rebalance. Thus ordinary account-linked types are the normal editing path. The storage column has no tax-specific Transaction-type constraint; the report has no type filter. The audit examines supported types 0/2/3/4/5, flags other nondeprecated types for review and does not invent their lifecycle semantics.

**Authority: manually entered reporting attribution.** These values supply actual tax reporting inputs (e.g. estimated payments/benefits) and downstream estimates; they are not posted ledger effects. Editing taxes alone does not calculate a new Account/Category/Pool balance or fund/rebalance money. The surrounding PATCH can independently edit financial fields, but taxes are not their authority. There is insufficient source information to recompute the attribution from other stored money. It is independent of Category allocation totals.

## Active writer chain

| Layer / source | Actual behavior |
| --- | --- |
| [TransactionTaxCategory](../client-src/Transactions/TransactionTaxCategory.tsx) | AmountInput receives numeric `split.amount` and **onDeltaChange**, without controlled onChange. Forwards the numeric amount callback through the collection component. |
| [TransactionTaxCategories](../client-src/Transactions/TransactionTaxCategories.tsx) | Maintains ordered editing array with temporary client IDs. Adds zero/blank-type entries, edits amount/type and preserves duplicate types. Does not sum against the Transaction amount. |
| [TransactionDialog](../client-src/Transactions/TransactionDialog.tsx) | Submits edited taxCategories. `validateTaxCategories` is a TODO with no implemented conservation check. |
| [State.Transaction.update](../client-src/State/Transaction.ts) | PATCH numeric DTO with version and optional taxCategories; no extra monetary rounding here. |
| [updateTransaction validator](../app/validation/Validators/transaction.ts) | Optional taxCategories array of required Vine string type + number amount. No cents-only constraint, catalog check, nonnegative-only constraint or amount equality. Numeric coercion can accept numeric strings; invalid numeric syntax/nonfinite input is handled by Vine, not silently normalized by the audit. |
| [TransactionsController.update](../app/Controllers/Http/TransactionsController.ts) | Begins transaction, binds user, acquires owning Budget FOR UPDATE, loads fresh same-Budget nondeleted Transaction, checks version, loads AccountTransaction/Account through owning transaction and authorizes Account Budget. Copies each entry whose type !== '' into transaction.taxes. Saves through owning transaction, increments Transaction version and writes a log. No tax precision normalization. |
| [Transaction.taxes](../app/Models/Transaction.ts) | JSON.stringify of the array. JavaScript numeric serialization occurs before PostgreSQL JSONB parses the numeric token. No implicit tax conversion by the Category allocation hooks. |

Searches of controllers, services, commands, jobs and providers found **one active nonempty tax-attribution mutation entry point**, Transaction PATCH. Manual CREATE validator has no taxCategories input. Provider import/reimport and funding/rebalance/opening do not populate nonempty tax arrays; ordinary inserts can rely on `[]` default. Provider changes to movement money do not constitute tax recomputation. `commands/Taxes.ts` is a calculation example, not a tax JSON writer. Model use by tests and read-only operator tools is not an additional production writer.

## Active readers and numeric expectations

| Reader | Type, arithmetic, output |
| --- | --- |
| [Transaction model](../app/Models/Transaction.ts) and [transactionFields](../app/Controllers/Http/transactionFields.ts) | Native JSONB hydration and common serialization include taxes unchanged. Transaction/register/Category/Account response paths sharing that serializer can carry the array. No rounding or comparison in serialization. |
| [State.Transaction.set/refresh](../client-src/State/Transaction.ts) | Maps `props.taxes` entries into `{type, amount}` numeric client taxCategories. A raw stored string would leak without an adapter; TS annotation does not decode it. |
| Tax editor components above | AmountInput formatting and callback behavior below; no conserved total. |
| [TaxesController.getActuals](../app/Controllers/Http/TaxesController.ts) | SQL monthly/type sums using real amount extraction. Produces numeric aggregated `actuals[].taxes[type]`; no per-entry cent rounding. |
| [State.Taxes.updateValues](../client-src/State/Taxes/Taxes.ts) | Cumulatively adds actuals by tax-estimate period. Recognizes taxable_social_security_benefits and estimated_tax_payments. Uses `+=` with no numeric string decoder or cent normalization. |
| [Income](../client-src/State/Taxes/Income.ts), [Worksheet2_9](../client-src/State/Taxes/Worksheet2_9.ts), [Estimated](../client-src/State/Taxes/Estimated.ts) | Consume benefit/payment actuals in income and estimated-tax calculations, numeric comparisons, annualization and tax worksheet calculations. Their derived results do not rewrite Transaction tax JSON. |
| [Income UI](../client-src/Taxes/Income.tsx), worksheet UIs, [Amount](../client-src/Amount.tsx) | Present numeric totals with two decimal formatting. Formatting is not storage precision enforcement. |

No active Category/Funding History/Income Vs. Expenses/Net Worth/Payee report reader was found using tax attribution as its posting/allocation authority. Statement data contributes to the same tax actuals response through a separate query; that does not establish an equality or duplicated-money rule between the two sources.

## AmountInput precision: actual tax-editor configuration

[AmountInput](../client-src/AmountInput.tsx) accepts number/string values, with internal editing/initial/equation states as strings.

- Initial formatting uses parseFloat where needed, then toFixed(2). Change updates the internal string; no tax state callback occurs until blur produces nonzero delta.
- Blur computes `Math.round(parseFloat(event.target.value) * 100) / 100`, replaces local NaN with zero, computes delta against the formatted initial value, invokes onDeltaChange(newAmount, delta) **only when delta !== 0**, and displays newAmount.toFixed(2).
- This is a cents-oriented editor path, not a universal server storage policy. If the original stored number has subcent precision and merely receives focus/blur with no cent delta, it can remain unchanged in tax state. Do not infer that displaying or submitting an unchanged editor normalizes all historic values.
- Negative values are permitted. Math.round negative half ties go toward positive infinity, including rounded negative zero. `delta !== 0` can suppress a zero/-zero callback. Numeric JSON serialization does not preserve a negative-zero sign; JSONB likewise canonicalizes its representation. The audit can report negative-zero behavior in proposed computation, but cannot reconstruct a lost historic -0 sign.
- Invalid/incomplete text such as '-' becomes local zero on blur; callback behavior depends on prior initial value/delta. Infinity is not rejected by the component's NaN-only branch; server numeric validation and JSON transport are distinct boundaries. Audit invalid input is never turned into zero.
- Calculator uses EquationParser numeric arithmetic, then **toFixed(2)** for its editing result, followed by later blur behavior. This can differ from directly applying Math.round to the raw equation result. Example: raw -0.125 toFixed(2) gives '-0.13', while direct numeric Math.round-to-cents gives -0.12.
- Callback values and delta are JavaScript numbers; subtraction can carry binary artifacts. Amount display toFixed(2) can hide a higher-precision persisted amount.

The existing non-DB precision tests exercise the actual component/calculator expressions. No AmountInput code changed.

## Current storage, SQL and rounding boundaries

1. **Input:** typical tax-editor blur uses Math.round-to-cents. Direct API PATCH accepts subcents (new audit tests exercise actual validator with 1.005, -0.125 and '1.239'). The latter string is coerced to numeric 1.239, not stored as a string by this writer.
2. **Persistence:** JSON.stringify stores the decimal token emitted by JavaScript for the number, e.g. 0.30000000000000004. JSONB numeric supports decimal tokens without a fixed monetary scale. It does not store the entire IEEE-754 bit pattern or recover intended precision lost earlier. Raw existing JSONB tokens may also have been written externally with greater precision than JavaScript hydration can retain.
3. **Report:**

```sql
cross join lateral jsonb_to_recordset(transactions.taxes)
  as transTaxes(type varchar, amount real)
-- selected amount:
sum(COALESCE(transTaxes.amount, 0)) as tax_amount
```

`real` is single-precision floating-point extraction and aggregation, not decimal-cent rounding or a scale-2 cast. It can lose significant digits, produce binary aggregation error or reject very large values; no explicit Math.round/toFixed occurs in the SQL. Null recordset amounts become zero at this read boundary; malformed cast input can error. This behavior is characterized, not approved as a new validation/fallback policy.

4. **Selection:** owning Budget `application_id` via model budgetId; date BETWEEN year-01-01 and year-12-31 (inclusive); group by month of Transaction date and string tax type. There is **no Transaction type/deleted/pending filter, Account link requirement, Account.startDate filter or tax-catalog join** in the Transaction tax query. Do not import ordinary posting eligibility into this report. Statement actuals have their own subtype and date selection; no change proposed.
5. **API/client:** float results are used as numeric tax actuals; unknown type keys can be returned even though current client worksheets recognize only named keys. The API's TypeScript `TaxActualProps` is narrower than the raw dynamic SQL map. Forecast is a separate object and not changed by this review.

A future canonical-string leaf is plausibly readable by numeric recordset casting, but this requires real PostgreSQL verification before approval. Keeping the `real` cast preserves its existing floating behavior; replacing it with numeric arithmetic would be a separate calculation decision. Exact stored text alone does not make reporting exact-cent arithmetic.

## No conservation rule established

No implemented tax-array sum check ties tax amounts to Transaction/AccountTransaction money, Category allocations, Statement attribution, zero or a tax total. Multiple entries and duplicate type values are accepted; query aggregation sums them individually. Partial and overlapping attribution are not prohibited by these validations. Source permission is not proof that every overlap is economically appropriate. Negative amounts are accepted, with no sign flip relative to Account/Category money imposed by the writer. The type key controls reporting classification, not a Category posting.

The audit therefore reports precision/shape only: **no pass/fail conservation, no missing-attribution synthesis, no type redistribution and no comparison against AccountTransaction amounts.** Type2/3 Category conservation and opening/ordinary rules are not tax rules.

## Prepared historical audit

Script: [scripts/auditTransactionTaxPrecision.mjs](../scripts/auditTransactionTaxPrecision.mjs). Helpers are exported from the same module and tested directly. It imports only existing operator configuration and strict identity helpers, without application bootstrap, jobs or connection side effects on import. `adonisrc.ts` includes it in future release payloads; its local helper dependencies are already packaged.

### Safety and target selection

- Required `--database NAME` is an assertion against `.env` PG_DB_NAME, never an override. No default production database. `--env PATH` selects the dotenv file (default `.env`); only PG_HOST, PG_PORT, PG_USER, PG_PASSWORD and PG_DB_NAME provide credentials/connection identity. Ambient PG connection variables do not override them.
- The existing centralized strict operator checks require TCP loopback PG_HOST (localhost/127.0.0.1/::1), verify live database, user, port, database OID, cluster identity and actual TCP stream server/port; server/peer CIDR loopback variants are strictly normalized. No arbitrary remote host or generic bypass is accepted. Run on the intended database host for staging/production. These are source safeguards, not an EC2/machine-ID or operator-authored plan requirement.
- Connection uses default_transaction_read_only=on; scan explicitly begins REPEATABLE READ READ ONLY and checks actual transaction_read_only before financial SELECTs. Identity is verified within the transaction before and after scanning. pg_control_system metadata permission is required by the reused identity check; a readonly role without it fails closed. No grants are executed by this tool.
- All scan SQL is fixed SELECT plus BEGIN/COMMIT/error ROLLBACK. No mutation SQL, dynamic operator SQL, schema objects, PM2 work, locks beyond ordinary SELECT behavior or conversion mode exists. `--execute` is rejected. `--dry-run` is optional and simply labels the same always-read-only audit.
- Default page size 100, ordered keyset by Transaction ID, streamed JSONL, fixed/bounded type buckets. Memory is one page plus the largest contained JSON array/token; a single extraordinarily large record still must fit. No full-table JS collection or N+1 per-entry query. Query timeout 30s, lock timeout 3s, idle-in-transaction timeout 60s, overall connection/scan deadline 5 minutes. A long read-only snapshot can still retain database row versions; schedule appropriately.
- Before .env reading/database work, a unique private `tax-precision-audit-*` folder is created and its absolute location immediately printed. Evidence files use exclusive creation and mode 0600; prior evidence is never overwritten. Output excludes names/comments, credentials and other financial fields. Tax identifiers/raw monetary values are sensitive audit evidence; protect the directory.

### Data collected and exclusions

Fixed scan reads Transaction ID/type/deleted flag, raw taxes JSON text, independently extracted raw amount tokens in original order, and current Account/Category type tags solely for deprecated exclusion. It reads no AccountTransaction amounts, balance fields, Statement money or legacy allocation table. Current Loan Account/Category links exclude a Transaction before amount analysis; its detail contains no tax values. Type 1 is the transfer enum, not a Loan identifier; it is flagged as outside the supported lifecycle list, never automatically excluded. Other unrecognized nondeprecated lifecycle types are flagged but their syntactic amount precision can still be characterized without claiming supported posting semantics.

Raw amount tokens survive separately from JSON.parse, so hydration cannot erase the original decimal token. No unrelated entry metadata is output. Query results are not saved back. Stored SQL NULL, JSON null, missing fixture/root values, non-array legacy shapes and invalid entry objects have separate detail classifications. In the real current schema, a missing taxes column is a connection/query failure, not silently reported as empty data.

### Numeric characterization

For each finite numeric amount with safely representable rounded integer cents, calculate reference `Math.round(amount*100)` and `(cents/100).toFixed(2)`. This is **not approved tax conversion policy**. Check safe range and whether formatting preserves those integer cents; failures remain explicit malformed/unsafe findings, never zero.

Audit-only BigInt decimal arithmetic interprets the original raw token exactly as base-ten text to identify fractional cents and compute the signed `proposed - original` difference in cents as a decimal string. It does not use `Number.isInteger(amount*100)` to classify stored cents: 0.29 can fail that floating test while its stored token has no fractional cent. Raw source-to-JavaScript precision loss is a separate flag from proposed rounding differences.

Both mathematical half ties in the raw decimal token and actual JavaScript multiplication half ties are reported. They differ for 1.005. Negative zero source/proposal flags distinguish sign normalization from monetary difference. The proposal is not persisted and no round-the-total tax calculation is performed.

| Example numeric token | Reference proposal | Exact difference in cents | Notes |
| --- | --- | --- | --- |
| `12.34` | `12.34` | `0` | Exact stored cent token |
| `0.29` | `0.29` | `0` | Binary multiplication artifact is not stored subcent precision |
| `0.125` | `0.13` | `0.5` | Positive exact half tie |
| `-0.125` | `-0.12` | `0.5` | Negative tie toward positive infinity |
| `1.005` | `1.00` | `-0.5` | Multiplication is just below the mathematical half tie |
| `-1.005` | `-1.00` | `0.5` | Existing JS behavior, not a tax policy decision |
| `0.30000000000000004` | `0.30` | `-0.000000000000004` | Original serialized artifact retained in output |
| `-0.001` | `0.00` | `0.1` | Rounded negative zero normalized in formatted proposal |

### String and invalid amounts

Existing string leaves are characterized separately, not blindly Number()-rounded. Strict full-string signed decimal syntax permits decimal/exponent text for classification and identifies canonical two-decimal strings separately. Whitespace, numeric junk, blank, comma-formatted, hexadecimal, nonfinite, null, boolean, object, missing or unsupported amounts are not coerced to zero. Noncanonical but syntactically valid decimal strings are counted separately, not certified as current writer output or approved storage.

Audit decimal parsing is bounded (4096 characters, exponent magnitude at most 1024) and uses the safe-integer-cent magnitude limit; larger values receive explicit unsupported-range/unsafe reasons. This is a tool's characterization limit, not a new tax/API monetary range policy. Numeric proposals also reject a safe-cent value whose division/toFixed cannot represent those same cents. Strings receive exact decimal fractional-cent analysis and no numeric-rounding proposal, preserving the distinction from historical numeric inputs.

### Output and count semantics

- `summary.txt`: concise human summary.
- `summary.json`: machine result, `status:complete`, `readOnly:true`, `roundingPolicyApprovedForTax:false`, verified target identity and counters.
- `transactions.jsonl`: one deterministic ID-ordered finding per examined Transaction. Includes Transaction type/deleted state, root shape, malformed/unsupported flags and per-entry index/type/duplicate flag, raw original amount token, kind, validation reason, precision and numeric-proposal fields. Extra metadata and deprecated monetary values are omitted.
- `failure.json`: safe phase/code if the run fails. Raw database exception messages/SQL parameters are never printed. Partial JSONL is not a completed audit; require complete summary.

Transaction counters: transactionsExamined (including excluded rows), excludedDeprecated, transactionsWithTaxAttribution (nonempty arrays), emptyTaxArrays, missingTaxData, nullTaxData, mixedArrays, malformedTransactions, unsupportedTransactions, unsupportedLegacyShapes, deletedTransactionsWithTaxAttribution, transactionsAffectedByRounding and fixed byType buckets (0/2/3/4/5/other). Missing/null and unsupported/non-array classifications can overlap by definition; do not add them as mutually exclusive totals.

Entry counters: totalTaxEntries (all array elements), numericAmountEntries, stringAmountEntries, validAmountEntries, canonicalStringEntries, noncanonicalStringEntries, malformedAmountEntries, malformedEntries (also counts invalid type/entry shape), fractionalCentAmounts with numeric/string breakdown, roundedNumericAmountsChanged, numericSourceToNumberChanges, original/rounded negative-zero counts, source/javascript half-tie counts and duplicateTaxEntries. A malformed tax identifier and a malformed amount are distinct dimensions. Deprecated arrays do not contribute entry or precision counts. No deduplication occurs.

No historical tax counts or absence of malformed data can be established until a separately authorized run completes.

## Later execution, only after separate authorization

Offline query inspection, without .env reads or database connection:

```sh
node scripts/auditTransactionTaxPrecision.mjs --print-sql
```

On staging (database expected by current installer is spendcraft), after explicitly authorizing read-only access:

```sh
cd "$SPENDCRAFT_ROOT/spendcraft"
node scripts/auditTransactionTaxPrecision.mjs --database spendcraft --env .env --dry-run
```

On production, after separate read-only authorization:

```sh
cd "$SPENDCRAFT_ROOT/spendcraft"
node scripts/auditTransactionTaxPrecision.mjs --database budget --env .env --dry-run
```

For local sandbox, after authorizing that target, use `--database spendcraft_sandbox --env /absolute/settings.env`. An optional `--output-parent /existing/private/directory` places the automatically generated unique folder there. Do not send passwords, tokens or full raw financial records in chat. Summaries/appropriate redacted precision findings are sufficient for review. These commands are instructions for a future operator run; none was executed during preparation. Read-only auditing does not require PM2 shutdown and cannot stop/restart processes.

The new script is included in future builds, not automatically copied to an already installed release. Deploying that artifact or transferring the verified script/dependency tree remains a separate operation; no server files were changed here.

## Future representation compatibility and product decisions

A tax-specific, explicitly nondeprecated centralized storage boundary could plausibly encode selected leaves and decode numeric/string/mixed storage into unchanged numeric runtime/API values. It must be separate from Category allocation hooks, preserve array ordering/type/duplicates and metadata, and never save on read. Merely adding a model prepare hook would leak strings through generic serialization, State.Transaction, and `?? 0` or `+=` consumers. SQL real casts may read string tokens but need real PostgreSQL tests; retaining those casts does not create exact reporting arithmetic.

Before any migration, decide: cent-scale semantics for entered attribution, allowable rounding/tie/negative-zero/range policy, treatment of historical fractional cents, malformed or unsupported shapes and unknown tax identifiers, and active lifecycle scope while leaving deprecated paths unchanged. Do not automatically reuse the Category policy just because the normal editor's direct blur calculation resembles it. Do not introduce a new attribution conservation rule or change deleted/pending/date selection. No financial repair or report recalculation is authorized.

## Verification and changed files

Prepared code/test/configuration changes:

- `scripts/auditTransactionTaxPrecision.mjs`: standalone read-only audit and actual exported characterization helpers.
- `tests/unit/transactionTaxPrecisionAudit.spec.js`: numeric/string/null/mixed/duplicate/deleted/unsafe precision cases, actual PATCH validation, raw-token preservation, deterministic mock scan, readonly verification, identity mismatch, safe output and release packaging tests.
- `adonisrc.ts`: includes only the new operator audit in build metadata; existing helper packaging remains. No application monetary readers/writers, validators, SQL report or client behavior changed.
- This new precision-review document.

Focused tests use synthetic values and mocked connections; no PostgreSQL connection, setup, fixture cleanup or application bootstrap occurs. A local CLI subprocess test intentionally fails .env target assertion **before driver connection**, verifying output privacy/unique folders. Temporary test filesystem cleanup is local only.

Verification results are recorded after final checks below. This task did not execute a historical audit, conversion, recovery, migration, deployment or commit.

Final non-DB verification:

| Check | Result |
| --- | --- |
| New audit tests + existing precision and packaging regressions | **81 passed, 0 failed, 0 skipped** |
| Server TypeScript | Passed |
| Client TypeScript | Passed |
| ESLint on all changed code/test/config files | Passed |
| Repository-wide ESLint | **Failed: 6 pre-existing no-undef errors** in ignored local `category-conversion-readiness-ajar8i/production-readonly-probe.mjs` (console/process); that artifact was not altered or suppressed |
| Knip | Passed |
| Circular regression | Passed; accepted Lucid SCC only |
| Script/test syntax | Passed |
| Server build including Vite client assets | Passed; existing >500 kB chunk warning |
| Built audit import check | Passed without database work |
| Local documentation links and both diff whitespace checks | Passed |

Existing staged work remains byte-for-byte unchanged. Only the new audit, its test, this document and the new audit build-metadata entry belong to this task. Candidate review and unrelated user files remain untouched. No production monetary behavior changed; no database connection, historical data change, monetary representation change, schema migration, deployment or commit occurred. Historical tax audit execution still requires separate authorization.

## Subsequent approved tax storage implementation (2026-10-23)

The earlier investigation and audit policy statements above describe their original task. Product approval now establishes canonical two-decimal strings for `transactions.taxes[].amount`, JavaScript `Math.round(amount * 100)`/divide/toFixed rounding (including fractional input and negative half ties), numeric runtime/API compatibility, temporary numeric/string/mixed reads, **no tax conservation rule**, and unchanged existing real report aggregation/selection. Historical conversion remains separate and deferred.

The bounded implementation is documented in [Transaction tax decimal-string implementation](transaction-tax-decimal-string-implementation.md). No historical observation or original audit result above was replaced; no production audit was rerun during implementation.
