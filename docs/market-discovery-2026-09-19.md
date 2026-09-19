# Market discovery update — 2026-09-19

## Boundaries and behavior

Preserve public access, membership controls, branding, and existing market provider orchestration. Market overview remains the owner of observations. Browse filters and grouping are presentation-only: each row retains its token identity and individual metrics. Company groups follow the existing registry underlyingSymbol; they do not synthesize company prices or market caps. Rank groups by the first token under the selected token sort, not summed issuer versions.

Keep four market-wide indicators independent of table filters. Issuer activity supports volume, liquidity, and tracked value, including unavailable issuers. Value uses the same coverage calculation as headline totals. DEX breakdown is collapsed by default and deduplicates pool addresses globally before grouping by venue. No artificial minimum bar width. No change to pool eligibility policy.

Issuer selection is multiple choice. Clicking activity filters in place instead of navigating to an issuer page. Private exposure excludes SPCX. Funds discovery uses fund/ETF/ETN/trust terms in registry names; it is a conservative convenience filter, not exhaustive legal classification. Do not label all remaining assets as listed equities without metadata verification. Mobile shows token, price and volume; details retain other metrics.

## Tessera and Pyth

Tessera public endpoint checked successfully. Only registry-confirmed Tessera mints are accepted. Separate cached public endpoint uses the existing D1 refresh lease and fixed provider allowlist. It cannot modify core pricing or valuation. Issuer mark is explicitly informational because API provides no observation timestamp. Holders and markValuation are deliberately omitted: methodology/units not established. No new token is admitted merely because it appears in this API.

Pyth Pro latest-price API requires server-side credentials. No configured Pyth credentials were found in local deployment files. No Pyth price badges or comparisons activated. Official API docs: https://docs.pyth.network/price-feeds/pro/api/rest . This is an outstanding integration dependency, not a completed live feed.

## Validation

Strict types, repository lint, all test suites and production build required. Browse tests cover grouping, SpaceX exclusion from private category, and mint-safe Tessera parsing. Presentation tests updated for in-place multi-selection and collapsed venue breakdown. Browser verification covers search, issuer multi-selection, expansion, activity metric switching, light/dark and 390px mobile. Local observations may differ from production because the databases and provider configuration differ. No load test or signed-in session check is implied.
