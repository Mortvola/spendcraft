# Legacy monetary JSON / relational consistency audit

Preparation only. No database connection or production/data change is authorized by this design.
Baseline remains 1,136 passing tests; no full suite is needed.

## Inventory and readers

| Persisted field | Monetary paths / role | Counterpart and reader implications |
| --- | --- | --- |
| transactions.categories JSONB | `[i].amount`: posted allocation; `[i].baseAmount`: funding source/edit snapshot; `[i].fundingCategories[j].amount` when percentage=false: fixed currency configuration | Split sum has an aggregate counterpart in a single nonloan AccountTransaction.amount. Individual splits do not have an independent current relational row. Categories.balance is derived across history, not a per-split counterpart. Transaction update/delete, Account provider modification/removal and OFX reimport consume old splits; Category.balances consumes JSON for historical balances. |
| categories.funding_categories JSONB | fixed entry amount: currency configuration | No unique generated transaction counterpart. Budget.getProposedFunding, FundingItem and FundingDialog can consume it for future generation. Exclude every percentage=true amount from monetary classification. |
| transactions.taxes JSONB | `[i].amount`: tax attribution | TaxesController.getActuals aggregates it; no one-to-one posted balance counterpart and not necessarily equal to the split or transaction total. |
| statements.data JSONB | shortTermCapitalGains, longTermCapitalGains, dividends, taxableInterest: income/attribution | Starting/ending balances are separate numeric columns, not counterparts to these income values. TaxesController.getActuals reads data; no evidence these four JSON fields directly mutate Account balances. Statement balance/history semantics remain unchanged. |
| taxes.data JSONB | taxableInterest, qualifiedDividends, ordinaryDividends, taxableIraDistributions, taxablePensionAndAnnuities, taxableSocialSecurityBenefits, additionalTaxableIncome, shortTermCapitalGains, longTermCapitalGains, qualifiedBusinessIncomeDeduction; estimated.expectedAgi/priorYearAgi/priorYearTotalTax | Forecast/informational inputs; no posted relational counterpart. Filing status, year, rates and tax-type names are noncurrency. Higher precision is not by itself a posted-state violation. |
| transaction_logs.changes JSON | amount/principle old/new; supported categories amount/baseAmount snapshots if actually present | Historical/informational. getChanges skips array changes, so do not assume every allocation revision was recorded. Existing log readers expose history; no restore/replay engine was found. History cannot prove a current row's former amount absent a matching revision. |
| plaid_logs.response JSON | added/modified/transactions[].amount; accounts[].balances.current/available/limit and currency codes | Provider provenance. SDK-parsed, sanitized responses; original wire spelling has already been lost. Some logs can link by provider transaction/account identity to current AccountTransactions, but a historical log is not necessarily the current revision. Sub-cent reported balances may be legitimate valuations. |
| webhook_logs.request JSON | current consumed webhook notification contains identifiers/status, not posted monetary payload | Not a second transaction amount source; exclude notification metadata from this audit. Unexpected payload extensions require separate review rather than treating every number as currency. |
| AccountTransaction.location JSON; user roles/OTP, subscriptions, auto-assignment search_strings | location coordinates, authorization/search/push metadata | Noncurrency; excluded. |

Account/Category balances, AccountTransaction.amount/principle, Statement starting/ending balances and balance_histories.balance are relational numeric money, not JSON. Auto-assignment fixed configuration is relational real and remains separately deferred. No dedicated persisted original OFX monetary text/import payload was found. CLI source files are not reliable database provenance. Do not infer original OFX precision from a normalized row.

The old transaction_categories table remains after the JSON migration. Its rows are historical copies and current writes do not keep them synchronized; selected reports still query that table. It is **not** an independent current per-split authority and is not used for automatic mismatch classification. This audit does not reopen report/lifecycle correctness.

## Exact classification

