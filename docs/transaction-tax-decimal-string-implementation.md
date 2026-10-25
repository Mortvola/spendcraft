# Transaction tax attribution decimal-string storage implementation

## Source baseline and approved boundary

Source HEAD: `f92024df6bd6276d400d7552aa8fc95b13d179e1`, branch `dollar-to-cents-2`.
Implementation date: 2026-10-23. This is bounded runtime implementation, not deployment or historical conversion. Existing staged source/documentation and private audit evidence were preserved; no index changes were made.

Only `transactions.taxes[].amount` changes storage representation. The ordered `{ type: string, amount }` array remains intact. Tax identifiers are strings in the actual validator, shared DTO and client contract. There is **no tax conservation rule** and no comparison to AccountTransaction, Category allocations, Statements or movement totals.

Approved new input policy:

```ts
const cents = Math.round(amount * 100)
const storedAmount = (cents / 100).toFixed(2)
```

Fractional-cent numeric inputs are accepted. Positive/negative half ties follow JavaScript toward positive infinity: `0.125 → "0.13"`, `-0.125 → "-0.12"`, `-1.005 → "-1.00"`. Negative zero becomes `"0.00"`. Validate finite numeric inputs, safe integer cents, and encoding/decoding cent round-trip safety before persistence. The shared scalar codec rejects extreme safe-cent values that cannot round-trip through dollar-number formatting. No arbitrary wider monetary range is introduced.

## Central storage boundary

| File | Responsibility |
| --- | --- |
| `app/services/taxAmountCodec.ts` | Pure tax array encoder/decoder and submitted-value validation. Reuses unchanged Category scalar cent conversion/formatting, remapping errors to tax-specific HTTP 422 exceptions. |
| `app/services/taxStorageBinding.ts` | Separate tax-only WeakSet scope and pending-write bookkeeping, Lucid column preparation, clean numeric hydration and numeric post-save state. |
| `app/services/transactionTaxStorage.ts` | Batch active/deprecated scope resolution, early PATCH replacement validation and dirty-only save staging. |
| `app/Models/Transaction.ts` | Existing find/fetch/save hooks invoke the separate boundary; tax column preparation persists strings for scoped writes. Model runtime type stays numeric. |
| `app/Controllers/Http/TransactionsController.ts` | Validates the submitted replacement after fresh authorization and before financial mutation; preserves the old empty-type filtering and `{ type, amount }` replacement contract. |

The scalar Category codec, Category hooks, API DTOs, client runtime, tax report SQL and validators are unchanged. No global JSON consume hook was added. New unscoped/deprecated model constructors retain previous serialization; the only active nonempty tax writer is authorized Transaction PATCH. New active Category-scoped lifecycle saves can encode tax arrays without erasing dirty replacements. An additional future nonempty tax writer must join this boundary explicitly.

### Mixed storage and read behavior

- Numeric legacy values validate as finite/safe but retain their original JavaScript dollar value on read, including fractional cents. Reading is not quantization.
- Canonical two-decimal strings parse with exact integer-cent syntax/range checks before producing numeric runtime values. No arbitrary `parseFloat` coercion.
- Mixed arrays decode entry by entry. Entry order, duplicate types and optional stored metadata are preserved. Only amount leaves are encoded on an explicit replacement.
- Null/undefined arrays remain null/undefined; empty arrays stay empty. Missing/invalid entry amounts are rejected rather than treated as zero.
- Original model values are aligned with decoded attributes so reads do not dirty taxes. Only a dirty tax array is staged or included in SQL UPDATE. Metadata/Category/provider/date/deletion saves do not quantize clean historical tax arrays.
- After save, numeric rounded tax values and clean originals are restored for serialization. Failed-save staging is cleared before a later metadata-only retry.

No sum or safe-total check is applied: independent attribution entries have no aggregate conservation authority. Every individual amount is checked.

### Request compatibility

