# Loan settings UPDATE persistence investigation

## Status and baseline

**POSTGRESQL-VERIFIED AND ACCEPTED.** See [verification](loan-settings-update-persistence-postgresql-verification.md):32 narrow,1,277 focused and1,632 full-suite passes,0 failed,0 skipped/pending. No additional production correction was needed. The approved follow-up reuses the existing Budget gate and saves both models; see the implementation section below. The original investigation/blocker is retained as historical evidence.

Original characterization: HEAD `dcdf0d0e60bba52f1c8cd236a9631b034d5d6126`. The missing save is confirmed, but adding only Loan.save exposes a reproducible concurrent complete-settings update anomaly. Per the task's concurrency stop condition, no runtime change, new lock or SQL update was implemented. This is not a claim that the persistence defect is resolved.

Accepted Account-writer serialization, OFX authority, BalanceHistory runtime deprecation, eligibility/startDate, funding preview, immutable type2 date, replacement admission, CategoryTransfer DELETE removal and bounded Category/Pool correction remain present. Tracked tree/index were clean at investigation start; unrelated local files were preserved. No PostgreSQL connection or application/test DB bootstrap occurred. Previous database authorization is expired.

## Original endpoint and exact ordering — before correction

Authenticated PATCH `/api/v1/loans/:catId` maps to LoansController.update. The parameter is the associated Category ID, not the Loan primary key. The controller requires user, validates using updateLoan, begins a transaction, then:

1. Calls budgetLoans(user.budgetId,{client:trx}), filtering Loan through Category→Group→authorized Budget; filters categoryId and firstOrFail.
2. Calls loan.merge with startDate, startingBalance and rate.
3. Calls Loan.updateBalance, whose entire financial implementation is commented out: it neither saves nor recalculates anything.
4. Reads the associated Category through the transaction-bound Loan relationship.
5. Merges the validated name into Category and awaits Category.save.
6. Commits, then returns `{name:category.name, loan:await loan.getProps()}`.
7. On error, rolls back, logs the error and rethrows.

There is no Loan.save, Budget gate, row prelock, refresh or second authoritative Loan read. No Account lookup, Transaction creation, settings version increment or financial log write occurs. Category name is coupled because the routed legacy Loan is represented by its Category; it is that Category's display name that the endpoint returns. The declared Loan.name field is not assigned by this endpoint.

The existing actual-method test in remainingCorrectness.spec.js confirms accepted rate8/base200 leave persisted rate5/base100 while the Category becomes New. The owning/shared-user DB isolation tests currently explicitly characterize that missing persistence; they are historical defect evidence, not approval of losing edits. They were inspected, not run.

## Settings semantics and mutable fields

This is a flat, complete-field request despite HTTP PATCH; there is no settings JSON object or deep merge. All four fields are required. Loan.merge assigns exactly the three named Loan attributes while leaving other attributes alone.

| Role | Fields / current behavior |
| --- | --- |
| Loan settings | rate, startDate, startingBalance |
| Category | name, trimmed and at least one character |
| Account | None |
| Not updated | Loan.balance, Loan category/owner IDs, Account/Category balances, Pool, links, Statements, opening, provider observations, transaction/version/log state |
| Derived/read response | getProps currently returns `{balance:0,transactions:[]}`; it does not echo settings and is not a persistence acknowledgement |

Name-only intent requires resubmitting the current three settings; settings-only intent requires resubmitting current name. A name-only or settings-only partial payload fails validation before the transaction. A complete unchanged payload is a no-op in terms of dirty attributes; the current method still calls its no-op updateBalance, Category.save, commit and getProps. No new response architecture is proposed.

Actual validator tests characterize current behavior: omission of any field rejects; null settings reject; rate/startingBalance zero are accepted; false and empty string coerce to numeric0 for both numeric settings; object numeric input rejects; empty/null name and null date reject. Name is trimmed and date becomes Luxon DateTime. These are existing Vine semantics, not recommended validation changes. Unspecified model fields are not erased by merge.

## Original concurrency blocker: a save-only correction is insufficient

