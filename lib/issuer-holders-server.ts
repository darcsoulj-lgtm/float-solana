import { appendHolderHistory, parseHolderHistory } from './holder-history';
import initial from '../public/data/issuer-holders.json';
import { parseHolderSnapshot, type HoldingWallets } from './issuer-holders';
import { holderRegistry } from './issuer-holder-registry';
import { backpackRegistry, registryTokens } from './backpack-registry';
import type { MarketEnvironment } from './market-overview-server';
export const HOLDER_CACHE_KEY = 'issuer-holding-wallets:v1';
const HISTORY_KEY = 'issuer-holding-wallet-history:v1';
export async function readHolderHistory(db: D1Database, now = Date.now()) {
  const row = await db.prepare('SELECT payload FROM market_cache WHERE key=?').bind(HISTORY_KEY).first<{payload:string | null}>();
  return row?.payload ? parseHolderHistory(JSON.parse(row.payload), now) : [];
}
const SNAPSHOT_URL = 'https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/holder-data/issuer-holders.json';
export const holderDocument = (issuers: HoldingWallets[]) => ({version:1, chain:'solana', method:'positive-owner-union-v1', issuers});
export async function readHoldingWallets(db: D1Database, now = Date.now()) {
  const seed = parseHolderSnapshot(initial, now) ?? [];
  try {
    const row = await db.prepare('SELECT payload FROM market_cache WHERE key=?').bind(HOLDER_CACHE_KEY).first<{payload: string | null}>();
    return holderDocument(row?.payload ? parseHolderSnapshot(JSON.parse(row.payload), now) ?? seed : seed);
  } catch { return holderDocument(seed); }
}
export async function refreshHoldingWallets(env: MarketEnvironment, fetcher: typeof fetch = fetch, now = Date.now()) {
  // Existing minute scheduler invokes this; a lease bounds the small aggregate fetch.
  const nextCheck = now + 300000;
  // Reclaim obsolete one-hour leases when migrating to the shorter cadence.
  // An active five-minute lease cannot satisfy the second condition.
  const lease = await env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=excluded.retry_after WHERE market_cache.retry_after<=? OR market_cache.retry_after>? RETURNING key')
    .bind(HOLDER_CACHE_KEY, nextCheck, now, nextCheck).first();
  if (!lease) return;
  const response = await fetcher(SNAPSHOT_URL + '?check=' + Math.floor(now / 300000), {redirect:'manual', signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error(`Holder snapshot HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing holder snapshot');
  let text = '', size = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16384) { await reader.cancel(); throw Error('Oversized holder snapshot'); }
      text += decoder.decode(value, {stream:true});
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const next = parseHolderSnapshot(JSON.parse(text), now);
  if (!next) throw Error('Invalid holder snapshot');
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetcher, now, true);
  const expected = await holderRegistry(registryTokens(registry));
  const previous = (await readHoldingWallets(env.DB, now)).issuers;
  const merged = previous.map(old => {
    const row = next.find(item => item.issuer === old.issuer)!;
    const scope = expected.find(item => item.issuer === row.issuer)!;
    return row.checkedAt > old.checkedAt && row.registryHash === scope.registryHash && row.tokens === scope.mints.length ? row : old;
  });
  const history = appendHolderHistory(await readHolderHistory(env.DB, now), merged, now);
  await env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at')
    .bind(HISTORY_KEY, JSON.stringify(history), now).run();
  if (!merged.some((row, i) => row !== previous[i])) return;
  // Only validated aggregate counts enter the public cache; no addresses.
  await env.DB.prepare('UPDATE market_cache SET payload=?,fetched_at=? WHERE key=? AND retry_after=?')
    .bind(JSON.stringify(holderDocument(merged)), now, HOLDER_CACHE_KEY, nextCheck).run();
}
