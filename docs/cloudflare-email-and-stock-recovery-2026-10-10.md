# Cloudflare email and stock comparison recovery — 10 October 2026

Owner: Noah. Scope: investigate CPU emails, verify current production, repair repeated stock-collector failure without a paid subscription.

## Evidence

The newest Cloudflare CPU warning in the connected Gmail account and the current Chrome inbox is dated 2 October, 23:35 KST. It reports 1,000+ account-wide CPU terminations, without naming a Worker. Cloudflare GraphQL analytics for the actual preceding warning window (1 October 14:35 to 2 October 14:35 UTC) identify Float: 1,454 exceeded-resource invocations and 497 script exceptions. This is a real historical incident, not a new warning.

For 9 October 13:00 to 10 October 13:00 UTC, Cloudflare GraphQL reports 21,902 Float invocations, all successful, zero errors. A separate bounded live tail captured 58 invocations, all successful. CPU exceeded the documented 10ms free-plan budget on some successful calls (market API maximum 30ms, prepared snapshot maximum 59ms); occasional burst success and one healthy day are not a capacity guarantee. Existing build-time public shells and bounded background work remain in place. Do not mute CPU warnings or claim permanent CPU headroom.

Today's actual failed emails are GitHub stock-comparison and health checks. The private scheduler dispatched at 06:33:31 and retried at 06:49:30 UTC, so automatic delivery is proven. Both failed with `Stock tape does not reconcile`. The scheduled 12:52:54 run then failed with HTTP 429 from Float's own reservation endpoint: the two 200-CU passes had consumed the day's conservative 400-CU reservation, even though collection stopped during the first selected stock. This is not a Cloudflare CPU failure or proof of a Birdeye provider quota rejection.

At approximately 13:21–13:32 UTC, separate credentialed stock-only reads reconcile all five currently selected stocks for the 9 October New York day. SPCX: 1,060,975 eligible trades and 93,125,079 shares, exactly equal to its daily bar; sum(price × shares) $15,182,006,273.1595. MU $20,607,803,189.7927; IBM $761,140,496.3206; RACE $106,367,490.3613; QUBT $37,318,662.2314. These reads were diagnostic, not a publication or a token-volume replacement. The earlier generic failure logs lack actual mismatch counts; source correction/aggregation convergence is a plausible explanation, not proven historical causality.

Current market verification: 74 tracked tokens, all prices and 24h changes available in a freshly fetched response. Dashboard, list sum and latest Trading activity agree at $44,917,210.47870769, from the same complete 74-token round completed 9 October 17:07 UTC. The configured 21-hour interval makes its next whole round due approximately 10 October 14:07 UTC. Holder census shown in the browser is 271,533 and dated about six hours earlier. The stock comparison alone remains delayed until successful recovery.

## Repair boundaries

- Reconcile all five selected US stock tapes before any Birdeye historical request. A stock failure no longer causes a historical-token request to be repeated unnecessarily.
- Read each daily stock bar after the final trade page, avoiding comparison with a bar captured before a long tape download. Preserve exact share/count equality, original source timestamps, fixed NY-day boundaries, condition/correction filtering, pagination and closed-market checks.
- Retry only a stock-tape mismatch once, after 30 seconds, by re-reading the same complete stock day. Persistent mismatch, wrong identity, unknown conditions, bad boundaries and incomplete pages fail closed. Safe logs report symbol/date and exact shares/count mismatch, never keys or raw tapes.
- Separate automatic recovery dispatches by three hours, retaining two automatic attempts per NY day and active-run/concurrency/owner checks. This leaves the later retry able to observe source convergence instead of burning both opportunities within fifteen minutes.
- Permit at most three 200-CU passes per NY day (600 reserved CU), with the existing 8,000-CU rolling 32-day stock cap unchanged. The regular whole-catalog lane stays separately capped at 20,000 CU. This leaves one bounded later/manual repair slot; it does not reset old counters or bypass the 30,000-CU free allocation. More repeated failures can still exhaust the rolling cap and must be reported.

No provider credentials are published, no account settings are changed, no service purchased, no failed validation suppressed and no missing volume filled with zero. Stock-only diagnostics do not replace historical Birdeye volume.

## Validation

Local validation passed: 16 Python collector tests, 17 focused reservation/trigger tests, and the full release gate (dependency audit, typecheck, lint, complete test suite, production build and eight offline shells). Deployment and real production collection remain to be verified. A successful manual repair proves recovery, not the next naturally scheduled day.

Sources: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/ ; https://docs.alpaca.markets/us/docs/market-data-faq
