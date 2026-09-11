# HolderPulse market data — reviewed September 11, 2026

## Product decision

Add a holdings-first Markets page for Backpack-issued tokens: pool price and 24-hour change, most-liquid observed pool's liquidity and volume, separate DefiLlama token price with its source timestamp, exact mint, Backpack deposit/withdrawal flags, and spot bid/ask/spread/depth where listed. Let members browse the existing supported registry with search and pagination. Do not broaden the news feed.

These observations help holders understand trading conditions. They do not establish underlying company valuation, legal rights, backing, custody quality, execution price or investment merit. No market-wide chart or public wallet-balance display is needed for this first slice.

## Primary sources and availability

| Source | What was verified | Integration decision |
| --- | --- | --- |
| Backpack public API | `/assets`, `/markets`, `/securities`, `/ticker?source=External`, `/depth` returned 200 during live probes. Asset registry maps MU to MU.US by exact Solana mint. Only four spot stock books appeared; other STOCK entries include perpetuals. | Use exact registry mappings, transfer flags and SPOT order books. Never mix perpetuals or RFQ markets into spot data. |
| DEX Screener | Documented `/tokens/v1/solana/{mints}` supports up to 30 mints and returns pools, liquidity, volume and base-token prices. Live MU pool returned. | Query all 39 supported mints in two batches. Deduplicate pair addresses, require exact base mint and Solana chain. Rank by reported liquidity. |
| DefiLlama free coin-price API | `/prices/current/solana:{mint}` returned a MU token price, timestamp and confidence. | Import token-price observations for the exact supported mints. Preserve provider timestamps. No claim that these are underlying stock quotes. |
| DefiLlama RWA dataset | Official API docs classify `/rwa/*` and equities fundamentals as Pro-only, currently $300/month. | Link to the stock/equity dashboard; do not embed the paid dataset or use undocumented endpoints. |
| Token Terminal | Tokenized asset explorer covers stocks, market cap and activity. API access is a custom-priced plan. | Link to the Solana stocks explorer. No unactivated connector or scraped paid data. |

Benzinga remains a separate licensed news connector, not activated by this work. Its Worker-incompatible `redirect:error` was corrected to `manual` with non-2xx rejection, preserving the no-redirect rule.

## Source references

- Backpack API and stock trading: https://docs.backpack.exchange/
- Backpack issuer explanation: https://learn.backpack.exchange/blog/introducing-backpack-securities
- DEX Screener API: https://docs.dexscreener.com/api/reference
- DEX Screener API terms: https://docs.dexscreener.com/api/api-terms-and-conditions (commercial use permitted subject to its restrictions; no raw API resale or directly competing screener product)
- DefiLlama API catalogue: https://github.com/DefiLlama/api-docs/blob/main/llms.txt
- DefiLlama Pro endpoints: https://github.com/DefiLlama/api-docs/blob/main/llms-pro.txt
- DefiLlama stocks dashboard: https://defillama.com/rwa/category/stocks-equities
- Token Terminal product: https://tokenterminal.com/resources/articles/introducing-tokenized-assets
- Token Terminal API pricing: https://tokenterminal.com/pricing
- Token Terminal Solana stocks: https://tokenterminal.com/explorer/tokenized-assets/stocks?chains=solana&tab=stocks

## Important exclusions

DefiLlama's `backpack` protocol is categorized CEX. Its TVL is exchange assets, not the supply or backing of Backpack-issued stocks. No tokenized-stock backing total is calculated from it. Protocol TVL figures for xStocks/Ondo/Dinari also differ in scope; no misleading issuer leaderboard is constructed.

Backpack's ticker endpoint reports rolling statistics without the last-trade/source timestamp needed for a dependable current premium/discount calculation. External data is not substituted for a live reference quote. DEX Screener's response likewise lacks a quote timestamp: retrieved time is labeled separately. No premium/discount alert or arbitrage claim is made.

DEX pool liquidity is not executable depth. Book depth is the displayed notional within 1% of the best bid or ask on each side, excluding RFQ liquidity and fees. All monetary figures are USD-equivalent observations. Holders, token accounts, wallets and individual investors must not be treated as interchangeable counts.

## Refresh and failure behavior

Markets polls every 120 seconds while visible. Registry is cached for five minutes. Selected order book polls every 30 seconds, with stale (>120 seconds), future, crossed, empty or malformed books rejected. Public observations are cached in D1; no personal balances are stored in the cache or sent to data vendors. A short refresh lease and 30-second failure backoff limit concurrent calls. Prior observations remain timestamped and marked delayed on failure; missing values remain unknown rather than zero. No background scheduler runs when the page is closed.

## Proactive priorities

1. Corporate actions: exact, dated issuer notices for dividends, splits, earnings and conversion changes. Value: explains changes in what the holder owns. Requires dependable source coverage and event classification.
2. Withdrawal/transfer changes: persist changes to issuer availability flags before adding opt-in notifications. Avoid alarming users based on one failed API poll.
3. Premium/discount: only after obtaining synchronized, timestamped underlying quotes and executable token quotes. A stale reference should disable the calculation.
4. Mint/burn flows and concentration: only with indexed history and labeled issuer/custody/pool accounts. Raw supply is not active investor demand and wallet count is not people.
5. Partner benefits: show only funded, attributable offers with clear eligibility. Do not fill the page with speculative airdrops.

Avoid generic AI sentiment, TVL leaderboards mislabeled as backing, and token-holder rankings that reward whales. The community's eventual differentiator is useful context plus contributions from verified holders.
