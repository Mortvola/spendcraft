# OFX accounting / provider balance correction design

Status: APPROVED and implemented against accepted concurrency baseline `3b01c34067e61e778916ebda5a80527540ccef00`; **PostgreSQL-verified and accepted** (681 focused / 1,305 full-suite tests; 0 failed, 0 skipped/pending). Implementation used no database; subsequent verification was separately authorized only against safeguarded localhost:5432/spendcraft_test and is complete. That authorization is expired. See [implementation record](ofx-account-provider-balance-correction-implementation.md).

## Baseline findings and superseded blocker

At f8af214/7fdc636, Account.processOfx directly assigned supplied LEDGERBAL to Account.balance, never assigned plaidBalance, dereferenced missing LEDGERBAL before the fallback, accumulated raw Account amounts without independent date/pending eligibility, and called updateAccountBalanceHistory. These were source defects under the approved product rules, not compatibility semantics to retain. OFX reimport tests expected ledger-derived accounting balances. Original source characterization is recorded in [the correctness review](post-f8af214-correctness-review.md) and Git history; this document's former proposals to retain history and defer malformed-ledger policy are superseded.

The first implementation attempt stopped before runtime edits because manual CREATE/DELETE and the OFX command could save stale balances outside HTTP OFX's Budget gate. The separately approved bounded concurrency correction is now committed and PostgreSQL-accepted (214 focused / 1,256 full-suite tests; no failures or skips). That acceptance does not verify the subsequent OFX semantic changes.

## Scope and entry points

Both `AccountsController.uploadOfx` and `ofx:upload` call Account.processOfx. HTTP prechecks tenant ownership/tracking, then acquires Budget FOR UPDATE and reloads scoped Account. The command resolves scoped selection identity, acquires the same gate, and reloads Account by ID/Institution/Budget. Keep these entry points, authentication, success/error envelopes, transaction boundaries and fresh-state protocol.

Current parser supports CREDITCARDMSGSRSV*/CCSTMTTRNRS/CCSTMTRS. It converts SGML using existing regexes and fast-xml-parser defaults. Destination is the selected Account; file Account ID is part of Transaction identity, not a new destination lookup. Balances tracking remains rejected. No new Account-type restriction, Loan policy, bank/investment support, parser identity format or provider pending mapping is introduced. Shared route reachability is preserved; this is not a Loan-correctness certification.

## Two independent balances

- Account.balance is SpendCraft accounting balance. It changes only by this upload's eligible Transaction net effects.
- Account.plaidBalance (`accounts.plaid_balance`) is provider-reported balance despite its name. Supplied valid LEDGERBAL updates this field only.
- Missing LEDGERBAL permits posting and leaves plaidBalance unchanged. No synthetic observation.
- Supplied empty/malformed/nonfinite LEDGERBAL rejects the whole operation through existing error handling. Do not write NaN or coerce invalid data to absence/zero. Retain current number representation, including accepted sub-cent finite values; persistence precision policy is not changed here.
- OFX never mutates BalanceHistory. Preserve historical rows and generic/manual history behavior.

The parser's finite numeric BALAMT is retained, or a nonblank numeric string is converted with Number. Presence of LEDGERBAL is checked separately from value, so zero is supplied and missing BALAMT is invalid. All supported statement ledgers are checked before financial mutation. When multiple supported blocks provide valid ledgers, the last supplied one wins, preserving traversal semantics. DTASOF/CURDEF remain unused. Header-only input retains its no-op behavior. Missing STMTTRN means an empty list, enabling valid ledger-only uploads; malformed Transaction data is not synthesized into a valid row.

## Signed effects and lifecycle

Stored AccountTransaction.amount equals OFX TRNAMT. The existing temporary parsed amount is its negation; server calculation does not apply the client's Credit sign.

`E(state) = signed stored amount` when `!deleted && !pending && date >= Account.startDate`; otherwise zero.

`C(state, category) = sum of that category's allocations` when `!deleted && date >= Account.startDate`; otherwise zero. Pending does not suppress Category effects.

For each incoming row capture old persisted state before mutation, derive new actual state, then apply `E(new)-E(old)` and independently `C(new)-C(old)`. Add the operation Account delta to fresh Account.balance. Use current arithmetic, not an exact-money domain.

| Transition | Account effect | Category effect |
|---|---|---|
| New | Old zero; eligible new amount once | Eligible new Unassigned allocation once |
| Active identical replay | Zero | Zero |
| Amount/date modification | Eligible new minus eligible old | Eligible new allocations minus eligible old |
| Deleted restoration | Old zero; eligible new amount once | Old zero; eligible new allocations once |
| Missing from later file | None | None; no removal by omission |
| Ledger-only | Zero | Zero |

New links retain DB pending=false default. Matched links retain pending status; no pending→posted conversion is inferred. Thus pending matched modification can change Categories without Account effect. Before/equal/after startDate are evaluated independently for old/new states. No standalone OFX removal mechanism was found or added.

Example: B=1000, provider=1400, eligible new TRNAMT=-50 and ledger=1500 yield B=950/provider=1500. An identical replay with ledger=1600 yields B=950/provider=1600. This disagreement is expected.

## Identity and allocations

