# Release 23 — useful token details and full registry coverage

The previous overview summed CMC circulating market caps for five tokens. Six verified CMC listings existed, but AMC did not report circulating supply/cap. The detail panel also required CMC for its main metrics even when DEX prices and volume existed.

## Changes

- Removed the Explore the wider market panel and its external category links.
- Added one server-side finalized Solana getMultipleAccounts call for all 39 reviewed token mints. Validates token program, mint type, initialized flag, decimals, unsigned supply and response completeness. No personal wallet address is sent for this query. Uses the existing private SOLANA_RPC_URL.
- Reuses the shared D1 market cache at a two-minute interval. No schema migration or new provider key is required.
- Added one shared token-observation selector for both the table and detail panel. Price priority: recent CMC, highest-liquidity indexed base-token pool, timestamped DefiLlama. Volume keeps its scope label; no summing aggregate CMC volume with DEX volume.
- Main overview now shows issued token value (total minted supply times observed token price) with explicit coverage. This is NOT circulating market cap, company capitalization, reserves valuation, or proof of backing. Minted supply includes reserve-held tokens. A lack of usable data never becomes zero. Inputs marked delayed or beyond freshness bounds are excluded.
- Detail starts with price, 24h change and volume, followed by minted supply, estimated issued value and indexed pool liquidity. CMC circulating metrics and 7/30-day performance appear in a secondary disclosure only where available.
- Every token row scrolls to the selected detail; search, scope and pagination remain in place during background updates. Holdings-only selection stays within current holdings.
- Markets checks the shared snapshot every 30 seconds, plus window focus, tab visibility and network reconnection. Provider cache intervals remain 2 minutes (pools/supply), 5 minutes (CMC), 30 seconds (books). Existing holdings checks remain every minute; added focus/online triggers. No routine page refresh or wallet signature is required within the active session.

## Live verification

`research/market-data/live-23.json` contains only public source observations captured September 11, 2026. All 39 registry mints returned validated supply; all 39 had usable prices and calculated issued values. This is coverage of the supported Backpack registry, not every tokenized equity on Solana or every future Backpack listing.

TTWO sample: pool price $218.088, 24h pool volume $58,170.30, indexed liquidity $11,292.90, minted supply 2,222.335275 tokens. Values are observations at the recorded timestamp, not executable quotes.

## Validation

- 24 market unit tests: mint validation, partial coverage, zero versus missing, stale data, exact-mint identity, TTWO without CMC, issued versus circulating valuation, transport and shared cache.
- Local authenticated market API checks: all five sources, guest/invalid token rejection, TTWO pool data, supply payload, cache reuse and order-book response. This API test uses synthetic mint supply via the wallet fixture; separate live verification above uses actual Solana.
- 143 community and 44 editorial regression checks passed. Existing wallet selection and message-signature implementation unchanged.
- Type check and production build passed before packaging.
- Local root rendered HTTP 200. Interactive visual/browser QA remains unverified because the browser security policy denied automation in this session. The user-facing preview handoff was queued; no claim of visual testing.

## Primary references

- Solana batch account reads and finalized commitment: https://solana.com/docs/rpc/http/getmultipleaccounts
- SPL mint supply: https://www.solana-program.com/docs/token
- DEX Screener token/pool API: https://docs.dexscreener.com/api/reference
- DEX Screener valuation methodology and circulating-supply limitations: https://docs.dexscreener.com/token-listing