Both requests can hydrate the same Loan before either commits. A database transaction by itself does not serialize those reads. Category.save occurs later; even when it acquires a Category write lock, it does not refresh the already-loaded Loan. An unchanged name may not issue an UPDATE at all.

The installed Lucid save algorithm constructs UPDATE from `$dirty`, comparing model attributes with their hydration snapshot. It does not write every accepted request field.

| Step | Request A | Request B |
| --- | --- | --- |
| Both read | rate5, startingBalance100 | rate5, startingBalance100 |
| Complete accepted request | rate8, startingBalance100 | rate5, startingBalance200 |
| Dirty UPDATE payload with save-only fix | rate8 | starting_balance200 |
| Both saves commit | Final rate8, startingBalance200 | Neither complete requested settings set |

This hybrid occurs in either save order. In contrast, fresh serial A→B ends rate5/base200, and B→A ends rate8/base100. No serial ordering produces8/200. A complete accepted unchanged value can fail to restore the value changed by a concurrent request because it was not dirty against its old snapshot. Category name may reflect one request while settings reflect a hybrid.

The new inert characterization uses the installed Lucid BaseModel hydration, merge, `$dirty` and actual save implementation with a deliberately in-memory adapter. It opens no connection. It tests the proposed save-only algorithm, NOT a production persistence operation or PostgreSQL reproduction. Separate source assertions establish that the real endpoint has the stale-read ordering and no existing gate/reload. Together these prove why merely adding a save is unsafe for the complete-field contract.

A focused endpoint-local concurrency design is required before implementation. It must preserve atomic Category coupling and establish an authoritative settings update boundary; it should evaluate reuse of the existing Budget protocol versus a deliberately complete-field persistence operation without silently changing semantics. No option was selected or implemented, no lower-resource lock hierarchy was introduced, and no Loan financial recalculation is needed or approved. Current name-only Category renaming is a separate Category operation; it does not write Loan settings, and ordinary same-field last-write ordering is not itself proof of a new financial defect.

## Characterized atomicity, scope, response and client

The existing transaction is suitable for atomic persistence once concurrency is settled: scoped Loan query has client:trx and related Category inherits it. Future Loan.save must use that same transaction. Loan failure after Category save must roll back Category; the reverse order must likewise not commit one half. No response may succeed if persistence fails. The existing getProps placeholder is separate unresolved Loan support, not justification to implement interest/principal calculations.

Valid foreign/missing IDs resolve through the Category/Group Budget scope and firstOrFail (404). Validation precedes lookup, so malformed foreign requests can receive422 first; preserve that precedence. A missing associated Category cannot pass the scoped initial lookup; if removed after it, the related firstOrFail fails and rolls back. No separate caller-supplied Category ID can redirect the mutation after lookup.

Complete client-source search found no `/loans` request, LoanUpdateProps consumer or active settings editor/cache update path. Category.loan and LoanTransaction display structures remain, while ordinary Loan-type Account editing is a different endpoint/lifecycle. Client success/rejection settings-cache tests are therefore not applicable to current source; no UI or cache path was invented. Existing generic Category rename cache handling is unchanged.

## Characterization-stage nonfinancial and historical boundaries

No production change was made. Even a future persistence correction must not recalculate Loan.balance, Account.balance, Category.balance, Pool, Transactions, AccountTransactions, Statements, opening or provider balances. Previously lost requests cannot be reconstructed; old Loans remain untouched. Monetary settings use current JS/API numbers: startingBalance is money stored in numeric(12,2), hydrated by parseFloat; rate is a percentage/rate stored as double, not currency money. Loan.balance/principal/interest and other monetary boundaries belong to the later inventory, not this correction. No parsing, scale, rounding, schema or money representation change is proposed.

## Initial PostgreSQL preparation matrix — subsequently verified