Retrieve individual JSON number/string values as PostgreSQL text, not parsed JavaScript numbers. JSONB normalization may change exponent notation or formatting but preserves the numeric mathematical value; it cannot recover original HTTP/provider spelling. JSON logs are traversed as JSONB for classification, so their original lexical spelling is not claimed in output.

The audit-only parser converts a bounded signed decimal coefficient and exponent into BigInt coefficient plus decimal scale. Strip coefficient trailing zeros: remaining scale <=2 means cent-exact. No Math.round, multiplication of binary numbers by 100, tolerance or rounding is used to accept values. Thus 1.2/1.20/1.200 are equivalent; 0.005 and 0.30000000000000004 are sub-cent. Numeric strings are classified separately as representation-only when mathematically cent-exact. Nonnumeric strings/objects/null/missing amounts in posted splits are unclassifiable; malformed text is not dumped. Bounds prevent huge exponent allocations and yield unclassifiable rather than an invented value.

A separate exact BigInt diagnostic computes scale-two decimal half-away-from-zero and both rounded-total and sum-of-individually-rounded cents. It describes possible known PostgreSQL normalization only. Agreement is not proof of historical normalization timing, especially with multiple writes, JavaScript arithmetic, or missing history.

## Transaction correspondence and classes

Inspect all Transactions, including deleted/pending/history, all split array entries and explicitly missing amounts. Record inactive context so inclusion does not imply active balance effects.

For exactly one linked nonloan AccountTransaction, compare exact split sum with relational amount text. Account principal and loan balance semantics are distinct: loan/multiple-account-row cases are explicitly comparison-unavailable, not forced into an amount or principal invariant.

For accountless transfer/funding/rebalance types (1/2/3), zero is a financial conservation invariant, **not** an independently persisted relational total. Distinguish this check from relational disagreement counts. Other accountless types get no invented counterpart.

Report JSON total, target, exact difference, rounded-total cents, independently-rounded-split cents and normalization agreement. Flag cancelling sub-cent inputs as still sub-cent even when total is zero. Multiple affected splits remain individually visible; affected transaction denominator is distinct. Cross-transaction summation does not establish a common logical operation.

| Class | Meaning | Cents-migration implication |
| --- | --- | --- |
| A | Cent-exact posted values | Exact read adapters can convert without changing value; no precision data migration required for these values. |
| B | Sub-cent posted values with agreement under scale-two diagnostic | Requires explicit legacy authority/normalization decision. A future read adapter must not silently choose a repair merely because rounding matches. |
| C | Sub-cent posted values with disagreement under that diagnostic | High-priority migration blocker; reconcile exact facts before changing/reversing state. |
| D | Malformed posted shape/value | Block conversion for affected records; explicit assessment needed. |
| E | Sub-cent or malformed currency configuration/baseAmount | Generation/edit DTO policy needed; no unique generated-posting link is assumed. |
| F | Sub-cent informational/attribution/forecast/history money | Preserve precision until a reader-specific DTO or posting policy is chosen. |
| G | Provider monetary provenance/valuation | Preserve separately; not a posted-cents violation by itself. |
| H | Unknown/non-USD/unofficial currency context | Candidate USD-only cents contract unresolved; do not infer FX or supported minor units. |
| I | Other anomaly or unavailable defensible comparison | Explain separately; cannot authorize a repair. |

B/C detail also reports the raw JSON-versus-relational difference; rounding agreement does not mean exact equality. Current balances are not reconstructed in this audit: eligibility, account start dates, pending/deleted state, historical ordering and provider valuations make that a separate undertaking.

## Prepared script and exact SQL

Standalone script: `/tmp/spendcraft-legacy-money-audit.mjs`. It imports only Node facilities and the pg driver through the repository package location. It does not import models, boot Adonis, run hooks or use ORM persistence.

Review all exact SELECT queries offline:

```sh
node /tmp/spendcraft-legacy-money-audit.mjs --print-sql
```

The script contains these named queries:

