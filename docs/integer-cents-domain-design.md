# Integer cents for posted currency: architecture evaluation

Historical architecture evaluation. The final decisions and implementation sequence are in [integer-cents-implementation-plan.md](integer-cents-implementation-plan.md). Its strict-input, legacy-preservation and provider-gate decisions supersede provisional recommendations below; retain this document as historical analysis.

Architecture only. No types, converters, model hooks, validators, JSON, schema,
provider behavior or financial calculations are changed. No database was queried.
The existing 72-case characterization supplies the runtime evidence.

## Recommendation and scope

Recommend **B / Scope 2**, incrementally: canonical signed integer cents in the
server's posted financial domain, retaining dollar-denominated HTTP and PostgreSQL
numeric(12,2) initially. Begin with explicit domain records/services and adapters,
not a global change to Lucid consume hooks or shared API types. Migrate client
committed financial state later as a separately reviewable phase. This is a larger
correctness investment than ingress rejection, not an immediate one-line fix.

Scope 1 (dollars -> validated cents -> dollars before existing logic) prevents raw
sub-cent ingress disagreement if all ingress is covered, but retains floating
balance mutation, generated-amount drift, ambiguous units and raw response risks.
It is lower risk and can be an interim protection, but not the target architecture.

Scope 2 prevents internal additive drift and enforces conservation in one unit.
It requires explicit API/model/JSON/report/provider adapters and a legacy-data
compatibility decision. No physical schema migration is necessary *if* existing
relational and JSON dollar representations are retained. Existing invalid JSON
still requires an audit and explicit disposition before strict domain consumption.

Scope 3 moves API, JSON, database and client state to cents. It also requires schema
changes, all API consumers/integration fixtures, historical JSON rewrite/versioning,
SQL/report rewrites and deployment compatibility. Scope 2 captures most arithmetic
benefit without this flag-day migration; no current requirement justifies Scope 3.

## What belongs to posted currency

A recorded currency amount used as an authoritative financial obligation, balance,
allocation or accounting snapshot, rather than an uncommitted estimate or a rate.
This includes AccountTransaction.amount and nullable principle (existing meaning
unchanged), Account/Category balances, actual Transaction.categories split amounts,
transfers, posted funding/opening amounts, Statement start/end balances and balance
history. Pending recorded transaction amounts can be cents even when their financial
effect is deferred; preserve all existing pending/date/deleted/tracking semantics.

Recorded Statement income/gain amounts and Transaction tax attribution are currency
snapshots and candidates for cents, although they do not all mutate account balances.
Fixed funding/goal configuration is currency-valued configuration: represent it in
cents when the funding domain consumes it. Fixed auto-assignment configuration also
becomes cents at its calculation boundary, but its real-storage precision loss is
not corrected or recoverable by that conversion.

Do not convert percentages, rates, recurrence, IDs, counts, dates or quantities.
Forecast monetary inputs can be cents where they represent committed currency
figures; intermediate annualization, bracket multiplication, effective rates and
interest estimates may require fractional/rational arithmetic. Raw provider values
and provenance are external representations, not automatically posted cents.

## Current unit/type inventory and hotspots

- AccountTransaction.amount/principle, Account.balance/plaidBalance,
  Category.balance/fundingAmount, Statement.startingBalance/endingBalance and
  BalanceHistory.balance are dollar-unit numbers; numeric strings are parsed by
  consume hooks. Most monetary columns are numeric(12,2).
- Transaction's internal TransCategory and JSON categories/taxes amounts are raw
  dollar numbers. SQL jsonb_to_recordset readers use decimal without scale-two
  normalization. Statement.data and Tax.data contain currency numbers alongside
  other configuration; TransactionLog changes are historical dollar snapshots.
- common/ResponseTypes TransactionProps, CategoryBalanceProps, AccountBalanceProps,
  StatementProps and funding DTOs are unbranded dollar-number API contracts.
- client State Transaction/Account/Category/Statement/Balance and related interfaces
  use dollar-number fields; form entry may temporarily be strings.
- CategorySpreadEntry.amount means a dollar fixed amount or a percentage according
  to percentage. This boolean-discriminated representation is a unit hotspot.
