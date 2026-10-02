# Automatic pool reconciliation and publication verification

Owner: Noah. Scope: free-service collection, pool continuity, automatic recovery, and independent publication checks. This builds on `volume-collector-repair-2026-10-02.md`; it does not claim complete DEX coverage.

## Failure boundaries

- Provider omissions previously erased valid known-pool amounts during a partially successful update. Each provider now records exact-mint, timestamped pool evidence before canonical resolution. An omitted pool may retain its latest valid observation for at most 24 hours, marked delayed internally; its original observation time remains visible. Confirmed zeros, conflicts, wrong identities, future timestamps and expired observations do not use this fallback.
- Collection write times and public observation times are separate. New canonical writes still reach D1 when an older backup amount remains in the result. The public token observation time is the oldest included actual observation, never the new write time.
- A failed state read could restart the inventory/cooldown history. State now resolves an immutable GitHub head, validates before restoring, and stops safely on failure. The next scheduled run retries; existing published data remains unchanged.
- An independent per-provider pool-address ledger detects canonical omissions, missing amounts, duplicates, disputes and old observations. Repairs lead known-pool refreshes and can use half the bounded discovery budget. The remaining budget keeps new listings and older unchecked tokens moving. Repair attempts have a ten-minute cooldown.
- A separate free GitHub workflow checks an immutable generation against two ordinary public API reads. It verifies pool addresses, values and actual observation times rather than comparing totals or choosing the biggest source. Newer observations are accepted. HTTP, JSON, response size, private-field exclusion, no-store including cache HIT, and Backpack reference/catalog freshness are checked. Confirmed publication failures fail the workflow after bounded retries; they are no longer hidden by a successful collector log.

## Validation

- Full local release gate: strict types, repository lint, 559 tests, production build.
- Isolated real WorkerEntrypoint/D1 run with recorded provider responses: automatic discovery/recovery, provider outage preservation, missing backup retention with original timestamp, immutable snapshot ingestion, and 30 simultaneous public readers without provider requests. This is simulated reliability evidence, not a production load capacity claim.
- Provider jobs remain bounded and paced. No paid runner, API subscription, new credential service, public ingestion endpoint, or wallet operation is introduced. New trading remains disabled.
- Live deployment and scheduled collection/publication evidence will be appended after verification.

## Limits

The ledger knows only pools actually observed from integrated providers. A pool omitted by every provider is not discoverable from this ledger. Free-provider throttling, indexer omissions, GitHub scheduling and import/propagation delays remain possible. New-pool discovery is rotating, not instantaneous. Retained volume covers the prior 24 hours at its original observation time; it is not silently represented as a fresh rolling total. Disagreements are withheld, not filled with the largest provider value. A total can differ from another platform using a different window, pool universe, or wash-trading filter.

## Live evidence

- Deployed Worker `26c9dfe4-4cc8-4d1f-ad5e-d85799ddd469`, preserving `TRADING_ENABLED=false` and the existing free runner/import architecture.
- Collection runs `36987773393` and `36988223093` succeeded: 69 tokens, 28 immutable chunks, 341/340 seconds. The second run automatically placed DRAM in the recovery queue; no symbol-specific override was added.
- Independent publication run `36988365518`, job `110778507358`, checked immutable generation `5b24674258df2f9f50c40ea1f3701cf6252fc6b6`. It saw 933 pending observation differences during import, then 44, then zero at its third attempt after about two minutes. Both final ordinary reads were cache HITs with downstream `no-store`. This is evidence of actual collection-to-public-API delivery, not just a clean build or collector log.
- First collection health: 31 fresh markets and 38 with delayed/unresolved pool coverage; second: 30 and 39. Neither had a wholly unavailable token, but individual withheld/missing/disputed pools remained (61/62). Those gaps remain queued for automatic recovery. Coverage is not complete and no claim of universal accuracy is made.
- Desktop market list/detail matched the same stored DRAM volume and disclosed its delayed source timestamp. ZeroFi remained present. A 390×844 mobile check showed the updated price, supply, minted value, volume and delayed-source note without overflow; the browser reported no console errors. Source notes remain outside market-list amounts.
- Short live runtime sample: 186 events, no non-ok outcomes; 14 cron executions up to 3ms CPU, 26 private RPC calls up to 9ms CPU. Public API samples included CPU bursts up to 47ms; other requests up to 104ms. Passing outcomes do not prove free-tier CPU headroom under a larger workload. This change specifically improves collection/pool continuity, not an unlimited user-capacity claim.
- Release checks passed locally (559 tests) and on GitHub at `8ba2840f7665f5d0f3388a82f5d6fa3ae02e3181` and `64228eb0c0acfcd2dfb9748ef1763e13f5838d9e`.
- Compact local evidence: `outputs/volume-reconciliation-publication.json`, `outputs/volume-reconciliation-live.json`, `outputs/volume-reconciliation-runtime-live.json`, and the isolated `outputs/market-scheduler-runtime.json`. Raw production tail data was removed after generating the compact report.
