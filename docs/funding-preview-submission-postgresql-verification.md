# Funding preview/submission PostgreSQL verification

## Baseline and scope

Verified against HEAD `7ebc714939c88b6d8ef7bc00aebbe2d1bc10d3a4` with the existing uncommitted funding implementation preserved. Accepted Budget serialization, OFX accounting/provider authority, BalanceHistory deprecation and ordinary eligibility/startDate corrections are present. No server, provider, common monetary type, schema or migration source changed in this task. Unrelated local files and staged state were preserved.

The correction makes preview use the existing submission algorithm. It does not make submission adopt the former recursive preview. The product invariant applies to identical inputs/state; it is not a frozen-quote contract.

## Database authorization and safeguards

The sole authorized destructive target was `localhost:5432/spendcraft_test`. Reviewed current `tests/helpers/databaseSafety.ts`, bootstrap, pg/pgLog configuration, returned cleanup and funding fixture/temporary-constraint cleanup before testing. All 27 standalone inert safeguard tests passed before any live database operation. No test-infrastructure change was necessary.

Both pg and pgLog independently reported configured host `localhost`, port `5432`, database `spendcraft_test`. Live identity for each reported database `spendcraft_test`, port `5432`, server `::1/128`, peer `::1/128`. These are positive loopback identities. Credentials are deliberately omitted.

Immediately before every destructive SQL statement, the installed Knex driver guard independently rechecked configured/live pg and pgLog and identified the actual execution connection. Transaction clients inherit the interception. Bootstrap explicitly verified before setup; returned teardown independently verified again before cleanup while interception remained installed. Existing ORM fixture deletions, group truncation, temporary constraints and their removal all pass through this guard. The new funding file has no destructive raw SQL or independent cleanup connection. Source audit found no direct pg Client/Pool bypass in tests. Setup authorization was never reused as a substitute for cleanup verification.

## Original defect and submission compatibility

The historical recursive fixture still reproduces preview `3` against original submission `2`: Pool10; three Categories requested1 each; A funded by Pool and includes transfers, B funded by A and includes transfers, C funded by B and excludes transfers. The corrected real dialog previews Pool withdrawal `2`, Available Funds `8`; the real endpoint persists Pool withdrawal `2`.

Ordered rows are A+2, B+2, C+1, Pool−2, A−2, B−1. Net Category effects are A0, B+1, C+1. Requested baseAmount remains1 on each destination. JSON metadata/order and response effects are asserted, with no AccountTransaction or Account effect.

A separate non-DB compatibility experiment executed the original HEAD's actual submit-handler AST against the current calculation for 1,000 deterministic transfer/sign cases. Every complete submitted JSON row array matched. This experiment is additional evidence, not added to automated-suite counts. Production server posting is unchanged.

## One economic calculation and client boundaries

`calculateFunding.ts` contains the original spread and ordered transfer expansion once. The dialog totals, availability, Category projection and submit handler consume that deterministic calculation. Rendering may invoke the pure function more than once; there is no alternate recursion or second economic algorithm. It creates fresh rows and preserves input values. Tests execute actual dialog JSX/submit callbacks, Category JSX and real bundled State/cache methods with inert UI/network adapters; functional tests send those calculated rows through the real authenticated API. This is cross-layer coverage, not a claim of a browser automation session.

Successful State updates use returned balances/Transaction; rejected responses do not optimistically change caches or close/mutate the form. The server still authorizes references, validates percentages and its existing rounded zero-sum condition, and atomically posts supplied instructions. An unbalanced fixed-only request rejects without any Transaction or Category/Pool change.

## Rule and persistence matrix

| Case | Verified behavior |
| --- | --- |
| No transfer / fixed | Preview rows equal persisted JSON and net effects; fixed source is capped by requested amount as before |
| Percentage / residual | Existing scaled rounding and residual recipient retained; preview/response/persistence agree at their respective existing boundaries |
| Goal | Real proposed-funding GET returns60 for target120, April goal, March funding and recurrence3; that requested base is submitted unchanged |
| Mixed / mixed goal | Fixed plus percentage sources, including a goal-derived base, retain complete row and Pool/Category equality |
| Transfer-inclusive | Requested base, gross allocation, funder debit and net effect asserted separately |
| Duplicate sources | Source Map aggregation and meaningful duplicate destination/funder Category IDs retained; no JSON normalization |
| Low Pool | Pool1 can post withdrawal2 and become−1 under the existing server policy; preview shows it, without introducing a Pool cap |
| Negative / zero | Existing supported signs retain identical calculated/posting semantics |
| Accountless | No Account linkage or balance change; accepted funding/rebalance regressions show no Account.startDate eligibility leak |

Raw query-builder reads verify persisted Transaction JSON and numeric Category/Pool values independently of ORM hydration. Relational balance storage retains scale two; request/JSON/response numbers retain current JS behavior.

The transfer fixture retains gross `0.30000000000000004`, baseAmount `0.1`, Pool debit `0.3`, source debit `0.2`. The response net can be `0.10000000000000003` while the database stores `0.10`. The initial prepared assertion incorrectly demanded the rounded DB value from the unrounded response. Only that test expectation was corrected: response arithmetic and persisted scale are now asserted independently. No production rounding or representation fix was made or concealed.

