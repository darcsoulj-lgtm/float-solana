import { freshTokenMarket } from './cmc-data';
import type { MarketOverview, SourceResult } from './market-data';
import { TOKENS } from './tokens';

function recent(source: SourceResult<unknown> | undefined, now: number) {
  return (
    !!source?.fetchedAt &&
    !source.stale &&
    now - source.fetchedAt <= 300000 &&
    source.fetchedAt <= now + 60000
  );
}
// Keep metrics from different scopes distinct: total minted value is never circulating market cap.
export function tokenObservation(
  data: MarketOverview | null,
  symbol: string,
  now = Date.now(),
) {
  const cmc = data?.markets.stale
    ? undefined
    : freshTokenMarket(data?.markets.data?.[symbol], now);
  const pools = recent(data?.pools, now)
    ? data?.pools.data?.[symbol] || []
    : [];
  const top = pools[0];
  const ref = recent(data?.prices, now)
    ? data?.prices.data?.[symbol]
    : undefined;
  const reference =
    ref && now - ref.timestamp <= 900000 && ref.timestamp <= now + 60000
      ? ref
      : undefined;
  const supply = recent(data?.supplies, now)
    ? data?.supplies.data?.[symbol]
    : undefined;
  const price = cmc?.price ?? top?.price ?? reference?.price ?? null;
  const priceSource =
    cmc?.price != null
      ? 'CoinMarketCap'
      : top?.price != null
        ? 'DEX pool'
        : reference
          ? 'DefiLlama'
          : 'Unavailable';
  const issuedValue = supply && price !== null ? supply.supply * price : null;
  const liquidityRows = pools.filter((p) => p.liquidity !== null);
  return {
    symbol,
    cmc,
    top,
    supply,
    price,
    priceSource,
    priceTime:
      cmc?.price != null
        ? cmc.timestamp
        : top?.price != null
          ? data?.pools.fetchedAt
          : reference?.timestamp,
    change24h:
      cmc?.price != null
        ? cmc.change24h
        : top?.price != null
          ? top.change24h
          : null,
    volume24h: cmc?.volume24h ?? top?.volume24h ?? null,
    volumeSource:
      cmc?.volume24h != null
        ? 'CMC-covered venues'
        : top?.volume24h != null
          ? 'Largest DEX pool'
          : 'Not reported',
    liquidity: liquidityRows.length
      ? liquidityRows.reduce((sum, p) => sum + p.liquidity!, 0)
      : null,
    issuedValue:
      issuedValue !== null && Number.isFinite(issuedValue) ? issuedValue : null,
  };
}
export function issuedCoverage(data: MarketOverview | null, now = Date.now()) {
  const rows = TOKENS.map((t) => tokenObservation(data, t.symbol, now));
  const valued = rows.filter((r) => r.issuedValue !== null);
  return {
    rows,
    valued,
    total: valued.length
      ? valued.reduce((sum, r) => sum + r.issuedValue!, 0)
      : null,
    pricedCount: rows.filter((r) => r.price !== null).length,
    supplyCount: rows.filter((r) => r.supply !== undefined).length,
  };
}
