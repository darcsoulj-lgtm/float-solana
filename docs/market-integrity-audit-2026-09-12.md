# Market data integrity audit — 12 September 2026

Scope: every one of the 1,297 reviewed Solana mints. Public, read-only requests; no member balances or private credentials in evidence. This audit checks source mappings and calculation integrity, not issuer backing or solvency.

## Findings

1. **Supply mapping passed.** All 1,297 finalized Solana mint accounts were initialized under the supported token programs, and their onchain metadata symbols matched the registry. The existing supply calculation equals atomic mint supply divided by `10^decimals`. No pool FDV, underlying-company capitalization or cross-chain circulating-supply estimate is used as Solana supply.
2. **GOOGLon supply scope was unclear.** Exact mint `bbahNA5vT9WJeYft8tALrH1LXWffjwqVoUbqYa1ondo` had `840411185021` atomic units with nine decimals: **840.411185021 unadjusted tokens**. GeckoTerminal's independent token record returned the identical normalized supply. The mint also has a display multiplier of `1.0024603266374352`. Unadjusted, adjusted, circulating and all-chain supply are different measures. The user's comparison page/number was not supplied, so its exact discrepancy cannot yet be attributed conclusively.
3. **Pool coverage was understated.** The batch discovery endpoint returned one pool each for MU and SPCX. Per-token requests returned 30 each. Summing the batch discovery result and treating it as broad liquidity coverage was misleading. GOOGLon returned one pool with an empty `priceChange` object; that is why a pool-based daily change was unavailable.
4. **Price changes were unnecessarily sparse.** Before the fix, 781 tokens had usable prices, only 100 had daily changes, and 534 had historical DefiLlama records. Replaying the same snapshot after the fix yields 539 comparable daily changes (including qualifying pool-only changes). This is observed coverage at the audit time, not a guaranteed future coverage count.
5. **Sources can use incompatible prices.** Ten discovery-pool/reference comparisons differed by at least 5%, before age filtering: NFLXx, CRWDx, TQQQx, LLY, AMCon, MRNAon, AMBRx, AMDx, GSx and MRNAx. NFLXx's mint has a ×10 display multiplier; TQQQx's has approximately ×2.009. This supports display units as a possible contributor, but does not prove the price basis of either provider. CRWDx and others also have very thin pools. Do not average away these differences.
6. **CoinMarketCap availability remains a limitation.** The existing unauthenticated endpoint failed during this audit. Hosted configuration has a private Solana RPC but no CMC key. No paid service or credential was added. CMC still takes precedence only when a current, exact-mint-verified quote actually returns; no CMC coverage was assumed in the audit totals.

## Changes

- Rename the primary supply metric to **Solana supply**, explicitly unadjusted and excluding other chains. Link directly to the mint account. Show adjusted display supply and multiplier in the existing source disclosure; retain atomic supply for review.
- Use the per-token DEX Screener endpoint for selected-token liquidity details. Deduplicate pool addresses and include the token on either side of a pair. Quote-side rows never inherit the base token's price or price change. Label the sum **Observed pool liquidity**, with returned pool count and partial-coverage wording. Thirty returned pools is not proof that only thirty exist. No pool volume is relabeled as total Solana trading volume.
- Price hierarchy: fresh exact-mint CMC quote, otherwise a fresh DefiLlama reference with confidence >=0.8, otherwise a separately disclosed base-token DEX pool quote. References are not executable quotes. The confidence cutoff is a product safeguard, not a provider guarantee.
- Compute reference-based daily changes using the same mint and provider. Current/historical timestamps must be within 15 minutes of a 24-hour interval; historical records too far from yesterday are rejected. Failed history cannot erase a current price. A multiplier-effective event inside the period suppresses an unconfirmed calculated return.
- Flag a >5% disagreement among available fresh price observations and withhold derived issued values and private portfolio estimates for that token. This review threshold is not a promise of accuracy below 5%. Do not infer which quote is correct solely from the difference.
- Preserve per-token fetch times when merging market pages. An older batch no longer ages out another issuer's fresh observations.
- Keep the existing conservative withholding of non-Backpack valuations with nonunit display multipliers. The prior Backpack raw-unit valuation convention is retained; this audit is not an independent certification of every quote provider's unit convention.

## Verification and limitations

- `scripts/audit-market-integrity.mjs`: full-catalog source audit; raw responses and independent selected-token checks are in `research/market-integrity/audit-2026-09-12.json`.
- `scripts/verify-market-integrity.mjs`: recomputes every captured mint and observation through the corrected production functions. 781 prices, 539 daily changes, 393 qualifying issued-value estimates in the frozen snapshot. Aggregate values remain **tracked coverage**, not the entire Solana securities market.
- Workers-runtime live price/history/pool calls passed for MU, GOOGLon and NVDAon. GOOGLon returned a calculated daily reference change of about +2.22%; MU returned 30 pools. Supply in this runtime test was replayed from the contemporaneous finalized RPC capture; all-mint live RPC checks were performed separately in Node.
- Regression coverage includes wrong-mint rejection, base/quote orientation, duplicate pools, raw vs adjusted supply, stale history, low-confidence prices, corporate-action windows, conflicting valuation inputs, and freshness across multiple batches.
- No authenticated production-member session or visual browser QA was performed. Source timestamps, free-provider gaps, different trading venues and unconfirmed quote units can still prevent universal cross-platform agreement. Missing data is unknown, never zero.

## Primary documentation

- [Solana scaled amount integration](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide)
- [DEX Screener API](https://docs.dexscreener.com/api/reference) — token requests document 300 requests/minute; discovery batches accept up to 30 addresses. Detail is fetched only for the selected token, shared-cache lifetime two minutes.
- [DefiLlama free price API](https://api-docs.defillama.com/llms-free.txt) — current and historical prices by chain/address; no new key. Historical requests share the existing two-minute server cache.
- [Ondo GOOGLon metadata](https://app.ondo.finance/api/v2/assets/GOOGLon/sol_metadata.json)
- [GOOGLon Solana mint](https://explorer.solana.com/address/bbahNA5vT9WJeYft8tALrH1LXWffjwqVoUbqYa1ondo)
- [Independent GeckoTerminal token record](https://api.geckoterminal.com/api/v2/networks/solana/tokens/bbahNA5vT9WJeYft8tALrH1LXWffjwqVoUbqYa1ondo)
