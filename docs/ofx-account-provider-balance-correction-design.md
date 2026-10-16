# OFX accounting / provider balance correction design

Status: OFX product design APPROVED; OFX semantic implementation remains paused. Its bounded concurrency prerequisite is now PostgreSQL-accepted (214 focused / 1,256 full-suite tests); OFX semantic work has not resumed. See [implementation/blocker record](ofx-account-provider-balance-correction-implementation.md). The product rules are approved, but the cross-writer prerequisite needs a separately scoped correction. Baseline: `f8af21435e5279c810a0ab525fdc4a2e1040bf9b`. No PostgreSQL connection or DB-backed test was used. BalanceHistory correction/deprecation remains paused; exact-money/storage migration and field renaming remain deferred.

## Approved product decisions superseding design alternatives

The subsequent implementation request settles these points: valid ledger updates plaidBalance only; absent ledger leaves it unchanged and permits posting; supplied empty/malformed ledger fails atomically; no OFX BalanceHistory mutation is permitted; current pending mapping and FID/ACCTID/FITID matching remain; ambiguous existing logical matches fail before financial mutation; explicit allocations/remainder semantics remain; no removal by omission is added. No timestamp, rename, precision migration or historical repair is authorized. Opening maintenance must consume post-Transaction SpendCraft accounting balance, never ledger/provider balance. These rules supersede the earlier alternatives later in this document, which remain as design history.

The original smallest-change proposal to retain OFX history writes is explicitly REJECTED by this product decision. Both entry points currently share one such call in Account.processOfx; removing it would remove the coupling for both. Opening does not read BalanceHistory, so there is no dependency requiring history retention.

## Product authority and scope

Account.balance is SpendCraft current accounting balance. OFX can change it only by the net eligible effects of Transactions actually changed by that operation. Valid LEDGERBAL is an independent provider observation written to Account.plaidBalance / accounts.plaid_balance. It never directly replaces Account.balance. The two balances may differ; equality is neither a success condition nor a repair objective.

Design scope: currently supported credit-card OFX statement import for ordinary nonloan transaction-tracked Accounts, through HTTP and the operational command. Preserve Category allocations, identity, reporting evidence and supported posting semantics. Do not add bank/investment message support, Loan arithmetic, removal reconciliation, new schema, exact-money policy, provider timestamp infrastructure, or historical repair. Current code rejects Balances tracking but does not expressly reject Loan type; Loan routing needs the decision below before activation.

Evidence: [Account.processOfx](../app/Models/Account.ts:708), [HTTP upload](../app/Controllers/Http/AccountsController.ts:572), [OfxUpload command](../commands/OfxUpload.ts), [existing OFX tests](../tests/functional/accounts/ofxReimport.spec.ts), [command lifecycle tests](../tests/functional/commands/ofxLifecycle.spec.ts).

## Current entry points and transaction boundaries

| Step | HTTP `/api/v1/account/:acctId/ofx` | `ofx:upload` command |
|---|---|---|
| Input | Authenticated raw text upload; UI AccountsToolbar uses Http.fetch | File read through Drive, prompted username/Institution/Account |
| Scope | Prechecks Account ownership/tracking before transaction, reloads Account scoped to Budget afterward | Choices scoped through user's Budget/Institution, but actual Account.findBy(name) is global; duplicate names can select wrong Account |
| Gate | User bound to transaction; Budget FOR UPDATE, fresh Account lookup | Opens transaction after username; no Budget gate; User/Budget/selections use default connection; final Account bound to transaction |
| Posting | Both call Account.processOfx(data,budget,user); no separate posting implementation | Same helper, but Budget helper binding is not equivalent to HTTP |
| Success | Commit, no explicit success response body or updated balances | Commit, no financial response object |
| Failure | Helper error causes rollback and 500 errors with error.message; precheck failures outside catch; even missing-body 400 exception is caught as500 | Logs error.message and rolls back; catch does not rethrow/set an explicit failure result |

