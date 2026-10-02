# Observed volume and recovery ownership

Owner: Noah. Public Markets must preserve useful verified observations and clearly identify their scope. A successful collector/publication workflow does not establish complete volume coverage.

- `poolMetrics.volume24h` remains a strict known-pool total for calculations. The separate `poolDisplayMetrics.observedVolume24h` is an explicitly scoped display sum. Qualified pool addresses count once; disputed, quarantined, expired (>24 hours) and future (>60 seconds) amounts are excluded. All-known zero observations with unresolved pools stay unavailable, never falsely suggest zero total activity.
- List sorting, rows, detail and market summary use the same display policy. The summary is labelled Observed DEX volume and shows a single incomplete-coverage link; details show included/known pool counts. Shared stock/stock pools are deduplicated at market level, so row sums are not the market sum. Last-good timestamps are preserved and older observations remain in the source information.
- Known unresolved exact-address Gecko recovery starts while primary collection is pending. It no longer waits up to the 18-second primary deadline before consuming a 45-second shared job. Existing pacing, cooldowns, request and batch limits remain intact. Discovery continues independently; identity discovery never certifies numerical volume.
- The collector compares previous qualified observations to the new generation. Lost previously verified activity of at least $1,000 emits a GitHub warning and records regression addresses in verification.json. New identity-only pools are recorded as gaps rather than mislabeled as lost volume. This is visibility in the existing collection workflow, not a new alert service or a completeness guarantee.

Validation: pending full release gate, isolated runtime, live collection/publication and desktop/mobile rendered evidence. Trading stays disabled. No paid service, wallet action or user-data change.
