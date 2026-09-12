# News delivery repair — 12 September 2026

Production logs confirmed Yahoo Finance RSS returned HTTP 429 for MU, SPCX and SKHY. The previous single-source path could not deliver new headlines during that cooldown.

Google News RSS is now primary, with Yahoo Finance RSS as fallback. Each provider has an independent cache and Retry-After window. Company-name queries avoid token ticker collisions (for example SPCX versus the unrelated SPCX ETF). Underlying-company caches are shared across issuer wrappers.

The feed shows headlines and publisher names, with article-specific links. Google links pass through Google News to the original article. No article bodies are copied. These are free public RSS endpoints, without a guaranteed API quota, availability SLA, or completeness guarantee; no paid subscription or key is needed. Recheck provider terms before commercial expansion.

Refreshes run every 15 minutes while the site is in use. This is periodic retrieval, not real-time delivery. Successful shorter responses and provider outages preserve cached stories from the last seven days. Older stories are excluded. If neither source is fresh, the interface reports temporary unavailability rather than suggesting that no news exists. Pagination remains 20 headlines per page.

Verification: live Google responses through the local Cloudflare-compatible Worker runtime and D1 cache produced 40 company-matched headlines each for MU, SKHY and SPCX. Tests cover provider failover, rate-limit independence, retention, ticker collisions, endpoint pagination and holdings isolation. Local runtime evidence is distinct from production cache delivery and authenticated browser QA.