HTTP's existing gate serializes cooperating HTTP imports and gated writers. It does not serialize writers that never acquire the gate. Correcting the command's tenant resolution, transaction binding and participation in the existing import gate is a necessary local dependency, not a mandate to restore the abandoned universal locking architecture.

## Parser, identity and input behavior

The helper splits on double LF and processes `entities[1]`; a header-only body is currently a silent no-op. SGML is regex-converted to XML, then fast-xml-parser default parsing numerically coerces values. It finds a SIGNON message but implements only CREDITCARDMSGSRSV*/CCSTMTTRNRS/CCSTMTRS. No validation compares file CCACCTFROM against a separately stored OFX Account identity. The caller selects the destination Account. No new Account is created by import.

Each STMTTRN uses DTPOSTED's first eight characters parsed as yyyyMMdd, NAME, TRNAMT and provider identity `FID:ACCTID:FITID`. Query matching is scoped to the selected Account's AccountTransactions, by providerTransactionId, first row only; it does not filter provider or enforce uniqueness. AccountTransaction identity and owning Transaction identity survive reimport/restoration. There is no import cursor/token or file-level deduplication state.

Default XML numeric parsing can collapse `001` and `1` in identity components; concatenation therefore preserves the parsed composite, not necessarily original lexical OFX identity. There is no unique provider-ID constraint establishing a total match. Repeated identical FITIDs in one file can find the just-written row; conflicting duplicates become order-dependent successive modifications. Multiple existing matches are ambiguous. Do not implement delta changes by choosing a new identity format that silently duplicates old imported rows.

A safe supported correction must require unambiguous selected Account and existing match, and preflight malformed structure/required amount/date/identity before financial writes. Recommend rejecting ambiguous matches/conflicting repeated keys atomically; identical duplicates can be treated as replay once validated. Identifier preservation/compatibility policy needs explicit resolution before changing parser behavior. No new schema is required to detect multiple existing matches.

## Current LEDGERBAL defect and errors

Inside each supported statement, the code obtains statement.LEDGERBAL and immediately dereferences ledgerBalance.BALAMT. A missing aggregate throws before intended fallback. A supplied value is retained in a single variable; after all messages, `if (balance !== null) this.balance = balance; else this.balance += sum`. Thus zero, positive and negative ledger values replace accounting balance. No OFX assignment to plaidBalance exists. With multiple supported message blocks the last encountered ledger wins, independent of DTASOF.

Missing aggregate, empty aggregate, missing BALAMT, explicit null and malformed BALAMT are different states. Only exact null reaches the current incremental branch. Empty/missing BALAMT can yield undefined or another nonnumeric value assigned to this.balance and fail later. The parser does not provide a domain validation policy for malformed ledger, nonfinite amounts or unsupported currency. Missing BANKTRANLIST throws; absent STMTTRN is wrapped as `[undefined]` and then fails. A genuine ledger-only/empty-transaction upload therefore also needs a safe empty-list path. Do not confuse a missing list with a malformed present list.

Desired absent-ledger behavior is settled: post Transaction changes normally and leave plaidBalance unchanged. Malformed-present behavior remains a decision below. The smallest proposed policy is preflight rejection/rollback with a safe existing error envelope, not coercion into zero or partial posting.

Other current errors include invalid DTPOSTED slice/type, missing FI/FID/ACCTID/FITID, unsupported parsed root and invalid Transaction amount. Existing split validation can fail; persistence may reject nonnumeric/out-of-range data. HTTP uses general500 handling; command logs and rolls back. A correction should preserve the success shape and avoid broad transport redesign; provide safe validation failure messages without raw monetary evidence. Existing account not-found/foreign ownership behavior must remain nonmutating.

## Signed Account effects

