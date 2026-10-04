# Empty Backpack external ticker recovery — 2026-10-04

## Confirmed incident

The official all-tickers External endpoint returned HTTP 200 with `[]`; an individual MU External ticker returned 204. Venue tickers remained available. The legacy globals loader treated the empty response plus four venue rows as a successful stock-price refresh, replacing valid external fields with null and a recent collection timestamp. The independent fast collector rejected unusable references but could not protect the legacy writer.

At the investigation snapshot, all 71 external changes were missing. Birdeye turnover remained available for 70 of 71 mints, totaling $19,877,909.39797532; NVDA was still unavailable. The preceding activation snapshot contained the same 70 mints and $77,908,199.1017319. A public Backpack Pulse Birdeye overview snapshot at 00:00 UTC totaled $20,301,168.25723721 across its 27 Backpack rows, compared with Float's refresh beginning around 00:44 UTC. This supports a substantially lower rolling window and rules out an internal coverage collapse; it does not independently audit every trade or certify the provider's total.

## Repair boundaries

- The shared ticker adapter rejects successful empty/non-price external responses. Venue-only data cannot overwrite stock references. Both scheduled paths use this rule.
- Partial successful responses retain omitted symbols with their original observation timestamps.
- A separate per-mint cache contains official Backpack completed, traded hourly closes. It compares an actual close exactly 24 hours earlier; no interpolation, carry bars, unfinished candles, venue returns, or alternate token wrappers.
- The private scheduled collector checks at most four due mints per tick, approximately once per hour per mint when needed. Oldest attempts receive priority, including new registry listings; unsuccessful mints cannot starve other work. Supply/RPC failure cannot block history recovery. Failed requests retain prior observations; a regressed history cannot replace a newer observation.
- Public readers bulk-read existing D1 observations and never call providers. Historical recovery is independent of the legacy GitHub snapshot, so that writer cannot erase it.
- Dated references retain original candle-end times and expire after 96 hours. They are display-only, paired with their own change, and do not manufacture current portfolio values or holder eligibility. Current quotes supersede history.
- The table identifies last-observed references; details show the date and source. Methodology explains basis, cadence and missing-baseline behavior. Publication checks reject blank prices even if collection timestamps are fresh, and validate explicitly dated history separately.

## Evidence

A bounded, one-time official-history recovery returned prices and comparable changes for all 71 canonical mints. Original candle-end times: 65 at Oct 3 00:00 UTC, five at Oct 3 01:00 UTC, one at Oct 2 21:00 UTC. The replay SQL preserves newer cache rows and newer observation times. Recovery JSON contains public token data only.

Release gate: dependency audit (existing reviewed braces patch retained), strict types, repository lint, all 674 tests and production build passed. New regression cases cover empty HTTP success, legacy and fast writers, exact 24-hour baselines, future/expired observations, partial-response ages, read-only fallback, bounded scheduling and fairness. Deployment and rendered/runtime evidence recorded after verification below.


## Production verification

- Final deployed Cloudflare version: `218770ab-0a06-4ae0-b2cb-77f1eece2062`.
- Live public payload: 71 positive prices, 71 comparable changes, all explicitly dated hourly-history references; original observation times remained Oct 2 21:00 UTC through Oct 3 01:00 UTC. Raw payload 350,873 bytes.
- Birdeye turnover remained exactly $19,877,909.39797532 across 70 canonical mints. The unavailable NVDA mint was not manufactured as zero.
- Desktop table and MU detail rendered recovered returns; detail showed -2.21%, original Oct 3 10:00 KST date, and separately dated $376.02K turnover. Mobile 390x844 layout verified; browser warnings/errors absent.
- Historic display preference cannot suppress a newer valid saved quote/supply valuation pair. Original per-symbol observation times also control holder-tier freshness, including when the global cache timestamp is newer.
- Narrow legacy GitHub collector and public-contract repair pushed to main as `f11157a7026a6a13a21d119d7dc120ca3cc5469e`, preserving unrelated files. GitHub Release checks completed successfully. Scheduled collector run was pending at the first verification; its provider refresh completion is not yet claimed.
- Screenshots: `outputs/stock-reference-repair-desktop-2026-10-04.png`, `outputs/stock-reference-repair-mobile-2026-10-04.png`.
- Provider external tickers remain empty. This repair preserves/retrieves dated official observations; it does not turn them into current prices or independently certify Birdeye turnover. Native history refresh is bounded and tested; its next due hourly live run remains to be observed.
