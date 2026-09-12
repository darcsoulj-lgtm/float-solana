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
// A dated reference may inform an estimate through a long market weekend.
// This is not a live quote and must never qualify a holder tier.
export const LAST_PRICE_MAX_AGE_MS = 96 * 60 * 60 * 1000;

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
    now - ref.timestamp <= LAST_PRICE_MAX_AGE_MS &&
    ref.timestamp <= now + 60000
      ? ref
      : undefined;
  const supply = recent(data?.supplies, now, symbol)
    ? data?.supplies.data?.[symbol]
    : undefined;
  const freshReference =
    reference && now - reference.timestamp <= 900000 ? reference : undefined;
  // Prefer current pool observations over an older reference. Preserve the
  // original reference timestamp; fetching it again does not make it fresh.
  const selectedReference =
    freshReference ?? (top?.price == null ? reference : undefined);
  const priceDelayed =
    cmc?.price == null &&
    !!selectedReference &&
    now - selectedReference.timestamp > 900000;
  const price = cmc?.price ?? selectedReference?.price ?? top?.price ?? null;
  const priceSource =
    cmc?.price != null
      ? 'CoinMarketCap'
      : selectedReference
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
    freshReference &&
    history &&
    history.price > 0 &&
    Number.isFinite(history.price) &&
    (history.confidence ?? 0) >= 0.8 &&
    !adjustmentInWindow &&
    Math.abs(freshReference.timestamp - history.timestamp - 86400000) <=
      900000 &&
    Math.abs(now - history.timestamp - 86400000) <= 1200000
      ? (freshReference.price / history.price - 1) * 100
      : null;
  const change24h =
    cmc?.price != null
      ? cmc.change24h
      : selectedReference
        ? referenceChange
        : (top?.change24h ?? null);
  // Do not average incompatible prices. Five percent is a review threshold,
  // not a guarantee that smaller differences are accurate.
  const comparedPrices = [cmc?.price, freshReference?.price, top?.price].filter(
    (p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0,
  );
  const priceConflict =
    comparedPrices.length > 1 &&
    Math.max(...comparedPrices) / Math.min(...comparedPrices) - 1 > 0.05;
  const quoteBeforeAdjustment = !!(
    selectedReference &&
    supply?.adjustmentAt &&
    selectedReference.timestamp < supply.adjustmentAt
  );
  const valuationUnavailableReason = !supply
    ? 'supply'
    : price === null
      ? 'price'
      : supply.valuationSafe === false || quoteBeforeAdjustment
        ? 'units'
        : priceConflict
          ? 'conflict'
          : null;
  const issuedValue =
    supply && valuationUnavailableReason === null && price !== null
      ? supply.supply * price
      : null;
  const circulationTime =
    data?.circulation?.asOf?.[symbol] ?? data?.circulation?.fetchedAt;
  const circulation =
    circulationTime &&
    !data?.circulation?.stale &&
    circulationTime <= now + 60000 &&
    now - circulationTime < 900000
      ? data?.circulation?.data?.[symbol]
      : undefined;
  const circulatingValue = circulation?.valueUsd ?? null;
  const liquidityRows = pools.filter((p) => p.liquidity !== null);
  return {
    symbol,
    circulation,
    circulationTime: circulation ? circulationTime : null,
    circulatingValue,
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
    priceDelayed,
    priceConflict,
    priceTime:
      cmc?.price != null
        ? cmc.timestamp
        : selectedReference
          ? selectedReference.timestamp
          : (data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt),
    change24h:
      change24h !== null && Number.isFinite(change24h) ? change24h : null,
    changeSource:
      cmc?.price != null
        ? 'CoinMarketCap'
        : selectedReference
          ? 'DefiLlama · calculated'
          : top
            ? 'Single DEX pool'
            : 'Unavailable',
    historyTime:
      selectedReference && referenceChange !== null ? history?.timestamp : null,
    changeUnavailableReason: priceDelayed
      ? 'The last available price is older than 15 minutes; a current 24-hour change is unavailable.'
      : adjustmentInWindow
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
    datedCount: valued.filter((r) => r.priceDelayed).length,
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

// Comparable net circulation only. Gross mint supply and global CMC values
// must never be substituted when an issuer has no chain-specific circulation.
export function circulatingCoverage(
  data: MarketOverview | null,
  now = Date.now(),
  issuer?: IssuerId,
) {
  const tokens = TOKENS.filter((t) => !issuer || t.issuer === issuer);
  const rows = tokens.map((t) => tokenObservation(data, t.symbol, now));
  const valued = rows.filter((r) => r.circulatingValue !== null);
  const valuedSymbols = new Set(valued.map((r) => r.symbol));
  return {
    rows,
    valued,
    total: valued.length
      ? valued.reduce((s, r) => s + r.circulatingValue!, 0)
      : null,
    issuerCount: new Set(
      tokens.filter((t) => valuedSymbols.has(t.symbol)).map((t) => t.issuer),
    ).size,
    missing: {
      supply: rows.filter((r) => !r.circulation).length,
      price: rows.filter((r) => r.circulation && r.circulatingValue === null)
        .length,
    },
  };
}

// Issuer summaries may expose different explicitly labeled measures. They are
// never inputs to the circulating headline. xStocks must not fall back to its
// gross pre-minted inventory when its circulating source is unavailable.
export function issuerValuation(
  data: MarketOverview | null,
  now: number,
  issuer: IssuerId,
) {
  const circulating = issuer === 'xstocks';
  const coverage = circulating
    ? circulatingCoverage(data, now, issuer)
    : issuedCoverage(data, now, issuer);
  return {
    ...coverage,
    label: circulating ? 'Circulating value' : 'Minted value',
    basis: circulating ? 'circulating' : 'minted',
  };
}

export function tokenValuation(
  observation: ReturnType<typeof tokenObservation>,
  issuer: IssuerId,
) {
  return issuer === 'xstocks'
    ? {
        value: observation.circulatingValue,
        label: 'Circulating value',
        basis: 'Circulating',
      }
    : {
        value: observation.issuedValue,
        label: 'Minted value',
        basis: 'Minted',
      };
}
