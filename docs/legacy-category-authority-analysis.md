# Legacy Category authority: source and git-history analysis

`transaction_categories` is non-authoritative and must not be used for legacy Category-economic reconstruction. Its presence, absence or disagreement with current JSON supplies no compatibility evidence. Earlier forensic/Class B documents and report observations concerning that table are superseded for this decision; they remain observations only. No database was accessed, no new audit script was created, and no compatibility or financial code was implemented.

## Evidence and limits

Source establishes a program's possible behavior, not the deployed creator/editor version of a record. The supplied Class B report contains 35 Plaid-linked regular Transactions (33 credit, 2 depository), created between 2024-07-26 and 2026-10-08. One, 6107, is deleted. All current arithmetic screens pass. The report does not establish complete monetary revision history. Missing log fields do not prove no edit occurred. A Plaid linkage does not exclude subsequent manual editing.

P1 means the same amount supplies JSON and a Category mutation at that operation. It does not by itself establish net historical economics after subsequent operations. P2 requires demonstrated equivalent cent effects; P3 means divergence is possible; P4 means the necessary path/provenance is unknown.

## Plaid eras and monetary sources

| Era / source reference | JSON / Category / Account sources | Classification |
| --- | --- | --- |
| Before July 2024 JSON transition | No contemporaneous JSON-authority premise is established here. Pre-transition persistence is not used to reconstruct Category effects. | P4 for JSON-based reconstruction |
| July 2024 transition (`ed36358`, `22a4836`, `9372786`, `957d76e`, `6ee76bc`) onward: creation | Account.addTransaction creates AccountTransaction from negated Plaid amount. assignUnassigned stores that in JSON and returns the same amount for Institution's unassigned accumulation. autoAssign computes integer-cent allocations and uses each amount/100 for both JSON and a Category increment. | P1 for shared allocation source; aggregate unassigned persistence needs batch evidence |
| July 2024 onward: modifications (`8c91524`, post-transition `22a4836`, still present at `137fbdd`) | New relational amount is negated provider amount. New unassigned JSON is old amount plus `newAmount - sum(current JSON)`. The same delta is returned for later Institution Category mutation. Other allocations are retained. Historical Account delta handling mainly recognized pending-to-posted changes; date/amount eligibility was not the current replacement calculation. | P1 for delta source, P3 for universal final-effect inference |
| July 2026 (`7546324`) | Institution account initialization and date/pending accumulation changed. JSON allocation mechanism remained; unassigned effects were filtered by transaction date and accumulated before save. | P3 for universal lifecycle equivalence |
| October 2026 (`f6bffeb`) current | Account deltas replace old applied amount with new applied amount. Auto-assignment respects start date. Crossing start date applies/reverses stored JSON allocations; unassigned remains accumulated by Institution. Creation uses provider amount; modifications use JSON sum/delta and old JSON for eligibility reversal. | P1 for direct mutation sources; P3 across arbitrary historical transitions/batches |

These classifications concern Category authority, not reopening provider correctness. Unary sign inversion alone does not generate fractional precision. Auto-assignment's cent allocation normally produces cent-exact JSON. Manual split remainder arithmetic and Plaid modification of that JSON can generate tiny artifacts. No source fact proves all 35 came from one writer.

## Category storage and exact arithmetic

Migration 1626492670876 defines Category amount as decimal(12,2); 1699459162542 renames it to balance without changing scale. Category.balance consumes database numeric text with parseFloat. Writers generally load a Category, perform JavaScript addition/subtraction, and save the resulting number to scale-two numeric. They do not perform an exact SQL increment. A save does not imply the supplied number has been reloaded. Auto-assignment and ordinary PATCH usually fetch/save separately per allocation. Institution accumulates unassigned deltas across transactions/pages before one Category save. Category transfers aggregate old/new deltas per Category before saving.

Let R be exact decimal scale-two half-away-from-zero. If b=k/100 is an old exact cent balance and x=n/100+e with |e|<0.005, then R(b+x)-b=n/100. Proof: the sum lies strictly inside the rounding cell centered at (k+n)/100. No epsilon validity policy is involved. At half ties this translation argument fails: R(-0.01+0.005)-(-0.01)=0, whereas R(0.005)=0.01. Therefore sign-symmetric half-away rounding is not enough to assert unconditional translation invariance.

For the observed tiny artifacts, a single exact-decimal addition to an exact-cent old balance is safely away from a half-cent boundary. This establishes conditional old-balance independence. The actual code also parses and adds IEEE-754 numbers. At supported balance magnitudes below 10^10 dollars, double spacing is at most 2^-19 dollars; one normal parse/add step cannot move a cent-centered result by half a cent. This bound covers a single bounded operation near cents, not arbitrary intermediate sums, overflow, many accumulated operations, concurrent changes, or an unreloaded sub-cent model balance.

Critically, a current near-cent split does not prove every historical delta was near cents. Example in exact decimal arithmetic: initial JSON 0.004 has zero persisted effect; an update changes JSON to 0.006 by applying delta 0.002, also zero effect. Current JSON rounds to 0.01, yet the accumulated balance effect remains zero. Historical unassigned adjustment and grouped transfer old/new updates have this general non-telescoping possibility. Current split and total screens cannot rule it out.

## PATCH, modifications and reversals

TransactionsController's post-transition edit (`ed36358` and current) reverses old JSON amounts and applies replacement JSON amounts through individual Category saves; Account effects use AccountTransaction independently. Per-step cent rounding can telescope for an exclusively cent-equivalent, applicable, complete mutation chain. It cannot be presumed without the chain. Date/pending changes and edits that omit allocation replacement require independent eligibility analysis; current JSON is an allocation snapshot, not a complete ledger of all mutations.

