# Backpack 24-hour price-change units

Owner: Noah. Scope: reference-return normalization and cache compatibility. No changes to trading or pool turnover.

## Confirmed cause

Backpack's `priceChangePercent` field contains a fractional return. The adapter passed it unchanged into percentage-point formatting. Thus 0.042086 was shown as +0.04% rather than +4.21%. An earlier fixture incorrectly used 1.5 as an input representing 1.5%, so it did not detect the provider-contract mismatch.

One ordinary external ticker GET on 2026-10-02 independently compared all 1,183 returned rows with positive first/last prices. No comparable row differed from `(lastPrice / firstPrice - 1) * 100` by more than 0.00011 percentage points after multiplying the provider field by 100. Recorded examples: MU 1062.835 to 1107.565, ratio 0.042086, +4.2086%; NKE 35.167 to 31.52, ratio -0.103705, -10.3705%. This verifies units, not independently the underlying stock prices.

## Boundaries and repair

- Normalize only Backpack's adapter field, not DEX/CMC percentages. Check against positive first/last prices where supplied; inconsistent or invalid changes become unavailable. Never infer units from the value's magnitude.
- New rows retain an explicit `externalChangeUnit: percent` marker and starting price. Shared server cache reads and optional browser snapshot restoration convert unmarked legacy rows once, without changing their prices or observation timestamps. Marked rows are idempotent. The existing source cache key stays valid during rollout; a provider outage cannot reintroduce raw ratios.
- Increment the public response cache schema so old cached response bodies cannot survive the release. Existing render version rotation invalidates server-rendered pages.
- Independent publication checks compare the public percentage against its public starting/ending prices and reject unnormalized rows. Fresh timestamps alone are insufficient.
- Methodology explains the rolling 24-hour window, distinct from exchange daily close-to-close change. Reference changes remain external stock data, not token DEX returns.

## Verification

Regression cases cover recorded real response shapes, positive/negative/zero/tiny and >100% returns, missing/invalid fields, conflicting units, idempotent migration of D1/browser data, timestamps, unchanged DEX percentages, and independent publication rejection of a 100x regression. Full release gate and live API/render checks are recorded after execution.
