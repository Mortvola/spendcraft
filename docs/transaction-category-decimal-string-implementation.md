# Transaction Category decimal-string storage implementation

## PostgreSQL acceptance — current status

**ACCEPTED at HEAD `1c2a1edaa8e1dc8112e2d949deefb5b9e637633b` with the existing working-tree implementation. Historical conversion is ready for separate approval, not authorized or executed by this acceptance.** See the [complete PostgreSQL verification record](transaction-category-decimal-string-postgresql-verification.md), whose current acceptance supersedes the historical failed/pending sections below.

Fresh authorized reverification used only `localhost:5432/spendcraft_test`. Safeguard tests27/27 passed before connection. Configured/live `pg`, `pgLog` and the actual execution connection were independently checked before every destructive statement, setup and cleanup. Final focused acceptance: **616 passed,0 failed,0 skipped/pending**. Final complete suite: **2110 passed,0 failed,0 skipped/pending**, run only after the focused gate passed. The final full run recorded75905 independent checks protecting75902 SQL operations, including guarded teardown.

The original Category DELETE failure is resolved by the authorized `application_id` filter. Foreign numeric/string/mixed JSON references no longer block deletion or enter the owning register/count; full snapshots preserve all foreign financial state. Same-Budget nonzero references, including duplicates, still return409 with unchanged state. Budget gate ordering, fresh admission, transaction binding, rollback, concurrent posting and different-Budget independence pass. The separately authorized Category GET and CheckBalances Budget filters are present; no production code was changed during reverification.

Raw JSON string amounts, numeric runtime/API responses, numeric/string/mixed read compatibility, no read-triggered normalization, per-entry Math.round/checked-cent conservation, ordinary0/5, funding2 with explicit Pool, rebalance3 and opening4 pass. Provider/manual, funding/rebalance replacement, immutable dates, SQL/reporting, metadata/deleted-record noninterference and current accounting/client/deprecation regressions pass. No historical audit or conversion was rerun; the accepted6247-record baseline and13 deleted exceptions retain their nonrepair policy.

The first full run's35 stale test failures were corrected only in test fixtures/expectations: guarded raw historical fixture setup, explicit zero Pool entries in funding configuration fixtures, approved string/cent assertions and recognition of the authorized Category GET source change. An exploratory245-case retry encountered two harness timeouts; the multi-request configuration matrix now has a bounded30-second limit. The subsequent245-case retry, final focused and full runs pass. The detailed record preserves these failures and the limit of the timeout diagnosis rather than hiding them.

Both TypeScript checks, ESLint, Knip, circular regression, server build including assets, separate client build and both diff checks pass. Existing HMR-port, large-bundle and pg concurrent-query warnings remain. All12 production files and the empty index match the initial snapshot. Verification edits are confined to eight test files and these two documents, all unstaged; final tracked modified count33 includes preexisting work. No historical conversion/repair, unrelated monetary change, application schema migration, deployment or commit occurred. **Task-specific database authorization is now expired.**

## Historical implementation and first-verification status — superseded above

## Authorized tenant-scoping correction — PostgreSQL rerun pending

Following verification, the user authorized the narrow correction: `CategoriesController.deleteCategory` now filters the membership query by `application_id = user.budgetId`. Its owning transaction, Budget gate, deleted filter and allocation predicate are unchanged. A non-DB controller regression exercises the actual method with a foreign cross-linked allocation, and the existing real PostgreSQL regression remains prepared. No PostgreSQL connection was made for this follow-up because verification authorization expired. The failed acceptance below is historical evidence; the implementation is not yet PostgreSQL-accepted after this correction.

## PostgreSQL verification outcome — further work required

See [the PostgreSQL verification record](transaction-category-decimal-string-postgresql-verification.md). Against HEAD `1c2a1edaa8e1dc8112e2d949deefb5b9e637633b`, all40 prepared cases and nine added SQL/report cases pass after test-only corrections. An expanded focused selection passed364/364, but the final added tenant-boundary gate is49 passed/1 failed: a foreign Transaction's cross-linked JSON Category reference blocks another Budget's Category deletion. The register/count correctly exclude it. The deletion membership query lacks an owning Budget filter; this omission predates the storage change but fails requested scoped acceptance.

