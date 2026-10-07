# Whole-registry volume publication

Owner: Noah. User requirement: refresh every listed Backpack token together; do not refresh RACE alone and blend that result into older totals.

## Decision and data flow

The existing private minute scheduler now collects a durable round for the complete verified Backpack mint registry. Each invocation handles up to twelve requests, paced at 1.1 seconds. Progress never feeds public token rows. At completion a D1 transaction writes one validated round and all compatibility token rows. Public market summaries, the token directory and current Trading activity consume the committed round. Missing observations are neither zero nor replaced with older token values. Existing values remain visible during collection; the migration retains previously saved observations until the first round commits.

A round must finish within 20 minutes and every value must pass the existing 72-hour provider-observation limit. Provider update timestamps can remain older after a successful fresh query; do not impose the five-minute price freshness rule on periodic volume. Old source observations retain their original timestamps and delayed-data disclosure. Each original provider timestamp is retained. This is a bounded collection pass of rolling 24-hour observations, not an exact common historical cutoff. Exact common-cutoff reconstruction would need separate historical queries and a new budget decision.

The reader checks complete mint identity against the current registry. A new listing invalidates the prior scope for current publication, and starts a full new round. Partial, corrupt, over-age, lost-lease and failed rounds cannot publish. A failed round retains the last successful result, with its original timestamps and existing delayed-data disclosure. Provider failures pause the collector; an incomplete round is an operational failure, not a successful partial total.

## Free-budget boundary

Birdeye currently documents 7 CU per price_volume/single request. The earlier implementation assumed 5. The corrected rolling 32-day reservation is versioned and conservatively reweights existing reservations by 7/5 instead of resetting them. Reserve the whole pass before calling Birdeye. The cursor advances under an owner fence before every request, so a crash cannot replay a prepaid request. Failed/reserved calls remain charged conservatively.

74 tokens cost 518 CU per round. A 20,000-CU allocation requires approximately 21 hours between successful passes; the separate stock-comparison allocation remains 8,000 CU. No paid plan or overage was enabled. The schedule automatically lengthens as the verified registry grows. The 20-minute collection limit and 72-hour display limit are integrity bounds, not a claim that an arbitrarily large catalog can remain usable on this allowance.

Primary cost reference: https://data.birdeye.so/docs/guides/what-is-compute-unit-cost

## Validation

Deterministic tests exercise full-round publication, unchanged totals during progress, complete coverage, unsupported/malformed observations, source outages, new listings, corrupt/expired rounds, quota reservation with legacy accounting, concurrency and ownership loss. An isolated real Worker/D1 test completes a staged round, publishes the prepared public response, checks newly listed token inclusion and verifies public reads make no provider requests or reveal secrets. No live provider is used in these tests.

Production evidence is verified separately from these checks.

## Production evidence

- Worker version: `2ec4d249-3ce8-4a75-932e-336f37d461c5`. Full release gate passed: 776 tests, dependency checks, strict types, lint and production/offline-shell builds. Isolated Worker/D1 publication test passed.
- The unpublished first attempt rejected older provider timestamps under an overly strict five-minute check. That check was removed, a regression test was added, and the entire unpublished pass was discarded; its reservation was retained. No partial results were published.
- Complete live round: `b33967cd-545b-4193-af72-c206f342fae0`, 74/74 verified Backpack mints. Collection began 2026-10-07 01:41:47 UTC and completed 01:47:49 UTC, approximately six minutes.
- Public API verified 2026-10-07 01:50 UTC: token-row sum, market turnover and Trading activity each equal $73,372,772.95873609. The actual live dashboard and chart both show $73.37M; the chart shows 74/74 tokens. RACE shows $30.19M in both the token row and chart.
- Next whole pass is scheduled approximately 21 hours after completion. Ordinary page reads do not request provider data.
- Visual evidence: `/tmp/float-all-token-volume-2026-10-07.png`. API/derivation evidence: `/tmp/float-full-round-verification.json`. These local evidence paths are not served publicly or included in provider calls.
