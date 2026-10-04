import { birdeyeTokenVolume } from './birdeye-volume';
import { poolMetrics, poolDisplayMetrics } from './stock-pools';
import { marketTokens } from './market-data';
import { freshTokenMarket } from './cmc-data';
import type { MarketOverview, SourceResult } from './market-data';
import { ISSUERS, TOKENS, type IssuerId } from './tokens';
import { ONDO_VALUE_MAX_AGE_MS } from './ondo-valuation';
import { CURRENT_PRICE_MAX_AGE_MS, SUPPLY_MAX_AGE_MS, DISPLAY_OBSERVATION_MAX_AGE_MS, VALUATION_PAIR_MAX_SKEW_MS, BACKPACK_REFERENCE_RETAIN_MS, validatedHistoricalReferencePair } from './market-freshness';
const ondoMints = new Map(
  TOKENS.filter((t) => t.issuer === 'ondo').map((t) => [t.symbol, t.mint]),
);

function recent(
  source: SourceResult<unknown> | undefined,
  now: number,
  symbol: string,
  maxAge = CURRENT_PRICE_MAX_AGE_MS,
) {
  const timestamp = source?.asOf?.[symbol] ?? source?.fetchedAt;
  return (
    !!timestamp &&
    (!!source?.asOf?.[symbol] || !source?.stale) &&
    now - timestamp <= maxAge &&
    timestamp <= now + 60000
  );
}
// A dated reference may inform an estimate through a long market weekend.
// This is not a live quote and must never qualify a holder tier.
export const LAST_PRICE_MAX_AGE_MS = BACKPACK_REFERENCE_RETAIN_MS;
// Last-good display retention is separate from current-data validity. A
// provider outage must not blank the table after a few missed refresh cycles.
const LAST_OBSERVATION_DISPLAY_MAX_AGE_MS = DISPLAY_OBSERVATION_MAX_AGE_MS;
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
  observations.sort((a, b) => (a.pool.observedAt ?? a.time) - (b.pool.observedAt ?? b.time));
  const unique = [...new Map(observations.map((item) => [item.pool.address, item])).values()];
  const metrics = poolDisplayMetrics(unique.map((item) => ({...item.pool, observedAt: item.pool.observedAt ?? item.time})), now);
  const missingToken = symbols.some(symbol =>
    !lastObserved(data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt, now) ||
    !data?.pools?.data?.[symbol]?.length);
  return {
    ...metrics,
    volume24h: missingToken ? null : metrics.volume24h,
    observedVolume24h: missingToken && metrics.observedVolume24h === 0 ? null : metrics.observedVolume24h,
    partial: missingToken || metrics.partial,
    missingTokenCount: symbols.filter(symbol => !lastObserved(data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt, now) || !data?.pools?.data?.[symbol]?.length).length,
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
    token?.issuer === 'backpack' && recent(data?.backpack, now, symbol) &&
    lastObserved(data?.backpack?.data?.[symbol]?.externalObservedAt ?? data?.backpack?.asOf?.[symbol] ?? data?.backpack?.fetchedAt, now, CURRENT_PRICE_MAX_AGE_MS)
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
    (reported.priceAt === undefined ||
      (reported.priceAt > 0 && reported.priceAt <= now + 60000 &&
        now - reported.priceAt <= LAST_PRICE_MAX_AGE_MS)) &&
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
  const supply = recent(data?.supplies, now, symbol, token?.issuer === 'backpack' ? SUPPLY_MAX_AGE_MS : CURRENT_PRICE_MAX_AGE_MS)
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
    backpackMarket?.externalPrice != null
      ? backpackMarket.externalChange24h ?? null
      : (cmc?.price != null
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
  // Display-only fallbacks. They never enter strict valuation, tier, or current-volume
  // calculations; each value keeps the timestamp of its original observation.
  const storedBackpack = data?.backpack?.data?.[symbol];
  const oldBackpackTime = storedBackpack?.externalObservedAt ?? data?.backpack?.asOf?.[symbol] ?? data?.backpack?.fetchedAt;
  const historyReference = storedBackpack?.externalBasis === 'hourly-history';
  const displayAdjustmentAt = data?.supplies?.data?.[symbol]?.adjustmentAt;
  const historicalUnitsCompatible = (at:number | null | undefined) => !displayAdjustmentAt ||
    (!!at && Number.isFinite(displayAdjustmentAt) && at>=displayAdjustmentAt);
  const candidateHistoricalPair = token?.issuer === 'backpack' && storedBackpack?.market === symbol + '.US_USDC'
    ? validatedHistoricalReferencePair(storedBackpack.historicalExternalReference,now) : null;
  const storedHistoricalPair = candidateHistoricalPair && historicalUnitsCompatible(candidateHistoricalPair.observedAt) ? candidateHistoricalPair : null;
  const oldBackpack = lastObserved(oldBackpackTime, now, historyReference ? LAST_PRICE_MAX_AGE_MS : LAST_OBSERVATION_DISPLAY_MAX_AGE_MS) &&
    (!historyReference || historicalUnitsCompatible(oldBackpackTime))
    ? data?.backpack?.data?.[symbol]
    : undefined;
  const oldCmc = data?.markets?.data?.[symbol];
  const oldReference = data?.prices?.data?.[symbol];
  const oldPoolTime = data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt;
  const oldPools = lastObserved(oldPoolTime, now)
    ? data?.pools?.data?.[symbol] ?? []
    : [];
  const oldPoolPrice = oldPools.find((pool) => pool.price != null);
  const lastQuotes = [
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
  ].filter((quote): quote is { value: number; time: number; source: string } => !!quote && !!quote.time && Number.isFinite(quote.value) && quote.value > 0);
  const lastQuote = lastQuotes[0];
  const oldSupplyTime = data?.supplies?.asOf?.[symbol] ?? data?.supplies?.fetchedAt;
  const lastSupply = lastObserved(oldSupplyTime, now)
    ? data?.supplies?.data?.[symbol]
    : undefined;
  // Display-only estimate from an age-bounded, compatible observed pair.
  // Keep issuedValue strict for eligibility, research and financial calculations.
  // A preferred historical stock reference is presentation only. It must not
  // suppress a newer validated price/supply pair from an independent source.
  const observedPairQuote = lastQuotes.find(quote => lastObserved(quote.time, now) && !!oldSupplyTime && Math.abs(quote.time - oldSupplyTime) <= VALUATION_PAIR_MAX_SKEW_MS);
  // A stock reference can stop trading over a long weekend while minted
  // supply continues to change. Estimate today's verified supply at the last
  // official hourly close only for display; never widen arbitrary quote pairs.
  const officialHistoricalQuote = token?.issuer === 'backpack' && historyReference && oldBackpack?.market === symbol + '.US_USDC' &&
    typeof oldBackpack.externalPrice === 'number' && Number.isFinite(oldBackpack.externalPrice) && oldBackpack.externalPrice > 0
      ? {value:oldBackpack.externalPrice,time:oldBackpackTime!,source:'Backpack · external'}
      : storedHistoricalPair ? {value:storedHistoricalPair.price,time:storedHistoricalPair.observedAt,source:'Backpack · external'} : undefined;
  const historicalValuationQuote = officialHistoricalQuote && supply?.valuationSafe === true &&
    lastObserved(oldSupplyTime, now, SUPPLY_MAX_AGE_MS) &&
    lastObserved(officialHistoricalQuote.time, now, BACKPACK_REFERENCE_RETAIN_MS)
      ? officialHistoricalQuote : undefined;
  const valuationQuote = observedPairQuote ?? historicalValuationQuote;
  const historicalValuation = !observedPairQuote && !!historicalValuationQuote;
  const savedPrice = valuationQuote?.value;
  const savedPriceTime = valuationQuote?.time;
  const savedComparables = [
    valuationQuote,
    oldReference && (oldReference.confidence ?? 0) >= 0.8
      ? {value: oldReference.price, time: oldReference.timestamp} : null,
    oldPoolPrice ? {value: oldPoolPrice.price, time: oldPoolPrice.observedAt ?? oldPoolTime} : null,
  ].filter((q): q is {value:number;time:number} => !!q && typeof q.value === 'number' && Number.isFinite(q.value) && q.value > 0 && !!q.time && !!savedPriceTime && Math.abs(q.time-savedPriceTime) <= VALUATION_PAIR_MAX_SKEW_MS);
  const savedConflict = savedComparables.length > 1 && Math.max(...savedComparables.map(q=>q.value)) / Math.min(...savedComparables.map(q=>q.value)) - 1 > .05;
  const savedValue = token?.issuer === 'backpack' && issuedValue === null &&
    savedPrice != null && lastObserved(savedPriceTime, now, historicalValuation ? BACKPACK_REFERENCE_RETAIN_MS : LAST_OBSERVATION_DISPLAY_MAX_AGE_MS) &&
    lastSupply?.valuationSafe === true && Number.isFinite(lastSupply.supply) && lastSupply.supply >= 0 &&
    lastObserved(oldSupplyTime, now, historicalValuation ? SUPPLY_MAX_AGE_MS : LAST_OBSERVATION_DISPLAY_MAX_AGE_MS) &&
    (historicalValuation || Math.abs(savedPriceTime!-oldSupplyTime!) <= VALUATION_PAIR_MAX_SKEW_MS) &&
    (!lastSupply.adjustmentAt || savedPriceTime! >= lastSupply.adjustmentAt) && !savedConflict
      ? savedPrice * lastSupply.supply : null;
  // Keep the dated percentage paired with the displayed Backpack price during
  // a short refresh failure. Never substitute a different venue or renew its age.
  const lastChange = price === null && lastQuote?.source === 'Backpack · external' &&
    lastObserved(oldBackpackTime, now, historyReference ? LAST_PRICE_MAX_AGE_MS : 15 * 60000) &&
    typeof oldBackpack?.externalChange24h === 'number' && Number.isFinite(oldBackpack.externalChange24h)
      ? oldBackpack.externalChange24h : null;
  const displayedChange = lastChange ?? change24h;
  const historicalDisplayReference = displayedChange===null ? storedHistoricalPair : null;
  const lastPoolMetrics = poolMetrics(oldPools);
  const displayMetrics = poolDisplayMetrics(oldPools, now, oldPoolTime);
  const providerVolume = birdeyeTokenVolume(data, token, now);
  return {
    symbol,
    historicalReference: price === null && historyReference && lastQuote?.source === 'Backpack · external',
    historicalDisplayReference,
    lastCirculation,
    lastCirculationTime: lastCirculation ? circulationTime : null,
    circulation,
    circulationTime: circulation ? circulationTime : null,
    circulatingValue,
    valuationUnavailableReason,
    valuationSource: issuerValue ? valued!.source ?? 'DefiLlama · Ondo Global Markets' : null,
    valuationTime: issuerValue ? issuerValue.priceAt ?? valued!.observedAt : null,
    valuationSupplyTime: issuerValue ? issuerValue.supplyAt ?? valued!.observedAt : null,
    valuationUrl: valued?.source ? 'https://app.ondo.finance/' : 'https://api.llama.fi/protocol/ondo-global-markets',
    valuationSupply: issuerValue?.supply,
    dexVolume24h: data?.tokenVolumes && token?.issuer === 'backpack' ? providerVolume?.usd24h ?? null : displayMetrics.observedVolume24h,
    dexVolumeTime: providerVolume?.observedAt ?? null,
    dexVolumeProvider: data?.tokenVolumes && token?.issuer === 'backpack' ? 'Birdeye' : 'Tracked pools',
    poolVolume24h: metrics.volume24h,
    observedPoolVolume24h: displayMetrics.observedVolume24h,
    observedPoolCount: displayMetrics.observedCount,
    knownPoolCount: displayMetrics.knownCount,
    poolCoveragePartial: metrics.partial || lastPoolMetrics.partial,
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
        ? (backpackMarket.externalObservedAt ?? data?.backpack?.asOf?.[symbol] ?? data?.backpack?.fetchedAt ?? null)
        : cmc?.price != null
          ? cmc.timestamp
          : selectedReference
            ? selectedReference.timestamp
            : (data?.pools?.asOf?.[symbol] ?? data?.pools?.fetchedAt),
    change24h:
      displayedChange !== null && Number.isFinite(displayedChange) ? displayedChange : null,
    changeDelayed: lastChange !== null,
    changeTime: lastChange !== null ? oldBackpackTime : backpackMarket?.externalChange24h != null ? backpackMarket.externalObservedAt ?? data?.backpack?.asOf?.[symbol] ?? data?.backpack?.fetchedAt : null,
    changeSource:
      lastChange !== null || backpackMarket?.externalChange24h != null
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
    lastIssuedValue: savedValue !== null && Number.isFinite(savedValue) ? savedValue : null,
    lastIssuedValueTime: savedValue !== null && Number.isFinite(savedValue) ? Math.min(savedPriceTime!,oldSupplyTime!) : null,
    lastIssuedValuePriceSource: savedValue !== null ? valuationQuote?.source ?? null : null,
    lastIssuedValuePriceTime: savedValue !== null ? savedPriceTime ?? null : null,
    lastIssuedValueSupplyTime: savedValue !== null ? oldSupplyTime ?? null : null,
    lastIssuedValueHistoricalReference: savedValue !== null && historicalValuation,
    lastIssuedValueBasis: savedValue !== null ? historicalValuation ? 'historical-stock-reference' as const : 'observed-pair' as const : null,
  };
}
export function issuedCoverage(
  data: MarketOverview | null,
  now = Date.now(),
  issuer?: IssuerId,
  allowLastKnown = false,
) {
  const rows = marketTokens(data)
    .filter((t) => !issuer || t.issuer === issuer)
    .map((t) => {
      const row = tokenObservation(data, t.symbol, now);
      return allowLastKnown && t.issuer === 'backpack' && row.issuedValue === null && row.lastIssuedValue !== null
        ? {...row, issuedValue:row.lastIssuedValue, priceDelayed:true, priceTime:row.lastIssuedValueTime}
        : row;
    });
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
    : issuedCoverage(data, now, issuer, true);
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
export function trackedValuation(data: MarketOverview | null, now: number, scope?: IssuerId) {
  const issuers = ISSUERS.filter((issuer) => !scope || issuer.id === scope).map((issuer) => ({
    ...issuer,
    ...issuerValuation(data, now, issuer.id),
  }));
  const available = issuers.filter((issuer) => issuer.total !== null);
  const rows = issuers.flatMap((issuer) =>
    issuer.rows.map((row) => ({
      symbol: row.symbol,
      issuer: issuer.id,
      lastIssuedValueHistoricalReference: row.lastIssuedValueHistoricalReference,
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
        label: 'Tokenized value',
        basis:
          !observation.circulation && observation.lastCirculation
            ? 'Circulating · last verified'
            : 'Circulating',
      }
    : {
        value: observation.issuedValue ?? (issuer === 'backpack' ? observation.lastIssuedValue : null),
        label: 'Tokenized value',
        basis: issuer === 'backpack' && observation.issuedValue === null && observation.lastIssuedValue !== null
          ? observation.lastIssuedValueHistoricalReference ? 'Minted · stock reference estimate' : 'Minted · last observed'
          : 'Minted',
      };
}
