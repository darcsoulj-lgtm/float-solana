# Eligible stock trading pools — 13 September 2026

## Update — 20 September 2026: Stonkfun stock-quoted pools

Float now includes a Stonkfun launch pool when Stonkfun's public top-volume feed identifies the exact pool address, launch mint and quote mint, and the quote mint matches Float's verified stock registry. DEX Screener supplies the pool's observed rolling 24-hour volume and liquidity. Its pool-address endpoint supplements token discovery, and the same address is counted only once in token, issuer, market and history totals. Stonkfun's own volume number is **not** added to the DEX Screener number, because these can describe the same trades and currently differ by methodology.

The SPYx-quoted STONK pool `7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49` is an example. This is activity trading STONK *against* SPYx, not direct SPYx equity purchases. A second STONK/SPYx pool, an unlisted lookalike, or another memecoin/stock pair does not qualify merely by sharing a ticker or mint. The official discovery feed's first 100 top-volume launches is partial, and DEX Screener can omit or delay pools; neither source establishes full market volume or screens wash trading. If the Stonkfun feed fails, the reviewed settlement/stock pool subset remains available but excludes Stonkfun-only pools for that observation.

The pool-policy cache namespace is now `stonkfun-v1`. Historical chart points are shown only when their policy version matches, so the prior narrower values are not compared as if they used the new definition. The new definition applies consistently to all issuers and the public Backpack view.

The sections below record the original September 13 rule and validation; the update above supersedes their blanket exclusion of memecoin pairs and their `eligible-v1` cache version.

## Decision and architecture

Float measures an explicitly scoped subset of Solana DEX trading. A pool must contain a verified tokenized-stock mint and pair it with canonical wrapped SOL, a reviewed stablecoin mint, or another verified stock mint. The rule applies in both base/quote orientations. Memecoins and unverified counterparties are excluded, including the reported LIZM/METAx pair `3MTB5DMjsQDMcqisagTVUED51GnSfvGe3iMjLwe96rZ1`.

`lib/stock-pools.ts` owns the policy and deduplicated metric sums. `parsePools` applies it at the provider boundary before retaining prices, changes, volume, liquidity, timestamps or links. The batch endpoint, per-token endpoint and public Backpack endpoint share that parser. Server callers pass the entire verified registry, so cross-issuer pairs and new verified Backpack listings are accepted even when the counterparty is outside the requested page. User-supplied symbols do not establish eligibility; counterparty labels also come from verified addresses.

The existing server authentication, public/private response boundaries, caching and quotas are unchanged. Lookup maps are constructed once per parsed response.

The market table and stock details now use eligible DEX Screener pool volume, matching issuer dashboards. CMC price/change observations remain available; CMC aggregate volume is retained only as provider data, not shown as this filtered metric. Pool-derived fallback prices can only use eligible stock-base pools; a quote-side stock never inherits the other token's USD price.

## Reviewed settlement mints

| Asset | Solana mainnet mint | Primary source |
| --- | --- | --- |
| SOL (wrapped) | So11111111111111111111111111111111111111112 | [Solana Token Program](https://www.solana-program.com/docs/token) |
| USDC | EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v | [Circle contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| USDT | Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB | [Tether supported protocols](https://tether.to/en/supported-protocols/) |
| USDG | 2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH | [Paxos mainnet contracts](https://docs.paxos.com/guides/stablecoin/usdg/mainnet) |
| PYUSD | 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo | [Paxos mainnet contracts](https://docs.paxos.com/guides/stablecoin/pyusd/mainnet) |

This is a reviewed allowlist, not a claim to support every stablecoin. Additions require issuer-source mint verification and regression tests. Never accept symbols or names as proof. Stock counterparties use the existing verified stock registry, not a duplicated list. [DEX Screener's API](https://docs.dexscreener.com/api/reference) supplies the two mint addresses and pool measurements.

## Metric limits and cache migration

- Pool volume counts trades in eligible returned pools. It excludes RFQ, direct issuer mint/redeem and centralized-exchange activity. It is not total issuer trading volume, net investment, or organic demand.
- Liquidity includes both assets in each eligible pool. Duplicate pool addresses count once per stock and once per issuer total; stock/stock pools can legitimately appear in both stocks' rows. Do not sum issuer subtotals to derive an all-issuer unique pool total without deduplicating again.
- Multi-hop swaps can involve multiple pool trades; the data does not deduplicate economic orders or detect wash trading. Pool discovery is partial. The market overview fetches the per-token pair list for at most two active tokens per 30-mint batch, selected by eligible discovery-pool volume. It merges those pools by address with the discovery response. Detail failure retains the discovery snapshot. Other tokens may have additional eligible pools that are not counted.
- Empty eligible coverage and provider failure remain unknown, not zero. A reported zero is retained. Existing freshness checks and source timestamps remain intact.
- `POOL_POLICY_VERSION=eligible-v1` changes all three pool cache namespaces. Broad legacy snapshots cannot appear as last-good values after the release, even on provider failure. Unrelated price/supply caches remain warm. Newly verified registry additions enter existing pool snapshots at their next normal refresh (two to four minutes), without requiring a code edit.

## Validation

- Full release gate passed: strict TypeScript, repository lint, 257 tests and production build. Six new behavioral tests cover the exact reported LIZM pair, reversed pairs, symbol spoofing, all issuers, every reviewed settlement mint, stock-stock deduplication, dynamic counterparties across all fetch paths, stale/zero handling and a legacy-cache/provider-429 failure.
- Captured MU regression fixture: nine eligible pools retained from thirty returned pools; duplicate provider records removed.
- Local runtime with real upstream responses: Backpack displayed 246 eligible pools, $35.85M rolling pool volume and $14.27M liquidity at the observed snapshot. FLWS displayed 18 eligible pools; Tulip was absent. These are timestamped observations, not frozen expected market values or a simultaneous before/after comparison.
- Browser QA: desktop 1440×900 and mobile 390×844, no horizontal overflow; FLWS starts with three pools, keyboard Enter expands to eighteen and collapses, and mobile stock details open normally. Browser error log empty on the checked local flow. Shared issuer isolation is regression-tested; live member xStocks verification follows deployment.
- CMC aggregate volumes are no longer used as the filtered market-table volume. No new provider credentials, paid subscriptions or dependencies.
