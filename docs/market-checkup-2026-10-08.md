# Float live check — 8 October 2026

Owner: Noah. Checked around 08:12 KST using production endpoints, D1, GitHub job logs and the live rendered Markets page.

- The next automatic complete Birdeye round succeeded: 74/74 tokens, round `0957ca12-3a12-4539-adf2-688ad7db7990`, completed 07:54:49 KST. Token row sum, dashboard and current Trading activity each equal $66,388,765.15433701. Next whole round is due 9 October around 04:54 KST. Original provider times remain unchanged; this is a query round of rolling observations, not a common historical cutoff.
- All 74 Backpack prices, supplies and 24-hour changes are available in the public observation model. Tokenized value is approximately $32.10M. Production health reports `ok`, no active issues, and 74/74 source coverage.
- Holding-wallet census: 248,603 unique wallets over 74 tokens, observed 7 October 16:18 KST. It is within the daily collection policy, not live wallet telemetry.
- Token/stock comparison: 6 October New York day, all five selected tokens verified. This is the currently due comparison before 7 October's New York midnight, which is 8 October 13:00 KST. Later daily collection remains scheduled. It is intentionally separate from rolling current token volume.
- Overnight audit found 85 successful market collections and two failures since 7 October 02:00 UTC; public publication checks had 84 successes in that interval. Both failed collection jobs successfully collected data but GitHub returned HTTP 500 when creating a blob in `scripts/market/publish.py`. Later runs recovered. The old publisher had no transient retry.
- One health check at 7 October 17:47 KST reported the previous stock comparison overdue. Later stock collection and checks succeeded. GitHub daily dispatch can be delayed by hours; this remains a timing limitation and is not repaired by publisher retries or a Birdeye upgrade.

## Focused repair

Retry only transient HTTP 429/500/502/503/504 and transport errors on GET and immutable Git-object creation. At most four attempts, exponential waits of 1/2/4 seconds, respecting numeric Retry-After up to 30 seconds. Authentication, validation and scope failures remain terminal. Never blindly replay branch creation or branch pointer mutation. Reuse the same collected payload; no additional provider calls, CU consumption, credential exposure or paid changes. Exhausted retries still fail and retain the prior published generation.

Python failure-boundary tests run before collection in the existing workflow. The page and data source methods are unchanged. The fixture tests do not prove GitHub will never fail; a later real workflow and publication check establish deployment evidence separately.
