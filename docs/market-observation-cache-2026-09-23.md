# Market refresh reliability — September 23, 2026

## Problem and evidence

The browser previously fetched 15 canonical market batches, then repeatedly polled pending batches. Each visit could start provider work. Returning after a reload lost its in-memory observations, and merging discarded expired payloads. Production D1 held a DEX Screener HTTP 429 cooldown during the investigation. This proves provider throttling occurred; it does not prove it was the only cause of slow loading.

## Implemented design

- Keep the existing discovery **and** bounded detail enrichment (two active tokens per 30-mint discovery group), exact reviewed pools, mint validation and pool exclusions. No coverage reduction is used as a performance fix. Failed detail enrichment preserves the last complete batch instead of publishing a smaller discovery-only batch as fresh.
- A minute cron processes one of four canonical batch groups sequentially. Under normal operation every batch refreshes once in four minutes. Registry additions automatically join the partitions. The pool refresh threshold is one minute ahead of its nominal TTL so small scheduling jitter does not skip a full cycle.
- Each job uses a private RPC entrypoint in the **same deployed Worker**. No public refresh endpoint, separate service deployment or paid infrastructure is introduced. The scheduler uses a durable lease and suppresses duplicate deliveries. A job failure does not prevent other jobs from running; a missed group returns in the next cycle. Provider outages can still delay observations.
- DEX calls inside each batch are serialized with at least 300 ms between starts. A 429 stops queued requests; the existing provider-wide D1 cooldown and Retry-After also stop later jobs and detail reads. A batch's provider work has a 16-second deadline, within the existing 20-second cache lease.
- The public `market-data?overview=1` route reads all canonical caches in bulk, without provider requests. It contains only public observations. It does not look up the visitor's member record or include holdings, addresses or sessions. Authentication and holder-tier checks retain their existing fresh-data requirements.
- Home and Markets share one in-flight browser request. Allowlisted public observations survive navigation/reload in optional local storage (24-hour storage retention). One normal request per minute replaces the 15-page retry waterfall. Returning to the app triggers a refresh without clearing the saved screen.
- Last-good price, liquidity, rolling volume and raw supply remain displayable for up to 24 hours as **Delayed**, matching browser snapshot retention. The original 15-minute display cutoff was too short for the observed production provider outage and the user’s explicit preference to show saved numbers first. This is a display retention policy, not a freshness guarantee. Original timestamps are accessible by tap and keyboard. Old rolling volume identifies its historical window. Expired observations remain saved on the server but are unavailable in current-value UI; they never become zero. Valuation totals, historical totals and holder tiers do not use these display-only fallbacks. Display-only DEX summary cards and issuer activity use the same retained observations as rows, with original observation times and shared pools counted once.

## Costs and limitations

The four-minute cadence trades tick-level freshness for bounded free-provider usage. Fifteen batches imply roughly 135 discovery/enrichment requests over a full normal cycle, plus exact pool requests; these are spread over four minutes rather than triggered per visitor. No provider entitlements or complete-market coverage are promised.

At 15 batches and four source caches, scheduled batch cache leases/writes are approximately 43,200 D1 row writes/day before global sources, circulation, registry, scheduler leases, and user activity. This is a baseline estimate, not measured total account consumption. Keep the existing free plan; monitor quotas rather than enabling paid services. Free-plan CPU limits still apply to real deployed requests. A larger registry or traffic volume requires remeasurement.

Cron registration can take up to 15 minutes to propagate. Existing cache rows remain usable during rollout. If the scheduler fails, read requests deliberately do not start a competing full-universe refresh. Individual detail and security-sensitive verification paths retain their bounded demand reads.

## Verification

`tests/market-scheduler.test.mjs` checks complete four-slot coverage, zero provider calls on cold/stale public reads, FIFO pacing, 429 backoff across batches, preserved timestamps, duplicate-delivery suppression and continued processing after a job fails. Pool tests ensure discovery and detail coverage are retained and failed enrichment cannot silently shrink the saved snapshot.

