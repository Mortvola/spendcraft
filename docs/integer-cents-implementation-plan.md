# Posted integer cents: final implementation plan

Status: implementation plan, not implementation authorization. Baseline: 1,136 full-suite tests. No database connection, data mutation, audit script, production code, schema migration or cents adapter is part of this task.

This plan supersedes the provisional policy and migration sections of integer-cents-domain-design.md. Prior characterization, provider design and audit documents remain evidence. Decisions now settled: Scope 2 domain cents; strict cent-exact new input; no binary-near-cent tolerance; no universal legacy L1 conversion. `transaction_categories` is non-authoritative and cannot contribute to economic reconstruction or compatibility decisions.

## 1. Architecture and monetary taxonomy

Canonical posted accounting money is a checked signed integer number of cents inside server domain records and operations. HTTP DTOs, Lucid attributes and existing persisted JSON remain dollar-denominated until explicitly mapped. PostgreSQL numeric(12,2) remains unchanged. Never put cents in an existing dollar `amount` property. No global model hook changes.

| Concept | Domain representation | Boundary/legacy treatment |
| --- | --- | --- |
| AccountTransaction amount and monetary `principle` (existing spelling) | amountCents / nullable principalCents | Exact relational numeric strings; retain loan applicability semantics |
| Account and Category balances | balanceCents | Hydrate current persisted state, never replay legacy JSON to initialize |
| Transaction splits, transfers, opening and posted funding | amountCents per ordered allocation | Canonical JSON adapter or explicit unresolved legacy DTO |
| Statement starting/ending balances, balance history, opening accounting snapshots | Cents | Preserve Statement and tracking authority |
| Fixed funding/goal amounts and fixed generation snapshots | Cents at funding consumption/write boundary | Separate configuration from posted effect; sub-cent legacy configuration cannot automatically generate canonical postings |
| Funding percentages | Existing integer hundredths of percentage point | Existing validation and exactly 10,000 total; never cents |
| Auto-assignment fixed configuration | Explicit currency adapter at consumption | `real` precision loss remains separate and can block exact conversion |
| Statement income and Transaction tax attribution | Separate informational currency DTO | Not automatically a balance mutation; precision policy remains reader-specific |
| Tax forecasts, valuations, intermediate ratios, interest estimates | Decimal/rational or existing analytical number with named units | No automatic Cents conversion or rounding of intermediates |
| Provider provenance and archival history | Original available representation / exact decimal text | Never an implicit posted-money operand |
| Rates, quantities, recurrence, IDs, timestamps | Existing noncurrency types | Excluded |

Pending amounts can be canonical cents while effects remain deferred under existing eligibility rules. Canonical representation does not imply a transaction is applicable, reconciled, economically correct or supported for loan operations.

## 2. Cents type and checked arithmetic

Recommend common/money/cents.ts and common/money/decimal.ts. Export an opaque branded number `Cents`, private brand/constructors, checked named functions, and explicit amountCents/balanceCents/principalCents domain fields. Brands alone do not stop `+` or assignment to number; domain APIs must accept Cents, arithmetic results must pass checked helpers, and DTO/repository modules are the only unit conversion points. No exported unchecked cast.

Use checkedIntegerCents for internal integer construction, addCents, subtractCents, negateCents and sumCents. Validate finite safe integers and normalize negative zero. Aggregate totals may exceed a single column bound but never MAX_SAFE_INTEGER. Use BigInt accumulation where cancellation could otherwise overflow intermediate number sums; validate the final result before converting to number. Persisted scalar/input bounds are separately ±999,999,999,999 cents. A safe integer aggregate is not necessarily persistable.

Use BigInt for multiplication/division intermediates. Maximum scalar cents multiplied by 10,000 is 9,999,999,999,990,000, larger than MAX_SAFE_INTEGER. BigInt is an implementation intermediate, not the ordinary domain or JSON representation.

## 3. Exact adapter contracts

### External dollars to cents

