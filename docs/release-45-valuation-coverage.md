# Valuation coverage reliability

## Confirmed findings

Production Worker logs showed DEX Screener HTTP 429. Existing snapshots became stale at the two-minute refresh boundary; mergeMarketPages excluded those batches even though tokenObservation permits observations up to five minutes old. This caused temporary drops independently of actual issuance changes. We cannot reconstruct the exact user's 19-valued session from truncated cache rows.

## Changes

- Separate refresh cadence from validity for market overview snapshots. Prices and supply refresh every two minutes; existing observations can remain usable within the existing five-minute hard limit. Original per-token timestamps remain unchanged. Book/detail limits and wallet/tier checks are preserved.
- Pool batches refresh every four minutes. Shared D1 provider cooldown honors a DEX Screener 429 across batches and token-pair lookups. A shared cooldown is propagated to each cache key so clients do not spin on a false refresh state.
- At most three immediate snapshot passes per polling cycle rather than seven, reducing bursts against the application request limit; normal visible-page polling continues every 30 seconds.
- Issuer and aggregate incomplete figures are explicitly partial. Expand Valuation coverage for disjoint counts of unavailable supply, unavailable prices, unverified units and conflicting prices. Missing data never contributes zero.

## Verification and limits

187 regression tests passed; the 58 market tests passed again after the final cooldown propagation refinement. Type checking passed. Controlled local Cloudflare/D1 test: 20 concurrent reads, one shared background refresh; saved reads did not block on simulated 1.2-second provider latency.

scripts/check-valuation-coverage.mjs replays the captured September 12 public-source audit at a simulated 130-second age. Old snapshot expiry yields zero xStocks valuations; the validity-window fix retains 152 of 832. After five minutes, expired observations are excluded. This is an offline regression, NOT current production coverage. Result: research/market-integrity/refresh-coverage-regression.json.

The captured exclusions are 516 missing prices, 162 unverified quote units and 2 conflicting prices. Their presence does not establish that any token is valueless or unavailable to trade. The issuer public price endpoint was probed on both api.backed.fi and api.xstocks.fi and timed out; it was not integrated. Do not remove unit checks or treat a last-known issuer subtotal as a complete total to inflate coverage.

xStocks' documented Solana scaled balance is raw amount times multiplier. An external price needs a confirmed raw-versus-scaled quote basis before enabling adjusted valuations: https://docs.xstocks.fi/developers/multipliers . Public price endpoint: https://docs.xstocks.fi/apis/openapi/assets/get_public_assets_price_data_by_symbol .

Production wallet-authenticated visual QA remains unavailable in this session. Browser automation is administratively blocked. No paid provider, credential change, registry change or wallet authorization change was made.
