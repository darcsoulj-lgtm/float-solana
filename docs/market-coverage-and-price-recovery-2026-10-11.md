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

## Validation

The complete local release gate passed: dependency/security checks, typecheck, lint, 788 tests, production build and eight offline public shells. Isolated Worker/D1 integration passed both complete and explicit-missing catalog publication; public reads made no provider calls and exposed no secrets. This is synthetic integration evidence, not live-provider verification.

Production deployment and complete-catalog recovery evidence will be recorded after verification. A repaired round proves recovery; future naturally scheduled operation must still be observed separately.
