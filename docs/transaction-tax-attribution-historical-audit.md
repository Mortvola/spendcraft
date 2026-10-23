# Transaction tax attribution: production historical precision audit

**Completed, read-only. Precision policy approval is still required.** This audit did not implement tax decimal-string storage or normalize any historical records.

## Source and execution baseline

- Source HEAD: `f92024df6bd6276d400d7552aa8fc95b13d179e1`.
- Branch: `dollar-to-cents-2`.
- Completion: **October 23, 2026, 15:41 MDT (America/Denver)**; production summary-file timestamp `2026-10-23T21:41:02.531636227Z`.
- Prepared tool: [auditTransactionTaxPrecision.mjs](../scripts/auditTransactionTaxPrecision.mjs); source/semantics: [precision review](transaction-tax-attribution-precision-review.md).
- Entry index contained seven staged files: `.gitignore`, `adonisrc.ts`, the remaining monetary inventory, JSON candidate review, tax precision review, audit script and audit test. There were no tracked unstaged changes. Existing unrelated local artifacts were preserved.
- Staged diff SHA-256 at entry and completion: `c5a2d859761cd25330c46217862e01acf6b5f0a9c0c77a6e571cd1e974415b5f`.

The audit script was not yet installed on production. Rather than deploying or changing application files, the reviewed script and its existing operator dependencies were streamed into Node 24.15.0 memory over the existing authenticated SSH connection. Relative module imports were relocated to in-memory modules and the existing installed pg driver. Source hashes and the exact streamed payload are retained privately. The script's actual `runAudit`, `inspectTransaction`, `inspectAmount`, `includeFinding` and strict database-identity helpers were used; the characterization formula was not replaced.

A read-only wrapper added page-level date/Budget metadata and reporting comparison queries before the audit transaction's final COMMIT. Both the base audit and comparisons therefore used **one repeatable-read snapshot**. This was operator audit tooling only, not an application deployment or report implementation change. Only unique private audit evidence files were created on production; no installed application/configuration files were changed. No staging connection occurred.

## Configured and live production identity

Existing trusted-host SSH access to `spendcraft.app` resolved to the known production host. Installed environment path was independently resolved to `/spendcraft-prod/server/spendcraft-env`, outside the current release. Only allowlisted nonsecret configuration fields were printed.

