# Ondo valuation recovery — 2026-09-27

The former DefiLlama protocol endpoint stopped publishing its Solana valuation series. Expired snapshots were excluded correctly, but this removed all Ondo values from the partial aggregate.

The replacement reads the public asset catalog used by Ondo's own website (`https://app.ondo.finance/api/v2/assets`) and finalized Solana mint accounts from the existing RPC. It is a public website endpoint, not a guaranteed stable contracted API. Provider failures remain unavailable and do not silently substitute another price source.

## Calculation and controls

- Match only reviewed Ondo registry symbols/mints. Exclude unknown products.
- Use the latest timestamped **primaryMarket.priceHistory24h** price, not the undated current-price field or underlying stock price.
- Multiply by raw Solana mint supply. Do not apply the display multiplier again. Ondo's official Token & Quote Pricing documentation explains the reciprocal balance/price display adjustment: https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing
- Preserve price observation time separately from supply collection time and finalized slot. The catalog refresh time is not quote time.
- Require catalog age <= 1 hour, supply age <= 5 minutes during calculation, price age <= 96 hours (the existing dated-equity-reference policy). Reject quotes before the last display adjustment. Reject malformed prices, duplicate symbols/timestamps, unsupported units, future observations and expired data.
- Use one leased refresh every 10 minutes, one bounded catalog download and five batched Solana reads for the current 438 tokens. No new paid service, wallet data, browser-side provider traffic or automation is introduced.
- Rotate cache to v2. The overview, scheduled refresh and standalone issuer endpoint use the replacement. Source descriptions show both timestamps. Values are dated minted-value estimates, not live circulating market capitalization or executable quotes.

## Live evidence

One live adapter execution valued 438 registered tokens at $33,939,069.19131471. This is a point-in-time research result, not a fixed expected total. NVDAon raw supply 16,736.623215892 multiplied by its 2026-09-25 23:45 UTC primary token price 225.365469943425798112 gave $3,771,856.956315551. The display multiplier was not reapplied. Finalized NVDA mint observation slot: 450897646.

Raw catalog, output, official pricing documentation and NVDA identity/price sample are saved under `research/valuation-audit-2026-09-27/predeployment/`. That folder's earlier DECISION.md describes the initial blocked state; this document supersedes its Ondo conclusion only. Superstate and Republic remain unadmitted.

Validation: 371 tests, strict types, lint and production build passed. Browser and production confirmation are recorded separately when completed. No claim of perfectly accurate or complete market coverage is made.
