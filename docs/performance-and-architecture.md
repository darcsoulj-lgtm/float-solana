# Performance and architecture review — 12 September 2026

Owner: Noah (engineering). Scope: initial dashboard data, news retrieval, market snapshots, request concurrency and maintainable loading boundaries.

## Findings and changes

| Finding | Change |
| --- | --- |
| News awaited an external refresh before reading existing headlines | Shared `readThenRefresh` orchestration renders the saved response first, then updates it; refresh failure does not erase it |
| Initial member home waited for a wallet RPC scan | Read the authenticated saved dashboard immediately; recheck holdings independently and read again after completion |
| Market requests awaited their slowest external provider | `marketSnapshot` returns database observations and uses Cloudflare `waitUntil` to refresh independently |
| Concurrent visitors could arrive at an expired cache together | Existing atomic database refresh leases remain the authority; the new path uses that same refresh implementation |
| Home requested bootstrap writes, holdings and related data, wallet availability and rooms in sequential trips | `communityHome` performs these in one ordered D1 batch, with member-scoped private queries |
| Polling logic was embedded in the market screen | Moved it into `useMarketOverview`; two concurrent page reads, holdings batches first, bounded polling for refreshing pages and focus throttling |
| News users downloaded market-only component code | Lazy-load the market screen when opened |
| Session status repeated identity lookup and serialized independent reads | One identity lookup, with independent member/count lookups started together |

No shared cache contains wallet addresses or personal balances. Authenticated responses remain private/no-store. Refreshing market observations retain their original timestamps; existing valuation freshness checks remain in force. Missing values are not converted to zero. News still uses a seven-day window and 15-minute provider caches. Provider backoffs remain shared across visitors. News refresh requests process at most three companies to keep fallback work bounded; later pending holdings are handled on subsequent checks.

## Evidence

Before this release, a small sample of production Worker logs showed market request wall times of 731–2,285 ms. One holdings refresh took 1,490 ms followed by a 1,024 ms home request. These are sampled server invocations, not representative global percentiles. A separate public status probe from the developer machine took about 230 ms; the first home-page probe took about 3.10 seconds including connection overhead.

Controlled local Cloudflare-compatible Worker + D1 test, with a simulated provider delay of 1,200 ms:

- Previous blocking path: 1,226 ms.
- Twenty concurrent snapshot responses: p50 27 ms, p95 28 ms, max 28 ms.
- Warm snapshot: 7 ms.
- Provider refreshes across those twenty requests: one.
- The background job completed and its result was read back from D1.

Reproduce with `node scripts/check-performance-runtime.mjs`. This isolates the cache change. It is not a production load test or proof of worldwide latency. Background Worker lifetime is bounded; this is suitable for short refreshes, not a durable job queue. See [Cloudflare context documentation](https://developers.cloudflare.com/workers/runtime-apis/context/).

Tests also cover stale-data retention, provider cooldowns, saved-first rendering order, refresh failures, SQL against the actual migrations, and member isolation. The market route exposes a `Server-Timing: market_snapshot` measurement for the response path. Worker wall time can include background work, so it must not be confused with time until a browser receives the response after this change.

## Engineering judgment

This is a working single application with separable feature services, not proof of unlimited scale. Useful foundations already exist: durable D1/R2 storage, server-side wallet verification and access checks, reviewed token mints, provider adapters, cache leases, pagination, parameterized queries, and migrations. The large token registry is data, not evidence by itself of tangled application logic.

Real debt remains: the member screen and community route still cover too many features; room discovery is not paginated; status counts are computed repeatedly; free external feeds have no availability guarantee; provider refreshes depend on active visitors; most validation is local and automated rather than authenticated browser coverage. Do not call those problems solved by this release.

Before a larger launch:

1. Measure authenticated first-use flows from Asia, Europe and North America. Target cached useful content within two seconds on a normal connection; report measured percentiles, not a promise.
2. Run a bounded, authorized staging load test with separate member sessions and realistic provider limits. Check p95 response time, errors, database operations and quota headroom. The local 20-request test does not establish a supported production user count.
3. Move ingestion to scheduled, durable jobs when traffic or coverage warrants it, so quiet periods do not leave every source cold. Keep cached reads independent of the scheduler.
4. Extract profile, discussion and moderation features as they are next changed; paginate growing room discovery and inspect query plans at representative data volumes. Avoid a blanket rewrite or microservices without measured need.
5. Require type checking, the relevant test suite, an actual runtime check, and deployment verification for changes to loading/auth/data paths. Add regression cases when a user-reported bug exposes a missing scenario.

Hosting recommendation: keep the current Cloudflare-backed deployment for this repair. There is direct evidence of avoidable application waiting, and no evidence that migrating providers alone would remove it. Global authenticated performance and production capacity remain to be measured.