The implementation prepared24 executable cases in tests/functional/loans/settingsPersistence.spec.ts and updated existing owner/shared isolation expectations. Subsequent authorized verification strengthened the file to32 passing cases; the preparation-stage matrix below is retained as history. The table records the required acceptance areas; exact24-case coverage is listed in the implementation section below. Do not run the existing app test bootstrap without fresh authorization for localhost:5432/spendcraft_test, independently safeguarding pg, pgLog and each destructive execution connection immediately before setup and every mutation/cleanup.

| Group | Required assertions |
| --- | --- |
| Fresh persistence | Complete settings change, discard request models, fresh raw query and subsequent GET agree on rate/date/starting_balance |
| Settings-only intent | Supply unchanged name; settings persist, Category name/balance unchanged |
| Category-only intent | Supply unchanged settings; name persists without changing settings |
| Combined / no-op | Both persist atomically; unchanged complete payload preserves data and existing response/log/version semantics |
| Validation | Four omitted fields, null, zero, false, empty numeric string and invalid object follow the characterized validator; rejects leave all rows unchanged |
| Atomicity | Force Loan save failure after Category save and Category failure after Loan save, using the approved future ordering/hooks; neither half commits |
| Noninterference | Raw Account/Category/Pool/Transaction/link/Statement/opening/provider snapshots unchanged except intended settings/name |
| Security | Foreign/missing Loan via Category ID, foreign Budget/Category and shared-Budget actor retain current scope/error precedence; missing associated Category rolls back |
| Deterministic update/update | Both hydrated old state under barriers; after chosen correction final complete settings/name must match a valid serial result; include unchanged-field reversion and no-op stale request |
| Rollback/waiter | Failed writer leaves no partial settings/name; retry or waiter follows approved fresh-state contract |
| Regression isolation | Accepted eligibility, Budget concurrency, OFX, history/legacy DELETE removal, funding/rebalance, Statements and initialization remain unchanged |

Existing isolation tests now expect the implemented settings persistence while retaining scope, placeholder and unchanged Loan.balance assertions. These updated assertions remain unexecuted pending fresh authorization. No new API fields, freshness protocol, historical repair or Loan accounting design is implied by this matrix.

## Original characterization verification — before implementation

Final focused source/pure/client selection: **236 passed,0 failed,0 skipped/pending**. This includes22 new Loan validator/Lucid/source cases and the strengthened existing missing-save reproduction (with a separately persisted inert Category-name snapshot). The initial narrow characterization selection passed25 cases. No app/DB bootstrap was used.

Both TypeScript checks, ESLint, Knip, circular regression, server build (including client assets) and standard/staged diff checks pass. Circular analysis retains only the accepted11-model/26-edge component,408 analyzed files. The initial test dynamic-delete lint violation was corrected with filtered entries, without suppression. Existing client chunk warning above500kB remains; no separate client production build was necessary because no client/shared production source changed. New files received explicit whitespace checks. No DB tests or full DB suite were run, and no fresh DB authorization is requested while the runtime correction is design-blocked.

Files changed: tests/unit/loanSettingsPersistence.spec.js (new), tests/unit/remainingCorrectness.spec.js (stronger existing inert assertion), this document, docs/post-reset-remaining-correctness-review.md and docs/post-f8af214-correctness-review.md. All production directories remain identical to HEAD; no index mutation, reset or commit occurred. No database connection or destructive operation, historical Loan repair, Loan financial redesign, Account/Category behavior change, exact-money/MinorUnits migration, monetary/schema change, deployment or commit occurred.


## Approved serialization and persistence implementation

Implemented at HEAD `dcdf0d0e60bba52f1c8cd236a9631b034d5d6126`, preserving prior uncommitted investigation/tests/docs and unrelated local files. Current production source matches the characterized missing-save path before this edit; no unexpected baseline divergence was found. Only LoansController.update changes; Loan model, validators, routes, client, shared types, migrations and other financial writers remain unchanged.

Current order:

