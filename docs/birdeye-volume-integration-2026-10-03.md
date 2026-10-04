# Periodic token turnover — 3 October 2026

Status: activated in production on 3 October 2026 after RJ reported receiving Birdeye public-display approval and authorized the update. The reply itself was not retrieved in the agent-accessible Gmail account; permission is based on RJ’s direct confirmation. Existing encrypted key and free Standard plan retained. All 71 verified mints were attempted; 70 new observations published, NVDA unavailable. No paid upgrade.

## Pre-activation verification

- Existing Standard account: 30,000 CU; 7,480 used before this session; latest credits check: 7,961 used, 22,039 remaining, zero overage. No new credential or account created.
- The 5-CU single endpoint compared against token overview for MU/SPCX/DRAM within nearby timestamps: differences 0–0.014%, not proof of independent accuracy or identical provider windows.
- 71 canonical verified Backpack mints checked; 70 accepted observations total $86,123,226.19. NVDA single endpoint returned null volume; token overview returned 0 with an older trade timestamp. Kept unavailable, not silently converted to zero or replaced with a pool sum.
- Initial one-hour timestamp filter incorrectly excluded nine valid older observations for a periodic product. Accept observations only within the documented 72-hour retention bound, retain original provider time, and mark overdue observations using that time. Never substitute collection time for the provider time.
- Deployment generator now retains the approved enabled setting across UI deployments, with an explicit disabled rollback override. Allocation remains 20,000 CU per rolling 32 days, implying a 14-hour cadence for 71 tokens.
- `wrangler secret put` succeeded and a name-only secret listing confirmed storage; no application deployment. Temporary credential file removed after checking credits.
- Local enabled-mode browser: $86.12M, 70/71 coverage; list/detail MU $5.4M and source timestamp agree. Desktop and 390px mobile verified, no horizontal overflow. Captured data is a local preview, not continuously refreshed data. Only unrelated Ethereum wallet-extension console errors were observed.
- Final full gate: 612 tests passed, strict types, repository lint and production build. Isolated Worker/private binding/D1 runtime passed with synthetic providers, including dynamic listing and no upstream public reads.
- Actual 71-token projected response: 326,363 bytes, under 400KB. Default pool URLs are reconstructed from retained addresses; custom links remain intact. All 1,204 pools remain present.
- Sanitized evidence: `research/birdeye-connection-2026-10-03/`; visual evidence `outputs/birdeye-desktop.jpg`, `outputs/birdeye-mobile.jpg`.

Public-display reference: https://data.birdeye.so/docs/resources/terms and https://birdeye.so/data-api/terms-of-service . The API documentation links the same restrictive terms; no supplemental permission was located. RJ subsequently reported receiving the requested approval.

## Decision and evidence

The comparison site's public `/data/bundle.json` identifies `volume-compare.json` as “Birdeye token overview only”, with `cache_ttl: 86400`. Its volume timestamp and prices timestamp differ. Matching its displayed number is not an accuracy test, and its data is not our upstream feed.

Official documentation now confirms `/defi/price_volume/single?address=<Solana mint>&type=24h` costs 5 CU and is available on Standard. Standard includes 30,000 CU and 1 request/second. At 69 tokens, twice daily for 31 days costs 21,390 CU before failures and other use; 71 tokens cost 22,010. Hourly or two-hour collection of every token does not fit. The site's token count can change; do not hardcode 69.

- https://data.birdeye.so/docs/data-api/price-ohlcv/get-defi-price-volume-single.md
- https://data.birdeye.so/docs/guides/payment/pricing.md
- Prior audit: `research/volume-coverage-2026-09-23/BIRDEYE-DECISION.md`

The earlier audit found endpoint/window/filter differences, including an 8.67% sampled transaction/chart discrepancy. This integration reports a named provider's token turnover; it does not claim independent USD verification, all-venue completeness, or resolution of those differences. It must first compare this cheaper endpoint with token overview for MU, SPCX and DRAM using exact mints and nearby timestamps. Provider permission inquiry was authorized and sent on 3 October 2026; no paid upgrade was authorized or performed.

## Boundaries

- Private scheduled Worker service reads the canonical verified Backpack registry; new listings participate automatically. No new registry, per-visitor upstream request or public refresh endpoint.
- At most four due mints per cron tick; sequential calls separated by at least 1.1 seconds. A 120-second database lease coalesces overlapping ticks. Initial population is gradual (approximately 18 ticks for 71 tokens).
- A reservation is atomically charged before each attempt, including errors. At most the configured budget (maximum 24,000 CU) in any 32 UTC-day buckets. Cadence grows with token count and reserved budget. This bounds THIS integration, not other applications using the Birdeye account; activation requires checking available account credits and allocating an appropriate budget.
- Each cached observation retains exact mint, provider observation time and collection time. Invalid/missing/negative/nonfinite/future/older-than-72-hour provider responses are rejected. Explicit zero is retained as provider-reported zero, never interpreted as independently verified absence of all trading.
- Token-specific errors preserve the last good value and defer only that token. Provider-wide failures (authentication, quota, transport) pause collection for 12 hours. Display can retain an observation for up to 72 hours with original time. Missing/expired values are unavailable, never zero. Authentication and quota outages therefore cannot turn every row into zero or start a retry storm.
- Token list, sorting and detail use one selection rule. In Birdeye mode, missing token data does not silently fall back to a differently scoped pool total. Pool evidence remains available separately.
- Dashboard label becomes “Token turnover · 24h”: sum of available token observations, explicitly not unique market-wide volume. Stock-to-stock trades may occur in two token totals. Never add Birdeye and pool-source figures.
- Prices, percentage changes, minted value, wallet access and trading execution remain independent.
- Canonical rows retain all timestamps; the public projection omits only a pool timestamp identical to its enclosing source timestamp. No pools are truncated.

