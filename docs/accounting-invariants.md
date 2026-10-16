# SpendCraft accounting invariants

Reconciled against `f8af21435e5279c810a0ab525fdc4a2e1040bf9b` on October 16, 2026. This document records product semantics, not certification that current code implements them. The companion [correctness review](post-f8af214-correctness-review.md) identifies contradictions and evidence. Later abandoned implementation acceptance does not establish current implementation coverage.

## 1. Account balance authority

**Confirmed product invariant.** Supported transaction-tracked, nonloan Accounts are maintained by their financial lifecycles: initialization, eligible Transaction effects and explicit provider balance operations. An ordinary Transaction's signed Account contribution requires active/not deleted, nonpending, and Transaction date on or after Account.startDate. Replacement compares eligible old and new effects. AccountTransaction.amount supplies the stored signed amount; do not infer sign from the transaction name.

Account.balance is SpendCraft accounting balance. OFX may change it only by the net eligible Account effects of Transactions actually changed during that operation. OFX LEDGERBAL never directly determines Account.balance. A valid supplied LEDGERBAL instead updates Account.plaidBalance (database plaid_balance), the existing provider-reported balance field despite its misleading name. Missing LEDGERBAL leaves that observation unchanged. Initialization and the separately characterized Plaid lifecycle are not redefined by this OFX correction. See `Account.processOfx`, `Institution.updateAccountBalances` and `AccountsController.addTransaction`; the OFX correction is PostgreSQL-verified and accepted (681 focused / 1,305 full-suite tests; no failures or skips).

Balance-tracked Accounts use the approved Statement lifecycle below. Loan principal/interest semantics remain unresolved separately; ordinary nonloan formulas must not be silently generalized to Loans.

## 2. Ordinary account-linked Transactions

**Confirmed product invariant.** Account contribution eligibility is `!deleted && !pending && date >= startDate`. Category contribution eligibility is `!deleted && date >= startDate`. These describe two different effects. A replacement must account for old and new dates/status as well as changed amounts and allocations.

Scope: ordinary supported account-linked transactions, including manual and provider posting. Opening/type 4, accountless funding/rebalance and Loan special cases require their own lifecycle. Multi-Account transfers require explicit ownership and effect analysis; this document does not invent it. Current evidence: `Account.addTransaction`, `updateTransaction`, `deleteAccountTransaction`; manual controller contradictions are listed in the review.

## 3. Category effects

**Confirmed product invariant.** Eligible ordinary Transactions contribute their signed Category allocations. Pending status does not suppress that contribution. A Category effect and an Account effect need not occur together. Category membership indexes do not establish historical applied effects: `transaction_categories` is not historical economic authority. Current modern writers use Transaction JSON allocations; see `CategoriesController.transfer`, `Account.applyAllocations` inside `processOfx`, and `docs/legacy-category-authority-analysis.md`.

Nominal splits describe allocations; they alone do not prove which effects old writers applied. Empty-split Unassigned fallbacks exist in current code and require lifecycle-specific review before future removal or standardization.

## 4. Pending

**Confirmed product invariant.** Pending ordinary Transactions do not contribute to Account current balance. They can contribute to Categories if active and on/after startDate. Pending transitions must preserve this distinction. See the old/new delta handling in `Account.updateTransaction`. Statement membership selection is a separate reconciliation contract and must not redefine eligibility.

## 5. Deleted Transactions

**Confirmed product invariant.** Deleted ordinary Transactions have no current contribution under the forward rules. Deletion/restoration must remove/restore the appropriate effect once. Current representation and current eligibility do not prove whether historical deletion or posting already applied the right effect. HTTP deletion policy for historically ambiguous records remains unresolved; no new guard is approved by this document.

## 6. Account startDate

**Confirmed product invariant.** Changing startDate preserves Account current balance. Moving the boundary later removes Category effects of active ordinary Transactions becoming ineligible; moving it earlier adds effects becoming eligible. Pending rows participate; deleted rows do not. Opening is handled separately and accountless type 2/3 is unaffected. See `AccountsController.update` and its current pending filter defect.

## 7. Initial Funding / opening

**Confirmed product invariant.** For the supported transaction-tracked lifecycle, after a startDate change:

`opening = current Account balance - sum(applicable signed AccountTransaction amounts)`.

Applicable rows belong to the Account, have active nonpending Transactions dated on/after the new startDate, and exclude the opening itself. The Account balance remains unchanged. The corresponding opening date follows the new startDate. `Account.updateStartingBalance` implements this sign convention and type-4 representation; its broad shape assumptions are not an approved general reversal policy.

Opening uses account linkage and a Funding Pool allocation. It is not accountless type-2 funding. Creating/replacing opening representation does not itself add the opening amount to Account current balance.

## 8. Accountless funding and rebalance

**Confirmed product invariant.** Type-2 funding and type-3 rebalance use their own Category lifecycle, with no Account.startDate eligibility or synthetic Account context. Preview presented as the proposed funding operation must describe what submission posts. The current dialog violates this for transfer-inclusive chains.

**Confirmed intentional source behavior.** Funding `baseAmount` records requested pre-transfer base, distinct from final allocation and net Category effect. It is not reversal authority. See `FundingDialog.handleSubmit` and `CategoriesController.transfer`. Its permissible precision and future encoding are not decided here. Percentage/rate configuration is not currency money.

Fixed-rule winner/priority and cyclic transfer-inclusive calculation policy remain unresolved. Current order must not be renamed product intent merely because a comparator produces it.

