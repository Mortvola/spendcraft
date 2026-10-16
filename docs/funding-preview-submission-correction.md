# Type-2 funding preview/submission correction

## Status and baseline

**PostgreSQL verified:** 1,086 focused / 1,428 full-suite tests passed, 0 failed, 0 skipped/pending. The original3/2 case now previews2/posts2; submission semantics remain unchanged. See [authorized verification](funding-preview-submission-postgresql-verification.md) for safety, raw persistence, rule/replacement/stale-form matrices and counts. Task-specific database authorization is expired. The implementation-phase chronology below is retained as evidence.

Implemented against HEAD `7ebc714939c88b6d8ef7bc00aebbe2d1bc10d3a4`. The tracked tree was clean. Its committed delta from 9c6635 contains the accepted ordinary eligibility/startDate correction and verification records; accepted Budget serialization, OFX authority and BalanceHistory runtime deprecation are present. Existing unrelated untracked local files remain untouched.

This is a forward client calculation/display correction. No server posting algorithm, monetary representation, rounding, priority, type-3 behavior, provider, Loan, schema, historical data or API contract was changed. During implementation PostgreSQL cases were prepared only and no DB connection/destructive operation occurred. The prior accepted full-suite baseline was 1,382; the subsequent authorized verification record provides current results.

## Product invariant and implementation decision

For identical funding inputs and financial state, preview must describe the effects submission posts. This includes Pool demand, each Category's net effect, ordered destination/funder rows, requested base snapshots, source configuration and transfer flags, not merely a coincidentally equal grand total.

The current submission algorithm is retained. Preview now reads that same calculation rather than a recursive alternative. No unresolved stale-quote, cyclic-closure or fixed-priority choice is needed to make this bounded correction: none of those posting policies is changed. This is a pure number calculation returning fresh rows, not a persisted/frozen/authorized quote protocol, event model or exact-money architecture.

## Source-specific flow map

1. Entry points are Categories/Home and CategoryViewToolbar “Fund,” plus Transactions/TrxDialog editing a type2 row. Type3 uses its separate RebalanceDialog. Category/group configuration UI and `FundingPlanController.updateOrCreateCategory`, `CategoriesController.addCategory/updateCategory` store fundingAmount, fundingCategories, includeFundingTransfers, recurrence, goalDate/useGoal and suspension under existing ownership/validation rules. `CategorySpread` lets users edit ordered fixed/percentage source rows; percentage validation remains shared with the server.
2. `GET /api/v1/funding-plans/proposed?date=...` → `FundingPlanController.getProposed` → `Budget.getProposedFunding`. This supplies requested base amounts, not complete posting splits. Fixed/non-goal funding uses fundingAmount. The goal branch uses Category.balance, future active Transaction JSON sums, goal date, recurrence and selected funding month, and rounds its monthly result as before.
3. `FundingDialog.getProposed` maps these values to editable form categories, excludes AccountTransfer/Unassigned destinations and defaults empty source configuration to 100% of the Category's Funding Pool. On date changes the current UI refreshes base values; existing form configuration/override behavior is unchanged. Editing an existing funding Transaction restores baseAmount (falling back to amount), source rules and transfer flags, plus zero entries for newly available Categories.
4. `Funding.tsx` gets date-based initial/historical figures from `GET /api/v1/categories?date=...`; `CategoriesController.get` aggregates current/before-month and previous-period amounts/base snapshots. FundingItem's editable field is requested base; the initialAmount basis and historical figures are not redesigned here.
5. `calculateFunding.ts` contains the former computeSpread and handleSubmit calculation. It generates ordered gross destination rows followed by grouped negative funder rows. Both live Pool preview and Category projected Balance use `fundingCategoryEffect` over those rows.
6. `FundingDialog.handleSubmit` consumes exactly those calculated rows: CREATE → `State.Register.addCategoryTransfer`; edit → `State.Transaction.updateCategoryTransfer`. They POST/PATCH `/api/v1/category-transfer` with type2, date and numeric splits/metadata. They do not rerun the goal algorithm.
7. `CategoriesController.transfer` owns actual posting. It acquires Budget FOR UPDATE, resolves the scoped target/references, validates source percentages and the current rounded zero-sum contract, persists supplied JSON rows and applies grouped new-minus-old Category deltas through the owning transaction. It does not recompute allocations from configuration, goals or current Pool balance. No AccountTransaction or Account.startDate context belongs to type2.
8. Successful response returns the serialized Transaction and authoritative Category balances. Register/Transaction update caches only on accepted response. Existing rejection behavior remains. Modern deletion uses `State.Transaction.delete` → `TransactionsController.delete`, reversing its accountless nominal splits. The separate legacy CategoryTransfer DELETE route and the known generic replacement-target scope issue are separate deferred work, not changed here.

