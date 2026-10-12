# Market update check — 12 October 2026

## Live findings

At approximately 19:23 Korea time, all five public market, health, holder, stock-comparison and activity endpoints returned HTTP 200. Health reported 74 reference prices, 73 valid changes, 74 supplies and 73 token-volume amounts across 74 tracked tokens. The browser displayed new prices and percentage changes, and values changed again while the same page remained open. A stopped production price feed was not reproduced.

The primary Backpack feed was checked at 19:21 KST and continued updating. Two retained hourly references (FLWS and PTN in the checked snapshot) remained dated 10 October because they were missing from the current source response. PTN still lacked a valid return baseline. Retained values keep their actual source date; a recent fetch does not turn them into live quotes.

The next natural whole-catalog volume pass completed on 12 October at 08:27 KST. Its ID is `d181c048-620c-496d-b355-1bb1fdeba745`. It published 73 values totaling `$53,521,093.22885907` and an explicit NVDA absence. That same total is recorded in activity history. Its newest provider timestamp falls on 11 October UTC, so that source-day label is correct despite the Korean collection date. The next budget-derived pass is due around 13 October 05:27 KST. RUM's provider observation remained older than the nominal cadence despite a successful current collection and is disclosed as delayed.

Supplies were checked between 19:11 and 19:17 KST. Backpack holder count updated to 286,833 at 16:31 KST, with 74 verified tokens. Daily stock comparison was published at 15:30 KST for the completed 11 October New York day. Weekend stock closure is distinguished from a missing stock observation.

## Resume handling

The shared market hook already refreshed on timers, visibility, focus and reconnect, but had no explicit `pageshow` listener. Add and clean up that listener so restoration from a browser back/forward cache can wake the normal request path. Existing throttling and in-flight deduplication remain intact. This is a targeted browser-resume improvement, not a confirmed explanation of the user's unreproduced stale screen. No source timestamps, amounts, cadence or missing-data policy changed.

A behavior test verifies fresh retrieval after a suspended page is restored, no hidden-page request, no duplicate simultaneous wake requests, and listener cleanup after unmount. The full release gate passed 791 tests, dependency/security checks, types, lint, production build and eight offline public shells. Actual iOS standalone behavior still needs device verification.

## Remaining observation

Publication-check run `38226718614` failed earlier because its public response exceeded the 400 KB monitor threshold. Later publication runs succeeded, and the checked response was 396,143 bytes. This check has little size headroom; no threshold was raised, no data discarded and no unrelated payload redesign was included in the resume change. Provider fallback/catalog wrappers also retain older observations when their source is unavailable, while the primary reference and supply consumers continue using independently verified current data.
