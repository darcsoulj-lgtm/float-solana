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
