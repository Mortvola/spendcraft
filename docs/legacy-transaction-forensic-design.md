# Twelve-record legacy monetary forensics

Source investigation and query preparation only. No database connection, repair or production change. Broad audit must not be rerun. Exact SELECT plan: `/tmp/spendcraft-legacy-transaction-forensics.sql`.

## Group A: funding 342–348

Source-supported history: commit 63d6f16 (2024-08-08) changed Budget.getProposedFunding from unrounded `goalDiff / (monthDiff + 1)` to cent-rounded output; its parent FundingDialog.computeSpread used dollar percentage multiplication with no quantization/residual. The same commit introduced cent/truncation spread arithmetic and a residual expression later corrected in the closed task. cd7e05f (2024-09-04) switched truncation to rounding. These are plausible sources of repeating thirds, not evidence of the creation version of these seven rows.

Current computeSpread calculates funders in cents and preserves the closed residual correction. However, handleSubmit initializes destination amount directly from parsed baseAmount, can add cent-derived funding transfers to that dollar number, and submits it without quantizing the destination. Current server accepts numeric destination amounts and checks independently rounded zero-sum splits. Thus current source can still admit fractional destination JSON; the closed residual fix does not establish a complete currency ingress policy. Current goal proposal division rounds to cents, but non-goal proposal uses fundingAmount and explicitly supplied baseAmount remains raw. No fix is proposed here.

Reconstruction needs the complete ordered split collection, each baseAmount, funder flag, includeFundingTransfers, historical fundingCategories (fixed/percent, duplicates/order), original proposal source/goal state if available, dates and version, plus modification history. Snapshot fields are evidence of submitted historical configuration, not proof that the configuration was valid or that the client implementation/version is known. Current Category goal date, recurrence, balance and configuration may have changed and cannot replace missing historical inputs. In particular a baseAmount alone cannot identify the underlying goal remainder or intended allocation.

Funding transactions are posted through CategoriesController.transfer with type FUNDING_TRANSACTION=2. There is no extra hidden AccountTransaction required to complete a normal funding event: positive destination and negative funder entries form one zero-sum collection. The server applies category-ID aggregated dollar deltas to numeric balances. Historically f606911 (2026-10-08) added the cent-based zero-sum guard; earlier writers lacked it. Current guard is a cent-allocation check, not exact decimal equality. Eligibility and actual posted Category effects depend on the original grouping/order/save history, not simply rounding each JSON item today.

342: exact total 0.0000000000001 is not decimal zero. Rounding its total gives zero while independently normalizing items gives -1 cent. Independent rounding is therefore not a conservation-preserving legacy adapter. A cents representation must establish intended allocations and a residual recipient, preserve this record behind explicitly isolated legacy semantics, or require one-record review. Neither last item nor largest amount may be selected arbitrarily. Historical residual semantics can inform a decision only with matching algorithm and inputs.

343–348: exact total 0.0033333333333 is a real decimal residual; zero-cent diagnostic total is not exact conservation. These transactions mutate Category balances using their JSON entries; there is no separate relational transaction amount to serve as authority. Category balances aggregate other events and are not adequate historical counterparts. Snapshot repetition suggests a common source but does not prove one.

## Group B: 582 / 602

The saved audit identifies 582 as type 4 STARTING_BALANCE, not regular type 0; the narrow query will confirm. Account.updateStartingBalance subtracts relational transaction sum from a dollar-number balance, saves the result to AccountTransaction.amount, then copies the supplied in-memory amount to categories[0] without a reload. Pure arithmetic `34.50 - 67.74` produces exactly -33.239999999999995. This is a mechanism matching the observed representation, **not evidence those were the actual operands**.

For 602, CategorySplits computes `total - sum` in dollars when adding the remainder entry; TransactionDialog negates positive editing splits for a negative transaction. `-(5.4 - 2.4)` produces exactly -3.0000000000000004. The audited two-split shape and total are compatible with this mechanism, but provider input, edits and older adjustment code remain alternatives until linkage/history is examined.

