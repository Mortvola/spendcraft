# Transaction Category exact-cent storage design

## Approved type-4 audit amendment

Type4 opening Transactions now follow the same signed account-linked conservation rule as types0/5: sum each individually rounded allocation in checked integer cents and compare against the single scoped AccountTransaction amount. Include every allocation, including Funding Pool entries; do not apply type2's opposite-sign rule. Pending/deleted/pre-start status does not exclude nominal conservation. Empty allocations sum to zero; missing or multiple links remain unsupported. The audit reports opening candidates separately as `opening` and in `byType["4"]`.

This supersedes earlier statements below excluding type4 from conservation. The existing historical artifact's eight unsupported type4 outcomes remain historical results of the previous tool; they do not establish whether these records conserve. Rerun the updated read-only tool into a fresh output directory to obtain their allocation details and results. No historical artifact or financial data was changed. The approved deleted-record representation-conversion policy remains unchanged.


## Implementation-ready design — accepted audit and deleted policy

This section is the current design as of HEAD `341de4a9e5af37e0ed543efcdaab31b7b4b4ffe2`. It supersedes the initial preparation's unknown-audit-count and undeclared-deleted-policy statements preserved below. This is design/characterization, **not approval or implementation of a production migration**. The current task made no production, script, API or database change. Existing untracked tooling/docs and unrelated work were preserved; index was empty and remains unchanged.

Read alongside the [complete field/function compatibility matrix](transaction-category-exact-cent-compatibility-review.md). The earlier grouped matrix below remains historical investigation, not the final count or a claim that every coercive operation breaks. Current numeric data remains the accepted behavioral baseline.

### Accepted historical evidence

Local operator-supplied files: `tmp.5uyrTWdVDY/summary.json` and `transactions.jsonl`. Summary status is complete. Their SHA-256 hashes are respectively `7b8c668ffdaa5e311fa1311e843b77114004daba6c2e48a22aa39a619c5c805d` and `436d6e053f39f1fe4e3034fb0415ed6fe87011fb064cb2ef29a7c569ac0c6b83`. The target in that artifact is operator-reported; reading the files does not constitute a new connection or independent target verification. No authorization to reconnect follows from these files.

| Type | Passed | Failed | Unsupported |
|---|---:|---:|---:|
| Ordinary0/5 |6151|8|0|
| Funding2 |39|2|3|
| Rebalance3 |35|0|0|
| Opening4 |0|0|8|
| Total |6225|10|11|

6246 distinct ordered Transaction IDs;0 malformed and0 identified deprecated records. All10 failures and all3 empty-funding unsupported records are deleted. No nondeleted ordinary/funding/rebalance record failed.38 Transactions have rounding changes (35 ordinary and3 funding);36 conserve afterward. Prior independent recomputation of10442 evaluated allocations agrees with the approved JavaScript policy. This evidence is accepted; do not rerun a database audit without fresh authorization. The artifact exposes no existing string amount among evaluated allocations, so mixed/string behavior requires fixtures rather than inference from historical incidence.

**Approved deleted policy applies to deleted state, not an ID allowlist.** Eight deleted ordinary IDs3974,3975,3977,4116,4262,4412,4413,4415 retain empty arrays and their existing AccountTransaction amounts. Deleted funding4596 and4597 each retain a +9-cent remainder after converting existing leaves. Deleted funding2578,3077,3388 retain empty arrays. Valid deleted records may be converted without requiring conservation; amount/type/range validity is still required. Do not fill Unassigned, redistribute cents, restore, replay, recalculate balances or rewrite other fields. A post-conversion audit must report these exceptions as preserved, not label them repaired. If a record is active again when the future migration acquires its Budget gate, evaluate fresh active state rather than relying on this old snapshot's deleted flag.

### Storage codec and monetary range contract

Only the top-level `transactions.categories[i].amount` changes. Category IDs, ordered duplicates, arbitrary metadata, baseAmount, nested funding rules and every other monetary store are untouched. The approved numeric conversion remains `cents = Math.round(amount * 100)` followed by `(cents / 100).toFixed(2)`. Finite numbers, safe cents, checked accumulation, negative zero→"0.00" and no silent coercion are mandatory. No new global business maximum or numeric schema is proposed.

Define a local codec (candidate file `app/services/transactionCategoryStorage.ts`, not created here) with these separate operations:

1. **Legacy numeric read:** validate the active field's shape/value, but retain its original number without rounding on read. Otherwise deploying read compatibility alone would silently change financial effects before conversion.
2. **Stored canonical-string read:** require complete canonical decimal-dollar syntax `^-?(0|[1-9][0-9]*)\.[0-9]{2}$`, with canonical zero "0.00". Parse exact cents from digits using BigInt, range-check, and only then derive the existing numeric runtime/API amount. Do not blindly Number() and reround an already-stored string. Check that numeric compatibility round-trips to those same cents.
3. **Numeric write encoding:** use the approved Math.round formula on each number; require safe cents and that the formatted decimal encodes those cents exactly. Require compatibility with the existing numeric API, including round-trip cent equality. Extremely large safe cents that fail these checks are outside the supported representable domain and fail closed; do not silently impose AccountTransaction's numeric(12,2) limit on all JSON or choose another rounding policy.
4. **Already-string conversion:** validate canonical syntax/exact cents/domain and preserve the exact accepted string. Already converted values do not pass through numeric rounding again. Noncanonical but numeric strings ("1.234", "01.00", exponent forms, "-0.00") are separately reported, not normalized opportunistically. Malformed/blank/nonfinite/unsupported values fail closed. The historical audit's permissive numeric-string examination is not this storage-reader contract.
5. **Array mapping:** return new entry objects changing only amount; preserve all other input properties and array order. Never sort, deduplicate, recursively normalize, mutate a caller's numeric allocations during financial work or fill an empty array. Compute/validate all outputs before persistence. `[]` stays `[]`.

