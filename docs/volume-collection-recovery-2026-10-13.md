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

Worker version `f6cb8560-3921-4923-b3d2-3513be3d5315` deployed. One conditional update released only the observed obsolete incomplete-round cooldown; failed status, staged data, budgets and health were left intact. The ordinary scheduler completed replacement pass `0d6007c6-02ca-4f59-8a4a-6770773f40fd`, from 01:05:29 to 01:17:30 UTC (10:05–10:17 KST), with 75 numeric outcomes and no pending listings or explicit absent outcomes. Public market and persisted activity responses switched to that completed pass. RIOT is included at $2,072,715.54. NVDA now has a provider-reported $45.82 observation, originally dated 12 October 12:03:29 UTC; its old provider time remains intact.

At 01:18:56 UTC, replay of the actual captured public response through the display functions verified 75 registry tokens, 75 prices, 75 price changes and 75 supplies. Dashboard turnover and the latest persisted trading-activity observation both equal $53,508,849.31513488. The individual activity-token sum agrees within floating-point arithmetic. The live hydrated Markets page shows $53.51M in both panels, 75/75 coverage, and RIOT in the top-five breakdown. Screenshot: `/tmp/float-oct13-volume-recovered.png`. Existing missing historical dates remain visible gaps rather than invented observations. This is one naturally scheduled production recovery, not proof of sustained future operation.

The ordinary 01:20:23 UTC health evaluation cleared all volume/collector alerts and reports 75/75 references, changes, supplies and volume. Its only remaining issue is `snapshot_payload_large`; overall health remains degraded/HTTP 503 for that separate capacity guard. No health row or success status was manually rewritten.

## Separate outstanding capacity issue

The ordinary public response is approximately 404KB, over the unchanged 400KB publication/health warning guard. HTTP reads continue to succeed. The final three attempts of publication job `115079231191` failed solely on `Public market payload exceeds 400KB`; the earlier propagation mismatches cleared. This is separate from recovered volume collection, remains actionable, and is not suppressed by raising the threshold or discarding observations. The six-hour monitor must continue reporting materially changed or overdue recovery, while avoiding duplicate unchanged notifications.
