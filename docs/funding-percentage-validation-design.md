# Funding percentage validation

Funding validation and decimal-string storage are implemented. The earlier proposal to reject all inputs with more than two decimal places is superseded by the approved JavaScript rounding policy.

## Current product rules

Percentage entries must be finite and nonnegative. Values with additional precision are accepted and individually rounded to hundredths of a percentage point using `Math.round(value * 100)`. Scaled results must be safe integers. Negative inputs are rejected before rounding, even if they would round to zero.

[fundingPercentages.ts](../common/fundingPercentages.ts) converts each rounded result to `BigInt` and requires the percentage total to equal exactly `10000n` when any percentage rules are present. There is no tolerance, redistribution or automatic adjustment of a rule to make an invalid total pass.

Examples:

- `12.345` becomes 12.35%; other percentage entries must make the rounded total exactly 100%.
- `0.001 + 99.999` becomes `0.00 + 100.00` and passes.
- `33.334 + 33.333 + 33.333` becomes `33.33 + 33.33 + 33.33` and fails at 99.99%.
- `0.29 + 99.71` passes; the helper does not require the unrounded multiplication `value * 100` to be integral.

Percentages apply to the source remaining after fixed allocations. Negative source funding remains supported; it does not permit negative percentage rules. Fixed-only and empty configurations remain valid. Fixed amounts do not contribute to percentage totals. Duplicate Category IDs retain their existing calculation/storage semantics, and every percentage entry counts toward the total.

## Writers and validation

The shared helper is used by client funding validation and the server's existing Vine adapter. Existing schema coercion and malformed-input errors remain intact. Public request/response values are numeric; percentage units are an internal validation representation, not a new API or database column.

- Category CREATE requires the funding configuration array. Category PATCH preserves an omitted/null optional configuration; an explicit array replaces it, including `[]`.
- Funding/rebalance transfer CREATE and PATCH validate supplied nested funding configurations. Transfer PATCH keeps its required split-replacement contract; omitted/null nested rules are not merged from the old snapshot.
- CategoryDialog and FundingDialog show configuration errors outside the shared CategorySpread editor. Auto-assignment retains its own validation and percentage semantics.
- A metadata-only update does not validate or normalize an untouched historical configuration. Explicitly resubmitting a configuration applies current validation.

Existing collection errors distinguish nonfinite numbers, negative percentages, unsafe scaled precision and an invalid total. Funding validation does not introduce new allocation or balance-conservation rules.

## Persistence and calculations

Both fixed-dollar and percentage funding amounts persist as canonical two-decimal strings through the [Funding codec](../app/services/fundingAmountCodec.ts) and scoped model bindings. Models/API responses decode to numbers, and numeric/string/mixed historical readers remain available. Reading does not repair or rewrite stored configurations.

Percentage values remain percentage points: stored `"12.35"` means 12.35%. Fixed-dollar sign rules remain separate. Missing/null fields, mode flags, array order, unrelated JSON and Loan exclusions keep their established behavior.

The existing funding calculations still control allocation ordering, fixed caps, residual-cent assignment and conservation. Validation checks the rounded percentage total; it does not change the allocation algorithm or add intermediate rounding. See the [storage inventory](remaining-monetary-storage-inventory.md#funding-configuration-and-reconstruction) and [currency policy](currency-precision-policy-design.md).