No runtime correction was made. Proposed smallest correction: scope `CategoriesController.deleteCategory`'s Transaction membership query by the authorized `application_id`, retaining its owner/gate and typed predicate. Full suite and builds were not run after the final failed gate. Both TypeScript checks, ESLint, Knip, circular regression,44 pure codec tests and both diff checks pass. The detailed record lists exploratory failures, fixture/expectation corrections, per-operation safeguards and changed files. All11 existing production implementation files and the empty index remain unchanged during verification. Historical conversion remains deferred; no conversion approval follows from the passing core cases. Task-specific database authorization expires at verification completion.

## Baseline and status

Implemented against HEAD `1c2a1edaa8e1dc8112e2d949deefb5b9e637633b`. **PostgreSQL acceptance is required; historical conversion is not implemented or executed.** The tracked tree/index were initially clean. Three design documents and a characterization test/record from the immediately preceding investigation were present when implementation resumed; they were continued rather than discarded. Unrelated generated/editor/backup/scratch files are preserved. Nothing is staged automatically.

The two initial admission questions were explicitly resolved by the user:

1. POST `/api/v1/category-transfer` may create **only2/3**. Types0/4/5 require their owning Account lifecycles; no synthetic AccountTransaction or expected amount is invented.
2. Type2 must contain the owning Funding Pool allocation. Reject missing-Pool funding even if the non-Pool sum is zero; do not insert a row or infer zero.

## Central storage/runtime boundary

- `app/services/categoryAmountCodec.ts`: finite numeric conversion using `Math.round(amount * 100)`, safe integer checks, checked accumulation, `(cents / 100).toFixed(2)` and an encoding round-trip check. Zero/-0 encode`"0.00"`. Canonical stored decimal strings are parsed with BigInt cents, not blindly Number()-rounded again. Invalid/missing/nonfinite/unsafe/noncanonical strings reject422. The numeric runtime decoder preserves raw legacy numeric values, including binary artifacts, on reads.
- `app/services/categoryStorageBinding.ts`: per-instance active scope, pure preparation and dirty-state preservation. Bind after authoritative hydration and align only categories' numeric runtime original; do not reset unrelated dirty fields. Prepare a copied JSON array with only top-level amount encoded. An allocation save updates the numeric runtime/original to the persisted rounded value; metadata-only saves do not rewrite the column. Optional metadata, baseAmount/nested configuration, order and duplicates are untouched by the codec.
- `app/services/transactionCategoryStorage.ts`: batch scope resolution and owner-bound final conservation. Model query hooks classify only supported0/2/3/4/5 with complete fields. Account-linked types require one in-Budget non-Loan Account; type2/3 are accountless. Current Loan Accounts/Categories are excluded. Unsupported nondeprecated ownership cannot silently write allocations. Fresh model queries inherit their existing transaction; all added raw queries use that owner when present.
- `app/Models/Transaction.ts`: scoped afterFind/afterFetch binding; beforeSave scalar encoding; afterSave numeric runtime synchronization. This is **not** an unconditional consume/decoder for all Transaction JSON. New instances opt in only from resolved active callers. Unbound/deprecated paths retain their existing preparation. Scalar validation and final conservation are separate because ordinary/opening CREATE saves the Transaction before its AccountTransaction exists.

Bulk hydration performs at most two batched classification queries (links and Category exclusions), not a per-row lookup loop. Grouping links in memory is linear. New allocation saves may perform a Category exclusion check, and final conservation adds one authority query. Real query counts/plans remain PostgreSQL acceptance work.

## Conservation and posting boundary

Applicable new/replacement nominal allocations use signed **per-entry** rounded cents and checked accumulation. Do not sum dollars then round. Ordinary0/5 and opening4 compare to the single authoritative AccountTransaction amount read as PostgreSQL decimal text; that storage is unchanged. Funding2 requires Pool presence and checks non-Pool+Pool=0. Rebalance3 checks total=0.

`validateTransactionSplits` has an explicit active-storage mode for signed checked rounding; its default policy remains unchanged for deprecated shared callers. Manual active CREATE/PATCH and OFX opt in. Negative half ties therefore follow the approved storage rule, not sign-flipped rounding.

New manual/funding effects read the numeric allocation values exposed after successful encoding/save. PATCH canonicalizes newly submitted active allocations before computing effects; it does not quantize old clean legacy reads. This prevents an accepted new−1.125 split stored as−1.12 from instead posting raw−1.125 through a decimal column's different tie rule. Runtime calculation still uses JavaScript numbers; this is the approved nominal cent boundary, not a full exact-arithmetic migration. Deprecated shared branches are excluded.

