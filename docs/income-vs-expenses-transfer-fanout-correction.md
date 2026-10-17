# Income Vs. Expenses JSON transfer deduction and fan-out correction

**Current status: PostgreSQL ACCEPTED.** [Verification](income-vs-expenses-transfer-fanout-postgresql-verification.md):33 narrow,1,721 focused,1,762 full-suite passes;0 failed,0 skipped/pending. All27 safeguard tests passed first. No further production change was needed; earlier implementation-stage pending statements below are historical. Task-specific authorization is now expired.

## Baseline and scope

HEAD `756cf3a8f8d52bb9b11255a5bf80341d3f00fdcc`. Read AGENTS, final readiness, both correctness reviews, allocation-authority design, accepted Category/Funding History verification and accounting invariants before implementation. Current source matches that review; all accepted baseline corrections remain present. Existing uncommitted review/test work and unrelated untracked files were preserved; the index was not changed. Current product clarification: Income Vs. Expenses keeps AccountTransaction amounts as its movement source and uses CURRENT Transaction JSON only for the Account Transfer deduction. This supersedes the earlier relational-deduction restriction for this report. Only this report method changes in production; no other reporting or structural legacy use is removed. Implementation is pending fresh PostgreSQL verification, not accepted DB behavior.

## Existing endpoint and economic inputs

Authenticated GET `/api/v1/reports/income-vs-expenses` resolves the user's Budget in ReportController.get and invokes incomeVsExpenses. The active Reports choice renders client-src/Reports/IncomeVsExpenses.tsx, which GETs the report, prepends date/income/expenses/net chart headers and displays a ComboChart. No client allocation arithmetic or UI changes are required.

Source before correction:

- Transactions t INNER JOIN AccountTransactions at by t.id, INNER JOIN Accounts a by a.id. Each AccountTransaction is an existing movement, including multiple links if present; primary-key Transaction/Account joins do not independently fan it out.
- LEFT JOIN transaction_categories tc by Transaction ID and the Budget's Account Transfer Category ID.
- Filter t.application_id=authorized Budget, a.tracking=Transactions and t.type!=STARTING_BALANCE/type4. No other type exclusions, Account.closed filter, pending/deleted filter or Account.startDate eligibility test.
- No request date-range filter. Transaction.date determines calendar year/month; group and order by month ascending. There is no pagination or count field.
- Original sign determines bucket: at.amount>=0 contributes at.amount−COALESCE(tc.amount,0) to income; at.amount<0 contributes that expression to expenses. Do NOT classify using the net sign after subtraction.
- SQL SUM results are parsed with parseFloat; net is JS income+expenses. Response stays `[month,income,expenses,net][]`, numeric money, empty array when no selected movements.

The movement source, filters and sign behavior are preserved. The relational transfer-deduction source described above is historical: it is superseded by the subsequent explicit JSON-deduction decision. It is distinct from ordinary Account/Category posting eligibility and from current nominal Category or type2 Funding History authority.

## Original defect and reproduction

Actual pre-correction method bodies were executed with inert relational adapters before runtime editing. Existing22 source/report tests passed, including the characterized wrong result. A frozen TEST-ONLY method body at this HEAD now permits old/new selection and arithmetic comparison without application or DB bootstrap.

Movement50 with one qualifying transfer50 reports0. The same movement with transfer20+30 reports `(50−20)+(50−30)=50`; n matching rows contribute n×movement−SUM(transfer). Two legitimate20 rows must sum40, not be collapsed by SUM(DISTINCT). A zero-valued matching row also must not repeat the movement. This is join cardinality, not a transfer-product or monetary precision change.

## Corrected aggregation structure and key

The method expands CURRENT Transaction.categories JSON and builds a Budget-scoped grouped CTE, then uses the unchanged AccountTransaction movement selection/SUM/response logic:

```sql
WITH transfers AS (
  SELECT transfer_transaction.id AS transaction_id, SUM(transfer.amount) AS amount
  FROM transactions AS transfer_transaction
  CROSS JOIN LATERAL jsonb_to_recordset(transfer_transaction.categories)
    AS transfer("categoryId" int, amount decimal)
  WHERE transfer_transaction.application_id = :budget
    AND transfer."categoryId" = :accountTransferCategory
  GROUP BY transfer_transaction.id
)
SELECT /* unchanged month and income/expense SUM expressions */
FROM transactions AS t
JOIN account_transactions AS at ON at.transaction_id = t.id
JOIN accounts AS a ON a.id = at.account_id
LEFT JOIN transfers AS tc ON tc.transaction_id = t.id
/* unchanged outer Budget/tracking/type filters, grouping and ordering */
```

