# Circulating value correction — 12 September 2026

The previous headline summed gross Solana mint supply times available token prices. Gross issuance includes pre-minted inventory, so that number was not comparable with xStocks circulating value or all-chain AUM. Improving gross-supply price coverage made the misleading aggregate larger. The old coverage tests checked arithmetic and data availability, not the economic meaning of the supply being valued.

## Corrected calculation

Use the public issuer dashboard's Solana deployment circulating quantity, matched to our reviewed exact mint, multiplied by its collateral reference price. The quantities are already adjusted for corporate actions. Do not apply an onchain multiplier again. Prices arrive in cents; USD references divide by 100, while HKD references additionally use a dated ECB HKD/USD conversion. Do not sum other chains into Solana.

The main table, compact issuer filters and headline now use circulating value only. Gross minted value remains in an asset's expanded source details, explicitly marked not AUM. Other issuers without verified Solana circulation show Not verified; their gross issuance and global provider market caps cannot enter the circulating total. The headline is Tracked circulating value with partial issuer coverage.

## Captured evidence

Nine issuer response pages contain 830 assets, with 751 USD and 79 HKD price references. The 11 September ECB rates imply HKD/USD 0.1275191410719. The same capture yields approximately $518,557,759.60 on Solana and $813,249,490.37 across all deployments. These are reference-price circulating values, not an assertion of exact equality with the separately timed $823,563,783 AUM screenshot. Timing, coverage and reserve valuation can differ; no cap or adjustment forces agreement.

AAOIx on Solana: 57,606.45192261 adjusted total quantity versus 1,463.43647664 circulating quantity. NFLXx: 14,352.4035065 adjusted circulating quantity at $77.295; applying another 10x multiplier would be wrong.

The raw public pages are preserved in `research/market-integrity/xstocks-issuer-circulation-2026-09-12.json.gz` and ECB XML alongside them. The regression test replays these fixtures through the production parser and valuation functions.

## Sources and operational limits

- [Issuer dashboard](https://defi.xstocks.fi/) uses public GraphQL at `https://api.backed.fi/graphql`. The integration uses its observed query, without credentials. This dashboard endpoint is not a promised, versioned API contract; schema changes must fail closed.
- [Official OpenAPI](https://docs.xstocks.fi/apis/openapi): public total and circulating supply REST endpoints aggregate all chains. They must not be placed directly in a Solana-only row.
- [DefiLlama adapter](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/xstocks/index.js) explicitly excludes pre-minted tokens, independently confirming the gross/net distinction.
- [ECB reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) provide informational daily FX, not executable quotes.

One shared D1 snapshot refreshes on demand every 10 minutes, with at most three concurrent pagination requests. Page completeness, duplicate assets, exact mints, quantity bounds and currency are checked before accepting data. Failed refreshes retain the original timestamp; data older than 15 minutes is excluded from current circulation totals. The issuer query permits reference prices up to 72 hours old, matching its dashboard settings. Retrieval time is not price observation time. Expired/missing FX makes positive HKD values unavailable, never silently USD. Confirmed zero circulating quantity has zero value.

No new paid service, API key or database migration is required. The public endpoint has no verified service-level or rate-limit guarantee; upstream throttling follows the existing shared-cache retry handling.

## Validation

196 automated tests passed and TypeScript validation passed. Tests cover captured reconciliation, no gross/global fallback, partial/duplicate pages, wrong mints, invalid amounts, missing FX, expired snapshots, timestamp preservation and bounded pagination. The exact production GraphQL query was also checked live successfully. Browser visual verification was unavailable in this session; no claim of wallet-authenticated production visual QA is made.