Configuration and base proposals are server-side; spread/transfer expansion is client-side; validation exists on both sides. Posting is server-side. The duplicated *economic* algorithms were recursive client preview versus ordered client submission, not a second server recomputation.

## Terminology and persisted authority

| Term | Meaning in current source | Persisted/submitted counterpart |
| --- | --- | --- |
| Requested/base | User-editable pre-transfer funding amount, initially server proposed | destination row baseAmount; not automatically net or gross |
| Fixed rule | Currency amount requested from one source, capped by remaining requested amount in computeSpread | fundingCategories entry amount with percentage=false |
| Percentage rule | Percentage of the post-fixed remainder, not a percentage of Pool balance | fundingCategories entry amount with percentage=true |
| Goal allocation | Server-calculated requested monthly base from remaining goal/time | becomes baseAmount; the downstream spread is the same as other bases |
| Transfer amount | A destination's contribution to another destination as funding source | aggregated negative funder row for that source Category |
| Gross allocation | Requested amount plus transfer compensation observed during the existing ordered pass when includeFundingTransfers=true | positive or signed destination row amount |
| Net Category effect | Sum of every submitted row with that Category ID, including destination and funder rows | actual grouped Category.balance delta; replacement subtracts prior rows first |
| Pool withdrawal/demand | Negative of the proposed record's net Pool effect | negative funder row(s) for Pool; UI Total displays the nominal record total |
| Additional Pool withdrawal | On replacement, old Pool effect minus new Pool effect; negative means return | actual incremental debit after reversing the old record |
| Available Funds | Current cached Pool balance plus new Pool effect minus old record Pool effect | projection, not a server-enforced availability cap |
| Residual | Difference between post-fixed scaled amount and rounded percentage allocations | added to final processed percentage source; no new Unassigned policy |
| baseAmount snapshot | Requested pre-transfer base, distinct from gross and net effects | metadata in Transaction.categories JSON; used by edit/history reporting |
| Type-2 Transaction amount | No independent account-linked amount is posted | type2/date/ordered JSON categories; AccountTransaction absent |

A Category may appear both as a destination and as a grouped funder. Such duplicate IDs are meaningful; the JSON is not normalized/reordered. Multiple source entries with the same ID aggregate in computeSpread's Map. Comments/other existing API metadata retain their current server path.

## Reproduction and first divergence

Both old functions were executed directly from the pre-edit production AST with inert register/modal adapters, before runtime edits. No app/DB bootstrap was used.

Unchanged inputs: Pool 99 balance 10; Categories 10/20/30 balances 0; requested bases 1 each;10 is funded 100% by Pool 99 and includes transfers;20 is funded 100% by10 and includes transfers;30 is funded 100% by20 and excludes transfers. Object.keys processes numeric IDs10,20,30 in ascending order.

| Step | Former recursive preview | Existing submission, retained |
| --- | --- | --- |
| Initial source demand | Recursively asks how much Category 10 funds | First base pass: Pool 100 cents,10→100,20→100 |
| Category 20 | Its base 1 plus downstream30 demand 1 = gross2 | Still base 1 when10 is processed |
| Category 10 | Its base 1 plus recursively expanded20 demand 2 = gross3 | Subtract old Pool 100; incoming10 demand currently100; gross10 becomes2; add Pool 200 |
| Later pass | No equivalent ordered partial state | Process20: subtract old10 demand 100; incoming20 demand 100; gross20 becomes2; add10 demand 200 |
| Result | Pool demand 3 | Gross rows2,2,1; funder rows Pool −2,10−2,20−1; Pool demand 2 |

The **first divergence** is preview's fully expanded downstream demand 2 for Category 20 versus submission's still-unexpanded demand 1 when Category 10 is processed. It is neither stale state nor a rounding tie. Old preview 3 could also recurse indefinitely for cycles while submission always made a finite pass.

After correction: preview Pool demand 2, available 8, submitted Pool −2; net Category effects10→0,20→1,30→1. All submitted fields retain the original algorithm. Tests preserve the old recursive preview as a clearly isolated test-only fixture, proving the historical 3 while asserting corrected 2. Reversing dependency ID order retains the corresponding current ordered result; no topological/recursive posting redesign is introduced.

## Correction and equality boundary