The existing Vine number validator already accepts numeric strings. Retain supported decimal/exponent request syntax, including fractional cents, while rejecting boolean, blank, hexadecimal, malformed, missing and nonfinite values before financial mutation. Public DTOs remain numbers; string request syntax is compatibility with the existing validator, not a new string API. `taxCategories: []` explicitly clears attribution. Omitted taxes leave historical storage untouched. The existing optional array validator treats a null replacement as omitted; null required entry amounts still reject.

Storage may carry optional metadata; the codecs preserve it. PATCH has always validated and rebuilt only `{ type, amount }`, ignoring unrecognized request metadata; this existing replacement contract is unchanged. An unrelated save preserves metadata already present in storage.

## Active writer and reader inventory

| Path/function | Tax behavior and boundary |
| --- | --- |
| `TransactionsController.update` | Sole active nonempty writer. Budget `FOR UPDATE`, fresh owned nondeleted Transaction/version, owned Account, current/submitted Category authorization, tax preparation, then existing mutation/save/log/commit. Explicit tax replacement encodes before persistence and returns rounded numbers. |
| `TransactionsController.get`, `getMultiple`, `search`, account/category transaction registers | Lucid afterFind/afterFetch decodes tax JSON before direct model/DTO serialization. Numeric public responses, no write-on-read. |
| `Transaction` find/fetch/save hooks | Independent tax binding; batch resolution reuses proven active Category scope. Unresolved persisted rows are checked for Loan Account/Category links using the owning transaction. Type 1 transfers and nondeprecated accountless rows can decode, since tax reports historically have no Transaction-type eligibility filter. New unscoped rows are not globally normalized. |
| `AccountsController.addTransaction` | No tax input in CREATE validator; no nonempty tax writer. Existing empty/default tax behavior unchanged. |
| `Account.processOfx`, `addOrUpdateTransaction`; `Institution.syncUpdate` and provider helpers | Create/update financial and Category state, never assign taxes. Existing hydrated tax values remain clean and absent from unrelated SQL updates. |
| Category-transfer funding/rebalance CREATE/replacement | No tax attribution input or assignment. Existing arrays/defaults and any clean tax history remain untouched. |
| `Account.updateStartingBalance`, Account startDate maintenance | No tax attribution mutation. Opening is included in active read/write compatibility; no opening calculations change. |
| `TransactionsController.delete`, `dedup`; Account/Institution cascades | No tax replacement. Soft deletion/metadata preserve tax JSON; hard deletion retains existing whole-record deletion behavior. No historical discrepancies repaired. |
| `TaxesController.getActuals` | Raw SQL expands JSON, groups by month/type, and sums PostgreSQL real values. No JS array arithmetic or storage normalization. |
| `client-src/State/Transaction.ts` constructor/refresh/updateTransaction | Receives numeric DTO values, sends numeric tax edit values, refreshes account/Category/register copies. No client changes required. |
| `TransactionDialog`, `TransactionTaxCategories`, `TransactionTaxCategory` | Existing string tax identifiers and numeric AmountInput/callback behavior remain unchanged. |
| `client-src/State/Taxes/Taxes.ts` and Income | Numeric report values continue through existing arithmetic. |
| Commands/jobs/other reports | No additional active nonempty tax JSON writer or direct tax-array arithmetic reader found. `commands/Taxes.ts` estimates taxes separately; it does not consume Transaction tax attribution. Diagnostic Transaction logs and independent forecasts are outside this slice. |

Loans and every `transaction_categories` dependency remain excluded. Batch checks use actual Loan Account/Category identity, not Transaction type 1. Scope checks are reads, with no new explicit locks. No Loan reader, writer, validator or storage codec is modified.

## Tax PATCH, financial noninterference and serialization

Tax validation occurs inside the existing owning transaction after the Budget gate and fresh authorization, before Account/Category mutations. The controller still uses its existing optimistic-version, structured 422, ownership 404 and rollback behavior. Empty tax type entries are still omitted from replacements; unknown nonempty identifiers are not newly catalog-validated.

