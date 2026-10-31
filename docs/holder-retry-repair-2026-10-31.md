# Holder collection incident, 31 October 2026

The complete 89-token census remained at 29 October 17:48 UTC. Failed scans retained the prior complete count, but discarded per-mint failure reasons. The minute Worker scheduler dispatched another full census approximately every fifteen minutes whenever that old observation remained overdue. This produced repeated failed-workflow notifications without improving diagnosis.

Keep the existing collection boundary: the free GitHub runner reads the verified registry and public Solana RPC, publishes aggregate counts only, and the Worker imports a matching complete observation. Do not weaken supply reconciliation, publish partial owner unions, change freshness timestamps, or alter provider budgets.

Changes:

- Log the public mint and failing stage with a bounded internal reason or exception class. Record RPC numeric error/HTTP codes, distinguish supply changes from balance mismatches, and report unresolved mints after the existing bounded retries. Never log owner accounts, endpoint URLs or upstream response bodies.
- Isolate malformed after-scan records to their mint, allowing valid observations to survive until retries finish. A remaining failure still prevents publication.
- Permit at most two authenticated recovery dispatch attempts per UTC day, spaced six hours apart. Count ambiguous POST outcomes. Running/queued jobs consume no allowance. The existing daily scheduled census remains enabled and freshness rules stay unchanged.

Validation uses fake RPC providers and isolated SQLite. Verify actual recovery from the next normal scheduled census and matching public import; passing tests is not proof of a repaired upstream observation. Birdeye rolling-budget exhaustion and stale stock ranking inputs are a separate incident and remain subject to the user's unchanged-budget, scheduled-recovery instruction.

## Confirmed upstream failure and repair

The first normal scheduled run with diagnostics, `41157778697`, showed SPCX (`SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb`) exceeding the collector's 120 MB buffered-response limit on all three attempts. Supply changes in other mints recovered on retry; SPCX was the sole unresolved mint.

Stream the account array instead of materializing the entire RPC JSON. Retain account identity/state checks, duplicate-account rejection, owner union and before/after supply reconciliation. Bound individual JSON records to 256 KiB, the total response to 1 GiB and the account count to two million. Only aggregate owner sets remain in memory; no address artifacts are published. A generated valid response over 120 MB and malformed/truncated/duplicate/oversized fixtures exercise these boundaries. The 120 MB cap remains for ordinary small RPC methods.

Before this collector-only repair, the Worker retry limit and dependency updates passed 810 application tests, strict types, lint, the dependency audit and the production/offline-shell build. Deployment `b6c9a51c-df98-4299-8046-3127eb6f4fd6` was confirmed via the live source fingerprint. The operational dispatch ledger recorded one attempt at 01:57 UTC and a six-hour retry delay. No Birdeye budget was changed or extra metered provider run initiated.
