# Monetary storage/API migration scope

## Current status

The approved exact-cent JSON storage conversions are complete, including historical conversion.
Active monetary APIs use canonical two-decimal `DecimalMoneyString` amounts. Fixed-dollar inputs
use strings; percentage-mode values and interest rates remain numeric.

The identified non-tax monetary arithmetic has moved to checked integer `MoneyCents` on the client
and server. Exact decimal database storage remains in place; integer-cent runtime arithmetic does
not require another database representation migration. See the
[storage inventory and arithmetic status](remaining-monetary-storage-inventory.md) for boundaries
and the latest verified release.

## Active Loan Accounts and deprecated storage

The earlier blanket Loan exclusion in this document has been superseded by subsequent approved
cleanup and shared monetary changes. Active Loan Accounts use `accounts`, `account_transactions`
and Transaction JSON through the shared exact-money paths, including principal amounts. They are
not excluded merely because their Account type is Loan.

The deprecated `loans`, `loan_transactions` and `transaction_categories` tables are not monetary
authorities for the active application. Their models and active dependencies were retired; historical
schema migrations remain. Deprecated Loan-category exclusions no longer control current JSON
encoding. This documentation does not authorize dropping legacy tables or deleting historical data.
BalanceHistory remains outside the active migration scope. Plaid diagnostic logs preserve the
provider's received representation.

## Preserved accounting behavior

Monetary representation changes preserve existing signs, allocation ordering, residual-cent
assignment, funding formulas, conservation validation and Budget transaction boundaries. Storage
readers require canonical strings at migrated leaves; ordinary reads do not rewrite historical JSON.
Missing/null semantics and unrelated JSON properties remain preserved.

Percentage calculations do not turn percentages into money. Auto-assignment allocation rounding
and funding-goal period division now operate exactly on integer cents, with half ties toward positive
infinity. Input quantization retains its approved JavaScript rounding policy.

## Deferred tax arithmetic

Tax worksheet calculations retain their existing intermediate floating-point precision. Canonical
Tax storage/API amounts and cent-valued attribution/editing boundaries do not imply that the tax
formulas themselves have been converted. Further tax arithmetic work is deferred and requires a
separately scoped change; no tax-formula or rounding-policy change is authorized by this document.

## Operational boundary

Keep active codecs, migrations, financial regression tests and ordinary installation/rollback
procedures. Migration-only conversion/recovery tooling and compatibility profiles have been retired.
This scope record does not authorize a database connection, historical repair, schema change,
deployment, legacy-table deletion or application behavior change.