- Account.autoAssign currently combines dollar transactionAmount/configuration with
  cent remaining/local amount, dividing at boundaries. Its closed correction must
  remain unchanged until a separately verified migration preserves its semantics.
- FundingDialog.computeSpread returns Map values in cents although its input amount
  and later request amounts are dollars. A bare Map<number,number> does not express
  that distinction. Its closed residual logic already supplies cent conservation.
- OFX/start-date effect maps hold cents while models hold dollars. getProposedFunding
  returns rounded dollar numbers after division. Report/history readers return SQL
  decimals or floats and combine them with dollar numbers.

High risk: flipping what model.amount/balance means while old callers still use
number, sending a cent value through a dollar DTO, converting twice, passing a
percentage as currency, and combining domain cents with old raw JSON allocations.

## Type and range safety

Use a branded **number Cents**, with checked construction and a small typed
arithmetic/conversion API. Use explicit amountCents/balanceCents names in new domain
records, and separate dollar-wire DTOs. Avoid plain number conventions. A value
object provides stronger operator restrictions but would add MobX/React/ORM and
serialization friction; it is not initially necessary. BigInt is unnecessary for
ordinary stored balances but useful for parsing and exact ratio intermediates.

A brand does NOT prevent every misuse: TypeScript still allows arithmetic on
branded numbers and widens results to number; Cents is assignable to an unbranded
number. Therefore all domain constructors require validated conversions, domain
methods accept Cents, add/subtract preserve Cents via checked helpers, and outbound
DTO mapping must be explicit. Do not bless raw dollar numbers with casts. If brands
and controlled constructors cannot enforce those boundaries in practice, reconsider
a small value object rather than relying on names alone.

numeric(12,2) maximum is 9,999,999,999.99 dollars = 999,999,999,999 cents, far below
Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991. All currently scale-two monetary
column values fit exactly in integer-number cents. JSON itself has no such bound.
Check integer safety for every result; check column range at persistence. Aggregates
across many records can exceed per-column bounds or eventually safe-integer bounds.

Safe operands do not guarantee safe multiplication: max stored cents * 10,000
percentage units is 9,999,999,999,990,000, beyond MAX_SAFE_INTEGER. Exact rational
allocation should use BigInt intermediate products/division/remainders or another
proven overflow-safe technique, returning checked number cents. This is not a reason
to impose BigInt throughout React state or JSON, which cannot serialize it natively.

## Exact boundary design

External HTTP remains dollar amounts, including existing numeric-string coercion.
Vine validates structure/coercion; a controller/domain adapter converts each actual
currency amount before any balance, JSON snapshot, conservation or posted mutation.
The domain never receives an ambiguous raw dollar amount. Optional/null field
semantics stay endpoint-specific. Do not apply conversion to every vine.number.

Parser requirements: preserve sign, finite check, zero/trailing zeros, canonical
mantissa/exponent expansion, exact two-decimal divisibility and range checks. Derive
integer cents from digits, not Math.round(value*100), parseFloat followed by scaling,
or a percentage helper with nonnegative/10,000-total semantics. The closed percentage
helper supplies a technical decimal/exponent pattern only, not currency policy.
Numeric strings can preserve current Number coercion compatibility; preserve original
text separately if it is provenance. Lossy coercion of huge/out-of-range numbers must
not bypass range checks. No general decimal library is required for this boundary.

Integer cents does not decide external sub-cent policy. Leading default: strict
rejection for explicit manual currency, pending product confirmation. External
0.30000000000000004 remains an unresolved compatibility input: strict canonical
scale rejects it; a tightly bounded ULP-aware recognition policy could produce 30
cents, but cannot prove caller intent and must canonicalize before domain entry.
An arbitrary epsilon is not an architecture. Requiring decimal strings everywhere
would change the API, so do not silently impose that. Internal cents arithmetic
10+20=30 eliminates this compatibility problem for migrated internal sums, not for
external callers or unmigrated client/provider calculations.

Persistence cents -> numeric dollars: use canonical decimal STRING formed by integer
quotient/remainder, e.g. -1234 -> '-12.34', without intermediate floating dollars.
Persisted numeric dollar string -> cents uses exact signed decimal parsing. Keep null
principal/balances null where current meaning requires it; do not normalize absence
into zero universally. SQL aggregate decimal strings cross the same boundary.

