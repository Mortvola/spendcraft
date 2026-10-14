# User-run narrow production Transaction forensics

Codex is not authorized to connect. This script is prepared and validated offline only. The previous user-run report verified database **budget**, port **5433**; these observed values are not replaced by conversational database labels.

## Source interpretation, not provenance claims

4281 and 4381: supplied report shows active regular type 0, nonloan comparable amounts with material differences. Treat independently. AccountsController creates manual rows with signed amount and split payload; current conservation checks protect transaction-tracked nonloan manual creation. TransactionsController PATCH can update relational amount and Category JSON separately; its explicit conservation guard applies to MANUAL_TRANSACTION type 5. Do not assume that guard covers regular type 0 imported rows. Date/start-date, pending/deleted status and account tracking govern effects, independently of what amounts represent.

Account.updateTransaction (Plaid modification) currently compares new provider amount with JSON sum and adjusts/creates an unassigned split while replacing old applied effects. Historical import/edit implementations may differ. processOfx preserves explicit splits and calculates adjustment from stored rows. Migration 1720992448419 (ed36358, July 2024) copied transaction_categories amounts into JSON without reconciling AccountTransaction amounts. Historical relational rows may therefore corroborate an old shape, not define current authority. Conservation checks were added in October 2026 (e45adfe/f606911). These are source-supported mechanisms only; production record dates and history are needed before attributing either disagreement to a writer or migration.

4598: FundingDialog starts destination amount from baseAmount, computes funders via cent-based computeSpread, optionally adds funding transfers, then appends negative funder entries. Raw destination/baseAmount dollar numbers are still distinct from cent-based funder arithmetic. CategoriesController.transfer checks cent-based zero sum, stores snapshots and applies aggregated Category deltas. Older goal proposals divided without quantization; 63d6f16 (August 2024) introduced cent truncation/rounded proposals, cd7e05f changed truncation to rounding, and the closed residual-direction correction later fixed the residual sign. None identifies the actual origin of +0.04. Required evidence: complete ordered destination/funder entries, baseAmount, historical fixed/percentage snapshots, includeFundingTransfers, timestamps and modifications. Current Category settings are explicitly current context. Do not allocate the four cents to a presumed last funder or recompute with current settings as a repair.

5710: starting-balance code normally creates one AccountTransaction and one funding-pool Category split, using balance minus eligible nonpending/nondeleted transaction sum. Existing starting balances are found through Account relations and updated from current supplied arithmetic. Loan amounts/principal differ; balance-tracked opening funding is currently prohibited. The generic audit excludes loans, multiple relational rows, unsupported/missing Account types, empty/malformed JSON and unsupported accountless shapes. The narrow report distinguishes those exact conditions rather than assuming which applies. A valid amount/principal/domain exception would require evidence before L5; loan correctness remains deferred.

Current update/delete/provider readers can trust JSON for Category effects and relational amount/principal for Account effects. Funding/historical balance/proposal readers consume JSON. Strict cent precision alone would not detect cent-exact material disagreement. No production financial behavior or compatibility rule is changed.

## Manual execution on the same local production server

Copy both **updated** auditLegacyTransactions.mjs and auditLegacyMoney.mjs in scripts next to the existing node_modules. The forensic script reuses the tested operational connection/cleanup implementation, passing only its own seven narrow SELECTs. It never calls the broad audit query set. A versioned shared-runner capability guard fails before connecting if a stale/incompatible helper is installed; do not copy only the forensic script.

The database argument supplies the explicit expected database name. Socket directory and port are required, not inferred. No application .env, ordinary PG_* variables or spendcraft-env is read.

For the target previously verified by the user:

```sh
SPENDCRAFT_AUDIT_SOCKET_DIR=/run/postgresql \
SPENDCRAFT_AUDIT_PORT=5433 \
node scripts/auditLegacyTransactions.mjs --database budget --execute
```

These values are operator inputs, not hard-coded in the script. Optional SPENDCRAFT_AUDIT_USER/PASSWORD can select local authentication credentials securely. Default user is the OS user. Optional SPENDCRAFT_AUDIT_OUTPUT_DIR chooses a new private output directory; otherwise a timestamped money-audit-* directory is created in the working directory. The directory must not already exist. Do not share credentials.

