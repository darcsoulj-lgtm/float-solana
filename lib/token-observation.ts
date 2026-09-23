import { poolMetrics } from './stock-pools';
import { marketTokens } from './market-data';
import { freshTokenMarket } from './cmc-data';
import type { MarketOverview, SourceResult } from './market-data';
import { ISSUERS, TOKENS, type IssuerId } from './tokens';
import { ONDO_VALUE_MAX_AGE_MS } from './ondo-valuation';
const ondoMints = new Map(
  TOKENS.filter((t) => t.issuer === 'ondo').map((t) => [t.symbol, t.mint]),
);

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
// Last-good display retention is separate from current-data validity. A
// provider outage must not blank the table after a few missed refresh cycles.
const LAST_OBSERVATION_DISPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const lastObserved = (
  timestamp: number | null | undefined,
  now: number,
  maxAge = LAST_OBSERVATION_DISPLAY_MAX_AGE_MS,
) => !!timestamp && timestamp <= now + 60000 && now - timestamp <= maxAge;

// Display-only pool summaries share the row retention policy. They do not
// enter daily history, portfolio valuation, or holder-tier calculations.
export function displayPoolActivity(
  data: MarketOverview | null,
  symbols: readonly string[],
  now = Date.now(),
) {
  const observations = symbols.flatMap((symbol) => {
    const time = data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt;
    if (!lastObserved(time, now)) return [];
    return (data?.pools?.data?.[symbol] ?? []).map((pool) => ({
      pool, time: time!, saved: !recent(data?.pools, now, symbol),
    }));
  });
  // A shared pool can have multiple token observations. Keep its newest one.
  observations.sort((a, b) => a.time - b.time);
  const unique = [...new Map(observations.map((item) => [item.pool.address, item])).values()];
  return {
    ...poolMetrics(unique.map((item) => item.pool)),
    saved: unique.some((item) => item.saved),
    oldestAt: unique.length ? Math.min(...unique.map((item) => item.time)) : null,
    newestAt: unique.length ? Math.max(...unique.map((item) => item.time)) : null,
  };
}

