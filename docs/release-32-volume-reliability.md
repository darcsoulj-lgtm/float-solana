# Production volume investigation — 11 September 2026

Production /api/market-data logged repeated volume refresh failures. The earlier local capture returned all 41 tokens, but did not prove provider availability from the hosted Worker. Logging discarded the HTTP status, delaying diagnosis. Release 30 retains host/status without URLs, bodies or secrets.

Release 31 adds /api/market-health: public operational status only, no wallet/member data or market payload. It uses the same global provider cache/lease and limits requests to six per minute per client. A production request at 11:23:23 UTC returned degraded, no saved volume, zero coverage. Worker logs confirmed `api.geckoterminal.com HTTP 429`. This proves rate limiting, but does not establish whether the quota is shared with unrelated hosted traffic.

Release 32 respects Retry-After and applies a five-minute minimum backoff for 429 instead of retrying every 30 seconds. The market screen explicitly reports volume unavailable and automatic retry. Unavailable volume is never zero, CMC volume or a single pool's volume.

Optional dedicated access is implemented via COINGECKO_PRO_API_KEY, a server-only Sites secret. The fixed endpoint is https://pro-api.coingecko.com/api/v3/onchain/networks/solana/tokens/multi/{addresses}, using x-cg-pro-api-key. It uses the same exact-mint parser and batches of at most 30, with no automatic fallback to evade a rejection. The account requires an eligible subscription. No subscription was purchased and no key is configured; this path is tested with fixtures, not authenticated live. Configure the secret through Sites environment settings and redeploy, then verify /api/market-health and authenticated Markets data. Do not paste credentials into source or chat.

The free endpoint remains active with backoff. The feed must not be reported restored until a hosted health check returns actual coverage. Browser verification remains unavailable under the existing browser policy restriction.

Navigation: a single Discussions destination now contains Threads and Rooms. Existing room URLs, room creation/following and stored posts are preserved. Generic source directories remain removed from Discussions.

Product recommendation: first-party, opt-in longitudinal verified-holder polls. Show sample sizes and avoid claiming the small member sample represents all shareholders. Public volume/liquidity calculations are reproducible, not exclusive data. No poll feature or tracking of member balances was added by this release.

References: https://apiguide.geckoterminal.com/faq and https://docs.coingecko.com/reference/tokens-data-contract-addresses.