1. Authenticate and validate the same complete four-field request before opening the transaction.
2. Bind user to the owning transaction and acquire its related Budget FOR UPDATE.
3. Freshly query authorized Loan via budgetLoans(...,{client:trx}); freshly query associated Category through Loan's transaction-bound relationship. There is no pre-gate Loan/Category instance.
4. Merge rate, startDate and startingBalance exactly as before; call the unchanged inert updateBalance; merge name into Category.
5. Await Loan.save, then Category.save on the SAME transaction; commit. Errors roll back and retain existing logging/rethrow behavior.
6. Return the unchanged `{name,loan:{balance:0,transactions:[]}}` placeholder response.

All four accepted values describe one complete coupled configuration request. A waiter loads the preceding committed settings/name only AFTER acquiring Budget, so Lucid can safely omit genuinely unchanged columns. In the known A8/100 versus B5/200 example, A→B now makes B's rate5 dirty against freshly read8, giving complete B5/200; B→A restores A's base100 against freshly read200, giving complete A8/100. Name and differing startDate follow the same request. The old8/200 synthetic state remains an inert regression illustrating why save-only was rejected, not an allowed runtime outcome.

The actual-method non-DB harness runs both controlled orders, prevents the waiter's Loan lookup before gate acquisition and asserts the complete name/rate/date/base result. It also verifies both saves precede commit, both failures roll back the coupled state, response remains unchanged and no-op requests remain supported. These are inert protocol proofs, not DB persistence/lock acceptance.

### Binding, lock order and isolation

User.useTransaction(trx) binds the owning Budget relation. Loan lookup explicitly uses client:trx; hydrated Loan.save retains that transaction. Loan.related(category).query inherits it, as does Category.save. No DB log/version write is introduced; existing error logger is unchanged. Both models are loaded after gate and before settings/name assignment. No mutable lower-resource write/lock precedes Budget; no new Loan/Category prelock, advisory lock, optimistic version or lock coordinator exists. Source comparison confirms only update changed; other Loan controller methods/model methods and all Account/Category balance writers are untouched.

The gate is per owning Budget, not global. Updates to different Loans in the same Budget intentionally serialize, as do settings updates versus existing gated financial writers. Different Budgets remain independent. The protected work is local reads/writes only; no network operation extends lock duration. Independently supported Category-name edits retain their existing lifecycle and can intentionally rename a Category; this correction's complete-state guarantee covers participating Loan requests, not an invented ban on separate renaming.

Category ownership/missing-resource checks remain scoped through Category→Group→Budget, now after the gate. Valid foreign/missing targets retain404; invalid bodies still fail validation first. No new public concurrency error or optional PATCH field is added. No active settings UI/client request/cache caller exists, so no client production change or invented cache path is needed.

### Atomicity and nonfinancial boundaries

The new Loan save persists only already-accepted settings. It does not implement updateBalance, alter Loan.balance, create financial Transactions, or change Account.balance, Category.balance, Pool, opening, Statements, links or provider balances. Loan and Category failures are inside the same existing transaction; a late failure must roll back both. Existing getProps remains a placeholder and is not repurposed to calculate or echo settings. Monetary inventory remains startingBalance/Loan.balance as current numeric money and rate as a double percentage/rate. Validator date/number parsing, negative/zero/coerced values and rounding remain unchanged. Historical lost requests cannot be recovered and are not repaired.

### Original prepared DB cases (24) — implementation-stage record

| Cases | Executable assertions |
| --- | --- |
| Complete persistence (8) | No-op; rate only; base only; date only; name only; all fields; zero; negative. Fresh independent raw Loan query/Category query and subsequent GET; unchanged raw financial snapshots include seeded Account/provider balance, Statement, opening/link, Pool, Category and logs |
| Known race, both orders (2) | Pause first real Loan.save inside owning transaction, observe waiter on applications FOR UPDATE via pg_blocking_pids, then release. Fresh final name/rate/date/base equals last complete request, never hybrid |
| Same Budget/different Loans (1) | Real Budget waiter, independent correct final settings for each Loan |
| Different Budgets (1) | Second request completes while first gate remains held |
| Rollback/waiter (1) | Fail first after Loan save; waiter acquires gate and persists complete state from authoritative original |
| Failure/retry (2) | Fail after Loan save or after Category save; raw rows unchanged; retry persists complete state |
| Binding (1) | Both model saves share same trx; its execution session holds applications RowShareLock from Budget FOR UPDATE |
| Settings vs funding (1) | Funding waits on settings owner, then posts only its expected Category/Pool delta; Account/Statement unchanged |
| Security (3) | Foreign, missing and Category-without-Loan targets404; raw state unchanged |
| Validation (4) | Null rate, invalid date, partial body, empty name422; raw state unchanged |