`client-src/Funding/calculateFunding.ts` extracts the existing spread and submission calculation, retaining numeric key order, Map insertion order, comparator, intermediate operations, signs and metadata. It does not mutate form values. The dialog's Total/Available Funds and actual submit handler consume it. FundingItem now projects its existing month-start initialAmount plus **net** new record effect rather than requested base. Funding edit dates are immutable. The date-based month-start initialAmount already excludes the existing same-month record, so the projection adds only the proposed net effect. Cross-month replacement compensation and its Transaction prop plumbing have been removed. Its editable label is “Requested,” clarifying that input is not a net/gross posting total.

For the same form inputs, date and Pool identity, the calculated ordered rows used for preview are value-identical to those submitted, including categoryId, amount, baseAmount, fundingCategories, includeFundingTransfers and funder flags. The same function is evaluated as needed; there is no new mutable/frozen proposal store. The Category projection includes both destination and funder rows in posting order. Currency formatting and existing numeric(12,2) storage rounding remain existing boundaries; floating JSON artifacts are not corrected or falsely certified exact.

Editing also exposed a previously incorrect Available Funds projection: current Pool already includes the old funding debit, so subtracting the new nominal demand again double-counted it. Available now includes old-record reversal. Total retains its existing nominal record meaning, and editing shows “Additional Pool withdrawal” explicitly. For current Pool8 with old debit2 and unchanged replacement debit2, Total is2, additional withdrawal0 and Available8. Replacing with debit3 yields Total3, additional1 and Available7. These intentional nominal-versus-incremental fields match server new-minus-old effects; no new posting semantics are chosen.

A separate deterministic pre/post experiment compared1,000 original AST submit payloads with the extracted calculation, including signed bases, fixed/percentage mixtures, cross-funding and cycles. Every ordered JSON payload matched. Existing rounding expectations were retained, not weakened to remove a discrepancy.

## Unchanged rounding, transfer and priority behavior

computeSpread still scales request by 100 with Math.round, applies fixed sources before percentages, caps fixed draws at remaining request, rounds percentage multiplication, adjusts the final processed percentage residual, groups source IDs and divides by 100 for funder rows. Positive half 0.005 becomes 1 scaled unit; negative half −0.005 becomes −0 and creates no nonzero funder entry. Existing signed residual scenarios remain covered.

The comparator still ignores its second argument: `sort((a) => a.percentage ? 1 : -1)`. The characterized two-fixed-source case awards the available 1 to the second source. This is current behavior, not an approved fixed tie-priority contract. No comparator, rule priority, array ordering or engine policy is corrected here.

Transfers still expand gross requested amounts using one pass over the accumulated current funder Map. A finite result for cyclic input is not certification of a mathematical cycle/closure policy. Fixed-only underfunding may leave nonzero splits; server validation still rejects it instead of inventing a residual allocation. Source percentages must retain existing validation. There is no new Pool clamp: insufficient Pool displays negative Available Funds and follows existing submission validation/posting policy.

Goal calculations remain in Budget.getProposedFunding: current monthly goal difference/time rounding, planned recurrence amount and adjustment metadata are unchanged. A real method-body pure test supplies goal 120, due April 2025, selected March, balance 0, recurrence 3: proposed 60 versus planned 40; both preview and submit use that base 60 without a second goal algorithm.

## Current conservation equations

For requested base r_i, the existing ordered pass produces gross destination g_i and accumulated scaled source draws f_j. Submitted rows are destination +g_i and grouped funder −f_j/100. The net effect for Category j is the sum of its destination rows minus its grouped source draw. Pool demand is minus the Pool's net effect, not the sum of requested bases or all gross destinations.

`validateTransactionSplits(0, categories)` requires the sum of individually Math.round(amount×100) rows to be 0. It does not require raw binary floating addition to be exactly 0. When the sources fully fund each requested/gross allocation, the posted nominal debits/credits conserve at this existing validation boundary. Fixed-only underfunding can fail it and remains rejected. During replacement, the server applies new nominal rows minus old nominal rows once per Category; replacement previews explicitly distinguish that delta from the nominal Total; repeated identical replacement has zero net effect. No availability cap, auto-adjustment, Unassigned remainder or stronger exact-arithmetic policy follows from these equations.

## Binary artifact and future representation inventory

The retained source operation `category.amount += sum / 100.0` can calculate `0.1 + 0.2 = 0.30000000000000004`. A test asserts that exact request value remains, with baseAmount 0.1, Pool−0.3 and Category 10 net approximately0.1. This is D12, separate from the preview algorithm defect D11. Current currency display/Category numeric storage can show/store two places while Transaction JSON preserves the longer number. No repair, new cent parser, string conversion or rounding policy is introduced.

