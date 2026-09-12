# Release 46 — xStocks estimates and compact issuer filters

The previous diagnosis confused absent quotes with quotes rejected by a 15-minute freshness cutoff. Captured DefiLlama responses actually contain prices for 752 of 832 xStocks. Replaying the same capture with the previous release gives 152 valuations; this release gives 410, including 258 explicitly dated estimates. This is offline evidence, not a live production count.

## Changes

- Preserve last-available references for at most 96 hours, with original provider timestamps and visible Last quote labels. This accommodates long market weekends without presenting old observations as live.
- Prefer fresh CMC/DefiLlama/pool observations. Never compare an old reference against a current quote as if they were contemporaneous.
- Require a recently fetched source and fresh Solana supply; expired source caches remain excluded. Reject estimates whose reference predates a known unit adjustment.
- Dated references cannot supply current 24h changes or holder rankings. Portfolio estimates disclose dated quotes.
- Replace duplicate issuer cards and filter buttons with one compact value/filter row. Preserve reset, selected state, keyboard focus, dark-theme variables, responsive wrapping and partial labels.
- Merge the three methodology disclosures into one.

## Remaining coverage gaps

In this capture: 80 listings have no usable price, 340 have unconfirmed adjusted quote units, and 2 have conflicting prices. No prices are invented and no global market cap replaces Solana minted value. NFLXx illustrates the unit problem: the captured pool price is 778.58 versus a DefiLlama quote of 78.4435 with an onchain multiplier of 10. This discrepancy cannot safely be generalized into a unit conversion for every feed.

Live public CoinGecko registry lookup matched 716 exact Solana mint addresses; sample Apple and Netflix quotes were returned. That disproves the earlier broad assertion that other providers cover only 19 tokens. Registry coverage is not guaranteed quote coverage. CoinGecko is research evidence here, not a newly integrated production dependency. Its public keyless service is rate limited and positioned for testing/noncommercial educational use. The sampled official AAOIx price endpoint returned null.

## Evidence and validation

- `scripts/check-dated-price-coverage.mjs` reproduces the before/after figures and preserves per-token exclusions in `research/market-integrity/dated-price-coverage.json`.
- Exact CoinGecko matches and sample responses: `research/market-integrity/provider-coverage-check.json`.
- Automated checks cover cutoff boundaries, original timestamps, current-source priority, unit adjustment safety, ranking exclusions, filter/reset and rendered disclosure structure.
- Browser visual automation remains unavailable in this session; do not describe automated render tests as a visual sign-off.

## Sources

- https://docs.xstocks.fi/developers
- https://docs.xstocks.fi/developers/multipliers
- https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide
- https://docs.coingecko.com/docs/keyless-public-api
