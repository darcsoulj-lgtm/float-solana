import { POOL_POLICY_VERSION } from '@/lib/stock-pools';
import { readMarketBatch } from '@/lib/market-service';
import {
  backpackRegistry,
  registryTokens,
  tokenBatchKey,
} from '@/lib/backpack-registry';
import { communityMember } from '@/lib/community-server';
import { CMC_REFRESH_MS, fetchTokenMarkets } from '@/lib/cmc-data';
import { db, rateLimit, runtime } from '@/lib/server';
import { AppError } from '@/lib/validation';
import { TOKEN_REVIEW_DATE, MARKET_BATCH_SIZE } from '@/lib/tokens';
import {
  MARKET_REFRESH_MS,
  MARKET_MAX_AGE_MS,
  fetchCatalog,
  fetchBackpackMarkets,
  BACKPACK_TICKER_REFRESH_MS,
  fetchTokenPools,
  parseBook,
  publicJson,
} from '@/lib/market-data';
import { marketSnapshot } from '@/lib/market-cache';
import { waitUntil } from 'cloudflare:workers';
import { CIRCULATION_MAX_AGE_MS } from '@/lib/xstocks-circulation';
import { circulationSnapshot } from '@/lib/circulation-cache';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function GET(req: Request) {
  const started = performance.now();
  try {
    const member = await communityMember(req);
    await rateLimit('market-data:' + member!.id, 120);
    const database = db();
    const registry = await backpackRegistry(
      database,
      waitUntil,
      runtime().SOLANA_RPC_URL,
    );
    const registryList = registryTokens(registry);
    const snapshot = <T>(key: string, ttl: number, loader: () => Promise<T>) =>
      marketSnapshot(
        database,
        key,
        ttl,
        loader,
        waitUntil,
        Date.now(),
        key.startsWith('xstocks-circulation:')
          ? CIRCULATION_MAX_AGE_MS
          : key.startsWith('book:') || key.startsWith('token-pairs-')
            ? ttl
            : Math.max(ttl, MARKET_MAX_AGE_MS),
      );
    const symbol = new URL(req.url).searchParams.get('symbol');
    if (symbol && !registryList.some((t) => t.symbol === symbol))
      throw new AppError('Unsupported stock.');
    const batchParam = new URL(req.url).searchParams.get('batch') || '0';
    const batch = Number(batchParam);
    if (
      !/^\d+$/.test(batchParam) ||
      !Number.isSafeInteger(batch) ||
      batch < 0 ||
      batch >= Math.ceil(registryList.length / MARKET_BATCH_SIZE)
    )
      throw new AppError('Invalid market page.');
    const tokens = registryList.slice(
      batch * MARKET_BATCH_SIZE,
      (batch + 1) * MARKET_BATCH_SIZE,
    );
    const backpackTokens = registryList.filter((t) => t.issuer === 'backpack');
    const backpackTickerKey =
      'backpack-tickers-v1:' + (await tokenBatchKey(backpackTokens));
    const poolSymbol = new URL(req.url).searchParams.get('pools');
    if (poolSymbol) {
      const token = registryList.find((t) => t.symbol === poolSymbol);
      if (!token) throw new AppError('Unsupported stock.');
      const pools = await snapshot(
        `token-pairs-${POOL_POLICY_VERSION}:` + token.mint,
        MARKET_REFRESH_MS,
        () => fetchTokenPools(token, fetch, registryList),
      );
      return json({ pools });
    }
    if (
      symbol &&
      registryList.find((t) => t.symbol === symbol)!.issuer !== 'backpack'
    )
      return json({ book: null, reason: 'See observed DEX pools below.' });
    const catalog =
      batch > 0 && !symbol
        ? { data: [], fetchedAt: null, stale: false, error: null }
        : await snapshot(
            'backpack-catalog-v2:' +
              TOKEN_REVIEW_DATE +
              ':' +
              (await tokenBatchKey(backpackTokens)),
            300000,
            () => fetchCatalog(fetch, backpackTokens),
          );
    if (symbol) {
      const listing = catalog.data?.find((l) => l.symbol === symbol);
      if (!listing?.spot || catalog.stale)
        return json({
          book: null,
          reason: catalog.stale
            ? 'Backpack market mapping is temporarily unavailable.'
            : 'No Backpack spot order book is listed for this token. RFQ trading may still be available.',
        });
      const market = listing.spot;
      const book = await snapshot('book:' + market, 30000, async () =>
        parseBook(
          await publicJson(
            'https://api.backpack.exchange/api/v1/depth?symbol=' +
              encodeURIComponent(market),
          ),
          market,
        ),
      );
      return json({ book, reason: null });
    }
    const [observations, markets, circulation, backpack] = await Promise.all([
      readMarketBatch(database, tokens, {
        verifiedStocks: registryList,
        rpcUrl: runtime().SOLANA_RPC_URL,
        defer: waitUntil,
      }),
      batch > 0
        ? Promise.resolve({
            data: {},
            fetchedAt: null,
            stale: false,
            error: null,
          })
        : snapshot('cmc-tokens-v2', CMC_REFRESH_MS, () =>
            fetchTokenMarkets(runtime().CMC_API_KEY),
          ),
      batch === 0
        ? circulationSnapshot(database, waitUntil)
        : Promise.resolve(undefined),
      batch === 0
        ? snapshot(backpackTickerKey, BACKPACK_TICKER_REFRESH_MS, () =>
            fetchBackpackMarkets(fetch, backpackTokens),
          )
        : Promise.resolve(undefined),
    ]);
    const response = json({
      registry,
      catalog,
      ...observations,
      markets,
      ...(backpack ? { backpack } : {}),
      ...(circulation ? { circulation } : {}),
      batch,
      totalBatches: Math.ceil(registryList.length / MARKET_BATCH_SIZE),
    });
    response.headers.set(
      'Server-Timing',
      `market_snapshot;dur=${(performance.now() - started).toFixed(1)}`,
    );
    return response;
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    console.error(
      'Market data unavailable',
      e instanceof Error ? e.name : 'unknown',
    );
    return json(
      { error: 'Market data is temporarily unavailable. Please try again.' },
      503,
    );
  }
}
