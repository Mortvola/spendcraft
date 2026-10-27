# Currency persistence precision policy

The approved exact-cent storage migration is complete. This policy replaces the earlier reject-versus-round proposal and pre-migration persistence observations. See the [storage inventory](remaining-monetary-storage-inventory.md) for the exact field boundaries and completed representations.

## Approved JSON persistence policy

For the 24 approved JSON paths, including fixed-dollar and percentage-mode funding rules, persistence uses:

```typescript
const cents = Math.round(value * 100)
const storedValue = (cents / 100).toFixed(2)
```

Fractional inputs are accepted and rounded before storage. Inputs must be finite and produce safe scaled integers, and monetary codecs retain their encoding/decoding round-trip checks. Values that cannot safely round-trip are rejected. Negative zero is stored as `"0.00"`.

The policy deliberately uses JavaScript binary-number and `Math.round` behavior. Half ties round toward positive infinity: `0.125` becomes `"0.13"` and `-0.125` becomes `"-0.12"`. Binary representation also matters: `1.005` becomes `"1.00"`. Do not replace this policy with PostgreSQL casting, sign-symmetric rounding or `value.toFixed(2)` alone.

Canonical strings are a storage representation. Models, calculation inputs and public APIs remain numeric. Scoped compatibility readers still accept historical numeric/string/mixed storage; reading does not quantize or save historical values. Explicit writes use the relevant field's codec and validation. Missing/null semantics, unrelated JSON and excluded lifecycles remain unchanged.

## Relational storage

The seven original monetary `numeric(12,2)` columns remain exact decimal storage with their existing writer behavior. Their hydration into JavaScript numbers does not require a representation migration, and the JSON policy is not a new global quantizer for those writers.

`auto_assignment_categories.amount` also uses `numeric(12,2)`. Both fixed dollars and percentage points are explicitly rounded with JavaScript `Math.round(value * 100) / 100` before persistence. The model preserves numeric runtime/API values and enforces the column's range, finite inputs and safe scaled results.

## Percentages and calculation boundaries

Funding and auto-assignment percentages have approved two-decimal precision but remain percentage points, not dollars or fractional ratios. A submitted funding percentage of `12.345` is rounded to 12.35%. Funding's additional nonnegative/exact-total rules are described in [funding percentage validation](funding-percentage-validation-design.md).

Storage precision does not change allocation formulas, ordering, residual cents, conservation rules or intermediate tax/funding calculations. Exact persistence is not a claim that every JavaScript calculation or existing floating-point SQL report is exact. Current accounting authority and Budget transaction requirements remain in [accounting invariants](accounting-invariants.md).

Loans, deprecated `transaction_categories`, BalanceHistory and Plaid logs retain the exclusions in [monetary migration scope](monetary-migration-scope.md). IDs, dates, recurrence, counts and unrelated rates do not acquire a universal two-decimal monetary policy.