Supported monetary range here is the intersection of safe integer cents, exact canonical encoding and lossless round-trip to the retained numeric runtime/API. AccountTransaction's existing scale/range is independently unchanged. The observed extreme formatting counterexample is rejected/reported; no audited evaluated amount required that exception. The codec is local to this leaf, not an application-wide MinorUnits conversion.

### Active-only model binding and API compatibility

**Recommendation:** one explicit active storage service plus opt-in model preparation, keeping runtime/API amounts numeric. A blanket unconditional Transaction.prepare normalizer is inappropriate because shared Transaction models also serve excluded Loans and unsupported special lifecycles. No adapter, decoder policy or migration is designed for those excluded branches.

The service must resolve active scope from the already-authorized owning Account/Budget and lifecycle, with batched relationship evidence for list/GET paths. For historical scope, inspect all links, not a hasOne selection. Supported ordinary shape is exactly one in-Budget nondeprecated Account link (Transactions or Uncategorized Transactions); funding/rebalance is accountless. Opening follows its recognized nondeprecated Account lifecycle. Ambiguous/excluded ownership is reported, not inferred using deprecated storage.

Future binding is per model instance, never a global mutable flag. A proposed `bindActiveCategoryStorage(model, context)` is called immediately after fresh authorized hydration, before any field mutation, and on active new instances before their first allocation save. It obtains the numeric runtime view and retains original raw representation separately. Marking/binding does not itself persist, normalize, validate conservation, change version or emit logs. Deprecated/unbound flows retain their existing serializer/writer unchanged; every active boundary in the review must be integrated and tested so converted data cannot bypass binding.

Installed Lucid supports `prepare(value, attribute, model)` and `consume(value, attribute, model)`. It does not load relationships for a consume callback. Therefore async ownership/Pool/expected-amount queries must **not** be hidden in column preparation/hydration. Resolve active context explicitly on the owning transaction, then use pure encoding in the existing categories prepare callback for bound active instances. Merely installing a global consume callback cannot distinguish ordinary active Transactions from deprecated ownership sharing the same type.

Lucid compares current attributes against `$original`. Replacing a freshly hydrated string array with numbers must align **only that freshly loaded Category field's runtime original** and retain its raw stored baseline; do not mark categories dirty, reset unrelated dirty fields, call a global hydrate-originals after mutations, force a provider replay/version bump or save on GET. The implementation must prove this with real Lucid tests before adoption. A binding invoked after mutations is an implementation error and should fail closed. An in-memory codec marker is not a database version or another concurrency mechanism.

New allocation writes pass a pure encoded copy to persistence; existing business calculations continue using their current numeric models. Preparation must not replace in-memory amounts with strings. Once all normal financial work and final saves finish, reload/refresh the saved Transaction through the owning transaction and rebind before constructing a successful response when needed to expose its persisted rounded numeric Category amounts. Do not serialize raw stored strings or stale raw sub-cent Category amounts as though they were the persisted result. Keep existing response fields, count types, error contracts and HTTP numeric DTOs. Incoming API coercion remains the current Vine contract, not a new public decimal-string API.

Future active conservation validation runs on encoded cents before commit, using fresh expected evidence on the owner. It cannot be an asynchronous prepare hook: manual/Plaid CREATE initially save Transaction before creating its AccountTransaction link. Validate after that link and final allocations exist, before transaction completion. For current active writes that cannot satisfy the approved rounding/conservation checks, reject/roll back rather than modifying another amount. Existing split-error422 behavior is the manual contract to preserve; provider failure behavior requires regression tests rather than new recovery policy. Ordinary deleted representation updates skip conservation per approved policy. Normal provider restoration/Unassigned changes retain their existing lifecycle; historical conversion must not invoke them.

All active response surfaces in the compatibility review must decode, including direct model returns, serialize(transactionFields), and preloaded trees. Public API numeric representation is already required by scope; no new product decision is needed to keep it. `Amount` and AmountInput already accept strings for some display/input purposes, but that does not make client reducers or refresh guards safe. No client parsing refactor is proposed.

### Raw SQL boundary

Existing `jsonb_to_recordset(... amount decimal)` SUM readers are candidates for accepting JSON numbers and canonical strings together; actual PostgreSQL acceptance remains required. Retain their current numeric SQL extraction, filters, signs, grouping and response hydration. Do not add read-time rounding to legacy numeric rows, or rewrite a report's authority/eligibility. The representation rollout must not alter selection rules to hide deleted funding exceptions; Funding History currently includes type2 records under its existing selection.

