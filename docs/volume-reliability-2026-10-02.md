# Automatic pool reconciliation and publication verification

Owner: Noah. Scope: free-service collection, pool continuity, automatic recovery, and independent publication checks. This builds on `volume-collector-repair-2026-10-02.md`; it does not claim complete DEX coverage.

## Failure boundaries

- Provider omissions previously erased valid known-pool amounts during a partially successful update. Each provider now records exact-mint, timestamped pool evidence before canonical resolution. An omitted pool may retain its latest valid observation for at most 24 hours, marked delayed internally; its original observation time remains visible. Confirmed zeros, conflicts, wrong identities, future timestamps and expired observations do not use this fallback.
- Collection write times and public observation times are separate. New canonical writes still reach D1 when an older backup amount remains in the result. The public token observation time is the oldest included actual observation, never the new write time.
- A failed state read could restart the inventory/cooldown history. State now resolves an immutable GitHub head, validates before restoring, and stops safely on failure. The next scheduled run retries; existing published data remains unchanged.
- An independent per-provider pool-address ledger detects canonical omissions, missing amounts, duplicates, disputes and old observations. Repairs lead known-pool refreshes and can use half the bounded discovery budget. The remaining budget keeps new listings and older unchecked tokens moving. Repair attempts have a ten-minute cooldown.
- A separate free GitHub workflow checks an immutable generation against two ordinary public API reads. It verifies pool addresses, values and actual observation times rather than comparing totals or choosing the biggest source. Newer observations are accepted. HTTP, JSON, response size, private-field exclusion, no-store including cache HIT, and reference/summary freshness are checked. Confirmed publication failures fail the workflow after bounded retries; they are no longer hidden by a successful collector log.

## Validation

- Full local release gate: strict types, repository lint, 559 tests, production build.
- Isolated real WorkerEntrypoint/D1 run with recorded provider responses: automatic discovery/recovery, provider outage preservation, missing backup retention with original timestamp, immutable snapshot ingestion, and 30 simultaneous public readers without provider requests. This is simulated reliability evidence, not a production load capacity claim.
- Provider jobs remain bounded and paced. No paid runner, API subscription, new credential service, public ingestion endpoint, or wallet operation is introduced. New trading remains disabled.
- Live deployment and scheduled collection/publication evidence will be appended after verification.

## Limits

The ledger knows only pools actually observed from integrated providers. A pool omitted by every provider is not discoverable from this ledger. Free-provider throttling, indexer omissions, GitHub scheduling and import/propagation delays remain possible. New-pool discovery is rotating, not instantaneous. Retained volume covers the prior 24 hours at its original observation time; it is not silently represented as a fresh rolling total. Disagreements are withheld, not filled with the largest provider value. A total can differ from another platform using a different window, pool universe, or wash-trading filter.
