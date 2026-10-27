# Remaining monetary migration candidates

Reconciled against HEAD `744419e1d41edf5fb9c0736e57fbd8e928521eef`, branch `dollar-to-cents-2`, after all five operator-accepted production migration groups. This is candidate selection, not implementation or database execution approval. The [storage inventory](remaining-monetary-storage-inventory.md) records exact paths and source boundaries; [scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md) remain authoritative.

## Completed migrations

**COMPLETED — DECIMAL-STRING STORAGE:** Transaction Category allocations (1 path), Transaction Tax attribution (1), Statement income attribution (4), Tax forecast inputs (13) and TransactionLog old/new movement amounts (2): **21 paths total**. Exact paths are in the [completed table](remaining-monetary-storage-inventory.md#completed-migrations-21-paths). All are deployed and historically converted in production with accepted idempotency, financial noninterference and numeric runtime/API compatibility. Preserve numeric/string/mixed compatibility readers and rollback safeguards.

The latest production conversion changed 13 Tax leaves and 92 Log leaves with zero monetary differences. Final Worksheet verification matched all 23 lines and complete result data after correcting the operator command's VM-prototype comparison. This is prior accepted evidence, not a request to repeat conversion, recovery, deployment or audits. Tax formulas/intermediate precision and TransactionLog PostgreSQL `json` semantics remain unchanged. Keep pinned original recovery evidence and backups.

## Remaining candidate set and counts

| Remaining location | Role / current storage | Assessment |
| --- | --- | --- |
| `auto_assignment_categories.amount` in fixed mode | Fixed-dollar allocation configuration in deployed PostgreSQL `real`; numeric model/API | **`numeric(12,2)` implementation prepared with percentage mode; PostgreSQL acceptance required** |
| `categories.funding_categories[].amount` when `percentage=false` | Mutable fixed funding rule in JSONB numeric storage | Defer with funding precision/reconstruction |
| `transactions.categories[].baseAmount` | Requested pre-transfer funding base snapshot in JSONB numeric storage | Defer: subcents/artifacts may affect edit reconstruction and prior-month sums |
| `transactions.categories[].fundingCategories[].amount` when `percentage=false` | Historical fixed-rule snapshot in JSONB numeric storage | Defer with live funding rules; edits reuse the saved snapshot |

These are **4 representation candidates**, not 11 migrations. The remaining in-scope inventory is **11 = 7 already-exact relational decimal columns + 1 floating relational column + 3 application JSON paths + 0 confirmed diagnostic JSON-number paths**. No integer minor-unit storage column was found. Number hydration alone does not make the seven exact `numeric(12,2)` columns migration targets.

The old 32-location count included 13 now-completed Tax JSON paths, 2 now-completed Log paths and 6 permanently excluded Plaid paths. Removing completed paths gives 17 descriptive locations; excluding the six Plaid examples gives 11 in scope. The descriptive total stays **38 = 21 completed + 11 remaining in scope + 6 excluded**. Open diagnostic containers are not additional confirmed leaf counts. Loans, deprecated `transaction_categories`, BalanceHistory and Plaid logs remain excluded.

## Selected project: auto-assignment amount precision

**Implemented and accepted on local PostgreSQL; deployment remains separate:** change `auto_assignment_categories.amount` from `real` to **`numeric(12,2)`**, retaining its name and NOT NULL constraint. Percentages 10, 10.5 and 10.25 mean 10%, 10.5% and 10.25%. Both modes accept excess precision and round using `Math.round(value * 100) / 100`. The nullable percentage flag/default and fixed-mode false/null interpretation remain unchanged. Only localhost:5432/spendcraft_test has been migrated during acceptance; staging and production remain untouched.

### Why next

This is the only remaining relational floating money location, with a bounded dependency set: one model, two mutation routes and one allocation consumer. It stores entered configuration rather than a funding reconstruction snapshot or intermediate. It can be migrated independently of the three funding JSON paths without reopening completed boundaries. It affects Category allocations/balances when applied, so historical proposals and their precision consequences still need approval.

### Current reader/writer boundaries

- Migration `1718921355278_auto_assignment_categories.ts` declares NOT NULL `float('amount')` (PostgreSQL `real`) and nullable percentage DEFAULT false. This is single-precision binary storage, not exact decimal storage.
- [AutoAssignmentsController.post/patch](../app/Controllers/Http/AutoAssignmentsController.ts) remains unchanged and retains owning Budget transactions/locks. [Vine validation](../app/validation/Validators/autoAssignment.ts) adds scoped finite/range/safe-cent checks. The [rounding helper](../app/services/autoAssignmentAmount.ts) is used by model dirty-amount normalization and decimal-text preparation before persistence.
- [AutoAssignmentCategory](../app/Models/AutoAssignmentCategory.ts) consumes with parseFloat; controller responses and [client state](../client-src/State/AutoAssignment.ts) expect numbers. Later storage design must preserve numeric APIs and historical reads without write-on-read normalization.
- [Account.autoAssign](../app/Models/Account.ts) applies fixed rules before percentages. Fixed values become cents through `Math.round(cat.amount * 100)`; percentages use the remaining base, and the final allocation absorbs residual cents. It writes completed allocation strings and updates Category balances. Selection, ordering, residual recipient, percentage arithmetic and financial boundaries must remain unchanged.

The active application reader set is AutoAssignmentsController.get/preloaded categories, its CREATE/PATCH responses, Account.autoAssign, AutoAssignment/AutoAssignmentCategory relationships, and client AutoAssignments/AutoAssignment state plus the edit dialog. DELETE removes the rule graph; no separate amount-writing service/importer was found. CREATE/PATCH authorizes Category ownership and uses the existing Budget transaction. PATCH can change amount and flag together; the UI flag toggle reinterprets the same amount without a unit conversion. Amount is NOT NULL and API input is required, so null amounts are invalid, not zero. Null flags are a different, currently permitted schema state.

The [dialog](../client-src/AutoAssignment/AutoAssignmentDialog.tsx) uses [CategorySpread](../client-src/CategorySpread/CategorySpread.tsx) and [AmountInput](../client-src/AmountInput.tsx) for both modes. It already formats with toFixed(2), parses numbers and rounds on blur with Math.round. No integer-percentage restriction or client change is needed. The flag toggle reinterprets the amount without unit conversion. CREATE/PATCH now share scoped finite/range validation; existing numeric-string input handling is retained. Negative percentages, values above 100 and non-100 totals remain permitted within the column range; no new conservation rule is approved.

### Approved rounding policy

The target range is **−9,999,999,999.99 through +9,999,999,999.99**, for either unit. Require finite input and validate the chosen representation/range before persistence; NaN/Infinity are not legitimate configuration. Schema scale alone does not choose application ingress policy.

[PostgreSQL numeric](https://www.postgresql.org/docs/current/datatype-numeric.html) rounds ties away from zero, whereas JavaScript Math.round rounds half ties toward positive infinity. Thus −0.125 projects to −0.13 under numeric rounding versus −0.12 under the JavaScript hypothesis. Binary artifacts can also distinguish policies for apparent positive ties (e.g. JavaScript 1.005). A real-to-numeric cast can lose prior floating precision independently of cent rounding. The audit asks PostgreSQL for the actual `amount::numeric(12,2)` projection rather than assuming it equals rounded display text or rounding an expanded binary value. It separately preserves all representations.

**Approved:** accept excess precision, then use JavaScript Math.round before persistence for both units. Require finite numeric values within ±9,999,999,999.99 and safe rounded integer cents within ±999,999,999,999. Normalize negative zero to zero. Retain Vine's existing numeric input handling; do not introduce sign, 0–100 or percentage-total restrictions. The existing AmountInput already supports fractional percentages; no client changes are required.

No rounding decision remains. The accepted production audit found 31 percentage rules, all amount 100, with no quantization/cast disagreement or allocation changes. Those are historical observations, not a migration allowlist or fixed future expectation. The audit's PostgreSQL projection remains diagnostic; it does not establish migration values. Preserve fresh audit/backup evidence before separately authorized execution.

### Historical audit and allocation-impact readiness

[`auditAutoAssignmentPrecision.mjs`](../scripts/auditAutoAssignmentPrecision.mjs) is a read-only audit following existing configuration/identity/private-output conventions. Existing JSON audits cannot safely cover this relational cast and allocation method without a separate small adapter. It has no execute/recovery mode; imports do not connect. It requires explicit database selection, reads PG settings from the selected environment file, verifies configured/live/actual connection identity through existing helpers, requires the expected `real` NOT NULL column, uses a repeatable-read read-only transaction, reverifies identity and ends in ROLLBACK. Unique private output is printed before configuration/database work. Statement/lock/idle/run timeouts apply; no server-identity checks or Plaid/Loan-table queries are introduced.

Rule evidence contains ID, auto-assignment/Budget/Category ownership, row version/hash, mode flag, raw `amount::text`, exact network-order `float4send` hex, expanded double-precision display, PostgreSQL rounded/cast value/difference, and separate JavaScript proposal. Numeric/null, negative/zero, unsafe/out-of-range, more-than-two-decimal, cast-change and policy-disagreement counts are separated into fixed, percentage and null-flag/fixed groups. Decimal-place/change classification refers to original display text; preserved binary bits expose the underlying approximation without falsely treating every binary expansion as an intended fractional-cent input. Any malformed/ownership/overflow configuration is reported as not comparable rather than zeroed. The range guard prevents an overflowing cast from aborting the scan. Original user precision already lost in real storage is unrecoverable.

The audit extracts and transpiles the **actual current Account.autoAssign method**, hashes its source, and runs it offline with in-memory relationship/save/log stubs. A trace records the method's own remaining/allocated-cent locals after residual handling; the formulas are not reimplemented. Both PostgreSQL and JavaScript proposals are compared against original hydrated values for each configuration, using the same observed order. Evidence records complete per-rule allocations, fixed/percentage identification, residual cents, total cents, safe-integer/conservation results and simulated eligible Category effects, including duplicates.

**Limits:** configurations are selected explicitly, not via search-string matching; saves are mocked, not PostgreSQL persistence tests. Default hypothetical transaction amounts are 0, ±0.01, ±1, ±100 and 10000; repeat `--amount` to add relevant reviewed values. These are sensitivity scenarios, not reconstruction of actual historical postings or proof over all possible future amounts. Equal-mode SQL order has no tie-breaker; the audit flags that ambiguity and preserves one observed order rather than inventing an order or guaranteeing it survives a table rewrite. No explicit matching/order policy change is authorized. Configurations without any rule rows have no amount to migrate and are not counted.

```bash
# Offline SQL inspection; does not connect.
node scripts/auditAutoAssignmentPrecision.mjs --print-sql

# Future read-only execution requires separate authorization and an explicit target.
node scripts/auditAutoAssignmentPrecision.mjs \
  --env /path/to/approved-env --database EXPLICIT_DATABASE \
  --output-parent "$PWD/script-output" --amount=1000 --amount=-1000
```

The prior production audit passed with 31 percentage rules, all 100, and no rounding disagreements or allocation changes. It did not exercise populated fixed-dollar/null-mode cases. No PostgreSQL connection occurred during implementation. [`auditAutoAssignmentPrecision.test.mjs`](../scripts/auditAutoAssignmentPrecision.test.mjs) covers precision classification, null flags, invalid/range inputs, fractional percentages, signed/duplicate allocations, residuals, ordering limits and read-only guards. Actual DDL still requires separately authorized PostgreSQL acceptance; offline fixtures do not certify PostgreSQL behavior.

Preparation verification: **25 focused non-database cases passed, zero failures/skips**. Changed-file ESLint, both script syntax checks and offline `--print-sql` passed. Documentation/count/link consistency and both Git diff checks are included; no PostgreSQL test, application suite, build or TypeScript check is required for these operator-only JavaScript changes. No migration file was created.

### Implemented migration and deployment requirements

The [Adonis migration](../database/migrations/1792100000000_auto_assignment_amount_numeric.ts) requires its deferred callback to run in a transaction, locks owning Budgets in ascending order, validates the existing real/NOT NULL schema, and computes approved rounded values in JavaScript. Its explicit ALTER USING CASE pins each row's ID, parent, Category, mode and original float4 binary value to a canonical decimal literal. Unknown/changed rows yield NULL and fail the preserved NOT NULL constraint atomically. It never pre-rounds back into real or relies on PostgreSQL tie rounding. It rejects invalid, overflowing, duplicate or more than 10,000 rows for review; lock/statement timeouts bound DDL waits. Only amount's type/values change; normal PostgreSQL DDL locking preserves relationships/indexes and unrelated columns. The down migration refuses a lossy cast.

[AutoAssignmentCategory](../app/Models/AutoAssignmentCategory.ts) rounds dirty amounts before save and prepares exact two-decimal text; existing parseFloat consumption preserves numeric runtime/API values on both schemas. Metadata-only saves do not quantize a clean historical amount. Account.autoAssign, controllers, allocation ordering and residual formulas are unchanged. Numeric driver strings must not reach allocation arithmetic.

Keep writers stopped across installation and migration, with a fresh verified backup and repeated audit gate. New code can hydrate existing real values, but real storage still loses precision; do not enable normal writes before numeric migration. Prior code hydrates numeric correctly but lacks approved ingress rounding, so it is not a safe unrestricted writer after migration. The existing compiled-release profile now verifies the model, helper, controller and both validator files. Missing/unknown capability fails admission with `auto_assignment_precision_compatibility_unknown` before database access, PM2 shutdown or directory changes. Plan generation treats this as nonfatal rollback unavailable and publishes no executable plan; compatible reviewed code remains eligible. Existing JSON guards and one-way rollback remain intact. No new recovery mechanism is introduced.

After commit, migration reversal or restoration requires separate review/authorization; no automatic database restore or application rollback is safe. Preserve original real bits and backup evidence. A type downcast cannot recover lost precision or protect subsequent edits. Staging rehearsal, then production backup/audit/deployment require separate authorization.

### Verification and prepared PostgreSQL acceptance

Offline verification passed 29 implementation cases, 25 existing audit cases and 60 rollback/plan cases. Source-only server TypeScript passed; changed-file lint, script syntax and both diff checks are required. No full suite or build is needed for this task.

The [original 11 PostgreSQL cases](../tests/functional/autoAssignments/precision.spec.ts) passed with zero failures or skips. Nine supplemental cases also passed: new/stale/ownership-changed proposals reject with SQLSTATE 23502 and fully roll back; fractional/signed allocations preserve residuals; CREATE/PATCH actually wait on the Budget lock through owner commit/rollback. Historical fixtures cover positive/negative half ties, binary artifacts and PostgreSQL-versus-JavaScript differences; indexes, relationships and unrelated row fields remain intact. Amount is numeric(12,2) NOT NULL, mode remains nullable/default false, APIs remain numeric, and full financial-row comparisons show noninterference.

Expanded verification passed 182 existing PostgreSQL regressions, 60 rollback/plan cases, 54 offline precision/audit cases and 28 database-safeguard cases. One obsolete Statement characterization assertion was corrected to require its already-approved exact canonical string; no production code changed. Both TypeScript projects, changed-file lint/syntax and both Git diff checks passed. No full build or full suite ran.

Evidence: `script-output/auto-assignment-postgresql-dRvypE/`. Configured/live/execution identity was localhost:5432/spendcraft_test, authenticated user spendcraft_test. Existing guards independently rechecked setup, every destructive execution connection and cleanup. The normal Adonis migration runner applied/journaled the migration (batch 5); standard `NODE_ENV=test node ace migration:status` confirmed completion. An initial direct setup invocation was corrected on the verified empty test table before the normal runner applied it. Occupied test HTTP port 3337 required a temporary PORT=3347 override; no services/configuration were changed. The existing Vite port-24678 warning did not prevent successful acceptance. Final read-only inspection found all 12 checked fixture tables empty. This task's database authorization expired at completion; future test or deployment operations require fresh authorization.

## Deferred funding group

The three JSON paths above are closely related but are not the next implementation scope. [calculateFunding/computeSpread](../client-src/Funding/calculateFunding.ts), [FundingDialog](../client-src/Funding/FundingDialog.tsx), [CategoriesController](../app/Controllers/Http/CategoriesController.ts), [Budget](../app/Models/Budget.ts) and transaction edit state reuse requested bases and saved rules. BaseAmount is intentionally pre-transfer metadata, not final allocation or reversal authority. Its precision may affect SQL sums, transfer-inclusive calculations and edits. Fixed-rule cent storage, base precision, percentage precision and historical reconstruction need explicit decisions. The completed outer allocation codec intentionally preserves these properties.

## Exclusions and verification

All Plaid log monetary values stay permanently untouched in provider-supplied types. Unknown nested TransactionLog/webhook payloads have no newly confirmed fixed monetary leaves; characterize separately only when evidence establishes a path. Exact decimal columns, completed compatibility readers and existing reporting arithmetic are not migration targets.

Implementation is limited to auto-assignment precision, its migration and the existing rollback profile. Allocation formulas, deferred JSON paths and completed storage boundaries are unchanged. Local acceptance modified only the authorized test database. No staging/production access, deployment, installed-release change, staging of files or commit occurred.
