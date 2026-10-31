# Monetary storage inventory

The approved exact-cent storage project is complete. Application changes and historical conversions are deployed and verified; the sandbox conversions are also complete. There are no remaining conversion candidates within the approved scope. Historical converters, migration-only rollback profiles and completed rehearsal tooling have been retired.

Scope follows [monetary migration scope](monetary-migration-scope.md) and [accounting invariants](accounting-invariants.md). Deprecated `loans`, `loan_transactions` and `transaction_categories` storage, and BalanceHistory, remain excluded. Active Loan Accounts use the shared Account/Transaction monetary boundaries. Plaid logs retain provider-supplied representations.

## Storage summary

Count a relational column or named JSON leaf pattern once; array positions and fixed/percentage modes do not create additional locations.

| Representation | Locations | Disposition |
| --- | ---: | --- |
| Canonical two-decimal JSON strings | 24 | Completed storage boundaries and historical conversion |
| PostgreSQL `numeric(12,2)` | 8 | Seven existing exact columns plus the completed auto-assignment migration |
| Remaining in-scope floating-point columns or JSON-number paths requiring conversion | 0 | No further representation migration planned |
| Persisted integer minor-unit columns | 0 identified | Runtime cent arithmetic is not a separate storage column |

The prior inventory's ten remaining locations were seven already-exact columns and three funding JSON paths. Those funding paths are now complete. Exact decimal columns do not need conversion to integer columns: active monetary model fields use checked integer cents while persistence remains exact decimal storage.

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

All use `numeric(12,2)` with existing nullability/defaults preserved. Monetary model fields use `MoneyCents` and monetary API responses use canonical `DecimalMoneyString` values. Auto-assignment keeps percentage points numeric and fixed-dollar amounts in cents internally; its API uses numeric percentages and canonical strings for fixed dollars. Input quantization retains JavaScript `Math.round(value * 100) / 100` and supports two-decimal percentages.

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

Migrated database leaves require canonical strings; historical numeric/string/mixed decoding was retired after conversion. Storage decoding is separate from runtime serialization. Monetary request/response fields use canonical strings, while percentage-mode request/response amounts remain numeric. Missing/null values and unrelated JSON remain preserved without write-on-read normalization. Metadata-only saves preserve untouched storage. Runtime types are scoped: active allocations and fixed-dollar funding metadata use `MoneyCents`; Tax, TransactionLog and server Statement-income adapters still use numeric values at their established boundaries.

Boundaries live in the [Category codec](../app/services/categoryAmountCodec.ts), [Transaction Tax codec](../app/services/taxAmountCodec.ts), [Statement income codec](../app/services/statementIncomeCodec.ts), [Tax/Log codec](../app/services/taxMonetaryCodec.ts), [Funding codec](../app/services/fundingAmountCodec.ts) and their scoped model/storage bindings.

## Funding configuration and reconstruction

Category CREATE/PATCH encodes supplied `fundingCategories` through [Category](../app/Models/Category.ts) and [fundingStorage](../app/services/fundingStorage.ts). Funding/rebalance CREATE and replacement in [CategoriesController](../app/Controllers/Http/CategoriesController.ts) encode supplied `baseAmount` and nested rules after ownership is resolved. Supported Transactions, including active Loan Account Transactions, use the existing allocation binding. Deprecated Loan-category exclusions have been removed.

`percentage=true` means percentage points; `false` means fixed dollars. Existing legacy falsey-mode handling is preserved. [Funding percentage validation](../common/fundingPercentages.ts) requires nonnegative percentages totaling exactly 100% after approved individual rounding when percentage rules are present. Fixed-dollar rules keep their existing validation contract.

The saved allocation shape remains `{categoryId, amount, comment?, funder?, baseAmount?, fundingCategories?: [{categoryId, amount, percentage}], includeFundingTransfers?}`. The outer `amount` is the posted allocation. Bases/rules are configuration snapshots, not authoritative balances or historical reversal amounts.

[calculateFunding](../client-src/Funding/calculateFunding.ts) keeps its existing ordering, fixed caps, cent arithmetic and residual assignment. Storage rounding adds no intermediate rounding to those calculations. [FundingDialog](../client-src/Funding/FundingDialog.tsx) reconstructs edits from cent-valued bases/fixed rules and numeric percentage rules, with its existing fallbacks to allocations and the Category tree. A snapshot alone cannot establish a complete historical balance reconstruction.

Prior-month reporting still uses `jsonb_to_recordset` with decimal `baseAmount` extraction and existing selection/grouping. PostgreSQL casts canonical numeric strings to decimal directly; no representation-specific SQL rewrite or new reporting precision policy is needed. Posted balances, AccountTransactions, conservation rules and Budget transaction boundaries are unchanged.

## Integer-cent arithmetic status

The identified non-tax client/server monetary arithmetic work is complete. Shared
[`MoneyCents`](../common/moneyCents.ts) values are branded safe integers, with checked
addition/subtraction, direct canonical-string parsing and formatting, and exact period division.
Database storage and API decimal-string representations are unchanged by these runtime changes.

- Account and Category balances, AccountTransaction amounts/principal, Transaction allocations,
  Statement snapshots/totals and report aggregates retain cents through their monetary arithmetic.
- Client Statement reconciliation and income-attribution editing retain cents from API decoding
  through calculations and display.
- Server auto-assignment percentage allocations use exact integer multiplication/division of cents
  and hundredths of percentage points. Half ties round toward positive infinity, including negative
  ties; fixed-rule ordering and final-rule residual assignment are preserved.
- Funding-goal monthly and planned amounts use exact integer division with the same half-tie rule.
  Funding formulas, conservation rules and adjustment-message formatting remain unchanged.
- Transaction amount search validates decimal text and binds a canonical string directly to SQL.
  Whole/one-decimal searches remain accepted; malformed, subcent and unsafe filters return 422.
- Provider payloads, percentages/rates, boundary adapters and logging can still contain numbers.
  Their presence alone does not establish floating-point monetary arithmetic.

**Deferred:** tax worksheet calculations retain their existing floating-point/intermediate precision.
Tax storage and monetary APIs are already canonical strings. Further tax arithmetic conversion needs
separate scope and rounding decisions; this completion status does not claim all tax calculations
are integer-cent calculations.

## Latest verification

Release commit `e5c6d39ed0192cb85340a92e4fd750128540458b` passed the full suite:
**3,938 passed, zero failures or skips**. It was built from an isolated committed checkout and deployed
to staging. Focused staging checks passed for signed percentage ties, mixed allocations/residuals,
funding-goal previews and Budget isolation, Statement totals/reconciliation, and amount-search
responses/rejection. Synthetic writes rolled back; all 12 checked table counts/hashes were unchanged.
PM2 schedules/startup configurations were restored and HTTP/HTTPS returned 200.

Production storage conversions were previously completed. The operator has confirmed that
production deployment and verification of this latest arithmetic release are also complete.
No further non-tax storage conversion is planned.

## Ongoing maintenance

Keep the scoped codecs, strict storage readers, migrations and runtime regression tests. Some audit utilities remain because runtime tests use their calculation helpers; they are not release payload requirements or unfinished migrations. Normal [application rollback](application-release-rollback.md) remains available subject to its ordinary checks, without migration-specific compiled hash profiles or automatic monetary reversal.
