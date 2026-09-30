# Company logo treatment — local preview

Approved visual direction on 2026-09-30. Markets uses 32px circular artwork with a 12px text gap. Assets are served locally with explicit dimensions and lazy loading. Decorative artwork does not alter link names or market data. A neutral initial appears when artwork is missing or fails to load. Only Backpack mappings are enabled; this presentation map is not a token identity registry.

67 candidates were sourced from CoinGecko underlying stock and ETF listings, with exact-symbol/name matches recorded in `design-previews/logo-review-20260930/sources.json`. SCHH remains unresolved. ETFs use fund artwork. Candidates have not undergone a separate reuse-rights audit.

Verification: typecheck, repository lint, all 411 tests and production build passed. Desktop light (1440px) and mobile dark (390px) Markets inspected; visible logos loaded and no horizontal overflow. SCHH fallback inspected on mobile. Existing mobile grid-column selector was narrowed to exclude the positioned logo. Theme selection was verified with keyboard; automated pointer selection did not change it during this local session. No production deployment.
