# Category / Funding History report allocation authority implementation

Implementation HEAD: `b06de7575eda2354d30ac3d741b8ff7aba3ad74c`. Existing review/design/test work and unrelated user files were preserved. Implementation is a forward read-authority correction. It is now PostgreSQL-accepted; see the verification follow-up below. No database connection occurred during the implementation phase.

## Approved contract and compatibility

Only Category and Funding History change. Category uses CURRENT NOMINAL Transaction JSON allocation; Funding History uses CURRENT TYPE-2 NET JSON allocation. Neither reconstructs historical applied Category effects or reads Category.balance as attribution. JSON authority is exclusive: legacy-only allocation rows are intentionally omitted from these two reports. They are not deleted, invalidated or repaired; they simply are not the chosen reporting authority.

| Current JSON | Legacy relational | New attribution |
| --- | --- | --- |
| 50 | absent | 50 |
| 50 | 20 | 50 |
| 50 | 50 | 50, never100 |
| empty | 50 | 0 |
| empty | absent | 0 |
| 20 +30 same Category | any | 50; Category count2 |

Zero attribution retains the old wire conventions: Category has no aggregate row when no allocation joins; Funding History still enumerates the current owned Category but history is null when no monthly allocations exist. An explicit zero JSON allocation still counts as an allocation row and can produce a zero monthly sum. No fallback, union, reconciliation, backfill, copying or nonzero-preference logic exists.

## Endpoint flow and preserved selection

Authenticated GET `/api/v1/reports/:report` resolves the user's Budget. Category request filter IDs are validated through owned Category/group lookups before the private query. Existing UI components fetch their respective report directly; they are unchanged.

Category query starts with Transactions, expands `jsonb_to_recordset(t.categories)` into `categoryId int, amount decimal`, joins current Category/group and scopes BOTH Transaction and group to Budget. It retains optional inclusive Transaction.date bounds and types0/5 only. Deleted/pending/pre-Account.startDate rows are still included: no Account join or ordinary accounting-eligibility helper is added. No pagination exists. Grouping remains by current group/category names, ordering by those names, with row_number in the same order. SUM is still cast float; COUNT(*) is still integer allocation-row count. Duplicate JSON rows contribute once each; differing legacy cardinality is intentionally irrelevant. Names are current, not snapshots. Missing/foreign Category IDs fail the scoped inner join; valid allocations on the same Transaction still report normally. Explicit owned Unassigned rows behave like other selected Categories; no synthetic remainder is calculated.

Funding History enumerates owned current Categories/groups, excludes CategoryType.FundingPool, and retains group/name ordering. Its correlated monthly subquery now expands Transaction JSON and matches Category ID; it explicitly matches Transaction Budget to the outer owned group. It retains type2 only and grouping by persisted Transaction date year/month; deleted records remain included. No Account/pending/startDate filter or date cutoff is introduced. Type3 and opening/type4 remain excluded. Monthly array ordering remains unspecified as before. The client still selects/displays the last12 months and totals the returned history. No count or pagination is added.

Funding History sums row amount (NET), never baseAmount, percentage, requested/gross funding or current funding rules. Fixed/percentage/goal/mixed/transfers all report their persisted result without recalculation. Replacement reports current replacement JSON at the original immutable date; no old-version reconstruction occurs. Negative/net/zero and floating artifacts retain current numeric representation.

## Security, binding and nonmutation

Both ends of attribution are scoped: an owned Transaction cannot reveal foreign Category metadata, and a foreign Transaction cannot contribute to an owned Category. Category filter ownership/404 behavior is unchanged. Current-name inner joins provide the narrow existing missing-ID behavior; no Unknown bucket, invented name or Unassigned conversion is added. Funding History Budget scope uses an outer-owned group correlation, with no interpolated user SQL.

Reports remain default-connection read queries, with no new transaction, gate or snapshot promise. There are zero financial writes. Category/Account/Pool balances, Transaction JSON, legacy rows, settings and logs are untouched. Legacy Loan-ownership checks in replacement admission remain unchanged. No concurrency architecture, accounting eligibility, immutable date or provider lifecycle changes occur.

## Isolation and precision

Income Vs. Expenses, Budget Progress, Payee and Net Worth method bodies remain byte-identical to HEAD (source hash regression). Tax/Statements, client UI and all writers are unchanged. Income transfer fan-out remains separately unresolved; Progress still depends on monthly_expenses with no current editing persistence. Tax actuals retain taxes/Statement income authority. Loan nominal rows matching types0/5 can report without inventing principal/interest decomposition.