Connection is an explicitly selected local Unix socket, consistent with the successful production audit. TLS is disabled only for this non-TCP local transport. Remote TCP is not supported. Use a dedicated SELECT role where practical.

## Scope, privacy and safety

The fixed primary scope is **4281, 4381, 4598, 5710**. No sandbox IDs, deleted funding 4596/4597, Class B cohort or empty-split cohort is queried.

Q1: metadata, complete ordered split monetary text, funder/baseAmount/includeFundingTransfers and sanitized funding snapshots.
Q2: all AccountTransaction linkages with amount/principle, timestamps, pending/provider-presence flags, Statement ID and Account type/tracking/startDate. Current balances are returned only for starting-balance type 4 and labelled nonhistorical.
Q3: historical transaction_categories rows for those IDs; evidence only, not current authority.
Q4: matching Transaction change-log money/type/date and relevant allocation flags. No messages/descriptions. Missing changes do not prove no edit because array changes may be skipped.
Q5: Categories directly referenced by those splits/funding snapshots, budget scoped. Current monetary/configuration context only; no names.
Q6: explicitly linked Statements, date ranges and relational balances only.
Q7: provider observations directly matched internally to selected provider transaction/account identifiers. Only local IDs, timestamps, amount/currency are returned; no opaque provider IDs, payloads or merchants. Absence of a retained observation does not disprove import origin.

Exact SQL can be reviewed without any connection:

```sh
node scripts/auditLegacyTransactions.mjs --print-sql
node --test scripts/auditLegacyTransactions.test.mjs scripts/auditLegacyMoney.test.mjs
```

Live current_database and configured server port are checked before application-data reads. Startup default read-only is checked. All evidence reads use one explicitly verified READ ONLY / REPEATABLE READ transaction. Fixed SELECTs and transaction control only; no ORM/bootstrap/DDL/writes/temporary objects. The shared runner retains 60-second statement, 3-second lock, 5-minute total, 30-second idle-transaction and 100,000-row/query safeguards. Overrides use the existing SPENDCRAFT_AUDIT_* timeout/row variables. Row/deadline exhaustion aborts without publishing partial evidence as complete. Ordinary read locks/snapshot retention can affect DDL/MVCC cleanup; use a low-activity window.

Normal completion COMMITs, checks SELECT 1 and idle-outside-transaction status, then closes. Failure attempts ROLLBACK and closes; timeout/signals close the connection. No connection is created on import, usage or --print-sql. Raw driver errors are withheld; safe phase/error codes are reported.

## Report and interpretation limits

Private mode-0700 directory, mode-0600 report.json and summary.md. Includes sanitized verified target/server/schema metadata, snapshot settings, ordered record evidence, exact coefficient/scale totals/differences, exclusion conditions, date eligibility context, current Category context, history/provider/Statement linkage and unresolved questions. Malformed monetary/date/flag text is redacted, not converted; no descriptions, user names/emails, account numbers or credentials are selected for output.

Exact arithmetic uses the existing audit-only BigInt decimal operations. Scale-two normalization appears only as a labelled diagnostic. Empty/malformed split collections do not get an invented zero total. Loans and multiple AccountTransactions are not forced into a comparison.

Automatic preliminary L4 is emitted only for a demonstrated nonmatching supported comparison; it means intended economic state still needs review. Equality/diagnostic agreement does not automatically produce L1 or L5. No L2/L3 is inferred solely from persisted numbers. Missing records, excluded counterparts and insufficient evidence remain undecided.

Evidence thresholds: L1 requires unique per-split cent mapping and preservation of both Account and Category economics; L2 needs authoritative intended allocation and explicit remediation approval; L3 needs deliberate historical-reader isolation; L4 applies to unresolved financial intent; L5 requires a supported domain exception. A matched provider identity or current Category setting is insufficient on its own.

Exit 0 means complete forensic evidence collection, even with anomalies or missing/undecided records. Exit 2 is target/configuration/read-only safety failure. Exit 3 is runtime/limit/cleanup/output failure and may create aborted.json. There is no exit 1. Send only report.json and summary.md back for review. No report authorizes rounding, repair or compatibility implementation.