// Keep metrics from different scopes distinct: total minted value is never circulating market cap.
export function tokenObservation(
  data: MarketOverview | null,
  symbol: string,
  now = Date.now(),
) {
  const valued = data?.valuations?.data;
  const reported = valued?.rows[symbol];
  const isOndo = ondoMints.has(symbol);
  // The verified Backpack registry can add mints after a release. Use the
  // same token set that ownership verification and Markets use.
  const token = marketTokens(data).find(
    (candidate) => candidate.symbol === symbol,
  );
  const backpackMarket =
    token?.issuer === 'backpack' && recent(data?.backpack, now, symbol)
      ? data?.backpack?.data?.[symbol]
      : undefined;
  const issuerValue =
    valued &&
    reported &&
    reported.mint === ondoMints.get(symbol) &&
    !data?.valuations?.stale &&
    valued.observedAt > 0 &&
    valued.observedAt <= now + 60000 &&
    now - valued.observedAt <= ONDO_VALUE_MAX_AGE_MS &&
    Number.isFinite(reported.valueUsd) &&
    reported.valueUsd >= 0
      ? reported
      : undefined;
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
  const price =
    backpackMarket?.externalPrice ??
    cmc?.price ??
    selectedReference?.price ??
    top?.price ??
    null;
  const priceSource =
    backpackMarket?.externalPrice != null
      ? 'Backpack · external'
      : cmc?.price != null
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
    backpackMarket?.externalChange24h ??
    (cmc?.price != null
      ? cmc.change24h
      : selectedReference
        ? referenceChange
        : (top?.change24h ?? null));
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
  const valuationUnavailableReason = issuerValue
    ? null
    : isOndo
      ? 'valuation'
      : !supply
        ? 'supply'
        : price === null
          ? 'price'
          : supply.valuationSafe === false || quoteBeforeAdjustment
            ? 'units'
            : priceConflict
              ? 'conflict'
              : null;
  const issuedValue = isOndo
    ? (issuerValue?.valueUsd ?? null)
    : supply && valuationUnavailableReason === null && price !== null
      ? supply.supply * price
      : null;
  const circulationTime =
    data?.circulation?.asOf?.[symbol] ?? data?.circulation?.fetchedAt;
  const lastCirculation =
    circulationTime &&
    circulationTime > 0 &&
    circulationTime <= now + 60000 &&
    now - circulationTime < 86400000
      ? data?.circulation?.data?.[symbol]
      : undefined;
  const circulation =
    circulationTime &&
    !data?.circulation?.stale &&
    circulationTime <= now + 60000 &&
    now - circulationTime < 900000
      ? data?.circulation?.data?.[symbol]
      : undefined;
  const circulatingValue = circulation?.valueUsd ?? null;
  const metrics = poolMetrics(pools);
  // Display-only fallbacks. They never enter valuation, tier, or current-volume
  // calculations; each value keeps the timestamp of its original observation.
  const oldBackpackTime = data?.backpack?.asOf?.[symbol] ?? data?.backpack?.fetchedAt;
  const oldBackpack = lastObserved(oldBackpackTime, now)
    ? data?.backpack?.data?.[symbol]
    : undefined;
  const oldCmc = data?.markets?.data?.[symbol];
  const oldReference = data?.prices?.data?.[symbol];
  const oldPoolTime = data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt;
  const oldPools = lastObserved(oldPoolTime, now)
    ? data?.pools?.data?.[symbol] ?? []
    : [];
  const oldPoolPrice = oldPools.find((pool) => pool.price != null);
  const lastQuote = [
    token?.issuer === 'backpack' && oldBackpack?.externalPrice != null
      ? { value: oldBackpack.externalPrice, time: oldBackpackTime, source: 'Backpack · external' }
      : null,
    oldCmc?.price != null && lastObserved(oldCmc.timestamp, now)
      ? { value: oldCmc.price, time: oldCmc.timestamp, source: 'CoinMarketCap' }
      : null,
    oldReference?.price && (oldReference.confidence ?? 0) >= 0.8 &&
      lastObserved(oldReference.timestamp, now)
      ? { value: oldReference.price, time: oldReference.timestamp, source: 'DefiLlama' }
      : null,
    oldPoolPrice?.price != null && lastObserved(oldPoolTime, now)
      ? { value: oldPoolPrice.price, time: oldPoolTime, source: 'DEX pool' }
      : null,
  ].find((quote) => quote && Number.isFinite(quote.value) && quote.value > 0);
  const oldSupplyTime = data?.supplies?.asOf?.[symbol] ?? data?.supplies?.fetchedAt;
  const lastSupply = lastObserved(oldSupplyTime, now)
    ? data?.supplies?.data?.[symbol]
    : undefined;
  const lastPoolMetrics = poolMetrics(oldPools);
  return {
    symbol,
    lastCirculation,
    lastCirculationTime: lastCirculation ? circulationTime : null,
    circulation,
    circulationTime: circulation ? circulationTime : null,
    circulatingValue,
    valuationUnavailableReason,
    valuationSource: issuerValue ? 'DefiLlama · Ondo Global Markets' : null,
    valuationTime: issuerValue ? valued!.observedAt : null,
    valuationSupply: issuerValue?.supply,
    poolVolume24h: metrics.volume24h,
    cmcDexVolume24h: cmc?.dexVolume24h ?? null,
    onchainVolume24h: recent(data?.volumes, now, symbol)
      ? (data?.volumes?.data?.[symbol]?.usd24h ?? null)
      : null,
    onchainVolumeTime: data?.volumes?.fetchedAt ?? null,
    backpackMarket,
    backpackMarketTime: data?.backpack?.fetchedAt ?? null,
    backpackVenueVolume24h: backpackMarket?.venueVolume24h ?? null,
    backpackExternalVolume24h: backpackMarket?.externalVolume24h ?? null,
    cmc,
    top,
    supply,
    price,
    lastPrice: price == null ? (lastQuote?.value ?? null) : null,
    lastPriceTime: price == null ? (lastQuote?.time ?? null) : null,
    lastPriceSource: price == null ? (lastQuote?.source ?? null) : null,
    lastSupply: supply ? null : (lastSupply?.supply ?? null),
    lastSupplyTime: supply ? null : (lastSupply ? oldSupplyTime : null),
    lastPoolVolume24h: metrics.volume24h == null ? lastPoolMetrics.volume24h : null,
    lastPoolLiquidity: metrics.liquidity == null ? lastPoolMetrics.liquidity : null,
    lastPoolTime: metrics.volume24h == null || metrics.liquidity == null
      ? (oldPools.length ? oldPoolTime : null)
      : null,
    priceSource,
    priceDelayed,
    priceConflict,
    priceTime:
      backpackMarket?.externalPrice != null
        ? (data?.backpack?.fetchedAt ?? null)
        : cmc?.price != null
          ? cmc.timestamp
          : selectedReference
            ? selectedReference.timestamp
            : (data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt),
    change24h:
      change24h !== null && Number.isFinite(change24h) ? change24h : null,
    changeSource:
      backpackMarket?.externalChange24h != null
        ? 'Backpack · external'
        : cmc?.price != null
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
    // Keep the generic volume field tied to the existing CMC/DEX coverage.
    // Backpack's external ticker volume is provider-derived reference activity
    // and must not be presented as Solana or venue trading volume.
    volume24h: cmc?.volume24h ?? pools[0]?.volume24h ?? null,
    volumeSource:
      cmc?.volume24h != null
        ? 'CMC-covered venues'
        : pools[0]?.volume24h != null
          ? 'Largest DEX pool'
          : 'Not reported',
    liquidity: metrics.liquidity,
    issuedValue:
      issuedValue !== null && Number.isFinite(issuedValue) ? issuedValue : null,
  };
}
export function issuedCoverage(
  data: MarketOverview | null,
  now = Date.now(),
  issuer?: IssuerId,
) {
  const rows = marketTokens(data)
    .filter((t) => !issuer || t.issuer === issuer)
    .map((t) => tokenObservation(data, t.symbol, now));
  const valued = rows.filter((r) => r.issuedValue !== null);
  return {
    rows,
    valued,
    total: valued.length
      ? valued.reduce((sum, r) => sum + r.issuedValue!, 0)
      : null,
    datedCount: valued.filter((r) =>
      r.valuationTime ? now - r.valuationTime > 3600000 : r.priceDelayed,
    ).length,
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
      valuation: rows.filter(
        (r) => r.valuationUnavailableReason === 'valuation',
      ).length,
    },
  };
}