Source sign: temporary transactionData.amount is `-t.TRNAMT`; stored AccountTransaction.amount is its negation, **equal to signed TRNAMT**. The normal Account delta is added to Account.balance. No client Account.sign or extra Credit negation belongs in server delta calculation.

For a supported ordinary state s:

`E(s) = s.amount` if its Transaction is active, its AccountTransaction is nonpending, and its Transaction date >= fresh Account.startDate; otherwise `E(s)=0`.

Capture old state before mutation. Missing old row has E=0. Compute each row's `delta = E(new) - E(old)` and accumulate the operation delta. Then set accounting balance from the fresh starting accounting balance plus that delta. This is a conceptual financial formula in current number representation, not a new DTO/MinorUnits layer.

| Operation | Old / new state | Desired Account delta | Current behavior |
|---|---|---|---|
| New | Missing → active new amount/date | E(new) | Raw new amount accumulated; then discarded if ledger supplied |
| Identical active replay | Same amount/date/pending | 0 | Raw amount difference0, but ledger still overwrites balance |
| Modify amount/date | Active old → active new | E(new)-E(old) | Raw new-old ignores both dates/pending |
| Restore | Deleted old → active new | E(new) | Raw new amount, ignores new eligibility |
| Removed | Active old → deleted | -E(old) | No such OFX operation exists |
| Unchanged rows absent from file | No transition | 0 | Not touched; absence does not mean removal |

OFX code has no deletion/removal tag handling and does not reconcile rows absent from a file. Do not add removal by omission. If such a lifecycle is later approved, its formula is above, but it is outside this correction.

### Pending

New OFX AccountTransactions omit pending and receive DB default false. Existing matches preserve pending because merge does not set it. No OFX pending tag mapping exists, and current code does not convert pending to posted. It can modify a matched pending row's amount/date without changing pending. Calculate old/new eligibility from actual persisted/resulting status, even if pending remains true. Do not silently add pending→posted conversion; proposed scope preserves current pending assignment semantics pending the decision below.

Boundary cases: date before→before produces0; before→equal/after adds new eligible amount; equal/after→before removes old eligible amount; eligible→eligible applies new-old. Deleted old never contributes old E. Pending old/new never contributes Account E. All apply independently of LEDGERBAL presence/value.

## Categories and user edits

Current OFX Category processing already captures old allocations and active/date eligibility, independent of pending. It preserves every non-Unassigned split (including comments/metadata and duplicate Category IDs), computes an explicit Unassigned remainder against the new signed amount, validates total, groups old negative/new positive allocations and updates Category balances. New Transactions receive one Unassigned split. This behavior must survive.

For Category c, `C(s,c)` is the sum of its nominal allocations when active/date>=startDate, else0. `categoryDelta(c)=C(new,c)-C(old,c)`. Account pending eligibility must not leak into Category eligibility. Do not use transaction_categories as old effect authority. Preserve negative/zero remainders and explicit allocations, including cases where preserved explicit splits exceed a changed amount and remainder changes sign.

A user can edit imported Transactions through TC.update. Reimport overwrites linked name when NAME is supplied, amount, provider identity/provider marker, Transaction date and deleted=false; preserves Transaction comment/taxCategories, non-Unassigned allocation objects, Statement linkage and other fields not merged. Original Unassigned allocation metadata is replaced by the new remainder object. Reimport does not increment Transaction.version or add a modification log here; only new-row logging is explicit. These are current metadata behaviors, not authorization to erase user allocations or redesign versioning. Unknown/multiple-link or cross-type identity matches must not be blindly reinterpreted as ordinary one-link imports.

## Independent balance outputs and example

| Input change | Account.balance | Account.plaidBalance |
|---|---|---|
| Transactions change; ledger absent | Prior + sum of eligible old/new deltas | Unchanged |
| Ledger changes; no Transaction financial change | Unchanged | Supplied valid ledger |
| Both change | Prior + sum of eligible deltas | Supplied valid ledger |
| Active replay + same/new ledger | Delta0 | Supplied valid ledger |

