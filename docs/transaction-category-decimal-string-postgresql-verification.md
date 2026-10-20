# Transaction Category decimal-string PostgreSQL verification

## Current acceptance — Category DELETE scoping and complete storage reverification

**ACCEPTED — historical conversion requires separate approval.** This section supersedes the failed first verification and pending follow-up sections retained below.

Exact HEAD remains `1c2a1edaa8e1dc8112e2d949deefb5b9e637633b`. Verification used the existing working-tree implementation, including the separately authorized Category DELETE, four Category GET aggregate filters and CheckBalances aggregate filter. No production code was changed during this reverification. All12 production files present at entry match their initial SHA-256 fingerprints in `/tmp/decimal-reverify-snapshot.json`. The index was empty and remains empty; staged-diff SHA-256 remains `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### Independent safeguards and authorized identity

Fresh authorization covered **only `localhost:5432/spendcraft_test`**. Before financial tests,27 inert safeguard tests passed,0 failed,0 skipped. Reinspected the standard bootstrap, driver interceptor, prepared cases, historical-fixture helper and test-only temporary-object cleanup. No direct destructive client bypass was introduced.

For both `pg` and `pgLog`, configured identity was host`localhost`, port5432, database`spendcraft_test`. Live identity was database`spendcraft_test`, port5432, server`::1/128`, peer`::1/128`: positively verified loopback. The actual execution connection was independently verified before each destructive statement. The centralized guard repeats all configured/live checks immediately before ORM/raw fixture writes, truncation, temporary-object creation/removal and every cleanup. Setup verification does not authorize later teardown. Returned teardown independently verifies and remains intercepted until complete.

Outer guard totals below include each run's independently protected cleanup. Nested test guards perform additional checks; their counters are not added to these totals. Tiny driver-fixture counters in unit output use inert connections, not other database targets.

| Run | Independent checks | Guarded SQL operations |
|---|---:|---:|
| Original security/storage rerun |2463|2460|
| Expanded367-case focused run |19614|19611|
| First complete suite |75750|75747|
| Affected-test exploratory retry |16527|16524|
| Affected-test passing retry |16527|16524|
| Final combined focused gate |36137|36134|
| **Final complete suite** |**75905**|**75902**|

No application schema migration was applied: migration checks reported already up to date. Existing lifecycle tests create and remove isolated probe objects through the guard; this is not a monetary/application schema migration. All connections remained on the authorized database. The final run completed guarded teardown and exited successfully. No later database operation was performed. **Task-specific authorization is now expired at task completion.**

### Original failure and corrected security behavior

The first verification found a conditional cross-Budget admission defect: a Transaction owned by Budget A with a cross-linked JSON Category ID belonging to Budget B made B's Category DELETE return409. The register/count correctly excluded A's Transaction. This did not demonstrate that supported submission could create the malformed relationship or that private metadata was disclosed.

The separately approved correction is now present in `CategoriesController.deleteCategory` (the actual method name):

```typescript
const result = await db.query().useTransaction(trx)
  .select(1)
  .from('transactions')
  .where('application_id', user.budgetId)
  .where('deleted', false)
  .whereRaw(categoryNonzeroAllocationSql, [category.id])
  .first();
