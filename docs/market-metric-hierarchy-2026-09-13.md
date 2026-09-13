# Market metric hierarchy

13 September 2026 · Product and engineering

Minted value measures existing Solana mint supply at the selected token price. It can include issuer inventory, so its size is not evidence of investor demand, circulating market cap or money invested. The main working surface now prioritizes portfolio value, prices and trading conditions.

- All Markets: token and underlying-asset counts remain in the overview. The mixed-basis tracked estimate, per-issuer values, valuation coverage and original caveats remain under the collapsed Coverage & methodology section.
- Issuer selectors are compact buttons with token counts. They preserve issuer navigation and the All issuers reset without presenting mixed-basis values as comparable headline cards.
- The main market table shows price, 24-hour change, CMC-covered DEX volume and observed pool liquidity. These reuse existing observations; no new data subscription or provider request was introduced. Scope and partial coverage remain available beside the headers.
- Every issuer dashboard leads with observed pool volume and liquidity. xStocks retains its explicitly labeled Solana circulating estimate, including delayed status; other issuers show the tracked token count. Their tables no longer put minted value alongside trading metrics.
- Individual stock details retain minted supply and value, with an inventory explanation. Issuer aggregate estimates remain under Sources & coverage. The calculations, Solana-only scope, freshness checks and missing-data behavior are unchanged.

The presentation change stays in the shared React components and styles. The provider, database and authentication layers are unchanged. Existing rendering tests now assert that valuation is retained in disclosure sections, issuer filters still work during valuation outages, and details span the new table width. All 247 tests, strict types, lint and the production build pass. Local browser checks covered the public Backpack dashboard at desktop and 390px widths, light/dark themes, keyboard detail expansion/collapse and coverage disclosure. A clipped mobile volume column found during inspection was fixed; the inspected table and page fit their containers.
