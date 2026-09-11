# Holder experience update — 11 September 2026

## Product changes

- Replaced the news view's full-width stock selector with compact holding chips for small portfolios. Larger portfolios retain a bounded searchable control. News uses compact headline rows and 20-item pages.
- Added Light / Dark / System controls in the public header and member toolbar. The device preference persists, applies before page paint, and responds to system changes. The dark palette adapts legacy surfaces, text, borders, menus and dialogs while retaining Backpack-inspired red accents.
- Added private token quantities, estimated portfolio value and portfolio weights. Quantities aggregate validated token accounts with integer arithmetic; Scaled UI Amount multipliers are applied for the displayed quantity, including their scheduled effective time. Unknown conversions remain unavailable. Valuation uses raw token units times the observed market price, without treating that estimate as an executable quote. Missing prices produce a labeled subtotal; portfolio weights appear only when all holdings are valued.
- Removed minimum discussion text lengths: a nonempty title is enough, with an optional body. Kept technical maximums (140-character title / 4,000-character body) and existing spam controls. Removed character-count instructions from the form.
- Collapsed repeated market source labels into source details panels. News keeps one publisher/date line because the origin is useful when choosing an article. Scope distinctions such as pool versus aggregate volume remain available.
- Added nickname, bio, photo upload and photo removal. Photos are centered and resized to 256px JPEG in the uploader, with EXIF removed. The server enforces byte limits, JPEG framing/dimensions and no EXIF; bytes live in the AVATARS R2 binding. Profile fields remain in D1. Photos are visible only to authenticated members. Balances never appear in public author responses.

## News source and coverage

The previous Benzinga path had a reviewed MU mapping only and required a licensed API key. It remains available as an admin draft import, but it is no longer the member feed's only path.

The member feed now automatically requests public Yahoo Finance company RSS feeds. Supported tokens receive candidate feeds without adding an individual news-provider mapping. SK Hynix uses 000660.KS. Every headline must independently match a company name/alias, not just a ticker; a SpaceX token must not inherit a different company's SPCX stories. New or ambiguous issuers may still require an alias or foreign-listing override. A candidate feed is not a guarantee of coverage.

Observed live feed snapshots for MU, SPCX, DNUT, GRND and SK Hynix are in `research/news-26/`. They contain matching, current headlines. Third-party article bodies are not copied into the application. The original article URL is retained, without substituting a publisher homepage. Publisher names are derived from the linked host when no feed publisher field is present; a syndicated Yahoo-hosted story is labeled Yahoo Finance rather than guessing its original publisher.

Refresh behavior:

- Automatic refresh on entering the news view, returning focus, or every 15 minutes while visible. This is request-driven updating, not a background scheduler or a real-time guarantee.
- Public headline results are shared across members by symbol with a 15-minute D1 cache, per-symbol refresh leases, and bounded parallel fetches. A request refreshes at most six due symbols; larger portfolios fill in subsequent batches. No wallet addresses are sent to news providers.
- Only held companies and stories from the last seven days appear. Older cached news is replaced on refresh; unused headline caches older than seven days are pruned. Curated records and discussion links are retained.
- Errors preserve usable cached headlines within seven days and show a coverage warning. No story is invented for a token with no matching coverage. Headline matching intentionally favors precision and may omit relevant articles that do not name the company in their title.
- Twenty stories per page. No article bodies, scraped Google result pages, copied publisher homepages, or infinite scroll.

Google extraction was not adopted: its news RSS request could not be verified in this environment, and scraping search pages would be a brittle production dependency. A documented GDELT alternative returned rate limiting and a timeout during probes. Yahoo RSS was the working public source. Public RSS has no contractual availability guarantee; licensed news remains an upgrade for paid, high-scale service.

## Calculated data recommendation

1. **Trading cost at fixed order sizes:** executable average price, spread and depth from fresh books. Show unavailable when depth or RFQ coverage is insufficient. More actionable than a composite liquidity score.
2. **Net token issuance over 24h / 7d:** validated supply snapshots, clearly separating issuer reserves from circulating supply. Snapshot collection and interpretation are required before claiming flows or investor demand.
3. **Token premium or discount:** compare a token quote with an underlying-stock reference of the same economic units and timestamp. Requires a licensed reference feed, market-hours handling and issuer-adjustment normalization.
4. **Opt-in holder pulse:** aggregated polls from verified holders, with privacy thresholds. This creates original data; public-data arithmetic alone is reproducible and should not be branded exclusive.

Only private portfolio allocation was added in this release. No unvalidated trading score, issuance-flow claim, premium or sentiment index was shipped.

## Validation

Local integration passed for signed membership, private balances, posting a one-character title with an empty body, profile persistence, JPEG upload/retrieval/deletion, guest denial, cross-origin denial, invalid-image rejection, exact-holding news filters, live headline ingestion, seven-day retention and cache reuse. Existing editorial and community scenarios passed. Unit coverage includes every registered token's automatic feed candidate, captured live feeds, relevance/date/link rejection, Scaled UI Amount formatting and wallet-provider isolation.

Browser interaction and visual QA remain unverified because the environment's browser-access policy denied access; it was not bypassed. Source-level styling checks and server-rendered output checks are not a substitute for that review.

## Sources

- [Yahoo Finance MU RSS](https://feeds.finance.yahoo.com/rss/2.0/headline?s=MU&region=US&lang=en-US)
- [Yahoo Finance SPCX RSS](https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPCX&region=US&lang=en-US)
- [Solana Scaled UI Amount integration guide](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide)
- [GDELT DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
