import { publicJson, SourceHttpError } from './market-data';
import type { PoolProvider } from './pool-provider-adapters';
import { MarketWorkError } from './market-work-store';

const hosts: Record<PoolProvider, readonly string[]> = {
  dexscreener: ['api.dexscreener.com', 'www.stonkfun.xyz'],
  geckoterminal: ['api.geckoterminal.com'],
  orca: ['api.orca.so'],
  raydium: ['api-v3.raydium.io'],
  meteora: ['dlmm.datapi.meteora.ag'],
  'meteora-damm-v1': ['damm-api.meteora.ag'],
  'meteora-damm-v2': ['damm-v2.datapi.meteora.ag'],
  byreal: ['api2.byreal.io'],
  pancakeswap: ['sol-explorer.pancakeswap.com'],
};
export type PoolRequest = (
  provider: PoolProvider,
  url: string,
) => Promise<unknown>;
// Shared D1 slots bound requests across overlapping Workers, not per visitor.
// No API keys/subscriptions. Skipped requests remain missing, never zero.
export function poolProviderRequest(
  db: D1Database,
  fetcher: typeof fetch,
  signal: AbortSignal,
): PoolRequest {
  const calls = new Map<PoolProvider, number>();
  return async (provider, url) => {
    if (!hosts[provider].includes(new URL(url).hostname))
      throw new MarketWorkError('invalid_response',30000,'Untrusted pool provider');
    const count = calls.get(provider) ?? 0;
    if (count >= (provider === 'geckoterminal' ? 8 : 6))
      throw new MarketWorkError('request_budget',30000,'Pool provider request budget reached');
    calls.set(provider, count + 1);
    const now = Date.now(),
      cooldownKey = `provider-cooldown:${provider}`;
    const cooldown = await db
      .prepare('SELECT retry_after FROM market_cache WHERE key=?')
      .bind(cooldownKey)
      .first<{ retry_after: number }>();
    if (cooldown && cooldown.retry_after > now)
      throw new MarketWorkError('provider_cooldown', cooldown.retry_after-now,`${provider} cooling down`);
    const spacing = provider === 'geckoterminal' ? 15000 : 500;
    const slot = await db
      .prepare(
        'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,?)+? WHERE market_cache.retry_after<? RETURNING retry_after',
      )
      .bind(
        `pool-request-slot:${provider}`,
        now + spacing,
        now,
        spacing,
        now + Math.max(6000, spacing + 6000),
      )
      .first<{ retry_after: number }>();
    if (!slot) throw new MarketWorkError('request_budget',30000,'Pool provider queue full');
    const wait = Math.max(0, slot.retry_after - spacing - Date.now());
    if (wait)
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, wait);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    signal.throwIfAborted();
    try {
      return await publicJson(url, (input, init) =>
        fetcher(input, {
          ...init,
          signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        }),
      );
    } catch (error) {
      if (error instanceof SourceHttpError && error.status === 429) {
        await db
          .prepare(
            'INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,NULL,0,?) ON CONFLICT(key) DO UPDATE SET retry_after=MAX(market_cache.retry_after,excluded.retry_after)',
          )
          .bind(cooldownKey, Date.now() + error.retryAfterMs)
          .run();
      }
      throw error;
    }
  };
}
