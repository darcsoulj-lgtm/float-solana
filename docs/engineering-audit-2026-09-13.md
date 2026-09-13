# Float engineering audit and proposed architecture

Date: 13 September 2026. Owner: engineering. Baseline commit: `4d0a19e4db579f8ff304fbb3915fcd48ba247d98`.

**Historical baseline:** the findings below describe the source before repairs. See [the repair report](engineering-repair-2026-09-13.md) for implemented changes, new evidence and unresolved items. This audit is preserved so before/after claims can be checked.

**Assessment: the application has useful foundations, but it does not yet meet a consistently enforced launch standard.** Passing tests do not cover several actual integration inconsistencies. Prioritize a focused hardening pass before expanding features.

This is a risk-focused source and dependency audit with reproducible local checks, not a claim that every line was manually reviewed, that a penetration test was completed, or that production capacity is established. No production application behavior or dependencies were changed by this audit. The architecture below is proposed, not already implemented.

## Current evidence

| Check                                | Result                                                            | What it establishes                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Source inventory                     | 172 TS/TSX/CSS/SQL files under app, components, hooks, lib and db | Inventory, not line-by-line review                                                                                         |
| Strict TypeScript                    | Pass                                                              | Current source type checks                                                                                                 |
| All 13 `tests/*.test.mjs` files      | 241 tests pass, none skipped                                      | Existing automated behavior checks pass                                                                                    |
| Repository lint                      | **Fail: 318 errors**                                              | 253 in tests, 64 in app/components/lib/hooks, 1 in scripts; most frequent rule is unhandled promises in test registrations |
| Default package test command         | **Omits 3 suites**                                                | Backpack dashboard, circulation cache, and xStocks circulation tests require manual inclusion                              |
| Lockfile advisory scan               | **23 findings: 11 high, 9 moderate, 3 low**                       | Affected dependency versions; not 23 demonstrated production exploits                                                      |
| New-token price adapter reproduction | **Fail**                                                          | Requested synthetic mint and valid returned price are discarded by the fixed-registry parser                               |
| Existing cache benchmark             | Pass                                                              | 20 concurrent local Worker/D1 snapshot reads share one simulated provider refresh                                          |
| Room query plan                      | Repeated work confirmed                                           | Correlated count scans visible threads for each room; no topic-leading index                                               |

Evidence is saved in `research/engineering/2026-09-13/`. Commands were run on the baseline source. No real users, wallets, production database, or third-party provider were used for load simulation.

## Prioritized findings

### P1 — Security dependencies need remediation

`package.json` and `pnpm-lock.yaml` pin `react-server-dom-webpack` to 19.2.6. React's upstream advisory lists that version as affected by a server-function denial-of-service issue and identifies 19.2.8 as a patched version in this release line. Float uses an RSC-capable framework; the installed framework contains server-function decoding paths. This audit did not establish whether the vulnerable path is reachable in Float's current production build and did not send exploit requests. Treat this as a priority compatibility-tested security update, not proof of an active compromise. [React advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g).

The remaining alerts include image parsing packages and development tooling such as Miniflare's `undici`/`ws`, Vite, and esbuild. Classify build/development/runtime exposure individually. The package audit's production/dev labels alone do not establish which code is bundled into the deployed Worker. Avoid a blanket major-version upgrade. Verify the entire resolved dependency graph after compatible patches and run the production build plus request-path checks.

### P1 — Automatic discovery is not consistently consumed

`lib/backpack-registry.ts` discovers verified Backpack listings and `lib/token-registry.ts` combines them with reviewed seeds. The market routes use this result. However, `lib/solana.ts:detectHoldings`, `lib/community-types.ts`, `lib/holder-news.ts`, and `lib/headline-cache.ts` still import the fixed `TOKENS` list. A future listing can therefore appear in Markets while its holder fails eligibility recognition and its news cannot be matched. The README discloses this separation, but it falls short of a consistent automatic-listing experience.

There is also a reproducible adapter bug in `lib/market-data.ts:parsePrices`: `fetchPrices` and `fetchHistoricalPrices` accept runtime tokens, but the parser loops over static `TOKENS`. An actual bundled adapter test sent a new synthetic mint to a fake provider, received its price, and returned no symbol. Existing tests passed because they do not cover this boundary with a newly discovered asset.

**Proposed repair:** one validated registry snapshot shared by discovery, holdings verification, topics, news aliases, and market parsers. Identify assets by `(chain, mint)` and represent underlying equities separately. Make eligibility an explicit server-controlled policy on that registry; never trust a client-supplied token list or grant access merely from a displayed ticker. Pass the approved snapshot explicitly to parsers and pure valuation functions. Preserve last verified registry data on provider failure and define delisting/revocation separately from discovery.

