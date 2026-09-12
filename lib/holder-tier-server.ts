import { calculateHolderTier, type HolderTierResult } from './holder-tier';
import type { Holding } from './community-types';
import { TOKENS, TOKEN_REVIEW_DATE, MARKET_BATCH_SIZE } from './tokens';
import { cachedMarket } from './market-cache';
import {
  MARKET_REFRESH_MS,
  fetchPools,
  fetchPrices,
  mergeMarketPages,
  type MarketOverview,
} from './market-data';
import { CMC_REFRESH_MS, fetchTokenMarkets } from './cmc-data';
import { fetchSupplies } from './token-supply';

// A newer verified snapshot must always win over a slow price request.
export const TIER_WRITE_SQL = `UPDATE community_members SET value_tier=?,value_tier_expires_at=?
 WHERE id=? AND suspended=0 AND verified_until>?
 AND (SELECT count(*) FROM community_holdings WHERE member_id=community_members.id)=?
 AND NOT EXISTS(SELECT 1 FROM community_holdings WHERE member_id=community_members.id AND verified_at<>?)
 RETURNING value_tier,value_tier_expires_at`;

export async function updateHolderTier(
  database: D1Database,
  memberId: string,
  rpcUrl?: string,
  cmcKey?: string,
): Promise<HolderTierResult> {
  const unavailable: HolderTierResult = { tier: null, expiresAt: 0 };
  const holdings = (
    await database
      .prepare(
        'SELECT symbol,verified_at,slot,raw_amount,decimals FROM community_holdings WHERE member_id=?',
      )
      .bind(memberId)
      .all<Holding>()
  ).results;
  if (!holdings.length) return unavailable;
  const snapshot = holdings[0].verified_at;
  let result = unavailable;
  if (
    holdings.every((h) => h.verified_at === snapshot) &&
    Date.now() - snapshot < 180000
  ) {
    const batches = [
      ...new Set(
        holdings.map((h) =>
          Math.floor(
            TOKENS.findIndex((t) => t.symbol === h.symbol) / MARKET_BATCH_SIZE,
          ),
        ),
      ),
    ].filter((n) => n >= 0);
    const marketsRequest = cachedMarket(
      database,
      'cmc-tokens-v2',
      CMC_REFRESH_MS,
      () => fetchTokenMarkets(cmcKey),
    );
    const pages: MarketOverview[] = [];
    // Bound upstream fan-out; use the same shared caches as Markets.
    for (let i = 0; i < batches.length; i += 2) {
      pages.push(
        ...(await Promise.all(
          batches.slice(i, i + 2).map(async (batch) => {
            const tokens = TOKENS.slice(
              batch * MARKET_BATCH_SIZE,
              (batch + 1) * MARKET_BATCH_SIZE,
            );
            const suffix = TOKEN_REVIEW_DATE + ':' + batch;
            const [pools, prices, supplies, markets] = await Promise.all([
              cachedMarket(
                database,
                'dex-pools-v4:' + suffix,
                MARKET_REFRESH_MS,
                () => fetchPools(fetch, tokens),
              ),
              cachedMarket(
                database,
                'llama-prices-v3:' + suffix,
                MARKET_REFRESH_MS,
                () => fetchPrices(fetch, tokens),
              ),
              cachedMarket(
                database,
                'solana-supplies-v4:' + suffix,
                MARKET_REFRESH_MS,
                () => fetchSupplies(rpcUrl, fetch, tokens),
              ),
              marketsRequest,
            ]);
            return {
              pools,
              prices,
              supplies,
              markets,
              catalog: {
                data: null,
                fetchedAt: null,
                stale: true,
                error: null,
              },
            };
          }),
        )),
      );
    }
    if (pages.length)
      result = calculateHolderTier(holdings, mergeMarketPages(pages));
  }
  const updated = await database
    .prepare(TIER_WRITE_SQL)
    .bind(
      result.tier,
      result.expiresAt,
      memberId,
      Date.now(),
      holdings.length,
      snapshot,
    )
    .first();
  return updated ? result : unavailable;
}
