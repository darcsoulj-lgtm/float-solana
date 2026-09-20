# Market listing presentation decision — 2026-09-20

The previous market table sorted individual tokens, then collapsed them into company rows with empty metric columns. This made a numeric column header appear sortable even though the resulting company rows did not show the sorted values.

The default **Tokens** view now keeps one issuer token per visible row. Its price, change, supply, DEX volume, and pool liquidity columns sort the corresponding token observations; unavailable values remain unavailable and sort last. The **By company** view is an alphabetical browsing and comparison view. Expanding a company reveals its issuer versions with their separate observations. It does not invent a combined company price, supply, or pool metric.

At narrow widths, token rows become compact cards that keep price, 24h change, DEX volume, and liquidity visible without horizontal scrolling. When mobile users sort by supply, that metric also appears on each card. A restrained teal accent marks selected controls and market graphics; it is scoped to Markets, preserving Float's broader visual system.

This is a presentation change. It does not alter the token registry, provider adapters, issuer mapping, market calculations, coverage rules, API, or persistence. Verification includes the full release gate and rendered desktop/mobile checks in both appearance modes.
