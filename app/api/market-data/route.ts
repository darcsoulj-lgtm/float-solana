import { communityMember } from '@/lib/community-server';
import { CMC_REFRESH_MS, fetchTokenMarkets } from '@/lib/cmc-data';
import { db, rateLimit, runtime } from '@/lib/server';
import { AppError } from '@/lib/validation';
import { TOKENS, TOKEN_REVIEW_DATE } from '@/lib/tokens';
import {
  MARKET_REFRESH_MS,
  fetchCatalog,
  fetchPools,
  fetchPrices,
  fetchTokenVolumes,
  volumeCacheKey,
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
    await rateLimit('market-data:' + member!.id, 30);
    const symbol = new URL(req.url).searchParams.get('symbol');
    if (symbol && !TOKENS.some((t) => t.symbol === symbol))
      throw new AppError('Unsupported stock.');
    const catalog = await cachedMarket(
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
    const [pools, prices, markets, supplies, volumes] = await Promise.all([
      cachedMarket(
        db(),
        'dex-pools-v1:' + TOKEN_REVIEW_DATE,
        MARKET_REFRESH_MS,
        () => fetchPools(),
      ),
      cachedMarket(
        db(),
        'llama-prices-v1:' + TOKEN_REVIEW_DATE,
        MARKET_REFRESH_MS,
        () => fetchPrices(),
      ),
      cachedMarket(db(), 'cmc-tokens-v1', CMC_REFRESH_MS, () =>
        fetchTokenMarkets(runtime().CMC_API_KEY),
      ),
      cachedMarket(
        db(),
        'solana-supplies-v1:' + TOKEN_REVIEW_DATE,
        MARKET_REFRESH_MS,
        () => fetchSupplies(runtime().SOLANA_RPC_URL),
      ),
      cachedMarket(
        db(),
        volumeCacheKey(runtime().COINGECKO_PRO_API_KEY),
        MARKET_REFRESH_MS,
        () => fetchTokenVolumes(fetch, runtime().COINGECKO_PRO_API_KEY),
      ),
    ]);
    return json({ catalog, pools, prices, markets, supplies, volumes });
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
