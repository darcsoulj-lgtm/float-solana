# Profile, appearance and portfolio fixes — 11 September 2026

## Root causes and changes

- Bio inherited inline textarea layout because the profile styles targeted inputs only. Fields now use explicit vertical label/control layout, full-width controls, shared padding/borders and focus states. Profile width is bounded to 760px.
- Appearance was a cycling control in a scrolling top bar; mobile also hid its text. Explicit Light/Dark/System choices now live below desktop navigation, in the mobile top bar, and in Profile. Choices synchronize immediately and retain the existing device preference.
- Portfolio previously rendered native browser progress bars and an oversized grid. It now uses an allocation ring and aligned holding rows. Five largest positions are initially visible; the chart groups the remainder as Other. Missing prices suppress allocation, and hiding balances masks the chart and percentages as well as values.

## BABA evidence

Backpack's [September 10 issuer announcement](https://learn.backpack.exchange/blog/20-new-tokenized-stocks-solana) explicitly lists Alibaba Group Holding - Backpack Securities, ticker BABA, mint `BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp`. It matches HolderPulse's existing allowlist. The announcement lists 20 tokens; all corresponding records now link to this announcement in the directory and the market source disclosure.

A fresh live registry audit matched all 41 supported tokens at 2026-09-11T10:34:49.042Z. BABA was included from Backpack's Solana registry, not a coincidental ticker match on a pricing website. No verified CG/CMC Backpack BABA listing was found in this check. Absence from an aggregator does not establish absence from the issuer. No BABA listing correction was required; the evidence needed a direct user-visible link. The earlier mint and metadata evidence remains in token-audit-2026-09-11.md.

## Verification boundary

Component interaction/render checks and production build validate behavior and compilation. Browser visual QA remains unavailable under the environment's previously reported browser access restriction; no alternative browser transport was used to bypass it.

Validation: 131 unit/component checks passed, including direct Light selection, preference synchronization, allocation accuracy, missing-price suppression, hidden-balance privacy, and grouped portfolios. Type checking and the final production build passed.
