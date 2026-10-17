# Monetary storage/API migration scope

## Approved deprecation boundary

**Loans and the entire `transaction_categories` architecture are deprecated and excluded from the exact-money migration, regardless of where they are referenced.**

This product decision supersedes earlier inventory, compatibility and preservation recommendations concerning these features. It applies to the complete Loan feature and every reader, writer, relationship, query, report, helper and API dependency using transaction_categories, including non-Loan uses.

Do not classify their fields as active monetary storage or their data as monetary authority. Do not design exact-money encodings, compatibility adapters, fallback logic or data migration for them. Do not include them in the active migration sequence or acceptance matrix. Preserving legacy Loan ownership evidence is not a requirement of the new monetary architecture. Deprecated storage must not dictate current Transaction JSON, nondeprecated relational money or API contracts.

Prior accepted Loan persistence and legacy-admission verification remains historical evidence of existing behavior, not an obligation to migrate or retain the deprecated feature. Earlier monetary-field catalogs mentioning Loan fields or transaction_categories describe existing source only; those entries are excluded from the active inventory.

## Shared-code dependencies requiring separate retirement

Current source still contains these dependencies. Recording them does not promote them to active monetary authorities or authorize changing them.

| Source | Existing dependency | Migration disposition |
| --- | --- | --- |
| app/Controllers/Http/ReportController.ts, budgetProgress | Both funding and activity queries consume transaction_categories | Deprecated report functionality requiring separate retirement; exclude its legacy query/aggregation from active exact-money design and acceptance |
| app/Controllers/Http/CategoriesController.ts, transfer replacement admission | loan_transactions joins transaction_categories to detect legacy Loan ownership | Deprecated structural dependency requiring separate retirement; no legacy-ownership adapter or preservation requirement for the new architecture. The surrounding nondeprecated funding/rebalance lifecycle is not deprecated by this decision |
| Complete Loan feature, including Loan-specific branches in otherwise shared Account/Transaction/Category code | Loan models, settings, principal/payment paths, APIs and UI/typing references | Exclude Loan-specific behavior and fields. Identify shared-code boundaries during inventory; do not silently change or remove those branches |
| Generated schema, migrations, legacy audit tooling, tests and historical documentation | Schema/history or diagnostic references | Retain unchanged; not an active storage authority or required migration acceptance case |

Category, Funding History and Income Vs. Expenses already use their separately approved JSON allocation/deduction authorities. No new report authority, replacement implementation or compatibility layer is approved here. Nondeprecated amounts remain in scope even if adjacent to deprecated Loan fields; for example, AccountTransaction.amount is not excluded merely because the same model also contains Loan-specific principle data.

## Runtime and historical boundary

Leave existing Loan and transaction_categories code, tables, migrations and historical data unchanged. This decision does not itself remove an endpoint, alter report output, bypass admission, modify a foreign key, rewrite JSON or repair balances. Retirement of reachable functionality and physical removal each require separate approval. Inventory may flag a dependency for that work; it must not implement a replacement or fallback.

No database connection, destructive operation, runtime correction, monetary representation change, schema migration, historical repair, deployment or commit is part of recording this decision.