Three JSON-path predicates require an explicit compatibility change: Category deletion admission, Category transaction membership and its count. Propose an equivalent typed `EXISTS` over the array's Category ID and numeric amount, testing amount<>0 after numeric extraction. Retain existing outer authorization, filters, date/tracking rules and existence/count semantics; do not expand arrays into the outer query and multiply counts. Do not compare to both numeric0 and string"0.00" with an ad hoc fallback, or treat malformed values as zero. Strict SQL malformed handling must be tested; no SQL was executed here. There is no model adapter for raw SQL.

### Type-4 opening characterization and evidence limitation

`Account.updateStartingBalance` creates type4 with `categories: [{ categoryId: fundingPool.id, amount: startingBalance }]`, plus an AccountTransaction of the **same sign and amount**, where `startingBalance = Account.balance - applicable nonpending/nondeleted non-opening movement sum`. Maintenance changes date and the first allocation amount; it updates Pool by the existing delta without changing Account.balance. Supported ordinary inputs produce the source-characterized equality between opening allocation and linked opening amount; it is **not** type2's opposite-signed accountless relation or rebalance zero sum.

12 offline compatibility tests include actual current opening CREATE and maintenance with numeric/string existing allocations using inert adapters. Existing `tests/functional/accounts/startDate.spec.ts` also asserts matching linked opening, Category allocation and Pool values in its known coherent fixtures; it was inspected, not run here. New offline tests show existing maintenance overwrites the first stored amount with a number, so writer encoding is necessary even if string subtraction/coercion happens to work elsewhere.

The8 historical type4 IDs are325,326,344,345,406,3044,5278,6381. **Their actual raw allocation arrays are not present in the supplied audit details.** The audit returned `outside_supported_lifecycles` before populating original amounts; its empty diagnostic arrays are not evidence of empty stored JSON. Do not claim these8 records were malformed, had no amounts, or passed a new invariant. Current source/test shape is established; historical shape must be inspected in a separately authorized preflight before conversion, without rerunning the completed conservation audit unnecessarily.

Type4 valid allocation amount leaves are inside the approved storage scope and should be converted by the same codec; no new opening financial rule or product decision is needed solely because its conservation rule differs. Preserve empty arrays if actually encountered, and report shape ambiguity rather than inventing allocations. Do not enforce the three ordinary/funding/rebalance rules on type4; any future opening-conservation admission rule needs separate authority. Conversion never runs updateStartingBalance or applies a Pool delta. Raw JSON type changes alone leave linked AccountTransaction and balance authority untouched; reader/writer compatibility is what preserves later maintenance behavior.

### Idempotent historical conversion — design only

Use a dedicated future conversion operation, **not** ordinary endpoint PATCH, provider replay, CheckUnassigned, CheckBalances or model.save on loaded history. Do not write a conversion script in this task.

An important preservation constraint: parsing and reserializing the entire JSON with JavaScript could also change unconverted metadata numbers, such as a high-precision baseAmount or unknown nested numeric property. Historical conversion must therefore extract/convert only the target amount scalars and leave original entry JSONB in PostgreSQL. Propose bound patches of `{ordinal, amountString}` applied to original JSONB with jsonb_set at the top-level amount key, aggregated back in original ordinality. Leave other keys/values on the database side. No PostgreSQL rounding: JavaScript computes each approved numeric conversion; SQL only applies validated strings. Empty arrays and all-canonical arrays need no UPDATE.

For each authorized Budget, under its owning transaction/gate:

1. Read fresh Transaction IDs/state, raw Category entry shape and original amount tokens, all needed links and current Pool identity. Select only known active nondeprecated migration scope; flag unsupported special ownership/type instead of converting it silently. Inspect type4 evidence here.
2. Validate every relevant array/entry/amount and construct per-index patches. Canonical strings are validated and unchanged. Reject malformed/noncanonical strings and unsafe numbers; do not use Number() to rescue them. Preserve every other original JSONB property through the database-side patch method.
3. For active supported0/5,2,3 check encoded integer conservation against fresh expected authority (exact persisted AccountTransaction decimal cents; opposite-signed persisted Pool allocation cents; zero respectively). Deleted rows skip conservation only; no missing values are synthesized. Type4 uses scalar/shape validation and observation, not an invented conservation gate.
4. Issue owner-bound updates of **categories only**, qualified by Transaction ID and Budget. Do not call ORM save/hooks, update timestamps/version/deleted/type/date, create logs/financial effects, acquire a Transaction lock or use an optimistic version predicate. Budget is the serialization lock. Any validation/update failure rolls back that Budget; report the failure and stop, preserving earlier explicitly committed Budgets.
5. Report changed (number→string), unchanged (already canonical/empty), excluded/deprecated and unsupported separately. Monetary rounded-value change (38 in the accepted evaluated baseline) is distinct from representation change: numeric12.34→string"12.34" is a representation change too. Never report an excluded/unsupported row as converted. For a rerun, canonical valid rows produce zero patches; no incidental metadata or timestamp changes occur.
6. Post-conversion raw verification checks types, per-leaf values, ordered IDs and duplicate counts, every non-target property, unchanged dates/status/version and untouched financial tables. Report active conservation and the deleted exception results separately. All historical exceptions remain observable, including two +9-cent remainders; no test should demand they disappear.

