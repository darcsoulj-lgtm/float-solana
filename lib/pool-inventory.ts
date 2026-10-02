import type { Pool } from './market-data';
import type { CacheRow } from './market-cache';
import { poolObservations, type PoolObservations } from './pool-observations';
import type { StockToken } from './tokens';
import { POOL_POLICY_VERSION } from './stock-pools';
import { poolObservationTime } from './pool-reconciliation';

const key = (token: StockToken) => `pool-inventory-${POOL_POLICY_VERSION}:${token.mint}`;
// Private collector state: identities only. Discovery must never give old
// figures a fresh timestamp or race a canonical market observation write.
export async function readPoolInventory(db: D1Database, tokens: readonly StockToken[]): Promise<Pool[]> {
  const rows = await Promise.all(tokens.map(token => db.prepare('SELECT payload FROM market_cache WHERE key=?')
    .bind(key(token)).first<{payload: string | null}>()));
  return rows.flatMap(row => row?.payload ? JSON.parse(row.payload) as Pool[] : []);
}
export async function rememberPoolInventory(db: D1Database, token: StockToken, pools: readonly Pool[], now: number) {
  const previous = await readPoolInventory(db, [token]);
  const identities = [...new Map([...previous, ...pools].map(pool => [pool.address, {
    ...pool, unavailable: true as const, price: null, change24h: null, volume24h: null, liquidity: null,
    observedAt: undefined,
  }])).values()];
  if (!identities.length) return;
  await db.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at')
    .bind(key(token), JSON.stringify(identities), now).run();
}

export const poolObservationKey = (token: StockToken) => `pool-token-${POOL_POLICY_VERSION}:${token.mint}`;
export async function saveTokenPoolObservation(db: D1Database, token: StockToken, pools: Pool[], now: number) {
  await db.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE market_cache.fetched_at<=excluded.fetched_at')
    .bind(poolObservationKey(token), JSON.stringify(pools), now).run();
}
export function overlayTokenPools(previous: PoolObservations, tokens: readonly StockToken[], rows: Map<string, CacheRow>, now: number): PoolObservations {
  const data = {...previous.data}, asOf = {...previous.asOf};
  for (const token of tokens) {
    const row = rows.get(poolObservationKey(token));
    if (!row?.payload || row.fetched_at > now + 60000 || row.fetched_at <= (asOf[token.symbol] ?? 0)) continue;
    try {
      const pools: unknown = JSON.parse(row.payload);
      if (!Array.isArray(pools)) continue;
      data[token.symbol] = pools;
      asOf[token.symbol] = poolObservationTime(pools,Math.min(row.fetched_at,now));
    } catch { /* Retain the previous verified observation. */ }
  }
  return poolObservations({kind:'pool-observations-v1', data, asOf}, null);
}

export function prioritizePoolDiscovery(mints: readonly string[], checkedAt: ReadonlyMap<string, number>, activity: ReadonlyMap<string, number> = new Map()) {
  return [...mints].sort((a,b)=>(checkedAt.get(a)??0)-(checkedAt.get(b)??0) || (activity.get(b)??0)-(activity.get(a)??0));
}