Accept finite numbers or decimal strings. A number uses its canonical Number.toString decimal representation, including exponent notation; original JSON spelling is unavailable. A string is parsed from its own trimmed decimal spelling before Vine number coercion. Define signed decimal grammar with optional exponent, decimal point and digits, accepting examples `1`, `1.20`, `.01`, `1.`, `1e-2`; reject empty, hex, commas, Infinity, NaN and nonnumeric objects/booleans. This grammar is intentional rather than blanket Number() compatibility. Verify endpoint-specific previously accepted syntax before changing HTTP behavior; valid decimal numeric strings remain compatible.

Parse sign, coefficient digits and exponent into BigInt coefficient/scale. Remove insignificant zeros. Conceptually cents = coefficient × 10^(2-scale). If exponent is negative at this stage, require exact divisibility by the power of ten; otherwise reject fractional precision. Do not allocate enormous powers: validate bounded input size and compare digit lengths/divisibility before expansion. Proposed maximum textual length is 1,024 characters, with bounded exponent processing; this is a documented syntax/resource constraint for future adapters, not current behavior. Validate mathematical range, safe integer and normalize zero. No rounding, toFixed, epsilon, nearest-double or scaled binary integer test.

`0.30000000000000004`, numeric or string, is rejected. ±0.004, ±0.005, ±0.006, ±1.004, ±1.005, ±1.006 and ±1.234 are rejected. Trailing zero spellings such as 1.230 are accepted. Sign changes preserve acceptance and negate output.

Vine integration must validate raw currency fields before child coercion loses spelling. Prefer a narrow raw-field rule plus domain adapter; preserve existing required/null/optional endpoint semantics and generic validation errors. Domain conversion remains mandatory even if HTTP validation succeeded. Precision/range/syntax failures use existing validation architecture; no currency helper decides HTTP status.

### Persistence and JSON

Read PostgreSQL monetary columns/aggregates as decimal text and pass through the exact parser with the appropriate scalar or aggregate range. Bypass parseFloat consume hooks in migrated repository reads; do not turn existing model `amount`/`balance` attributes into cents. Driver numeric parser overrides must not globally convert numeric to number. Obtain raw decimal projections alongside the row where necessary, inside the existing transaction/lock scope.

Cents to DB: sign plus integer quotient/remainder produces a canonical decimal string with two digits, e.g. -1234 -> '-12.34'. No floating dollar intermediate. A migrated write uses explicit repository/query-builder bindings or a narrow typed persistence mapper capable of binding strings. Do not cast strings into Lucid number properties. Test save-without-reload and fresh reload equivalence.

Cents to dollar API/JSON: explicitly convert the canonical decimal string to a number for existing numeric contracts. At numeric(12,2) range each cent remains distinguishable; verify canonical-number decimal parsing recovers exactly the original cents. This does not make dollar-number arithmetic safe. Aggregate DTOs outside that range require an explicit exact-string contract or bounded-output policy, not a silent lossy conversion. Future decimal-string monetary DTOs may harden boundaries; they are not part of this migration.

Normal JSON dollars enter the domain only after exact parsing. Prefer exact JSON decimal tokens where reading legacy storage; a number parser can erase stored spelling. Legacy detection must not use rounded SQL casts or Number coercion that hides precision. For new supported-range cent JSON written by our serializer, assert serialize/read round-trip identity. Preserve existing dollar shapes and order; no unit/schema rewrite.

## 4. Legacy representation and active mutation policy

Introduce a read result conceptually discriminated as canonical, unresolved-active-legacy, or archival-legacy. Canonical contains typed cents allocations. Legacy contains original immutable persistence JSON/exact monetary text, IDs, state and diagnostic reason; it cannot satisfy a canonical domain function's parameter. DTO/display serialization preserves recorded dollar representation. A malformed record is separately classified and never made canonical by guessing.

The 35 Class B records and funding 4387 are not L1-approved. Production IDs are examples, not compatibility predicates. 6988's amount history establishes no old Category effects. Current exact arithmetic agreement is a screen, not automatic permission. Existing cent-exact records can hydrate normally, but cent-exactness does not certify economic correctness.

