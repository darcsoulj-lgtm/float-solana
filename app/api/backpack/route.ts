import { POOL_POLICY_VERSION } from '@/lib/stock-pools';
import {
  marketBatches,
  readMarketBatch,
  emptySource,
} from '@/lib/market-service';
import {
  backpackRegistry,
  registryTokens,
  tokenBatchKey,
} from '@/lib/backpack-registry';
import { waitUntil } from 'cloudflare:workers';
import { db, runtime, rateLimit } from '@/lib/server';
import { marketSnapshot } from '@/lib/market-cache';
import {
  mergeMarketPages,
  fetchCatalog,
  fetchBackpackMarkets,
  BACKPACK_TICKER_REFRESH_MS,
} from '@/lib/market-data';
import {
  PUBLIC_BATCH_SIZE,
  fetchBackpackPools,
} from '@/lib/backpack-dashboard';
import { TOKEN_REVIEW_DATE } from '@/lib/tokens';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const batchText = new URL(req.url).searchParams.get('batch') ?? '0';
  const batch = Number(batchText);
  if (
    !/^\d+$/.test(batchText) ||
    !Number.isSafeInteger(batch) ||
    batch < 0 ||
    batch > 10000
  )
    return Response.json({ error: 'Invalid market page.' }, { status: 400 });
  try {
    await rateLimit(
      'public-backpack:' + (req.headers.get('cf-connecting-ip') || 'anonymous'),
      120,
    );
    const database = db();
    const registry = await backpackRegistry(
      database,
      waitUntil,
      runtime().SOLANA_RPC_URL,
    );
    const registryList = registryTokens(registry);
    const dashboardTokens = registryList.filter((t) => t.issuer === 'backpack');
    const totalBatches = Math.ceil(dashboardTokens.length / PUBLIC_BATCH_SIZE);
    if (batch >= totalBatches) throw new AppError('Invalid market page.');
    const tokens = dashboardTokens.slice(
      batch * PUBLIC_BATCH_SIZE,
      (batch + 1) * PUBLIC_BATCH_SIZE,
    );
    const snapshot = <T>(key: string, ttl: number, loader: () => Promise<T>) =>
      marketSnapshot(database, key, ttl, loader, waitUntil, Date.now(), 300000);
    const suffix = TOKEN_REVIEW_DATE + ':' + (await tokenBatchKey(tokens));
    const [pools, shared, catalog, backpack] = await Promise.all([
      snapshot(
        `dex-pools-backpack-detail-${POOL_POLICY_VERSION}:` + suffix,
        240000,
        () => fetchBackpackPools(tokens, fetch, registryList),
      ),
      Promise.all(
        marketBatches(registryList, tokens).map(async (canonical) => ({
          ...(await readMarketBatch(database, canonical, {
            rpcUrl: runtime().SOLANA_RPC_URL,
            defer: waitUntil,
            pools: false,
          })),
          catalog: emptySource([]),
          markets: emptySource({}),
        })),
      ).then(mergeMarketPages),
      batch === 0
        ? snapshot(
            'backpack-catalog-v2:' +
              TOKEN_REVIEW_DATE +
              ':' +
              (await tokenBatchKey(dashboardTokens)),
            300000,
            () => fetchCatalog(fetch, dashboardTokens),
          )
        : Promise.resolve({
            data: [],
            fetchedAt: null,
            stale: false,
            error: null,
          }),
      batch === 0
        ? snapshot(
            'backpack-tickers-v1:' + (await tokenBatchKey(dashboardTokens)),
            BACKPACK_TICKER_REFRESH_MS,
            () => fetchBackpackMarkets(fetch, dashboardTokens),
          )
        : Promise.resolve({
            data: {},
            fetchedAt: null,
            stale: false,
            error: null,
          }),
    ]);
    const { prices, supplies, history } = shared;
    const pending = [pools, prices, supplies, history, catalog, backpack].some(
      (s) => s && 'refreshing' in s && s.refreshing,
    );
    // Fixed public market DTO: no account, wallet, membership, private balances,
    // credentials or authenticated response caching is shared with this route.
    return Response.json(
      {
        registry,
        pools,
        prices,
        supplies,
        history,
        catalog,
        backpack,
        markets: { data: {}, fetchedAt: null, stale: false, error: null },
        batch,
        totalBatches,
      },
      {
        headers: {
          'Cache-Control': pending
            ? 'public, max-age=0, s-maxage=0'
            : 'public, max-age=15, s-maxage=30',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : 'Market data is temporarily unavailable.',
      },
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
