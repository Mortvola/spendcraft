# Transaction tax decimal-string PostgreSQL verification

Inspection date: 2026-10-23. Source HEAD: `f92024df6bd6276d400d7552aa8fc95b13d179e1`; branch `dollar-to-cents-2`.

This task verifies the bounded working-tree implementation described in [the implementation record](transaction-tax-decimal-string-implementation.md), rather than claiming that HEAD already contains it. No production code was corrected during verification. Historical tax conversion and deployment remain deferred.

## Authorization and database safety

Fresh authorization covered only `localhost:5432/spendcraft_test`, including setup, fixtures and cleanup. No production, staging or sandbox connection was used.

The existing standalone safeguards ran **first: 27 passed, zero failures/skips**. Inspection found that the centralized test guard proved database/network identity but did not positively verify the configured/authenticated role. Test-only infrastructure was strengthened before any database setup:

- Require a nonempty configured user for pg and pgLog.
- Query `current_user` and `session_user` alongside existing database/port/server/peer evidence.
- Require the live authenticated role to equal the configured role on each verification connection; validate the actual execution connection against the configured authorized roles too.
- Retain strict endpoint, loopback/CIDR handling and fail-closed behavior. No bypass was added.
- Add an inert mismatch regression. **28 safeguard cases passed** after this change, before database work.

Every destructive SQL query traversed `tests/helpers/databaseSafety.ts`: independently recheck configured/live pg and pgLog, then query the actual execution connection immediately before executing the statement. Transaction clients inherit the guarded driver prototype. The hook covers ORM writes, raw fixtures, bootstrap/teardown truncation, temporary test constraints/objects and fixture cleanup. Setup verification was not reused as cleanup authorization.

Observed pg and pgLog identity: database `spendcraft_test`, port `5432`, server and peer `::1/128`, configured/current/session user `spendcraft_test`. The exact execution connection was checked separately per guarded operation.

Initial sandboxed execution could not access local sockets. A network-enabled run then found the existing local HTTP test port occupied; no existing process was stopped. Subsequent runs used `PORT=3349`. Vite's pre-existing port 24678 warning is unrelated to PostgreSQL/storage acceptance. Two expanded-selection invocations used incompatible runner filter forms and executed no cases; they are not included in acceptance counts. Their guarded setup/teardown remained restricted to the test database.

## Original 45 prepared cases

Initial result: **44 passed, 1 failed, zero skipped/pending**. The failing fixture attempted SQL NULL in the non-nullable `transactions.taxes` column. Isolated reproduction: **4 passed, 1 failed**. It failed during fixture UPDATE, before production read code.

Test-only correction: use JSON `null`, which preserves the optional JSON value without violating the column constraint. Assert GET/model behavior and raw-state equality. Independently guarded cleanup restores the deliberate sentinel to an empty array so subsequent SQL recordset-report fixtures do not inherit it.

Corrected original selection: **45 passed, zero failed/skipped/pending**. It logged **2,469 independent identity checks / 2,466 guarded SQL operations**, including independent final truncation.

## Raw storage, rounding and numeric compatibility

Real HTTP PATCH, real Lucid save hooks and raw PostgreSQL reads verified:

| Submitted number | Raw amount string | Numeric API amount |
| --- | --- | --- |
| `12.345` | `"12.35"` | `12.35` |
| `-1.005` | `"-1.00"` | `-1` |
| `0.125` | `"0.13"` | `0.13` |
| `-0.125` | `"-0.12"` | `-0.12` |
| `0.30000000000000004` | `"0.30"` | `0.3` |
| zero / negative zero / `-0.005` | `"0.00"` | `0` |

`jsonb_typeof(taxes->0->'amount')` was asserted as `string`; exact raw leaf values were asserted independently of model hydration. Order, duplicate tax types and stored optional/nested metadata were tested. Explicit model replacement changes only amount leaves; existing PATCH still validates/rebuilds `{ type, amount }` as before.

Production scalar helpers reuse the unchanged Category Math.round/divide/toFixed implementation, safe integer-cent and cent round-trip checks. No tax-sum conservation was introduced. Large safe tax values, signed half ties, binary artifacts, malformed/overflow input and malformed stored strings have focused coverage. Nonfinite JavaScript input remains covered by actual codec/non-DB tests; JSON transport cannot represent Infinity/NaN and serializes these as null, which the required amount validator rejects.

Numeric, canonical-string, mixed, empty and JSON-null fixtures verify numeric runtime/API values and no read-triggered UPDATE. Legacy numeric fractional cents retain their original runtime dollar value on read. Metadata-only and Category-only updates preserve raw legacy tax JSON, including metadata; explicit empty replacement clears attribution.

## Reporting and financial noninterference

The unchanged SQL `jsonb_to_recordset(... amount real)` accepts numeric and string values. Numeric/string/mixed report fixtures preserve month/type grouping, signs, Budget scope, and existing deleted/pending/pre-start inclusion. Expected totals use exactly representable synthetic values; no new aggregation/rounding policy is inferred from this test.