Tax-only edits change tax JSON, normal Transaction version/timestamp, and existing audit log behavior. They do not dirty Category allocations or calculate new balances. The completed Category representation, ordering, conservation, AccountTransaction amounts and all balances remain unchanged. Existing metadata-only operations do not validate historical tax sums or repair deleted discrepancies.

The Budget row remains the sole explicit application-level lock. New queries participate in the row's `$trx` when present. No additional row locks, advisory locks or hierarchy are introduced.

## SQL reporting compatibility

No SQL change is necessary: existing `jsonb_to_recordset(transactions.taxes) as transTaxes(type varchar, amount real)` accepts either JSON numbers or canonical numeric strings. Keep existing `sum(COALESCE(transTaxes.amount, 0))`, Budget/date filtering, month/type grouping and numeric response policy. There is no new exact report arithmetic policy. Deleted, pending, pre-start and Transaction-type selection remain exactly as before, including absence of those eligibility filters. PostgreSQL execution, not a source assertion alone, must verify scalar coercion before acceptance.

## Historical baseline and conversion boundary

Accepted production audit: 6,271 Transactions, 21 Transactions/entries containing attribution, all 21 numeric; no strings/mixed/malformed/fractional-cent values, no proposed rounding changes, no deleted tax attribution, and no reporting differences across 21 month/type groups. These are historical observations, not execution assertions. The original audit findings remain intact in the [historical audit](transaction-tax-attribution-historical-audit.md).

Those 21 values were **not converted**. Legacy numeric/string reader compatibility stays until a separately authorized historical conversion is completed and verified. No audit rerun, conversion command or financial repair is part of this implementation.

## Prepared PostgreSQL acceptance

Executable file: `tests/functional/transactions/taxDecimalStringStorage.spec.ts`.
**45 parameter-expanded cases prepared; zero executed.** Use the normal safeguarded application runner after fresh authorization restricted to `localhost:5432/spendcraft_test`; never execute this file with a standalone runner. Existing bootstrap independently checks configured/live pg, pgLog and execution connections before setup and every write/cleanup. No new setup/reset helper or destructive bypass was added.

| Area | Cases | Assertions |
| --- | ---: | --- |
| PATCH rounding/storage/API/financial state | 8 | Raw string leaf and `jsonb_typeof`, exact approved examples, rounded numeric responses, unchanged balances/AccountTransaction/Category JSON. |
| Numeric/string/mixed/empty/null reads | 5 | Direct GET/model serialization, metadata, duplicate entries, whole-state equality proves no normalization. |
| Malformed stored strings | 4 | 422, no state changes; independently guarded malformed-fixture cleanup. |
| Optional metadata model replacement | 1 | Only amount changes; nested metadata stays exact. |
| Provider ordinary/opening tax PATCH | 2 | Types 0/4, raw strings and financial noninterference. |
| Duplicates/no conservation; empty replacement | 2 | Ordered duplicate types, unrelated amounts accepted, explicit clear. |
| Malformed/overflow new input | 7 | 422 and full-state equality. |
| Metadata-only/Category-only PATCH | 2 | Numeric/string legacy taxes/metadata not rewritten. |
| Deleted mismatch metadata | 1 | No historical Category discrepancy validation/repair or tax normalization. |
| Late log failure/retry | 1 | Transaction, storage, version and financial state roll back; retry succeeds. |
| Foreign/missing target | 2 | 404 and no cross-Budget mutation. |
| SQL report coercion/selection/Budget scoping | 3 | Numeric/string/mixed totals, deleted/pending/pre-start inclusion preserved, foreign Budget excluded. |
| Budget commit/rollback waiter | 2 | Deterministic PostgreSQL wait observation, fresh numeric state, appended data not lost. |
| Actual HTTP wait/version ordering | 4 | Metadata-first/tax-first/rollback/stale version, post-lock admission, no stale saves. |
| Different Budget independence | 1 | Other Budget writer succeeds while first Budget held. |

