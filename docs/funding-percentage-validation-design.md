# Funding percentage validation design

Validation implementation and verification are complete. No data repair is
implemented; a legacy application-data audit remains separate.

## Product rule and precision

Funding percentage entries must be nonnegative and, when present, total exactly
100% of the source remaining after fixed allocations. Negative source amounts
remain valid. Fixed-only and empty configurations remain valid. Duplicate category
IDs are allowed by current storage/calculation; count every percentage entry,
including duplicates. No new duplicate or priority policy is proposed.

The product owner confirmed at most two decimal places (0.01 percentage point).
AmountInput displays two decimals and rounds on blur, but forwards the original
change/blur event; neither the form nor API guarantees this precision today.

Canonical representation: integer hundredths of a percentage point (basis points).
Parse the canonical decimal text of each coerced finite number exactly; reject
negative values or any nonzero decimal precision beyond two places, without
rounding or tolerance. Pad the fractional part to two places, then form the integer
units. Sum with integer arithmetic and require exactly 10,000. Trailing zeroes are
not additional numeric precision. Reject non-finite/malformed inputs through the
existing schema. Numeric-string coercion remains the existing Vine convention.

Do not use Number.isInteger(value * 100): 0.29 * 100 is not integral in JavaScript.
Do not round finer precision into acceptance. For a valid collection each value is
necessarily <=100; accumulate exact units (BigInt or a bounded integer sum with
an explicit overflow check). No broad monetary helper or decimal library is needed.

## Writers and update behavior

- Category POST uses addCategory; fundingCategories is required, arrays replace
  the complete JSONB configuration. Missing/null fails the required schema rule.
- Category PATCH uses updateCategory; omitted/null optional configuration is
  removed from validated output and preserved by removeUndefined + model.merge.
  Explicit arrays replace the complete configuration, including an explicit [].
- Category-transfer POST/PATCH use updateCategoryTransfer. categories is required
  and contains optional fundingCategories per split. POST stores supplied
  snapshots; PATCH replaces the complete split array. Omitted/null embedded
  configuration is removed, not merged from the previous snapshot. A date-only
  PATCH without categories fails validation today.
- Both CategoryDialog and FundingDialog/FundingItem edit spreads through
  CategorySpread. Group.addCategory and Category.update send configuration for
  Bill categories and [] for other types. FundingDialog submits snapshots through
  Register.addCategoryTransfer or Transaction.updateCategoryTransfer.
- Funding-plan item writes do not write fundingCategories. Proposed funding only
  reads/returns Category configuration. Other transaction writers strip unknown
  funding fields using their narrower schemas; they do not create funding rules.
- Category and Transaction direct ORM/query-builder operations can bypass HTTP
  validation. No explicit import, seed, command, or background writer of funding
  configuration was found. The historical funding_categories migration introduced
  JSONB NOT NULL DEFAULT []; no percentage constraints. Existing fixture writers
  and old HTTP versions could store invalid rules. Actual legacy presence is unknown.

Entries have categoryId:number, amount:number, percentage:boolean. Client id is
an editing identifier; array position is stored order. Transfer splits additionally
carry amount/baseAmount/comment/funder/includeFundingTransfers; these are not
percentage-entry fields. Unknown entry fields are stripped by current Vine objects.

## Enforcement architecture

Recommend Strategy A: validate supplied configuration, not unchanged legacy state
on every Category update. Explicitly resupplying invalid legacy rules is an active
write and should fail. A full CategoryDialog submission may resupply rules even
when the user only edits its name; show actionable errors instead of normalization.

Use one small pure funding-specific helper in common for precision/sign/total
issues. CategoryDialog and FundingDialog invoke it in Formik validation and display
field/collection errors near the funding editor. Keep CategorySpread generic and
leave AutoAssignmentDialog unchanged. This avoids imposing funding semantics on
its shared editor. Preserve fixed amounts/signs; these requirements concern only
entries whose percentage flag is true.