| Strategy | Assessment |
| --- | --- |
| A: old reversal then canonical replacement | Preserves a chosen old code operation, not necessarily the true original economic reversal. Old/new rounding and grouping can differ. Do not adopt as an automatic bridge. |
| B: block mutation pending explicit resolution | Safest recommended default: no guessed delta, no partial Account-only update, no normalized replacement that conceals unresolved reversal. Product approval is a rollout gate because it changes operational availability. |
| C: authoritative migration-on-touch | Allow only under a separately approved transaction-specific resolution with provable Category deltas and replacement cents. Current balance alone cannot establish historical contribution. No implementation in this plan. |
| D: isolated legacy mutation engine | Could retain legacy behavior but perpetuates P3 and creates two mutation policies. Consider only if product explicitly accepts that risk; not the target default. |

Recommended operation contract for unresolved active legacy:

- PATCH changing amount, allocations, Category assignment, date, pending/applicability, type or deletion: reject atomically before any monetary mutation. A fully cent-exact replacement does not solve unknown reversal economics.
- DELETE/reversal, Plaid modification/removal, import reimport and any account/category removal requiring financial reversal: reject/hold the entire affected operation atomically. Never update Account cents alone while leaving an unresolved Category effect.
- Pure descriptive changes may proceed only with a field allowlist proving no change to money/eligibility; preserve exact legacy JSON and do not rewrite it through Number serialization. If this cannot be isolated, block the PATCH instead.
- Category deletion retains existing nonzero membership restrictions and must not normalize/reassign unresolved allocations.
- Reports/history retain explicit legacy decimal outputs. A request for canonical recomputation must return an unresolved result, not round, skip or claim an exact cent reconstruction.

Use a stable legacy-resolution-required domain error, mapped through existing endpoint error conventions; proposed HTTP 409 needs product/API approval. Return IDs/reason, not sensitive details. Provider hold/retry behavior is a separate blocking decision. Resolution must distinguish approved historical reversal deltas from the new canonical posting; neither is inferred from current JSON alone.

6107 and 4596–4597 can remain archival DTOs for history/display. No canonical hydration is required merely to display them. Active financial queries retain deletion filters. Readers with explicit excluded-ID or historical inclusion branches need separate review: not every history query globally excludes deleted rows. Reactivation or copying into a new posting must cross strict new-write boundaries. No data is discarded or rewritten.

`transaction_categories` supplies no evidence or fallback for any of these decisions. No bulk historical JSON migration is planned.

## 5. Current balance authority

Hydrate Category.balance directly from persisted scale-two text. Preserve current balances; do not initialize cents by summing/replaying historical JSON. This establishes representation, not a certification of past economics.

For transaction-tracked accounts, preserve persisted Account.balance/current-balance semantics and existing pending/start-date/deleted rules. AccountTransaction cents provide operation deltas; neither Category JSON nor provider valuation is a substitute balance authority. Existing initialization logic remains until explicitly migrated with tests.

For balance-tracked accounts, Statements remain current-balance authority, with the existing latest-Statement and deletion rules. Account balance/cache and BalanceHistory adapters preserve that invariant; do not introduce ordinary Transactions for these accounts. Opening/starting amounts are computed from checked cents and exact relational eligible aggregates, not raw legacy split sums. Null principal or unavailable valuation retains its existing meaning.

Provider plaidBalance is an observation; it must not automatically become accounting cents. Existing scale-two storage may already have lost original valuation precision. Preserving future sub-cent observations outside accounting columns requires a separate storage/DTO decision, not a covert schema change here.

## 6. Exact conservation and allocation

Canonical ordinary allocations sum exactly to signed AccountTransaction amountCents (or the established supported principal semantics). Transfers/funding sum exactly to zero. Compare integers, never rounded totals. Apply eligibility before constructing exact balance deltas, group by Category as existing semantics require, and persist the resulting balance once per planned mutation.

Funding fixed allocations consume source cents first. Every valid percentage independently applies to the same remaining source cents; percentage units total 10,000. BigInt numerator = BigInt(remainderCents) × BigInt(percentageUnits); denominator = 10,000. Round the exact rational candidate once and assign the difference between source and candidate sum to the final processed percentage allocation, preserving closed residual direction/order. Duplicate destinations remain allowed; accumulate checked cents and assert final conservation.

