# Immutable funding-date PostgreSQL verification

## Baseline and exact contract

Verification HEAD: `d4c374d17de861ad996d56ef3b0db6f10c05223f`. Preserved the existing uncommitted remaining-correctness review and its inert characterization test, plus unrelated untracked local files. The accepted concurrency, OFX authority, BalanceHistory deprecation, ordinary eligibility/startDate and funding preview corrections are present. This task verifies the subsequent immutable-date feature, not the remaining-review recommendations.

The implementation/design source is the “Subsequent invariant: funding edit date is immutable” section of [funding correction](funding-preview-submission-correction.md), its cleanup note, accounting-invariants section8, current client/unit tests and prepared Funding replacement projection cases. Comparing HEAD with7ebc714 confirms the server's only CategoriesController change is the Exception import and existing-type2 date check. Client hunks disable the date field and submit the persisted date; the remaining client calculation hunks belong to the separately accepted preview correction. Obsolete cross-month compensation/Transaction prop plumbing are absent in current source. No new feature semantics were inferred from this verification request.

| Operation / field | Current implemented contract |
| --- | --- |
| Funding CREATE | Unchanged: user may choose a supported date; request date is persisted. Creation defaults to current month and can load dated base suggestions |
| Type2 replacement | Existing persisted calendar date is immutable; same-date allocation/base/source edits remain allowed |
| API attempted date change | CC.transfer scopes/reloads target after Budget FOR UPDATE, compares existing date.toISODate with parsed request date.toISODate and throws422 before financial mutation |
| Client edit | Initial date comes from Transaction.date; input disabled; submit explicitly uses original date. A manipulated form date cannot override the request's persisted date |
| Request type | Server tests the stored Transaction type, so request type3 cannot bypass an existing type2 date restriction |
| Calculation/projection date | Spread/transfer calculation itself has no date argument. Normal edit form retains original date; Category snapshot is requested at the start of that original month |
| Goal/edit inputs | Edit restores stored baseAmount (fallback amount), source rows and transfer flags. It does not fetch/recompute a goal proposal for a different month. Creation's dated suggestion behavior is unchanged |
| Replacement effects | Server reverses old rows and applies new supplied rows once; Pool preview includes old-record reversal. Month-start Category basis already excludes the existing same-month row; no cross-month compensation needed |
| Type3 rebalance | Date changes remain allowed; no funding rule is imposed on stored type3 |
| DELETE | No date-rule change; existing accountless deletion soft-deletes/reverses its existing effects and retains nominal date/metadata |
| Response | Same-date success keeps existing response shape; changed-date API request returns422. Framework error body follows content negotiation; tests requesting its message explicitly accept JSON |

There was no contract ambiguity requiring a product decision. Canonical YYYY-MM-DD calendar values are the tested date contract; this task adds no ingress/date-format redesign.

## Safety before financial testing

The sole authorized destructive target was `localhost:5432/spendcraft_test`. Read current databaseSafety.ts, test bootstrap, config/database.ts, non-secret test target fields and all new/updated funding fixture/cleanup paths before connecting. The27 inert safeguard tests passed first, without app/DB bootstrap.

Both configured pg and pgLog: host localhost, port5432, database spendcraft_test. Independent live identities: database spendcraft_test, port5432, server `::1/128`, peer `::1/128`, positively verified loopback. No credential is recorded here. The actual destructive execution connection is independently identified before its SQL.

The existing test-only Knex prototype guard independently rechecks both configured/live targets and execution identity immediately before every destructive statement, including ORM fixture writes, direct cleanup, temporary DDL and later cleanup. Transaction clients inherit it. Bootstrap explicitly verifies immediately before setup; returned teardown explicitly verifies again, keeping per-statement interception installed through cleanup. No setup check is reused as cleanup authority. The added tests use guarded ORM/Knex only, no direct destructive raw SQL, no new temporary schema object and no separate pg connection. Raw queries for date/value snapshots, backend PID and PostgreSQL blockers are read-only. Existing temporary constraints and group truncation use the same guard. No safeguard/configuration change or target redirection was needed.

