# Account deletion Budget serialization

At HEAD `500cef52d2e0a9495db5992cd1fbb6903246dcc1`, the user explicitly authorized adding the Budget gate to `InstitutionController.deleteAccount` after discussion of its independent reversal limitations.

The method now begins the owning transaction, binds the authenticated user, acquires the owning Budget `FOR UPDATE`, then freshly resolves the scoped Institution and Account. The Account relationship query explicitly uses the owning transaction. The existing cascade receives the transaction-bound Budget; its Transaction/link/Category/Unassigned/physical-cleanup queries and saves retain their existing transaction binding and arithmetic. Budget lookup failures are now inside the rollback/error boundary.

No helper arithmetic, eligibility, historical reversal policy, schema or monetary representation was changed. No explicit non-Budget lock was added. The Institution DELETE entry point remains ungated. This change serializes Account deletion against cooperating Budget writers; it does not make the cascade's historically ambiguous or current reversal assumptions correct, and it does not certify concurrency with other ungated lifecycle writers.

Non-DB tests pause gate acquisition and prove no scoped reads/cascade work happens before acquisition, verify transaction binding and unchanged response forwarding, and check Budget/cascade failures roll back. The cascade is stubbed in these endpoint tests; passing them does not certify financial reversal. The existing source regression continues to check unchanged cascade arithmetic and the ungated Institution entry point.

PostgreSQL verification remains pending fresh task-specific authorization. No database connection or destructive operation was performed. Future tests should characterize gate ordering, waiting-state reload, different-Budget independence and rollback, without inventing expected historical reversal balances.

## Subsequent deferred eligibility correction

The user subsequently directed that current accounting rules be assumed to have applied to all historical Transactions, and explicitly deferred implementation of eligibility-aware ordinary Transaction reversal. Track the required correction in [the remaining correctness review](post-reset-remaining-correctness-review.md#deferred-ordinary-transaction-deletion-eligibility-correction--product-direction). This supersedes the historical-authority blocker under that assumption for ordinary Transactions; it does not change the existing cascade arithmetic or establish specialized funding/rebalance/opening reversal rules.

## Subsequent Institution DELETE Budget gate

The user explicitly authorized adding Budget serialization to `InstitutionController.delete`. It now starts the owning transaction, binds the authenticated user, acquires Budget `FOR UPDATE`, and only then freshly reads the scoped Institution and Accounts. Account lookup and the existing cascade share the owning transaction. No explicit lower-resource lock was added. This supersedes earlier statements that this entry point remains ungated.

Remote Plaid item removal retains its existing position before local cascade/deletion, now while Budget is held. Provider latency therefore extends lock duration, and remote success cannot be rolled back if a later local step fails. No remote recovery policy was changed. Both Account and Institution DELETE now gate their entry points; the shared cascade arithmetic remains unchanged and does not acquire another explicit lock. The separately tracked eligibility-aware reversal correction remains deferred under the user's current-rules-for-history assumption.

Non-DB endpoint regressions use deterministic Budget barriers, transaction assertions and inert cascade/provider adapters. They cover offline/online deletion, fresh post-wait credentials, Budget failure, provider failure and late local deletion failure. They do not certify PostgreSQL lock behavior or financial reversal semantics. PostgreSQL verification requires fresh task-specific authorization; no database execution occurred.

## Existing-Institution offline Account creation joins Budget serialization

The user subsequently authorized `InstitutionController.addOfflineAccount` to acquire Budget before its authoritative Institution lookup and Account creation, cooperating with the now-gated parent deletions. Pure request validation remains before the transaction. The user/Budget relationship is transaction-bound; Pool response lookup and the previously default-connection Unassigned response lookup explicitly use the owning transaction. The new Account remains bound to it, and its Statement relationship inherits that transaction.

Transaction-tracked creation still posts no opening/Pool effect. Balance-tracked creation retains its initial Statement. Balance arithmetic, fields and response shape are unchanged. This supersedes older descriptions of the existing-Institution route as ungated by design. No additional explicit row lock was added. Cascade eligibility corrections remain deferred.

Four additional inert endpoint cases cover both tracking modes, a missing parent after waiting and Statement failure. They pause the Budget gate, verify no parent/Account financial work precedes acquisition, assert fresh response balances and transaction binding, and check commit/rollback paths. Existing source checks retain no-opening/no-Pool-save assertions. PostgreSQL concurrency and actual rollback verification remain pending fresh authorization; the adapters do not certify database rollback behavior.

## Offline Institution rename joins Budget serialization

The user authorized adding the Budget gate to `InstitutionController.updateOffline`. Pure name validation remains before the transaction. The method now binds the authenticated user to the owner and locks Budget before freshly resolving the Budget-scoped Institution. Its existing name-only merge/save, response and rollback behavior remain unchanged. No network call or financial write was introduced. This supersedes earlier metadata-only ungated classifications for this endpoint.

Three inert endpoint regressions cover waiting before lookup, owner binding, successful response, missing parent and save failure, and preservation of provider identity/cursor. PostgreSQL verification remains pending fresh authorization. No database connection, additional explicit non-Budget lock or commit occurred.
