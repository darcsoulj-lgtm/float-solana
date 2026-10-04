# Company logo treatment — local preview

Approved visual direction on 2026-09-30. Markets uses 32px circular artwork with a 12px text gap. Assets are served locally with explicit dimensions and lazy loading. Decorative artwork does not alter link names or market data. A neutral initial appears when artwork is missing or fails to load. Only Backpack mappings are enabled; this presentation map is not a token identity registry.

67 candidates were sourced from CoinGecko underlying stock and ETF listings, with exact-symbol/name matches recorded in `design-previews/logo-review-20260930/sources.json`. SCHH remains unresolved. ETFs use fund artwork. Candidates have not undergone a separate reuse-rights audit.

Verification: typecheck, repository lint, all 411 tests and production build passed. Desktop light (1440px) and mobile dark (390px) Markets inspected; visible logos loaded and no horizontal overflow. SCHH fallback inspected on mobile. Existing mobile grid-column selector was narrowed to exclude the positioned logo. Theme selection was verified with keyboard; automated pointer selection did not change it during this local session. No production deployment.

## Automatic listing logos — 2026-10-03

The manual artwork map did not cover SCHH/BE/PUSA/BLK. Verified Backpack mint metadata points to https://backpack.exchange/api/stock-logo/{symbol}. Existing reviewed local artwork remains preferred. All new verified Backpack symbols now use a same-origin image proxy automatically. Unknown symbols are rejected against the verified registry; the fetch destination is fixed, redirects rejected, images bounded to256KB, SVG served with sandbox CSP. Successful responses cache24hours; unavailable logos cache5minutes and retain the neutral fallback. No guessed company domains or unrelated token images are used.

Release:616tests, types, lint and production build passed. Cloudflare fetch requires redirect:manual (error is unsupported at the edge); manual redirects remain rejected via status checks. Production version2c19231c-1a52-4b0f-ab65-4c69cb44dc77. All4 previously missing symbols return200image responses from Float, with24hour cache and sandbox CSP. Upstream logo availability remains an external dependency.

Final rollout version90d2cd17-ac34-4731-9835-d05206989aef includes browser image URL versioning to bypass cached404responses from initial failed requests. Official image proxy retains its canonical cache key. No user cache-clearing requirement.
