# Volume collector recovery — 13 October 2026

## Confirmed failure

A new verified RIOT listing expanded the Backpack registry from 74 to 75 mints. Public volume validation rejected the previous completed 74-mint catalog entirely. The replacement private pass advanced through all 75 requests but retained only 71 numeric outcomes; BULL, MGM, RACE and RIOT had no persisted outcome. It entered the existing 12-hour incomplete-round cooldown. The previous collector had no budgeted retry path for a cursor hole, so an interrupted or failed request could not be repaired within its pass. The original individual failures were not recorded, so their transport/runtime cause is unconfirmed.

A bounded diagnostic probe reserved 28 CU before checking those four mints. All four returned valid, current numeric volumes. Existing total usage was about 8,771 reserved CU before that probe; no usage counters or provider budget were reset.

## Repair

A previous completed catalog remains readable after strictly additive verified listings, with original values and source/collection dates. Newly added symbols are pending and excluded from sums; coverage includes the expanded registry. Every outcome in the published mint set is still validated, and omitted/damaged published outcomes or removed/changed identities fail closed. New listings bypass the old catalog's normal due time and trigger a complete replacement pass, with its entire request cost reserved first. Private staging never feeds public amounts.

The collector now explicitly repairs attempted mints without persisted outcomes. Every extra request reserves seven CU before contact and persists its retry counter before the request. Each mint receives at most two retries. Transient failures back off one minute; authentication errors, exhausted retries and exhausted budget retain the longer cooldown. Exhausted budget makes no provider request. Six requests per private scheduled invocation reduce per-invocation work while preserving the existing 20-minute coherent collection boundary and 21-hour whole-catalog cadence. Lease ownership and expiry fence progress, publication and terminal status writes. No unavailable amount becomes zero or inherits a previous token's amount.

The metric help text identifies pending listings. Methodology reflects these retry and registry rules. The owner requested a six-hour heartbeat monitor; `float-data-health-check` is active and remains quiet while healthy or unchanged. It reports actionable changes and does not call metered providers.

## Validation and production evidence

The full release gate passed 797 tests, security/dependency checks, strict types, lint, production build and eight offline public shells. Behavior tests cover transient recovery, crash-created cursor holes, bounded retry counts and CU reservations, budget exhaustion, new-listing preservation and immediate replacement, persistent failure, changed identities and expired leases. Isolated Worker/D1 integration verified a pending new listing preserves the prior catalog and that completed/missing-outcome publications switch atomically; public reads called no provider and exposed no secrets.

Worker version `f6cb8560-3921-4923-b3d2-3513be3d5315` deployed. One conditional update released only the observed obsolete incomplete-round cooldown; failed status, staged data, budgets and health were left intact. The ordinary scheduler started replacement pass `0d6007c6-02ca-4f59-8a4a-6770773f40fd` and collected its first 12/75 outcomes. Completion, public reconciliation and rendered verification remain required before declaring recovery complete.