Lucid prepare/consume/serialize hooks can eventually centralize field adapters,
including serialization back to API dollars, but a global hook flip is unsafe today.
During rollout, keep legacy Lucid models dollar-denominated and make a typed
repository/domain mapper the only boundary of migrated operations. Existing numbers
from model hooks require checked conversion; preferably obtain raw numeric strings
at the persistence adapter. When an entire model's call graph is migrated, consider
cent hooks with explicit API serialization. Test save-without-reload equality as
well as reload equality; do not rely on PostgreSQL to correct domain values.

## JSON and API serialization

Retain existing persisted JSON **dollar fields** initially, but only explicit
persistence adapters may build/read posted monetary JSON. Write dollar numbers from
canonical cent-formatted strings, and assert JSON round-trip back to exactly the
same Cents within supported range. Domain splits use amountCents; persisted/API
splits keep amount. Avoid silently storing cents under an existing amount key.

This preserves compatibility without retaining competing domain units: wire and
storage are representations, never operands of domain arithmetic. It requires all
JSON consumers, including SQL reports/history and reversal paths, to respect the
boundary. API numeric dollar serialization is inherently a boundary number; decode
back before further financial calculation. No BigInt or brand metadata crosses JSON.

Persisting JSON cents now would require versioned unit names (amountCents or explicit
schema version), historical transformation and SQL/client compatibility work. It is
closer to Scope 3, not a harmless Scope 2 optimization. Historic raw provider/log
snapshots retain their recorded units and do not become ledger inputs automatically.

## Balance, conservation and allocation domain

Balance mutations across manual create/update/delete, split replacement, transfers,
provider add/update/removal, pending transitions, date/start-boundary changes,
opening funding, history and Statements must use checked cent deltas. Keep existing
business applicability rules; changing units must not change when effects apply.
Undo and replay use the same decoded cent allocation. Responses come from the cent
result mapped to dollar DTOs, so save/reload does not create a second value.

Conservation becomes exact: sum(splitCents) equals signed amountCents; transfers
sum to zero. Current rounded comparisons no longer determine whether each raw
amount is admissible. For +.005/-.005, either both are rejected at ingress, or a
chosen signed rounding rule converts each before conservation. Cents alone does
not select the rounding rule. The existing asymmetric half-cent check disappears
only after that explicit conversion policy, not by secretly accepting sub-cents.

Allocation pattern: cent source -> exact rational candidate -> explicit rounding
-> residual cents to existing recipient -> assert exact source conservation.
Percentages/rates retain their own units. Preserve existing tested Math.round tie
semantics and residual ordering during a migration unless separately authorized.
Funding and auto-assignment already partly follow this pattern; a cents migration
must preserve their fixed-sign/base/order rules, not reopen their closed defects.
Budget goal/month proposals need an explicit quantization boundary before posting.

## Statements, funding, providers and forecasts

Statement start/end and current Account balances use cents in domain and dollar
storage/DTO adapters. BalanceHistory follows the same boundary. Recorded Statement
income/gain JSON can retain dollar storage with cent domain adapters. Derived tax
estimates are not forced into cents at each multiplication; quantize only at an
explicit accounting/display/posting boundary. Formatting a forecast to two decimals
alone must not be mistaken for a posted financial mutation.

Fixed funding configuration becomes cents in the funding domain; percentages remain
exact percentage units. Generated funding transactions are cents. Preserve the
existing fixed-before-percentage semantics and valid 100% rule. Do not convert the
shared CategorySpread or auto-assignment configuration wholesale because amount
has mode-dependent meaning.

Plaid/OFX provider guarantees are not established by repository numeric types or XML
parser behavior. Before provider conversion, verify official Plaid Transaction.amount,
account balance, currency-code/FX precision contracts and OFX TRNAMT/BALAMT numeric
format/currency requirements. The app's two-decimal schema/UI does not establish
what providers legitimately supply or support all currency minor-unit conventions.
Raw payload/provenance may retain original precision; canonical posted amount must
be chosen once before both association and split creation. Rejection, rounding,
quarantine or review is a separate product/integration decision, not presumed here.
No provider behavior changes in this design.

