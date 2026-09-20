# Mobile wallet and market source repair — 2026-09-20

- Mobile wallet selection now opens the selected wallet's own browser link before asking its provider to connect. The return URL carries a wallet-choice hint; that hint grants no membership or admin access. The existing server-side signature and holdings checks remain authoritative. Desktop still uses exact named providers.
- The public Admin links were removed. The admin route remains available by direct URL and keeps its server allowlist, signature, and session checks.
- Client transport failures now produce a readable connection or timeout message instead of leaking a browser-specific exception. Previously verified holdings remain visible and dated on a failed refresh.
- xStocks issuer circulation now fetches 50 tokens per page because the complete 100-token public query took about 12 seconds in a local live probe versus about 2 seconds for 50. Pagination still validates every page and publishes only a complete issuer snapshot. Provider failures continue to retain and label the last verified observation.

The local release gate passed with 291 tests. On the deployed Worker, the public circulation response refreshed at 2026-09-20T03:53:49Z with 830 matched tokens and `stale=false`; the Markets page subsequently showed volume and liquidity values. The mobile wallet handoff still needs a real iOS/Android device check because desktop browser emulation cannot prove that the operating system opens the intended installed wallet.