Worked source-sign example: before Account.balance=1000, plaidBalance=1400. New active nonpending STMTTRN has TRNAMT=-50 and date>=startDate, so its stored amount=-50 and E=-50. LEDGERBAL=1500. After: Account.balance=950, plaidBalance=1500. Explicit Unassigned/new nominal Category effect is -50. The provider/accounting disagreement is meaningful and must not trigger repair.

## Observation date, currency and field inventory

LEDGERBAL may carry DTASOF; CCSTMTRS may carry CURDEF. Current code ignores both. DTPOSTED dates Transactions, not the ledger observation. Account has an old DB sync_date column from its creation migration, but no active model property for it; there is no active plaid-balance/OFX-ledger observation timestamp. Institution.syncDate belongs to provider sync and is displayed as Institution “as of”; OFX does not update it. Generic updated_at is a row modification timestamp, not a ledger observation timestamp.

Recommend no timestamp write for this focused correction: do not claim upload time/Institution Plaid sync time is DTASOF, and do not revive an unused column as a new observation contract. Temporal ordering/stale provider-observation policy for out-of-order files remains a decision below. No schema change is proposed.

| Layer | Current provider-balance representation / consumers | Correction / future rename impact |
|---|---|---|
| DB | accounts.plaid_balance numeric(12,2), migration1630751986203 | Keep column. Down migration contains existing place_balance spelling typo; unrelated cleanup deferred |
| Model | Account.plaidBalance, parseFloat hydration | OFX assigns observation here; keep name/type |
| Plaid | I.updateAccountBalances assigns balances.current, negates Credit/Loan; initialization controller and missing-account path initialize field | Preserve all Plaid semantics and existing sign conventions |
| OFX | Currently never sets field | Set valid BALAMT using existing signed OFX convention; no Plaid-specific extra sign inversion |
| API | AccountProps / AccountSyncResponse plaidBalance, Budget serialization, Institution creation/sync responses | Keep wire name, independent balance values |
| Client | State/Account.plaidBalance, props/updateProps, State/Types | Preserve nullable independent field |
| Display | AccountView/Account shows accounting balance and `/ provider balance` when nonnull/different, both multiplied by Account.sign | Already permits disagreement; no equality assumption to preserve |

No other active provider writer to plaidBalance was identified. Existing names, Plaid-origin initialization and Institution sync timestamp handling are Plaid-specific assumptions to inventory for a later `plaid_balance → provider_balance` rename. Future rename needs coordinated migrations/model/DTO/client/tests and backward compatibility; none is part of this task.

Accounts have no currency field/FX conversion contract in this flow. Existing code implicitly treats OFX transaction and ledger numbers as the Account's currency. This authority correction can preserve that assumption for the currently supported single-currency use; it cannot establish that arbitrary CURDEF values are compatible. Do not infer currency from FID or solve conversion. A file with multiple Account/currency observations needs scope validation/policy, not accidental last-message authority.

## Opening and BalanceHistory interaction

Current order: process rows/Categories → assign Account.balance from ledger or raw sum → persist BalanceHistory(this.balance,today UTC) → save Account → updateStartingBalance → save Funding Pool. The helper recalculates type4 as Account.balance minus applicable active/nonpending non-type4 signed sum, updates opening date to Account.startDate, and changes Pool by new-opening minus old-opening (or full opening when absent). It does not increment Account.balance.

Under corrected deltas, let B be prior accounting balance, S prior applicable Transaction sum, d the operation's net eligible delta. Then `(B+d)-(S+d)=B-S`: ordinary OFX changes preserve the implied opening amount. Ledger-only changes must produce no opening/Pool monetary change. The existing opening formula remains justified by the accounting invariant, not by ledger balancing. Keep the helper after Account net delta persistence and use the same transaction/fresh state. Date remains Account.startDate; DTASOF does not become opening date.

