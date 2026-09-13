# Float engineering repair

Date: 13 September 2026. Owner: engineering. Baseline: release 67, commit `4d0a19e4db579f8ff304fbb3915fcd48ba247d98`.

**Follow-up:** the two dependency alerts described below have now been removed, and normal Chrome inspection is working. The full gate now passes 247 tests with zero known dependency advisories. See [dependency repair and live verification](dependency-security-2026-09-13.md). The release 68 results below are retained as historical evidence.

This release repairs the highest-risk integration, security and database findings in the [baseline audit](engineering-audit-2026-09-13.md). It keeps one application and deployment. It does not claim that all architectural debt is eliminated or that global production capacity has been established.

## Implemented boundaries

| Boundary                  | Responsibility                                                                         | Why this helps as usage grows                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verified registry service | Combines reviewed Solana seeds with officially discovered, verified Backpack mints     | One server-controlled token identity list supplies listings, parsers, holdings, badges, topics and news; a new listing no longer needs separate edits in each feature          |
| Shared market service     | Canonical mint batches, provider adapters and cached source observations               | Public Backpack, member Markets and badges reuse the same price/supply/history observations; concurrent cache misses use database leases instead of duplicating provider calls |
| Private access boundary   | Signed wallet sessions, finalized ownership checks and session-derived database scope  | Public market caches contain no member holdings; untrusted client IDs and symbols cannot grant private access                                                                  |
| Community data layer      | Read-only home snapshot, paginated/searchable rooms and atomic discussion counters     | Home requests no longer seed data or recount the entire discussion history; directory responses are limited to 50 rooms per page                                               |
| Focused client modules    | Community-feed requests and room-directory interaction moved out of the main dashboard | Filter requests have an explicit owner and stale responses cannot overwrite a different feed; server pagination is available in the UI                                         |
| Release gate              | Strict types, full lint, discovered regression suites, then production build           | The normal build stops on failures instead of allowing omitted suites or known lint errors through                                                                             |

The existing Vinext/React, Workers and D1 stack is retained. Extra services would add deployment, credentials and operational cost without solving the measured bottlenecks. SQL triggers update room counts atomically when discussions are created, deleted, moved or hidden; no separate count-refresh job is required.

Normal active market polling is now two minutes. The first market batch provides the registry and initial data together, removing the extra serial registry fetch. Source snapshots for a warm canonical batch use one database query. Provider failures retain source timestamps, last-good observations and backoff; missing data is not converted to zero.

## Security repairs

- React and React Server Components updated to 19.2.8; Vite to 8.0.16. Compatible overrides update vulnerable `ws`, `undici`, `sharp` and esbuild paths. pnpm 11 overrides are recorded in `pnpm-workspace.yaml` and the lockfile.
- Community, news, editorial and research JSON routes use a shared reader that counts streamed bytes before buffering and cancels oversized bodies. Same-origin and authentication boundaries remain server-side.
- Both wallet-signing messages now disclose private storage of supported balances for portfolio display and access verification. They do not authorize a transfer.
- No paid provider, external scheduler, real wallet transaction or production load generator was added.

The advisory scan decreased from 23 findings to **two high-severity findings**, both in `image-size@2.0.2` via Vinext. The registry did not offer the advisory feed's suggested 2.0.3; the official [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [JXL/HEIF advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) list no published fix at the time checked.

Reachability review found Vinext's only direct `image-size` import in its build-time metadata reader, which reads repository files. Inspection of the newly generated server JavaScript found no `image-size`, metadata-reader or identified parser markers. This supports excluding that parser from the inspected deployed Worker, but is not a general penetration-test result. The installed build dependency remained flagged at the release 68 check. It was subsequently replaced through a pinned, tested package patch; see the follow-up above.

## Verification and measured limits

All **244 regression tests** pass, with no skipped tests. Strict TypeScript, full repository lint and the production build pass. New tests exercise verified new-mint propagation, streamed limits, cache concurrency/outage handling, private home isolation, room pagination/search and insert/hide/move/delete counter behavior. Existing signature, mint validation, replay, badge freshness and client-recovery checks remain in the full gate.

`scripts/check-repair-runtime.mjs` runs real API routes, session checks and migrations inside an isolated local Worker/D1 environment. It creates 50 synthetic members, 100 rooms and 10,000 discussions. External providers are replaced with deterministic 500 ms/HTTP 429 responses; it loads no project secrets and sends no production traffic.

| Workload                                                               | Result                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 50 concurrent authenticated users, each requesting home → news → rooms | 150 requests; p95 complete journey 153.7 ms locally                                                                         |
| Database reads for that workload, before/after atomic counters         | 521,423 → 6,423 rows, about 98.8% fewer; 850 statements after repair                                                        |
| 20 concurrent cold market requests during simulated provider outage    | p95 48.0 ms for snapshot responses; at most one refresh request per distinct provider endpoint                              |
| 50 concurrent warm market requests                                     | p95 115.5 ms; zero provider calls                                                                                           |
| Access failures                                                        | Unsigned request rejected, cross-origin mutation rejected, oversized stream rejected, supplied foreign member scope ignored |

Cold responses can contain unavailable source values while background work runs. Their low latency does not mean fresh prices arrived in 48 ms. These measurements are local, single-machine results, not a worldwide latency promise or a supported-user-count claim. Evidence: [runtime results](../research/engineering/2026-09-13/repair-runtime.json), [before counters](../research/engineering/2026-09-13/repair-runtime-before-room-counters.json).

Browser inspection was unavailable during the original repair. Follow-up inspection succeeded using normal Chrome, including existing signed-in pages and a public dashboard at mobile width. A separate automated HTTP client received Cloudflare error 1010; that client-specific rejection did not establish that normal-browser verification was blocked. Fresh wallet signing and other mutating browser journeys remain untested. See the follow-up for exact coverage and limitations.

## Outstanding work

1. Extend the completed browser checks to fresh wallet signing and mutating journeys; run multi-region staging tests and measure provider/D1 quota headroom before a wider launch.
2. Replace full-universe client aggregation with a compact server summary and visible-page endpoint when required by measured traffic. The all-market flow still loads roughly 15 batches for the seeded universe; this repair reduces duplicate work and polling, but does not remove that fan-out.
3. Automatic issuer discovery remains Backpack-only. Other issuers retain their reviewed seeds. Background refresh remains demand-driven; `waitUntil` is not a durable scheduler or a guarantee that an idle site updates.
4. Continue extracting profile, notifications and market presentation from large components as those features change. The global styles and main community route still contain architectural debt; they were not rewritten wholesale.
5. Maintain the tested metadata-reader patch until an upstream release removes or fixes the vulnerable parser, including bundled copies. An independent security review, production monitoring, backup/restore exercise and actual-user wallet verification remain separate launch evidence.

## Deployment and rollback

Migrations 0009 and 0010 add indexes, migrate legacy topics, seed existing reference links once, add/backfill a room count and install maintenance triggers. Apply them through Sites alongside the release. They do not delete member data. Tests apply the entire migration history in order.

Publish the exact pushed source with its successful build archive and preserve the current public audience. Keep immutable assets from prior builds for open tabs. If a functional regression requires rollback, release 67 is the preceding saved version; the additive database changes remain compatible with its existing inserts and reads. That version predates these security updates, so a forward fix is preferable where practical. Never reverse the migration by deleting member records.
