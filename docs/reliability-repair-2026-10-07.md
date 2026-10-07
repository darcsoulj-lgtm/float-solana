# Daily collection and publication repair

Owner: Noah. Scope: stock comparison retries, bounded free quota, publication completion, and monitoring.

## Verified causes

- Oct 6 stock collection reserved two 200-CU passes on code pushes. The later schedule was rejected by our own 400-CU/day guard. Production D1 confirmed the 400-CU reservation.
- Two public verification runs expired after seven reads while imports progressed from hundreds of missing observations down to the catalog and RACE. The importer intentionally processes at most ten chunks each minute; the checker used a fixed six-minute wait.
- Core market health did not include the stock comparison.
- An Oct 7 live recovery found another failure: RACE's unavailable prior-day history bypassed the old sleep. The next Birdeye request returned HTTP 429. Source logs distinguish this from the earlier local quota denial.

## Changes

- Code pushes run stock collector unit tests without spending provider quota. Both existing schedule ticks collect only if the completed New York day is missing, then verify it.
- Signed run ownership, a 40-minute lease, and transactional reservations prevent duplicate begins from spending another allowance and fence competing collectors. Completed days skip provider requests. Failed runs cannot overwrite a successful run's state.
- Every Birdeye request is paced, including unavailable histories. One transient retry needs an additional idempotent 40-CU reservation before it runs. Hard limits remain 400 CU/completed New York day and 8,000 CU/rolling 32 days, alongside the existing separate 20,000-CU regular collection allowance. Failed requests are counted conservatively.
- Public verification uses the same ten-chunk batch size as the importer. Its bounded attempts scale with manifest size, up to thirteen reads; observation freshness and value validation are unchanged.
- Stock comparison failures appear in public health and private incidents. Public responses expose only attempt status and timestamp, without private lease or reservation details.
- Compatible sharp 0.35.5 and MCP SDK 1.31.0 overrides address newly reported advisories. Existing reviewed braces mitigation remains verified.

## Validation and boundaries

The complete local release gate passed 771 tests, dependency security, types, lint, production build and eight offline public shells. Production version a11124b2-eb68-402b-ac4a-28b0865bb1f9 was deployed. Live recovery 37554198443 and its independent verification succeeded: the Oct 5 New York window was published. RACE lacks history for that window and remains explicitly unavailable (4/5 comparisons). Public publication check 37554116066 passed. The live Markets page shows Oct 5 comparisons; dashboard and activity both show $53.66M with 74/74 tokens. Existing past workflow failure emails remain in GitHub history. Schedule dispatch can be delayed by GitHub; provider outages and quota exhaustion remain visible failures rather than invented fresh data.

Reservations are keyed to the completed comparison window, avoiding a morning recovery consuming the later scheduled window's daily allowance. Legacy UTC counters remain in the rolling sum; no used quota is erased.