`scripts/check-market-scheduler-runtime.mjs` exercises the actual Worker scheduled handler and private self-service RPC with isolated Miniflare/D1 and simulated providers. It verifies 1,322-token saved-price coverage, 30 concurrent reads with zero provider calls, and preservation after scheduled 429 failure. The resulting local timings are in `outputs/market-scheduler-runtime.json`; they are not production latency claims.

Local production build, strict types, repository lint and all regression suites passed. Browser checks at 1440×1000 and 390×844 verified one initial overview request, tap-accessible observation timestamps, no horizontal overflow, no uncaught page errors, and 20 visible prices restored after reload with the overview request deliberately failed. Synthetic fixtures were used, not actual market prices. Screenshots and machine-readable results are in `outputs/`.

The isolated scheduled Worker test also verified successful recovery after the simulated 429: a subsequent scheduled refresh published a new pool value and timestamp. Thirty concurrent cached reads made zero external provider requests; local p95 was about 119 ms. This is not a production speed claim.

The user explicitly approved production deployment. Cloudflare version `2b62a53f-bb4d-45ba-a086-97c1c4141edb` was deployed on September 23 with the minute cron and private `MarketRefresh` binding. The public combined endpoint returned HTTP 200 with a 1,021,689-byte complete snapshot in 3.14 seconds on the first check. Live scheduled logs subsequently confirmed all four partition groups executed with no Worker exceptions. DEX Screener still returned HTTP 429 and the Ondo valuation source remained unavailable; scheduled runtime success does not mean every provider refreshed successfully. Prices updated, while the final display correction retained dated pool observations during this outage. The previous production version is `d8581f23-6395-44c4-87d5-7edc03a671de`. Roll back with the previous Worker version if live checks fail; do not disable freshness validation to hide failures.

Official platform references: Cloudflare scheduled handlers and Cron Trigger propagation, service-binding RPC, Workers limits, and DEX Screener endpoint rate limits.

Final production version: `ecc8df1e-f7df-4645-8a33-ee4547fb401c`. All 333 tests and the full build passed again. Desktop/mobile browser checks used 45-minute-old fixtures and retained 20 visible prices after a failed reload. The final public API check returned HTTP 200, 1,013,935 bytes in 3.17 seconds. Live rendered Markets showed current prices and saved DEX volume/liquidity with Delayed labels. This verifies successful deployment and saved-value display, not elimination of upstream delays or instant first-visit loading.

## Follow-up: summary coverage and visual QA

The first release retained rows but still hid DEX summary/issuer activity after five minutes. That left the user’s main screenshot blank despite row recovery; reporting completion without resolving that visible gap was insufficient. The correction uses displayPoolActivity for cards and issuer charts, sharing the existing 24-hour display retention boundary. It selects the newest observation of each shared pool before aggregation and exposes the observation-time range, since rolling windows are not synchronized. It does not write these sums into history or alter portfolio/tier freshness.

Repeated Delayed labels were removed from rows and detail figures. One saved-data notice covers the overview, with accessible per-value info controls retained. Visible-value sorting includes saved values. Four observed historical days remain four; the existing seven-day trend requirement is unchanged. Regression coverage now includes saved headline totals, all issuer bars, restored summaries after failed reload, zero repeated Delayed text, and per-value/aggregate timestamp controls.

Follow-up release `7404a82b-753e-41dc-a4a4-24430d1a2e00` passed the full build and 336 tests. Deterministic desktop/mobile checks passed; desktop summaries and all five issuer rows showed fixture values, while mobile preserved its existing list-first layout with one visible saved-data notice. The deployed Markets page was checked visually in dark mode: DEX volume $148.35M, pool liquidity $57.23M, all five issuer values present in the rendered page, and history correctly retained 4/30 observed days. These are dated display observations, not a guarantee of current synchronized market totals.
