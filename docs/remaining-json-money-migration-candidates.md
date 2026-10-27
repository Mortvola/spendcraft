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
| `categories.funding_categories[].amount`, fixed mode | Mutable fixed-dollar funding cap/configuration; not a balance | JSONB NOT NULL DEFAULT `[]`; entries `{categoryId, amount, percentage}`. Category CREATE/PATCH validates numbers and same-Budget references; Category model JSON.stringify, with scoped two-decimal preparation in the new implementation |
| `transactions.categories[].baseAmount` | Requested pre-transfer base snapshot, distinct from final allocation and net Category effect; not reversal authority | Optional JSONB numeric metadata, chiefly type 2; transfer DTO also permits it on type 3. FundingDialog/calculator and transfer CREATE/replacement now encode the approved funding leaves at persistence, while keeping calculations numeric |
| `transactions.categories[].fundingCategories[].amount`, fixed mode | Historical fixed-rule snapshot reused by funding edits rather than current Category configuration | Optional nested JSONB rule array; required numeric amount within supplied entries, copied by transfer CREATE/replacement |

All three retain numeric runtime/API contracts; the prepared scoped implementation now decodes historical numeric/string/mixed storage. The saved allocation shape is `{categoryId, amount, comment?, funder?, baseAmount?, fundingCategories?: [{categoryId, amount, percentage}], includeFundingTransfers?}`. The outer `amount` codec remains unchanged; the scoped allocation binding applies the separate funding metadata codec. Preserve order, duplicates, unknown metadata and missing/null semantics.

### Readers, writers and validation

- [Category](../app/Models/Category.ts), [CategoriesController CREATE/PATCH](../app/Controllers/Http/CategoriesController.ts) and [category validators](../app/validation/Validators/category.ts) own live rule writes. Existing Budget transactions/ownership checks remain mandatory. PATCH omission leaves the configuration unchanged. [Category state](../client-src/State/Category.ts), [Group state](../client-src/State/Group.ts) and [CategoryDialog](../client-src/Categories/CategoryView/CategoryDialog.tsx) feed the editor; client saves rules for Bill mode and supplies `[]` for other types.
- [Budget.getProposedFunding](../app/Models/Budget.ts) returns those rules alongside a base derived from exact planned money or goal/recurrence calculations. Monthly goal proposals already round to cents. Reproducing proposals requires dates, balances, goals/recurrence and future-transaction context, outside these three leaves.
- [FundingDialog](../client-src/Funding/FundingDialog.tsx) submits [calculateFunding](../client-src/Funding/calculateFunding.ts) output. [Transfer validation](../app/validation/Validators/categoryTransfer.ts) accepts optional numeric base and optional numeric rule snapshots with scoped persistence-time funding checks for finite/safe cent values and approved rounding. The transfer controller posts/reverses outer allocation deltas under Budget serialization and existing conservation checks; metadata is not reversal authority.
- [Transaction state](../client-src/State/Transaction.ts), [shared DTOs](../common/ResponseTypes.ts) and [FundingItem](../client-src/Funding/FundingItem.tsx) read requested bases/rules and calculate numeric previews. `CategoriesController.get` uses `jsonb_to_recordset(... "baseAmount" decimal)` and `sum(coalesce(baseAmount,0))` for prior-month, active type-2 funding scoped to Budget. No SQL reader of the two nested rule amounts was found in the directly relevant paths.
- [AmountInput](../client-src/AmountInput.tsx) displays two decimals and rounds on blur with Math.round. That does not guarantee all form/API inputs are cent-quantized. No intentional subcent requirement for fixed-dollar caps was found.

`percentage:true` means percentage points, not currency. [Existing funding-percentage validation](../common/fundingPercentages.ts) requires finite, nonnegative percentages and exactly 100% after approved individual two-decimal rounding when any percentage rules exist. Fixed-only arrays have no percentage-total requirement; fixed money is not made nonnegative by this validator. Percentage points remain distinct from dollars; the approved future representation is canonical two-decimal strings for both modes, with numeric runtime/API values. Historical missing/null flags take the calculator's falsey fixed branch but require explicit eligibility review; other flag shapes are unsupported.

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