Implemented through Lucid builders and bound parameters. Transaction ID remains the transfer-to-movement association key; not amount/date/Account/Category alone. The CTE returns at most one matching row per Transaction, so every selected AccountTransaction contributes once. Multiple Account links still each subtract the Transaction attribution according to the previous one-transfer-row behavior; no new once-per-Transaction/shared-link transfer policy is invented.

Lucid's typed leftJoin overload does not accept a grouped builder directly; its supported with(alias,builder) API supplies the grouped CTE without casts or raw interpolated SQL. The CTE is not separately awaited/executed and introduces no extra database roundtrip. No DISTINCT, relational fallback, row consolidation or historical data mutation exists. JSON is used ONLY for the deduction; AccountTransaction.amount remains the income/expense movement source.

| Movement | Matching JSON amounts | Corrected contribution |
| --- | --- | --- |
| 50 | 50 | 0 |
| 50 | 20+30 or10+15+25 | 0 |
| 50 | none or0+0 | 50 |
| 50 | 20 | 30 |
| 50 | 20+20 | 10 |
| −50 | −20−30 | 0 in expense bucket |
| −50 | +20+20 | −90 in expense bucket |
| +50 | −20−20 | 90 in income bucket |
| +50 | +80 | −30 STILL in income bucket |
| −50 | −80 | +30 STILL in expense bucket |

## Selection and security

Current movement IDs remain selected under the same outer Budget/tracking/type conditions; pending/deleted/pre-start/closed Accounts retain existing inclusion. Multiple Accounts and months remain separate existing movements/periods. Accountless Transactions lack the required AccountTransaction join and stay absent. Type2/3 with links are not newly excluded; type4 remains excluded. The grouped CTE can aggregate scoped transfer rows whose movements are excluded outside, but such totals never join a selected movement. The matching Category rule is unchanged, but allocation authority/identity intentionally changes from legacy row IDs to CURRENT JSON rows (Transaction + array index). Old relational-row identity is not used for deduction.

The CTE independently filters the owning Transaction's Budget BEFORE grouping and filters the same owned Account Transfer Category. A foreign Transaction linked to an own Category cannot enter it; a foreign/other Category linked to an own Transaction does not qualify. No cross-Budget global aggregate or SQL interpolation is introduced. Movement ownership remains the existing Transaction Budget and link selection; this task does not invent additional Account/Institution coherence rules for malformed linked data. Baseline cross-link policy limitations outside this aggregate are not newly certified.

## Authority, read-only behavior and precision

Transfer deduction now uses CURRENT nominal Transaction.categories rows matching the Budget's Account Transfer Category. JSON-only rows are deducted; absent/empty JSON means deduction0. Legacy-only or disagreeing transaction_categories rows are ignored, never merged or used as fallback. For movement50: JSON50/legacy20 reports0; JSON[]/legacy50 reports50. No legacy row is invalidated, copied forward or repaired. This product decision defines the deduction source only; it does not make income itself a sum of Category JSON or approve new movement/status/multi-link/tax policy. No stored transfer/Transaction/Category/Account/Pool/Statement/log row changes, normalization, repair, backfill or history reconstruction occurs. Query runs without new Budget gates/locks or a stronger point-in-time read snapshot contract.

Touched monetary boundaries for later inventory: AccountTransaction.amount is stored numeric money and transfer amounts are existing Transaction JSON numbers; CTE/outer SQL SUM and subtraction are read-side aggregation; database numeric result is consumed using existing parseFloat; net is existing JS-number addition; API money remains JSON numbers; chart consumes numeric arrays and adds headers only. There is no new scale, rounding, parsing, decimal library, money-string or MinorUnits policy. Future monetary work must preserve original-sign classification and the new once-per-movement cardinality.

## Isolation and files

Runtime: only ReportController.incomeVsExpenses changes. Category/Funding History, Budget Progress, Payee and Net Worth bodies are hash-checked against HEAD. Tax/Statement runtime and client source are unchanged. Transaction DELETE/current eligibility/cascade defects remain intentionally untouched; no new writer or concurrency architecture appears.

Tests: new unit/reports/incomeFanout.spec.js, TEST-ONLY fixtures/reports/legacyIncomeBody.js and functional/reports/incomeFanout.spec.ts; existing unit/reports/allocationAuthority.spec.js updated for the new grouped query and expanded unchanged-report hashes. Documentation: this record, monetary readiness and both correctness reviews. Earlier uncommitted finalReadiness characterization and review text remain preserved.

## Non-DB verification

