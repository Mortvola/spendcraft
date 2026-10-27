# Bounded Account-balance concurrency implementation

> Subsequent product direction: BalanceHistory is deprecated. Its runtime lifecycle is removed and PostgreSQL-verified (physical schema cleanup deferred); earlier proposals to preserve/fix/migrate that feature are superseded. Historical verification facts below remain unchanged. See [deprecation record](balance-history-deprecation.md). No physical table removal or historical repair is authorized.

Status: implemented; PostgreSQL verification accepted. The subsequent [OFX balance-authority correction](ofx-account-provider-balance-correction-implementation.md) is also implemented and PostgreSQL-accepted. The implementation phase itself made no database connection or DB-backed test/setup/cleanup run; verification occurred separately.

## Baseline and files

HEAD verified before implementation: `7fdc6369d787869dd5859341f832c0733a6496f1`. Committed changes since f8af214 were only the two reconciliation documents; runtime source was equivalent. Existing staged/unstaged documents, earlier source tests and unrelated local files were preserved. No commit or deployment was created.

Production changes:

- app/Controllers/Http/AccountsController.ts: manual addTransaction Budget gate.
- app/Controllers/Http/TransactionsController.ts: Transaction DELETE Budget gate.
- commands/OfxUpload.ts: transaction-bound User/Budget, post-selection gate, scoped fresh Account.
- app/Models/Institution.ts: refresh after waiting; sequential shared-Pool balance/opening work.
- app/Controllers/Http/InstitutionController.ts: sequential shared-transaction syncAll financial branches.

Tests: tests/unit/accountBalanceWriters.spec.js, prepared tests/functional/concurrency/accountBalanceWriters.spec.ts, and tests/functional/institutions/plaidConcurrency.spec.ts. Existing tests/unit/ofxBalanceAuthority.spec.js is run unchanged to prove semantic isolation.

## Participating set and fresh reads

Manual CREATE, Transaction DELETE, financial PATCH, HTTP OFX, OFX command, Plaid syncUpdate through every existing caller, and existing Account eligibility/startDate gates participate. No new coordinator, Account/Category FOR UPDATE hierarchy, Account version or atomic balance update was added.

CREATE previously read Budget before transaction and had no gate. It now binds user to the owning transaction and locks its Budget before Unassigned, Account balance/mode/startDate, Category or related financial reads. Request parsing is still before transaction; no hydrated Account or Category survives a gate wait. Existing signed arithmetic, split policy, Loan principle branch and validation remain unchanged. A missing Budget can now be discovered inside the transaction after request validation; tenant/Account scope and normal errors are unchanged.

DELETE similarly binds user and locks Budget before loading active target, AccountTransaction linkage, Account and Categories. All existing reversal/type/pending/date behavior remains unchanged, including separately known defects. No legacy representation guard or account-linked DELETE restriction was introduced.

PATCH already locks Budget before target/version/link/Account/Categories; HTTP OFX retains precheck for authorization but reloads Account after the gate. Neither runtime path needed a semantic change. Account settings/startDate already bind Budget/user, lock then reload Account and use transaction-bound crossing/opening helpers; no pending/startDate eligibility correction was made. Statement gates and initialization behavior are untouched.

## OFX command and semantic isolation

The command loads User with the owning transaction; related selection queries inherit it. Prompts complete before Budget lock acquisition. Selected Account identity is resolved from the selected Institution's Account list; after the gate, Account is freshly loaded by ID, Institution ID and authorized Budget scope. A global same-name Account is no longer used as financial authority. No balance/configuration from the pre-gate selection list is saved. A transaction is still held across choice prompts, as before, but the Budget financial gate is not.

Account.processOfx and its helpers are byte-for-byte unchanged. Current LEDGERBAL still controls Account.balance, plaidBalance remains untouched, OFX still writes BalanceHistory, and raw old/new Account eligibility arithmetic remains unchanged. Missing-ledger defect, provider precision/identity coercion and removal-by-omission behavior are unchanged. This is deliberately a concurrency prerequisite, not the OFX semantic correction.

## Plaid freshness and same-transaction branches

syncUpdate already requires an owning transaction and obtains the owning Budget gate. The caller's Institution may have been loaded before waiting; `await this.refresh()` now reloads persisted cursor/token/state after acquisition and before Account reads/provider calls. Lucid's current adapter refresh uses instance.$trx through modelClient; it does not escape to the default connection. Access token is rechecked after refresh. Account arrays, Transaction/link/Category writes, logs, Pool and cursor save remain transaction-bound.

Fresh cursor expectations in existing prepared Plaid concurrency tests changed accordingly: the second waiting sync starts from the first committed cursor, not its stale preloaded value. Provider amount/pending/date/Category logic is untouched.

syncAll previously ran Institutions in parallel in the SAME transaction. Reentrant locks in that transaction did not serialize branches reading shared Unassigned/Pool state. It now awaits each financial sync sequentially. Institution.updateAccountBalances similarly processes Accounts sequentially because first-sync opening helpers can read/save the same Pool through separate model instances. Existing initialization/absolute-provider balance semantics and arithmetic remain unchanged; no shared-state parallelism was removed from unrelated operations.

