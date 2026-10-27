# Transaction Category decimal-string storage

**Completed:** storage implementation, deployment and approved historical conversion. This document describes current runtime behavior; the completed conversion tools and verification receipts have been removed.

## Storage and precision

`transactions.categories[].amount` stores canonical two-decimal strings while models and public APIs expose numbers. The [Category codec](../app/services/categoryAmountCodec.ts) validates finite inputs, safe integer cents and encoding round-trip safety:

```typescript
const cents = Math.round(amount * 100)
const storedAmount = (cents / 100).toFixed(2)
```

Fractional input is accepted and rounded with JavaScript semantics: `0.125` becomes `"0.13"`, `-0.125` becomes `"-0.12"`; negative zero becomes `"0.00"`. Historical numbers and canonical strings decode to numeric runtime values without quantizing reads. Mixed arrays, ordering, duplicate Category IDs and unrelated JSON are preserved by the codec.

## Scoped lifecycle

[transactionCategoryStorage](../app/services/transactionCategoryStorage.ts) resolves supported Transaction types 0, 2, 3, 4 and 5 using actual ownership and Account/Category relationships. Loan-linked records remain excluded. New writes opt into the existing owning-transaction boundary; persisted rows are batch-bound by model find/fetch hooks.

[categoryStorageBinding](../app/services/categoryStorageBinding.ts) handles numeric hydration, dirty tracking, persistence encoding and numeric post-save state. Explicit allocation writes store strings. Reads and metadata/date/deletion-only saves do not normalize untouched history or impose new conservation checks on old deleted discrepancies.

Manual, provider, OFX, opening-balance and funding/rebalance writers continue using their existing application paths. Unsupported allocation ownership is rejected before persistence. Existing Budget locking and transaction binding remain in force.

## Accounting and readers

Final conservation remains at the owning write boundary. Ordinary/opening supported Transactions compare allocation cents with the owning AccountTransaction's exact decimal amount. Funding and rebalance retain their existing zero-sum and Funding Pool rules. The migration did not alter eligibility, balances, formulas, residual handling or historical deletion/reversal authority.

Model serialization and register/GET/search APIs expose numeric allocations. SQL recordset readers cast either storage representation using their existing decimal extraction. Category admission's numeric extraction preserves selection and pagination without expanding outer rows or introducing a relational fallback.

Funding metadata (`baseAmount` and nested funding rules) has its own scoped encoding layered on this binding. Ownership and Loan exclusion are resolved before that metadata is encoded. See the [storage inventory](remaining-monetary-storage-inventory.md#funding-configuration-and-reconstruction).

Loans and deprecated `transaction_categories` remain outside the migration. Compatibility readers and active codec/lifecycle/accounting regression tests remain required even though historical conversion is complete. Normal [application rollback](application-release-rollback.md) does not reverse JSON representations.