## Implemented compatibility boundary — PostgreSQL acceptance pending

The prepared implementation encodes supplied dirty fixed/percentage rules at the Category boundary and supplied base/fixed/percentage snapshot leaves at the Transaction metadata boundary; decodes historical numeric/string/mixed storage to numeric runtime/API values. Preserve rate-versus-currency meaning, duplicates, order, metadata and null/missing semantics. Reads and unrelated saves must not normalize history. Existing outer allocation binding/conservation remains unchanged.

Verify proposed-funding responses, client state, saved-input edits and SQL decimal extraction with mixed storage without changing formulas. Historical conversion remains a separate atomic Budget-serialized operation with explicit target/identity/stopped-writer safeguards, raw JSON/SHA-256 snapshots, ownership/version/hash pins, idempotency and edited-row recovery refusal. No conversion/recovery is implemented here.

The implementation extends the existing compiled-release capability checks for these Category and Transaction metadata boundaries. Reject unknown/incompatible rollback before database/process/directory effects. Preserve nonfatal rollback-unavailable plan generation, no executable incompatible plan, existing guards and one-way rollback.

## Verification

Focused [`auditFundingPrecision.test.mjs`](../scripts/auditFundingPrecision.test.mjs) covers classifications, signed/half-tie/artifact hypotheses, separate fixed/percentage coverage and rounding effects, mixed/missing/null storage, raw-token precision loss, actual funding/residual/invariant comparisons, unsupported contexts, read-only paging/identity and rejected conversion flags. **26 tests passed, zero failures/skips.** Changed-file ESLint, both syntax checks, offline `--print-sql`, 67 local documentation links/anchors, count reconciliation and both Git diff checks passed. No database connection, PostgreSQL test, application build or full suite ran. No application behavior, database records or deployed environment was modified.

## Implementation acceptance and remaining historical work

The scoped implementation is [fundingAmountCodec](../app/services/fundingAmountCodec.ts) plus [fundingStorage](../app/services/fundingStorage.ts), Category hooks and the existing Transaction Category binding. Explicit submitted arrays/replacements encode even equal-valued legacy leaves; metadata-only saves retain raw representations. Both dollar and percentage leaves are numbers after hydration and successful saves. Existing outer allocation encoding, financial deltas and conservation formulas remain unchanged.

Rollback uses the existing SHA-256 profile of actual TypeScript-emitted release files, including funding readers and writers. Unknown or incompatible releases receive `funding_storage_compatibility_unknown`; actual rollback fails closed before destructive operations. Rollback-plan generation records unavailable nonfatally and publishes no executable plan. Existing Tax, Log, Statement income, Category and auto-assignment checks and one-way behavior remain active.

The [offline storage tests](../tests/unit/fundingAmountStorage.spec.js) cover encoding, signed ties/artifacts, invalid/unsafe values, null/missing/unrelated JSON, real Lucid numeric APIs/dirty tracking, explicit replacement, partial metadata edits, deleted reads and actual funding calculations. Compiled-fixture rollback tests cover admission and nonfatal plan generation. The [10 prepared PostgreSQL cases](../tests/functional/funding/decimalStorage.spec.ts) cover real JSON persistence, both modes, API numbers, historical mixed/deleted reads, reconstruction, prior-month SQL decimal extraction, Budget isolation and late failure rollback. Run them later with existing configured/live/execution database safeguards against `localhost:5432/spendcraft_test` only. Existing funding configuration and preview/submission suites supply expanded ordering, residual, Budget-waiter and financial regression coverage. No PostgreSQL tests are executed during implementation.

