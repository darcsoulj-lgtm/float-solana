import { SUPPLY_MAX_AGE_MS } from './market-freshness';
import type { CacheRow } from './market-cache';
import type { SourceResult } from './market-data';
import type { StockToken } from './tokens';
import type { MintSupply } from './token-supply';

export const supplyObservationKey = (token: StockToken) => 'supply-token-v1:' + token.mint;
export function overlaySupplyObservations(source: SourceResult<Record<string, MintSupply>>, tokens: readonly StockToken[], rows: Map<string, CacheRow>, now: number) {
  const data = {...source.data}, asOf = {...source.asOf};
  for (const token of tokens) {
    const row = rows.get(supplyObservationKey(token));
    if (!row?.payload || row.fetched_at <= (asOf[token.symbol] ?? source.fetchedAt ?? 0) || row.fetched_at > now + 60000) continue;
    try {
      const supply = JSON.parse(row.payload) as MintSupply;
      if (supply.timestamp !== row.fetched_at || !Number.isFinite(supply.supply) || supply.supply < 0 || !Number.isSafeInteger(supply.decimals) || supply.decimals < 0 || supply.decimals > 18 || !/^\d{1,20}$/.test(supply.amount)) continue;
      data[token.symbol] = supply;
      asOf[token.symbol] = row.fetched_at;
    } catch { /* Invalid source observations never replace a verified value. */ }
  }
  const times = Object.keys(data).map(symbol => asOf[symbol] ?? source.fetchedAt ?? 0);
  return {...source, data: times.length ? data : null, asOf,
    fetchedAt: times.length ? Math.min(...times) || null : source.fetchedAt,
    stale: times.some(time => !time || now - time > SUPPLY_MAX_AGE_MS)};
}
