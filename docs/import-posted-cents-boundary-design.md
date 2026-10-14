# Imported monetary precision and posted-cents boundary

Design only. No provider, application, database, or API behavior is changed.
Manual input remains subject to the decided strict cent-exact decimal policy. Provider contracts must be evaluated separately.

## Repository ingress inventory

| Ingress | Consumed money | Current flow and precision |
| --- | --- | --- |
| Plaid account discovery / online-account creation (`InstitutionController`) | `accounts[].balances.current` | SDK number; Credit/Loan sign adjustment; Account balance/plaidBalance and opening funding reach scale-two columns. Null may currently become zero. |
| Plaid sync (`Institution.syncTransactions`, `addOrUpdateTransactions`, `updateAccountBalances`) | added/modified `Transaction.amount`, account `balances.current` | Account creates/updates signed AccountTransaction dollars, transaction category JSON and Category effects. Account deltas and provider balance enter scale-two persistence. Responses can contain supplied in-memory numbers before reload. |
| Plaid sync triggers | same fields | Controller, InstitutionSync command, QueueListener/webhook processing funnel into the same model/wrapper. The older getTransactions invocation in Account is commented out. Refresh command requests provider refresh rather than posting another representation. |
| OFX HTTP upload (`AccountsController.uploadOfx`) and `ofx:upload` command | `STMTTRN.TRNAMT`, `LEDGERBAL.BALAMT` | Both call Account.processOfx. SGML is transformed to XML; XMLParser defaults coerce numeric tags. Internal transactionData negates TRNAMT; AccountTransaction creation negates again. Preserve the established signs. JSON split amounts and relational amounts can diverge for sub-cent input. Ledger balance updates Account/history and opening funding through updateStartingBalance. |

No additional production CSV/QIF/general financial-file importer was found in app, providers, commands or routes. Manual/internal writers are separate boundaries, not new import formats. Loan account current balances are consumed, but no Plaid liabilities/principal/interest breakdown endpoint is consumed; deeper loan semantics remain deferred.

Plaid logs preserve sanitized **parsed SDK responses**, not wire-level decimal spelling. Transaction logs can preserve old JSON snapshots. OFX processOfx does not persist a dedicated raw source document. Relational financial amounts/balances are dollars in numeric(12,2); allocation JSON holds numbers and can retain finer precision. Some allocation deltas already pass through integer cents, without establishing a universal ingress invariant.

## Official contracts