Client Taxes uses bracket/rate products, annualization factors and effective-rate
ratios in State/Taxes. Separate recorded income from estimates and rates. Posted
amounts supplied to calculations can originate as cents then enter explicitly
labeled fractional/rational estimate arithmetic. Choose final quantization by
calculation requirements; do not redesign tax algorithms during a units migration.

## Client boundary

Start server-only: current React/MobX state and forms remain dollar DTO consumers,
with existing cent-conserving allocation tests. This leaves client arithmetic risk,
so it is an explicitly intermediate scope, not end-to-end correctness.

Later migrate committed Transaction/Account/Category/Statement financial state to
Cents with API decoding/encoding in State adapters. Formatting consumes cents via
integer decimal formatting; editing '12.', '-', or empty text remains form-string
state until validation/commit. Do not parse every keystroke as a posted integer or
multiply shared percentage/rate inputs. Only fixed-mode values get currency adapters.
The separate client migration touches many state classes, controls, charts, reports,
fixtures and tests; avoid changing all API contracts with it.

## Incremental plan and risks

1. Confirm external cent policy, legacy read policy and provider posting policy.
   Audit legacy JSON read-only before strict domain consumption; no inferred repair.
2. Introduce typed cents/decimal adapters and exhaustive signed/range/exponent,
   JSON/DB round-trip, malformed-input and overflow tests in a future implementation.
3. Establish repository/DTO domain records and cent delta primitives with tests.
   Keep old model attributes in dollars until their users are migrated.
4. Migrate a complete manual Transaction + split + Account/Category balance mutation
   vertical slice, including update/delete/reversal and response mapping. These cannot
   safely be treated as disconnected steps. Support legacy readers explicitly.
5. Migrate transfers and shared conservation, then opening/start-date/history and
   Statement/current-balance slices. Re-run existing lifecycle/ownership tests without
   changing semantics. Each stage has both migrated/unmigrated boundary tests.
6. Migrate provider add/update/removal entry boundaries after provider policy is
   resolved, plus generated funding/auto-assignment cent adapters preserving tests.
7. Migrate funding proposals/fixed config, tax attribution and recorded income,
   report/history readers and relevant command adapters; keep estimates distinct.
8. Optionally migrate committed client financial state; finally audit remaining raw
   dollar domain arithmetic. Do not claim the target invariant complete earlier.

Scope 1 is small-to-medium multi-writer work; Scope 2 is a substantial cross-cutting
migration across controllers, models/services, JSON readers and tests; Scope 3 adds
API/database/data/client deployment migration risk. No credible person-day estimate
is justified by this source-only analysis. Scope 2's main risk is mixed-unit stages,
not integer performance: conversions are cheap, typed helper verbosity is moderate,
ORM serialization and old JSON consumers need careful review. Scoped adapters and
unit-bearing names reduce that risk; untyped model hook flips would increase it.

Simple rejection remains lower implementation risk and can stop new manual
sub-cent writes quickly. It does not merely hide every problem: it fixes a real
boundary defect. But it does not prevent generated floating drift, accidental unit
mixing or heterogeneous response state. Canonical cents eliminates more classes and
is easier to enforce long-term if all boundaries are typed; its breadth demands an
explicit architecture decision rather than opportunistic refactoring.

## Legacy and unanswered questions

Relational numeric(12,2) needs no physical data migration under Scope 2. Existing
sub-cent JSON cannot silently become exact cents: strict readers must detect it.
Keep original history available through a clearly labeled legacy read path, but
reversal/replay cannot consume it as canonical posted state without an explicit
resolution policy. It is unsafe to independently round split entries, choose the
relational amount as truth, skip records or normalize everything to make sums fit.

Audit requirements: per-entry raw JSON amount/baseAmount/fixed configuration/tax
and income precision; signed JSON sums vs associations; pending/deleted/opening
applicability; repeat writes/reversals; representation-only binary noise; malformed
shape; historical logs separately. Report IDs and necessary amounts only. No audit
or repair is authorized in this task. Unknown legacy population is a rollout gate.

Open decisions: strict vs binary-near-cent external acceptance; rounding at any
accepted fractional provider/calculation boundary; provider currency guarantees;
legacy mismatch resolution; forecast vs recorded-income precision; aggregate range
limits; client migration timing. The deferred real configuration defect remains
separate: cents cannot reconstruct precision already lost before ORM readback.