No implicit repair policy is approved for new malformed or active failing records discovered after this audit. A new unsupported special type is a stop/report condition for the affected Budget, not permission to apply ordinary semantics. Ordinary source linkage is not automatically valid for every historical hasOne relation. No legacy data fallback or ownership adapter is proposed.

### Deployment order, mixed compatibility and serialization

Recommend a bounded maintenance cutover for this first slice, subject to operator/product approval. Stop/drain all HTTP monetary writers, provider workers, commands and old application versions (including in-flight network sync), then deploy reader/SQL compatibility **before any string writer or backfill is enabled**. Readers accept numbers/canonical strings/mixed arrays; they do not normalize on read. Writer integration and final conservation checks must be tested as one coherent application release; do not enable new string writes while any old reader remains. During maintenance, convert Budget by Budget, run postchecks, then resume only the codec-capable version. Existing read-only reports need no Budget locks or new point-in-time promise.

Even under maintenance, the converter uses the same existing Budget FOR UPDATE before mutable reads, and all work uses its owning transaction. One Budget at a time; no simultaneous multi-Budget lock, Transaction/Account/Category explicit lock, advisory lock or new hierarchy. This composes with manual PATCH, funding/rebalance replacement, startDate, sync, deletion/cascades and user destruction when participating. A waiting writer must bind freshly loaded state after Budget acquisition; an old pre-gate model cannot determine the converted JSON. Metadata writers that leave categories clean must not accidentally rewrite the column. Existing source arrays shared within a transaction still require their established sequencing.

An online alternative could use the same Budget gate only after every writer/reader is verified compatible, but it is not the recommended initial operational plan. Maintenance protects against an overlooked old binary/operational writer that does not cooperate. Budget locks alone cannot make rolling deployment of old readers safe.

Keep mixed numeric/string reader support through backfill verification and a defined rollback/support window. Do not set an arbitrary number of days here. Removing it requires confirmation that active in-scope rows/writers no longer produce numbers and that rollback to a numeric-only reader is no longer planned. Once strings are written, deployment rollback must use a codec-capable binary; reversing strings to numbers is not an automatic rollback or approved historical repair.

### Future PostgreSQL acceptance matrix — prepared design, not run

| Area | Required executable evidence before deployment |
|---|---|
| Scalar/storage |Exact Math.round examples including signed ties and negative0; numeric-only, canonical-string-only, mixed, malformed/noncanonical strings, extreme safe-but-nonroundtrippable values; safe integer/addition overflow; raw jsonb_typeof amount becomes string exactly2 digits; no double rounding. |
| Metadata/idempotence |Repeat conversion produces0 changes; array order/duplicate IDs/comments/unknown nested properties and baseAmount remain exactly equal; include untouched high-precision numeric metadata that full JSON.parse/stringify would lose; timestamps/version/deleted/date/type unchanged. |
| Ordinary |0/5 single scoped link, signed amounts, Unassigned, duplicates, multiple Categories, pending/deleted/before/equal/after startDate; multiple/no/orphan/foreign links fail closed without inference. Fresh relational decimal text supplies expected cents. |
| Funding/rebalance |Fixed/percentage/goal/mixed and transfers, net versus baseAmount, Pool exclusion in reports, duplicates, immutable type2 date, current replacement admission; rebalance zero sum and both replacement paths; no balance/rule redesign. |
| Deleted history |All8 empty ordinary mismatches unchanged;4596/4597 remain+9 cents;2578/3077/3388 remain[]; conversion changes representation only, no restoration or financial/log writes. Post-audit reports exceptions distinctly. |
| Opening |Inspect8 historical raw arrays before conversion; known coherent creation/maintenance via new offline Institution, OFX/Plaid initialization and startDate; same Account/link/Pool behavior, dates, no zero-sum/type2 check; unexpected historical shapes reported without repair. |
| Model/API/client |Real Lucid prepare/originals/dirty behavior, nested in-place edits, no-op provider replay/version/log state, numeric JSON across all response paths, immediate persisted response values, unchanged DTO/schema/types, client refresh/add/edit/rebalance and rejection caches. |
| Raw SQL/security |Numeric/string/mixed report casts; all3 nonzero membership predicates with positive/negative/zero/duplicates, admission/count/list agreement, exact prior selection/order/pagination, Budget/Category tenant isolation, no JSON fan-out. |
| Lifecycle nonregression |Manual CRUD, OFX/Plaid reimport and removed/restored records, funding/rebalance DELETE, opening/startDate, Account/Institution cascades. Preserve current reversal behavior only; do not certify or correct historical policy. Tax/Statements/Payee/Net Worth unaffected. |
| Transactions/concurrency |Converter first and writer first for manual PATCH, provider sync, type2/3 replacement and delete; fresh waiter reload, no lost JSON edit, late rollback/retry, Budget destruction, different-Budget independence, no 40P01/unexpected timeout, only Budget explicit gate. |
| Nonrepair |Before/after raw snapshots of AccountTransaction/balances/Pool/Statements/provider/tax/config/log data; representation updates categories only. No deprecated migration path or compatibility acceptance is designed. |

Destructive automated acceptance is restricted to `localhost:5432/spendcraft_test` after fresh task-specific authorization, with the accepted independent configured/live pg, pgLog and actual execution-connection safeguards before each destructive setup, conversion fixture write and cleanup. Historical-data execution requires its own separately authorized target; the supplied artifacts confer no authorization. This task performed none of these operations.