## Narrow gate and strengthened coverage

The initial abbreviated --tests filter matched no titles; that run reported NO TESTS EXECUTED, not a pass. Its safeguarded setup/cleanup completed (4 checks/1 guarded operation). The corrected exact --groups selection ran only prepared “Funding replacement projection”: **2 passed,0 failed,0 skipped/pending**, with108 independent checks/105 guarded operations. This preceded broader selections.

Those prepared cases create active accountless type2 at March1, reject an April replacement with422 and unchanged state, then replace at March1. Amount2 replacement leaves Pool8; amount3 leaves Pool7; Category becomes2/3 without duplicate application. The persisted date remains March1.

Test-only strengthening adds five rule cases, late replacement rollback, type3 isolation, three deterministic replacement contention cases, ownership and normal type2 DELETE. All new immutable-date fixtures use valid active accountless type2 targets. No deleted/unrelated target is treated as valid immutable-date acceptance data.

## Persistence, months, rules and client behavior

| Area | Verified assertions |
| --- | --- |
| CREATE isolation | Creates March17 as requested, not forced to month-start; type2, ordered JSON and base metadata persist; no Account amount/link is introduced |
| Same-date replacement | Retains March17, rows and metadata; no duplicate Category/Pool effect |
| Different-date replacement | April17 request rejects422; raw Transaction date/type/JSON and raw Category/Pool rows unchanged; request type2/type3 both rejected for stored funding target |
| Month-sensitive goals | Real March/April proposed GETs before posting produce different base demands (March60); edit retains original March base/month, rejects April movement and posts unchanged March rows |
| Fixed/percentage/mixed | Fixed-source ordering, percentage spread and mixed goal/fixed/percentage inputs retain same-date row equality and current arithmetic |
| Transfer/baseAmount | Requested base0.1 remains distinct from gross0.30000000000000004, negative funding-source row and net Category effect; JSON artifact deliberately retained |
| Projection | Real March-start GET excludes existing March record at current currency scale; net proposed Category effect produces expected persisted Category balance; Pool10 plus nominal Pool effect agrees with persisted Pool |
| Client | Actual FundingDialog JSX/initial values and captured submit callback show original March17, disabled input, March1 projection period and March17 request. Existing request-defense test also keeps March17/old date if form values are manipulated |
| Cache/rejection | Actual bundled State success/rejection tests retain authoritative balance updates, original request metadata and no optimistic mutation on failure; dialog rejection retains inputs/open state |
| DELETE isolation | Current valid accountless funding DELETE retains original date/JSON, soft-deletes, restores Category0 and Pool10; no HTTP DELETE redesign |
| Type3 isolation | March→April rebalance replacement succeeds with correct balances; new type2 creation can choose its own date independently |

Client checks execute real production component/handler/State bodies using inert UI/network adapters; functional checks use the real authenticated API and raw PostgreSQL queries. This is layered coverage, not browser automation. Type2 has no independent AccountTransaction.amount; the accounting amounts/base/source/transfer metadata are in Transaction.categories, and existing functional assertions verify no AccountTransaction linkage.

Normal edit initial values, displayed date, snapshot month and submitted date agree. Goal replacement does not intentionally regenerate a fresh goal quote. Existing stale-form tests retain submitted instructions while applying them to fresh current balances; no ETag, reservation, proposal versioning or frozen quote protocol was introduced.

## Rollback, contention and security

A fault after Pool.save during same-date replacement restores the entire original raw Transaction (date/JSON/metadata included), Category and Pool snapshots. No partially replaced row remains.

Deterministic Category-save barriers hold the first replacement after Budget acquisition. The second request is confirmed waiting on applications FOR UPDATE through pg_blocking_pids/pg_stat_activity, then released. Cases:

- replacement2→3 commits; waiting replacement reloads3 and posts4: final Category4/Pool6, one Transaction, original March17 date;
- first replacement rolls back; waiting replacement reloads2 and posts4: same final values, no failed-owner state;
- replacement2→3 plus waiting separate funding+1: final Category4/Pool6, two Transactions, original record still March17.

