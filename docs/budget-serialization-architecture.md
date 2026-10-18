# Mandatory Budget-only serialization architecture

## Binding product rule

The **Budget row is the sole explicit application-level serialization lock for Budget-owned work**, subject to the ordered cleanup-row exception below. Use the existing Budget FOR UPDATE mechanism for every operation requiring serialization. This rule applies to financial posting, provider identity, configuration, catalog admission, tax forecasts, membership and Budget deletion, including helper calls made by those operations.

Do not introduce or rely on explicit locks on Accounts, Categories/Funding Pool, Transactions, Institutions, provider/recovery records, configuration records or any other application data row, except a plaid_item_cleanups row lock acquired before the Budget-lock scope as specified below. No advisory locks, alternative serialization mechanism or additional lock hierarchy is allowed. Ordinary PostgreSQL locks implicitly acquired by writes and constraints are acceptable; an ORM helper issuing SELECT FOR UPDATE is still an explicit lock, even when hidden from its caller.

Required sequence: begin owning transaction → identify/authorize owning Budget → Budget FOR UPDATE → fresh mutable state used for authoritative decisions → all participating reads/writes through the owning transaction → commit/rollback. Before the gate, parsing and identity/authorization discovery may identify the Budget; do not retain a mutable model, eligibility result, credential, cursor or configuration snapshot as post-wait write authority. The Budget lock does not serialize parallel callbacks within the same transaction and does not correct invalid accounting semantics.

If a path cannot safely operate using only its owning Budget lock, STOP and report the architectural blocker. Do not solve it with another explicit lock, disguise one in a helper or treat an existing prohibited lock as an exception. This instruction does not authorize removing existing locks or redesigning recovery behavior without a separately scoped correction.

## Approved cleanup-row exception — subsequent product direction

An explicit row lock on plaid_item_cleanups is permitted when acquired BEFORE entering the Budget-lock scope. It may remain held while waiting for and holding the Budget lock, through transaction completion. Releasing it before Budget acquisition is NOT required. This supersedes the earlier non-overlapping-lifetimes interpretation.

Where both locks are needed, the permitted order is cleanup row → Budget → fresh Budget-owned mutable state → writes → commit/rollback. Do not acquire a cleanup-row lock after acquiring Budget or introduce the reverse Budget→cleanup edge. Cleanup state protected by the pre-acquired row lock may be read to establish recovery eligibility; Budget-owned authoritative state still must be freshly loaded after Budget acquisition.

The exception is limited to plaid_item_cleanups ROW locks. Advisory locks, explicit locks on other provider/application rows and alternative serialization mechanisms remain prohibited. Cleanup-only work need not invent Budget ownership merely to acquire its permitted cleanup-row lock.

Current InstitutionController.add calls lockSetup before acquiring Budget in the same transaction. That ordering and overlapping lock lifetime are now permitted. Earlier blocker statements based solely on that ordering or lack of recovery Budget ownership are superseded. This does not automatically approve existing cleanup advisory locks or certify the complete recovery workflow; those require separate reassessment. No runtime change follows merely from recording the amendment.

## Existing non-Budget explicit locks — source audit at500cef52

These are current-code discrepancies to identify, not approved architecture for future corrections. No database connection or runtime change was made during this audit.

| Location | Existing explicit lock | Interaction / consequence |
| --- | --- | --- |
| app/services/plaidItemCleanup.ts protect, line63 | pg_advisory_xact_lock keyed by provider context/item | Separate recovery transaction before online setup's Budget transaction; cannot be a dependency of a new Budget-only correction |
| Same service compensateUnprotected, lines76–77 | Same item advisory lock plus cleanup-row FOR UPDATE | Can inspect authoritative Institution and perform external removal, then invoke attempt. No Budget gate; not covered by financial serialization |
| Same service lockSetup, line88; InstitutionController.add line75 | Cleanup row FOR UPDATE | Online setup explicitly locks recovery row BEFORE acquiring Budget at line79. Permitted by the amended cleanup-row exception; retain cleanup-before-Budget ordering and do not add the reverse Budget→cleanup edge |
| Same service attempt, lines137/142/187 | pg_try_advisory_xact_lock keyed by cleanup ID, plus cleanup-row FOR UPDATE in attempt/finish transactions | A dedicated guard transaction spans nested attempt phases; not an implicit write lock. No Budget owner is established for the full recovery lifecycle. Budget-only redesign needs an explicit ownership/lifecycle solution; stop rather than invent another lock |
| Same service administer, line229 | Cleanup row FOR UPDATE | Cleanup-row-only lock is permitted by the exception; if combined with Budget work it must be acquired first. This does not approve advisory locking |
| TaxesController.post line132 → installed Lucid BaseModel.updateOrCreate | Helper executes query.forUpdate() on Tax row | Explicit non-Budget lock, even though the controller does not spell it. Adding Budget around the unchanged helper would still violate the rule |

Remaining explicit domain FOR UPDATE sites found in controllers, Institution.syncUpdate and CheckBalances target Budget/application rows. Deprecated Loan settings has a Budget gate only and is historical/excluded. firstOrCreate is distinct from updateOrCreate: the inspected installed implementation does not acquire FOR UPDATE. No additional Account/Category/Transaction/Institution explicit row lock was found in the scanned production app/commands/providers source. This is a current-source audit, not a statement about arbitrary future dependencies.

## Consequences for pending designs

- Provider unlink and identity commands must use Budget only. A required cleanup-row lock is allowed only before Budget. Existing advisory locks remain prohibited and require reassessment if the correction depends on those phases. A bounded local identity correction is not certification that the existing full setup/recovery lifecycle is Budget-only compliant.
- Tax forecast correction must gate Budget, then perform a plain transaction-bound scoped lookup followed by merge/save or create. Preserve existing request/response semantics. Do NOT call locking updateOrCreate under the gate. Ordinary write/constraint locks are acceptable; no Tax-row prelock or new schema constraint is introduced by this design.
- Catalog, Category/funding settings and last-user admission must gate Budget before mutable lookup/dependency/uniqueness decisions. Default-connection validation results cannot be reused as protected post-wait authority.
- Recovery presently operates before a durable Institution may exist and has no general Budget ownership field/proof in its protocol. The amended cleanup-row exception means isolated recovery does not require a fabricated Budget owner. Do not assign recovery to an arbitrary Budget; reassess actual advisory-lock dependencies rather than retaining the earlier blanket ownership blocker.
- Account/Institution cascade historical authority and operational normalization policy remain independent blockers. Neither Budget-only serialization nor permission to change lock architecture resolves them.

## Scope of this record

This product directive supersedes any older document wording that proposes preserving a separate recovery lock hierarchy or using a locking upsert as part of a new correction. Historical implementation/verification records remain factual accounts of the code tested then, not exceptions to this directive.

No runtime change, lock removal/addition, PostgreSQL access, schema change, historical repair, monetary representation change, deployment or commit occurred. Existing work and index state are preserved.
