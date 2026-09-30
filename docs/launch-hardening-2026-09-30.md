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

## Follow-up verification — 30 September 2026

- GitHub release run 36678814986 passed. Local full release checks passed again with 411 tests after adding the recovery regression test.
- Real Cloudflare staging: protected Worker, APAC D1, 50 synthetic members, 20 rooms and 1,000 posts. No production binding or provider access. At 50 concurrent authenticated home→rooms journeys (100 requests), p95 was 2,354 ms and p99 2,731 ms from this test client. All succeeded. D1: 500 statements, 1,749 rows read, zero rows written. These are two-page journey times, not individual API latency.
- For 50 parallel public market reads, 49 were edge-cache hits; p95 1,087 ms, p99 1,373 ms, 3 D1 statements / 17 rows read / zero writes. An earlier 25-request warm phase had 25 hits and zero D1 queries. Responses reached several Cloudflare locations through the test network. These are small samples, not sustained/global capacity guarantees. The fixture uses the checked-in registry and smaller synthetic market records, not the full production payload.
- Counters are request-scoped with AsyncLocalStorage. An initial isolate-global counter attempt was discarded because requests reached different isolates. No visitor limit is inferred from those discarded measurements.
- Production D1's rolling 24-hour baseline was 804,467 rows read and 48,641 written. Against Free allowances (5M reads / 100k writes per UTC day), writes have less headroom. This rolling baseline is not exact remaining account-wide daily quota. Staging seed cost 5,765 writes; recovery import 2,094 writes. Browsing measurements do not cover posting, translations, census or scheduled refresh costs. Worker request/CPU ceilings and longer burst behaviour remain unmeasured.
- Full remote recovery and Time Travel passed in an unbound copy in the same account: 37 tables and all 644 rows matched, including attachment contents and market caches; no foreign-key violations; integrity check passed. A synthetic marker was removed by restoring the recorded bookmark. Production was never restored or modified by the drill.
- The ordinary exported SQL repeatedly failed to import with Cloudflare `D1_RESET_DO`. Importing a rebuilt export succeeded: create all tables first, insert parents before children, bound large cache payload statements, then recreate indexes/triggers. The precise cause of Cloudflare's opaque error is not established. `scripts/prepare-d1-recovery.py` preserves source rows and produces a protected local SQL file; it does not connect to or restore any database. Its regression test covers foreign keys, large quoted Unicode payloads, nulls, permissions and overwrite refusal.
- Ongoing Codex heartbeat `float-availability-and-freshness` checks every 15 minutes: endpoints, privacy, response size, 15-minute reference/market-summary freshness and 48-hour holder freshness. Confirm failures before notifying RJ; stay quiet on unchanged status and notify recovery. This is a desktop/Codex automation, not an independent always-on external SLA monitor.
- Monitoring baseline: all three endpoints returned 200, references and market summary were under one minute old, Backpack holders approximately 24 hours old. Legacy pool observations remained partially stale (29 of 68 older than 24 hours, oldest about 91 hours). Availability is not accuracy certification, and this source must not be described as fresh.
- Wallet handoff and portfolio-attachment boundary checks: 12 tests passed. This does not verify the physical-phone KakaoTalk/Safari app-switch experience or a real wallet's signature prompt.

## Remaining limits

1. RJ must exercise the real-phone wallet sign-in, return and portfolio preview/cancel flow. Automated cryptographic/handoff tests cannot replace it.
2. Legacy pool-source freshness needs provider/coverage investigation; do not infer completeness from fresh Backpack reference prices.
3. Controlled beta is supported by the measured workload. Sustained traffic, mutation-heavy workloads, Worker CPU limits and exact account-wide daily quota headroom remain unproven. Do not claim unrestricted scale.

## Operator checks and rollback

Run `node scripts/check-public-launch.mjs` for two ordinary read-only endpoint checks. A nonzero exit flags missing data, overlarge payload, stale references, private-field exposure or endpoint failure. Inspect Cloudflare Worker logs and D1 metrics for runtime errors/quota headroom; do not log wallets or session values.

Keep the immediately preceding deployment available. Roll back the Worker version if public data fails or private data appears; no database migration was introduced by this release. A rollback restores the old dependency/payload limitations, so prefer a tested forward repair. Preserve the full registry caches needed by existing member features.

## Isolated recovery procedure

Export production read-only to an ignored, access-restricted local directory. Never commit raw backups. Prepare a second SQL file with `python3 scripts/prepare-d1-recovery.py INPUT.sql OUTPUT.sql`. Create a new unbound D1 database in the same account and import only there. Re-export and compare every source table/row plus foreign keys and integrity. Capture the copy's Time Travel bookmark, insert a synthetic marker into the copy, restore the copy to that bookmark, and repeat comparison. Never target the production database with the restore command. Remove the temporary database and local private artifacts after verification. Stored aggregate evidence contains no member data.