The future focused selection must also run accepted provider reimport, opening/startDate, funding/rebalance, DELETE/cascade, report and client regression suites. Source/non-DB preservation is not a substitute for these database regressions. Stop on focused failures before a full suite; do not weaken financial/security assertions.

## Non-database verification

Results are finalized below after all checks. Tests run through a standalone Japa runner without Adonis bootstrap, database service initialization or PostgreSQL access. Codec and Lucid adapter tests use actual production helpers; controller tests execute the actual extracted PATCH method with inert database collaborators; client tests use the actual State/cache code and production tax codec. PostgreSQL tests above are compiled only.

## Changed-file inventory and remaining risks

Runtime files: `app/Models/Transaction.ts`, `app/Controllers/Http/TransactionsController.ts`, and the three new tax services listed above. Tests: new `tests/unit/transactionTaxStorage.spec.js`, new prepared PostgreSQL file, and one additional test in `tests/unit/client/financialState.spec.js`. Documents: this file and append-only approval notes in the precision review and historical audit.

Outstanding acceptance risk is unexecuted PostgreSQL verification, including actual coercion, hook integration, HTTP behavior, rollback and deterministic contention. Existing `real` reporting remains inexact by design. Current new-array scope must be explicitly extended if another active tax writer is introduced. No unresolved product decision or schema change is required by the bounded implementation.

## Final implementation verification

| Check | Result |
| --- | --- |
| Focused standalone non-DB selection | **285 passed, 0 failed, 0 skipped** |
| Selected suites | Tax storage, existing Category codec/boundary, ordinary eligibility, tax precision audit, actual client financial State/cache |
| Server TypeScript (including prepared PostgreSQL tests) | Passed |
| Client TypeScript | Passed |
| ESLint on every changed production/test file | Passed |
| Repository-wide ESLint | **Failed: 15 pre-existing errors in private audit artifacts**, none in changed implementation/test files |
| Knip | Passed |
| Circular regression | Passed: accepted 11-model/26-edge Lucid component, no new component |
| New/modified JS test syntax | Passed |
| Server production build (including client assets) | Passed |
| Separate client production build | Passed |
| Build warnings | Existing client chunk larger than 500 kB; no new compilation error |
| Working-tree and staged whitespace checks | Passed |
| PostgreSQL acceptance | **45 prepared, 0 executed**, requires separate authorization |

Repository lint errors: six `console`/`process` no-undef errors in `category-conversion-readiness-ajar8i/production-readonly-probe.mjs`, plus nine `URL`/`console` no-undef errors in the prior audit's `tax-historical-audit-ClXXgK/reconcile.mjs`. Neither private artifact was edited, suppressed, moved or committed to obtain passing lint.

Initial and final staged diff SHA-256: `c5a2d859761cd25330c46217862e01acf6b5f0a9c0c77a6e571cd1e974415b5f`. The index is byte-for-byte unchanged. Unrelated staged files, untracked local/private files and earlier unstaged audit documentation remain preserved. Current-task changes are unstaged, including the new services, test files and implementation document; historical audit documentation was already untracked on arrival.

No database connection or database-backed test occurred. No historical tax conversion, staging/production record change, historical repair, unrelated monetary representation change, schema migration, deployment or commit occurred.


## PostgreSQL acceptance verification (2026-10-23)

See [the PostgreSQL verification record](transaction-tax-decimal-string-postgresql-verification.md) for runtime/raw-storage evidence, exact final counts, safeguard evidence and test-only corrections. The original 45 prepared cases passed after correcting a SQL-NULL fixture to JSON null. Expanded focused acceptance passed 1,269 cases, with an additional targeted raw duplicate-Category/order/metadata check passing before full-suite execution.

Verification added authenticated-role checks to the existing centralized database safeguards and tax preservation regressions for providers and other lifecycles. Existing Statement DELETE expectations were aligned with HEAD's automatic AccountTransaction timestamps without loosening any financial-state comparisons. Optional null tax-array behavior was characterized as omission, preserving the existing validator contract. No production correction, historical conversion or schema migration was made.