Accepted production evidence: `script-output/funding-production-audit-Z4YrCp/`. Representation candidates were 6,682 numeric leaves across 61 Categories and 32 Transactions in Budgets 3 and 5. Of these, 6,656 required representation changes only; 26 rounded bases were confined to deleted Transactions 4596/4597. Supported comparisons preserved posted cents, residuals and conservation. Nine snapshots lacked full context; three other snapshots failed the same existing Pool check on both sides, with no conversion candidates among those 12 records. No full historical balance equivalence is claimed.

Historical conversion tooling is prepared as described below; execution and recovery remain separately authorized. Reaudit candidates before execution, including deleted history. No historical normalization, schema change or financial repair is part of ordinary application operations.

## Local PostgreSQL acceptance result — blocked pending application correction

Tested at HEAD `592288550a9ca1b4ecdba2cab7cc3129d46393c8`, branch `dollar-to-cents-2`, using only `localhost:5432/spendcraft_test`, authenticated user `spendcraft_test`. The existing safety hook independently verified configured/live `pg` and `pgLog` identities plus the exact execution connection before destructive SQL, including setup and cleanup.

- Original prepared cases: **10 passed, 0 failed, 0 skipped**. The SQL case was then strengthened, without changing application SQL, to exercise the actual prior-month Categories endpoint across numeric/string/mixed storage, missing/null leaves, grouping, date/type/deleted selection and Budget filtering; all 10 passed again.
- Expanded PostgreSQL regressions: **242 passed, 5 failed, 0 skipped (247 total)**. Two assertions still expect the obsolete numeric `baseAmount` representation; one funding-preview scenario timed out. Two Loan-Category exclusion regressions exposed an application ordering defect and both failed again in isolation.
- Offline funding/monetary/compiled-release rollback selection: **376 passed, 0 failed, 0 skipped**. Both TypeScript projects and changed-file ESLint passed.

**Application blocker:** `Transaction.encodeActiveCategories` calls `stageFundingStorage` before `prepareNewCategoryStorage` resolves the existing Loan exclusion. Explicit replacement can therefore encode funding metadata on an excluded path; its subsequent read bypasses the scoped decoder and exposes strings (`"3.00"`, `"100.00"`). This violates exclusion/numeric-runtime preservation. Application code was not corrected during acceptance: separate authorization/review is required before implementation and renewed regression verification. Do not weaken the failing assertions or treat this run as commit acceptance.

Supported active-path cases passed raw JSON string persistence, numeric APIs, historical/deleted reads, metadata-only preservation, reconstruction, prior-month SQL, isolation and injected-failure rollback. Full acceptance remained blocked at that run; no claim is made that all regression requirements passed in that run. No historical conversion or deployment occurred during it. Evidence: `script-output/funding-postgresql-DxEcK5/`.

## Historical funding conversion and recovery prepared

The corrected application release `df9a9faa07bfef986a39d77311c17115b15381cf` is deployed and accepted in staging and production. Historical funding conversion has **not** been executed. The earlier blocked acceptance results above are retained as historical evidence.

[`convertHistoricalFunding.mjs`](../scripts/convertHistoricalFunding.mjs) adapts the established Tax converter's transaction/snapshot/recovery pattern for both JSONB boundaries in one transaction. Only numeric leaves in the three approved paths are patched with PostgreSQL `jsonb_set(..., false)`; unrelated JSON is never serialized back through JavaScript. Canonical strings, missing/null values, mode flags, array order, outer allocation amounts, balances and deleted status remain untouched. Dollars and percentage points use approved `Math.round(value * 100)` / `(cents / 100).toFixed(2)` and are reported separately. No calculation, balance reconstruction or SQL aggregation is performed by the converter.

Every run requires `--database`, reads PG connection settings from `--env`, prints a unique private `script-output/funding-conversion-*` directory before database work, and defaults to repeatable-read READ ONLY. `records.jsonl` reports every scanned ID, Budget, raw JSON, exclusion, indexed proposed leaf, exact original token, unit and rounding difference. `preflight.json` reconciles row/leaf counts. Malformed/noncanonical/unsafe values, source-to-Number precision loss, ambiguous/legacy modes on non-null leaves, unsupported shapes and uncertain candidate ownership block the whole execution. Missing/null leaves remain untouched. More than 1,000 proposed patches in one record requires review rather than an oversized update.

