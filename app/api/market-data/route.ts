import { communityMember } from '@/lib/community-server';
import { CMC_REFRESH_MS, fetchTokenMarkets } from '@/lib/cmc-data';
import { db, rateLimit, runtime } from '@/lib/server';
import { AppError } from '@/lib/validation';
import { TOKENS, TOKEN_REVIEW_DATE, MARKET_BATCH_SIZE } from '@/lib/tokens';
import {
  MARKET_REFRESH_MS,
  fetchCatalog,
  fetchPools,
  fetchPrices,
  fetchHistoricalPrices,
  fetchTokenPools,
  parseBook,
  publicJson,
} from '@/lib/market-data';
import { cachedMarket } from '@/lib/market-cache';
import { fetchSupplies } from '@/lib/token-supply';
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
  try {
    const member = await communityMember(req);
    await rateLimit('market-data:' + member!.id, 120);
    const symbol = new URL(req.url).searchParams.get('symbol');
    if (symbol && !TOKENS.some((t) => t.symbol === symbol))
      throw new AppError('Unsupported stock.');
    const batchParam = new URL(req.url).searchParams.get('batch') || '0';
    const batch = Number(batchParam);
    if (
      !/^\d+$/.test(batchParam) ||
      !Number.isSafeInteger(batch) ||
      batch < 0 ||
      batch >= Math.ceil(TOKENS.length / MARKET_BATCH_SIZE)
    )
      throw new AppError('Invalid market page.');
    const tokens = TOKENS.slice(
      batch * MARKET_BATCH_SIZE,
      (batch + 1) * MARKET_BATCH_SIZE,
    );
    const poolSymbol = new URL(req.url).searchParams.get('pools');
    if (poolSymbol) {
      const token = TOKENS.find((t) => t.symbol === poolSymbol);
      if (!token) throw new AppError('Unsupported stock.');
      const pools = await cachedMarket(
        db(),
        'token-pairs-v1:' + token.mint,
        MARKET_REFRESH_MS,
        () => fetchTokenPools(token),
      );
      return json({ pools });
    }
    if (
      symbol &&
      TOKENS.find((t) => t.symbol === symbol)!.issuer !== 'backpack'
    )
      return json({ book: null, reason: 'See observed DEX pools below.' });
    const catalog =
      batch > 0 && !symbol
        ? { data: [], fetchedAt: null, stale: false, error: null }
        : await cachedMarket(
            db(),
            'backpack-catalog-v1:' + TOKEN_REVIEW_DATE,
            300000,
            () => fetchCatalog(),
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
      const book = await cachedMarket(db(), 'book:' + market, 30000, async () =>
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
    const [pools, prices, markets, supplies, history] = await Promise.all([
      cachedMarket(
        db(),
        'dex-pools-v4:' + TOKEN_REVIEW_DATE + ':' + batch,
        MARKET_REFRESH_MS,
        () => fetchPools(fetch, tokens),
      ),
      cachedMarket(
        db(),
        'llama-prices-v3:' + TOKEN_REVIEW_DATE + ':' + batch,
        MARKET_REFRESH_MS,
        () => fetchPrices(fetch, tokens),
      ),
      batch > 0
        ? Promise.resolve({
            data: {},
            fetchedAt: null,
            stale: false,
            error: null,
          })
        : cachedMarket(db(), 'cmc-tokens-v2', CMC_REFRESH_MS, () =>
            fetchTokenMarkets(runtime().CMC_API_KEY),
          ),
      cachedMarket(
        db(),
        'solana-supplies-v4:' + TOKEN_REVIEW_DATE + ':' + batch,
        MARKET_REFRESH_MS,
        () => fetchSupplies(runtime().SOLANA_RPC_URL, fetch, tokens),
      ),
      cachedMarket(
        db(),
        'llama-history-v1:' + TOKEN_REVIEW_DATE + ':' + batch,
        MARKET_REFRESH_MS,
        () => fetchHistoricalPrices(fetch, tokens),
      ),
    ]);
    return json({
      catalog,
      pools,
      prices,
      markets,
      supplies,
      history,
      batch,
      totalBatches: Math.ceil(TOKENS.length / MARKET_BATCH_SIZE),
    });
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