Preserve parsed `FID:ACCTID:FITID`, Account-scoped matching, original link/Transaction IDs and restoration. Default numeric parsing can collapse leading-zero identity components; changing this silently would duplicate historical identities. No unique provider identity schema exists. Preflight every distinct incoming identity for multiple existing links before financial mutation; ambiguous matches fail closed through the existing error convention. Repeated keys within one file continue sequential matching, so an identical repetition is replay and a changed repetition is successive modification. No new duplicate-file policy is introduced.

Preserve every explicit non-Unassigned allocation, metadata, order and duplicate Category IDs. Compute the existing rounded-cent Unassigned remainder against new amount. Preserve Transaction comment/taxes/Statement linkage and all other fields not currently merged. Existing name/date/amount/provider/deleted merge and new-row logging/version behavior remain. transaction_categories is not reversal authority.

## Opening and atomicity

Order inside the accepted Budget transaction:

1. Fresh scoped Account after Budget acquisition.
2. Parse/preflight ledger and ambiguous identities.
3. Process Transaction/link/Category changes and accumulate eligible Account delta.
4. Save Account accounting balance plus delta and optional independent plaidBalance.
5. Existing updateStartingBalance consumes **Account.balance**, then Pool saves.
6. Commit; any failure rolls back all owned rows, both balances, opening/Pool and logs.

Opening helper never reads BalanceHistory. Existing formula remains `opening = B - applicable signed sum`, opening date=startDate and Pool delta=new opening−old opening. For consistent prior state, B+d and sum+d preserve opening. Ledger-only changes cannot change it. Existing missing-opening creation and ordinary helper reconciliation are retained exactly, rather than introducing guards, repair workflows or a new normalization project. No historical baseline is reconstructed. No helper may commit separately or escape the owning transaction.

## Concurrency boundary

Preserve bounded Budget serialization shared by manual CREATE/PATCH/DELETE, HTTP/command OFX and existing Plaid/startDate participants. Waiting writers reload before financial work. No lower Account/Category prelocks or lock coordinator. Command prompts precede gate; parsing inside the existing protected method adds no network work. Existing Plaid semantics and lock duration remain unchanged.

Independent known manual BalanceHistory Account writes, Category-only outsiders and parent deletion limits remain outside this bounded guarantee. OFX correction does not certify universal financial concurrency or silently fix those writers.

## Client and response

Retain empty HTTP success shape and existing failure handling. AccountsToolbar delegates upload to State/Account.uploadOfx. On confirmed success reload Accounts (which preserves shared objects and both balances), Category balances and affected Account/pending/loaded Category Transactions. No history refresh or optimistic calculation from file/ledger. Failure before confirmed success leaves caches unchanged. Refresh errors propagate with their existing refresh-specific messages; a committed upload is not rolled back by refresh failure. Account display already supports differing balances and needs no rename.

## Historical and representation boundaries

Existing ledger-overwritten accounting balances, opening/Pool offsets, provider observations and OFX-created history remain untouched. Forward deltas preserve an existing baseline offset; replay is not repair. Current canonical allocations/current eligibility cannot establish every historical applied Category effect.

Keep parser Number conversion, model parseFloat hydration, numeric relational columns, JSON monetary numbers, floating delta/sum/balance arithmetic and existing rounded-cent split logic. No MinorUnits, exact validator, API strings, schema change or plaidBalance rename. DTASOF persistence, currency validation, lexical identity preservation and `plaidBalance → providerBalance` are deferred projects.

## Verification boundary and future PostgreSQL matrix

Non-DB tests execute the production method with real parser/inert persistence and actual bundled client State; architecture tests retain the concurrency contracts. PostgreSQL tests were prepared without execution during implementation and subsequently passed under separate verification authorization. See [verified evidence](ofx-account-provider-balance-correction-postgresql-verification.md). Existing safeguards must independently verify configured/live pg and pgLog and execution target before every destructive setup/cleanup after fresh authorization only for localhost:5432/spendcraft_test.

| Area | Executable coverage prepared / regression suite |
|---|---|
| Ledger and independence | ofxBalanceAuthority: positive/negative/zero/absent/empty/malformed; ledger-only, posting-only, both, replay+new ledger |
| Posting | before/equal/after startDate, signs, old/new date crossings and amounts, matched pending retained |
| Identity/restoration | ambiguous later row rejects whole file, duplicate/replay IDs, deleted restoration once, no removal by omission |
| Allocations | ofxReimport: single/multiple explicit allocations/comments, sign-changing remainder, replay and restoration |
| Evidence/opening | Seed history unchanged byte-for-row; opening/Pool remain accounting-derived under divergent provider ledger |
| Atomicity/binding | Late Pool/post-opening failures; snapshot Account/provider/Category/link/Transaction/log/history; accepted one-transaction instrumentation |
| Command | Real command import and HTTP replay; command/HTTP contention; scoped same-name ownership |
| Concurrency | Existing deterministic Budget barriers: OFX/manual CREATE/DELETE/PATCH, OFX/OFX, rollback, different Budget; expected balances now use eligible net effects |
| Security | Foreign/missing Account and accepted tenant/Institution/command regression coverage |
| Isolation | Accepted concurrency/Plaid, manual lifecycle, startDate, Statements, funding/rebalance, offline and Loan suites rerun only with DB authorization |

Product decisions required before OFX balance-authority correction

None. Approved product directions settle this focused correction; deferred format/currency/naming/history projects do not expand it.
