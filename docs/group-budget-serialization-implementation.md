# Group creation and update Budget serialization

Baseline HEAD: `500cef52d2e0a9495db5992cd1fbb6903246dcc1`.

`CategoriesController.addGroup` and `updateGroup` now begin an owning transaction and acquire the authenticated user's Budget `FOR UPDATE` gate before loading Group state. NoGroup, target Group, optional parent and name-uniqueness queries use that transaction. Creation explicitly binds the new Group to it; updates save the freshly queried transaction-bound model. Managed transactions commit the response state or roll back on failure.

The Budget row is the sole explicit application-level serialization lock used by these methods. No Group lock, financial write, schema change, new hierarchy rule or validation-policy change was introduced. Existing name scopes, optional update fields, ownership checks and response shapes remain intact.

Group deletion and Category writers are unchanged. This correction serializes creation and update against cooperating Budget-gated writers; it does not certify lifecycle races with writers that remain ungated.

Changed implementation files: `app/Controllers/Http/CategoriesController.ts`, `app/validation/Validators/category.ts`. Non-DB regressions in `tests/unit/remainingBudgetWriters.spec.js` pause Budget acquisition and verify no Group reads occur before acquisition, all lookups and validation share the owner, and saves precede response completion.

Verification: 35 focused non-DB tests passed; server TypeScript, ESLint, server build including client assets, working-tree and staged diff checks passed. The existing Vite large-chunk warning remains. No database connection or DB tests occurred. Future authorized PostgreSQL verification should cover concurrent same-name creation, create/update collisions, fresh post-wait parent checks, rollback and different-Budget independence. No commit was created; existing index work was preserved.

## Additional catalog writers

`deleteGroup`, `addCategory` and `updateCategory` now use the same owning-transaction → Budget gate → fresh scoped reads → validation/dependency checks → mutation protocol. `deleteGroup` retains its direct-Category membership rule and 409/204 responses; its relationship query explicitly uses the owning transaction. No new child-Group deletion rule was introduced.

Category creation binds its new model to the owning transaction. Category updates save the freshly loaded model on that transaction. Both validators bind their existing name-uniqueness queries through transaction metadata, and funding Category ownership queries receive the same client. Existing field assignments and zero initialization remain unchanged. No balance adjustment, provider operation, additional explicit row lock or schema change was added.

The five Group/Category catalog methods now cooperate with each other and accepted Budget-gated financial writers. Other configuration entry points, notably `FundingPlanController.updateOrCreateCategory`, remain separate work; this does not claim every Category configuration writer is serialized. Parent cascades remain excluded.

Updated verification: 41 focused non-DB tests passed, including deterministic Budget-wait barriers, transaction binding, unchanged rejection/success responses, preserved Category balance, and fresh-state dirty-field update composition. Server TypeScript, ESLint and server build including client assets passed. Existing bundle-size warning remains. Both diff checks passed. No PostgreSQL connection, destructive operation or commit occurred. The index was preserved.

Future authorized DB cases additionally include deletion versus Category creation/move in both orders, fresh membership rejection, Category rename collisions, funding-reference ownership, late-failure rollback, and same/different-Budget contention. These have not been run or certified by the inert tests.

## Funding-plan write route removed

The user subsequently authorized removal of `PUT /api/v1/funding-plans/item/:catId` and `FundingPlanController.updateOrCreateCategory`. It is no longer an active ungated Category configuration writer. Both funding-plan GET routes remain. Functional fixtures now expect 404 for former write-route requests, and recurrence/precision coverage no longer exercises that removed writer. These database-backed tests were updated but not run; PostgreSQL authorization remains expired.

The user then authorized removal of `FundingPlanController.getPlan` and `GET /api/v1/funding-plans`. Only `GET /api/v1/funding-plans/proposed` remains in that route group, preserving the active FundingDialog caller. The functional isolation test now expects 404 for the removed GET and retains proposed-funding scoping coverage; DB tests were not run.
