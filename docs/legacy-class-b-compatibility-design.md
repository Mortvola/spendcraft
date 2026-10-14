# Structural legacy Class B policy — design and evidence collection

No financial compatibility implementation, database connection, repair or cents migration. The four targeted production findings are closed in current supplied evidence. No cause for differences between earlier/later reports is inferred. No ID-based exception is introduced.

## Source paths and economics

| Path | Precision generation / Category-side behavior |
| --- | --- |
| Manual create (AccountsController) | Generic numeric validation admits fractional decimals; split JSON and Category increments use supplied dollar values. AccountTransaction and balances are stored numeric(12,2). Client cent conservation can accept raw finer precision that independently rounds to the expected cents. |
| Manual/regular PATCH (TransactionsController) | Old JSON reversed and new JSON applied through dollar balance operations; relational Account amount handled separately. Conservation guard is specifically manual type 5. Updating can retain or replace JSON; presence of a numeric row does not prove its split delta. |
| CategorySplits / TransactionDialog | Remainder is total minus dollar split sum; negative-source submit negates amounts. Cent inputs can produce tiny binary residue. Unary sign conversion alone does not generate extra precision. JSON serialization preserves the resulting shortest decimal, not original input spelling. |
| Opening/starting balance (Account.updateStartingBalance) | Dollar balance minus relational sum, then supplied in-memory amount copied to JSON after save. This can yield binary residue while numeric persistence normalizes it. Category funding-pool effects may be delta against an old amount rather than full current JSON amount. |
| Plaid create | SDK number/sign transformation, relational creation, auto-assignment/unassigned JSON. Cent-exact provider values with unary negation alone normally remain canonical decimal cents; provider precision itself is not guaranteed. AutoAssign uses cent allocations. Institutional/unassigned accumulation and later dollar arithmetic remain separate paths. |
| Plaid modify/remove | New amount minus JSON sum can adjust/add an unassigned entry. Date crossings reverse/apply JSON effects; Account effect uses amount/pending/startDate. Tiny differences can accumulate in unassigned values. Removal uses persisted JSON for Category and relational amount for Account; it does not generate replacement JSON as a normalization policy. |
| OFX import/reimport | Numeric parser/sign changes, relational persistence and JSON; old versions had separate amount/allocation updates. Current reimport applies grouped integer-cent deltas with Math.round and computes cent residuals. This differs from decimal half-away-from-zero at negative half ties. No provider/import behavior is changed. |
| Category transfer/funding | Snapshot destination/baseAmount dollars and cent-based funders can coexist. Server aggregates Category-ID dollar deltas; updates aggregate old/new effects. Current residual fix remains correct and closed; this is not an ordinary AccountTransaction Class B invariant. |
| Historical funding | Before 63d6f16 (August 2024), goal division and percentage spread could retain fractional currency; that commit introduced truncation/cent proposal rounding, cd7e05f changed truncation to rounding. These are possible eras, not proven creator versions. |
| Relational-to-JSON migration | 1720992448419 copied old allocation amounts with parseFloat. Existing scale-two rows ordinarily serialize as cent decimal numbers; copying alone is not a demonstrated generator of these tiny artifacts. It can preserve an existing economic mismatch. |
| Delete/category deletion/history | Transaction delete/provider reversal reads old JSON and relational amounts independently. Category deletion checks JSON nonzero membership rather than repairing money. Historical queries aggregate JSON decimals; display/history arithmetic is not a posted-state normalization authority. |

Historic raw Category increments, aggregate old/new deltas and cent-accumulated import mutations are different rounding points. Saving a numeric column does not necessarily reload the supplied JavaScript number. Multiple allocations for a Category, model reuse/reload timing and institutional accumulation matter. No complete per-event Category delta ledger is established by the current model. Current aggregate Category balances cannot prove a selected event's former effect.

PostgreSQL scale-two numeric half ties are decimal half-away-from-zero (established by prior characterization). JavaScript Math.round on scaled numbers is sign-asymmetric and can differ due to binary scaling. Auto-assignment and OFX paths explicitly round cents; ordinary raw-dollar save paths rely on numeric balance normalization. Therefore a universal historical rounding rule is **not** established. The report computes decimal half-away-from-zero as an explicit diagnostic candidate only; it does not adopt it as a compatibility policy.

## Candidate structural L1 predicate

Required evidence, not just closeness:

1. Record is a known persisted legacy monetary revision from an identified path/era; creation date alone is insufficient after edits. Establish last monetary-write semantics or an explicit approved legacy-authority policy.
2. Supported ordinary type (initial screen: regular 0, opening 4, manual 5), one supported nonloan AccountTransaction, transaction tracking and known eligibility. Principal/loan, multiple rows and ambiguous tracking are excluded.
3. All split values/shapes and destination IDs are valid bounded decimals. Every per-split candidate follows an explicitly justified path-specific normalization, not an epsilon. Half-cent ties and ambiguous rounding paths require separate review.
4. Independent candidate cents sum exactly to relational posted cents; normalized total agrees with that sum. Account amount itself is cent-exact and within supported range.
5. Category grouping agrees: independently mapped entries and grouped raw delta lead to the same cents per destination. Duplicates are permitted, not silently merged as a product-policy change.
6. Crucially, prove that this per-Category result matches the historical **applied** effect under actual create/update/reversal grouping, pending/deleted/startDate rules and reload/save timing. An old-to-new update delta is not necessarily the current split's full amount. Historical rows/logs and source version may corroborate, but absence of logs cannot establish a mutation path.
7. Preserve all future reversal/update conservation; no material remainder is swallowed. Do not infer an allocation merely from Account total.