Raw before/after snapshots verify tax-only editing preserves Category JSON and AccountTransaction amounts, Account balances, Category balances, Funding Pool and Statement financial state. Normal Transaction version/timestamp/log changes remain allowed. Legacy numeric tax JSON is not normalized on unrelated metadata/Category edits or deleted historical-style metadata saves.

Additional provider tests seed numeric/string/mixed attribution with metadata and run real OFX/Plaid reimports through mocked external providers. Reimport must preserve raw tax JSON and numeric GET responses. Further tests cover funding/rebalance replacement, opening/startDate maintenance, soft deletion and parent cascades, including foreign Transaction preservation. These are synthetic fixtures, not historical production data.

## Concurrency, rollback and security

Prepared tests observe real PostgreSQL Budget wait edges using `pg_blocking_pids`, not elapsed sleeps. They exercise commit and rollback followed by fresh reads, HTTP tax versus metadata orderings, stale-version rejection, and different-Budget progress. Only Budget is explicitly locked. Unexpected deadlock/lock-timeout is a failure, not an accepted outcome.

Late TransactionLog failure follows actual tax persistence; full raw snapshots must equal pre-request state after rollback, then retry succeeds. Foreign-Budget and missing Transaction PATCH return 404 without changing financial/tax state. No foreign Transaction influences tax report totals.

## Test-only corrections during expanded regression

The first expanded run was **1,256 passed / 8 failed / zero skipped/pending**. Isolated reproduction was **58 passed / 8 failed** across the tax and Statement DELETE files. The eight failures were expectation defects:

1. Seven Statement DELETE cases expected AccountTransaction `updated_at` to remain unchanged. HEAD already unlinks Statements using model saves and automatically updates timestamps. The assertion now verifies a timestamp within the operation's time bounds and no regression from its previous value, while retaining strict equality for every financial/other column and untouched row.
2. One newly added malformed-array case expected optional `taxCategories: null` to reject. The unchanged actual Vine validator returns `{ version }`, treating null as omitted. The corrected dedicated test verifies successful existing metadata/version behavior with raw tax/Category JSON and financial state unchanged. Null required entry amounts still reject.

No production behavior was changed to satisfy either expectation. Corrected isolated selection: **66 passed, zero failed/skipped/pending**.

## Final acceptance counts and static checks

| Acceptance run | Passed | Failed | Skipped | Pending |
| --- | ---: | ---: | ---: | ---: |
| Original prepared PostgreSQL cases, corrected fixture | 45 | 0 | 0 | 0 |
| Expanded focused selection (includes original 45) | 1,269 | 0 | 0 | 0 |
| Additional raw Category duplicate/order/metadata check | 1 | 0 | 0 | 0 |
| Complete automated suite, final run | **2,807** | **0** | **0** | **0** |

The tax acceptance file now contains 62 cases: the original 45 plus 17 expanded cases. Provider files add six more preservation cases. These counts overlap the broader focused/full selections; they must not be added to the suite totals as independent coverage.

Final expanded run: **74,488 independent identity checks / 74,485 guarded SQL operations**. Additional raw-Category check: **54 / 51**. Final complete suite: **79,662 / 79,659**, including independent teardown truncation. No safeguard mismatch, unexpected deadlock or lock timeout remained. Final suite duration was approximately three minutes.

| Final static/build verification | Result |
| --- | --- |
| Server TypeScript | Passed |
| Client TypeScript | Passed |
| Changed-file ESLint (all runtime/test files in the bounded implementation and verification) | Passed |
| Repository-wide ESLint | Failed only on **15 existing errors** in untouched private audit artifacts |
| Knip | Passed |
| Circular regression | Passed: accepted 11-model/26-edge Lucid component only |
| Server production build | Passed |
| Client production build | Passed |
| Modified JS test syntax | Passed |
| Working-tree and staged diff whitespace | Passed |

Repository-wide lint: six console/process no-undef errors in `category-conversion-readiness-ajar8i/production-readonly-probe.mjs`, nine URL/console no-undef errors in `tax-historical-audit-ClXXgK/reconcile.mjs`. No unrelated private artifact was changed or suppressed. Production builds retain the existing >500 kB client chunk warning. Test HMR port occupancy and expected injected-error logs are separate from acceptance failures.

Remaining risks: unchanged PostgreSQL real aggregation is still floating-point reporting; historical tax conversion remains separate, and compatible code must be deployed before that future operation. JSON null retrieval compatibility is not an expansion of SQL recordset-report eligibility for non-array tax shapes. No new production defect or product decision blocks this bounded implementation.

## Changed-file inventory

Verification changes:

- `tests/helpers/databaseSafety.ts`: authenticated-role safeguards.
- `tests/unit/databaseSafetyLifecycle.spec.js`: configured/live-role fixture and mismatch regression.
- `tests/functional/transactions/taxDecimalStringStorage.spec.ts`: JSON-null fixture, optional-null contract, malformed/type/limit inputs and lifecycle preservation.
- `tests/functional/accounts/ofxReimport.spec.ts`: three attribution preservation cases.
- `tests/functional/institutions/plaidSync.spec.ts`: three attribution preservation cases.
- `tests/functional/accounts/statementDeletion.spec.ts`: correct committed timestamp expectation with strict noninterference assertions retained.
- This verification document and updates to the implementation record.