The earlier relational-candidate verification passed253 tests; that count predates the JSON-deduction clarification. Final JSON-deduction verification:262 focused tests passed,0 failed,0 skipped/pending, including26 dedicated fan-out/JSON-authority cases and25 existing allocation/source cases. Both TypeScript checks, final ESLint, Knip, circular regression and server build with client assets pass. The obsolete unused legacy parameter in an inert adapter was removed after lint identified it; no suppression was used. Accepted eligibility, funding preview/rounding, date/admission, provider, Loan settings, Budget/Category-Pool concurrency and deprecation source/pure/client regression selections pass. Three previously added current DELETE characterizations still pass unchanged; that defect is NOT corrected here. Both TypeScript checks, ESLint, Knip, circular regression and server build (including Vite client assets) pass. No separate client build is required because client production source is unchanged. Circular audit retains only the accepted11-model/26-edge component (415 analyzed files/492 repository nodes). Normal/staged diff whitespace checks pass, and new files are separately checked. Existing client chunk above500kB is the only build advisory; no warning was suppressed. No PostgreSQL, destructive setup/cleanup or DB-backed test was run. Inert tests execute actual old/new method bodies through a small relational adapter (not PostgreSQL precision/planner execution). They compare selected movement IDs and raw outer selector/group/SUM expressions, and test JSON allocation identity/ownership, partitions, duplicate-valued/zero rows, signs, multiple Accounts/links, periods, API rows and Budget/category exclusions. Explicit JSON/legacy disagreement and legacy-only fixtures prove that deduction has no relational fallback. No app/DB bootstrap is used. Builds do not perform database verification.

## Prepared PostgreSQL matrix — NOT RUN

31 executable functional cases:

- Eight core movement50 JSON partitions/no/partial/duplicate-valued/zero combinations.
- Six exclusive JSON-deduction cases: JSON-only, disagreement, matching, legacy-only, neither and duplicate JSON rows.
- Six sign/bucket cases including sign flips and zero movement.
- Multiple movements/Accounts plus two links to one Transaction, preserving per-link attribution.
- Six type/tracking/status selection cases (including pending/deleted/pre-start/closed behavior and ignored date query parameters).
- Calendar rollover/order/accountless exclusion and empty selected movement response.
- Cross-Budget Transaction/Category attribution fixtures, same-Budget valid rows.
- JSON-only deduction,26-movement/51-JSON-allocation query-count/read-only/raw-snapshot/EXPLAIN case, with no transaction_categories SELECT from GET.

Fixtures snapshot Accounts, Categories/Pool, Transactions/JSON, Account links, legacy transfer rows, Statements and logs. Existing guarded standard bootstrap must verify configured/live pg AND pgLog AND the exact execution connection independently before EVERY destructive fixture/setup/cleanup statement. No local teardown, DDL, schema change or bypass is added. The future performance case captures the single report SQL with bound parameters and replays read-only EXPLAIN ANALYZE; no query plan or timing is claimed now. No arbitrary sleeps or new locks exist.

Future DB verification must also run accepted Category/Funding History, tax, net-worth, Statements, provider, funding/admission/date, eligibility, concurrency, Loan and deprecation regressions. Existing legacy data stays untouched except authorized test fixtures. This task MUST stop for fresh authorization restricted to localhost:5432/spendcraft_test; previous authorization remains expired.


## Subsequent product clarification — governing current implementation

The user explicitly confirmed: “Income vs Expenses should use JSON for the transfer deduction.” The report is a combined calculation: AccountTransaction.amount minus the aggregate CURRENT matching Account Transfer JSON amounts. It is not JSON-only income/expense accounting. This decision supersedes prior instructions to preserve the relational deduction source. Only the Income method is changed; Budget Progress and structural Loan ownership still retain their separately scoped legacy references. No database connection or historical data repair accompanies this change.


Current JSON implementation evidence: Income method contains no transaction_categories reference, and no legacy fallback.31 PostgreSQL cases are prepared, NOT RUN. Report-only final rerun passes51 tests. Other report hashes remain unchanged. Database verification requires fresh task-specific authorization only for localhost:5432/spendcraft_test with independent accepted safeguards before every destructive operation/cleanup. No database connection, destructive DB operation, historical repair, broader transfer-policy change, other report correction, DELETE/cascade correction, monetary/schema migration, deployment or commit occurred.

## PostgreSQL verification follow-up

The task-specific verification record is [Income PostgreSQL acceptance](income-vs-expenses-transfer-fanout-postgresql-verification.md). All31 prepared cases passed; two additional cases cover a single zero and irrelevant/missing JSON Category references, for33 narrow passes. The approved JSON deduction is explicit product direction, superseding the earlier relational-only candidate. No production or safety-infrastructure correction was needed. Focused acceptance passed1,721 tests,0 failed,0 skipped/pending before starting the complete suite. Historical non-DB and prepared-only statements above describe implementation-stage evidence, not the latest verification status.