The supplied 35 Class B observations satisfy valuable total-level prerequisites and may be L1 candidates. They do not establish points 1 and 6 or all grouping/type details. No blanket automatic conversion is presently justified. If evidence cannot establish Category preservation, require explicit domain review/legacy authority rather than strengthening a tolerance.

L1: all structural/economic conditions proven. L2: intended values strongly reconstructed and a separate decision calls for persisted remediation. L3: isolate historical records that cannot be safely converted. L4: insufficient intended economics/provenance. L5: a supported semantic explanation establishes no precision problem requiring conversion. Tiny diagnostic agreement alone produces none of L1/L2/L5.

## Separate funding and archives

4387 has no ordinary relational total. It needs a separate funding predicate: valid historical snapshots, actual funder/destination graph, independently mapped and Category-grouped cents conserve to exact zero, source-path normalization/eligibility known, Category effects preserved. The tiny residual and zero-cent diagnostics are encouraging, not the same proof as nonloan AccountTransaction conservation. Report it separately; never force it into Class B.

4596–4597 have deleted archival funding with genuine fractional inputs and material residuals. Keep original decimal JSON/snapshots unchanged (L3 direction). Canonical active queries should exclude deleted archival records where existing semantics do so. Historical views can return a tagged legacy persistence/display DTO with exact decimal text. That DTO must not enter posted cents arithmetic, balance reconstruction or new funding submission by implicit conversion. Readers requiring canonical arithmetic must fail explicitly or use a separately approved legacy path. Preserve, do not discard, archives. A future reactivation/new posting requires the new-write boundary, not legacy permission.

## New-write / read-side separation

Future proposed adapters have separate constructors: strict new posted input versus evidence-qualified legacy hydration. New manual amounts must be exact decimal cents; providers have their independently decided posting boundary; generated allocations begin from cents and allocate residual cents. Before any posted JSON, relational write or balance mutation, assert signed integer cents and conservation. Keep APIs/DB dollar representations behind explicit serialization/persistence adapters.

Legacy read capability must never be invoked by create/update/import/funding write validation. Persisted unit/format revision or immutable cutover evidence must prevent a new malformed write from masquerading as old data; date-only eligibility is insufficient. No generic nearest-cent or epsilon allowance is introduced. This design does not add any of these constructors or metadata.

## User-run evidence script

Files: scripts/auditLegacyClassB.mjs and scripts/auditLegacyClassB.test.mjs. Requires updated auditLegacyMoney.mjs and auditLegacyTransactions.mjs in the same scripts directory. Shared runner protocol v2 fails closed before connecting if incompatible.

The script generically rediscovers Class B using the **existing classify function** with the same posted split/relational schema, then selects only those IDs plus separate 4387 for detail. Discovery reads only minimal Transaction metadata, posted split decimal text and AccountTransaction comparison columns, plus missing-split controls. It does not scan Statements, forecasts, provider payloads or configuration at discovery. Classification uses exact audited arithmetic, not SQL float approximation. The seven detail SELECTs are parameter-bound to the discovered ID array plus 4387, in the same snapshot. No 35-record ID list or compatibility IDs are hard-coded. Accountless archival funding is excluded by the ordinary Class B detector; no 4596/4597 rewrite or detail scan is planned.

Report includes rediscovered count (not presumed 35), type/provider/account structural groups, ordered exact splits, diagnostic per-split and per-Category candidate cents, conservation, linkage/type/tracking/pending/dates/principal, relevant old relational splits, sanitized changes, matching provider observations, linked Statements and current Category context. Exact arithmetic eligibility is a screen only; Category economic/path proof stays explicitly unproven and policy defaults to L4 pending review. Missing 4387 is undecided; funding screens are separate. No current balance is treated as an event ledger.

Manual user command for the previously observed target, supplied as operator inputs:

```sh
SPENDCRAFT_AUDIT_SOCKET_DIR=/run/postgresql \
SPENDCRAFT_AUDIT_PORT=5433 \
node scripts/auditLegacyClassB.mjs --database budget --execute
```

Codex does not execute this. Explicit database/socket/port, no .env fallback, live target verification, local Unix-socket transport (no remote TCP/TLS), default/read-transaction checks, one READ ONLY REPEATABLE READ snapshot, fixed SELECTs, 60-second statement/3-second lock/5-minute total timeouts, 100,000 rows/query ceilings, signal/failure cleanup and private output reuse the existing operator architecture. Discovery covers current candidate population, so use the same production-impact/MVCC precautions documented for the generic audit. No alternate snapshots or silent sampling.

Private report.json and summary.md in a new output directory (0700 / files 0600), optionally chosen through SPENDCRAFT_AUDIT_OUTPUT_DIR. No descriptions, merchant names, users/emails, account numbers, credentials or raw provider payloads. Exit 0 means complete evidence collection, not L1 approval; 2 safety/configuration failure, 3 runtime/incomplete. Aborted runs never constitute clean evidence.

Offline commands:

```sh
node scripts/auditLegacyClassB.mjs --print-sql
node --test scripts/auditLegacyClassB.test.mjs scripts/auditLegacyTransactions.test.mjs scripts/auditLegacyMoney.test.mjs
```

Still needed before the migration plan: current Class B grouping/evidence, explicit legacy economic authority/path policy where historical ledger proof is unavailable, separate 4387 funding decision, archival DTO reader boundaries and unresolved supported-currency/provider posting decisions. Targeted consistency findings 4281/4381/4598/5710 stay closed; no compatibility/remediation identifiers for them are introduced.

## Category-authority correction

`transaction_categories` is non-authoritative for this investigation. Any earlier suggestion that its presence, absence or values could establish historical Category economics or justify cents conversion is superseded. See [legacy-category-authority-analysis.md](legacy-category-authority-analysis.md). Historical audit observations remain observations only and must not influence compatibility decisions or future evidence selection.