| Value | Current representation/arithmetic | Inventory classification |
| --- | --- | --- |
| Category.fundingAmount, fixed source amount, goal target | numeric/JSON numeric; ORM parseFloat/JS number | monetary configuration/target, not itself a posting |
| Percentage source amount | JS/JSON number; existing exact percentage validation remains | percentage/rate, not currency |
| Goal difference, future sums, monthly calculation | SQL numeric aggregates hydrated with parseFloat; JS subtraction/division/Math.round | calculation intermediate → requested base |
| Form requested/baseAmount | existing number or transient input string parsed with parseFloat | requested calculation snapshot; stored JSON metadata may require precision distinct from posted money |
| Gross Category amount | JS floating addition, JSON number in submitted/stored splits | posted accounting split, may expose binary artifact |
| Scaled spread/funder/residual Map values | existing Math.round/add/subtract on JS numbers | calculation intermediates; not newly introduced MinorUnits types |
| Funder transfer amount | grouped scaled amount divided by 100, JSON number | signed posted accounting split |
| Pool demand / available | JS reduction/negation/addition, formatted by existing Amount | preview of posted effect / projected balance |
| Category.balance | numeric(12,2), ORM parseFloat, server grouped delta addition | surviving posted accounting balance |
| Recurrence, percentage flags, IDs/date | integer/boolean/identifier/date | not money |

baseAmount is not reversal authority. Its current validator is vine.number with no new strict cent contract; it must not be forced into the later posted-money representation solely because it is a number in funding JSON.

## Authority, stale state, security and concurrency

The server is authoritative for authorization, validation, atomic persistence and resulting balances. The submitted numeric splits are the current accounting instructions; initial configuration and balances seed a client-editable suggestion, not an immutable server quote. The server does not rederive the proposal. This fix adds no new trust in client monetary data: existing authenticated/scoped reference, percentage and conservation validation remain unchanged.

Current stale behavior is preserved. Goals/configuration can change after the suggestion is loaded; the edited form is still sent as provided, subject to current server validation. Changed Category/Pool balances are read freshly after the Budget gate and receive the submitted deltas, not stale absolute saves. There is no proposal version/ETag, guaranteed multi-read snapshot, reservation or stale-quote rejection. Date edits retain current asynchronous base refresh behavior. Deciding frozen/recomputed/rejected proposals is future product work, not necessary for equality under unchanged inputs/state.

Authoritative financial posting stays transaction→Budget gate→fresh scoped state→grouped sequential Category writes→commit/rollback. No server code, gate, API shape, Account.startDate eligibility, type3, provider or Loan behavior is changed. Editing/deleting old type2 rows remains the existing user-triggered lifecycle; nothing replays or repairs historical funding.

Known D13 generic replacement-target scope and legacy CategoryTransfer DELETE issues remain separate security/correctness work. They are not solved by a client preview correction, and no new target guard is silently added.

## Implementation-phase verification and PostgreSQL matrix

Non-DB checks execute actual JSX preview expressions, actual submit/create/update handlers, actual FundingItem projection, server goal method and real client State/cache boundaries with inert persistence/network adapters. The initial new cache assertion incorrectly expected raw API rows without existing client id/comment fields; it was corrected to assert those known cache fields as well. No production cache defect was suppressed. All original 14 rounding assertions remain, alongside configuration validation, residual, invalid fixed-only, sign, duplicate-source, cycle, binary-artifact, Pool availability and input-nonmutation tests.

`tests/functional/funding/previewSubmission.spec.ts` originally prepared 17 DB cases. Authorized verification strengthened this to 21: 12 same-state scenarios (including mixed goal and duplicate sources), stale form, server rejection, late failure, 3 ordered same-Budget contention/rollback cases, different-Budget independence and 2 replacement/date-boundary projections. Raw Transaction JSON and Category/Pool values are asserted. See the separate verification record for executed results.

| Area | Prepared assertions, subsequently exercised during verification |
| --- | --- |
| Same state | Known chain, fixed, percentages, goal GET base, mixed rules, residual, transfer artifact, negative/zero, low Pool: calculated row fields equal persisted type2 JSON; response balances and persisted Category/Pool effects match current storage scale; replacement now checks incremental Pool withdrawal at the original immutable date, and rejects a changed date; no Account linkage/effect; replacement does not double-post |
| Atomicity | Late Category/Pool failure rolls back Transaction and every touched balance |
| Concurrency | funding/funding and funding/rebalance wait on actual PostgreSQL Budget lock; waiter adds to fresh balances; failing owner rolls back and releases waiter; different Budgets progress independently |
| Client | Actual render, actual submit and real State success/rejection exercised now without DB; preserve existing response/cache behavior |
| Regressions | Retain accepted eligibility, OFX, Budget concurrency, BalanceHistory deprecation, Statements, rebalance, initialization and Loan suites for future authorized verification |
| Stale state | Existing submitted split instructions are retained; no unapproved recompute/reject protocol to test as a new contract |