582 JSON total -33.239999999999995 versus relational -33.24 and 602 JSON total -5.4000000000000004 versus -5.40 both agree under scale-two diagnostic normalization. Strict cents parsing fails on those raw JSON values. Relational amount alone does not determine all split cents or prove the historical Category economic effect. Verify all other splits, Category destinations, pending/deleted status, tracking/startDate, complete linkage, and relevant history before considering L1. Ordinary manual-input tolerance remains rejected; an explicitly bounded, evidence-based **legacy** adapter is a different policy and is not implemented.

## Group C: 1–3

Audit reports type 0 regular Transactions and a single nonloan AccountTransaction each. No uniform sign inversion explains 5 versus -5.40, 10 versus 500, or 30 versus -12. Principal is separate loan-balance semantics, not a substitute total for a nonloan account. Reconfirm full linkage/account type/tracking/principle rather than declaring corruption from totals alone.

Current create/manual split validation requires matching cent totals for nonloan transaction-tracked accounts. Current Transaction PATCH applies this validation specifically to MANUAL_TRANSACTION=5, not all regular type 0 imported records. It can change relational amount and split payload through distinct paths. Current provider/OFX update logic likewise uses both stored relational and JSON representations. These observations identify ingress/history possibilities without reopening a lifecycle fix.

Ranked hypotheses (not established causes):

1. Unvalidated historical split/amount edits or initial payload: supported by historical absence of conservation guards (e45adfe added manual checks on 2026-10-08; f606911 added transfer guard that day). History is needed to link a mechanism to these rows.
2. Migration preserved a preexisting mismatch: ed36358 introduced 1720992448419_transactions in July 2024, copying old transaction_categories amounts as JSON without reconciling AccountTransaction amount. Old rows may corroborate provenance, but are stale after JSON writes.
3. Provider/import revision or type conversion left distinct revisions: linkage/log evidence could support it; no matching revision established.
4. Demo/test/manual SQL data: possible but no matching current transaction seeder found (current seeder is tax categories). Low IDs or simple amounts do not establish fixture origin.
5. Intentional domain exception: only if account/loan/type evidence establishes different concepts; current nonloan split semantics supply no such exception. Rounding is not a plausible explanation for these material differences.

## Reader hazards

| Reader | Authority / affected groups |
| --- | --- |
| TransactionsController.update | Old JSON reversed for Category effects; new JSON applied; relational amount/principle controls Account effects. All groups that reach this handler need separate unit adapters. |
| TransactionsController.delete | Category reversal uses stored JSON or relational fallback for empty splits; Account reversal uses stored relational amount/principle with pending/tracking rules. A/B/C can reverse economically different representations. |
| CategoriesController.transfer update | Reverses old JSON and aggregates new JSON deltas. Group A directly exposed; zero-sum guard applies to replacement, not a historical repair. |
| Account provider modification/removal; processOfx reimport | Read old JSON and relational amounts for separate effects, with eligibility/cent adjustment rules. B/C exposure is conditional on provider linkage; do not assume every selected record is imported. |
| Account.updateStartingBalance | Recomputes opening amount and copies supplied in-memory result into JSON. Especially 582 if type 4 confirmed. |
| Category.balances; CategoriesController funding aggregates; Budget.getProposedFunding | Read JSON amounts/baseAmount through SQL decimal aggregates for historical views/proposals. All applicable selected dates/categories may be encountered. |
| Category deletion | JSON nonzero membership controls deletion eligibility; does not normalize/reverse these allocations. |
| Statements | Statement linkage/reconciliation uses relational AccountTransactions; JSON income is a separate concept. Do not infer a split-repair effect. |
| Reports querying transaction_categories | Consume historical relational split table, potentially a different revision; do not treat this as current JSON authority. |
| Budget.syncCategoryBalances / Category.syncBalance | Current Category.syncBalance body is commented out; this is not an active JSON-to-balance reconstruction authority. |
| FundingDialog reopen/history | Consumes stored snapshots/baseAmount then recalculates using current code; not necessarily the creation algorithm. |

Legacy CategoryTransfer/CategorySplit delete uses separate legacy tables/negative transaction IDs. It must not be assumed to be the JSON funding reversal mechanism merely from a route name.

## Minimum narrow database plan

All SQL statements remain unexecuted. Q1–Q6 target only IDs 1,2,3,342–348,582,602 or directly linked rows:

- Q1: dates/creation/update/version/deleted/type, exact monetary text and sanitized ordered configuration snapshots. Resolves snapshot completeness, ordering and historical time windows unavailable from source.
- Q2: **all** AccountTransaction linkages, money/principle/provider/pending/Statement IDs, Account type/tracking/startDate. Rechecks the original comparison and opening eligibility. Current balance is retrieved only for type 4 and labelled nonhistorical.
- Q3: legacy transaction_categories rows for these IDs only. Tests migration-copy provenance and stale divergence; not an authority to overwrite JSON.
- Q4: selected transaction_logs monetary/type/date changes, excluding messages/descriptions. Establishes observable revisions where present. Array changes may be absent because getChanges skips arrays; no log is not proof of no edit.
- Q5: only Categories referenced by selected splits/snapshot funders, budget scoped, with relevant current settings. Context/corroboration only, never historical reconstruction by assumption.
- Q6: only explicitly linked Statements, relational balances/date boundaries. Tests reconciliation linkage without unrelated income or financial history.
- Q7 conditional: provider observations matched inside SQL by selected AccountTransaction/provider account IDs. Returns local Transaction/log IDs, date, provider amount and currency only, not opaque IDs/payloads. Logs may have multiple versions; matching provider identity alone does not identify the original posted revision. Run only if Q2 shows relevant PLAID linkage.

No whole-account history scan, balance recomputation, migration bookkeeping or broad audit query is planned. If opening operands or funding goal-state history remain unavailable, report the limitation; do not expand silently into unrelated history. Original OFX spelling cannot be recovered from normalized rows. Source cannot answer row creation time, linked account type, actual operands or whether edits occurred.

Execution safeguards after separate authorization: independently reverify both config/database.ts PG mappings and effective environment target localhost:5432/spendcraft_sandbox; verify current_database/inet_server_port through both live clients before application rows; single READ ONLY REPEATABLE READ snapshot for these SELECTs; exact decimal-text analysis; normal COMMIT, idle-outside-transaction check, SELECT 1 through both, close connections. No ORM, bootstrap, DDL, temporary objects or writes.

## Policy evidence thresholds

- L1 exact legacy adapter: unique per-split cent mapping plus relational conservation and evidence unchanged historical Category effects/eligibility. Total agreement alone is insufficient; no general near-cent ingress exception.
- L2 targeted remediation: authoritative snapshot/version/inputs or explicit domain-approved allocation identifies intended cents and the effect of correcting every representation. Requires separate authorization.
- L3 compatibility preservation: reliable original higher-precision event exists but cannot be losslessly mapped; isolate legacy reads/reversals explicitly and prevent leakage into new cents state. Merely leaving a failing strict adapter is not compatibility.
- L4 manual/domain review: ambiguous snapshots, material disagreement, missing history or multiple plausible allocations. Default pending evidence for C; A also needs review unless reconstruction becomes authoritative.
- L5 no anomaly: distinct legitimate account/principal/type concepts explain apparent comparison without contradiction. Must be supported by row semantics, not a blanket rounding explanation.

Preliminary only: A cannot use naive independent rounding; B is an L1 candidate but not approved; C requires L4 unless data supports L5 or authoritative L2. No policy is selected for an individual record yet.

Cents migration: strict adapters reject A/B sub-cent JSON/baseAmount. C values parse successfully but preserve inconsistent economics, so passing precision validation is insufficient. Adapters in mutation/reversal, funding reopening, proposal/history reporting and provider replay can encounter these records; inactive rows still matter for history. A database-wide schema conversion is not assumed necessary; unresolved legacy authority still blocks universal reader conversion.

Fresh authorization required for **read-only forensic analysis of Transactions 1, 2, 3, 342–348, 582 and 602 and their directly related rows against localhost:5432/spendcraft_sandbox only**. No repair is included.

## Category-authority correction

`transaction_categories` is non-authoritative for this investigation. Any earlier suggestion that its presence, absence or values could establish historical Category economics or justify cents conversion is superseded. See [legacy-category-authority-analysis.md](legacy-category-authority-analysis.md). Historical audit observations remain observations only and must not influence compatibility decisions or future evidence selection.