## Git preservation

Initial staged diff fingerprint: `c5a2d859761cd25330c46217862e01acf6b5f0a9c0c77a6e571cd1e974415b5f` (7 staged files). During verification, the index changed outside this agent's commands: additional implementation/test/documentation files, including test changes made in this task, became staged. Observed later fingerprint: `c6198081b1c1370621748c09a85c896fdc9668f85bda76640deeb87bc61dd4fe` (21 staged files). The agent ran no stage, reset, restore, checkout, commit or other index mutation. The current externally updated index is preserved; an assertion that the initial index stayed byte-for-byte identical would be incorrect.

## Full-suite baseline expectation correction

The first complete suite ran after focused acceptance: **2,806 passed / 1 failed / zero skipped/pending**. The single failure was the pre-existing installer-defaults test, outside tax storage: it expected a shared blank `PLAID_WEBHOOK`, while committed installer metadata now specifies environment-specific production/staging webhook URLs. Isolated, database-free reproduction: **10 passed / 1 failed**.

Test-only correction in `tests/unit/installerEnvDefaults.spec.js`: assert the exact committed production/staging map and its emitted staging value, while retaining all common-value, syntax, idempotency and environment-preservation assertions. No installer metadata or implementation changed. Corrected isolated result: **11 passed / zero failed/skipped/pending**. This file is an additional verification-only change to the inventory above. The complete suite was then rerun; the initial failing run is not claimed as acceptance.


## Evidence and final state

Local runner evidence (synthetic fixtures only):

- `/tmp/tax-pg-safeguards-first.log`, `/tmp/tax-pg-safeguards-final.log`.
- `/tmp/tax-pg-original45-run.log`, `/tmp/tax-pg-null-reproduce.log`, `/tmp/tax-pg-original45-corrected.log`.
- `/tmp/tax-pg-expanded-final.log`, `/tmp/tax-pg-fixture-reproduce.log`, `/tmp/tax-pg-fixtures-corrected.log`.
- `/tmp/tax-pg-focused-acceptance.log`, `/tmp/tax-pg-category-leaves.log`.
- `/tmp/tax-pg-full-suite.log`, `/tmp/tax-installer-baseline-reproduce.log`, `/tmp/tax-installer-baseline-corrected.log`, `/tmp/tax-pg-full-acceptance.log`.
- `/tmp/tax-pg-final-{server,client,lint,changed-lint,knip,circular}.log` and `/tmp/tax-pg-final-{server,client}-build.log`.

Final HEAD and branch remain unchanged. Final staged fingerprint remains `c6198081b1c1370621748c09a85c896fdc9668f85bda76640deeb87bc61dd4fe`, identical to the externally updated snapshot observed earlier. The initial fingerprint differs because staging changed during this task; no stage/index mutation was performed by this agent, and no unrelated work was discarded or overwritten.

Final `git status --short`:

```text
M  .gitignore
M  adonisrc.ts
M  app/Controllers/Http/TransactionsController.ts
M  app/Models/Transaction.ts
A  app/services/taxAmountCodec.ts
A  app/services/taxStorageBinding.ts
A  app/services/transactionTaxStorage.ts
A  docs/remaining-json-money-migration-candidates.md
A  docs/remaining-monetary-storage-inventory.md
A  docs/transaction-tax-attribution-historical-audit.md
A  docs/transaction-tax-attribution-precision-review.md
AM docs/transaction-tax-decimal-string-implementation.md
A  scripts/auditTransactionTaxPrecision.mjs
M  tests/functional/accounts/ofxReimport.spec.ts
 M tests/functional/accounts/statementDeletion.spec.ts
M  tests/functional/institutions/plaidSync.spec.ts
AM tests/functional/transactions/taxDecimalStringStorage.spec.ts
M  tests/helpers/databaseSafety.ts
M  tests/unit/client/financialState.spec.js
M  tests/unit/databaseSafetyLifecycle.spec.js
 M tests/unit/installerEnvDefaults.spec.js
A  tests/unit/transactionTaxPrecisionAudit.spec.js
A  tests/unit/transactionTaxStorage.spec.js
?? .vscode/settings.json
?? backup.sql
?? debertas.pem
?? docs/transaction-tax-decimal-string-postgresql-verification.md
?? dump.rdb
?? dump.sql
?? report.json
?? spendcraft.sql
?? stats.json
?? summary.md
?? test.html
?? test.js
?? test.ofx
?? test.sh
?? test2.ofx
```

**Accepted for deployment preparation.** Every destructive database operation used only localhost:5432/spendcraft_test; setup and every cleanup were independently safeguarded. Task-specific database authorization is now expired at verification completion. No historical tax conversion, staging/production database change, historical repair, unrelated monetary representation change, schema migration, deployment or commit occurred. Temporary test-only constraints/objects were independently guarded and cleaned up; no application schema migration was run.
