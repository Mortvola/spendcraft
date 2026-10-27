# Legacy CategoryTransfer DELETE deprecation

## Status and baseline

**PostgreSQL-accepted**; see the verification record. The implementation-stage baseline below is historical. HEAD `03b3a89d9e9d537b1d9f0b0a090ec6645282f3ef` contains the accepted Account-writer serialization, OFX accounting/provider authority, BalanceHistory runtime deprecation, ordinary eligibility/startDate, funding preview/submission, immutable funding date and replacement-admission corrections. Tracked tree/index were clean before work; unrelated untracked local files were preserved. No PostgreSQL connection, test bootstrap, destructive setup/cleanup or historical data operation occurred. Prior DB authorization is expired.

Decision: remove the obsolete standalone DELETE, rather than repair its authorization, awaiting or locking. No supported product workflow or concrete external compatibility contract was found for it. This does **not** deprecate the active modern POST/PATCH endpoints merely because their URL and DTO names contain category-transfer.

## Reconfirmed old behavior and defects

Authenticated `DELETE /api/v1/category-transfer/:tfrId` invoked CategoriesController.transferDelete. Its exact sequence was: create transaction → read request tfrId → CategoryTransfer.findOrFail globally with client trx → CategorySplit query where transaction_id equals negative legacy transfer ID → for each split, Category.find globally with trx → subtract nominal amount → invoke Category.save without await → await split.delete if Category existed → await transfer.delete → commit; catch rolls back, logs and rethrows.

There was no actor/Budget lookup, ownership filter, Budget gate or explicit version/log lifecycle. Route authentication alone did not authorize the selected IDs. Conditional on retained original tables/rows, a tenant could select another tenant's transfer and Category. The existing actual-method inert test was run before removal: actor Budget1, target Category Budget2 balance100, nominal amount10 yielded90. All3 pre-change remaining-review tests passed, including this defect characterization. This is source-executed evidence, not a PostgreSQL exploit or a claim about production table population.

The save promise was discarded. Split/transfer deletion and commit did not await its settlement or route rejection through the handler catch. Driver scheduling might serialize individual SQL requests, but that is not proof of awaited completion/error propagation or successful all-or-nothing persistence. No DB race was executed. Repairing the old representation/negative-ID lifecycle was unnecessary once no supported caller was established.

## Endpoint inventory

All paths below were inside the authenticated `/api/v1` group.

| Method/path | Controller and current scope | Caller / effects | Decision |
| --- | --- | --- | --- |
| POST /category-transfer | CategoriesController.transfer; authorized Budget FOR UPDATE; scoped Category authorization and split validation | FundingDialog → Register.addCategoryTransfer type2; RebalanceDialog same method type3. Creates Transaction JSON and Category/Pool effects | Retained unchanged; ACTIVE PRODUCT WRITER / PUBLIC API SURFACE |
| PATCH /category-transfer/:tfrId | Same handler; fresh scoped active target; matching type2/3, no Account/Loan ownership; type2 date immutable, type3 editable | Transaction.updateCategoryTransfer; reverses/replaces modern JSON Category effects | Retained unchanged; ACTIVE PRODUCT WRITER / PUBLIC API SURFACE |
| DELETE /category-transfer/:tfrId | Old transferDelete; global legacy model/Category lookups | No internal caller; legacy-table deletion and unawaited financial reversal | Removed; former PUBLIC API SURFACE |
| GET /category-transfer[/id] | No such route | No stored legacy read API | No route added |
| DELETE /transaction/:trxId | TransactionsController.delete; separate Transaction lifecycle | FundingDialog/RebalanceDialog → State.Transaction.delete; ordinary Transaction deletion also uses it | Retained unchanged; not a replacement implementation for removed DELETE |

POST validation requires a numeric type; creation's general numeric-type behavior is not narrowed here. PATCH already admits only matching type2/3. No cross-type conversion, new endpoint, tombstone/deprecated response or financial fallback was introduced. The removed route should produce normal unregistered-route behavior; existing routing tests establish404, with DB execution still pending for this removal.

