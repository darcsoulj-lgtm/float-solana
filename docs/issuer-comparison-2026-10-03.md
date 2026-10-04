# Issuer comparison — prepared, not published

RJ approved the desktop/mobile comparison design and then explicitly chose to keep the free plan and defer public comparison while completing the UI and connection preparation.

## Boundaries

- New presentation: `components/issuer-comparison.tsx`, with responsive bars, USD amounts, shares, hover/focus/tap details, an original-source timestamp and one header methodology tip. Backpack is red; other issuers use neutral tones. No invented history or repeated per-value infotips.
- Public reader: `/api/issuer-comparison`, a bounded aggregate DTO from existing public market caches. The feature is disabled by default and deployment preparation pins `BIRDEYE_COMPARISON_ENABLED=0`. It returns null while disabled or when a complete comparable cohort is unavailable.
- Identity: reuse the canonical reviewed registry, including dynamically verified Backpack additions. Static xStocks/Ondo records are tracked coverage, not a guarantee of current issuer completeness. No new issuer-discovery service or secondary registry has been introduced.
- Source: Birdeye token turnover only; no DEX Screener/pool/primary issuer-flow fallback. Exact mint cache identity is preserved. Duplicate mints within one issuer count once; a cross-issuer mint conflict blocks the comparison.
- Validity: every tracked mint must have a finite nonnegative volume, original provider time within 24 hours, collection time within 24 hours, collection spread at most one hour and provider-time spread at most six hours. Missing/corrupt/stale/future entries withhold the whole comparison. Explicit provider zero is accepted; zero total has no defined share and displays a dash for percentages.
- No external calls, paid collection, quota increase, secret export, membership changes, or production deployment were made for this feature. Existing Backpack collection remains untouched.

## Free-plan constraint

The current static registry has 832 xStocks and 438 Ondo mints; the live Backpack registry previously verified 71. That is 1,341 tracked mints. At the existing documented single-volume endpoint cost of 5 CU, one whole pass costs 6,705 CU; a 32-day daily schedule costs 214,560 CU before failures, above the free plan's 30,000 CU and Float's 20,000 CU budget.

Birdeye's documented multi-volume endpoint is Premium/Business/Enterprise only. Its endpoint page quotes `ceil(8 * count^0.8)` while the batch cost table currently lists base cost 5; do not rely on a cheaper speculative batch estimate. Neither page documents Standard access to issuer aggregates. Do not silently scrape the RWA dashboard or use only top tokens as if they were the whole issuer universe.

Sources checked October 3, 2026:
- https://data.birdeye.so/docs/data-api/price-ohlcv/post-defi-price-volume-multi
- https://data.birdeye.so/docs/guides/compute-unit-cost/batch-token-cu-cost
- https://docs.birdeye.so/docs/pricing

## Review and next activation boundary

`/preview/issuer-comparison` is development-only and visibly labelled Sample data. The production route returns 404. Sample rows never enter a market cache or API. Before activation: establish sustainable same-source full-cohort collection, verify current issuer identities and product scope, confirm account allowance and display terms, validate live coverage and timestamp alignment, then explicitly change the disabled flag. A working read-only cache adapter is not proof of live other-issuer collection.

## Verification completed

- Full release gate passed: security review, type check, lint, all 661 tests and production build. Evidence: `outputs/issuer-comparison-build.log`.
- In-app browser verified the actual development component at 1280px, 390px and 320px. No horizontal overflow at 320px; mobile issuer controls are 66px high. Touch details, keyboard focus, Escape dismissal, dark mode and the methodology link were checked. Fresh browser warning/error logs were empty after correcting deterministic accessibility IDs.
- Screenshots of the actual component: `outputs/issuer-comparison-desktop.png`, `outputs/issuer-comparison-mobile.png`, `outputs/issuer-comparison-dark.png`. Values are explicitly labelled sample data.
- Isolated local Workers production runtime: two sequential comparison GETs returned HTTP 200, `Cache-Control: no-store`, no Set-Cookie and only `{comparison:null}`. The design preview returned HTTP 404 without its sample content. Evidence: `outputs/issuer-comparison-runtime-check.json`.
- No production deployment, paid-plan change or other-issuer provider collection occurred. The comparison remains publicly disabled; the existing development server was reused for review.
