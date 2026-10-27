# Monetary storage inventory

The approved exact-cent storage project is complete. Application changes and historical conversions are deployed and verified; the sandbox conversions are also complete. There are no remaining conversion candidates within the approved scope. Historical converters, migration-only rollback profiles and completed rehearsal tooling have been retired.

Scope follows [monetary migration scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md). Loans, deprecated `transaction_categories` dependencies and BalanceHistory remain excluded. Plaid logs retain provider-supplied representations.

## Storage summary

Count a relational column or named JSON leaf pattern once; array positions and fixed/percentage modes do not create additional locations.

| Representation | Locations | Disposition |
| --- | ---: | --- |
| Canonical two-decimal JSON strings | 24 | Completed storage boundaries and historical conversion |
| PostgreSQL `numeric(12,2)` | 8 | Seven existing exact columns plus the completed auto-assignment migration |
| Remaining in-scope floating-point columns or JSON-number paths requiring conversion | 0 | No further representation migration planned |
| Persisted integer minor-unit columns | 0 identified | Runtime cent arithmetic is not a separate storage column |

The prior inventory's ten remaining locations were seven already-exact columns and three funding JSON paths. Those funding paths are now complete. Exact decimal columns do not need conversion merely because models hydrate them into JavaScript numbers.

## Exact relational columns

| Column | Meaning |
| --- | --- |
| `accounts.balance` | Accounting balance; balance-tracked Accounts use the relevant Statement authority |
| `accounts.plaid_balance` | Provider observation, distinct from the accounting balance |
| `account_transactions.amount` | Signed nominal Account movement |
| `categories.balance` | Category state, including Unassigned and Funding Pool |
| `categories.funding_amount` | Planned/goal funding configuration |
| `statements.starting_balance` | Statement starting snapshot |
| `statements.ending_balance` | Statement ending snapshot |
| `auto_assignment_categories.amount` | Fixed dollars or percentage points, according to the existing nullable mode flag |

All use `numeric(12,2)` with existing nullability/defaults preserved. Models expose numeric runtime/API values. Auto-assignment rounds before persistence using JavaScript `Math.round(value * 100) / 100`, supports two-decimal percentages and preserves allocation formulas/order/residual behavior. PostgreSQL exact storage does not make all preceding JavaScript arithmetic exact.

## Completed JSON storage boundaries

| Path or field group | Paths | Meaning |
| --- | ---: | --- |
| `transactions.categories[].amount` | 1 | Transaction Category allocation |
| `transactions.taxes[].amount` | 1 | Independent tax attribution |
| `statements.data.{shortTermCapitalGains,longTermCapitalGains,dividends,taxableInterest}` | 4 | Statement income attribution |
| `taxes.data` fields listed below | 13 | Tax forecast inputs and estimates |
| `transaction_logs.changes.amount.{old,new}` | 2 | Historical amount changes |
| `categories.funding_categories[].amount` | 1 | Fixed dollars or percentage points in funding configuration |
| `transactions.categories[].baseAmount` | 1 | Requested funding-base snapshot |
| `transactions.categories[].fundingCategories[].amount` | 1 | Fixed-dollar or percentage rule snapshot |

The thirteen Tax paths are `taxableInterest`, `qualifiedDividends`, `ordinaryDividends`, `taxableIraDistributions`, `taxablePensionAndAnnuities`, `taxableSocialSecurityBenefits`, `additionalTaxableIncome`, `shortTermCapitalGains`, `longTermCapitalGains`, `qualifiedBusinessIncomeDeduction`, `estimated.expectedAgi`, `estimated.priorYearAgi` and `estimated.priorYearTotalTax`.

All are **COMPLETED — DECIMAL-STRING STORAGE**. The approved persistence policy is:

```typescript
const cents = Math.round(value * 100)
const storedValue = (cents / 100).toFixed(2)
```

Inputs must be finite and produce safe scaled integers, with the existing codec round-trip checks. Preserve JavaScript half-tie/binary behavior and normalize negative zero to `"0.00"`. Percentage values remain percentage points: `12.345` becomes stored `"12.35"`, meaning 12.35%, not a dollar amount or fractional ratio.

Runtime and public APIs remain numeric. Existing scoped readers support numeric, canonical-string and mixed storage without write-on-read normalization. Missing/null values, unrelated JSON, ordering and Loan exclusions retain their established semantics. Metadata-only saves do not rewrite untouched historical representations.

Boundaries live in the [Category codec](../app/services/categoryAmountCodec.ts), [Transaction Tax codec](../app/services/taxAmountCodec.ts), [Statement income codec](../app/services/statementIncomeCodec.ts), [Tax/Log codec](../app/services/taxMonetaryCodec.ts), [Funding codec](../app/services/fundingAmountCodec.ts) and their scoped model/storage bindings.

## Funding configuration and reconstruction

Category CREATE/PATCH encodes supplied `fundingCategories` through [Category](../app/Models/Category.ts) and [fundingStorage](../app/services/fundingStorage.ts). Funding/rebalance CREATE and replacement in [CategoriesController](../app/Controllers/Http/CategoriesController.ts) encode supplied `baseAmount` and nested rules after ownership and Loan exclusion are resolved. Supported Transactions use the existing allocation binding; Loan-excluded Transactions retain their prior behavior.

`percentage=true` means percentage points; `false` means fixed dollars. Existing legacy falsey-mode handling is preserved. [Funding percentage validation](../common/fundingPercentages.ts) requires nonnegative percentages totaling exactly 100% after approved individual rounding when percentage rules are present. Fixed-dollar rules keep their existing validation contract.

The saved allocation shape remains `{categoryId, amount, comment?, funder?, baseAmount?, fundingCategories?: [{categoryId, amount, percentage}], includeFundingTransfers?}`. The outer `amount` is the posted allocation. Bases/rules are configuration snapshots, not authoritative balances or historical reversal amounts.

[calculateFunding](../client-src/Funding/calculateFunding.ts) keeps its existing ordering, fixed caps, cent arithmetic and residual assignment. Storage rounding adds no intermediate rounding to those calculations. [FundingDialog](../client-src/Funding/FundingDialog.tsx) reconstructs edits from numeric bases/rules, with its existing fallbacks to allocations and the Category tree. A snapshot alone cannot establish a complete historical balance reconstruction.

Prior-month reporting still uses `jsonb_to_recordset` with decimal `baseAmount` extraction and existing selection/grouping. PostgreSQL accepts both JSON numbers and canonical numeric strings; no representation-specific SQL rewrite or new reporting precision policy is needed. Posted balances, AccountTransactions, conservation rules and Budget transaction boundaries are unchanged.

## Ongoing maintenance

Keep the codecs, compatibility readers, migrations and runtime regression tests. Some audit utilities remain because runtime tests use their calculation helpers; they are not release payload requirements or unfinished migrations. Normal [application rollback](application-release-rollback.md) remains available subject to its ordinary checks, without migration-specific compiled hash profiles or automatic monetary reversal.