Preserve the existing allocation tie convention initially: Math.round's mathematical nearest integer with exact half ties toward positive infinity. Implement it by BigInt floor division and nonnegative remainder, adding one when twice remainder >= denominator; do not run floating Math.round. Negative half cases therefore follow the established allocation rule. This is explicit algorithm quantization, not input acceptance; input conversion is sign-symmetric and rejects half cents. A switch to sign-symmetric half-away allocation would change behavior and requires separate approval. Exact rational arithmetic may also differ from former binary boundary errors; test tie/boundary vectors and review intentional differences before funding deployment.

Goal/recurrence proposal division also needs named exact ratio quantization at the generation boundary. Existing recurrence scheduling and ordering remain unchanged. No forecast intermediate is forced through that boundary merely for display.

Auto-assignment must retain mixed fixed/percentage semantics and residual order. Do not extend funding's 100% rule to auto-assignment. A `real`-stored fixed amount that is no longer cent-exact cannot be restored by a strict converter. Resolving that configuration precision or approving an explicit legacy configuration adapter is a blocker for its complete canonical migration; do not silently round it or change its column in this task.

## 7. Provider, import and currency gates

The reviewed provider design remains authoritative evidence: no universal Plaid cent guarantee; sub-cent valuation balances can be legitimate; OFX permits finer precision and current parsing can lose spelling. No new external research is needed to restate those completed findings.

Plaid posting boundary: currency/sign interpretation and exact amount conversion before Account.addOrUpdateTransaction creates rows/JSON or changes balances. Creation, modifications and removals must migrate together, including Account/Institution accumulation and webhook/worker transaction boundaries. Reversals use original canonical posted cents, not recomputed raw provider values. Legacy old allocations invoke the unresolved-operation guard.

OFX: preserve monetary text at parsing, use the provider grammar rather than general JS number coercion, resolve currency/sign, then exact conversion before relational/JSON posting. Keep existing identity/reimport logic; modifications reverse canonical old allocations or hold unresolved legacy. Reject the import atomically with actionable record references when posting conversion fails unless a separate approved durable review workflow exists.

BLOCKING PRODUCT DECISIONS before provider deployment:

1. Supported posting currency: recommend explicit USD-only initially, but production observations do not authorize a universal USD assumption. Missing/unofficial/non-USD currency must have an approved fail/review policy; no implicit FX conversion.
2. Sub-cent events and unresolved legacy modifications/removals: approve surface-and-hold/retry versus durable quarantine. Default safe design rolls back financial mutations and does not advance cursor/checkpoint past an unrecorded event. A batch can block ongoing synchronization, so user-visible recovery and retry limits need explicit design. Never silently skip. Durable quarantine allowing cursor advancement would require durable replay/idempotency state and likely schema work; not assumed.
3. Provider balance precision: decide where high-precision valuation is retained, and how initial/accounting balance is established when a valuation is not cent-exact. Do not silently quantize.

Provider SDK numbers have already lost wire spelling; use their available canonical decimal value strictly, without inferred tolerances. Raw provenance remains separate. Provider pending transitions, replay and amount modifications must be tested, not reopened as unrelated correctness work.

## 8. Monetary JSON inventory and reader disposition

| Field | Classification / plan |
| --- | --- |
| Transaction.categories[].amount | Posted state: canonical adapter or explicit legacy state; PATCH/reversal/provider readers must discriminate |
| Transaction funding baseAmount | Configuration/generation snapshot: cent input for new generation; preserve sub-cent archival snapshots, never normalize implicitly |
| Category funding_categories and embedded fundingCategories fixed amount | Currency configuration at generation boundary; percentage=true excluded |
| Transaction.taxes[].amount | Informational tax attribution; distinct reader DTO, not necessarily equals transaction total |
| Statement.data income/gains/dividends/interest | Informational currency; relational start/end balances alone drive Statement balance semantics |
| Tax.data income/deduction/estimated AGI/prior tax fields | Analytical inputs; preserve intentional precision and quantize only an explicitly posted result |
| TransactionLog.changes monetary old/new fields | Historical evidence/display, no implicit restore or replay; optional null is not zero/malformed currency |
| PlaidLog.response transaction/balance amounts and currency | Provenance/valuation, higher precision permitted; never promote whole payload into posted domain |
| OFX source | Original monetary spelling not currently dedicated persisted provenance; no inferred historical precision |
| Webhook IDs/status, locations, search strings, rates, recurrence | Noncurrency; excluded |