## Classified complete reference inventory

The inventory covers tracked application/client/shared source, routes, providers/commands, resources/OpenAPI, current and archived migrations, seeds, tests and docs. It distinguishes actual legacy-table symbols from modern names and generic “Category splits/Category Transfers” labels. Each row has one primary classification; API roles are separately listed above.

| Reference(s) | Primary classification | Disposition and consumer |
| --- | --- | --- |
| CategoriesController.transferDelete and its model import; routes.ts DELETE registration | PUBLIC API SURFACE | Removed. No supported consumer found |
| app/Models/CategoryTransfer.ts, CategorySplit.ts | LEGACY COMPATIBILITY | Removed delete-only wrappers. Sole dependency was transferDelete; neither had a parent-cleanup/report/provider consumer. Historical physical rows do not require an ORM class to remain stored |
| CategoriesController.transfer; app/validation/Validators/categoryTransfer.ts | ACTIVE PRODUCT WRITER | Retained modern Transaction-backed funding/rebalance; validator not DELETE-specific |
| start/routes.ts POST/PATCH group | PUBLIC API SURFACE | Retained modern endpoints; no DELETE alias remains |
| client-src/State/Register.ts, State/Transaction.ts, Funding/FundingDialog.tsx, Rebalance/RebalanceDialog.tsx | ACTIVE CLIENT CALLER | Retained POST/PATCH and separate Transaction DELETE; no legacy DELETE helper to remove |
| common/ResponseTypes.ts (CategoryTransferProps, insert/update response guards); client-src/State/Types.ts | LEGACY COMPATIBILITY | Names reused by active modern DTO/state contracts, not old table records. Retained; no DELETE DTO/validator existed |
| client-src/CategoryTransferDialog.tsx; Transactions/TrxDialog.tsx type1 branches | LEGACY COMPATIBILITY | Conditional type1 Transaction editor remains compiled/reachable for such records; not falsely called wholly unreachable. No DELETE button/action/request. POST/PATCH omit currently required type and already fail validation. No supported legacy-table lifecycle established; broader type1 cleanup deferred |
| client-src/CategorySplits.tsx, CategorySplitItem.tsx and module styles; Transactions/TransactionDialog.tsx | ACTIVE CLIENT CALLER | Shared ordinary Transaction allocation editor, also imported by type1 dialog. Not server CategorySplit records; retained |
| client-src/Categories/Rebalances.tsx, Categories/CategoryView/CategoryView.tsx | ACTIVE PRODUCT READER | “Category Transfers” UI is the modern rebalances register and system AccountTransfer Category navigation, not old tables |
| client-src/Funding/FundingItem.tsx | ACTIVE PRODUCT READER | Previous-month Category Transfers label displays modern type3 sums; retained |
| TransactionsController.ts generic “category splits” comments | LEGACY COMPATIBILITY | Ordinary Transaction lifecycle comments, not a CategoryTransfer model dependency; unchanged |
| database/old-migrations/1585435670190_category_splits_schema.js | MIGRATION/SCHEMA ONLY | Archived legacy split table creation; retained |
| database/old-migrations/1585435828322_category_transfers_schema.js,1586099815138_category_transfers_schema.js,1590415161003_category_transfers_schema.js | MIGRATION/SCHEMA ONLY | Archived create/alter/drop transfer table history; retained, not replayed |
| database/old-migrations/1591064873260_transaction_categories_schema.js | MIGRATION/SCHEMA ONLY | Archived split-table rename; retained |
| Current database/migrations/*transaction_categories*, schema and Loan FK definitions | MIGRATION/SCHEMA ONLY | Modern legacy allocation storage used by separate reports/Loan/migration histories. Not the removed category_splits table; unchanged |
| tests/functional/categories/{conservation,isolation,legacyTransferDelete}.spec.ts | TEST ONLY | Modern effects/isolation, prior schema-absence test, new prepared route/inertness/parent cases |
| tests/functional/funding/{configuration,previewSubmission,replacementAdmission}.spec.ts; transactions/moneyPrecision.spec.ts | TEST ONLY | Modern POST/PATCH/Transaction DELETE, retained accepted semantics |
| tests/unit/{categoryTransferDeleteDeprecation,remainingCorrectness,replacementAdmission}.spec.js | TEST ONLY | Boundary tests; old foreign-mutation characterization replaced with removal assertion; unrelated Loan finding retained |
| tests/unit/client/{financialState,fundingPreview,fundingRounding}.spec.js; tests/unit/responses/guards.spec.ts | TEST ONLY | Actual modern State, preview/submission and response guard coverage retained |
| docs/currency-precision-policy-design.md, funding-percentage-validation-design.md | DOCUMENTATION ONLY | Modern monetary/percentage boundaries, not old DELETE compatibility approval |
| docs/funding-preview-submission-{correction,postgresql-verification}.md; funding-rebalance-replacement-admission-{correction,postgresql-verification}.md | DOCUMENTATION ONLY | Accepted historical scope and modern naming evidence; older statements about deferred DELETE remain historical |
| docs/post-f8af214-correctness-review.md; post-reset-remaining-correctness-review.md | DOCUMENTATION ONLY | Current status updated, historical defect preserved |
| docs/integer-cents-implementation-plan.md; legacy-category-authority-analysis.md; legacy-class-b-compatibility-design.md; legacy-transaction-forensic-design.md; legacy-production-transaction-forensics.md | DOCUMENTATION ONLY | Historical/abandoned architecture or generic split terminology; no authority to revive it |
| This deprecation document | DOCUMENTATION ONLY | Current decision/inventory/verification boundary |
| tsconfig.tsbuildinfo incidental historical model filenames | LEGACY COMPATIBILITY | Generated compiler metadata, not an executable reader/writer; no manual cache rewrite |

No UNKNOWN reference remains. No ACTIVE PRODUCT READER/WRITER of actual category_transfers/category_splits remains. The active modern endpoints/readers above must not be removed as obsolete solely by name. No command/job/provider or standalone cleanup path can create/read/delete legacy transfer records after this correction.

## UI, modern authority and compatibility evidence

Funding and rebalance dialogs calculate/submit modern Transaction JSON. Both explicitly delete through State.Transaction.delete → `/api/v1/transaction/:id`. Rebalances renders `<Register type="rebalances" />`; AccountTransfer is an ordinary system Category, not a legacy table model. Ordinary Category allocations use the shared CategorySplits UI and Account/Transaction APIs. No paired/multi-Account transfer semantics are invented or altered.

Current Category balances/report sums read Transaction/Category state or the separately known transaction_categories report joins, never category_transfers/category_splits. No Account.balance/provider authority, opening, funding/rebalance, Statements, initialization or provider code depends on the removed models. The report allocation-authority defect remains separately deferred.

No DELETE client/state/dialog/helper, job, CLI, documented external endpoint contract, public SDK or versioned integration client was found. An unknown external caller could theoretically issue the old route, but source gives no evidence that it is supported. Removing this API is intentional; no active modern UI feature is silently removed. The conditional type1 editor is a separate legacy compatibility concern and is left intact because it has no DELETE dependency.

## Historical data, parent cleanup and schema boundary

No historical row is read, repaired, normalized, converted or deleted by this change. No schema migration or table/FK alteration is introduced. Current migration chain does not create category_transfers/category_splits; existing categories/isolation.spec.ts explicitly asserts both absent. Archived migrations show transfer drop and split rename. This is source/accepted-test evidence, not a new live schema audit.

No Account/Institution/Category/Budget/User parent cleanup referenced these models/tables. The original legacy schemas used plain integer references, without FKs/cascades; removal therefore does not remove existing cleanup. Current Category deletion checks modern active Transaction JSON; last-user cleanup destroys the current Budget graph. Both remain unchanged. If an installation retains original legacy tables, they may remain physically stored even after a parent is removed under that old no-FK contract; this task does not add cleanup or repair. Additional out-of-repository constraints would need separate characterization.

Prepared tests conditionally seed original legacy rows only if BOTH old tables already exist. With the repository's current schema, no such rows can be seeded; the same tests snapshot table absence and normal financial state instead. They do not recreate tables or present absence as executed retained-row coverage. Future physical cleanup, if any tables actually remain, needs a separate retention/schema decision and authorization; no table deletion is required to make this API unavailable.

## Implementation and prepared DB verification

Removed one DELETE route, its controller method/import, and two unreferenced delete-only model wrappers. No client code needed removal. The old unsafe inert test is replaced, not simply dropped. AST comparison against HEAD confirms **all12 retained CategoriesController methods byte-identical**, including modern transfer, Category deletion and balance/report helpers. TransactionsController/validators/client/shared money/schema are untouched. No financial replacement, new guard or lock was introduced.

New source tests assert the category-transfer group contains only POST/PATCH, no standalone handler/raw legacy-table references exist in production, no client DELETE caller exists, modern deletion remains Transaction-owned, shared DTO/date/admission contracts remain and archived schema records are preserved. Existing actual-method/client tests cover valid funding/rebalance, rejected admission/cache, ordinary eligibility, OFX, BalanceHistory and concurrency boundaries.

Prepared tests/functional/categories/legacyTransferDelete.spec.ts has10 executable cases: six own/foreign/missing/collection/plural/nested DELETE attempts return normal404 with raw financial/history snapshots unchanged; type2/type3 create→replace→Transaction DELETE preserve expected Category/Pool effects and legacy rows/absence; Category parent deletion and last-user Budget cleanup preserve the existing schema contract. No new raw destructive cleanup, independent DB connection, temporary table or DDL is added; future fixture inserts and existing bootstrap/teardown require independent current safeguards before every destructive operation.

Future authorized verification should run these cases first, then accepted funding/rebalance/immutable-date/admission, ordinary Transaction/eligibility, OFX, Statements, initialization, Loan and Budget concurrency regression selections. Retained-row branches are conditional on an already-existing original schema; standard-schema acceptance must report that limitation explicitly. No PostgreSQL test has run for this correction.

## Non-DB results and authorization boundary

Focused204 tests pass,0 failed,0 skipped/pending. Both server/client TypeScript checks, ESLint, Knip, circular regression, server build, separate client build and standard/staged diff checks pass. Circular analysis retains only the accepted11-model/26-edge component (405 analyzed files); the existing build chunk-size warning above500kB remains. No warnings were suppressed. Explicit whitespace checks cover the new untracked test/document files. No DB connection or destructive DB operation occurred. Fresh task-specific authorization is required before DB-backed verification, restricted to localhost:5432/spendcraft_test and accepted configured/live pg/pgLog/execution safeguards independently before every destructive setup, mutation and cleanup. The prior verification authorization is expired.

## Subsequent PostgreSQL acceptance

Verification at the same HEAD preserved all existing staged work. All10 core cases passed, followed by **1,171 focused /1,526 complete-suite tests passed,0 failed,0 skipped/pending**. Both configured/live pg and pgLog plus each destructive execution connection were independently safeguarded before every destructive operation, exclusively on localhost:5432/spendcraft_test. Full run:60,810 checks/60,807 guarded operations, including teardown.

Live schema confirms category_transfers and category_splits already absent. Historical-row inertness and legacy-specific parent cleanup are therefore not applicable, not claimed as executed retained-row coverage. No tables were recreated. Current Category and last-user cleanup regressions pass. The original foreign-balance regression returns404, records zero Category saves, leaves foreign100 and all raw financial snapshots unchanged. Runtime controller prototype lacks transferDelete; all12 retained methods remain byte-identical.

Only the functional test was strengthened (distinctive foreign balance, no-save instrumentation, prototype absence and nonsecret applicability evidence); no production or safety-infrastructure correction was needed. Both TypeScript checks, lint, Knip, circular, server/client builds and both diff checks pass. Existing HMR-port and large-chunk warnings remain. No historical data, schema, modern financial behavior or representation changed; no deployment/commit occurred. Task-specific authorization is now expired; future physical cleanup or Category/Pool work requires separate scope/authorization.