[Plaid Transactions](https://plaid.com/docs/api/products/transactions/) describes amount as a double in the indicated ISO/unofficial currency, positive for outflow and negative for inflow. The consumed field documentation supplies no two-decimal or minor-unit precision guarantee. This is an absence of a guarantee, not a guarantee of arbitrary precision.

[Plaid Accounts](https://plaid.com/docs/api/accounts/) describes balances as nullable doubles with currency metadata. Its investment/401k USD example includes current balance 23631.9805: reported balances can legitimately be sub-cent valuations. Only current is consumed here; available/limit are not posted by these paths. SDK monetary values are JavaScript numbers, so original decimal spelling/trailing zeros and any precision lost during JSON parsing cannot be recovered from diagnostic logs.

The repository's tested OFX format is OFXHEADER:100, DATA:OFXSGML, VERSION:102 credit-card statements. The parser ignores the declared version and processes CREDITCARD message blocks; this is not complete OFX 2.x/banking/investment support.

[Official OFX 1.0.2 archive](https://financialdataexchange.org/wp-content/uploads/2025/12/ofx1.0.2spec.zip), Ofexfin1.doc section 3.2.9, defines an A-32 amount representation without a universal two-fractional-digit limit; it allows a decimal point or comma and client-specific precision limits. [OFX Banking 2.3](https://financialdataexchange.org/wp-content/uploads/2025/12/OFX-Banking-Specification-v2.3.pdf), sections 3.2.9 and 5.2, retains these amount principles and currency declarations. These descriptions do not establish exponent notation as an accepted amount syntax; future import parsing should use the documented decimal grammar, rather than assuming that parser acceptance means specification support.

Pure installed-parser probe (no application boot): 0.005 and -0.005 become numbers; 12.340 becomes 12.34; 0,005 remains a string; 1e-2 becomes number 0.01. Thus existing coercion loses spelling and can accept notation not demonstrated by the amount contract. Comma support needs an explicit future lexical adapter rather than numeric coercion.

## Currency prerequisite

SpendCraft uses dollar/two-decimal presentation and storage, and Plaid Link selects US country coverage. It does not consume/persist iso_currency_code, unofficial_currency_code or OFX CURDEF, and no FX conversion was found. US coverage does not guarantee USD. Therefore universal Cents is valid only for an explicitly established supported two-decimal currency; current behavior does not establish an enforced USD-only contract.

Recommend confirming USD as the initial posting currency and gating non-USD, unofficial and missing currency metadata. This is a product decision, not an implemented restriction. OFX statement currency and any transaction-specific currency/converted amount declarations must be resolved before posting; do not silently convert or label foreign values as USD. Multi-currency design remains outside this task.

## Proposed posting boundaries

Plaid: immediately after SDK response validation and currency/sign interpretation, **before** Account.addOrUpdateTransaction mutates state or creates any monetary JSON. Account-discovery and updateAccountBalances need the equivalent boundary before opening transactions, history, or accounting balances are generated. Preserve parsed provenance, currency, provider identity, adapter-policy version and checked posted cents; exact wire spelling would require separate approved capture, and must not be claimed recoverable today.

OFX: parse monetary tags as bounded decimal text before XMLParser's general numeric conversion; resolve statement currency, apply existing sign mapping, then convert before AccountTransaction creation/update, split generation, ledger-balance posting or opening funding. Preserve only appropriate source provenance under an explicit retention policy. Do not retain entire sensitive payloads indiscriminately.

Accepted cents become the sole amount for relational adapters, JSON serialization, balances, allocations and responses. Existing API/DB dollars remain boundary representations. Range check against numeric(12,2) and safe integer cents. Provider numbers use their canonical finite decimal representation; OFX uses original decimal text. No epsilon or casual Math.round is justified by these contracts.

## Fractional-provider policy recommendation

Auto-post cent-exact supported-currency transaction values. For sub-cent, malformed, out-of-range or unknown-currency values, surface a precise import/sync error and do not silently post. Do not advance a cursor past an unrecorded event. Existing transactional failure can preserve state, but durable held-event processing would require a separately designed mechanism: it is not present merely because this document recommends surfacing an error.

Rejecting preserves accounting clarity but can block sync. Automatic rounding improves continuity but changes imported money and reconciliation. Raw-plus-derived posting preserves evidence but still requires an explicit approved quantization policy, user visibility and policy versioning. No inspected provider specifies a rounding rule for SpendCraft.

For legitimate sub-cent reported valuation balances, retain the reported value separately from a posted accounting balance. Before using it for opening funding/history/current accounting state, choose whether to surface it or explicitly quantize it. A valuation is not required to equal the sum of posted transactions. Null means unavailable under the provider contract; this design does not alter existing null behavior.

If quantization is subsequently authorized, exact decimal half-away-from-zero is a deterministic sign-symmetric candidate matching the characterized PostgreSQL scale-two ties. Half-even is another valid product choice but not established by these contracts. Neither is adopted here; both require a deliberate decision about transaction versus valuation semantics. Preserve raw values and the derived posted cents, never rely on DB rounding as the policy.

## Lifecycle precision implications

Plaid modifications must reverse the **old stored posted cents** and apply the newly derived cents; removals use the original posted cents, not a fresh conversion of raw provider data. Current delete already reads stored rows/JSON, but legacy disagreement means those must be audited before cents-domain reads select authority. Preserve pending/date behavior without redesign.

OFX identity remains FID:ACCTID:FITID, independent of cent conversion. Reimport must use a deterministic versioned adapter and compare posted cents; unchanged provenance/policy must reproduce the same cents and split residuals. A policy change must not silently reinterpret an already posted transaction. Existing explicit-split/reimport semantics remain closed.

## Future regression coverage and legacy audit

Adapter tests: signed cents, zero/negative zero, trailing zeros, canonical scientific number strings, OFX decimal/comma syntax, unsupported exponents, sub-cent thresholds, schema maxima, overflow, null/nonfinite/malformed input and currency codes. Distinguish SDK numbers from exact OFX text. Include documented USD valuation 23631.9805.

Integration tests after implementation/authorization: posted JSON/rows/responses agree; cent conservation and balance effects; modification delta; exact reversal/removal; replay/cursor failure; OFX same-ID reimport; raw provenance unchanged; provider account-balance/opening/history boundary. Do not write tests for nonexistent adapters now.

Future read-only legacy audit must compare JSON split amounts against relational AccountTransactions and balance effects, identify provider origin/identity where available, examine old snapshots used for reversal, and flag discarded/unknown currency. Parsed Plaid logs can corroborate values/codes but cannot reconstruct original numeric spelling; OFX source may be unavailable. Do not infer a uniquely correct repair from a rounded row or treat legitimate valuation precision as malformed transaction data.

Unresolved before implementation: supported currency contract; sub-cent transaction fail/hold versus explicit quantization; reported valuation balance policy; provenance retention and adapter versioning; treatment of existing inconsistent JSON. No database characterization is needed for this design. No legacy audit was executed.
