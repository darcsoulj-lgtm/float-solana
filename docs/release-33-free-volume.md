# Volume without additional feed requests

The main stock table no longer shows or sorts by volume. Stock details show DEX volume only when the existing CoinMarketCap quotes response supplies a valid dex_volume_24h value. Missing, invalid or stale values hide the metric and its source row; reported zero remains visible. The remaining two metrics fill the desktop row. CMC source and timestamp remain available in the existing disclosure.

The market endpoint no longer calls GeckoTerminal or CoinGecko Pro. The temporary market-health route that triggered those requests is removed. Historical provider adapters/tests remain dormant for possible future use. Release 32's dedicated-feed setup instructions are superseded: no dedicated volume feed is active.

CMC requests retain the existing five-minute shared cache and batch IDs. Parsing one extra field requires no additional requests. Cache schema key is advanced to v2 so older cached payloads are refreshed. This does not promise all-stock coverage or indefinite keyless provider availability. No subscription, key or additional API integration is required by this change.

Validation covers explicit DEX field parsing, reported zero, malformed/missing values, delayed/stale observations, stock selection, and portfolio presentation. Browser visual verification remains unavailable under the existing environment restriction.