Tests use controlled hooks and lock observation, not arbitrary sleeps. Timeouts bound failed barriers; finally releases waiters/restores mocks. All fixture writes use existing Lucid/Knex guarded paths; no independent connection, direct cleanup helper, temporary DDL or unsafe teardown was added. Future execution requires fresh task-specific authorization and independent configured/live pg, pgLog and destructive-execution safeguards before EVERY operation/cleanup against localhost:5432/spendcraft_test. Existing accepted DB regression suites are to be run under that future authorization, not now. Current owner/shared Loan isolation assertions were updated from the historical unchanged-settings expectation to fresh persistence, while preserving financial noninterference.

### Files and non-DB verification

Runtime: app/Controllers/Http/LoansController.ts only. Tests: tests/unit/loanSettingsPersistence.spec.js, tests/unit/remainingCorrectness.spec.js, tests/functional/loans/settingsPersistence.spec.ts (new prepared file), tests/functional/loans/isolation.spec.ts. Documentation: this record and both correctness reviews. The prior investigation source/tests remain distinguishable in the working tree; no index mutation or unrelated file overwrite occurred.

Final focused pure/source/client selection: **246 passed,0 failed,0 skipped/pending**. Includes the actual-method Budget protocol, complete-state orderings, late rollback, unchanged response/no-op, installed Lucid stale-save characterization and current validator behavior (including negative values/numeric strings/invalid date). Both server/client TypeScript checks, ESLint, Knip, circular regression, server build including client assets and normal/staged diff checks pass. Circular analysis retains only the accepted11-model/26-edge component (409 analyzed files). Build retains the existing above500kB client chunk warning. No separate client build was required: no client/shared production code changed. New files receive explicit whitespace checks. No DB-backed tests or complete DB suite were run; prepared DB cases are not claimed passed. No PostgreSQL connection, DB-backed test, destructive setup/mutation/cleanup, historical Loan repair, Loan financial-semantics redesign, Account/Category balance behavior change, exact-money/MinorUnits migration, monetary representation change, schema migration, deployment or commit occurred. Previous DB authorization is expired.


## PostgreSQL acceptance follow-up

At the same HEAD dcdf0d0, authorized verification passed32 narrow,1,277 focused and1,632 full-suite tests,0 failed,0 skipped/pending. Fresh raw PostgreSQL queries and subsequent GET prove all settings/name persist. SQL observation confirms both real request execution connections follow gate→Loan read→Category read→Loan write→Category write→commit, with the waiter hydrating its predecessor's committed settings/name/date. Both known request orders, identical/original-value requests, same-Budget/different-Loan, different-Budget independence, rollback/waiter and coupled failure/retry pass. Financial snapshots and unchanged Loan financial methods prove bounded noninterference, not new certification of unresolved Loan accounting.

The initial24-case run passed20 and failed4 because invalid requests omitted JSON Accept and followed existing HTML redirects; fixed TEST headers only. Added8 cases and stronger SQL binding/freshness evidence. No runtime/safety fix was necessary. Both TS checks, lint, Knip, circular, server/client-asset build and diff checks pass; existing HMR, pg concurrency deprecation and large-chunk warnings remain. Raw starting_balance is string100.00, rate number5; no representation migration occurred. See the dedicated record for exact safeguard counters and matrices. Every destructive operation/cleanup used independently safeguarded localhost:5432/spendcraft_test only. Authorization is now expired. No historical repair, Loan financial redesign, Account/Category balance behavior, money/schema migration, deployment or commit occurred. Earlier no-DB/pending labels describe the implementation stages, superseded by this acceptance for configuration persistence only.
