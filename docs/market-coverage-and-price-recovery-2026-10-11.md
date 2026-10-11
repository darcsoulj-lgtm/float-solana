# Market coverage and price recovery — 11 October 2026

## Confirmed failures

Birdeye returned a successful response for the verified NVDA mint with an explicit null volume. The existing collector checked 74 tokens but refused to publish the 73 reported amounts, then applied its 12-hour failure cooldown. The last published whole-catalog volume remained visible. No paid-provider or Cloudflare capacity exhaustion was established.

Backpack's external daily ticker endpoint returned an empty array. Official hourly reference histories were present, but a later expired ticker displaced the genuine historical close and its matching 24-hour return. This left changes blank and tokenized value partial. The health monitor's wider live-price age rule did not match the screen.

## Repair contract

- A catalog pass records an outcome for every verified mint: a validated numeric volume or an explicit provider absence. These outcomes publish together in one D1 transaction.
- A successful response with explicit null volume, a valid provider timestamp and matching identity is `not_reported`; HTTP 404 is `not_indexed`. Timeout, authentication, rate limit, malformed response, identity mismatch and stale numeric observations still block publication.
- Missing amounts are excluded and disclosed as coverage. They are never zero and never replaced with that token's previous amount. A wholly unavailable catalog cannot produce a numeric total.
- The same snapshot feeds dashboard, Trading activity and token rows. Private staging is not public; CU reservations and the existing budget-derived cadence remain intact.
- Once a ticker exceeds the shared five-minute live-price gate, a usable official hourly close and its actual 24-hour baseline can become the displayed reference. Their original observation date and historical basis remain attached. Corrected empty hourly candles cannot retain a superseded reference.
- Dated reference prices can support display-only estimated value with verified supply, within the existing 96-hour historical limit. They cannot qualify holder tiers or portfolio balances as a current price.
- Health checks use the same five-minute live and 96-hour historical gates, report usable price/return coverage, and distinguish a checked source coverage gap from a failed collector. Genuine expiry remains an incident.
- A newly checked volume pass records history immediately on publication. Recording freshness uses the verified round's collection boundary; the original provider times still set its source day. A later pass can update disclosed coverage even when the latest provider timestamp is unchanged. Hourly recording remains an idempotent fallback. This prevents one delayed provider timestamp from silently freezing history.

## Validation

The complete local release gate passed: dependency/security checks, typecheck, lint, 789 tests, production build and eight offline public shells. Isolated Worker/D1 integration passed complete and explicit-missing catalog publication, including the history persistence hook; public reads made no provider calls and exposed no secrets. This is synthetic integration evidence, not live-provider verification. GitHub Release checks passed on repair commits `2b08657dbeb9638d79e1991ceaca99fc296a1ba4` and `bb9a69d5012e0e80e82a9c57ce6dcfb792ded441`.

## Production verification

Worker deployment succeeded; final version is `a32e65f6-974e-4e71-a408-ea60d6917567`, fingerprint `5a6c97eaf1bdbb29fe3c94134eb38151a248a2477ddfb798a909d6fe355a9441`. The ordinary minute scheduler completed the genuine 74-token pass `c0e36038-3fd3-4115-86ad-504a26abb0e3` between 02:15:22 and 02:21:19 UTC. It published 73 amounts and one explicit NVDA absence. The public dashboard, chart and sum of token rows all reconcile exactly to `$53,106,596.53875034`; no prior NVDA amount is included. Budget-derived collection remains approximately every 21 hours, within the existing 20,000-CU allocation.

Public references show prices for 74 tokens and matching, mathematically verified dated changes for 73. PTN has no valid historical return baseline and remains unavailable. Tokenized value includes all 74 tokens and is an estimate incorporating dated reference prices and fresh supply, not a live stock-price claim. Holding-wallet count remains 271,533 for the verified 74-token registry. The stock comparison remains the verified 9 October New York day, currently within its daily publication schedule.

The completed recovery pass preceded deployment of its history hook. The repaired persistence function ran once against genuine cached production data (no provider requests), recording the 11 October observation with 73/74 coverage and its original provider times. No missing historical day was reconstructed. Future completed passes record through the private Worker service; the isolated integration verifies that path. The public activity API returns the matching recorded amount.

The next natural five-minute health execution at 02:25:17 UTC returned HTTP 200, `status:ok`, no incidents, and actual coverage `{references:74,changes:73,supplies:74,volume:73,tracked:74}`. The two provider gaps remain explicit warnings. Monitoring state was not manually changed. Independent public publication check run `38104636167` also passed after the reference repair. Browser hydration confirms the same volume/coverage, prices with original dates, visible percentage changes, daily comparison and holding-wallet count. Screenshot: `/tmp/float-oct11-recovered-desktop.png`.

A repaired scheduled round proves this recovery; the next approximately 21-hour catalog pass and future daily comparison runs are separate operation evidence and have not yet occurred.

## Historical gap recovery

A follow-up check found the preserved public 9 October whole-catalog snapshot. All 74 verified mint identities, values, original provider times and collection boundaries passed the production snapshot validator. The original `$44,917,210.47870769` total was inserted only into the absent 9 October turnover history row, with original `collectedAt` and source dates preserved. Current market data was unchanged. The Worker history endpoint confirmed 74/74 coverage and the exact total; the main-domain history cache can retain its preceding response for up to five minutes.

The 9 October gap came from history rejecting the entire checked catalog because its oldest individual provider timestamp exceeded the recording age gate. The 10 October staged pass contains 73 values and no completed 74-mint publication: NVDA absence blocked the former collector. No 10 October history point was invented from that incomplete pass. The already-deployed publication and persistence fixes address both failure boundaries.