### Genuine remaining approvals and evidence gates

- **Opening conversion:** no new financial product policy is needed for valid amount leaves. The8 historical arrays must still be inspected under later read-only authorization/preflight because this artifact omitted them; source shape is not historical certification.
- **API:** retain numeric public amounts; already established scope, not an open decision. No client-wide representation project is bundled here.
- **Deployment:** approve the maintenance/drain plan and ownership of its completion/rollback window. Compatibility support is required during migration; its retirement date is an operational approval, not a new rounding policy.
- **Unsupported special types:** no type1/unknown rows appear in this accepted audit, but retained shared endpoints can accept a new non-2/3 numeric type. Approve explicit scope/disposition before enforcing the codec universally: this design proposes stop/report on unsupported conversion rows and no silent retirement/redefinition of those runtime branches. No unsupported type receives an invented conservation rule.
- **Malformed or noncanonical strings/new active mismatches:** none were found in evaluated historical data. Fail closed; any real future occurrence requires separate disposition, never a fallback or auto-repair. The approved deleted policy is settled and is not reopened.

The compatibility design can proceed to product/operator approval; raw PostgreSQL acceptance and historical type4 preflight remain mandatory before implementation/deployment acceptance. No production change is authorized by this document.

Current-task verification:107 focused non-DB tests pass (12 new current-function characterization cases plus95 existing audit/precision cases),0 failures/skips. Both TypeScript checks, final ESLint, Knip, circular regression and working/staged/new-file whitespace checks pass. Only this design, the new compatibility review and new inert test were changed for this task. No production runtime, existing audit tool/artifact, index, schema or monetary representation changed; no database connection, destructive database operation, historical repair, deployment or commit occurred.

## Initial preparation record — superseded where noted

The following source/audit-preparation notes predate the accepted historical audit and deleted policy. Current decisions, counts and implementation boundaries are in the leading section and compatibility review.

## Baseline and boundary

Source baseline: `341de4a9e5af37e0ed543efcdaab31b7b4b4ffe2`. Read AGENTS.md, monetary-migration-scope.md, accounting-invariants.md and monetary-migration-correctness-readiness.md. Tracked worktree/index were clean at entry; unrelated untracked files are preserved. This task adds operator tooling, offline tests and design records only. No PostgreSQL connection or production migration has occurred.

**Loans and the entire `transaction_categories` architecture are deprecated and excluded from the exact-money migration, regardless of where they are referenced.** No deprecated storage is an authority, fallback or migration dependency here. Shared active code is discussed only for its nondeprecated behavior. Existing historical-policy/deletion work remains deferred.

The only proposed converted leaf is `transactions.categories[i].amount`. Category IDs, array order, duplicate entries, comments and other metadata remain unchanged. In particular, this slice does not convert `baseAmount`, nested `fundingCategories[].amount`, Transaction tax JSON, relational balances, AccountTransaction.amount, configuration, Statements, logs or API/client monetary types. A migration must preserve unknown metadata too, rather than rebuilding objects from a limited whitelist.

## Existing JSON shapes

`app/Models/Transaction.ts` declares `{ categoryId: number, amount: number, comment?: string }[]`; its column `prepare` simply JSON.stringify's the value. There is no amount-normalizing consume/prepare pair. Actual persisted funding metadata is wider than that local interface; `common/ResponseTypes.ts` TransactionProps records it.

```json
[
  {"categoryId": 10, "amount": 20, "comment": "optional"},
  {"categoryId": 10, "amount": 30}
]
```

Ordinary types are REGULAR_TRANSACTION `0` (provider/default) and MANUAL_TRANSACTION `5`. The signed JSON allocation matches the signed AccountTransaction.amount, without the client Account display-sign adjustment. Unassigned is an explicit allocation with the Budget's ordinary system Category ID; it is not a special null ID or a separate remainder field. Modern manual CREATE fills an empty array for transaction tracking; Plaid defaults to Unassigned or auto-assignment; OFX preserves explicit allocations and records an explicit Unassigned remainder. Historical empty arrays can exist. The audit never fills them.

Type `2` funding stores an ordered array of net posted destination and funder allocations, including a negative Pool allocation for ordinary positive funding. A possible transfer-inclusive shape is:

```json
[
  {"categoryId": 10, "amount": 60, "baseAmount": 60, "fundingCategories": [{"categoryId": 99, "amount": 100, "percentage": true}], "includeFundingTransfers": true},
  {"categoryId": 11, "amount": -10, "baseAmount": 0, "funder": true, "fundingCategories": [], "includeFundingTransfers": false},
  {"categoryId": 99, "amount": -50, "baseAmount": 0, "funder": true}
]
```

Here 99 denotes this Budget's Funding Pool ID. It is identified by current Budget-owned system Category type, never by `funder`, sign, a universal fixed ID or another Budget's Category. `baseAmount` is a request/configuration snapshot, not net posting authority. Nested fundingCategories describe fixed/percentage spreading, not additional posted allocations to sum. Fixed, percentage and goal calculations have already occurred before storage; audit/reporting must not recalculate them. Replacement reads current persisted JSON and retains the immutable type-2 date.

