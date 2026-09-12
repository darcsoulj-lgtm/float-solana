# Member Backpack view and valuation wording

The holder sidebar used a public-page link, leaving the authenticated app shell. Backpack is now an internal view using the same navigation state as Markets and Profile. It renders the shared dashboard lazily inside the full-width member content area, retains the sidebar, and omits the public join prompt and duplicate brand eyebrow. The public /backpack route remains available.

The market headline now explicitly reads xStocks circulating value and queries only xStocks Solana circulation. Its coverage count uses xStocks tokens. Other issuer minted-value estimates remain separate. No supply or pricing calculations changed.

Removed repeated Minted/Circulating labels from table rows. Issuer-specific column headers name the measure; the mixed-issuer column has an accessible info control explaining both measures. The issuer filters and selected asset details retain their valuation basis. Delayed observations retain their visible Last verified timestamp. Metric explanations support hover, keyboard focus, and tap.

Validation: TypeScript; production build; 38 focused presentation, Backpack and xStocks circulation checks, including member navigation, embedded/public render differences, issuer filters, and exclusion of minted values from circulation totals. Browser click-through and visual QA remain unavailable due to the session browser policy block; no live visual verification claimed.