The initial 7-file staged fingerprint recorded above describes implementation-task completion. During the subsequent verification task, staging changed outside this agent's commands to a 21-file snapshot (`c6198081b1c1370621748c09a85c896fdc9668f85bda76640deeb87bc61dd4fe`). No agent staging/index mutation occurred; the verification record distinguishes that external change rather than claiming the initial index stayed identical.


Final PostgreSQL verification result: **45 original cases passed**, **1,269 expanded focused cases passed**, **one additional raw-Category noninterference case passed**, and **2,807 complete-suite tests passed**; zero failures/skips/pending in final acceptance runs. The final tax file contains 62 cases. Full-suite safeguards recorded 79,662 independent identity checks and 79,659 guarded operations. Both TypeScript checks, changed-file lint, Knip, circular regression, server/client builds and both diff checks passed. Full-repository lint retains 15 errors in the two untouched private audit artifacts; builds retain the existing large-chunk warning.

An unrelated installer unit assertion also required a test-only update for committed environment-specific PLAID_WEBHOOK metadata. No installer/production runtime code changed. Final status is **accepted for deployment preparation**, with historical conversion deferred. The companion verification record contains all initial failures/reproductions, justified test corrections, final status and the externally changed staged-snapshot evidence. No agent staging or commit occurred.

## Historical conversion preparation — October 25, 2026

Source baseline: `4b07bb8c2e1127819cdd2544a2871f5939d33b43`, branch `dollar-to-cents-2`. The operator reports compatible runtime deployment and verification on staging and production. Historical conversion is **prepared only**, not executed. The earlier 21 numeric production entries are historical evidence; current counts require a separately authorized audit.

### Audit and conversion commands

Run on the selected database server from a checkout containing the new operator script and its existing helper dependencies. This preparation does not deploy/package the script into an installed release. Use the actual server `.env` file; all PG settings, including the password, come from that file, never ambient PG variables. Both environments currently use a database called `spendcraft`; `--database` must match the explicitly selected file. There is no default production connection and no EC2/hostname/fingerprint check.

For staging, after separate authorization:

```sh
mkdir -p script-output
node scripts/auditTransactionTaxPrecision.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --output-parent "$PWD/script-output"
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft
```

The existing precision audit reports entry-level numeric/string/malformed/fractional-cent/rounding counts and transaction-level mixed/empty/unsupported counts; it retains raw monetary tokens privately. Its older `roundingPolicyApprovedForTax: false`/characterization wording describes the audit's original policy status, not the subsequent product approval recorded here. No audit or historical result was rewritten. Review unsupported findings rather than assuming they are corrupt: the audit marks type 1 outside its original characterization set, while active tax readers/reporting do not impose that type filter. The converter excludes positively identified deprecated Loan records and validates tax entries independently of Transaction type, deleted state or allocation totals. No legacy relational allocation dependency is used.

The converter's default is a repeatable-read **read-only dry run**. It writes unique private output under `script-output/tax-conversion-*`, prints the absolute directory before database work, and produces `summary.json`, `summary.txt`, `preflight.json`, and `transactions.jsonl`. Counts distinguish Transactions (`transactions`, `candidates`, `mixed`, `empty`, `nullTaxData`, `blockingRecords`, `excludedDeprecated`) from tax entries (`numericAmounts`, `stringAmounts`, `canonicalStrings`, `malformedAmounts`, `roundedAmounts`). Details include original numeric tokens, proposed values and rounding differences in cents. Missing/null tax data and empty arrays are preserved. Any malformed/unsafe active entry or unsupported tax shape blocks the **entire** execution before updates.

Canonical strings are preserved verbatim. Numeric amounts use the existing checked Category conversion helper, sharing the approved `Math.round(amount * 100)`/divide/`toFixed(2)` policy with the production tax codec. No aggregate tax conservation rule is imposed. Only numeric `taxes[index].amount` leaves are patched with SQL `jsonb_set`; types, order, duplicates, optional metadata and other JSON numeric tokens are not reserialized through JavaScript.