// Comparable net circulation only. Gross mint supply and global CMC values
// must never be substituted when an issuer has no chain-specific circulation.
export function circulatingCoverage(
  data: MarketOverview | null,
  now = Date.now(),
  issuer?: IssuerId,
  allowLastKnown = false,
) {
  const tokens = marketTokens(data).filter(
    (t) => !issuer || t.issuer === issuer,
  );
  const rows = tokens.map((t) => {
    const row = tokenObservation(data, t.symbol, now);
    const delayed = allowLastKnown && !row.circulation && !!row.lastCirculation;
    return delayed
      ? {
          ...row,
          circulation: row.lastCirculation,
          circulationTime: row.lastCirculationTime,
          circulatingValue: row.lastCirculation!.valueUsd,
          delayed: true,
        }
      : { ...row, delayed: false };
  });
  const valued = rows.filter((r) => r.circulatingValue !== null);
  const valuedSymbols = new Set(valued.map((r) => r.symbol));
  return {
    rows,
    valued,
    total: valued.length
      ? valued.reduce((s, r) => s + r.circulatingValue!, 0)
      : null,
    delayed: valued.some((r) => r.delayed),
    observedAt: valued.length
      ? Math.min(...valued.map((r) => r.circulationTime!))
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
    ? circulatingCoverage(data, now, issuer, true)
    : issuedCoverage(data, now, issuer);
  return {
    ...coverage,
    delayed: 'delayed' in coverage ? coverage.delayed : coverage.datedCount > 0,
    observedAt:
      'observedAt' in coverage
        ? coverage.observedAt
        : coverage.valued.some((r) => r.valuationTime || r.priceTime)
          ? Math.min(
              ...coverage.valued.flatMap((r) =>
                r.valuationTime || r.priceTime
                  ? [r.valuationTime ?? r.priceTime!]
                  : [],
              ),
            )
          : null,
    label: circulating ? 'Circulating value' : 'Minted value',
    basis: circulating ? 'circulating' : 'minted',
  };
}

// A sum of the displayed issuer estimates, NOT a circulating-market-cap series.
// Preserve each issuer's basis and never replace xStocks net circulation with
// gross inventory. Consumers must display partial coverage and mixed bases.
export function trackedValuation(data: MarketOverview | null, now: number) {
  const issuers = ISSUERS.map((issuer) => ({
    ...issuer,
    ...issuerValuation(data, now, issuer.id),
  }));
  const available = issuers.filter((issuer) => issuer.total !== null);
  const rows = issuers.flatMap((issuer) =>
    issuer.rows.map((row) => ({
      symbol: row.symbol,
      issuer: issuer.id,
      value:
        issuer.basis === 'circulating' ? row.circulatingValue : row.issuedValue,
    })),
  );
  const valued = rows.filter((row) => row.value !== null);
  return {
    issuers,
    rows,
    valued,
    total: available.length
      ? available.reduce((sum, issuer) => sum + issuer.total!, 0)
      : null,
    issuerCount: available.length,
    partial: valued.length < rows.length,
    mixedBases: new Set(available.map((issuer) => issuer.basis)).size > 1,
    delayed: available.some(
      (issuer) =>
        issuer.delayed ||
        issuer.valued.some((row) =>
          row.valuationTime
            ? now - row.valuationTime > 3600000
            : row.priceDelayed,
        ),
    ),
  };
}

export function tokenValuation(
  observation: ReturnType<typeof tokenObservation>,
  issuer: IssuerId,
) {
  return issuer === 'xstocks'
    ? {
        value:
          observation.circulatingValue ??
          observation.lastCirculation?.valueUsd ??
          null,
        label: 'Circulating value',
        basis:
          !observation.circulation && observation.lastCirculation
            ? 'Circulating · last verified'
            : 'Circulating',
      }
    : {
        value: observation.issuedValue,
        label: 'Minted value',
        basis: 'Minted',
      };
}