Fixed tie ordering remains the original comparator: the characterized two-fixed-source example awards the amount to the second source. Intent is still unresolved. Positive/negative half rounding and existing 14 rounding regressions pass unchanged.

## Replacement and stale forms

Existing type2 replacement reverses old rows before adding new rows. Tests assert nominal Total versus additional Pool withdrawal and current available balance. Moving a February record into March uses the March-start Category snapshot with its old effect removed once; same/later-month snapshots do not subtract it twice. Unchanged replacement has no duplicate financial effect; changed replacement posts only the net difference.

Explicit stale-form test calculates rows, then changes Category balance, Pool balance and funding configuration. The existing instructions still post unchanged, adding2 to fresh Category5 and subtracting2 from fresh Pool20, yielding7 and18. No goal recomputation, quote/version/freshness mechanism or rejection policy was introduced. Same-state cases perform no intervening financial mutation.

## Concurrency, rollback and regression isolation

Deterministic barriers hold a Category save after Budget acquisition and confirm the other request is blocked on the actual PostgreSQL Budget lock. Funding/funding composes Category+3 and Pool−3. Funding/rebalance preserves both Category effects. A forced late rollback releases the waiter, which reads the authoritative pre-owner state; no failed Transaction or balance remains. Different-Budget funding progresses while another Budget gate is held. The owning transaction is checked in the interception. No timing sleep is the primary synchronization mechanism.

Accepted ordinary eligibility/startDate, OFX, shared Account-writer concurrency, BalanceHistory deprecation, Statements, initialization, rebalance, Plaid, Loans, tenant/reference security and reports run as focused regressions. No production semantics were changed during verification. Known generic replacement-target scope and legacy CategoryTransfer DELETE issues remain separate; no new guard or historical inference was added.

## Remaining monetary boundaries

| Value | Classification | Existing representation |
| --- | --- | --- |
| Fixed source amount | Posted-money configuration | JS/JSON number |
| Gross destination and negative funder splits | POSTED ACCOUNTING MONEY | JS arithmetic and JSON numbers |
| Category/Pool balance | POSTED ACCOUNTING MONEY | numeric(12,2), ORM parseFloat, JS delta addition |
| Spread, residual, goal/monthly arithmetic | CALCULATION INTERMEDIATE | JS numbers, Math.round and SQL sums hydrated with parseFloat |
| Source percentage | PERCENTAGE/RATE | JS/JSON number; not money |
| baseAmount | SNAPSHOT/METADATA | Requested/pre-transfer number, distinct from gross/net money |
| Pool demand and available balance | CALCULATION INTERMEDIATE | Reduction/projection of posted numeric effects |

These are inputs to the later storage/API inventory. Binary artifacts, priority policy and permissible snapshot precision are deliberately not resolved here.

## Results and completion

All 21 functional funding cases passed. Final core run, including actual client preview/submit/cache and existing rounding tests: **113 passed, 0 failed, 0 skipped/pending**. It recorded **1,104 independent checks / 1,101 guarded SQL operations**. Final focused acceptance: **1,086 passed, 0 failed, 0 skipped/pending**, with **55,005 independent checks / 55,002 guarded SQL operations**. Raw-persistence assertions were additionally rerun in the final core before full-suite execution. Earlier intermediate runs are not added to these counts.

Only after focused acceptance passed, the complete suite ran: **1,428 passed, 0 failed, 0 skipped/pending**. Its new bootstrap positively reverified both configured/live connections before setup. It recorded **57,625 independent checks / 57,622 guarded SQL operations**, including independently protected returned cleanup. Existing migrations were already up to date. No application migration or schema change was created/applied. Existing temporary test constraints/extensions and their cleanup remained guarded.

Both TypeScript checks, ESLint, Knip, circular regression, server build, separate client build, working-tree diff check and staged diff check passed after final code/test state. Circular analysis retains only the accepted 11-model/26-edge component. Warnings: occupied Vite HMR port24678 during tests and the established >500kB client chunk advisory (App about1,030.75kB before gzip). Expected injected-error/validation logs exercised rollback/rejection; no unexplained failed test,40P01 deadlock or unexpected lock timeout occurred.

Verification changes are restricted to strengthening `tests/functional/funding/previewSubmission.spec.ts` and the three current-status documents plus this record. The preserved implementation already changes only the four Funding client files, related client tests and historical recursion fixture described in the correction document. No additional production or database-safety correction was needed.

Every destructive operation used only the authorized localhost:5432/spendcraft_test, with setup and every cleanup independently safeguarded. Verification is complete; **this task-specific database authorization is now expired** and cannot be reused for another correctness or representation task. No historical funding repair, exact-money/MinorUnits migration, monetary representation or general rounding-policy change, funding-priority correction, schema migration, deployment or commit occurred.

FUNDING PREVIEW/SUBMISSION CORRECTION ACCEPTED — READY FOR NEXT CORRECTNESS TASK
