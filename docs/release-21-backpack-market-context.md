# Backpack market context — September 11, 2026

HolderPulse now imports CoinMarketCap market observations through its documented public API. No Token Terminal or CoinGecko values have been imported; their dashboards are explicitly labeled external research resources.

## What changed

- Markets defaults to Your holdings. A separate Backpack overview shows partial ecosystem coverage, largest tracked tokens, and external research links.
- Compact rows show aggregate token price, 24-hour change, token market cap and 24-hour volume where CMC coverage exists. Missing aggregate prices/volumes fall back to explicitly labeled single-pool observations; market cap never uses a made-up fallback.
- Selected-token detail includes circulating token supply, token market cap, trading volume, 24h/7d/30d performance, source timestamp, direct CMC link, Backpack access and spot-book data, DEX liquidity, and a separate DefiLlama price check.
- Overview totals count only recent observations and show separate coverage counts for value and volume. No claim to all-Backpack market size, issuer market share, company valuation, backing or solvency.
- Landing, metadata and sidebar now identify the audience as Backpack stock-token holders. Brand color remains the existing blue/cream system. Independence disclosures remain.

## Verified provider coverage

The public CMC map matched six of 39 reviewed mints: MU (40817), SKHY (40833), SPCX (40238), AMC (42024), BOT (40816), SNDK (40815). Other matching ticker strings were rejected because they represent different tokens. NKE was not returned as a valid map symbol. New matches must be reviewed by exact mint before updating CMC_MAPPING; membership eligibility does not change with CMC coverage.

- GET https://pro-api.coinmarketcap.com/public-api/v1/cryptocurrency/map (research discovery)
- GET https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest?id=...&convert=USD (runtime, six IDs batched)
- Source contract: https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api
- Current free Basic plan explicitly includes commercial use: https://coinmarketcap.com/api/pricing/

Runtime uses one shared D1 cache and five-minute refresh eligibility, triggered by an open Markets view; it is not a background schedule or streaming feed. Existing pool data refreshes at two minutes; selected books at 30 seconds. At most 8,928 successful CMC refreshes per 31-day month under continuous use, before failure retries. Public IP rate limits can still delay requests. The existing cache provides a single refresh lease, last-good observations and a 30-second failure backoff.

To obtain dedicated limits later, create a free CMC Basic key and save **CMC_API_KEY** as a hosted server secret. No client key or purchase is required for the currently working public endpoint. With that secret, the adapter uses the keyed root and X-CMC_PRO_API_KEY header. It never puts the key in a URL or client response.

CMC observations retain the earlier of the asset/quote last_updated times, never retrieval time as quote time. Observations over 15 minutes old are excluded from the displayed CMC metrics. Invalid/future timestamps, duplicate entries, wrong IDs, wrong chains and mismatched mints fail closed. CMC zero/unreported capitalization and circulating supply are treated as unavailable (AMC in the research capture); genuine zero trading volume is retained. An unavailable source is not zero. Cached observations are labeled when retrieval is delayed.

## Why not import the other free websites?

Token Terminal provides free access to core dashboard data. Its documented API requires a subscribed API plan; free viewing does not establish free automated integration rights. No Token Terminal data was extracted, copied into runtime, or described as a live feed.

- https://tokenterminal.com/pricing
- https://tokenterminal.com/docs/api-reference/introduction

CoinGecko has relevant Backpack/xStocks/Robinhood category pages. Its keyless API documentation says it is unsuitable for production polling; production commercial use needs a suitable plan. We link those category pages for research rather than running an undocumented scraper or presenting cached search results as current data.

- https://docs.coingecko.com/docs/keyless-public-api
- https://www.coingecko.com/en/api/pricing
- https://www.coingecko.com/en/api_terms
- https://www.coingecko.com/en/categories/backpack-securities-ecosystem
- https://www.coingecko.com/en/categories/xstocks-ecosystem
- https://www.coingecko.com/en/categories/robinhood-chain-stocks-ecosystem

Research fixtures under research/market-data are timestamped historical API captures used in tests, never seeded into production.

## Branding and legal evidence

Recommendation: focus on Backpack as a specific user ecosystem. Do not position it as the only or strictest U.S.-regulated tokenized-stock provider. No primary evidence establishes that comparative claim.

Backpack's own stocks page names Trek Brokerage Services Limited, licensed by the Anjouan Offshore Finance Authority, as an intermediary broker for the region shown. Its launch explanation distinguishes brokerage ownership and onchain tokenization; its legal index links separate brokerage, asset-tokenization, issuer and risk-disclosure terms. A token holding is not proof of SEC approval or of every protection available to a U.S. brokerage customer. This review is not an entity-by-entity legal opinion or confirmation of user eligibility.

- https://backpack.exchange/stocks/about
- https://learn.backpack.exchange/blog/introducing-backpack-securities
- https://support.backpack.exchange/legal/general-legal/user-agreement
- https://www.sec.gov/newsroom/speeches-statements/peirce-statement-tokenized-securities-070925 (Commissioner statement, not a new rule or product approval)

## Validation

- 113 unit/regression checks passed, including eight new CoinMarketCap cases.
- 43 editorial API and 121 community-flow checks passed with a synthetic wallet/local RPC.
- Actual local Worker calls connected all four public providers, verified MU data, guest rejection, invalid-symbol rejection, shared cache reuse and order-book response.
- Type and targeted lint checks passed. The production build passed.
- Browser visual/interaction verification remains unconfirmed: the existing browser access policy failure prevents a rendered browser check. Local HTTP compilation and data-flow tests are not a substitute for visual QA.