- roots: minimal IDs/budget/type/deleted context and JSON root type/array sizes across the seven monetary stores.
- posted: Transaction identifiers plus AccountTransaction amount/principle/pending/provider and Account type; no descriptions or account numbers.
- leaves: recursive SELECT-only JSON traversal with an explicit whitelist of monetary paths. Returns path/type/decimal text/category ID/mode; excludes unrelated payload fields and percentage amounts from final classification.
- shapes: fixed funding-entry and embedded-snapshot shape/mode/amount-presence checks, without percentage validation.
- missing: split objects lacking an amount.
- providerLinks: extracts only provider transaction amount/currency and matches opaque provider account/transaction IDs inside SQL to local relational rows. Does not disclose opaque provider IDs. Comparisons are labelled historical-log versus current-row, not revision-equivalent facts.

Provider account balance values are separate provenance counts; no historical balance-to-current accounting equality is asserted. Currency counts refer to contexts where codes were present; discarded/missing metadata cannot establish USD. Null provider balances mean unavailable and are not malformed posted amounts. Available/limit are provenance only, despite being included to avoid hiding high-precision monetary evidence.

## Denominators and disclosure

Report total Transactions; split array entries and actual objects; cent-exact/sub-cent/malformed/missing split amounts; affected Transactions; multiple affected split details; malformed roots; exact-total disagreements; independent relational disagreements; B/C counts; historical reversal-reader exposure.

Separately report Statement rows and monetary field counts/precision; transaction tax-attribution counts; tax forecast counts; Category and snapshot fixed-currency entry counts/precision and malformed modes; embedded snapshot count; change-log monetary counts; provider log/transaction/balance monetary counts and sub-cent counts; unavailable provider balances; currency contexts and unknown/non-USD contexts. A provider log can repeat an event: provenance counts are observations, not unique posted transactions.

Output anomalous records with only local ID, Budget ID where available, transaction type/deleted context, path/split ordinal, Category ID, numeric value/type, class and exact comparison facts. No category name is needed. No descriptions, merchants, usernames, account numbers, tokens, credentials, log messages or whole provider payloads are emitted. Cent-exact values are normally aggregate counts, with representation-only numeric-string counts. Paths are zero-based; SQL ordinality fields are one-based and named accordingly.

## Target and read-only safeguards

Current `.env` sets PG_HOST=localhost, PG_PORT=5432, PG_DB_NAME=spendcraft_sandbox, DB_CONNECTION=pg. config/database.ts uses these same variables for pg and pgLog. `.env.test` selects spendcraft_test and is not loaded. `.env-dev` is not selected. Process overrides must be verified again at execution; unexpected environment overlays/default connections abort before connecting. No credentials are reported.

Only after fresh authorization, the script may run with `--execute`. Before application rows:

1. Confirm current config/database.ts still maps both names identically; verify effective .env/process settings exactly match the sandbox target.
2. Open both direct clients and run only `SELECT current_database(), inet_server_port()`; mismatch stops application SELECTs.
3. On pg execute `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` and SELECT current settings to assert both protections.
4. Read all application data through that single snapshot. pgLog is verified but performs no separate application-data scan, avoiding cross-snapshot discrepancies.
5. COMMIT the read-only transaction, verify SELECT 1 through both connections, close both. Failure disconnects clients and rolls back any active read-only transaction.

Only SELECT application-data statements and transaction control are present. No DDL, writes, advisory mutations, bootstrap, migrations, seeds, temporary objects or cleanup are needed. SQL remains prepared but unexecuted; live schema compatibility will be checked by execution and failures surfaced without writing.

## Verification and authorization boundary

Offline script syntax and exact-decimal controls can run without pg connections. Repository documentation checks comprise both TypeScript projects, ESLint, Knip, circular regression and both diff checks. No DB or full-suite test is required during preparation.

Required next authorization: **read-only legacy monetary JSON / relational consistency audit against localhost:5432/spendcraft_sandbox only**. Findings will be reported without normalization, repair, inference of intended replacements or migration execution.