Legacy representations remain available for display/export and exact-decimal report aggregates. Analytical totals with legacy input must be labeled as recorded-history values rather than canonical accounting reconstruction. No DTO silently chooses cents where an exact result is sub-cent.

## 9. SQL/query-builder migration inventory

The following active monetary query families were located in source. Each slice must re-run source searches and inspect all callers; this table is the migration checklist, not permission to globally rewrite queries.

| Paths | Treatment |
| --- | --- |
| AccountsController account history windows; ReportController net-worth/account movement windows | Keep SQL numeric relational arithmetic and tracking/Statement authority; remove float coercion before exact text decoding; return checked cents or explicit report decimal |
| AccountsController/TransactionsController Statement credits/debits and search amount comparisons | Bind canonical decimal inputs; decode numeric sums exactly; preserve existing statement links and filtering |
| Account.updateStartingBalance eligible sum | Exact numeric aggregate to checked cents; subtract from hydrated current balance; no JSON replay |
| Category.balances and CategoriesController proposed funding sum/previousSum/previousFunding/baseAmount/transfer aggregates | Legacy-compatible exact decimal reporting until inputs qualify; no automatic rounded history into canonical generation |
| CategoriesController debit aggregates, Budget.getProposedFunding future JSON sum | Distinguish analytical history from new generated cents; unresolved legacy arithmetic requires explicit outcome, not coercion |
| Budget pending AccountTransaction sums | Relational cent aggregates; checked range and existing applicability |
| ReportController category/payee/monthly/income/expense JSON aggregations | Preserve exact numeric legacy totals and classify results; replace float casts before canonical decoding; aggregate cent inputs exactly where proven |
| TaxesController Statement data casts to real and transaction attribution sums | Analytical/report precision adapter, not blanket Cents; preserve fractional inputs and avoid labeling forecast totals posted state |
| CheckBalances and Budget/Category reconstruction/sync helpers | No migration-time replay of legacy JSON or automatic balance correction. Audit/diagnostic results can be decimal; any existing write-capable recomputation must be gated when legacy inputs exist |
| Controller Category/Account balance saves; transfers; Statement and BalanceHistory saves | Rewrite only migrated operations around checked domain cents and exact decimal string bindings |
| Account/Institution provider aggregation and OFX helpers | Migrate deltas to checked cents with the entire lifecycle; provenance remains outside |

SQL decimal arithmetic at a reporting/persistence boundary is acceptable. Never use numeric(...,2) casts to certify legacy JSON cent-exactness. Integer-domain operands can be bound as canonical dollar strings without changing columns. Preserve locks, transactions, authorization and lifecycle predicates; precision changes are not permission for unrelated SQL refactoring.

## 10. Client strategy

Keep existing API dollar response types, display components and form strings initially. Server-side financial functions receive only adapters' Cents. Client input strings such as '12.' remain editing state until committed conversion; do not reinterpret percentages through currency helpers.

Move calculations that determine posted payloads to shared cents helpers before enabling strict endpoints: CategorySplits remainder/sign handling, TransactionDialog amount/split construction, FundingDialog/FundingItem spread and submit amounts, transfer forms, opening and Statement balance entry. Serialize only at request construction. This avoids the new server rejecting client-generated 0.30000000000000004. Generic CategorySpread remains generic; fixed-mode owners convert currency, percentages retain their separate rules. No wholesale UI/state rewrite is required. Broader committed MobX financial-state migration is a later optional slice.

## 11. Ordered implementation slices and gates