Loan Categories and Transactions linked to Loan Accounts or Loan Categories are explicitly reported as excluded before inspecting their payloads. Type-1 shared/deprecated Transaction storage is excluded. Other Transaction candidates must match the existing application's supported lifecycle: type 2/3 without AccountTransaction links, or type 0/4/5 with exactly one same-Budget non-Loan Account link. Unknown types block. Candidate Category/Transaction ownership and all referenced Categories/rules must resolve to the same Budget. These checks are repeated in UPDATE/recovery predicates; excluded or unresolved ownership never becomes eligible through conversion.

Execution requires `--execute --release /absolute/current/compiled/release`. The existing funding compatibility recognizer checks all 11 pinned compiled reader/writer files, including the corrected ownership helper, before connection and at every mutation guard. Commit labels do not establish compatibility. Existing configured/live/execution database checks and stopped-writer PM2 guards are reused. Use the established maintenance procedure to suppress scheduled restarts and stop writers; the converter only observes PM2 and never changes process state or scans `/proc`. Ordered Budget locks, schema admission (JSONB, ordinary tables, no unsupported RLS/rules/user triggers), row hashes and `xmin` pins protect the atomic transaction. Any blocker or late failure rolls back both tables; an uncertain COMMIT requires outcome review before retry.

Future staging commands, **only after separate authorization**, are:

```bash
# Read-only conversion plan; never use --execute for an audit-only authorization.
node scripts/convertHistoricalFunding.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --dry-run

# After backup, stopped/schedule-fenced writers, final audit and candidate approval.
node scripts/convertHistoricalFunding.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --release /spendcraft_staging/server/spendcraft --execute

# Separate recovery authorization required; omit --execute for read-only recovery preflight.
node scripts/convertHistoricalFunding.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --release /spendcraft_staging/server/spendcraft --recover \
  --snapshot /absolute/original-run/snapshot.json --snapshot-sha256 SHA256 --execute
```

Before the first UPDATE, execution fsyncs `original-funding.jsonl` (raw original/converted JSONB text, source/ID/Budget/type/deleted context, whole-row and metadata hashes, original `xmin`, exact patches), plus `snapshot.json` and its directory. The printed SHA-256 pins the manifest; the manifest pins the data file and database identity. Preserve the original run and checksum through idempotency checks; subsequent runs create new output directories. Recovery restores the original PostgreSQL JSONB text, verifies original whole-row hashes and refuses changed ownership, hashes or conversion `xmin`, including equal-value later saves. Recovery is atomic across both tables, preserves subsequent legitimate edits and never invokes backup restoration or application rollback.

Staging rehearsal must use explicitly owned synthetic fixtures covering numeric/string/mixed rules, both modes, signed fractional ties, missing/nulls, deleted Transactions, Loan/deprecated exclusions and unrelated large JSON numbers. Reconcile every dry-run candidate to approved fixtures before execution. Verify raw persistence, numeric APIs, actual supported funding/reconstruction/conservation/residual comparisons and the existing mixed-storage prior-month SQL. Capture financial counts/hashes and schema before/after. Run a second conversion with zero candidates/updates; pin and recover the first synthetic snapshot exactly; separately edit a converted row and prove atomic recovery refusal. Verify safe dependency-ordered fixture cleanup and unchanged preexisting baselines before restoring service. Do not infer full historical balance equivalence from metadata or approximate unavailable reconstruction context. Production audit, maintenance/backup, exact candidate approval, conversion execution and any recovery each remain separately authorized.

Focused offline checks are in [`convertHistoricalFunding.test.mjs`](../scripts/convertHistoricalFunding.test.mjs): **56 passed, 0 failed, 0 skipped**. Changed-file ESLint, both script syntax checks and both Git diff checks passed. Tests use injected clients, not PostgreSQL. Real database persistence, schema admission and reporting must still be verified during the authorized staging rehearsal.
