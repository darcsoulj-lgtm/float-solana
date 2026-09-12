# Public Backpack dashboard

A dedicated `/backpack` page presents the existing reviewed Backpack-issued Solana registry without requiring membership or a wallet. The main site remains multi-issuer. Navigation links to the dashboard and back to all supported Solana tokens; joining uses the existing named-wallet flow through `/?join=1`.

## Data

- Public `/api/backpack` serves five deterministic batches of at most ten reviewed mints. It never includes member, wallet, private balance, credential, or authentication data.
- Full per-token DEX Screener pool discovery replaces the best-pool batch subset for this dashboard. Unique pool addresses are counted once at issuer level, including pools appearing under multiple stock tokens. Routed swaps can still comprise multiple pool executions. These are tracked DEX metrics, not all-venue market volume.
- Shared D1 snapshots and refresh leases bound traffic. Pool discovery runs three at a time with four-second timeouts, at most about sixteen seconds per batch. Pools refresh every four minutes on demand; supply/prices every two minutes. Visible clients check every minute and briefly retry cold cache warmup. No paid market-data subscription was added.
- Minted value is Solana gross mint supply multiplied by compatible token prices, explicitly not AUM or circulating value. Existing price-conflict and unit-safety checks remain active.
- Recent pools use validated provider pool creation times, never inferred stock issuance dates. The registry remains reviewed, not automatically expanded using unverified tickers.
- Missing values remain unknown. Stale/future observations do not enter pool totals. Per-record source timestamps survive batch merging.

## Interface

Compact summary, activity bars, search, sortable stock table, pagination, inline pool details, shareable stock query, and centralized source disclosure. Light/dark themes reuse site preferences; mobile shows stock, price and volume with remaining data in expanded details. Native keyboard controls and reduced-motion support included.

## Validation

209 tests passed, including 11 new public-dashboard tests for deduplication, unknown/zero values, source freshness, issuer isolation, pool dates, price conflicts, bounded discovery, public endpoint privacy, invalid requests, sorting, and initial component rendering. TypeScript and production build passed.

Browser automation is administratively blocked in this environment; no alternative browser bypass was attempted. Static component rendering is not visual or real-browser interaction QA. Live public API and deployment checks are recorded separately after publication.
