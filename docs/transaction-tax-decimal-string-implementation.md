# Transaction Tax attribution decimal-string storage

**Completed:** storage implementation, deployment and approved historical conversion. The historical converter and completed verification/rehearsal records have been retired; runtime codecs and regression tests remain active.

## Storage contract

`transactions.taxes[].amount` stores canonical two-decimal strings. Ordered entries retain string tax identifiers, duplicate types and unrelated stored metadata. Model/runtime and public API amounts remain numbers.

The approved persistence policy accepts fractional inputs and applies JavaScript rounding:

```typescript
const cents = Math.round(amount * 100)
const storedAmount = (cents / 100).toFixed(2)
```

Inputs must be finite, produce safe integer cents and pass existing encoding/decoding round-trip checks. Positive and negative half ties follow JavaScript semantics; negative zero becomes `"0.00"`. There is no tax-array conservation rule or comparison with AccountTransaction, Category, Statement or movement totals. Entries are independent attributions.

## Active boundaries

| Source | Responsibility |
| --- | --- |
| [taxAmountCodec](../app/services/taxAmountCodec.ts) | Checked scalar conversion, tax-array encoding/decoding and submitted-value validation |
| [taxStorageBinding](../app/services/taxStorageBinding.ts) | Scoped hydration, dirty-write staging, Lucid preparation and numeric post-save state |
| [transactionTaxStorage](../app/services/transactionTaxStorage.ts) | Batch scope/Loan exclusion, PATCH replacement validation and save staging |
| [Transaction](../app/Models/Transaction.ts) | Find/fetch/save hooks and tax column persistence |
| [TransactionsController](../app/Controllers/Http/TransactionsController.ts) | Authorized tax replacement within the existing Budget transaction |

The active nonempty attribution writer is Transaction PATCH. Existing manual/provider/funding/opening flows do not introduce new tax inputs; their unrelated saves preserve clean tax history. Future attribution writers must explicitly join this boundary.

Loan Account/Category relationships determine exclusion; Transaction type 1 is not assumed to mean Loan. Historical nondeprecated accountless records remain readable. New unscoped/deprecated constructors retain their existing behavior.

## Compatibility and updates

Numeric historical, canonical-string and mixed storage decode entry by entry. Reading legacy numbers preserves their original numeric value rather than rounding on read. Null/undefined arrays and empty arrays retain their semantics; missing or invalid entry amounts are rejected instead of becoming zero.

Hydration leaves the model clean. Metadata, Category, provider, date and deletion saves do not rewrite untouched tax arrays. Explicit replacement validates before financial mutation and returns numeric rounded values after save. Failed-save staging is cleared before a later retry.

The existing validator accepts its supported numeric request syntax while rejecting malformed, boolean, nonfinite and invalid entry values. `taxCategories: []` clears attribution; omission preserves it, and the optional array validator treats null replacement as omitted. PATCH rebuilds validated `{type, amount}` entries, while unrelated saves preserve optional metadata already in storage.

Tax-only edits retain existing Transaction version/timestamp/log behavior without changing allocation storage or financial balances. The existing Budget gate, optimistic-version checks, ownership authorization and rollback behavior remain intact.

## Reporting and scope

`TaxesController.getActuals` retains its existing `jsonb_to_recordset` extraction with `amount real`, summation and Budget/date/month/type rules. PostgreSQL accepts canonical numeric strings and JSON numbers. Exact storage does not make the existing floating-point report arithmetic exact; no reporting formula or intermediate precision was changed.

Independent Tax forecast and TransactionLog storage boundaries are described in the [monetary storage inventory](remaining-monetary-storage-inventory.md). Loans, deprecated relational allocations and Plaid logs remain excluded. Normal [application rollback](application-release-rollback.md) does not restore or reverse tax values, and migration-specific rollback hash profiles are no longer used.