The implementation stopped for fresh task-specific authorization only against localhost:5432/spendcraft_test. Subsequent verification uses current configured/live pg/pgLog and exact execution-connection safeguards independently for setup and every destructive statement/cleanup; no previous authorization was reused.

Final focused standalone run: **195 passed, 0 failed, 0 skipped/pending**. This includes the new preview/UI/submit cases, unchanged 14 rounding regressions, configuration/percentage validation, actual client State/cache success/rejection and accepted eligibility/OFX/concurrency/BalanceHistory-deprecation boundaries. The separate 1,000-case original/new submit comparison also passed. It is an experiment, not included in the 195 test count.

Both TypeScript projects, ESLint, Knip and circular regression passed. Server and separate client builds passed; only the established client chunk-size warning remains. Working-tree and staged diff checks passed. No PostgreSQL tests ran during implementation. The later task-specific authorized verification is recorded separately; implementation-phase results above are historical and are not the current verification status.

## Product decisions

None is required for this bounded same-state preview correction. Future stale-proposal policy, fixed tie priority, cycle accounting policy, Pool availability enforcement and exact representation remain separately unresolved; they are not silently activated here.

## Final source and change inventory

Production changes are limited to FundingDialog.tsx, Funding.tsx, FundingItem.tsx and new calculateFunding.ts. computeSpread and the ordered transfer expansion exist once in production, in calculateFunding.ts. Both dialog totals/availability, Category projections and submit consume that source; previous rows affect replacement projections only, exactly as server reversal requires. The old recursion remains only in tests/fixtures/funding/legacyPreview.ts. No server/provider/model/schema source was edited.

Tests: new unit/client/fundingPreview.spec.js, updated unit/client/fundingRounding.spec.js (same14 expectations, new source location), updated unit/client/financialState.spec.js, historical fixture and prepared functional/funding/previewSubmission.spec.ts. Documentation: this record plus accounting-invariants.md and post-f8af214-correctness-review.md. No unrelated working-tree or index work was discarded/staged.

All final non-DB verification passed. The accepted circular component remains11 models /26 internal edges. The separate client build retains the established >500kB bundle advisory only. Subsequent PostgreSQL verification is tracked in [the verification record](funding-preview-submission-postgresql-verification.md), including independent safeguards before every destructive operation. No historical funding repair, exact-money/MinorUnits, monetary representation/rounding-policy change, priority correction, schema migration, deployment or commit occurred.

## Subsequent invariant: funding edit date is immutable

**PostgreSQL-verified and accepted:**2 narrow prepared /1,098 focused /1,443 full-suite tests passed,0 failed,0 skipped/pending. See [dedicated immutable-date verification](immutable-funding-date-postgresql-verification.md). Authorization expired on completion. Implementation-phase pending statements below are historical.

Product direction after the verification above: an existing type-2 funding Transaction cannot change date during editing. FundingDialog disables its date field and sends the persisted date on replacement. CategoriesController.transfer checks the existing scoped Transaction after Budget acquisition and rejects a different date with422 before Category authorization/deltas or persistence. The check follows the existing Transaction type, so changing the request type cannot bypass it. New funding dates and type-3 rebalance semantics are unchanged.

The earlier cross-month replacement verification remains historical evidence of the previous behavior, not supported behavior under this invariant. Prepared replacement tests now retain the original date, reject a cross-month date change without financial mutation, then verify a same-date allocation replacement. Pure tests execute the client submit handler and the server rejection/rollback branch. At implementation completion these DB assertions had not been executed; the earlier1,428-test baseline did not certify this subsequent change. They are now covered by the separately authorized immutable-date verification linked above.

Review following the immutable-date invariant removed FundingItem's obsolete oldEffectInInitial calculation, the Transaction prop passed through Funding/FundingItem solely for that calculation, and three cross-month-movement tests. Same-date Category projections, old/new Pool reversal, immutable-date client/server enforcement and financial posting remain covered. The earlier PostgreSQL verification remains historical; no DB operation was performed for this cleanup.

Post-invariant cleanup verification:91 focused pure/client tests passed, both TypeScript checks, ESLint, Knip and circular regression passed, and server/separate client builds passed with the existing large-chunk advisory. Working-tree and staged diff checks passed. No PostgreSQL connection, DB-backed test or commit occurred; fresh authorization was required before the subsequent immutable-date DB verification above; that verification is now complete and its authorization is expired.