Acceptance: a synthetic newly verified mint flows through listing, price, holdings, community topic, and news tests without editing source; spoofed metadata, a colliding ticker, and a non-Solana mint are rejected.

### P1 — Market caches and loading orchestration have multiple owners

`app/api/market-data/route.ts` keys its source batches by review date plus a hash of mint addresses. `lib/holder-tier-server.ts` still uses review date plus a numeric batch index despite a comment claiming it shares Markets' caches. These keys cannot match; badge refreshes can perform duplicate upstream work. The public Backpack route also has differently sized batches, creating another overlapping cache population.

The browser fetches the registry before its market pages, adding a serial request even though pages include registry information. At the current 1,300-token seed size and batch size 90, the all-market flow makes 15 market requests per full pass. With successful loads completing within each 30-second interval, that is about 30 market requests per minute per visible client, before separate registry/circulation requests or refresh retries. A warm market page still has an authentication read, rate-limit write, registry read, and four source snapshot reads: at least 105 database statements for the 15-page pass, excluding additional work on page zero and background refreshes. This is a source-derived workload estimate, not measured production throughput.

**Proposed repair:** a single server market-data service owns canonical batch identities, source adapters, freshness rules, refresh budgets, and snapshot assembly. Public dashboards, authenticated Markets, and badges consume the same observations; the private portfolio joins those observations with session-scoped holdings separately. Fetch a compact summary and the visible table page, rather than loading the entire universe to derive summary cards. Move source refresh scheduling behind an explicit job boundary when the supported hosting runtime provides it; until then, disclose demand-driven refresh behavior. Do not claim that `waitUntil` is a durable scheduler.

Acceptance: public and member consumers of the same mint reuse source observations; concurrent cache misses respect provider budgets; failed refreshes preserve timestamps and last-good data; initial useful content does not wait for every issuer.

### P1 — Release checks are available but not enforced consistently

The default `test` script lists ten suites explicitly and misses `backpack-dashboard.test.mjs`, `circulation-cache.test.mjs`, and `xstocks-circulation.test.mjs`. Several tests rely on transpilation, regular expressions, and source assertions. Those are useful for specific regressions, but cannot replace runtime request/authorization contracts, as the new-mint parser failure demonstrates.

Repository lint currently exits nonzero. The earlier progress estimate of 55 application findings was incorrect; the full classified count is **64**. There is no repository `.github` workflow; this audit did not verify any externally configured CI gate. Existing wallet/authorization integration scripts edit local environment files, so they need an isolated runner before parallel CI execution. They were inspected but not executed in this audit.

**Proposed repair:** discover all unit suites automatically, provide one release verification command, clear application lint findings and correct test-tool lint configuration without blanket exclusions. Run isolated authorization and provider-contract tests against the built runtime. Make the publishing workflow require recorded results and a rollback plan. A script alone is not an enforced remote gate until it is wired into publication.

### P2 — Database reads include avoidable writes and growing scans

`lib/community-home.ts` attempts three seed inserts on every home read, retrieves all rooms without pagination, and counts discussions using a correlated query for each room. Migrations index threads by `(hidden, created_at)`, but not by room/topic. A synthetic database using all current migrations, 100 rooms, and 10,000 discussions measured a median **56.48 ms** over seven runs for this query. Adding only a candidate `(topic, hidden)` index in the disposable database reduced the median to **0.29 ms**. The result is a local SQLite comparison, not a promise for D1 latency. This is repeated SQL work within one database call, not an N+1 network-request claim.