```

Budget acquisition precedes authorized Group/Category reload and membership admission. Membership uses the owning transaction and freshly resolved Category ID. The correction adds no explicit lock, new lock hierarchy, eligibility filter, amount fallback or financial arithmetic.

The original regression now passes for **numeric, canonical-string and mixed allocations**: foreign Transactions do not enter the register/count or block B's deletion; DELETE returns204. Full snapshots of Transactions, Accounts, AccountTransactions, Categories (including Pool), Statements and Transaction logs show that only the intended Category row is removed. Foreign JSON and all foreign financial state remain unchanged.

Complementary same-Budget numeric/string/mixed cases preserve409 for nonzero usage, including duplicate allocations. Error status/detail remain unchanged; full snapshots prove no mutation on rejection. Zero-valued allocations preserve existing204 admission. Duplicate allocations do not inflate register count/pagination. Existing Category/Pool contention tests verify fresh admission after waiting, transaction binding by execution transaction and Budget lock observation, rollback and same-Budget posting/deletion orders. Different-Budget writers remain independent. No additional explicit row/advisory lock was introduced.

### Decimal-string storage acceptance matrix

The original40 prepared cases, nine SQL/report cases and three foreign representation cases all pass in the final focused/full runs.

| Boundary | Verified result |
|---|---|
| Raw storage |New supported allocation writes persist two-fractional-digit JSON **strings**, including `"12.34"`, `"-12.34"`, `"0.00"`, ordered duplicate`"0.10"`/`"0.20"` entries and signed Pool`"-0.30"`. |
| Runtime/API |Numeric, string and mixed stored arrays hydrate to numeric active runtime/API allocations. CREATE/PATCH and client regressions preserve numeric public types. |
| Read isolation |GET and report snapshots remain byte/value unchanged; no read-triggered normalization or historical backfill. |
| Approved conversion |Individual `Math.round(amount * 100)` and checked sums; canonical strings parsed as exact cents. Negative zero encodes`"0.00"`; signed half tie`-1.125` stores/posts`-1.12` with a conserving linked amount. Invalid/missing/unsafe values reject atomically. |
| Ordinary0/5 |Signed sum of individual allocation cents equals the single owning AccountTransaction decimal-text cents. Pending/startDate/deleted accounting behavior remains separate from nominal conservation. |
| Funding2 |Persisted net non-Pool cents plus Pool cents equal zero; explicit owning Pool entry required. No use of baseAmount as conservation authority. |
| Rebalance3 |Individual allocation cents sum to zero; duplicates remain separate. |
| Opening4 |Fully supported, same-sign allocation/link conservation; opening formula, Account-balance invariance and Pool effects retain accepted behavior. |
| Admission |Category-transfer CREATE accepts only2/3; missing-Pool funding rejects even when non-Pool amounts sum to zero. |
| Metadata |Ordering, duplicates, optional metadata, baseAmount and nested configuration remain unchanged except the intended top-level amount encoding on allocation writes. |
| SQL/reporting |Typed membership/count predicates accept numeric/string/mixed values. Category/Funding History and Income Vs. Expenses retain accepted JSON authorities, signs, selection/count semantics and numeric responses. Existing report EXPLAIN/nonmutation regressions pass. |
| Providers/replacement |Manual, OFX/reimport, Plaid, funding/rebalance replacement and immutable funding dates pass accepted regressions. |
| Atomicity/concurrency |Late financial failure rolls back. Deterministic blocked-waiter tests reload committed or rolled-back state after Budget acquisition; different Budgets proceed independently. |
| Historical records |Representative deleted empty ordinary/funding arrays and +9-cent funding discrepancy survive reads and metadata-only saves unchanged. No historical IDs were converted or repaired. |

The accepted historical audit baseline remains6247 Transactions:6234 passed,10 failed,3 unsupported,0 malformed; no nondeleted failure/unsupported record. All8 opening Transactions passed. This evidence was not rerun against historical data. The13 known deleted exceptions retain their approved nonrepair policy.

### Test expectation corrections, not production fixes

The first complete run exposed35 stale failures: three Category-isolation fixture writes, one CheckUnassigned fixture write, three funding-configuration/admission expectations, two Transaction-isolation fixture writes, one lifecycle fixture write,24 sub-cent precision expectations and one source-isolation assertion predating the separately authorized Category GET correction.

Historical/cross-linked fixtures now use the existing guarded raw fixture helper instead of an unbound production model allocation save. Security assertions still require rejection and unchanged persisted state. The CheckUnassigned test still proves a waiter observes a committed explicit allocation without rewriting it.

Funding configuration fixtures now contain an **explicit zero Pool allocation** alongside their existing balanced non-Pool transfer. This satisfies the approved Pool-presence requirement without changing the configuration under test, non-Pool effects or expected balances. Missing-Pool rejection remains separately asserted. Raw persistence expectations assert encoded strings rather than obsolete numeric JSON.

Sub-cent characterization now asserts the approved rounded Category storage and compares it with the unchanged AccountTransaction numeric-column conversion. When they disagree (notably negative half ties), CREATE/PATCH must422 and roll back; the tests check unchanged amounts, balances and version. They do not force expected amounts to equal splits or change another monetary field. Rebalance tests retain each legitimate allocation and enforce per-entry rounded zero sum.

The source-isolation assertion now recognizes the user-approved Category GET scoping correction; its four SQL templates/binding positions have dedicated regressions. Unrelated methods remain compared with HEAD.

An affected-test exploratory run had two Japa timeouts: the multi-request funding-configuration test exceeded its old2-second limit, and a subsequent lifecycle HTTP case exceeded its deadline. The latter's precise cause was not independently established. The configuration matrix now has a bounded30-second timeout to allow its complete guarded HTTP sequence to finish before teardown. The subsequent245-case retry, final616-case combined focused gate and complete2110-case suite all passed without a production change. This is retained as harness/reproducibility history, not a claim of a repaired production defect or justification to weaken financial assertions.

### Exact counts and final static/build results

| Run | Passed | Failed | Skipped/pending |
|---|---:|---:|---:|
| Safeguard tests before connection |27|0|0|
| Original security/storage rerun |50|0|0|
| Expanded focused selection |367|0|0|
| First full suite (stale expectations) |2075|35|0|
| Affected exploratory retry (timeouts) |243|2|0|
| Affected corrected retry |245|0|0|
| **Final focused acceptance** |**616**|**0**|**0**|
| **Final complete automated suite** |**2110**|**0**|**0**|

Final focused acceptance completed before the final full-suite run began. No tests were excluded or security/conservation assertions weakened to produce acceptance. The complete suite includes current client, accounting/provider, Statements/initialization, report, runtime-deprecation and concurrency regressions. Deprecated Loan/legacy relational tests ran only as unchanged complete-suite regressions; they do not become active migration scope.

Both TypeScript projects, ESLint, Knip, circular regression, server build including client assets, separate client build and both diff checks pass after the final test changes. Circular analysis retains the accepted11-model/26-edge component (433 analyzed files;510 repository nodes), with no unexpected cycle. Build/test logs are `/tmp/decimal-reverify-*` and are not staged.

Nonfatal warnings: occupied Vite HMR port24678 while HTTP3349 works; existing over500kB client chunk; pg concurrent-query deprecation. Expected injected failures, validation and missing-resource logs are passing test assertions. No unexpected PostgreSQL deadlock or lock timeout remained in final acceptance. Existing JavaScript floating arithmetic/API numbers and other monetary storage are unchanged; this is bounded exact-cent Category storage, not an application-wide exact-arithmetic certification.

### Changed-file inventory and remaining boundaries

No production or index changes occurred during this reverification. Test/document edits, all unstaged:

- `tests/functional/categories/decimalStringStorage.spec.ts`: numeric/string/mixed foreign regression, global nonmutation snapshots and same-Budget rejection contract assertions.
- `tests/functional/categories/isolation.spec.ts`: guarded historical/cross-linked fixture setup.
- `tests/functional/concurrency/stagedBudgetWriters.spec.ts`: historical fixture setup for the CheckUnassigned waiter regression.
- `tests/functional/funding/configuration.spec.ts`: explicit zero Pool fixtures, string persistence expectations and bounded matrix timeout.
- `tests/functional/transactions/isolation.spec.ts`: guarded unsafe historical fixture setup.
- `tests/functional/transactions/lifecycle.spec.ts`: guarded preexisting multi-split fixture setup.
- `tests/functional/transactions/moneyPrecision.spec.ts`: approved storage-rounding/conservation expectations and rejected-write noninterference.
- `tests/unit/stagedBudgetVerification.spec.js`: recognize the separately approved Category GET scoping correction while preserving unrelated method assertions.
- `docs/transaction-category-decimal-string-implementation.md` and this record: current acceptance and preserved exploratory history.

Final Git state: **33 tracked modified files**, including the preexisting work; **empty index**; ten relevant untracked implementation/verification files remain untracked. No new files were created by this reverification. Existing unrelated generated/editor/backup/scratch files remain. All12 production fingerprints match the entry snapshot, and HEAD is unchanged. No automatic staging or commit occurred.

Historical conversion requires separate approval, safeguards and fresh-state preflight; it was not executed here. Historical deletion/cascade reversal authority is not certified beyond existing current-fixture nonregression. Loans and the entire legacy relational allocation architecture remain deprecated/excluded. No historical repair, unrelated monetary representation change, application schema migration, deployment or commit occurred. Every destructive operation used only the authorized test database; setup and every cleanup were independently safeguarded. **This task's authorization is expired.**

---

## Historical first verification and follow-up — superseded by acceptance above

## Follow-up: authorized correction, not yet database-verified

After this verification task completed, the user authorized the proposed correction. The Category deletion membership query now includes `.where('application_id', user.budgetId)`. Added a focused non-DB controller regression in `tests/unit/categoryPoolConcurrency.spec.js`; the failing PostgreSQL case remains unchanged for the next authorized rerun. No database connection occurred during this follow-up. All statements below about unchanged production files and the unimplemented proposal describe the completed verification snapshot, before this separately authorized correction. Acceptance remains pending fresh PostgreSQL authorization and rerun.

## Outcome and preserved baseline

**NEEDS FURTHER WORK — final tenant-boundary acceptance fails.** No historical conversion is approved by this record.

Verified HEAD: `1c2a1edaa8e1dc8112e2d949deefb5b9e637633b`. The index was empty and remains empty. The implementation arrived as unstaged tracked and untracked files. SHA-256 snapshots in `/tmp/decimal-storage-initial.json` confirm all 11 existing production implementation files (eight tracked plus three service modules) remain byte-for-byte unchanged during verification. No runtime correction was made. Existing unrelated generated/editor/backup/scratch files were preserved.

The unchanged staged-diff SHA-256 is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty diff). This review tests the working-tree implementation, not a staged snapshot.

## Database authorization and safety

Task authorization covered only `localhost:5432/spendcraft_test`. Standalone inert safeguard tests ran first: **27 passed, 0 failed, 0 skipped**. They test configuration rejection before connection, positive loopback identities, actual execution-connection checks, inherited transaction drivers, and independently rejected cleanup after identity changes.

Audited all 40 prepared cases, the added cases, fixture helpers, `tests/bootstrap.ts` and `tests/helpers/databaseSafety.ts`. No case uses a direct pg client or external destructive SQL bypass. The centralized driver interceptor independently rechecks configured/live `pg` and configured/live `pgLog`, then verifies the actual execution connection immediately before every conservatively matched destructive SQL statement. This includes ORM writes, raw fixture mutations, `FOR UPDATE`, setup truncation and returned cleanup. Setup verification is not reused to authorize cleanup.

Actual evidence for both named connections: configured host `localhost`, port `5432`, database `spendcraft_test`; live database `spendcraft_test`, port `5432`, server `::1/128`, peer `::1/128`. Both are positively verified loopback. No other database was accessed. An initial sandbox attempt failed local networking before destructive setup; the authorized network retry used the same guards. HTTP used `127.0.0.1:3349`.

Every completed database run independently guarded setup and teardown. Guard counters (each run includes its cleanup):

| Run | Independent checks | Guarded SQL operations |
|---|---:|---:|
| Initial fixture failure |1644|1641|
| Account fixture correction |1896|1893|
| Existing route correction |1947|1944|
| First broader focused characterization |15345|15342|
| Updated fixture/expectation retry |15495|15492|
| Expanded concurrency characterization |19343|19340|
| Passing expanded focused gate |19344|19341|
| Final 50-case tenant-boundary gate |2462|2459|

No unguarded manual cleanup occurred. The final run returned guarded teardown before completion. Existing migrations reported already up to date; no application schema migration was applied. Task-specific authorization is **expired upon completion of this verification task**.

## Raw storage, numeric API and conservation matrix

The original 40 cases pass after test-only fixture corrections. Nine added SQL/report cases also pass. The 50th, cross-Budget membership case fails as described below.

| Area | Observed result |
|---|---|
| Manual HTTP CREATE positive/negative/zero |Raw PostgreSQL JSON amounts are strings such as `"12.34"`, `"-12.34"`, `"0.00"`; API amounts remain numbers. |
| Numeric/string/mixed legacy storage |GET decodes each representation numerically; full raw snapshots remain unchanged. PATCH writes strings and returns numeric allocations. |
| Signed half tie |Submitted split `-1.125` with movement `-1.12` persists `"-1.12"`; numeric API and Category effect are `-1.12`. |
| Overflow/missing/invalid/rounding order |HTTP422 with unchanged raw financial state; no final-allocation adjustment. |
| Malformed stored strings |GET422 without normalization. The deliberately invalid fixture is subsequently cleared through the guarded test driver to avoid poisoning later SQL scans. |
| Types0/5/4 |Duplicate ordered `0.10` and `0.20` string allocations conserve against exact linked AccountTransaction decimal text `0.30`. |
| Type2 |Net non-Pool cents plus Pool cents equal zero; explicit owning Pool required. Base/nested monetary metadata remain unchanged. |
| Type3 |Individually rounded allocation cents sum to zero. |
| Category-transfer admission |CREATE0/4/5/99 and missing-Pool type2 reject422 before financial mutation. |
| Deleted historical shapes |Empty ordinary, empty funding and funding +9-cent discrepancy survive reads and metadata-only saves unchanged. No historical IDs/data were converted. |
| DELETE/cascades |Known eligible string-backed effects reverse using existing semantics; soft DELETE preserves stored strings; parent cascades remove expected rows. This does not certify historical reversal authority. |
| Late failure |Injected Category-save failure rolls back allocation storage and financial state. |
| Budget waiter |Deterministic PostgreSQL blocking observation proves the waiter reloads committed state, or original state after rollback, then commits complete `"0.15"`/`"0.15"` allocations. |
| Different Budgets |Independent Budget writer commits while another Budget gate remains held. |
| SQL membership/count |Numeric/string/mixed zero/nonzero arrays preserve register count, pagination and same-Budget deletion admission; duplicates count once per Transaction in the register. |
| SQL reports |Category sums0.30/count2, Funding History net0.30 and Income Vs. Expenses zero transfer-adjusted movement work with mixed storage without rewriting JSON. |

The passing broader selection includes real OFX/reimport, Plaid concurrency, opening/startDate, ordinary eligibility, funding/replacement/date, Category/Funding History, Income Vs. Expenses, Account-writer and Category/Pool concurrency. The report suites retain their existing EXPLAIN/nonmutation assertions; no report query or authority was changed. No new explicit application lock or financial writer was introduced during verification.

The production codec's pure suite also passes **44/44**: approved Math.round conversion including half ties/negative zero/binary artifacts, canonical-string validation, safe cents/checked accumulation, metadata/duplicate preservation, no write-on-read, lifecycle conservation and bounded admission. Runtime/API continue using JavaScript numbers; this is not certification of exact runtime arithmetic everywhere.

## Confirmed remaining membership-scoping defect

Executable regression: `foreign cross-linked JSON cannot enter own register or block own Category deletion` in `tests/functional/categories/decimalStringStorage.spec.ts`.

1. Create separate owning and foreign Budgets in the authorized test database.
2. Seed a foreign type3 Transaction with a string allocation referencing the owning Budget's Category, plus its own opposite-signed Category allocation. This malformed relationship is inserted as a test fixture; supported submission authorization is not bypassed in production.
3. Request the owning Category register. It correctly returns no Transactions and count0.
4. DELETE the owning Category. **Actual409; required tenant-local result204.** Foreign Transaction content improperly controls the owning Category's deletion admission.

Root cause: `CategoriesController.deleteCategory` authorizes the Category and acquires its Budget gate, but its membership query scans `transactions` with only `deleted=false` and the allocation predicate. It omits the owning `application_id` filter. The new typed numeric/string predicate did not introduce this omission: HEAD's preceding JSON-path query also omitted it. Nevertheless, the requested Budget-scoping acceptance is not satisfied.

This is a conditional cross-tenant admission interference, not evidence that supported CREATE permits cross-linked allocations or that private Category metadata is exposed. The tested register/count and foreign GET/submit security assertions pass.

**Smallest proposed runtime correction, not implemented:** add `.where('application_id', user.budgetId)` to that transaction membership query, keeping the existing owning transaction, Budget gate, deleted filter and typed predicate. Rerun the failing regression, the 49 storage/SQL cases, broader focused regressions and full suite before approval. No extra lock/schema/history change is needed. Do not weaken the test or add relational fallback.

## Test-only corrections and expectation review

- Shared prepared fixture now supplies required Account subtype `checking`.
- Manual HTTP URLs use the existing singular `/api/v1/account/...` route.
- Missing raw query row uses Lucid's `null` contract rather than `undefined`.
- Historical/malformed report fixtures use `writeHistoricalTransactionFixture` and the guarded raw driver instead of an unbound model allocation mutation that intentionally fails the new writer contract. Production requests remain subject to conservation and authorization.
- Raw persistence expectations now assert encoded strings; runtime assertions use canonical numeric values. Funding History expected sums use individually converted integer cents rather than binary subtraction artifacts.
- The current calculator's residual nonconserving and absent-Pool zero-funding shapes explicitly expect422 and unchanged state, per approved policies. No remainder is redistributed and no Pool is invented.
- Amount-only edits that would invalidate nominal conservation explicitly expect422 and unchanged linked amount/balances. Conserving Category-only edits and metadata-only historical saves retain their successful contracts.
- Concurrency instrumentation recognizes the typed `jsonb_array_elements` predicate and the required-Pool preflight read. Budget ownership/binding and financial outcomes remain asserted.

Earlier failed exploratory runs are retained in the table below; they are not acceptance passes. No production behavior or deprecated functionality was changed to satisfy tests.

## Exact results and verification limits

| Run | Passed | Failed | Skipped/pending |
|---|---:|---:|---:|
| Inert safeguards |27|0|0|
| Prepared40 before fixture fix |0|40|0|
| Prepared40 after subtype fix |28|12|0|
| Prepared40 after URL fix |38|2|0|
| First broader focused run |247|51|0|
| Updated broader focused run |297|1|0|
| Expanded concurrency characterization |361|3|0|
| Expanded focused gate (before final security addition) |364|0|0|
| **Final narrow gate including security addition** |**49**|**1**|**0**|
| Pure codec/storage tests |44|0|0|
| Complete automated suite |Not run|Not run|Not run|

The full suite was deliberately not started: final focused acceptance fails. Full-suite/remaining provider/client/deprecation/Statement regression acceptance is therefore still pending, not implicitly certified by earlier records. Existing accepted PostgreSQL records supply baseline context, not substitute results for this implementation.

Both TypeScript checks, ESLint, Knip, circular regression and standard/staged diff checks pass. Circular analysis reports the accepted11-model/26-edge component and no unexpected cycle (432 analyzed files). Server/client builds were deferred with full acceptance after the final security failure; no new build success is claimed here.

Warnings: occupied Vite HMR port24678 (HTTP3349 tests still ran); existing pg concurrent-query deprecation; expected injected500/validation422/not-found404 logs. No unexpected deadlock or lock timeout was observed in the passing focused selection. Query coverage includes the existing report EXPLAIN sanity assertions, not a production-scale benchmark. Batched model classification adds scoped link/Category lookups; no N+1/schema optimization was introduced.

## Files changed during verification and final Git status

Existing production implementation and index preserved. Verification-only edits/additions, all unstaged:

- `tests/functional/categories/decimalStringStorage.spec.ts` — fixture corrections, malformed-fixture isolation, nine SQL/report cases and failing tenant-boundary regression.
- `tests/helpers/historicalTransactionFixture.ts` — guarded historical fixture writer.
- `tests/functional/concurrency/categoryPoolWriters.spec.ts` — updated observation of required-Pool reads/typed membership SQL.
- `tests/functional/funding/previewSubmission.spec.ts` — approved storage/conservation expectations.
- `tests/functional/funding/replacementAdmission.spec.ts` — historical raw fixture setup.
- `tests/functional/reports/allocationAuthority.spec.ts` — historical raw fixtures; existing report assertions retained.
- `tests/functional/reports/incomeFanout.spec.ts` — historical raw fixtures; existing report assertions retained.
- `tests/functional/transactions/eligibility.spec.ts` — atomic nonconserving amount-edit rejection assertions.
- `docs/transaction-category-decimal-string-implementation.md` — current verification status.
- This verification record.

Final index: empty. Tracked working-tree changes:26 files (original20 plus six test files). Relevant untracked implementation/verification files:9 (original seven plus fixture helper and this record); unrelated untracked files remain as initially found. The original production files' fingerprints match; no index mutation or commit occurred. Logs and fingerprints reside under `/tmp/decimal-*` and are not staged.

All destructive SQL used only the authorized test database and independently guarded setup/cleanup. Authorization is now expired at task completion. No historical Transaction conversion, historical repair, unrelated monetary representation change, application schema migration, deployment or commit occurred.