Plaid network calls/pagination remain inside the existing Budget gate: moving them outside safely needs a separate cursor/revalidation design. OFX parsing remains in the existing gated HTTP/helper location; no external network call was added. Same-Budget waiting can include provider latency; different Budget gates are independent. No legitimate participating operation writes across Budgets; the command's actual resource resolution is now scoped. Existing other scope defects are outside this correction.

## Atomicity and exclusions

Each writer retains one owning transaction and existing commit/rollback/error envelope. Budget lock lasts until completion. Every protected financial read/write audited uses that transaction directly or through Lucid bound relations; Budget Category helpers receive an explicit client. No lower-resource explicit locks were added.

Manual BalanceHistory methods remain ungated and retain their separately known erroneous Account writes. They are explicitly excluded; this implementation does not legitimize them or claim global safety while they remain callable. Statement semantics, new-Account initialization, separate Loan model correctness, pure Category writers, parent cascades and historical reversal authority were not changed. Same-Budget pure Category/Pool outsiders remain a separately identified scope limit; this correction guarantees participation of the approved normal Account posting set only.

No eligibility, money parsing/rounding, JSON/API shape, relational type, provider-field name, historical Account/history/opening state or schema was migrated.

## Non-DB verification

Focused isolated Japa tests execute without tests/bootstrap.ts or ORM/application imports: 16 passed, 0 failed (11 concurrency source/behavior cases plus 5 existing OFX semantic-characterization cases). Behavioral cases hold inert gates to prove financial reads wait, verify transaction binding/rollback, refresh cursor before provider access and compose two shared-Pool opening effects sequentially. Source assertions retain PATCH/HTTP OFX/startDate participation and explicitly exclude BalanceHistory.

Both TypeScript checks, ESLint, Knip, circular regression and server build passed. Standard/staged diff checks and new-file whitespace checks passed. Server build also builds the client assets; no client source changed. Established large-bundle warning is nonfatal. No test command importing database bootstrap is used.

## Originally prepared PostgreSQL matrix (subsequently verified below)

The initially prepared executable file had 12 cases: nine ordered writer-pair cases plus rollback release, different-Budget independence and command-versus-HTTP OFX. The initial Plaid concurrency change added one provider/manual case and fresh-cursor expectations. Initial new executable cases: 13. Verification subsequently strengthened the core Account group to 19 cases and the Plaid concurrency group to 20 cases, all passing. Existing OFX command lifecycle tests remain prepared regressions.

The new writer-pair harness pauses the first actual Account.save after its Budget acquisition, starts the second writer and observes PostgreSQL pg_blocking_pids/pg_stat_activity waiting on applications FOR UPDATE, then releases the first. No arbitrary sleep establishes contention. It asserts Account balance, active/deleted Transaction/link amounts, pending/version state, Category/Pool/opening values and logs. Cases cover CREATE/CREATE, CREATE/DELETE, both CREATE/OFX orders, both DELETE/OFX orders, both PATCH/OFX orders and OFX/OFX. The command case includes a foreign same-name Account and verifies it remains untouched.

Current absolute-ledger OFX behavior means order matters. Example: CREATE+10 then OFX amount10/ledger110 yields Account110, Category20, opening/Pool90; OFX110 then CREATE+5 yields Account115, Category15, opening/Pool100. Tests assert those current serial results, not the future Transaction-only Account model. The later OFX correction must deliberately update these expectations.

Rollback case pauses a real CREATE after its Account save, starts a waiting real CREATE, injects a late failure and asserts the waiter uses the prior committed state; the failed Transaction/link/Account save roll back together. Different-Budget case holds one gate while another CREATE commits. Provider/manual case uses existing in-process fake provider barriers, no external network. No direct fixture deletion or constraint cleanup was added; fixtures are fresh rows and rollback tests roll back their own transactional work.

Future execution requires fresh task-specific authorization for localhost:5432/spendcraft_test ONLY and a safety review of current setup/cleanup first. Current tests/bootstrap.ts directly calls testUtils.db().truncate(); no centralized destructive configured/live safeguard from the abandoned branch exists here. Existing read-only audit safety is not destructive-test authorization. No new destructive safeguard framework was introduced in this concurrency slice. Do not run the suite merely by setting an environment acknowledgement.

## Deployment boundary and next step

Deploy the approved writer set together after PostgreSQL acceptance. An OFX-only or CREATE-only partial rollout leaves the known missing-participant problem. This implementation does not resume OFX semantic correction; verify concurrency first, then resume that separately approved task explicitly. BalanceHistory deprecation/correction and complete Category/parent-lifetime coverage remain separate decisions.

## PostgreSQL acceptance

Bounded correction accepted after 214 focused tests and 1,256 full-suite tests passed (0 failures, 0 skipped/pending). See verification evidence for current test-only configured/live pg/pgLog safeguards, returned cleanup protection, actual lock waits, binding instrumentation and shared-Pool financial results. No further production correction was needed. Original fixture subtype omission was corrected in tests. OFX semantic correction did not resume; it can be taken up as a separate task after this accepted prerequisite. No historical/eligibility/BalanceHistory/representation change occurred. Database authorization was limited to localhost:5432/spendcraft_test and expires with this task; it cannot be reused for OFX semantic verification.
