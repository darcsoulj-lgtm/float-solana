# Holder census recovery — 2026-10-03

## Problem

The Oct 2 daily census failed before collection because the public registry returned HTTP 503. There were no transient registry retries and no separate holder recovery trigger. The last successful public count stayed at 222,290 wallets / 69 tokens (Oct 1, 07:14:44.742 UTC), while verified Backpack listings had grown to 71. The market-data watchdog did not cover this independent workflow.

## Implemented boundaries

- The existing private minute scheduler checks the verified, cached Backpack registry every five minutes. It dispatches the existing free GitHub holder workflow when the mint-set hash or token count differs, or the last successful census is at least 24 hours old. Daily scheduling remains a fallback.
- Shared dispatch code uses an atomic D1 lease, checks active workflow runs, bounds network responses and requests, and holds a 15-minute holder retry cooldown. Credentials remain private; no public refresh endpoint or wallet scan runs in Workers.
- The collector retries transient registry network / 5xx failures up to three times. Auth failures and malformed data do not retry. Every mint is reconciled against supply before accepting the aggregate; a registry change during collection rejects the new observation.
- Import checks the published compact aggregate every five minutes and requires the exact current registry hash and token count. Migration reclaims the old one-hour import lease. Failed or incomplete results preserve the prior count and its original observation timestamp.
- The UI no longer flashes the bundled obsolete seed count. It shows the last API-confirmed count, reports changing token coverage or overdue collection, and keeps explanatory detail in the disclosure / methodology page.
- Volume and composition share a single chart: dollar volume and contribution percentage appear together. Actual daily history remains subject to its existing coverage checks; no history is fabricated.

## Runtime evidence

- Full release gate: 647 tests passed, zero failures; strict types, lint and production build passed. Python census suite: nine tests passed.
- The deployed trigger automatically started holder run [37094765669](https://github.com/darcsoulj-lgtm/float-solana/actions/runs/37094765669). Regression checks, reconciliation and aggregate-only publication all succeeded.
- Published and imported Backpack census: **230,904 wallets / 71 tokens**, observed **2026-10-03 03:57:39.223 UTC**. Registry hash: `d8d76fbeec6f76e3b1ed8ceb60dbd75bd7f05ece6f6cc179be3ad31379a6d7cf`.
- Production D1 imported this observation at **04:05:47.060 UTC**. The original source observation time was retained. Existing historical xStocks and Ondo rows were unchanged.
- Final deployment: `d8caab06-1e50-48e1-9494-7ad6327c3d65`; trading and Birdeye collection remain disabled.

Counts are a union of owner wallets with positive tracked-token balances, including pools and exchanges. They are not people. An exact Birdeye discrepancy remains unverified until the comparison page, scope and count are available. External failures can still delay a census; the system retries without relabeling an old observation as fresh.