Before execution, obtain fresh authorization, a verified database backup and complete writer shutdown/fencing, including scheduled writers. The script never stops processes or disables scheduled restarts. It requires the existing PM2 manifest's processes to remain stopped, verifies the existing daemon without bootstrapping another, and rechecks PM2/database identity before each write and commit. No sandbox/production bypass is provided.

```sh
# Future execution only; all writers must already be fenced/stopped.
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --execute
```

Connection admission checks configuration, database/user, port, PostgreSQL cluster identifier, database OID, live server/peer and actual socket endpoint. A targeted schema check requires ordinary JSONB storage without RLS, rules or user triggers. Execution scans and converts atomically in one repeatable-read transaction with bounded 100-row pages and at most 1,000 entries per tax array. Any unsupported schema requires review, not bypass. No API, reporting arithmetic, balance, Category storage, schema or runtime code changes are involved.

### Recovery and idempotence

Before the first UPDATE, execution durably saves the original PostgreSQL tax JSON text to `original-taxes.jsonl`, plus proposed JSON, original/converted whole-row hashes, non-tax metadata hash and original row version. `snapshot.json` pins the data-file SHA-256, database identity and conversion transaction ID; its SHA-256 is printed and repeated in completion output. Preserve both files together. A filesystem write failure before the first update prevents conversion. An uncertain COMMIT response is reported as uncertain; never infer rollback or automatically retry.

Use the emitted snapshot path/hash, not the examples as literal values:

```sh
# Recovery preflight is read-only unless --execute is supplied.
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --recover --snapshot "$SNAPSHOT_PATH" --snapshot-sha256 "$SNAPSHOT_SHA256"
# After separate authorization and unchanged-row verification, same command plus --execute.
```

Recovery verifies the pinned files and exact database identity, then requires every affected Transaction's complete converted row hash, tax JSON and `xmin` to match. Later edits, including equal-value saves, refuse recovery; nothing is overwritten. A failure rolls back all recovery updates. Successful recovery restores only original tax JSON and verifies all other columns through the whole-row hash. It never restores a database backup or rolls back the application. A second conversion is a no-op; a repeated recovery is deliberately refused once row versions change. Recovering an older snapshot after a later conversion is likewise not automatic.

### Small synthetic staging rehearsal (not executed)

1. Obtain staging execution authorization and independently verify the configured/live database identity. Use a new isolated synthetic Budget and ordinary/manual Transactions created through existing UI/API paths; do not reuse or edit real history. Record fixture IDs and complete raw before-images, including AccountTransaction amounts, Accounts, all Budget Categories/Funding Pool and Transaction fields.
2. Under verified staging-only fixture writes, seed **only those identified synthetic Transactions' tax JSON** with: numeric `12.34`; existing string `"12.34"`; and an ordered mixed array containing duplicate tax types, numeric `12.345`, `-1.005`, `0.125`, `-0.125`, `0.30000000000000004`, `0` and existing `"0.30"`. Include optional nested metadata. Keep valid existing Category allocations and all accounting relationships unchanged. Record original PostgreSQL JSON text after fixture setup. Negative zero normalizes to ordinary zero in PostgreSQL JSONB; exercise signed-zero policy in the pure tests as well.
3. Run the audit and converter dry run. Reconcile raw entry counts and proposed changes with those fixtures. Fence all writers, then execute once. Verify raw JSON string types and expected values (`"12.35"`, `"-1.00"`, `"0.13"`, `"-0.12"`, `"0.30"`, `"0.00"`), unchanged preexisting strings/types/order/duplicates/metadata, and unchanged unrelated Transaction fields and financial snapshots.
4. Execute a second time in a new output directory: require zero candidates/updates. Preserve the **first** snapshot for recovery; the second no-op run does not change row versions. Run recovery dry run and authorized recovery execution from that first snapshot. Verify original raw tax JSON and unrelated fields exactly restored, then check numeric/mixed API reads and existing tax reports. Keep the compatible application release throughout.
5. Optionally edit a synthetic converted row through the API before recovery to prove recovery refusal. This is a separate negative branch: preserve the row and diagnostics on refusal; do not repair or force recovery. Fixture cleanup is a separately reviewed, ID-scoped staging operation, never wildcard deletion.

