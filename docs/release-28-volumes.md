# Token volume — 11 September 2026

The market table and selected-token card now display rolling 24-hour USD onchain volume from GeckoTerminal's token-level endpoint, matched by exact Solana mint. Click the volume column to sort descending or ascending; unreported values remain last. Sources and retrieval time stay in the existing expandable disclosure.

Live capture returned all 41 supported mints, including GRND, DNUT, BABA and MU. GRND was approximately $28.15M and DNUT $6.24M at capture. These are point-in-time rolling windows, not an attempt to reproduce an earlier $31M social screenshot. DEX Screener returned just one GRND pool with about $8.3M, demonstrating why the previous largest-pool fallback was insufficient for this use case. This does not establish that GeckoTerminal and Sunrise use identical methodology. Sunrise's precise current provider/methodology was not fully verified.

The public GeckoTerminal API is free and requires no new secret. Two requests cover the current 41 tokens, using batches of at most 30. The result is shared through the existing server cache for two minutes. Active market pages check every 30 seconds, on focus and reconnection. No per-wallet requests are sent upstream. The provider may rate-limit or change its beta API. Stale/missing volume is not substituted with CMC or one-pool figures. CMC covered-venue volume remains separately available in the detail disclosure.

Do not sum CMC, DEX Screener and GeckoTerminal volumes: their coverage overlaps. Token volume is not net investment, unique capital or evidence of organic demand. No cross-token total was added because a trade between two tracked tokens can be represented in both token statistics.

No NYSE ratio has been published. A sound comparison needs a licensed/delayed stock feed with consistent session boundaries and dollar turnover methodology; share volume times closing price is only an approximation. A rolling crypto 24-hour window and a previous NYSE session should not be described as the same interval.

Sources:
- https://apiguide.geckoterminal.com/ (public API, token-level metrics, attribution)
- https://apiguide.geckoterminal.com/faq (30 requests/minute, tokens absent from CoinGecko)
- https://docs.coingecko.com/reference/tokens-data-contract-addresses (schema)
- https://docs.dexscreener.com/api/reference (pool data scope)

Public response snapshots are in research/volume-28. Browser visual testing remains unavailable under the existing environment restriction.