## Activation prerequisites

1. Securely register `BIRDEYE_API_KEY`; do not put it in source, logs or chat.
2. Verify Standard access, account credits, display terms and near-simultaneous lightweight/overview sample responses. Capture sanitized response timestamps and fields, not secrets.
3. Set `BIRDEYE_VOLUME_BUDGET_CU` to the verified allocation (at most 24000) and `BIRDEYE_VOLUME_ENABLED=1` only after that check. Missing key/flag/budget disables all new API calls and leaves the existing display intact.
4. Complete enabled-mode desktop/mobile visual checks with actual observations, check the live public payload remains under 400KB, then deploy and verify collection/publication and source timestamps. No activation inferred from adding a key alone.
5. Monitor scheduler status in private `market_cache` key `birdeye-schedule:v1` and usage keys `birdeye-usage:v1:*`. These never enter public JSON.

## Verification

- Ten behavior tests cover parser, genuine zero vs missing, rolling budget concurrency/month boundaries, adaptive cadence, identity/expiry, no scope blending, disabled mode, provider errors and cache continuity.
- `scripts/check-birdeye-runtime.mjs`: real isolated Worker/private service/D1; synthetic provider. Verifies a newly added registry token, publication through the actual public route, two no-store responses, absence of secrets, and no upstream calls during public reads. Output: `outputs/birdeye-runtime.json`.
- Full release gate and existing-mode browser smoke checks recorded in the task. Live comparison and enabled-mode visual QA are recorded above. Production activation evidence is appended after verification.


## Provider clarification sent — 3 October 2026, 08:37 KST

To: bds@birdeye.so
Subject: Standard API permission for public token volume display

We operate Float (https://joinfloat.xyz), a free community and market dashboard for Backpack tokenized stocks. May we use the Standard API to cache and publicly display per-token 24h USD volume from `/defi/price_volume/single`, with Birdeye attribution and original timestamps? We would refresh 71 verified mints about every 14 hours within the free allowance. We would not resell API access. Please confirm whether this public display and caching is permitted under section 10.2.3, and any attribution or retention requirements.

Sent via the existing Google account in Mail and verified in Sent. The sent message also specifies latest-observation retention up to 72 hours with original timestamps and delayed-update labels, and that public display has not been enabled. Screenshot evidence: `/tmp/float-birdeye-inquiry-sent.png`. No API key, wallet data or private logs were included.


## Production activation — 3 October 2026, 20:09 KST

- Worker version `8d697c19-7fc6-47e9-b756-651e7d14a1fe`. Approved enabled flag persists through future UI deployments; explicit `FLOAT_BIRDEYE_VOLUME_ENABLED=0` remains the rollback option. Trading stays disabled.
- Before activation, the live account portal confirmed Standard, 30K CU/month, 1 RPS, no overage and $0 billing, with approximately 7.96K used. Kept a 20K CU / rolling-32-day integration allocation and adaptive 14-hour cadence at 71 tokens.
- Seeded 70 previously validated observations after exact current-registry mint validation, retaining their original provider and collection times. Reserved 405 CU for initial prior work. All seeds were immediately due for scheduled refresh.
- Actual private production cron then attempted all 71 mints and replaced all 70 valid rows with newly collected responses. NVDA remained unavailable rather than zero. This pass reserved another 355 CU. Final scheduler status: `ok`. No credentials were extracted or exposed.
- Two sequential public GETs: HTTP 200, valid JSON, `no-store` on cache HIT, no Set-Cookie, approximately 341KB, no private collector or session fields. Both snapshots reported 70/71 tokens and $77,908,199.10 token turnover. All 70 collection times followed activation; oldest provider observation was about 4.67 hours old. This is provider-reported turnover, not an independent all-trade audit.
- Desktop and 390px mobile: summary and graph both $77.91M; no horizontal overflow. MU list/detail both $4.43M with Birdeye attribution and original source timestamp. Holder and public community routes remained HTTP 200. Methodology identifies the active primary source and separates pool cross-checks.
- Corrected daily history keys so today’s immutable pool snapshot cannot block a new turnover snapshot. Both bases remain separate. The same-day switch is covered by a behavior test; production turnover history will be captured by the existing hourly job after eligible source observations are available. Existing pool history was not overwritten or relabelled.
- Full release gate: dependency security, strict types, repository lint, 655 passing tests, production build. Isolated Worker/D1 collection/publication test uses synthetic providers and is separate from the real production cron evidence above.
- Evidence: `outputs/birdeye-activation-api.json`, `outputs/birdeye-activation-desktop.png`, `outputs/birdeye-activation-mobile.png`.