Type `3` rebalance stores positive and negative Category adjustments in the same top-level array. Its rule is zero sum; Pool need not be present. Optional metadata may coexist. Duplicate IDs remain separate entries for all three lifecycles, including duplicate Pool entries: sum each exactly once. Type `1` transfers and type `4` opening have other lifecycles; this audit does not infer an invariant for them. Opening still writes this storage and therefore remains a compatibility boundary for the future storage migration.

## Approved representation and rounding

Only the amount changes, for example `{ "categoryId": 10, "amount": "12.35" }`. The approved conversion is exactly:

```typescript
const cents = Math.round(amount * 100)
const amountString = (Math.round(amount * 100) / 100).toFixed(2)
```

The audit helper `roundAmount` uses that implementation, not decimal rounding or a SQL approximation. It validates types/syntax, rejects nonfinite amounts and requires safe integer cents. Strict numeric strings are examined through Number and then the approved rule; empty/whitespace/comma/currency-suffixed strings, booleans, nulls, missing values and containers are not coerced to zero. Original string values and SQL-extracted raw JSON amount tokens are retained in detailed findings. Accepting a numeric string for audit examination does not expand a production input contract or prove it is already canonical storage.

Examples: 12.345→1235→"12.35"; -1.005→-100→"-1.00"; 0.30000000000000004→30→"0.30". Positive exact half cents go toward positive infinity; -0.005 produces negative-zero cents under Math.round and formats as "0.00". The audit records/checks this outcome, canonicalizes its integer zero to 0 and does not emit "-0.00". Binary multiplication affects which values are ties: 1.005 also produces "1.00" under the approved formula.

Safe integer cents do not guarantee that dividing by 100 and toFixed round-trips at the extreme Number range. Reproduced offline: amount 90071992547405.12 gives cents 9007199254740512 but formatted "90071992547405.13". The formula is unchanged; `encodingMatchesCents` compares its decimal text exactly with the rounded integer. Such a row is unsupported (`formatted_dollars_do_not_encode_rounded_cents`), not silently certified or assigned a different rounding policy. This is far outside the scale-two numeric(12,2) AccountTransaction range, but accountless JSON has no equivalent declared scale/range. The historical audit determines whether it exists. No new universal monetary maximum is chosen.

## Integer conservation and expected amounts

Every entry is validated and individually rounded before accumulation. `checkedAdd` checks operands and each result using Number.isSafeInteger; intermediate overflow fails even if a later operand could cancel it. Differences also use checked addition. No epsilon, floating-dollar sum, DISTINCT or duplicate-ID collapse is used.

| Lifecycle | Exact check | Shape required |
|---|---|---|
| Ordinary 0/5 | sum(all Category cents) = AccountTransaction cents | Exactly one current AccountTransaction link; nondeprecated Account in owning Budget; tracking Transactions or Uncategorized Transactions |
| Funding 2 | sum(non-Pool cents) = -sum(Pool cents) | Accountless; nonempty allocations; one identifiable Budget-owned Pool Category and at least one allocation to it |
| Rebalance 3 | sum(all Category cents) = 0 | Accountless; nonempty allocations |

Ordinary stored nominal conservation is independent from balance eligibility. Pending, deleted and before/equal/after Account.startDate records remain included. They do not become zero-valued merely because a posting effect is absent. This audit does not compare Category.balance or reconstruct historical effects. Multiple/no ordinary links, cross-Budget/orphan Account links and balance-only/unknown tracking are unsupported, not assigned an invented expected amount. An empty ordinary array is mathematical sum 0: it passes only if its one valid expected movement is 0. Empty funding/rebalance arrays are unsupported by the current endpoint's minLength(1).

`AccountTransaction.amount` is a scale-two relational decimal and its model consumes it using parseFloat. The audit instead selects `amount::text`, validates scale ≤2 and parses with BigInt integer arithmetic before a safe conversion to Number cents. Thus a persisted -1.01 is compared as -101 without binary multiplication. This changes neither storage nor hydration. If examining a supplied JavaScript expected number in offline fixtures, the helper uses the approved Math.round conversion. Missing/nonfinite/unsafe expected amounts are malformed evidence, never filled from the Category total.

Pool comparison uses the amount(s) inside the Transaction, individually rounded by the approved rule. It does **not** use current Category.balance or baseAmount. Funding's categorySumCents is the whole array sum; its comparison fields separately show nonPoolSumCents, poolAllocationCents, expectedCents = -Pool and differenceCents = nonPool + Pool. Rebalance reports signedRemainderCents. A missing or nonunique current system Pool makes historical funding classification unsupported. There is no inferred historical Pool identity.

`SUM(round(each*100))` differs from `round(SUM(dollars)*100)`: .004+.004 gives 0 versus 1 cent; .005+.005 gives 2 versus 1. The audit intentionally flags such mismatches. Existing `validateTransactionSplits` normalizes ordinary amounts by sign before rounding; at negative half cents that is different from the newly approved signed rule (-.005 is currently checked against an absolute +.005). The audit exposes resulting differences; no validator behavior changes in this task.

## Active reader/writer compatibility inventory

All entries below refer only to top-level Transaction allocation amounts. “Adapter” means a possible future storage-only boundary translating validated strings to the existing runtime number contract and encoding them on every ORM write. It is not implemented. None of the compatibility claims is PostgreSQL acceptance of strings yet.