Final conservation is inside the owning transaction before commit. Authority failures roll back rather than adjusting another amount. Existing Budget gates, eligibility, pending/startDate behavior, opening formula/Pool delta, provider Account versus reported balance authority, type2 immutable date and replacement admission remain. No explicit lock is added.

## Reader/writer coverage

| Current path | Integration |
|---|---|
| AccountsController.addTransaction | Explicit non-Loan opt-in; final linked conservation before Account/Category effects; post-storage numeric API. |
| TransactionsController.update | Fresh scoped model binding; active new input canonicalized; final validation when allocations/amount change. Metadata-only changes do not invoke historical conservation. |
| Account.addTransaction/assignUnassigned/autoAssign | Explicit provider type0 and initial[]; scoped writer encoding and final linked conservation. |
| Account.updateTransaction (Plaid) | Fresh numeric old allocations prevent concatenation; final check when allocations or linked amount change. |
| Account.processOfx | Opt-in new0; existing imports hydrate numerically; final conservation after each AccountTransaction save. Existing explicit allocation/replay logic retained. |
| Account.updateStartingBalance | Type4 fully included for active Accounts; final same-sign linked validation on creation/maintenance; existing formula/date/Pool arithmetic retained. |
| Funding/rebalance transfer | Approved CREATE2/3 gate; Pool-presence/cent preflight before mutation; active writer opt-in; fresh replacement decoding and final conservation. |
| CheckUnassigned | Fresh selected active models are bound; actual allocation writes encode; deleted records do not acquire a global conservation requirement. Command not executed and not used for migration. |
| Ordinary/provider DELETE, Account/Institution cascades, startDate crossings | Existing fresh models/preloads are bound before numeric consumption. Deletion/reversal arithmetic and historical limitations are unchanged; clean arrays are not rewritten by deleted/date/metadata saves. |
| Account/Category registers, GET/multiple/search/rebalance APIs | Central scoped model hydration provides numeric arrays before serialization, including nested preloads. Client/DTO monetary types stay numeric. |
| Category admission/list/count | Shared typed EXISTS numeric extraction replaces exactly3 JSON-path comparisons. No outer row expansion, count/pagination change, zero fallback or relational fallback. |
| Category/Funding History/Income and other existing SQL amount readers | Existing decimal recordset extraction retained for both JSON representations. Selection/sign/grouping/tenant rules and report authority unchanged; real mixed-type SQL acceptance is pending. |

The10 direct JavaScript hazards remain numeric consumers; they are protected by the active numeric boundary rather than scattered Number/parseFloat calls or client changes. Existing raw-string characterization tests still illustrate why strings must not leak to these consumers.

## Historical audit and deleted records

The user-accepted authoritative baseline is6247 Transactions:6234 pass,10 fail,3 unsupported,0 malformed. Ordinary0/5:6152/8/0; funding2:39/2/3; rebalance3:35/0/0; opening4:8/0/0. No nondeleted failures or unsupported records.38 Transactions change with rounding,36 conserve;10451 amount conversions independently agreed. Opening325,326,344,345,406,3044,5278,6381 all passed with no rounding changes. Ordinary7261 passed at−28.94. This supersedes older6246/type4-unsupported records.

The historical artifact directories previously supplied are absent from the current workspace. These are the accepted user-provided results, not a newly rerun audit or independent current-file verification. Sandbox results are a different dataset and do not replace this baseline.

No historical conversion occurs. Preserve empty deleted ordinary3974,3975,3977,4116,4262,4412,4413,4415; deleted funding4596/4597 each+9-cent remainder; empty deleted funding2578,3077,3388. Reads and unrelated saves do not validate or repair these13 exceptions. The policy applies by lifecycle/deleted state, not an ID allowlist.

## Deprecated and unrelated boundaries

Loans and the entire `transaction_categories` architecture remain deprecated/excluded. No legacy monetary adapter, fallback or migration is added. Existing structural admission remains unchanged. No client runtime, AmountInput, DTO, other monetary storage, schema, provider monetary policy, tax/Statement authority or reporting authority is migrated. No historical DELETE/cascade correctness claim is made.

## Verification and prepared PostgreSQL matrix

