# Provider identity / unlink Budget serialization — implementation blocked

## Subsequent narrowly authorized get-item --fix implementation

The explicit follow-up request adds Budget serialization ONLY to PlaidGetItem.run's --fix branch. Existing provider getItem and response logging remain outside the Budget scope. The branch then opens an owning transaction, locks the discovered owning Budget and freshly queries Institution by original ID, Budget ID and supplied token. If unlink changed the token or removed the Institution while waiting, the provider result is not applied. Only fresh Institution.plaidItemId is changed and saved; current cursor/credentials are preserved. Non-fix inspection does not start a transaction or request a lock.

Existing CLI flag/environment/error behavior and no-target/no-change informational handling are preserved. No recovery/advisory/other explicit lock or financial write is added. This is the third separately authorized local correction after HTTP unlink and remove-item; it does not certify broader setup/recovery compliance.

Focused non-DB source tests:33 passed,0 failed/skipped. Five get-item scenarios cover successful post-gate write, already-current no-op, changed token after provider fetch, save-failure rollback and non-fix read-only behavior. Exact query scope and owner transaction are asserted, with deterministic gate barriers. Real PostgreSQL verification remains pending; none was run. Server TypeScript, ESLint, server build including client assets and normal/staged diff checks pass. Existing >500kB client-bundle warning remains. No client source changed; no separate client build/type check is required.

## Subsequent narrowly authorized remove-item CLI implementation

The later explicit request also adds Budget serialization to commands/PlaidRemoveItem.ts run (plaid:remove-item). The supplied token initially discovers ONLY Institution ID and Budget ID. A managed owning transaction acquires that Budget FOR UPDATE, then freshly queries Institution by ID, Budget ID and the original supplied access token. A changed/missing token rejects before provider work; no pre-wait mutable Institution is saved. Local token/item clearing uses that transaction and commits/rolls back atomically.

CLI interface/environment checks and outer error logging remain unchanged. The command still clears ONLY accessToken and plaidItemId; cursor, provider Account/link identities and financial state are not newly changed. Remote removeItem remains before local clearing and now runs under Budget; same-Budget contention and inability to undo a successful remote removal after SQL rollback are explicit unchanged/discussed boundaries. No recovery service/advisory/cleanup lock is invoked or altered.

Focused non-DB source tests:29 passed,0 failed/skipped, including deterministic command wait, fresh scoped-token validation, identity-change rejection and injected save-failure rollback. These are inert actual-method tests, not PostgreSQL contention or persistence acceptance. Server TypeScript, ESLint, server build including client assets and normal/staged diff checks pass; existing >500kB bundle warning remains. No database connection, schema/money change, deployment, commit or index mutation occurred. PlaidGetItem --fix remains separately ungated; setup/recovery findings remain deferred rather than certified by these two endpoint/command changes.

## Subsequent narrowly authorized HTTP unlink implementation

Following the later explicit request to add the Budget lock to InstitutionController.unlink only, that endpoint now binds user to its owning transaction and acquires the owning Budget FOR UPDATE BEFORE the scoped Institution/provider identity lookup. All existing related Account/link mutation work remains in that transaction. No additional explicit lock is introduced. This does not resume the broader CLI/setup/recovery correction described in the historical blocker record below.

Existing unlink fields, API response, remote removal placement and financial noninterference are preserved. The existing remote removal call is now inside the Budget-lock scope, intentionally serializing it with current sync; provider latency can delay same-Budget work. A remote removal still cannot be rolled back with local SQL failure. No remote recovery redesign is implied. Existing sync already refreshes Institution/cursor and Account mappings after the Budget gate; no sync change was needed for this endpoint addition.

Focused non-DB tests:26 passed,0 failed/skipped. The current-method unlink test pauses Budget acquisition, proves no identity lookup/provider call occurs before acquisition, then observes committed fresh credentials and clears identities without changing amounts. Budget lookup failure rolls back before provider/identity work. Real PostgreSQL contention, late local rollback and external failure verification remain pending fresh task-specific DB authorization; no DB connection occurred. Server TypeScript, ESLint, server build including client assets and normal/staged whitespace checks pass. The existing >500kB client-bundle advisory remains. No separate client build/type check is required for this server-only change.