| Source/function | Types and current use | Raw string impact / boundary assessment |
|---|---|---|
| `app/Models/Transaction.ts` categories column | All active types; JSON stringify, no normalization; serialization sends arrays | Central encode/decode candidate, preserving metadata and ordering. Current schema/type assumes numbers. Model-only adaptation is insufficient for raw SQL readers. |
| `AccountsController.addTransaction`; `Validators/transaction.ts`; `validation/transactionSplits.ts` | Manual 5; input numeric coercion, signed validation, raw JSON, Category += amount; API serializes | Direct strings can concatenate on += or fail numeric checks. A model boundary must leave runtime/input/API numeric and encode all writes; validation policy mismatch still needs a separately reviewed implementation boundary. |
| `TransactionsController.update` | Ordinary 0/5 replacement and retained special branches; old/new numeric allocation differences, Unassigned remainder, version/log changes, returned serialized Transaction | Fresh hydration must be numeric; otherwise +/reduce and finite checks change behavior. Write adapter must encode replacement, including unchanged metadata. |
| `Account.assignUnassigned/autoAssign/addTransaction/updateTransaction/addOrUpdateTransaction`; `Institution.syncUpdate` callers | Plaid ordinary 0; sign inversion of provider amount, cent allocation, remainder and replacement; numeric JSON; response is financial balances | Shared model hydration/encoding can isolate storage; never reinterpret provider balances, pending or Account eligibility. AutoAssignment configuration is another store, not part of conversion. |
| `Account.processOfx`; `AccountsController.uploadOfx`; `commands/OfxUpload.ts` | Ordinary 0; explicit allocations retained, per-split cents, Unassigned remainder, raw opening maintenance | Existing allocations need numeric runtime values. Storage adapter must cover both new and replay/reimport saves. OFX parser/ledger authority remains unchanged. |
| `CategoriesController.transfer`, `hasReplacementAllocations`; `Validators/categoryTransfer.ts` | Type2/3 CREATE and replacement; Number.isFinite/typeof number admission, signed zero-sum validation, Category deltas, snapshots | Raw strings fail admission and can concatenate. Numeric hydrated state plus encode boundary is plausible; must preserve type2 date, accountless admission and net rows. Nested rules/baseAmount unchanged. |
| `Account.updateStartingBalance`; new-Institution offline initialization and provider callers | Type4 opening linked to Account, Pool allocation; updates amount from opening link | Storage adapter must cover this writer even though the audit does not invent type4 conservation. Existing-Institution Account creation still omits opening. No formula/Pool effect changes approved. |
| `TransactionsController.delete`; `Account.deleteAccountTransaction` | Ordinary/provider removal plus current special branches; subtract splits, empty-array Unassigned rules, response balances | Numeric model adaptation required. It must not fix deferred eligibility/reversal arithmetic or infer historical effects. |
| `InstitutionController.deleteAccounts`, called by deleteAccount/delete | Existing cascade reads arrays, subtracts Category/Unassigned amounts and special effects | Numeric hydration can preserve current behavior. No historical reversal inference/repair or separate cascade change belongs here. |
| `CategoriesController.get`, `getBills`; `Category.balances`; `Budget.getProposedFunding/syncCategoryBalances`; `Category.syncBalance` delegation; `commands/CheckBalances` | Raw JSON recordset decimal sums; previous net/base snapshots, bill debits, current balances/reconciliation | SQL expects `amount decimal`; canonical strings are coercible candidates, but real PostgreSQL tests are mandatory. ORM adapters do not touch these queries. Never run corrective CheckBalances as this audit. |
| `CategoriesController.deleteCategory`; `Category.getTransactionQuery/transactions/transactionsCount` | Raw JSON-path nonzero membership, listing/admission and counts | Numeric literal comparison against string amounts is a concrete compatibility risk. A model adapter cannot fix it. Must explicitly test/change this storage consumer in the eventual approved migration without changing membership/eligibility semantics. |
| `ReportController.category/fundingHistory/incomeVsExpenses` | SQL decimal expansion: nominal 0/5, type2 net rows, Account Transfer deduction respectively; API aggregates remain current numeric/driver types | No ORM adaptation. Test canonical string extraction, zero rows, duplicates, scope, counts and unchanged report authority. Income remains movement minus JSON deduction, not JSON-only. |
| Transaction/Account/Category GETs, search, getMultiple/getRebalances; `transactionFields.ts` | Serialize/preload categories, amount-bearing changed-field snapshots; not new financial arithmetic | Must retain numeric API shape for this slice; model decoding likely sufficient where these paths really hydrate models. Other persisted log data remains untouched. |
| `commands/CheckUnassigned.checkUnassigned` | Writes explicit numeric Unassigned JSON to empty arrays | Encoding must cover this ORM save; no Category balance or historical allocation repair added. |
| `common/ResponseTypes.ts`; `client-src/State/Types.ts`, `State/Transaction.ts` | Numeric DTO/store; copies API rows, checks Number.isFinite in updated transfer response, sums selected Category; update/delete sends numbers | API adaptation prevents string leakage; changing DTOs/client is not required or approved now. |
| `Transactions/TransactionDialog`, `PostedRegister`, `Transaction`; `CategorySplits`, `CategorySplitItem` | Signed edit conversion, per-split cent validation, direct +/reduce, totals and Amount/AmountInput | Strings break positive-side additions/display type contract even where unary minus coerces. Keep API numbers; do not modify UI. |
| `Funding/FundingDialog`, `FundingItem`, `calculateFunding` and `fundingCategoryEffect`; `Rebalance/*`; `State/Rebalances` | Current numeric allocation editing, net preview/replacement, Pool contribution, rebalance zero sum; HTTP numeric submission | Preserve numeric runtime/API, fixed/percentage/goal semantics, transfer arithmetic and duplicates. No client monetary migration. |
| `State/TransactionLog`, `TransactionLogs/*` | Displays historical change snapshots, possibly containing old allocation arrays | Snapshot storage is not converted; historical rendering compatibility must be regression checked separately, not recursively migrated. |
| User/Budget graph deletion, operational/provider entry points | Delete rows or delegate to listed writers; no additional independent Transaction JSON amount encoder found | No new allocation arithmetic; retain existing transactions/Budget gates. |