New offline tests exercise actual codec functions, real Lucid preparation/dirty tracking/serialization with inert rows, actual batch scope resolution with inert SQL, current controller CREATE admission and current funding missing-Pool behavior. Existing AST test doubles were updated for new helpers without changing financial expectations. The old staged-snapshot byte comparison now explicitly excludes approved changed methods while still byte-comparing every untouched method.

`tests/functional/categories/decimalStringStorage.spec.ts` prepares40 cases: raw string/API persistence; numeric/string/mixed GET/PATCH; signed half-tie posting; malformed/overflow/rounding-order rejection; all5 supported lifecycles; duplicates/metadata; deleted exceptions; new admission; late rollback; deterministic actual PostgreSQL blocking-edge waiter tests for commit/rollback; different-Budget independence and foreign ownership. It contains no direct cleanup/truncation. Use the existing safeguarded application bootstrap, which verifies configured/live pg,pgLog and each destructive execution connection before every write/setup/cleanup. **None was run.** An existing funding conservation fixture was updated to include the now-required Pool entry.

Before acceptance also run existing OFX/Plaid, funding/rebalance replacement, initialization/startDate, DELETE/cascade nonregression, JSON-authority reporting, eligibility/concurrency, client cache and deprecation selections. Retain all raw nonfinancial/financial snapshots and inspect SQL/plans. Do not certify historical reversals. No schema/index change is proposed.

Historical conversion remains a separate future task using Budget gates and scalar-only JSONB patches, not model saves or provider replay. Maintenance/drain and rollback-window operational approval remain deployment gates; no old numeric-only reader may remain when strings are enabled.

## Changed-file inventory

Production:3 new service modules; AccountsController, CategoriesController, TransactionsController; Account, Category, Transaction models; transactionSplits validation; CheckUnassigned. Tests: new codec/binding and admission units, new prepared PostgreSQL file; existing conservation fixture and relevant AST harness/source expectations. Documentation: this record and the3 storage design/compatibility/audit records. No unrelated production files or index entries changed. Final exact Git inventory is reported with verification.

Final non-DB results:44 focused boundary cases passed,0 failed/skipped;568 broader standalone cases passed,0 failed/skipped (the focused cases are included, not additional). The broader selection is all JavaScript unit files plus fundingPercentages.spec.ts; app-bootstrap-dependent TypeScript units and all functional/PostgreSQL tests were not executed. Both TypeScript projects, ESLint, Knip, circular regression, server build with client assets, separate client build and working/staged/new-file whitespace checks passed. Warnings are the existing asset chunk-size warning; no unexpected circular component (accepted11-model SCC). These results are not PostgreSQL acceptance. No database connection, destructive operation, historical conversion/repair, unrelated monetary representation change, schema migration, deployment or commit occurred.

### Exact affected-file list

- `app/Controllers/Http/AccountsController.ts`
- `app/Controllers/Http/CategoriesController.ts`
- `app/Controllers/Http/TransactionsController.ts`
- `app/Models/Account.ts`
- `app/Models/Category.ts`
- `app/Models/Transaction.ts`
- `app/services/categoryAmountCodec.ts`
- `app/services/categoryStorageBinding.ts`
- `app/services/transactionCategoryStorage.ts`
- `app/validation/transactionSplits.ts`
- `commands/CheckUnassigned.ts`
- `docs/transaction-category-cent-conservation-audit.md`
- `docs/transaction-category-decimal-string-implementation.md`
- `docs/transaction-category-exact-cent-compatibility-review.md`
- `docs/transaction-category-exact-cent-storage-design.md`
- `tests/functional/categories/conservation.spec.ts`
- `tests/functional/categories/decimalStringStorage.spec.ts`
- `tests/unit/categoryAmountStorage.spec.js`
- `tests/unit/categoryPoolConcurrency.spec.js`
- `tests/unit/finalReadiness.spec.js`
- `tests/unit/ofxBalanceAuthority.spec.js`
- `tests/unit/remainingBudgetWriters.spec.js`
- `tests/unit/replacementAdmission.spec.js`
- `tests/unit/stagedBudgetVerification.spec.js`
- `tests/unit/transactionCategoryCompatibility.spec.js`
- `tests/unit/transactionCategoryStorageBoundary.spec.js`
- `tests/unit/transactionEligibility.spec.js`

Final index is empty and HEAD unchanged. All unrelated untracked files are preserved. Fresh PostgreSQL authorization has not been granted or used for this implementation; restrict later automated acceptance to localhost:5432/spendcraft_test with per-operation safeguards.
