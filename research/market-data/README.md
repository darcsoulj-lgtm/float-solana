# Public provider fixtures

Observed September 11, 2026 through anonymous, read-only HTTPS calls. These are test/research fixtures, never shipped as fallback or demo market values.

- `assets.json`: Backpack registry filtered to existing supported Solana mints.
- `markets.json`: Backpack STOCK entries, including perpetuals to test exclusion.
- `securities.json`: documented public security metadata filtered to supported assets.
- `depth.json`: observed MU spot book; timestamp is microseconds.
- `dex.json`: DEX Screener's exact-MU base-token pool response.
- `llamaprice.json`: DefiLlama MU token price with its original source timestamp.

See docs/market-data-research.md for scope and interpretation. Values are historical observations and will become stale.