Every behavior slice requires both TS projects, ESLint, Knip, circular/diff checks and focused tests. Client/server builds apply where affected. Database tests require fresh authorization for that slice and configured/live target safeguards; none are authorized here. Full-suite baseline stays 1,136 until actually rerun in a later implementation task.

| Slice | Deliverable and invariant | Focused gate / coordination |
| --- | --- | --- |
| 1 | Pure Cents + exact adapters + checked arithmetic, unused by runtime | Pure exhaustive boundary tests; no DB or behavior change |
| 2 | Persistence mappers and canonical/legacy read union, no global hook flip | Raw decimal/mock save/reload tests; legacy DTO preservation; no active mutation yet |
| 3 | Legacy operation guards and archive/history access | Atomic rejection across money-changing routes; metadata allowlist; product approval for blocking behavior before activation |
| 4 | Client ordinary split/remainder adapters and strict raw currency validators | Numeric-string spelling, cent payloads, rejected precision, required/null semantics; coordinated with slice 5 so valid UI arithmetic stays submittable |
| 5 | Manual Transaction vertical slice: create + AccountTransaction + Category/Account cents + PATCH/delete/reversal | Conservation, complete rollback, pending/date/statement/category ownership existing regressions. Internal helpers can land disabled separately; all related mutations activate together |
| 6 | Category transfers create/replace/delete | Exact zero sum; duplicate grouping; old/new canonical deltas; unresolved legacy blocked; keep lifecycle rules |
| 7 | Opening/starting balance and balance-history adapters | Exact eligible sums; no legacy replay; save/reload equivalence and tracking invariants |
| 8 | Statements/current balance | Exact start/end/history, latest Statement authority; existing DELETE/linkage tests; income DTO separate |
| 9 | Funding configuration/proposal + client allocation + posting vertical slice | Exact percentage rational/residual tests incl negatives/ties; fixed-only/mixed; history unresolved gate; no closed invariant changes |
| 10 | Generated/recurring funding paths | Same canonical constructor and allocation engine; existing scheduling tests; no recurrence redesign |
| 11 | Plaid creation/modification/removal + Institution accumulation | Provider/currency gates resolved; no skipped cursor; idempotent retries/reversals; unresolved legacy holds; coordinated worker/controller deployment |
| 12 | OFX parsing/posting/reimport | Exact text/currency/sign/range; replay identity; atomic import failures and legacy guards |
| 13 | Auto-assignment consumption integration | Preserve closed mixed-unit behavior; deferred real-precision issue resolved separately or explicit guard; no covert schema fix |
| 14 | Reports/raw SQL/history/net worth/tax DTO readers | Exact-decimal legacy output vs canonical sums; deletion/Statement authority; no balance reconstruction from legacy |
| 15 | Remaining server writer/reader inventory and optional committed client state | Search audit of raw monetary arithmetic; all new posting paths guarded; targeted then authorized full-suite/build completion |

Slices 2–3 and legacy-aware report readers must precede strict domain hydration of active existing records. Generated and provider paths still use dollars until their complete operation boundary migrates; they must not call cents helpers with raw model attributes. Do not claim the global no-new-sub-cent invariant until every posting writer is covered. Intermediate releases state exactly which writers are protected.

Loans retain existing semantics; ordinary migration excludes unsupported loan/principal paths from new helper reuse until an explicit compatible unit adapter can preserve them. The financial-domain migration is not complete for those paths until that integration is safely verified; loan rearchitecture remains separate.

## 12. Test matrix, rollout and rollback

Foundation tests: zero/negative zero; ±0.01/±1; ordinary decimals and trailing zeros; string whitespace/grammar/exponents; maximum ±9,999,999,999.99; beyond-column values; nonfinite/malformed/very long input; all requested positive/negative fractional-cent thresholds and 0.30000000000000004 rejected; safe integer construction and add/subtract/negate/sum overflow; decimal serialize/parse round trips including max; API number round trips over supported scalar range; canonical constructor rejects legacy fractions while legacy DTO preserves exact text. No half-cent input normalization. Separate future allocation tests cover exact rational ties and historical tie convention.

