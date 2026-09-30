# Float launch hardening — 30 September 2026

Owner: engineering. Objective: remove the concrete payload/dependency blockers without changing membership eligibility or data definitions.

## Shipped architecture

Markets requests `/api/backpack-market`. The server selects canonical cache partitions containing Backpack mints, then filters observations and per-token timestamps to those tokens. It does not invent new cache keys or refresh providers per visitor. Existing all-issuer member consumers retain their old endpoint and a separate browser snapshot. Prices, partial coverage and original source times are preserved.

A public-only response cache lives at Cloudflare locations for 30 seconds. Its key excludes cookies and arbitrary query parameters. The loader has no member/session lookup. Errors are not cached; cache-storage failures fall back to the database. Cloudflare's rate-limiter binding replaces D1 counters for this new endpoint; a database limiter remains as a safe fallback in environments without the binding. IP-based anonymous limiting is approximate and may group users behind shared networks; this is not a billing or authorization boundary. Old endpoints and private mutations retain existing protections.

Undici, fast-uri, ip-address and brace-expansion received compatible security patches. The latest full package audit reports zero advisories; this is not an independent penetration test.

## Evidence

- Public response reduced from 1,172,612 bytes / 1,346 supply records / 15 partitions to about 186,185 bytes / 68 Backpack records / 2 partitions (84% smaller, uncompressed).
- Production smoke check passed. Both response-cache HIT and MISS observed. Source observation times remain unchanged when cached.
- Automated tests cover canonical-key preservation, no issuer leakage, public-cache isolation, uncached failures, and separate browser snapshots.
- Full-schema SQLite backup/restore test passes with synthetic discussion and attachment data. This validates application schema recovery, not a production D1 restore.
- The earlier isolated runtime check passed 50 concurrent authenticated fixture journeys and provider-outage checks. These local results do not establish production capacity.
- GitHub release checks run on pushes/PRs, with a manually triggered read-only production smoke check. No deployment secrets are placed in CI; the workflow does not deploy. GitHub failure notifications depend on repository notification settings.

## Remaining launch gates

1. Real phone: wallet sign-in from Safari and KakaoTalk, return to the same session, prepare a real portfolio snapshot and verify consent/cancel behaviour. No real-user portfolio publication has been independently exercised in QA.
2. Production-like staging capacity test with real quotas and measured p95/p99. Do not load-test production or free providers.
3. Confirm an accountable recipient for continuous uptime/freshness alerts; the manual smoke check is not continuous monitoring.
4. D1 Time Travel restore into an isolated recovery environment and verify counts, relations and attachments. Do not restore over the live database. Cloudflare's backup capability alone is not evidence of a successful recovery drill.

Verdict: the known payload/dependency blockers are repaired. Controlled beta remains the appropriate scope; unrestricted scale is not certified.

## Operator checks and rollback

Run `node scripts/check-public-launch.mjs` for two ordinary read-only endpoint checks. A nonzero exit flags missing data, overlarge payload, stale references, private-field exposure or endpoint failure. Inspect Cloudflare Worker logs and D1 metrics for runtime errors/quota headroom; do not log wallets or session values.

Keep the immediately preceding deployment available. Roll back the Worker version if public data fails or private data appears; no database migration was introduced by this release. A rollback restores the old dependency/payload limitations, so prefer a tested forward repair. Preserve the full registry caches needed by existing member features.
