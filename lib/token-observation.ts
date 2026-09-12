import { freshTokenMarket } from './cmc-data';
import type { MarketOverview, SourceResult } from './market-data';
import { TOKENS, type IssuerId } from './tokens';

function recent(
  source: SourceResult<unknown> | undefined,
  now: number,
  symbol: string,
) {
  const timestamp = source?.asOf?.[symbol] ?? source?.fetchedAt;
  return (
    !!timestamp &&
    !source?.stale &&
    now - timestamp <= 300000 &&
    timestamp <= now + 60000
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
  const pools = recent(data?.pools, now, symbol)
    ? data?.pools.data?.[symbol] || []
    : [];
  const top = pools.find((p) => p.price !== null && p.price !== undefined);
  const ref = recent(data?.prices, now, symbol)
    ? data?.prices.data?.[symbol]
    : undefined;
  const reference =
    ref &&
    ref.price > 0 &&
    Number.isFinite(ref.price) &&
    (ref.confidence ?? 0) >= 0.8 &&
    now - ref.timestamp <= 900000 &&
    ref.timestamp <= now + 60000
      ? ref
      : undefined;
  const supply = recent(data?.supplies, now, symbol)
    ? data?.supplies.data?.[symbol]
    : undefined;
  const price = cmc?.price ?? reference?.price ?? top?.price ?? null;
  const priceSource =
    cmc?.price != null
      ? 'CoinMarketCap'
      : reference
        ? 'DefiLlama'
        : top?.price != null
          ? 'DEX pool'
          : 'Unavailable';
  const history = recent(data?.history, now, symbol)
    ? data?.history?.data?.[symbol]
    : undefined;
  const adjustmentInWindow = !!(
    supply?.adjustmentAt &&
    history &&
    reference &&
    supply.adjustmentAt > history.timestamp &&
    supply.adjustmentAt <= reference.timestamp
  );
  const referenceChange =
    reference &&
    history &&
    history.price > 0 &&
    Number.isFinite(history.price) &&
    (history.confidence ?? 0) >= 0.8 &&
    !adjustmentInWindow &&
    Math.abs(reference.timestamp - history.timestamp - 86400000) <= 900000 &&
    Math.abs(now - history.timestamp - 86400000) <= 1200000
      ? (reference.price / history.price - 1) * 100
      : null;
  const change24h =
    cmc?.price != null
      ? cmc.change24h
      : reference
        ? referenceChange
        : (top?.change24h ?? null);
  // Do not average incompatible prices. Five percent is a review threshold,
  // not a guarantee that smaller differences are accurate.
  const comparedPrices = [cmc?.price, reference?.price, top?.price].filter(
    (p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0,
  );
  const priceConflict =
    comparedPrices.length > 1 &&
    Math.max(...comparedPrices) / Math.min(...comparedPrices) - 1 > 0.05;
  const valuationUnavailableReason = !supply
    ? 'supply'
    : price === null
      ? 'price'
      : supply.valuationSafe === false
        ? 'units'
        : priceConflict
          ? 'conflict'
          : null;
  const issuedValue =
    supply && supply.valuationSafe !== false && price !== null && !priceConflict
      ? supply.supply * price
      : null;
  const liquidityRows = pools.filter((p) => p.liquidity !== null);
  return {
    symbol,
    valuationUnavailableReason,
    cmcDexVolume24h: cmc?.dexVolume24h ?? null,
    onchainVolume24h: recent(data?.volumes, now, symbol)
      ? (data?.volumes?.data?.[symbol]?.usd24h ?? null)
      : null,
    onchainVolumeTime: data?.volumes?.fetchedAt ?? null,
    cmc,
    top,
    supply,
    price,
    priceSource,
    priceConflict,
    priceTime:
      cmc?.price != null
        ? cmc.timestamp
        : reference
          ? reference.timestamp
          : (data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt),
    change24h:
      change24h !== null && Number.isFinite(change24h) ? change24h : null,
    changeSource:
      cmc?.price != null
        ? 'CoinMarketCap'
        : reference
          ? 'DefiLlama · calculated'
          : top
            ? 'Single DEX pool'
            : 'Unavailable',
    historyTime:
      reference && referenceChange !== null ? history?.timestamp : null,
    changeUnavailableReason: adjustmentInWindow
      ? 'A display-unit adjustment falls within this period; comparable history is unconfirmed.'
      : 'No comparable 24-hour history from the selected price source.',
    volume24h: cmc?.volume24h ?? pools[0]?.volume24h ?? null,
    volumeSource:
      cmc?.volume24h != null
        ? 'CMC-covered venues'
        : pools[0]?.volume24h != null
          ? 'Largest DEX pool'
          : 'Not reported',
    liquidity: liquidityRows.length
      ? liquidityRows.reduce((sum, p) => sum + p.liquidity!, 0)
      : null,
    issuedValue:
      issuedValue !== null && Number.isFinite(issuedValue) ? issuedValue : null,
  };
}
export function issuedCoverage(
  data: MarketOverview | null,
  now = Date.now(),
  issuer?: IssuerId,
) {
  const rows = TOKENS.filter((t) => !issuer || t.issuer === issuer).map((t) =>
    tokenObservation(data, t.symbol, now),
  );
  const valued = rows.filter((r) => r.issuedValue !== null);
  return {
    rows,
    valued,
    total: valued.length
      ? valued.reduce((sum, r) => sum + r.issuedValue!, 0)
      : null,
    pricedCount: rows.filter((r) => r.price !== null).length,
    supplyCount: rows.filter((r) => r.supply !== undefined).length,
    missing: {
      supply: rows.filter((r) => r.valuationUnavailableReason === 'supply')
        .length,
      price: rows.filter((r) => r.valuationUnavailableReason === 'price')
        .length,
      units: rows.filter((r) => r.valuationUnavailableReason === 'units')
        .length,
      conflict: rows.filter((r) => r.valuationUnavailableReason === 'conflict')
        .length,
    },
  };
}