Behavior gates add JSON/relational/response/reload identity, exact split conservation, complete state snapshots on rejected writes, new and legacy records side by side, duplicate Categories, pending/date/deleted transitions, provider retry/cursor behavior, legacy-operation atomicity and historical report disclosure. Preserve closed residual vectors and funding percentage tests. Existing 72-case moneyPrecision characterization remains historical evidence: change expectations only for a writer intentionally migrated in that slice, retaining explicit legacy/provider characterizations.

Rollout: first land unused utilities, then explicit mappers and guards. Activate each complete vertical slice with its applicable client payload adapters; all workers and HTTP paths touching the same monetary operation must use consistent boundaries. Preserve external JSON/column dollar units throughout. Feature/operation switches, if needed, select the entire domain operation, not individual balance steps. No mixed old/new side effects in one operation.

Rollback: stable dollar persistence remains readable by older code, but rolling back strict writers could reintroduce sub-cent writes. Preserve ingress protection/guards or pause impacted posting operations during rollback. A brand has no persisted runtime meaning, so no stored cents may be interpreted as dollars. Do not roll back only one half of coordinated provider/client/lifecycle deployment. No bulk data rewrite or balance reconstruction is required for initial Scope 2.

Blocking decisions: approve unresolved active legacy mutation behavior/error contract; provider retry versus quarantine and user recovery; supported currency; precision-preserving provider valuations and balance initialization; deferred auto-assignment configuration conversion; treatment of historical analytical outputs when canonical arithmetic requested. These block their affected slices, not foundational utilities. No additional broad forensic audit is proposed to recover unavailable historical state.

## 13. Exact next implementation prompt

```text
Read AGENTS.md first. Implement ONLY the unused pure cents foundation described in docs/integer-cents-implementation-plan.md, slice 1.

Add common/money/cents.ts (opaque branded number Cents; checkedIntegerCents; checked add/subtract/negate/sum; safe-integer invariant) and common/money/decimal.ts (exact signed decimal coefficient/scale parser, externalDollarsToCents, databaseDecimalToCents, centsToDatabaseDecimal, centsToDollarNumber). Add tests/unit/cents.spec.ts using the repository's pure-unit conventions. Do not wire these modules into runtime callers. Keep syntax/error results typed and independent of HTTP/Vine. Avoid unused exports failing Knip: use repository-consistent entrypoint configuration only if justified and report it; do not hide diagnostics.

Support finite canonical numbers and decimal strings without losing spelling. Parse bounded signed decimal/exponent grammar exactly using BigInt intermediates. Accept cent-exact values/trailing zeros; normalize negative zero; reject malformed/nonfinite/sub-cent values. No Math.round/toFixed/epsilon/ULP acceptance. Preserve ±999999999999 cents scalar persistence/input bounds separately from safe-integer aggregate arithmetic. Produce canonical two-decimal DB strings via integer quotient/remainder. Ensure numeric dollar DTO round trips within supported scalar range. No production Cents casts outside controlled constructors. Document 1024-character input resource bound and bounded exponent handling.

Pure tests must cover zero/negative zero, ±0.01/±1, 1.2/1.20/1.230, valid numeric strings and signed/exponent spellings, maximum ±9999999999.99 and overflow, safe integer boundary and arithmetic overflow, malformed strings/objects/booleans/NaN/Infinity/extreme exponent/long strings, rejection of ±0.004/±0.005/±0.006/±1.004/±1.005/±1.006/±1.234 and number/string 0.30000000000000004, sign symmetry, DB round trips and API number round trips. Canonical conversion must reject legacy sub-cent representations; do not add a legacy rounding adapter, money allocation engine or legacy DTO implementation yet.

No database connection or database tests. No validators/controllers/models/client/provider changes, schema/JSON changes, money behavior migration, application data access, audit scripts, full suite or commit. Do not modify fundingPercentages or closed monetary fixes. Run focused pure tests, both TypeScript checks, ESLint, Knip, circular regression and working-tree/staged diff checks. Report added files, exact algorithm/error/range contracts and results. Do not proceed to slice 2.
```