Existing missing/incorrect opening state is different: running the helper may create an opening or adjust an inconsistent opening to the already-current B-S even for replay. Do not use this correction as historical opening repair. Before activation, decide whether existing helper maintenance remains allowed when inconsistent/missing or the operation should avoid/stop that incidental repair. Tests must separate consistent-opening invariance from this case. No migration-on-touch/provenance is proposed.

BalanceHistory currently receives SpendCraft accounting balance, not a separate ledger observation argument. The smallest correction retains that evidence call with the final accounting balance; it does not record LEDGERBAL into history or make history authoritative. This is an explicit proposed compatibility choice while deprecation is investigated; do not expand history policy or fix manual history endpoints. Failure of retained history persistence must still roll back the import.

## Minimal implementation shape, atomicity and concurrency dependency

1. HTTP retains tenant precheck and existing Budget gate; command resolves the chosen Account by scoped identity rather than global name, then reloads/binds financial context in one transaction. Avoid holding locks over interactive prompts.
2. Parse/validate supported statement structure, optional ledger state, required Transaction fields and unambiguous identities before financial mutation. No exact-money ingress change; retain current number representation and split policy.
3. For each scoped match capture old amount/date/deleted/pending and allocations, establish new actual state, calculate eligible Account delta, apply existing Category delta and persist identity-preserving changes. Identical duplicates/replays must not reapply economic effects.
4. Add operation net delta to fresh Account.balance regardless of ledger. Assign valid supplied ledger to plaidBalance only. Absent ledger leaves plaidBalance unchanged. Do not zero it or copy accounting balance into it.
5. Retain approved evidence/opening behavior according to resolved decisions, then save/commit. No helper may independently commit. All authoritative reads/writes, Categories, logs, opening and Pool use owning transaction. Any failure rolls everything back, including both balances.
6. Keep HTTP response shape; safely refresh client state on confirmed success. Do not optimistically copy ledger into accounting balance.

A DB transaction alone does not prevent stale read-modify-write. HTTP OFX/OFX already share a Budget gate and reload Account after waiting. TC.PATCH/startDate/Statements cooperate; manual CREATE/DELETE and the command currently do not all cooperate. Merely adding a gate to the command cannot prove OFX/manual correctness. Activation must either complete a separately approved compatible concurrency correction for affected competing writers or establish another tested common balance update strategy. Atomic SQL increment in OFX alone cannot protect against a competing writer's later stale absolute save. No universal Budget-lock helper or lower-resource lock hierarchy is introduced by this design.

Existing manual BalanceHistory remains a separate known writer defect while paused; it can overwrite balance independently after an import. The guarantee here concerns the OFX operation, not certification that every other endpoint is correct.

## Client completion and error behavior

AccountsToolbar.handleUploadOfx currently awaits Http.fetch and performs no response-ok check, Account/provider refresh, Category refresh or loaded Transaction refresh. The server success body contains no updated balances. Account display already supports both values, but the cache can remain stale until reload.

Proposed smallest client correction: after confirmed HTTP success, reload authoritative Account/provider values and affected loaded Transaction/Category state using current State methods. Do not manufacture equality or calculate Account changes from the file in the browser. Failed request must not mutate cache. A failed refresh after committed success must be distinguished from rejected posting to avoid a misleading retry; replay economics still need zero-delta behavior. No UI rename is necessary for correctness, though a later label could clarify slash-separated values.

## Precision and historical limitations

This design retains existing dollar numbers, parser numeric conversion, relational numeric(12,2), JSON splits and API fields. Floating exposure remains in raw new-old amount subtraction, operation sum, balance addition, explicit split rounded-cent remainder, Category accumulation, opening SQL SUM hydration/subtraction and Pool addition. Parser identity coercion is distinct from monetary precision. No epsilon, new rounding policy, MinorUnits architecture or representation migration is implemented here.