Changed runtime: only InstitutionController.unlink (user transaction binding plus existing Budget FOR UPDATE). Updated the existing remainingBudgetWriters source test and status documentation. Existing index/staged work is preserved. CLI/recovery/advisory locks, accounting, money representation and schema are unchanged. Earlier stop-condition findings below remain historical and broader-work boundaries; they do not describe the now-gated HTTP unlink endpoint.

> Amended exception: a plaid_item_cleanups ROW lock is permitted when acquired BEFORE entering the Budget-lock scope; it may remain held through Budget acquisition and commit. Current lockSetup→Budget ordering is therefore permitted. The prior non-overlap restriction and blockers based solely on that ordering/isolated recovery ownership are superseded. Advisory locks remain prohibited, and full recovery compliance requires reassessment. See [the architecture exception](budget-serialization-architecture.md#approved-cleanup-row-exception--subsequent-product-direction). No runtime change is made by recording this amendment.

## Outcome and baseline

**BLOCKED — DESIGN REVISION REQUIRED. No runtime implementation was started.**

Actual HEAD: `500cef52d2e0a9495db5992cd1fbb6903246dcc1`. Read AGENTS, the requested concurrency/invariant/scope/readiness records and the mandatory Budget-only architecture, then inspected current provider setup, sync, unlink, CLI, recovery service/model/migration and relevant tests. Existing staged documentation/tests, unstaged work and unrelated files were preserved; the index was not modified.

**The Budget row is the sole explicit application-level serialization lock.** No recovery-row, provider, Institution, Account or other explicit lock, advisory lock or second hierarchy is allowed in the new protocol. Ordinary locks implicitly acquired by writes/constraints are acceptable.

The user explicitly requires stopping BEFORE runtime implementation if required recovery/setup cannot safely comply without broader redesign. The current setup/recovery lifecycle meets that stop condition. This record is a blocker characterization despite its requested implementation filename; it is not a claim that unlink/CLI serialization is implemented or ready for DB acceptance.

## Current affected writer inventory

| Entry point | Owning Budget / authoritative mutable state | Local writes / transaction / current gate | External work / conflict |
| --- | --- | --- | --- |
| Institution.syncUpdate, called by HTTP sync/syncAll, institution:sync and queue:listener | Institution.budgetId; refresh Institution after Budget; token, cursor, fresh Account mappings, Transaction identities | Owning trx, Budget FOR UPDATE; sequential financial processing, Account/Category effects, cursor and logs | Provider pagination under existing accepted gate; conflicts with ungated unlink/identity commands |
| AccountsController.uploadOfx and OfxUpload command → Account.processOfx | Authorized Account's Budget; fresh Account/link identities | Owning trx and Budget gate; accepted OFX replay/account/provider authority | OFX parsing/import, no Plaid credential removal; unchanged |
| InstitutionController.unlink, POST /api/v1/institution/:instId/unlink | Authenticated user's Budget; scoped Institution token/item/cursor, Accounts and link identities | Owning trx but NO Budget gate; clears accessToken/plaidItemId/institutionId/cursor, Account.plaidAccountId and AccountTransaction.providerTransactionId | removeItem before local saves; conflicts with in-flight gated sync. Accounts/Transactions and balances remain |
| plaid:remove-item, commands/PlaidRemoveItem.run | Global supplied-token lookup identifies Institution/owning Budget | NO Budget gate/owning trx; clears accessToken and plaidItemId only | removeItem before save; existing CLI differs from HTTP unlink and must not silently be unified |
| plaid:get-item --fix, commands/PlaidGetItem.run | Supplied-token lookup and provider response; second token lookup | NO Budget gate; changes Institution.plaidItemId | getItem response can become stale while waiting/concurrent unlink. Non-fix command has no identity write |
| InstitutionController.add online branch | Authenticated Budget; new token/item, recovery status, selected provider Accounts | protect commits separately; lockSetup recovery-row FOR UPDATE BEFORE Budget; creates Institution/Accounts, cancels recovery in setup trx; first sync in separate gated trx | Token exchange before protection; provider setup calls inside existing setup gate. Recovery owns responsibility if setup fails |
| InstitutionController.update/addOnlineAccounts | Authenticated Budget; fresh scoped Institution and mappings | Existing Budget gate/owning trx; Account firstOrCreate and identity mapping | Provider account fetch; no new lower-row explicit lock in inspected firstOrCreate helper |
| PlaidItemCleanupService.protect | Provider context/item, generated cleanup ID; NO durable Budget owner | Separate transaction; item advisory lock, INSERT encrypted cleanup record | Provider context check; conflict with duplicate protection/fallback and recovery |
| compensateUnprotected | Context/item, optional cleanup row, committed Institution match; no durable Budget owner | Item advisory lock, cleanup-row FOR UPDATE; may invoke attempt | Remote removal fallback after storage/protection failure |
| lockSetup/cancelSetup | Recovery ID/status/context, no persisted Budget owner | Recovery-row FOR UPDATE then later cancellation save in setup transaction | Excludes competing cleanup until setup commits/rolls back |
| attempt and sweep/cleanup workers | Cleanup ID, status, encrypted credential, provider context, committed Institution by item ID | Guard transaction advisory lock; cleanup-row FOR UPDATE in ledger and completion transactions | Commit attempt ledger BEFORE remote removal; separate completion commit and retries; conflicts with setup/admin/other workers |
| administer retry/extend | Cleanup status, retained credential and retention timing; no Budget owner | Cleanup-row FOR UPDATE and metadata save | Changes eligibility of subsequent recovery attempts |
| PlaidResetLogin / RefreshTransactions / FireWebhook / CheckWebhooks and read-only provider inspectors | Existing token/item/provider metadata | No demonstrated local identity mutation needing the proposed gate; provider diagnostics may be logged | Remote/test/refresh actions; resulting financial sync goes through syncUpdate |
| Provider request logging/retention, providers/Plaid/Plaid.ts | Provider diagnostic response | Existing default-connection PlaidLog saves/retention, outside owning financial trx | Not financial TransactionLog; no new atomicity/transaction-binding claim. Preserve as a separate existing diagnostic boundary |

Credentials/item/account IDs/cursor updates are confined to the described setup, sync, unlink and two identity-mutating CLI paths in current source. No additional local credential-reset/reconnect writer was found among the other scanned commands. Cascades and deprecated paths remain explicitly excluded from this task.

## Explicit non-Budget locks and why they cannot just be removed

Current source locations in app/services/plaidItemCleanup.ts:

- protect line63: pg_advisory_xact_lock keyed by provider context/item.
- compensateUnprotected lines76–77: same item advisory lock plus cleanup-row FOR UPDATE.
- lockSetup line88: recovery-row FOR UPDATE, called at InstitutionController.add line75 BEFORE Budget line79.
- attempt lines137/142/187: guard pg_try_advisory_xact_lock by cleanup ID across attempt phases; recovery-row FOR UPDATE during ledger claim and completion.
- administer line229: recovery-row FOR UPDATE.

These are explicit serialization operations, not implicit INSERT/UPDATE/FK locks. The recovery model/schema stores providerContext/itemId/status/credentials/retry data but NO Budget ID or other established durable owning-Budget association. A pending cleanup can exist precisely because no Institution was committed. Looking up a committed Institution to infer Budget therefore fails in the case needing protection most.

Current setup sequence is:

exchange public token → durably protect encrypted credential in separate committed transaction → setup transaction locks recovery row → wait for Budget → create Institution/Accounts → cancel cleanup record → commit → separate gated first sync.

The protection INSERT acquires ordinary row/index/uniqueness locks, but its transaction commits BEFORE the setup Budget transaction. Those implicit locks are not held across the later Budget acquisition; no deadlock is inferred merely from this INSERT. Keeping protection uncommitted until setup succeeds would remove its existing durable crash-recovery boundary and is not a safe minimal rewrite.

The unsafe lock-removal schedule:

1. Recovery protection is committed and eventually due (or explicitly attempted).
2. Setup waits for Budget, or creates an Institution still uncommitted.
3. A cleanup worker without the existing recovery serialization reads protected/due state and sees no committed Institution.
4. It commits its attempt ledger and removes the provider Item.
5. Setup can attach/commit that now-removed Item unless setup and cleanup participate in a common owning-Budget protocol.

Simply moving recovery FOR UPDATE after Budget still violates the architecture. Simply deleting it loses the exclusion above. Merely changing setup does not serialize the worker, fallback or administrator. The current setup grace period is timing, not a lock guarantee. The item uniqueness constraint prevents duplicate protection rows; it does not exclude recovery against setup or overlapping remote attempts. Relying on an implicit UPDATE claim/mutex WITHOUT the common Budget gate would not replace the required protocol; ordinary writes after acquiring Budget remain acceptable.

The existing attempt guard also spans separate transactions so that attempt state is committed before the external call while concurrent workers do not remove simultaneously. Replacing that with one uncommitted attempt transaction changes crash/lost-response behavior; retaining its advisory lock is prohibited. No substitute is implemented.

## Existing tests establishing the recovery contract (inspected, NOT RUN)

Tests/functional/institutions/cleanup.spec.ts explicitly covers:

- setup cancellation and Institution commit atomicity;
- failed setup rollback preserving decryptable recovery;
- cleanup racing setup, asserting real PostgreSQL blocking on the recovery row and zero remote removal;
- concurrent cleanup attempts issuing one provider call;
- late setup rejecting an Item already claimed for removal;
- attempt ledger surviving interruption and being committed before the provider call;
- duplicate protection/fallback and committed Item protection.

These tests show the extra locks are part of current recovery behavior, not dead imports that can be removed behavior-neutrally. They were read only; no DB test or remote call was executed in this task.

## Current unlink/sync correctness and transaction binding

Unlink remains ungated. It scopes Institution by the authenticated Budget and uses its existing owning transaction for Institution→Account→AccountTransaction mutation queries/saves. It performs remote removal first and clears identity fields without deleting financial rows or changing allocations/balances. Its local rollback cannot undo successful remote removal. CLI token discovery and saves remain outside a shared owner transaction; no change is made.

Sync remains Budget-gated and refreshes Institution after waiting, then reloads Account mappings. If unlink had committed before that refreshed read, null accessToken causes rejection before provider posting. However, current unlink does not cooperate with the gate, so it can clear cursor/provider matching keys while a gated sync retains earlier snapshots. Cursor/identity non-resurrection under all interleavings is therefore NOT certified. There is no newly implemented Budget participation, freshness or CLI transaction-binding correction to report.

After a revised design, required local order remains Budget → fresh scoped Institution/token/item/cursor/recovery/Account mappings → owning-transaction mutations. No pre-gate token/provider result/model may authorize a post-wait save. Financial TransactionLog operations retain their accepted owning transaction; independent provider diagnostic logs are not silently made transactional.

## External work and deadlock boundaries

Existing accepted sync holds Budget during provider pagination; this task leaves it unchanged. Existing setup also does provider calls while holding its current locks. Unlink currently performs remote removal inside its local transaction but has no Budget lock. Adding a new lock-held network phase or splitting remote/local work requires the explicit review requested in this task; no new network placement is chosen in a blocked implementation.

There is currently an explicit recovery→Budget edge. Adding Budget→recovery would permit a cycle; it is forbidden regardless of whether a deadlock has been observed. Removing that edge without coordinating cleanup removes recovery correctness. Source analysis is not a new40P01/timeout observation. No recovery, Account, Category, Transaction, Institution or provider lock was added or reused for this task.

## Smallest proposed design revision — requires separate approval

First define a Budget-only setup/recovery lifecycle, not merely an unlink patch:

1. Establish trustworthy durable owning-Budget resolution for protection, fallback, queued recovery, retry/retention administration and setup, including before an Institution exists.
2. Specify what recovery does if that Budget has been deleted or ownership cannot be established. Do not invent a global lock or acquire multiple Budgets as a fallback.
3. Preserve committed pre-network attempt accounting, encrypted credential retention, cancellation/Institution atomicity and crash/lost-response behavior while replacing ALL cooperating explicit recovery/advisory locks with owning Budget serialization.
4. Review remote-call placement and the necessary Budget transaction scope. No row-claim/lease/version/mutex may replace the prohibited locks under the current architecture.
5. Only after that design is approved, implement the provider-identity/CLI/setup/recovery cooperating set and validate both serial orders.

This may need durable ownership metadata or another approved ownership contract; no schema change or ownership mapping is proposed as already approved. A smaller unlink/CLI-only implementation would leave the required setup/recovery architecture noncompliant and would not meet this task's acceptance. No partial runtime workaround is made.

## Future PostgreSQL matrix — conditional design, NOT executable acceptance added

Because the stop condition applies BEFORE implementation, no new DB-backed acceptance cases were added that would imply the blocked implementation exists. Existing prepared/source matrices remain design evidence only. Future cases must use fresh authorization, accepted configured/live pg/pgLog/execution safeguards before every destructive statement/cleanup, and deterministic barriers/actual wait observations.

| Group | Required coverage after approved design |
| --- | --- |
| Unlink/sync | Both Budget orders; fresh token/cursor/maps; waiter rejects unlink; no credentials/cursor resurrection, duplicate or misassociated Transaction; financial/raw state assertions |
| CLI/sync | Both orders for remove-item/get-item --fix; reauthorize token/item/Budget after wait; preserve distinct CLI field semantics; no unrelated command locks |
| Setup/recovery | Setup waiting/committing/rolling back versus due worker; one successful removal; no attached Item removed; late setup rejection; no non-Budget explicit SQL locks |
| Durability | Committed attempt ledger before network; crash/lost response and retry; cancellation atomic with Institution commit; concurrent administration/retention |
| Ownership | No Institution yet, deleted/missing Budget, foreign ownership, item/context identity collisions under approved contract; no guessed Budget or multi-Budget workaround |
| Composition | Same Budget waits, different Budgets progress, late rollback/waiter reload, shared owning transaction, no40P01/unexpected timeout |
| Isolation | OFX, Plaid, eligibility, funding/rebalance, Statements, initialization, Category/Pool gates and accepted runtime deprecations; no monetary or cascade redesign |

## Changes and verification

Changed only this blocker record and status notes in remaining-budget-serialization-design.md, post-reset-remaining-correctness-review.md and monetary-migration-correctness-readiness.md. No production, CLI, provider, recovery model/schema, test infrastructure or existing tests were edited. Existing staged work remains staged as supplied; new documentation edits are unstaged.

Focused non-DB source/pure tests:25 passed,0 failed,0 skipped/pending. These retain current behavior and expose known ungated paths; they do NOT certify an implemented correction. No implementation/build acceptance is claimed. Normal and staged git diff --check pass, including a separate new-document whitespace check. TypeScript/ESLint/Knip/circular/build checks were not rerun: the mandatory stop condition prevented runtime implementation, and this task changed documentation only. Prior checks are not represented as new implementation acceptance.

No database connection, destructive operation, additional explicit non-Budget lock, historical repair, provider monetary-policy change, exact-money/MinorUnits work, monetary representation change, schema migration, deployment or commit occurred. Database authorization remains expired; no new authorization is requested for a blocked implementation.
