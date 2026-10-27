# Remaining monetary migration candidates

Reconciled against HEAD `8cf27b0bb68f4f7cd78dc4565418c7fce8977576`, branch `dollar-to-cents-2`, after the accepted production auto-assignment migration. This is candidate selection, not implementation or database execution approval. The [storage inventory](remaining-monetary-storage-inventory.md) records exact paths and source boundaries; [scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md) remain authoritative.

## Completed migrations

**COMPLETED — DECIMAL-STRING STORAGE:** Transaction Category allocations (1 path), Transaction Tax attribution (1), Statement income attribution (4), Tax forecast inputs (13) and TransactionLog old/new movement amounts (2): **21 paths total**. Exact paths are in the [completed table](remaining-monetary-storage-inventory.md#completed-migrations-21-paths). All are deployed and historically converted in production with accepted idempotency, financial noninterference and numeric runtime/API compatibility. Preserve numeric/string/mixed compatibility readers and rollback safeguards.

The latest production conversion changed 13 Tax leaves and 92 Log leaves with zero monetary differences. Final Worksheet verification matched all 23 lines and complete result data after correcting the operator command's VM-prototype comparison. This is prior accepted evidence, not a request to repeat conversion, recovery, deployment or audits. Tax formulas/intermediate precision and TransactionLog PostgreSQL `json` semantics remain unchanged. Keep pinned original recovery evidence and backups.

## Completed auto-assignment precision

**COMPLETED — NUMERIC(12,2) STORAGE.** Staging and production deployment/acceptance passed. Production preserved 31 percentage rules at `100.00`, numeric model/controller serialization, financial hashes and normal PM2 schedules. Prior evidence: `script-output/auto-assignment-production-install-dpDFvK/`. No completed migration is reopened or rerun here.

## Remaining candidate set and counts

Remaining in scope: **10 locations = 7 already-exact relational columns + 3 JSON monetary paths**. There are **0** remaining floating relational money columns and **0** confirmed unconverted diagnostic money paths. This excludes completed auto-assignment; eight relational columns now have exact storage in total. The descriptive count remains **38 = 21 completed strings + 1 completed relational migration + 10 remaining + 6 excluded Plaid examples**. Loans, deprecated `transaction_categories`, BalanceHistory and Plaid logs remain excluded.

| Exact monetary path | Meaning / authority | Current representation and boundary |
| --- | --- | --- |
| `categories.funding_categories[].amount`, fixed mode | Mutable fixed-dollar funding cap/configuration; not a balance | JSONB NOT NULL DEFAULT `[]`; entries `{categoryId, amount, percentage}`. Category CREATE/PATCH validates numbers and same-Budget references; Category model JSON.stringify, without fixed-dollar cent quantization |
| `transactions.categories[].baseAmount` | Requested pre-transfer base snapshot, distinct from final allocation and net Category effect; not reversal authority | Optional JSONB numeric metadata, chiefly type 2; transfer DTO also permits it on type 3. FundingDialog/calculator and transfer CREATE/replacement persist it unchanged |
| `transactions.categories[].fundingCategories[].amount`, fixed mode | Historical fixed-rule snapshot reused by funding edits rather than current Category configuration | Optional nested JSONB rule array; required numeric amount within supplied entries, copied by transfer CREATE/replacement |

All three have numeric runtime/API contracts and no storage-string decoder. The saved allocation shape is `{categoryId, amount, comment?, funder?, baseAmount?, fundingCategories?: [{categoryId, amount, percentage}], includeFundingTransfers?}`. The completed outer `amount` codec preserves this metadata; it does not quantize it. Preserve order, duplicates, unknown metadata and missing/null semantics.

### Readers, writers and validation

- [Category](../app/Models/Category.ts), [CategoriesController CREATE/PATCH](../app/Controllers/Http/CategoriesController.ts) and [category validators](../app/validation/Validators/category.ts) own live rule writes. Existing Budget transactions/ownership checks remain mandatory. PATCH omission leaves the configuration unchanged. [Category state](../client-src/State/Category.ts), [Group state](../client-src/State/Group.ts) and [CategoryDialog](../client-src/Categories/CategoryView/CategoryDialog.tsx) feed the editor; client saves rules for Bill mode and supplies `[]` for other types.
- [Budget.getProposedFunding](../app/Models/Budget.ts) returns those rules alongside a base derived from exact planned money or goal/recurrence calculations. Monthly goal proposals already round to cents. Reproducing proposals requires dates, balances, goals/recurrence and future-transaction context, outside these three leaves.
- [FundingDialog](../client-src/Funding/FundingDialog.tsx) submits [calculateFunding](../client-src/Funding/calculateFunding.ts) output. [Transfer validation](../app/validation/Validators/categoryTransfer.ts) accepts optional numeric base and optional numeric rule snapshots without field-specific fixed-dollar/base cent or safe-cent constraints. The transfer controller posts/reverses outer allocation deltas under Budget serialization and existing conservation checks; metadata is not reversal authority.
- [Transaction state](../client-src/State/Transaction.ts), [shared DTOs](../common/ResponseTypes.ts) and [FundingItem](../client-src/Funding/FundingItem.tsx) read requested bases/rules and calculate numeric previews. `CategoriesController.get` uses `jsonb_to_recordset(... "baseAmount" decimal)` and `sum(coalesce(baseAmount,0))` for prior-month, active type-2 funding scoped to Budget. No SQL reader of the two nested rule amounts was found in the directly relevant paths.
- [AmountInput](../client-src/AmountInput.tsx) displays two decimals and rounds on blur with Math.round. That does not guarantee all form/API inputs are cent-quantized. No intentional subcent requirement for fixed-dollar caps was found.

`percentage:true` means percentage points, not currency. [Existing funding-percentage validation](../common/fundingPercentages.ts) requires finite, nonnegative percentages, at most two decimal places and exactly 100% when any percentage rules exist. Fixed-only arrays have no percentage-total requirement; fixed money is not made nonnegative by this validator. Percentage points remain distinct from dollars; the approved future representation is canonical two-decimal strings for both modes, with numeric runtime/API values. Historical missing/null flags take the calculator's falsey fixed branch but require explicit eligibility review; other flag shapes are unsupported.

## Funding calculations and reconstruction

`computeSpread` rounds its supplied base and fixed caps to integer cents, caps each fixed withdrawal by remaining cents, then rounds percentages of the remaining cent base. The last percentage entry absorbs the residual; duplicate funder IDs accumulate. Fixed-only underfunding may leave a remainder rejected by the existing server validator. Do not invent a new recipient or clamp.

The comparator `.sort(a => a.percentage ? 1 : -1)` does not establish coherent equal-mode priority. Preserve actual array/order evidence and engine observations; do not infer a winner policy or browser/Node tie-order equivalence.

`calculateFunding` retains the requested base without first rounding it, builds spreads, then handles `includeFundingTransfers` in a single object-key-ordered pass, adding incoming cent transfers and recomputing that destination's spread. Binary artifacts can survive in raw requests while posted integer cents remain unchanged. Half-tie/threshold changes, caps and transfer chains can still be significant; do not add intermediate rounding or a new cyclic solver.

`FundingDialog.initialFunding` skips funder rows, reuses saved rules, and uses `baseAmount ?? decodedOuterAmount`. Absent rules require a Category-tree Funding Pool lookup; current budget/bill Categories absent from the snapshot are added as zero inputs. Duplicate destination IDs collapse by object-key assignment. These are current behaviors, not approved historical normalization. Generated funder rows carry zero base, empty rules and `funder:true`.

The server changes Category/Funding Pool balances from completed outer allocations. AccountTransaction, Account and Statement balances are not authorities of these three metadata leaves. Neither stored snapshots nor current balances prove historical applied effects. Full reconstruction or balance repair is not authorized.

## Historical audit and funding-impact readiness

[`auditFundingPrecision.mjs`](../scripts/auditFundingPrecision.mjs) is a small read-only adapter because existing audits do not cover these nested shapes or funding functions. Imports never connect. It requires explicit database selection, reads PG settings from the selected environment file, reuses configured/live/actual connection identity safeguards, uses a read-only connection and repeatable-read READ ONLY transaction, pages records, rechecks identity and ends in ROLLBACK. Connection/query/lock/idle/run timeouts apply. No execute/recovery mode, application bootstrap or server-identity check is added.

Each run prints a unique private `script-output/funding-precision-audit-*` directory before configuration/database work. `records.jsonl` preserves original PostgreSQL JSONB text, IDs, Budget/type/deleted/date context, indexed leaf paths, classifications and hypothetical proposals; `summary.json` reconciles counts. SQL also returns exact per-leaf text tokens. Classification detects source-to-Number precision loss; raw JSON/tokens remain authoritative and those rows are not compared as ordinary numeric inputs.

Per path: records examined/containing/without leaves, mixed records, numeric/string/canonical amounts, missing/null leaves, malformed/unsupported/unsafe values, fractional cents, hypothetical changes and valid positive/negative/zero amounts. Container counters separately describe SQL-null, JSON-null, empty, missing and unsupported parents. Leaf counts are not row counts. Fixed-dollar and percentage-mode values are analyzed separately, with differences in dollars or percentage points. Legacy/ambiguous flags retain findings but are not admitted as conversion candidates or silently treated as fixed. Established Loan-linked/allocation exclusions apply without querying Loan/deprecated tables; no Plaid logs are queried.

The approved policy for all three paths and both rule modes is `Math.round(value * 100)`, followed by `(scaled / 100).toFixed(2)`. Audit proposals are hypothetical only: no storage writes occur. Numeric amounts and percentages are rounded individually; existing canonical strings remain unchanged. Noncanonical strings are unsupported rather than coerced.

### Supported comparison and limits

The audit transpiles/hashes the **actual current** `calculateFunding.ts`, observes its residual branch without changing formulas, and loads/hashes the existing posting validator. No replacement allocation or conservation algorithm is implemented.

- Category rule sensitivity uses actual `computeSpread` at nominal bases `0`, `0.01`, `-0.01`, `1`, `100`, preserving the actual comparator and duplicates. These bounded cases are not a replay of historical/future goal proposals.
- Complete type-2 snapshots with unique destinations, explicit usable base/rule arrays and a unique observed Budget Funding Pool use actual `calculateFunding`. Evidence includes raw rows, posted cent allocations, net preview effects, residual observations, total cents and existing posting-validator acceptance/rejection. Raw floating changes are distinguished from changed cent allocations.
- Incomplete/duplicate snapshots, unsupported shapes/values/modes, non-type-2 lifecycles and missing/ambiguous Pool context are explicitly `not_compared`. Deleted records are labeled sensitivity evidence, not current balance effects.

**Not compared:** full FundingDialog tree fallbacks/extra zero rows, Budget goal/recurrence proposals, historical applied balances and live prior-month SQL sums. These require separately authorized existing application/SQL context. Per-leaf base differences reveal possible SQL-sum changes but do not prove totals unchanged. No full report/balance equivalence is claimed; do not fill these gaps with a new reconstruction framework.

```bash
# Offline only; no connection.
node scripts/auditFundingPrecision.mjs --print-sql

# Future read-only execution requires separate authorization.
node scripts/auditFundingPrecision.mjs \
  --env /path/to/approved-env --database EXPLICIT_DATABASE \
  --output-parent "$PWD/script-output"
```

## Approved precision and remaining review

Two-decimal string storage and JavaScript Math.round handling of excess precision are approved for both fixed-rule paths, requested bases and percentage-mode rules. Percentage points retain their own units. Runtime/API values remain numeric and intermediate calculation precision remains unchanged.

Historical execution remains separately authorized. Review changed values, unsupported strings, legacy mode flags and unavailable reconstruction context before conversion. Do not invent zeros, repair configurations or change priority/cycle policy implicitly.

## Minimum future compatibility boundary

Future implementation only: encode supplied dirty fixed/percentage rules at the Category boundary and supplied base/fixed/percentage snapshot leaves at the Transaction metadata boundary; decode historical numeric/string/mixed storage to numeric runtime/API values. Preserve rate-versus-currency meaning, duplicates, order, metadata and null/missing semantics. Reads and unrelated saves must not normalize history. Existing outer allocation binding/conservation remains unchanged.

Verify proposed-funding responses, client state, saved-input edits and SQL decimal extraction with mixed storage without changing formulas. Historical conversion remains a separate atomic Budget-serialized operation with explicit target/identity/stopped-writer safeguards, raw JSON/SHA-256 snapshots, ownership/version/hash pins, idempotency and edited-row recovery refusal. No conversion/recovery is implemented here.

Extend the existing compiled-release capability checks for these Category and Transaction metadata boundaries. Reject unknown/incompatible rollback before database/process/directory effects. Preserve nonfatal rollback-unavailable plan generation, no executable incompatible plan, existing guards and one-way rollback.

## Verification

Focused [`auditFundingPrecision.test.mjs`](../scripts/auditFundingPrecision.test.mjs) covers classifications, signed/half-tie/artifact hypotheses, separate fixed/percentage coverage and rounding effects, mixed/missing/null storage, raw-token precision loss, actual funding/residual/invariant comparisons, unsupported contexts, read-only paging/identity and rejected conversion flags. **26 tests passed, zero failures/skips.** Changed-file ESLint, both syntax checks, offline `--print-sql`, 67 local documentation links/anchors, count reconciliation and both Git diff checks passed. No database connection, PostgreSQL test, application build or full suite ran. No application behavior, database records or deployed environment was modified.
