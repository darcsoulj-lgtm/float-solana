# Ondo volume recovery — 2026-09-27

## Problem and boundaries
Ondo's $82.64 snapshot represented seven tracked pools across five tokens, not all Ondo trading. Several observations were approximately 17 hours old. The production cache contained a DexScreener provider cooldown; existing code records that cooldown after HTTP 429. The scheduler repeatedly requested per-token details for every discovered token.

## Changes
- Refresh known pool addresses in batches of 30; preserve known pools omitted by discovery. If a known address is missing from the response, fail the batch and retain its original timestamp rather than publish a smaller fresh total.
- Rotate two full token lookups per 30-token chunk each four-minute cycle. A 30-token chunk gets a complete discovery sweep in roughly one hour. Discovery is not exhaustive venue coverage.
- Pace scheduled DexScreener requests at one second and retain provider Retry-After behavior.
- Respect per-symbol timestamps so an unrelated stale batch does not hide fresh observations.
- Label aggregate volume as tracked pool volume.
- Separately show dated Solana Ondo mint/redeem volume reported by DefiLlama. Never add daily issuer flows to rolling 24-hour pool volume. No paid API added.

## Source and validation
Public endpoint: https://api.llama.fi/summary/dexs/ondo-global-markets?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false
Method: https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/ondo-global-markets/index.ts

The adapter counts successful Solana mint/redeem instructions and excludes the latest ten hours. This is a provider-reported daily measure, not independently reindexed transaction evidence or complete secondary-market/prop-AMM volume. Parser requires explicit Solana data, completed UTC day, nonnegative finite value, unique date, and maximum 72-hour period age. Global cross-chain total24h is never used.

Live predeployment check: five Ondo tokens, seven known pools all retained, five HTTP requests, September 25 UTC issuer flow $228,956. Full automated suite: 375 tests passed. Desktop rendering and mobile public-list behavior checked separately; the existing mobile public page hides the overall market summary.

## Limits
A delisted/missing known pool intentionally prevents its batch from appearing freshly complete; future retirement needs evidence, not silent omission. Provider rate limits can still delay refresh. Pool coverage is partial. Primary issuance/redemption must not be relabelled as secondary DEX volume.