| Identity/check | Observed result |
| --- | --- |
| Configured host / port / database | `localhost:5433/budget` |
| Configured and authenticated user | `ubuntu` |
| Live PostgreSQL server and client addresses | Both TCP loopback `127.0.0.1`; strict helper accepted full-width CIDR representations |
| Actual driver's remote socket | Loopback, port 5433; matched live server/configuration |
| Database OID and cluster system identifier | Automatically discovered, recorded privately and matched again before completion |
| Role superuser status | False |
| Session default_transaction_read_only | `on` |
| Actual transaction_read_only | `on`, checked before financial reads and again during comparison |
| Transaction | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` |

A dedicated read-only role credential was not available through the established configuration. The existing non-superuser application role was used with both connection-default and explicit transaction read-only enforcement. This is **not** a claim that the role itself has only read privileges. No role, grant, HBA or database configuration was changed.

Safeguards verified configured/live database name, authenticated user, port, server/peer identities, actual execution socket, database OID and cluster system identity. No reliance on stale test/sandbox authorization or environment variables alone. The prepared script rejects mutation flags and contains no data/schema mutation SQL. The production execution record contains **136 SQL operations**, all SELECT or read-only transaction control, with no INSERT/UPDATE/DELETE/TRUNCATE/CREATE/ALTER/DROP or explicit application row/advisory locks. Ordinary SELECT locks and transaction completion are expected.

`query-evidence.json` is a dispatch log: the wrapper records the COMMIT dispatch before running its pre-commit comparison SELECTs, then issues the actual COMMIT only after those SELECTs finish. Its recorded dispatch order must not be mistaken for wire execution order; the streamed wrapper and verified transaction mode establish the shared snapshot.

## Reconciled counts

Transaction and entry counts are separate measures.

| Transaction-level finding | Count |
| --- | ---: |
| Transactions examined | **6,271** |
| Transactions with tax attribution | **21** |
| Empty tax arrays | **6,250** |
| Missing tax data | **0** |
| SQL/JSON null tax data | **0** |
| Mixed numeric/string arrays | **0** |
| Malformed Transactions | **0** |
| Unsupported Transactions / legacy shapes | **0 / 0** |
| Deleted Transactions containing attribution | **0** |
| Identifiable deprecated Transactions excluded | **0** |
| Transactions affected by reference cent rounding | **0** |

| Entry-level finding | Count |
| --- | ---: |
| Total tax attribution entries | **21** |
| Numeric amount entries | **21** |
| String amount entries | **0** |
| Valid amount entries | **21** |
| Malformed amount entries / malformed entries | **0 / 0** |
| Fractional-cent amounts | **0** |
| Values changed by reference rounding | **0** |
| Duplicate tax-type entries within a Transaction | **0** |
| Raw-token-to-JavaScript value changes detected | **0** |
| Amounts outside audit safe monetary range / encoding capacity | **0** |
| Original or rounded negative-zero amounts | **0 / 0** |
| Mathematical raw-token or JavaScript-product half ties | **0 / 0** |

All 21 amounts are positive; there are no negative or zero attribution amounts in this snapshot. There are **zero positive changes, zero negative changes and 21 zero differences** under the proposed comparison. No fractional-cent/binary-artifact token was found. This does not assert that cent-valued JavaScript numbers have exact binary representations.

| Transaction type | Examined | With attribution | Tax entries |
| --- | ---: | ---: | ---: |
| 0 ordinary/provider | 6,131 | 21 | 21 |
| 2 funding | 44 | 0 | 0 |
| 3 rebalance | 35 | 0 | 0 |
| 4 opening | 8 | 0 | 0 |
| 5 manual | 53 | 0 | 0 |
| Total | **6,271** | **21** | **21** |

Checks: 6,250 empty arrays + 21 nonempty arrays = 6,271 Transactions; 21 numeric + zero other representations = 21 entries; every nonempty array contains one classified entry. No historical tax totals/counts were inferred from the completed Category migration's separate audit.

## Rounding characterization

For each numeric amount, the prepared helper calculated:

```js
const cents = Math.round(amount * 100)
const proposal = (cents / 100).toFixed(2)
```

This remains a **hypothetical comparison policy, not an approved tax storage policy**. Raw PostgreSQL JSON amount tokens were retained independently of JSON.parse. Exact base-ten comparisons found each proposed amount represented the same monetary value as its original token. All 21 proposals independently matched the literal JavaScript formula. There are no nonzero per-entry changes to list; each change is exactly **0 cents**.

No observed half-tie, negative, negative-zero, malformed, unsafe-range or fractional-cent case establishes a product rule for future values. Those behaviors are characterized by the existing synthetic tests, not silently approved by a clean production dataset.

## Current versus hypothetical reporting totals

The comparison retained Transaction tax query semantics from `TaxesController.getActuals`:

- Keep each owning Budget separate.
- Group by Transaction year/month and tax `type` (equivalent to running the existing Budget/year query for each observed year).
- Include the existing signs, duplicate multiplicity and ordinary date selection.
- No pending/deleted/type/Account startDate posting filter was introduced.
- Rows with null dates cannot fall within any requested year; none of the observed tax entries had a null date.
- Deprecated ownership remains outside this task's scope; zero rows were excluded in this dataset, so that boundary removed no current-report inputs.

The current side executed `SUM(COALESCE(x.amount,0))` with `jsonb_to_recordset(t.taxes) AS x(type varchar, amount real)`. The hypothetical side supplied each individually proposed amount through a parameterized JSON recordset and used the same real cast, SUM, Transaction date and Budget grouping. No temporary database object, UPDATE or production report modification was used. All 21 entries were represented exactly once in both comparisons.

**All 21 Budget/year/month/type groups had zero difference.** Actual financial totals and Budget/Transaction IDs are retained only in private evidence.

| Tax type | Reporting periods, each verified separately | Groups | Current vs hypothetical difference per group |
| --- | --- | ---: | --- |
| `taxable_social_security_benefits` | 2025-04, 05, 06, 07, 08, 09, 10, 11, 12 | 9 | **0 cents** in every month |
| `taxable_social_security_benefits` | 2026-01, 02, 03, 04, 05, 06, 07, 08, 09 | 9 | **0 cents** in every month |
| `estimated_tax_payments` | 2026-04, 06, 09 | 3 | **0 cents** in every month |

### SQL precision limitation and separate raw comparison

PostgreSQL `real` is floating-point, not exact-cent arithmetic. Its sums can depend on evaluation order, and its text output is not proof of exact decimal arithmetic. Each observed group has one attribution entry, so this audit does not exercise multi-entry accumulation error. No tax-report arithmetic was corrected or certified cent-exact.

A separate exact **raw-decimal characterization** summed original stored decimal tokens and individually proposed decimal texts using audit-only BigInt base-ten arithmetic. It also found zero differences in all 21 groups. Because each proposal equals its original monetary token, the zero rounding impact does not depend on treating real SUM as exact. Existing binary cast approximation and downstream tax calculations remain separate concerns.

## Output, provenance and independent verification

Production private output:

`/spendcraft-prod/server/tax-precision-audit-ZXLXuL/`

Local private evidence and streamed payload:

`tax-historical-audit-ClXXgK/`

Copied production output is in `tax-historical-audit-ClXXgK/production-evidence/`. Do **not** stage/commit this private directory. It contains raw monetary tokens and financial totals. No credentials were written to the evidence.

Files: `summary.txt`, `summary.json`, `transactions.jsonl`, plus `reporting-comparison.json`, `verification.json` and `query-evidence.json`. Local evidence additionally records reviewed source hashes, exact in-memory payload, SSH execution status, focused test output and independent reconciliation. Evidence files are private; no old output was overwritten or cleaned up.

Detail JSONL SHA-256 verified after transfer:

`3ac76f0109dfcca4178600bfa1d013c79384c7a605ef69f8b2484666b5597793`

Independent local verification confirmed:

- Exactly 6,271 strictly increasing unique Transaction IDs and 6,271 detail lines.
- Exactly 21 entry indexes, each with one valid/malformed entry classification and separate amount classification; all valid here.
- Every summary counter and by-type bucket reconciles with detailed output.
- All 21 proposals agree with direct JavaScript Math.round/divide/toFixed computation.
- Re-running the actual classifier on the same raw rows produced identical serialized findings during the scan. No second live scan is claimed: a changing database need not reproduce a prior snapshot.
- Transferred detail hash matches the production result; reporting coverage is 21 entries in 21 groups.
- Session and transaction read-only flags were on; no mutation SQL was issued.

Focused existing/new audit, input and packaging regressions: **81 passed, 0 failed, 0 skipped**, using inert local mocks and synthetic values. No database-backed test setup, migrations, fixtures or cleanup ran on any database. Documentation links and working-tree/staged diff whitespace checks passed. No runtime/test code changed in this execution task, so TypeScript/build/lint were not rerun; the earlier precision review retains their results and known unrelated lint failure.

## Compatibility findings and remaining decisions

The observed history is small and clean: one supported current shape, numeric entries only, no current rounding changes, no malformed/unsupported/null values and no deleted attribution. That supports further narrow design review; it does **not** approve automatic quantization of future API inputs.

Decisions still required: whether tax attribution must be cent-scale; exact tie/negative-zero/range behavior; reject versus round fractional new inputs; treatment of future malformed/unsupported histories; independent tax storage adapter scope and temporary numeric/string compatibility; preserving numeric APIs and current selection/real SQL behavior. Historical conversion would need separately authorized implementation/execution. No conservation rule tying tax attribution to movements, allocations, Statements or zero was invented.

No production database records changed through this audit. No monetary representation change, historical repair, schema migration, deployment, service restart or commit occurred. Private audit output files were the only production filesystem additions.

## Subsequent product approval and implementation boundary (2026-10-23)

The original audit results above remain unchanged. Product has subsequently approved canonical two-decimal tax allocation strings, fractional-cent input rounded by JavaScript Math.round/divide/toFixed, numeric runtime/API compatibility, and unchanged tax-report real aggregation. No tax conservation relationship is introduced. The [bounded runtime implementation](transaction-tax-decimal-string-implementation.md) prepares numeric/string/mixed compatibility; it does **not** convert the 21 historical numeric entries or rerun this production audit. Historical conversion still requires separate approval.
