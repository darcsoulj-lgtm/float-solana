# Float live check — 9 October 2026

Owner: Noah. Checked production APIs, derived display values, GitHub workflows and loaded Markets UI around 20:07–20:17 KST.

## Verified data

- Current catalog: 74 Backpack tokens. Every price, 24-hour change, supply and Birdeye volume is available. The latest complete volume round is `02b711dd-8b40-41a8-8625-8d5504c0350a`; dashboard, individual-token sum and current Trading activity all equal $71,986,485.34210879. Preserve the original rolling provider timestamps; this is a complete query round, not a common historical cutoff or a live tape.
- Holder census: 264,665 unique wallets across 74 tokens; observed 9 October 16:27 KST, matching the verified registry hash. New listings remain included through the existing scope-change trigger.
- Latest fetched 24-hour history: 99 successful market collection jobs and 100 successful publication checks, with no failed runs in those pages. An additional market collection was running at the start of the check.
- Found one current fault: stock comparison still showed the 7 October New York day. Today's scheduled stock job had not started by 20:07 KST. Health run `37910185290` explicitly failed with `stock_comparison_overdue`. Price and whole-catalog volume collection were not the cause.

## Recovery and recurring repair

Manually dispatched the existing stock workflow as run `37922260562`. Collection and its independent publication check both passed. Production now serves the 8 October New York day, ending `2026-10-09T04:00:00Z`, with all five selected rows (SPCX, MU, TTWO, RACE, IBM) available. `/api/health` returned HTTP 200, `ok`, no issues and 74/74 source coverage after this recovery.

Add the existing stock workflow to the private Cloudflare minute-scheduler recovery boundary. After its normal 06:30 UTC data-ready time, check the canonical published NY-day endpoint directly in D1 every five minutes. Request `stock-volume.yml` on main only when the latest completed NY day is missing. Existing GitHub running-state checks, D1 owner-fenced lease, workflow concurrency and OIDC identity gates remain intact. The stock job continues to own provider quota reservations and publication validation; this trigger does not call Birdeye or Alpaca and never updates a source timestamp.

Allow at most two recovery dispatch attempts per completed NY day, including ambiguous POST outcomes. A 15-minute dispatch cooldown and active-job checks prevent duplicates. Persistent provider or quota failure cannot produce unlimited recovery workflows/emails. New days get separate attempt accounting; existing daily and rolling provider caps remain unchanged. Completed days do not consume more provider calls. Public readers never dispatch jobs. A failed stock trigger cannot skip price, whole-catalog volume, holder or public snapshot work. Existing GitHub schedules remain fallback triggers.

## Validation before deployment

Full release gate passed: 783 tests, strict types, repository lint, dependency security, production build and eight offline public shells. Six new behavior tests cover date grace, summer/winter NY boundaries, corrupt/missing data, future timestamps, concurrent ticks, queued jobs, bounded ambiguous failures, next-day retry and completion stopping recovery. The real Worker scheduler test covers stock dispatch failure isolation. An isolated real Cloudflare WorkerEntrypoint RPC/D1 test with fake GitHub responses dispatched once, then cooled down; six GitHub fixture requests, zero market-provider calls and one stored recovery attempt.

The successful manual workflow restores today's data; it does not prove tomorrow's automatic delivery. Post-deployment trigger execution and a later naturally due NY-day collection must be recorded separately. GitHub runners and external providers can still fail; this change addresses delayed schedule delivery, not all possible outages.