Historical data risk: prior OFX imports may have overwritten accounting balances from ledger and propagated offsets to opening/Pool/history. Forward deltas cannot establish the correct prior baseline or undo those effects. Likewise, old/new eligibility is the approved forward calculation, not independent proof that every historic nominal Category effect was applied correctly; no historical balancing/reconstruction is added. Replaying old files is not a repair. No Account reconstruction, opening normalization, historic history rewrite or audit is authorized. A separately authorized read-only audit could estimate OFX/provider identity shapes and discrepancies, but disagreement alone does not prove damage under the new independent-balance model.

## Verification matrix for future implementation

Pure/source/client tests should exercise actual old/new eligibility and signed deltas without DB bootstrap; current source-characterization tests deliberately assert the present defects and must change when the fix lands. Current tests/unit/ofxBalanceAuthority.spec.js executes the actual method body with inert parsed/model collaborators, plus real XML parsing for identifier coercion. It proves ledger destination/missing/null/zero behavior, not persistence/locking or correct posting.

Prepare PostgreSQL cases only after fresh authorization and centralized configured/live target safeguards before every destructive setup/cleanup. Existing tests/bootstrap.ts truncates directly and is not safe authorization evidence.

| Area | Cases and exact expected behavior |
|---|---|
| Entry points/security | HTTP and command; foreign/nonexistent Account, foreign Institution/Budget, same names across tenants/Institutions; no mutation on rejection; actual selected ID used |
| New | Supplied/absent ledger; positive/negative/zero signed TRNAMT; before/equal/after startDate; stored amount sign equals TRNAMT; one economic application |
| Replay | Identical active row repeated/files; same or changed ledger; original IDs retained; accounting delta0; provider observation updated independently |
| Modify | Amount/date/both; before↔eligible crossings; old/new pending/deleted combinations; category-only/name/comment edited imported rows; delta E(new)-E(old) |
| Pending | New defaultfalse; existing true preserved under current mapping; before/after status planner cases; pending affects Account only; explicit conversion tests only if approved |
| Restore | Deleted match eligible/ineligible/pending, changed amount/date; old E0; new effect once; second replay0; allocation and identity preserved |
| Removal | File omission leaves existing row/effect untouched; no new removal support |
| Ledger | Positive/negative/zero/absent, empty aggregate, missing BALAMT, null, malformed/nonfinite; policy-driven atomic behavior; no synthesized observation |
| Empty/unsupported | Genuine empty Transaction list/ledger-only file, missing versus malformed list, header-only/malformed XML, unsupported message, multiple Account/ledger blocks; no accidental undefined row |
| Independence | Transaction-only, ledger-only, both, replay+changed ledger; raw Account.balance and plaid_balance inspected independently; example1000→950 vs1400→1500 |
| Allocations | Explicit single/multiple/duplicate splits and comments; Unassigned remainder positive/negative/zero, changed amount smaller than explicit allocation; nominal conservation and date-aware grouped effects; no transaction_categories authority |
| Identity | FID/ACCTID/FITID stable match; leading zeros/numeric coercion; duplicate existing key, conflicting/identical file duplicates, cross-provider collision, unsupported type/multiple links; chosen policy fails before mutation |
| Opening/Pool | Consistent existing opening unchanged for ordinary eligible changes and ledger-only replay; date=startDate; missing/inconsistent opening policy; Pool cannot absorb ledger discrepancy |
| History | Retained evidence records accounting result only under proposed compatibility policy; history failure rolls back; no paused manual-history correction activation |
| Atomicity | Fail after row/Category/Account/provider/history/opening/log writes; complete rollback of identities, balances and evidence; both entry points |
| Binding/concurrency | Instrument all owning transaction queries; OFX/OFX same Account, distinct Accounts sharing Pool, OFX/PATCH, OFX/manual CREATE/DELETE, OFX/startDate; waiting writer sees committed state; rollback/retry, different-Budget independence |
| Client | Different balances displayed; success reload preserves independent values; rejected request caches unchanged; postcommit refresh failure handled without falsely reporting rollback |
| Regression | Manual CREATE/PATCH, startDate/opening, Statement modes/membership, funding2/rebalance3, offline route distinction, Plaid init/sync, Loans excluded/preserved per decision, no schema/field rename |