Use one Vine custom rule factory (vine.createRule + schema.use) on each funding
array schema, covering the two Category validators and nested transfer schema.
Array rules run before child validation/coercion in the installed compiler: the
adapter must safely handle raw entries using the same Vine number/boolean coercion
as child schemas, or use a verified post-child validation hook. Never assume raw
numeric strings or boolean strings are already normalized. Invalid shapes remain
ordinary child-schema errors, not invented collection arithmetic errors.

Report ordinary Vine errors with HTTP 422 through the installed JSONAPIErrorReporter:
errors:[{code,detail,source:{pointer}}].
Suggested codes/messages: fundingPercentageNonnegative / 'Funding percentages
must be nonnegative'; fundingPercentagePrecision / 'Funding percentages support
at most two decimal places'; fundingPercentageTotal / 'Funding percentages must
total exactly 100%'. Funding errors use the array pointer; generic malformed values retain child
pointers. Transfer pointers use categories.*.fundingCategories, matching the
installed reporter wildcard-path convention.

Legacy numeric invalid rules can be read and displayed, but cannot safely be used
for new funding until corrected. Reading does not repair anything. Malformed JSON
objects can break current client mapping/formatting and should be flagged in the
audit. No fallback or implicit cleanup is proposed.

## Prepared characterization and later regression coverage

HTTP configuration.spec.ts prepares four writer cases, each looping over 22
configurations, two PATCH-semantics cases, and a POST required-field case. Current numeric acceptance is a
characterization expectation, not a supported contract. Includes 100; 50+50;
33.33+33.33+33.34; 33.3+33.3+33.4; 0+100; 0.01+99.99; 0.1+99.9; negative totals;
negative values with total 100; 99.99; 100.01; 50+49; 50+51; zero percentage total;
0.001+99.999; numeric strings; nonnumeric string; fixed+50+50; fixed-only; empty.
Nonnumeric rejection checks complete Category/Transaction row snapshots.

Implementation converts invalid-domain/precision expectations to 422 and extends
complete-state/no-created-row assertions to every rejected case. Add malformed
entries, unchanged explicit legacy
rejection, valid replacement, and Category unrelated PATCH preservation. Transfer
PATCH must keep existing required replacement semantics. Include negative source
funding with a valid configuration; output balance conservation is separate from
configured percentage totals.

Client characterization runs actual dialog validators and AmountInput formatting.
Implementation replaces missing-enforcement expectations with equivalent helper,
Formik error and valid-submit tests, including empty/fixed-only, duplicate IDs,
0.29+99.71, finer precision and numeric-string compatibility. Retain existing
fundingRounding tests: valid 100% inputs still need the closed cent residual fix.

## Read-only legacy audit proposal

Determine configured host/port/database first; obtain explicit authorization for
the actual local application target. Do not assume the test database. Do not run
this query during design. Return only configuration context, no unrelated financial
or user/account information:

```sql
WITH configurations AS (
  SELECT 'category'::text AS source, c.id AS record_id,
         g.application_id AS budget_id, c.id::text AS category_id,
         NULL::bigint AS split_ordinal, c.funding_categories AS configuration
  FROM categories c LEFT JOIN groups g ON g.id = c.group_id
  UNION ALL
  SELECT 'transaction_snapshot', t.id, t.application_id,
         s.entry->>'categoryId', s.ordinality, s.entry->'fundingCategories'
  FROM transactions t
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.categories) = 'array' THEN t.categories ELSE '[]'::jsonb END
  ) WITH ORDINALITY s(entry, ordinality)
  WHERE s.entry ? 'fundingCategories'
), assessed AS (
  SELECT c.*, stats.*
  FROM configurations c
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE e.entry->'percentage' = 'true'::jsonb) AS percentage_count,
           COALESCE(bool_or(e.amount < 0) FILTER (WHERE e.entry->'percentage' = 'true'::jsonb), false) AS negative,
           COALESCE(bool_or(e.amount * 100 <> trunc(e.amount * 100))
             FILTER (WHERE e.entry->'percentage' = 'true'::jsonb), false) AS precision_violation,
           COALESCE(sum(e.amount * 100)
             FILTER (WHERE e.entry->'percentage' = 'true'::jsonb), 0) AS percentage_units,
           COALESCE(bool_or(
             jsonb_typeof(e.entry) IS DISTINCT FROM 'object'
             OR jsonb_typeof(e.entry->'amount') IS DISTINCT FROM 'number'
             OR jsonb_typeof(e.entry->'percentage') IS DISTINCT FROM 'boolean'
             OR jsonb_typeof(e.entry->'categoryId') IS DISTINCT FROM 'number'
           ), false) AS malformed_entry
    FROM (
      SELECT x.entry, CASE WHEN jsonb_typeof(x.entry->'amount') = 'number'
                          THEN (x.entry->>'amount')::numeric END AS amount
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.configuration) = 'array'
             THEN c.configuration ELSE '[]'::jsonb END
      ) x(entry)
    ) e
  ) stats
)
SELECT source, record_id, budget_id, category_id, split_ordinal, configuration,
       negative, precision_violation, percentage_units,
       percentage_count > 0 AND percentage_units < 10000 AS below_100,
       percentage_count > 0 AND percentage_units > 10000 AS above_100,
       jsonb_typeof(configuration) IS DISTINCT FROM 'array' OR malformed_entry AS malformed
FROM assessed
WHERE jsonb_typeof(configuration) IS DISTINCT FROM 'array' OR malformed_entry
   OR negative OR precision_violation
   OR (percentage_count > 0 AND percentage_units <> 10000)
ORDER BY source, budget_id, record_id, split_ordinal;
```

This uses PostgreSQL numeric arithmetic on JSON decimal values, not floating
point. It flags shape deviations (including numeric strings) separately from
arithmetic issues, ignores fixed amounts in totals, and counts duplicate entries.
A read-only audit should also run the following to avoid silently omitting malformed
transaction split roots:

```sql
SELECT id AS transaction_id, application_id AS budget_id,
       jsonb_typeof(categories) AS categories_shape
FROM transactions
WHERE jsonb_typeof(categories) IS DISTINCT FROM 'array'
ORDER BY application_id, id;
```

Group the resulting violation records by reason in the audit report; no write SQL
is proposed. Array roots and entry shape checks are limited to this funding audit.
The query is prepared but has not been executed or syntax-verified on a server.

This is audit design, not production tooling. No legacy query or data mutation ran.

## Runtime characterization result

Against unchanged production, all seven HTTP characterization tests passed on
localhost:5432/spendcraft_test. All four writers accepted and persisted negative
percentages, non-100 totals, and 0.001+99.999. Numeric strings became JSON numbers;
array order and repeated category IDs were preserved. The added 0.29+99.71 control
passed despite nonintegral JavaScript 0.29*100. Generic nonnumeric values returned
422 without changing complete Category/Transaction rows or balances. Category
POST missing/null returned 422; empty succeeded. Category PATCH missing/null
preserved legacy rules; explicit arrays replaced them. Transfer PATCH required
replacement splits and removed omitted/null embedded rules. Two client cases and
14 closed residual cases passed. No production validation or legacy audit ran.

## Prepared implementation

common/fundingPercentages.ts parses the canonical coerced number's mantissa and
base-10 exponent into exact BigInt hundredths; nonzero discarded digits are
precision errors. It sums percentage entries to 10,000 without tolerance. The
server Vine adapter intentionally uses Vine number/boolean coercion before the
array rule; malformed child values defer to their existing schema rules. Funding
issues use conventional collection-field errors with distinct rule codes.

CategoryDialog validates only the Bill configuration that its client writer sends;
FundingDialog validates each submitted funding configuration. Both display errors
outside generic CategorySpread, leaving auto-assignment unchanged. The HTTP test
expectations now reject invalid configurations and compare complete row snapshots.
Optional Category PATCH omission/null preserves legacy rules, explicit invalid
replacement rejects, and valid replacement succeeds. Transfer replacement behavior
is unchanged. Implementation HTTP tests passed across all four writers. The installed reporter
uses JSON:API code/detail/source.pointer errors, verified without changing that
contract. Surrounding regressions passed (195); the full suite passed 1,136 tests
against the 1,097 baseline. All task-created test fixtures were cleaned up.