Existing funding/funding, funding/rebalance, rollback/waiter and different-Budget independence tests remain. Owning-transaction assertions are checked at the held save boundary; no lock protocol changes or arbitrary sleep barriers are introduced.

Foreign and nonexistent funding targets reject404 before date comparison or financial mutation and preserve raw snapshots. Existing category/reference/tenant security regressions remain. The known replacement target-admission defect is explicitly **not fixed or certified**: unrelated/deleted targets remain a separately planned issue. Existing remaining-review inert characterizations may run in the full suite to preserve that finding, not as evidence those shapes are supported funding targets.

## Test expectation corrections and isolation

No production correction was needed. Test changes only:

1. Older conservation and embedded-configuration cases expected type2 date movement; they now keep the original funding date, while type3 retains its date-change assertion. The first broad focused run stopped at1097 passed/1 failed because the configuration test still used the old date-change behavior; after correction its7-case group passed before the broad rerun. No full suite ran while that gate was failing.
2. Strengthened error-message assertions initially omitted Accept: application/json. Added explicit JSON negotiation;422 rejection already occurred. No public error contract was redesigned.
3. Transfer-inclusive month-start projection retained a tiny existing binary residual rather than exact zero. The assertion checks its current currency-scale result; request JSON still explicitly asserts0.30000000000000004. No rounding/precision normalization was added.

No funding/rebalance admission fix, priority change, historical repair, provider change, exact-money work or schema migration is included. The accepted Account/Category eligibility, OFX, BalanceHistory deprecation, Statements, initialization, Plaid, rebalance, Loan, report/security and shared concurrency slices are regression gates.

## Final results

- Narrow prepared immutable-date gate: **2 passed,0 failed,0 skipped/pending**;108 independent safeguard checks/105 guarded SQL operations.
- Strengthened core (date/rules/rollback/contention/client/cache/conservation): **138 passed,0 failed,0 skipped/pending**;2,408 checks/2,405 guarded operations. Later ownership/DELETE additions are included in focused/full results.
- Final focused acceptance: **1,098 passed,0 failed,0 skipped/pending**;55,687 checks/55,684 guarded operations. All applicable gates passed before full-suite execution.
- Complete suite: **1,443 passed,0 failed,0 skipped/pending**;58,307 checks/58,304 guarded operations, including independently protected returned cleanup. Full bootstrap independently reverified configured/live pg and pgLog before setup. Migrations were already up to date.

Counts are separate runs, not summed. The full run includes the pre-existing inert remaining-correctness tests, which still characterize the separate admission/legacy/Loan defects; passing them does not resolve those findings.

Both TypeScript projects, ESLint, Knip, circular regression, server build, separate client build and both working-tree/staged diff checks passed after final code/test state. Circular analysis retains the accepted11-model/26-edge component. Warnings: existing occupied test Vite HMR port24678 and >500kB client chunk advisory. Expected injected-failure/validation logs are asserted scenarios; no unexplained failure,40P01 deadlock or unexpected lock timeout occurred. No runtime change was needed; production-directory diff against HEAD is empty.

Changed for verification: functional/funding/previewSubmission.spec.ts (12 added cases), functional/categories/conservation.spec.ts and functional/funding/configuration.spec.ts (stale date expectations), unit/client/fundingPreview.spec.js (actual initial/display/projection/request-date assertion); this new record plus funding correction and the two requested correctness reviews. Existing staged/uncommitted/untracked work was preserved; no index mutation occurred.

Every destructive PostgreSQL operation used only authorized localhost:5432/spendcraft_test. Setup and every cleanup were independently safeguarded. Verification is complete and **task-specific authorization is now expired**; it cannot be reused for replacement admission, legacy DELETE, Category/Pool concurrency or monetary representation work. No funding/rebalance admission correction, historical funding repair, exact-money/MinorUnits migration, monetary representation/general rounding/funding-priority change, schema migration, deployment or commit occurred. Temporary test objects from existing regressions remained guarded; no application migration was added/applied.

IMMUTABLE FUNDING-DATE CHANGE ACCEPTED — READY FOR NEXT CORRECTNESS TASK