Existing functional OFX tests currently assert ledger-derived accounting values (e.g. amount15 with ledger115 expects balance115). Preserve scenarios but derive new expectations from prior accounting balance and Transaction delta; provider observation is asserted separately. Do not merely replace expected numbers to match output. Existing late history-constraint failure tests must be adapted to the retained evidence value, with independently safeguarded cleanup before any future execution. Command lifecycle tests currently use header-only input and do not prove real import financial correctness.

## Characterization verification and repository state

Five focused source tests passed, zero failed, using standalone Japa without tests/bootstrap.ts. Both TypeScript checks, ESLint, Knip and circular regression passed. Initial lint found a missing explicit node:url URL import in the new test; it was corrected and lint/tests rerun. Circular analysis retains only the accepted 11-model/26-edge SCC. Standard and staged git diff whitespace checks passed; untracked task files were additionally checked for trailing whitespace/final newlines. No DB tests, application bootstrap or destructive DB operation occurred.

HEAD initially matched f8af214. During this task an external commit `7fdc6369d787869dd5859341f832c0733a6496f1` (“Initial commit.”) captured the two reconciliation documents, including part of this task's documentation updates. No agent commit command was issued. Inspection confirmed that commit changes only those documents; app/client/common/commands/start/database/tests runtime source remains at the f8af214 baseline. The commit was preserved. Remaining task edits are the correctness-review refinements, this design and the source-characterization test; the index is unchanged.

No runtime behavior, representation, schemas, database columns, historic balances, BalanceHistory correction, provider posting implementation or Loan behavior changed. No database connection, historical repair, deployment or agent-created commit occurred.

## Original product decisions identified during characterization (superseded where settled above)

The accounting/provider authority split, missing-ledger continuation and replay-zero rules are settled by this task and require no further approval. Remaining choices:

1. **Malformed-present ledger and structural errors.** Reject the entire upload versus ignore invalid provider observation while posting valid Transactions. Recommendation: reject atomically with safe validation errors; absent is permitted, malformed is not absent. Compatibility: some previously database-coerced/undefined inputs will fail explicitly. Valid ledger-only uploads need a safely empty Transaction path; malformed structure must not masquerade as one.
2. **Matched pending row.** Preserve pending as current merge does versus treat every accepted STMTTRN as explicitly posted and clear it. Recommendation for smallest correction: preserve status and honor its eligibility; separately approve pending→posted mapping if needed. Compatibility: preserving status avoids silently posting matched pending effects, but will not convert them automatically.
3. **Identifier ambiguity and multi-statement observation selection.** Retain current parsed identity normalization with conflict detection versus introduce lexical identity preservation and a compatibility lookup. Recommendation: preserve existing matching initially, reject ambiguous/conflicting keys and multiple distinct Account/ledger observations; design identifier normalization separately. Compatibility: unsafe files previously processed by first/last-row accident may be rejected. Do not duplicate historical rows by changing key spelling silently.
4. **Out-of-order ledger observation.** Last accepted supplied ledger wins versus retain only newest DTASOF. Recommendation for this no-schema correction: last accepted valid observation, without inventing timestamp persistence; defer chronological freshness policy. Compatibility: an older uploaded file can replace provider observation, never accounting balance. Existing Institution syncDate must not be presented as OFX observation time.
5. **Opening maintenance when missing/inconsistent.** Retain current recalculation (which can incidentally change old opening/Pool) versus avoid/block that repair while permitting only consistent-opening maintenance. Recommendation: preserve consistent-opening invariance and do not silently repair historical inconsistent state; explicitly settle missing-opening creation before activation. Compatibility: some existing Accounts may need an actionable unsupported-state outcome or separately approved initialization behavior rather than automatic Pool changes.
6. **Loan route boundary.** Explicitly exclude Loan Accounts from this nonloan correction versus separately characterize a Loan-compatible OFX lifecycle. Recommendation: exclude pending dedicated Loan design; do not change principal semantics. Compatibility: current code lacks a Loan-specific rejection, so exclusion is a visible restriction requiring approval.
7. **Retained BalanceHistory call.** Keep recording final accounting balance as current call does versus stop writing evidence while deprecation is investigated. Recommendation for smallest correction: retain evidence-only call with accounting result, never ledger; decide removal separately. Compatibility: removing it stops OFX history updates and changes failure/rollback surface. No manual BalanceHistory defect fix is bundled.