Move seed writes to an idempotent migration, paginate room discovery, add query-driven indexes in both schema and migrations, and avoid recomputing public counts on every status request. Measure rows read/written and end-to-end latency after the change. D1 documents that an individual database processes queries one at a time, making expensive scans and frequent writes material bottlenecks. [D1 limits and throughput](https://developers.cloudflare.com/d1/platform/limits/).

### P2 — Privacy language and request limits are inconsistent with implementation

The fallback wallet signature text in `app/api/community/[[...path]]/route.ts` says balances are not saved, while verification and refresh persist `raw_amount`, `decimals`, and `ui_amount` in `community_holdings`. Private storage is not the same as no storage. Align both signing paths and user-facing privacy language with actual purpose, retention, access, and deletion behavior. Confirm retention requirements before asserting that expiry removes every stored balance; expired sessions and stored holdings are different records.

The community route calls `req.text()` before applying its 12,000-character limit and rate limit. Oversized bodies therefore allocate before rejection. Use a shared bounded reader that counts streamed bytes and cancels beyond the cap, with an early Content-Length check as an optimization rather than a trusted guarantee. This audit did not perform a denial-of-service test.

Positive controls inspected: parameterized statements; session-derived member IDs; expiring, HttpOnly cookies; same-origin mutation checks; signature verification; atomic challenge consumption; fresh holdings verification before granting access; suspension checks; source allowlists; and private/no-store authenticated responses. These controls are evidence of care, not a completed security audit.

### P2 — Feature boundaries and styles have accumulated debt

The member dashboard is 1,459 lines, Markets 1,057, the community route 817, and the issuer dashboard 750. These files combine multiple responsibilities. CSS is split across a 4,385-line global file and several large refinement layers; this raises the risk of selector collisions and later overrides. File size alone does not establish a defect, and the 12,165-line token dataset and vendored UI components should not be treated like handwritten application orchestration.

Extract profile, membership, notifications, portfolio, community, and market views around stable interfaces. Keep route handlers thin and move SQL into domain repositories. Give layout primitives and feature styles explicit ownership. Preserve behavior with tests and rendered checks during each extraction. Do not rewrite all screens at once.

## Proposed target architecture

Keep one application and one deployment initially, with clear internal boundaries:

```text
React views and hooks
        |
Typed API contracts + session/access boundary
        |
Application services
  registry | market data | holdings | news | community
        |                         |
Provider adapters           Domain repositories
        |                         |
Issuer APIs / Solana RPC      D1 / R2
```

Public source observations live separately from private member records. Services own business rules. Adapters normalize units, chain identity, timestamps, errors and rate limits. Repositories own queries and transactions. UI components display typed results and do not decide eligibility or independently reconstruct source priorities.

| Choice                                                                | Why it is appropriate                                                        | Limit and evidence required                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| One application with internal modules                                 | Low operating overhead; shared contracts and tests; incremental refactoring  | Split deployments only when independently scaling or isolating a measured workload is necessary |
| Existing React/TypeScript, framework, D1 and R2                       | Avoid a risky platform rewrite while repairing real defects                  | Framework is currently beta and dependencies need patches; validate runtime compatibility       |
| One verified registry with separate wrapper and underlying identities | Consistent discovery, access, news and aggregation                           | Explicit eligibility/revocation policy and provenance; no ticker-only identity                  |
| Shared observations with provider-specific refresh budgets            | More readers can reuse a bounded amount of source work                       | Prove cross-consumer cache reuse, source-call counts, freshness and quota behavior              |
| Thin APIs and private repositories                                    | Consistent authorization and query ownership                                 | Negative cross-member/role tests and actual query plans                                         |
| Paged tables plus precomputed/shared summaries                        | Initial work grows with the visible page rather than the full token universe | Measure response size, D1 operations, invalidation and partial-coverage correctness             |

## Implementation sequence and acceptance

1. **Security and release baseline:** patch and verify relevant dependencies; run all suites by default; establish an honest lint baseline; correct privacy statements and bound request reads. Preserve existing authentication behavior.
2. **Registry and observation contracts:** fix parser propagation, unify cache ownership, connect server-validated discovery to holdings/news/topics with explicit eligibility policy. Add new-listing end-to-end contract tests.
3. **Database and request efficiency:** seed once, paginate rooms, add the measured index, replace full-universe initial reads with paged results and a shared summary. Compare request/D1/provider counts before and after.
4. **Component and CSS extraction:** split the highest-change surfaces while preserving navigation and UI behavior. Validate rendered desktop/mobile/light/dark states and keyboard controls.
5. **Launch rehearsal:** isolated staging with separate synthetic members; warm/cold caches, 429s, timeouts, wallet/RPC failures, concurrent writes, expired sessions, and deployment asset rollover. Start at 10, 25 and 50 concurrent sessions, then increase only while measured resource and provider budgets permit. Proposed targets: cached useful content p95 under 2 seconds in tested regions, under 1% unexpected server errors, and no cross-member leakage. These are targets, not achieved results or capacity promises.

The existing local cache benchmark was rerun: blocking path 1,224 ms with a simulated 1,200 ms provider; 20 concurrent snapshot reads p50 24 ms, p95 27 ms, maximum 38 ms; warm read 8 ms; one shared provider refresh. This proves a useful cache primitive. It does not load-test Float's complete authenticated application.

Outstanding verification: production exploitability analysis for dependency alerts; isolated role/wallet integration runs; a current production build after proposed changes; real staging load with request/D1 accounting; multi-region user-perceived latency; and authenticated rendered browser QA. Browser inspection was not performed in this audit. No supported production user count is claimed.
