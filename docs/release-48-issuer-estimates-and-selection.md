# Issuer estimates and filter selection

Release 47 correctly excluded pre-minted xStocks inventory from the circulating total, but also removed usable mint-supply estimates for every other issuer from the primary interface. That made a data-basis limitation look like the platform had lost all issuer data.

## Restored values

Backpack, Ondo, PreStocks and Tessera issuer filters, token rows and individual details now expose the existing validated Solana minted-supply estimates, explicitly labeled **Minted value · est.** xStocks remains **Circulating value · est.**, using the issuer feed added in release 47. Its unavailable circulating feed never falls back to gross inventory.

The measures are not combined: the circulating headline is unchanged and remains explicitly partial. Minted value includes outstanding mint supply without claiming verified circulation or AUM. All quantities remain Solana-only and existing price freshness, quote-unit and conflict guards remain in force. Missing data is unavailable rather than zero. No snapshot numbers are hardcoded in production.

Research cross-check: [DefiLlama's Ondo adapter](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/ondo-global-markets/index.js) describes its supply-summing methodology. [Backpack's issuer explanation](https://learn.backpack.exchange/blog/tokenized-spacex-spcx) describes Solana issuance and redemption, but does not provide a chain-specific circulating-supply feed. [PreStocks' products page](https://prestocks.com/products) identifies its Solana products but the retrieved page did not expose a usable circulating-supply dataset. These checks do not establish that gross supply equals circulation. The safe immediate repair restores known mint estimates with their actual meaning, without pretending that a new circulation integration has been completed.

## Interaction

The selected issuer uses a neutral fill and checkmark. Red border and inset red stripe are removed. Native buttons retain Enter/Space activation and `aria-pressed`. A single inset, theme-aware focus outline replaces the additional outside line; its selector overrides the general member-shell focus rule. Focused border becomes transparent and box shadow is cleared, avoiding stacked frames. Grid remains six/three/two columns across existing desktop/mobile breakpoints; checkmarks reserve space to avoid label movement.

## Validation

Regression tests replay captured Solana observations through the current valuation functions and restore positive minted estimates for all four non-xStocks issuers. Tests verify labels, stale-data exclusion, no gross xStocks fallback, and no contamination of circulating totals. Existing filter selection/reset and rendered-interface tests pass. Browser visual/keyboard verification remains unavailable in this session; code and rendered-component checks are not a substitute for that verification.