This uses the repository's existing JSON recordset/decimal extraction pattern, not a monetary representation migration. Category SUM/float response, Funding History JSON numeric aggregation and client JS totals/toFixed remain precision backlog. baseAmount remains snapshot metadata; rate/percentage remains ratio. No rounding changes.

## Performance

Category changes legacy-join scanning to Budget/type/date-filtered Transaction scanning plus lateral expansion and Category/group joins. No Account joins multiply allocation rows. Funding History retains its existing per-Category correlated query shape, now expanding JSON; work can scale with Categories times selected Transactions/splits. PostgreSQL may push predicates, but no EXPLAIN, row-count estimate from live data or performance guarantee is claimed. Existing schema/indexes remain untouched. Separately authorized verification should inspect realistic volumes/plans before acceptance; no evidence currently establishes an operational blocker requiring schema work.

## Files and verification

Runtime: `app/Controllers/Http/ReportController.ts`, only category/fundingHistory bodies. Tests: `tests/unit/reports/allocationAuthority.spec.js`, `tests/functional/reports/allocationAuthority.spec.ts`. Documentation: this file, authority design and both correctness reviews. No client production change.

Final non-DB verification:227 tests passed,0 failed,0 skipped/pending, including22 allocation-authority/source tests and representative accepted eligibility, OFX, funding preview/rounding, replacement admission, Loan settings, Budget/Category-Pool concurrency and deprecation tests. Both TypeScript checks, ESLint, Knip, circular regression and server build (including Vite client assets) pass. No client source changed, so no separate client build was required. Circular audit retains the accepted model component, without unexpected cycles. Normal/staged and new-file whitespace checks pass. The first build/TS run caught only a prepared fixture excess-property type error; it was corrected without casts/suppressions and both reruns passed. Build warning: existing minified client chunk exceeds500kB. No PostgreSQL tests or full DB suite ran. Inert method adapters characterize the selected query subset and source predicates; they are not PostgreSQL execution or proof of a database query plan. The earlier pre-correction findings remain documented in the design; assertions now cover exclusive authority and preserve deferred Income behavior.

## Prepared PostgreSQL acceptance — NOT RUN

The new functional file prepares31 executable cases: both reports' six exclusive-authority cases; both reports' five status/type cases (including pending/pre-start fixtures); both reports' cross-Budget JSON cases; Category date-boundary/multiple/Unassigned/count case; five persisted fixed/percentage/goal/mixed/transfer net cases; and Pool/baseAmount/date case. Generated-net fixtures are report-reader fixtures, not a claim to rerun rule generation. Standard guarded bootstrap independently verifies configured/live pg/pgLog and each destructive execution connection, including fixture mutations and returned cleanup. No local unsafe teardown, table extension or direct destructive SQL helper was added. No tests were bootstrapped/executed against PostgreSQL.

Future authorized selection must additionally run existing report filter/security, real funding replacement/immutable-date and preview2/posting2 suites, provider reimport/allocation tests, and accepted eligibility, Loan settings, Budget concurrency, Statements/initialization and deprecation regressions. Verify before/equal/after startDate, same name grouping, owned/missing/guessed filter IDs, accountless funding, replacement at retained date, JSON missing Category, type0/5 origin independence and read-only snapshots. Compare raw Transactions/JSON, Categories/Pool, Accounts, links, Statements, logs and legacy rows around GETs. Existing tests exercise creation/calculation semantics; report fixtures deliberately read persisted results without recalculating them.

Fresh task-specific authorization is required only for localhost:5432/spendcraft_test; accepted safeguards must run independently before every destructive operation including cleanup. Previous authorization remains expired. Historical-as-posted reports would need a separately defined authority model; this implementation makes no historical effect inference.


## PostgreSQL verification — accepted

The [verification record](category-funding-history-report-authority-postgresql-verification.md) at HEAD b06de757 records27 safety/43 narrow/1,656 focused/1,697 full-suite passes,0 failed,0 skipped/pending. Exclusive JSON authority, legacy-only omission, current net replacement/date, provider reports, row counts, security, raw nonmutation and read-only SQL instrumentation pass. Existing filter-query observation and new EXPLAIN test placeholders were corrected; no additional runtime correction was needed. Both TypeScript checks, ESLint, Knip, circular and server/client-asset build pass. Standard large-chunk/HMR/pg warnings remain. Task-specific authorization is now expired; no further database work is authorized. Earlier prepared/pending sections describe implementation-stage evidence, not current acceptance. Income Vs. Expenses/Budget Progress remain deferred; historical allocation data is not repaired.