Reports such as tax and Net Worth retain their distinct sources. No generic JSON authority change is proposed. Deprecated report/storage dependencies are not inventory entries. Existing read-only audit tools have their own number-shape assumptions; do not silently repurpose their results once string storage exists. This task's operator tool explicitly recognizes numeric strings for examination.

## Historical audit and blockers

See [audit instructions](transaction-category-cent-conservation-audit.md). The executable script streams all Transactions in ID order inside one read-only repeatable-read snapshot; classifies all links rather than relying on a hasOne relation; resolves Pool only through the owning Budget; and emits disjoint pass/fail/malformed/unsupported/deprecated outcomes. No accounting balances are used as conservation authority. It reports original raw amount tokens, rounded dollar strings and integer differences, without descriptions/credentials.

Malformed = bad root/entry/ID/amount, nonfinite/unsafe cents, bad expected decimal or unsafe accumulation/difference. Unsupported = outside lifecycle, linkage/tracking/scope ambiguity, unknown Pool, unsupported empty transfer, or large-number formatting incompatibility. Current Category rows are not needed to reconstruct ordinary historical labels or applied effects. Deprecation detection uses current linked Account type or current referenced Category type only; no legacy architecture is consulted. Orphan historical rows cannot prove deprecated ownership and are not silently reconstructed.

Migration approval blockers: obtain a separately authorized complete historical audit; review every cent mismatch and malformed/ambiguous case; establish disposition without automatic remainder repair; test raw SQL numeric-string conversion and JSON-path membership; cover opening and shared active writers; preserve decimal expected amounts exactly; demonstrate repeatable conversion without metadata loss and without resurrecting old rounding semantics. Safe cents alone are not enough for the extreme formatting edge case. No product decision is needed to run/report the audit as designed. If problematic historical shapes exist, disposition requires separate review; this document grants no repair/exclusion policy for the production migration.

## Proposed implementation boundaries — not implemented

1. Review audit evidence before approving the production migration. Historical pass counts are unknown today.
2. In a future bounded change, distinguish stored allocation-string types from current runtime/API numeric types. An explicit model storage boundary is a candidate, not a license to convert unrelated JSON leaves or change API shape.
3. Cover every active encoder and SQL consumer, including admission/membership. Preserve Budget gates and transaction ownership; do not add another lock hierarchy or lock reports.
4. Conversion changes only each in-scope amount property. Preserve ID, order, duplicates and arbitrary metadata. Never use legacy data, balances or a final allocation to force conservation.
5. Prepare PostgreSQL acceptance for ordinary manual/OFX/Plaid, positive/negative/sub-cent inputs, pending/deleted/startDate nominal records; type2 fixed/percentage/goal/transfer/replacement/date cases; type3 duplicates/zero sum; opening compatibility; malformed/multiple/no links; Pool ambiguity; mixed old/new representation, API shape, JSON-path zero membership, report scope/cardinality, rollback and nonmutation.

No production migration, API/UI change, monetary arithmetic change, schema migration, historical repair, deployment or commit was made here.

## Offline verification and changed files

Final focused non-DB run: **95 passed, 0 failed, 0 skipped/pending**, including81 new audit cases plus existing split-audit/current-precision controls. Tests invoke the actual audit helpers and use an injected fake database client for mode/target verification, paging and rollback. CLI print-SQL and missing-consent tests are offline. The normal database-bootstrapping test runner was not used.

Both TypeScript projects, final ESLint, Knip, circular regression and normal/staged whitespace checks pass. The initial lint findings were confined to new tooling/test code (explicit timer imports, intentional large-value parsing, and a fake event method); corrected without suppressions. Circular regression retains the accepted11-model component, with no unexpected cycle. No build was required for standalone tooling/documentation with no production build-input change.

Files added, all left unstaged: `scripts/auditTransactionCategoryCents.mjs`, `tests/unit/transactionCategoryCentAudit.spec.js`, this design document, and `docs/transaction-category-cent-conservation-audit.md`. Existing production source, tests, data, index and unrelated untracked work remain unchanged. No database connection/setup/cleanup occurred. Historical audit execution and migration approval remain future steps.