## Implementation prerequisite: cooperating balance writers

Source reinspection at 7fdc636 confirmed that runtime remains identical to f8af214. HTTP OFX takes a Budget lock and reloads Account; TC.PATCH cooperates. AC.addTransaction and TC.delete do not take that gate and perform hydrated Account.balance read/modify/save. The operational OFX command also lacks the gate/scoped final lookup. An OFX-only concurrency fix cannot prevent another writer from committing its stale absolute balance after OFX completes. Account.balance and shared Category/Pool writers need a separately scoped common concurrency contract. This task's section21 expressly requires STOP rather than a broad locking redesign; no partial runtime correction is activated.

A deterministic PostgreSQL contention regression is required after separate database authorization, but no DB reproduction is claimed here. The source-derived schedule and proposed prerequisite/test matrix are in the implementation/blocker record. The approved financial semantics remain unchanged by this blocker.

## Shared Account concurrency design (no implementation)

The source-based recommendation is now documented in [Account-balance writer concurrency design](account-balance-writer-concurrency-design.md). Required normal existing-Account posting set: manual CREATE, PATCH, DELETE, OFX HTTP/command, Plaid syncUpdate through all callers; retain existing mode/startDate and Statement gates. The missing participation is principally CREATE/DELETE/OFX command; existing gated paths require fresh-state/transaction-binding verification, including preloaded provider state. Recommend extending the existing Budget gate to this bounded set before financial reads, not introducing universal application serialization or Account prelocks.

Initialization-only writes and Category-only operations do not become Account writers. Erroneous manual BalanceHistory writes remain paused and cannot be legitimized by locking. Full OFX activation must explicitly account for any additional shared Category/Pool and parent-lifetime guarantees; Account-delta serialization alone must not be advertised as global financial correctness. No OFX runtime implementation resumed; approval and separately authorized DB verification remain necessary. See the concurrency design for rollout boundaries, remaining product scope choices and deterministic future tests.

## Concurrency prerequisite implementation update

The separately approved [bounded concurrency correction](account-balance-writer-concurrency-implementation.md) now gates manual CREATE/DELETE/OFX command and fixes provider fresh-state/shared-branch concurrency. Database verification is pending. This task has not changed Account.processOfx, LEDGERBAL destination, plaidBalance, history writes, identity arithmetic or opening semantics. OFX authority correction must not be marked implemented based on the concurrency changes.

## Concurrency prerequisite PostgreSQL acceptance

The bounded concurrency prerequisite is accepted:214 focused and 1,256 full-suite tests passed, 0 failed,0 skipped/pending. The [verification record](account-balance-writer-concurrency-postgresql-verification.md) documents safeguards and exact writer-pair results. This supersedes earlier prerequisite-pending status; historical blocker analysis remains as evidence. OFX semantic implementation has NOT resumed: LEDGERBAL still writes Account.balance, plaidBalance/history/eligibility behavior remains current. A subsequent OFX task may resume separately; this task's DB authorization expires and cannot be reused.
