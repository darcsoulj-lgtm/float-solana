# Holder collection incident, 31 October 2026

The complete 89-token census remained at 29 October 17:48 UTC. Failed scans retained the prior complete count, but discarded per-mint failure reasons. The minute Worker scheduler dispatched another full census approximately every fifteen minutes whenever that old observation remained overdue. This produced repeated failed-workflow notifications without improving diagnosis.

Keep the existing collection boundary: the free GitHub runner reads the verified registry and public Solana RPC, publishes aggregate counts only, and the Worker imports a matching complete observation. Do not weaken supply reconciliation, publish partial owner unions, change freshness timestamps, or alter provider budgets.

Changes:

- Log the public mint and failing stage with a bounded internal reason or exception class. Record RPC numeric error/HTTP codes, distinguish supply changes from balance mismatches, and report unresolved mints after the existing bounded retries. Never log owner accounts, endpoint URLs or upstream response bodies.
- Isolate malformed after-scan records to their mint, allowing valid observations to survive until retries finish. A remaining failure still prevents publication.
- Permit at most two authenticated recovery dispatch attempts per UTC day, spaced six hours apart. Count ambiguous POST outcomes. Running/queued jobs consume no allowance. The existing daily scheduled census remains enabled and freshness rules stay unchanged.

Validation uses fake RPC providers and isolated SQLite. Verify actual recovery from the next normal scheduled census and matching public import; passing tests is not proof of a repaired upstream observation. Birdeye rolling-budget exhaustion and stale stock ranking inputs are a separate incident and remain subject to the user's unchanged-budget, scheduled-recovery instruction.