Remaining gates: fresh read-only historical counts, actual staging conversion/recovery rehearsal, verified backup and shutdown window, delivery of the committed operator files, and separate production execution authorization. No database connection or conversion took place during preparation.

Preparation verification: **235 focused non-database tests passed**, including **41 new tax-conversion cases** plus existing Category conversion/identity, PM2 fencing and tax-audit regressions. Changed-file ESLint, script/test syntax checks and both Git diff checks passed. No application TypeScript or schema files changed; no database-backed tests ran.

### Staging finalization commands (prepared only)

Use a tooling checkout containing the finalized commit, outside the installed application directory. These commands are for later authorization; they were not executed during finalization. Do not assume the newly committed script is already on staging. The converter has **database-wide scope**, not a fixture-ID filter: after a fresh dry run, every nonempty `patches` entry in `transactions.jsonl` must belong to the explicit synthetic fixture ID allowlist before execution. If unrelated historical numeric candidates exist, **stop**; do not convert them under synthetic-only authorization. Recheck with all writers fenced before execution. No production operation is authorized by this plan.

```sh
# On staging, in the reviewed tooling checkout; read-only authorization required.
mkdir -p script-output
node scripts/auditTransactionTaxPrecision.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft \
  --output-parent "$PWD/script-output"
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --dry-run

# After separately approved synthetic setup, candidate-ID review, backup and writer fencing:
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --execute
# FIRST_RUN is the absolute output directory printed by that successful execution.
# Read snapshot path and SHA-256 from its recoveryPoint/completion output.

# Numeric API check, with a token for the synthetic fixture's own Budget:
curl --fail --silent --show-error \
  -H "Authorization: Bearer $STAGING_ACCESS_TOKEN" -H 'Accept: application/json' \
  "https://staging.spendcraft.app/api/v1/transaction/$SYNTHETIC_TRANSACTION_ID"
# Require numeric taxes[].amount values matching the approved rounded values.

# Second execution: require candidates=0 and numericAmounts=0; canonicalStrings unchanged.
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --execute

# Recovery preflight, using the FIRST execution's pinned snapshot:
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --recover \
  --snapshot "$FIRST_RUN/snapshot.json" --snapshot-sha256 "$SNAPSHOT_SHA256"
# Separately authorized recovery; no PM2 restart until recovery verification completes:
node scripts/convertHistoricalTransactionTaxes.mjs \
  --env /spendcraft_staging/server/spendcraft-env --database spendcraft --recover --execute \
  --snapshot "$FIRST_RUN/snapshot.json" --snapshot-sha256 "$SNAPSHOT_SHA256"
```

Successful first execution verifies raw canonical JSON strings, row counts, metadata hashes and every converted whole-row hash before COMMIT. Successful recovery verifies exact original PostgreSQL tax JSON and original whole-row hashes for every restored row before COMMIT. Require `status=complete`, zero exit status and `restored` equal to the first run's `candidates`; audit again to reconcile original numeric/string/mixed counts. Retain the raw snapshots and both completion records. Do not use the second no-op snapshot for recovery. API checks require a separately authorized process-start window; they can be done after recovery or between conversion and recovery provided **no affected Transaction is edited**, then writers must be fenced again.

For the refusal branch, perform a fresh separately approved synthetic conversion, retain its new snapshot/hash, then deliberately edit only a synthetic converted Transaction via the existing UI or tax PATCH API (using its current version). Fence writers again and run the same recovery command **without `--execute`** against that snapshot. Require `changed_row_recovery_refused` and a nonzero exit; do not execute recovery, retry, repair the row or reuse the earlier success-branch snapshot. The non-database regression also covers equal-value saves via a changed PostgreSQL row version. This negative branch follows successful exact recovery so it cannot prevent testing the success branch.
