# Tokenized-stock Markets page

## Delivered

A members-only Markets view defaults to verified holdings and supports searching and paginating the existing 39-token registry. A wider working layout replaces the redundant sidebar on this page. Selecting a token shows exact mint, indexed DEX pools, top-pool price/liquidity/24h volume/change, independent DefiLlama token-price observation and timestamp, Backpack transfer availability, and fresh spot bid/ask/spread/depth where a spot book is listed.

Backpack registry and books, DEX Screener pools and DefiLlama free token prices are active HTTP integrations. The browser requests observations every two minutes while visible; a selected book is checked every 30 seconds. Public observations share a D1 cache, five-minute registry TTL, bounded refresh leases and failure backoff. No wallet balances are passed to providers. It is periodic data, not a streaming quote feed or a background scheduled job.

The RWA industry dashboards on DefiLlama and Token Terminal are external links. Paid RWA/Token Terminal APIs remain unconnected; no purchase is required for the implemented sources. Backpack exchange TVL is not represented as tokenized-stock backing. No unsupported underlying-stock premium/discount, holder count or market capitalization is inferred.

## Validation

- TypeScript and targeted lint pass.
- 105 unit checks pass, including 12 new market tests: exact mint/chain/base-asset matching, perpetual exclusion, null versus zero, source timestamps, old/crossed/malformed books, real SQLite cache idempotence and failure handling.
- 43 editorial and 121 community checks pass with synthetic local wallet/RPC state.
- Live provider checks through the local Worker return real MU catalog, pool and DefiLlama price data. Guest rejection, invalid-symbol rejection, selected-book response and shared-cache reuse pass.
- Worker redirect compatibility issue discovered during integrated testing and fixed for both market and news providers: manual redirect mode with non-2xx rejection. Credentials are never forwarded to redirects.
- New schema-only migration 0005 adds the public observation cache. Existing migrations are unchanged.
- Browser security restrictions from the preceding work remain unresolved; no browser bypass or visual verification is claimed. Typography, responsive CSS and UI behavior were inspected in code.

See market-data-research.md for source documentation, costs, scope and proactive product recommendations. Production build passed. Publication status is recorded upon completion.
