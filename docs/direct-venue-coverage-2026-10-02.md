# Direct venue coverage, 2026-10-02

Owner: Noah. Use validated current venue pool volume before indexer observations, while retaining indexers for discovery, cross-checking and unsupported venues. This improves source independence; it does not establish complete or universally accurate DEX volume.

The live inventory audit found 1,007 unique pool addresses across Raydium, Meteora, Orca, Manifest, ZeroFi, Byreal, PancakeSwap Solana and HumidiFi. A venue capability map does not restrict pool eligibility: future venues discovered by indexers remain eligible under exact Solana mint and pool identity checks.

## Implementation

- Retain direct Orca and Raydium adapters; distinguish Meteora DLMM, DAMM v1 and DAMM v2 APIs.
- Refresh known Byreal and PancakeSwap Solana pools using public GET APIs. Byreal's list endpoint did not honor pagination in the live audit, and PancakeSwap's mint search did not pass verification. Neither is treated as exhaustive discovery.
- Read all provider evidence through a shared provider list. Record deduplicated per-venue direct/indexer/delayed/unresolved coverage in the existing collector verification artifact and workflow summary.
- Prefer current direct volume per pool. Keep existing material disagreement withholding. Stale direct evidence cannot override or invalidate a current fallback observation. Keep a separate current indexer price when a venue volume endpoint lacks USD prices.
- Preserve bounded requests, provider backoff, original retained observation times, automatic discovery rotation, and exact pool deduplication. No subscription, additional automation, client secrets or wallet actions.

## Boundaries

Manifest, ZeroFi and HumidiFi remain indexer-sourced. Manifest publishes base/target token-unit volume, which is not a general USD-volume field; a direct USD adapter was not validated. No verified public USD pool-volume API was found for the other two in this audit. Unsupported venues, provider failures and incomplete discovery remain possible. Do not advertise all Solana DEX trades as covered.

## Validation

- Captured live Byreal, PancakeSwap and Meteora API schemas; reject nested HTTP-200 errors, wrong mint identities and non-USD volume fields.
- Nine new tests cover direct-source precedence, conflict withholding, stale fallback, duplicates, new listings, unknown venue eligibility and provider outages.
- Full local release gate: 574 tests passed, strict types, lint and production build passed.
- Isolated real Worker/private RPC/D1 verification passed, including concurrent readers, retained original timestamps, automatic discovery recovery and immutable snapshot ingestion.
- Production collection and rendered methodology verification are separate release checks; this document alone does not prove them.


## Volume source qualification repair

Captured DRAM, AMC and MU evidence showed materially different Raydium day.volume and indexed rolling-24h values for the same known pools. The resolver withheld these pools but positive-subset sums were displayed as normal totals. Sunrise's public client uses Birdeye token-level trade data; its documented public API has no historical-volume endpoint. Its figures are a comparison, not validated ground truth.

Pool discovery remains broad and exact-mint checked. A shared pool-volume policy quarantines Raydium statistics from selection, conflict/zero confirmation, display, and saved-value recovery until window/filter/valuation equivalence is established. Its identity and liquidity remain useful. Qualified sources retain the existing material-disagreement guard; providers are never summed per pool.

All known unresolved volumes now block the aggregate, including positive subsets. Absent token observations also block market totals. Valid dated observations may still be retained within the existing 24-hour display policy; neither retained data nor indexer agreement proves complete chain coverage. Recovery and the existing collection health/repair queue use the same qualification rule.

Regression evidence includes captured DRAM/AMC/MU observations, old Raydium evidence, outage retention, false zeros, comparable-source conflicts, aggregate incompleteness, deduplication and recovery. Production acceptance requires a new collector generation and ordinary public reads, not only a passing build.