## 9. Statements

**Confirmed product invariant.** For balance-tracked Accounts, the latest relevant Statement ending balance determines current Account balance; removing the final relevant Statement sets it to zero. For transaction-tracked Accounts, Statement mutations preserve Account current balance.

Reconciliation links/unlinks existing Transactions. It does not create adjustment Transactions or reverse/reapply Transaction Account/Category effects. Statement income/tax JSON is reporting attribution, not posting authority. See `AccountsController.addStatement`, `updateStatement`, `deleteStatement` and existing Statement functional tests.

The exact equal-ending-date winner needs explicit reconfirmation after reset. Current financial queries order only by end date. The abandoned `end_date DESC, id DESC` choice is a recommendation, not silently restored authority. CREATE versus reconcile-all pending/opening membership differences also need a separate product decision.

## 10. BalanceHistory

**Confirmed product invariant.** BalanceHistory is historical observation/evidence. It must NEVER update Account.balance. CREATE, balance/date UPDATE and DELETE leave current balance unchanged, including newest, backdated, equal-date and final-row cases. There is no latest-history synchronization and no final-delete-to-zero rule.

Provider operations may update Account balance under their own approved semantics and separately persist history. For OFX, that Account change is the Transaction net effect, never an absolute LEDGERBAL replacement. `Account.updateAccountBalanceHistory` is evidence-only; manual controller and client violations must be corrected independently. Existing manual balance-tracked rejection remains the current boundary; this document does not expand it. Date uniqueness and history ordering are history contracts, not current-balance authority.

## 11. Provider observations versus posted effects

**Confirmed product invariant, clarified by subsequent product direction.** OFX produces two independent results: Account.balance changes by new eligible signed Transaction effects minus old eligible signed effects; valid LEDGERBAL updates provider observation Account.plaidBalance only, including zero. A replay of unchanged active Transactions has zero accounting delta even if the ledger observation changes. Absent LEDGERBAL neither prevents posting nor invents a provider observation. Accounting and provider balances may differ meaningfully. The earlier description of an absolute OFX Account-balance observation was source characterization incorrectly promoted to product semantics and is superseded. The baseline `Account.processOfx` destination defect is corrected and PostgreSQL-verified; see the OFX verification record. Plaid initialized versus uninitialized Accounts retain their separate current paths in `Institution.updateAccountBalances`; no Plaid change is approved here.

**Approved OFX correction boundary.** OFX must not create, update, restore, delete or otherwise mutate BalanceHistory. Its output is Transaction/AccountTransaction/Category effects plus accounting Account.balance net deltas, and an optional provider observation in plaidBalance. Existing historical evidence must remain untouched; manual BalanceHistory behavior is outside this correction. Supplied empty/malformed LEDGERBAL must fail atomically; absent LEDGERBAL is valid. This focused correction is PostgreSQL-verified; it does not correct generic/manual BalanceHistory behavior.

`plaid_balance` → `provider_balance` is future naming cleanup only. No timestamp/schema change or BalanceHistory policy change follows automatically. See [OFX correction design](ofx-account-provider-balance-correction-design.md).

Provider precision, supported currencies, valuation precision and treatment of sub-cent inputs remain unresolved. This document does not approve quantization, strict ingress, retries or quarantine policy.

## 12. Account creation

**Confirmed intentional source behavior.** Initialization assigns a current balance and creates route-specific related state in current source. Balances-tracked offline creation uses an initial Statement, not transaction-tracked opening semantics.

**Unresolved product/accounting question.** New offline Institution creation invokes transaction-tracked Initial Funding/Pool maintenance; adding an equivalent Account to an existing Institution omits it. Preserve the distinction until intent is decided. It is not established as a defect or an intentional product promise solely by this implementation. Account type defaults must be established from the current API, not recovered from abandoned validators.

## 13. Deletion and reversal boundaries

**Confirmed product invariant.** Deleting one Account/Institution can leave Budget Categories alive; their financial state matters. Whole-Budget/user destruction can remove the entire financial graph and need not perform otherwise meaningless reversal of balances that also disappear. History row cleanup itself is not a financial reversal.

**Unresolved product/accounting question.** Broad account-linked deletion, transfers, opening and Loans need lifecycle-specific reversal authority. Current source permits account-linked Transaction DELETE; the abandoned block is not present and is not activated here. No policy to skip surviving Category effects, replay all surviving history, or infer old effects from current balances is approved.

## 14. Historical-data limitations and concurrency

**Confirmed product invariant.** Concurrent financial operations must not lose or corrupt one another's effects. For supported operations on the same surviving Account, their effects must compose exactly once in an allowed serial order. No committed Account delta may be lost because another writer saves Account.balance calculated from stale state. Intentional absolute or derived authority writes retain their own product meaning; serialization does not convert them to deltas. After waiting, calculations must use fresh authoritative state from the owning transaction. A particular locking implementation is not an accounting invariant. Current partial Budget locks do not prove universal serialization.

**Historical data risk.** Forward eligibility rules do not imply that old balances are correct. Identical current nominal records may have different applied-effect histories due to old date/pending writers. Canonical representation proves nominal money, not historical application. Neither timestamps nor current balances are accepted provenance.

No automatic replay, reconstruction, repair, normalization-on-touch or provenance inference is authorized. Any audit needs separate authorization and must distinguish suspicious cases from provable damage. No historical repair, runtime change or database access accompanied this reconciliation.