Plaid modifications preserve non-unassigned JSON and adjust/add unassigned by a raw-dollar delta, then Institution accumulates the delta. This is not the same rounding sequence as reversing old mapped cents and applying new mapped cents. Current start-date crossing behavior reads old/current JSON; earlier versions did not have the same replacement semantics.

6988's July 29, 2026 log records AccountTransaction -6.48 to -7.68. This is chronologically compatible with the pre-October Plaid delta implementation, but a log date is not proof of deployed version or provider origin. Manual PATCH can also log relational changes. Old allocation values, batch deltas, and eligibility are not established by that amount-only history. No operands or old Category effects are inferred.

Current Transaction DELETE and Account.deleteAccountTransaction use persisted JSON amounts for Category reversal and relational amounts/principal for Account effects, subject to applicability/loan rules. They mark/delete according to existing lifecycle semantics; an already deleted transaction is not permission to reverse it again. JSON is operational authority for these readers, but that does not independently prove previous net Category effects.

## Funding 4387 and archived funding

FundingDialog before `63d6f16` (August 8, 2024) calculated percentage allocations in raw dollar units. That commit introduced cent truncation and residual handling; `cd7e05f` changed rounding, and the closed 2026 residual correction remains unchanged. The July 1, 2024 creation date of 4387 is compatible with raw-dollar-era creation, not proof of creator version or absence of edits.

CategoriesController.transfer persists supplied split amounts and applies their per-Category sum; replacement subtracts old JSON and adds new JSON into an aggregated delta. baseAmount and embedded percentage/fixed settings are generation snapshots, not a separate posted ledger. Current Category configuration is current context, not historical authority. Client generation can reuse/regenerate snapshot data and submit replacement JSON. Thus funding is P1 for supplied creation amounts versus applied delta, but P3 for a general claim that current JSON normalization reproduces cumulative effects after replacement. Record-specific applicability remains P4 where revision evidence is missing.

4387's independent and grouped candidate cents conserve zero. This supports a candidate allocation, not L1 proof. Its current per-Category JSON and authoritative revision history, together with the applicable grouping/persistence sequence, must establish preservation. No excluded-table observations are used for or against this conclusion.

4596–4597 stay L3 archival-preservation candidates: deleted, material residuals and genuinely sub-cent generation snapshots. Preserve exact JSON in a legacy persistence/display DTO. Do not silently hydrate into canonical posted cents, regenerate new transactions, or reactivate through permissive legacy validation.

## Current readers and migration exposure

| Population | Financial / historical readers of JSON | Design consequence |
| --- | --- | --- |
| Active ordinary Class B | TransactionsController PATCH/DELETE; Account Plaid modification/removal; Institution account removal; Category JSON membership checks; Budget/Category historical aggregates and CheckBalances | Requires explicit safe legacy hydration or an unresolved legacy state before arithmetic. JSON-derived aggregate queries are not proof of historic mutation order. |
| Deleted ordinary 6107 | History/display may retain JSON; active reconstruction queries normally filter deleted; provider updates/removals guard deleted state | Preserve archival DTO; ensure financial readers retain deletion guards. Do not silently discard history. |
| Active funding 4387 | Transfer replacement; generic Transaction deletion; FundingDialog history/reuse; Category/Budget historical aggregate queries | Funding-specific legacy decision, not ordinary AccountTransaction predicate. |
| Deleted funding 4596–4597 | Historical/display snapshots; potential dialog reuse must cross new-write validation; active aggregates filter deleted | L3 isolation. Historical query exclusion branches must be considered individually, not assumed globally. |

The separate legacy CategoryTransfer deletion route is not authority for these Transaction JSON records. No substitute persistence table is promoted to economic authority.

## Structural rule and remaining evidence

No population-wide automatic L1 is justified yet. Conditional L1 requires supported regular/nonloan single AccountTransaction semantics; exact valid bounded current JSON; path-supported exact split mapping; independent/total/per-Category conservation; and an authoritative lifecycle chain that establishes cent-equivalent Category deltas under actual eligibility, grouping and persistence boundaries. Pure cent-exact writer revisions may establish P2 once the whole relevant chain is known. Half ties, material sub-cent historical inputs, unknown intermediate grouping, and incomplete provenance remain outside it.

Decimal half-away-from-zero is the diagnostic rule supported by numeric persistence. It is not adopted as a universal historical conversion rule: some algorithms use Math.round integer cents and other paths normalize only grouped totals/deltas. No general tolerance or new-write exception is proposed.

Additional authoritative evidence would need the old/new Transaction.categories revisions, applicable writer/deployed version, account start-date and transaction eligibility at each financial change, and the unassigned/grouped mutation values and persistence sequence. Transaction JSON supplies current allocations; transaction logs can establish specific recorded changes but absent fields cannot establish missing revisions. Directly linked provider observations can establish provider amounts/dates/pending values, not Category allocations. Deployment/version evidence must come from deployment records, not transaction timestamps alone. Aggregate current Category balances cannot supply a per-event missing delta. No further script or database query is proposed now; where this history was never retained, another production read cannot manufacture it. An explicit domain-authority decision or L3/L4 handling may be necessary before migration.

New posted writes must remain strict cent-exact or generated integer cents. Any future evidence-qualified legacy read adapter must be separate from write validation. The correction excluding the non-authoritative table does not itself prove or disprove L1 for any record.
