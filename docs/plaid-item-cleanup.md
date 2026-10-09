# Plaid orphan Item recovery

Deploy the `plaid_item_cleanups` migration before enabling the updated onboarding
code. Provision dedicated secrets in the environment/secret manager:

- `PLAID_CLEANUP_KEY_VERSION`: immutable active version name, e.g. `v1`.
- `PLAID_CLEANUP_KEYS`: JSON object mapping version names to independently generated
  secrets (at least 32 characters; use 32 random bytes encoded as base64).

Never use APP_KEY as the cleanup key. Keep previous versions available until their
outstanding records are resolved. Encryption is authenticated AES-256-GCM with
record ID, provider context and Item ID bound as an unambiguous JSON tuple purpose.
Ciphertext is marked `binding-v2:`; earlier experimental delimiter-bound ciphertext
is rejected into administrative review, without an automatic legacy fallback.
Do not deploy over existing experimental recovery records without a separately
reviewed credential-format migration. No historical credentials are migrated here.
Changing a version's secret breaks old ciphertext. Database backups and key backups have separate
retention; clearing the live field does not erase older backups.

Run `node ace plaid:cleanup-listener` alongside the existing webhook listener.
It sweeps PostgreSQL on startup and every minute. Redis jobs contain cleanup UUIDs
only. Monitor its infrastructure errors and `Plaid cleanup requires administrative
review` events. A stopped listener cannot perform cleanup or enforce retention.
Expiration runs directly in PostgreSQL before Redis enqueueing and takes the same
attempt lock as removal. Cleanup enqueueing is bounded to five seconds; unavailable
Redis cannot leave the listener permanently stuck before its next retention sweep.

## Administrative recovery

- `node ace plaid:cleanup list`: safe metadata for up to 100 outstanding records.
- `node ace plaid:cleanup retry UUID`: explicitly start another bounded retry
  budget, with the committed-Institution safety check still enforced.
- `node ace plaid:cleanup extend UUID --days 30`: explicitly extend retention.

Commands never display credentials. Missing keys, changed Plaid context, unknown
provider failures and already-absent errors require review. INVALID_ACCESS_TOKEN
is never counted as successful cleanup. ITEM_NOT_FOUND is conservatively escalated
rather than assuming the credential/environment identifies the intended Item.
Resolution proceeds through a provider attempt after configuration review; there
is no command that silently asserts external removal.

## Lifecycle and locking

Protection is independently committed immediately after exchange. Setup locks the
recovery row before the budget row. Setup commit atomically cancels protection and
clears ciphertext. Only setup failures trigger immediate compensation, after
rollback. Failed initial sync and post-commit response failures do not.

Cleanup acquires a transaction advisory lock for the UUID, then locks the recovery
row and checks globally for a committed Institution with that Item ID. The advisory
lock remains held across the separately committed attempt ledger and provider call,
preventing duplicate workers while accounting survives a crash. Setup cannot attach
an Item after cleanup changes its protected state. Removal calls have a 15-second
transport timeout. An ambiguous timeout remains recoverable.

Protected records are due after five minutes. Active setup holds their row lock.
One immediate attempt is followed by at most six asynchronous attempts with delays
of 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours, each with ±20%
jitter. Unrecognized structured errors escalate; transport ambiguity and known
transient errors retry. Exhaustion retains encrypted recovery credentials for
30 days. The sweep destroys expired credentials; extension requires explicit admin
action before destruction. Metadata is retained without credentials for diagnosis.

## Residual limits and rollback

A crash/lost exchange response before protection is durable cannot be repaired by
this local protocol. Existing independent exchange-audit latency is part of that
window. Readiness is checked first; failed protection attempts one bounded removal
with the in-memory token. Historical orphans require separate Plaid-assisted recovery.

Do not roll back by dropping the table or removing keys while recovery is pending.
Keep a compatible listener and administrator commands until outstanding work is
resolved. Reverting onboarding to its former catch behavior reintroduces the risk
of compensating a committed Item. No historical credentials are migrated.
