import {
  calculateHolderTier,
  HOLDER_TIERS,
  type HolderTierResult,
} from './holder-tier';
import type { Holding } from './community-types';
import { registryTokens, type RegistryStatus } from './token-registry';
import { marketBatches, readMarketBatch, emptySource } from './market-service';
import { cachedMarket } from './market-cache';
import { mergeMarketPages, type MarketOverview } from './market-data';
import { CMC_REFRESH_MS, fetchTokenMarkets } from './cmc-data';
import {
  BACKPACK_TICKER_REFRESH_MS,
  fetchBackpackMarkets,
} from './market-data';
import { tokenBatchKey } from './backpack-registry';

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
  registry?: RegistryStatus,
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
    const all = registryTokens(registry);
    const held = new Set(holdings.map((h) => h.symbol));
    const batches = marketBatches(
      all,
      all.filter((t) => held.has(t.symbol)),
    );
    const marketsRequest = batches.length
      ? cachedMarket(database, 'cmc-tokens-v2', CMC_REFRESH_MS, () =>
          fetchTokenMarkets(cmcKey),
        )
      : Promise.resolve(emptySource({}));
    const backpackTokens = all.filter((t) => t.issuer === 'backpack');
    const backpackRequest = backpackTokens.some((t) => held.has(t.symbol))
      ? cachedMarket(
          database,
          'backpack-tickers-v1:' + (await tokenBatchKey(backpackTokens)),
          BACKPACK_TICKER_REFRESH_MS,
          () => fetchBackpackMarkets(fetch, backpackTokens),
        )
      : Promise.resolve(emptySource({}));
    const pages: MarketOverview[] = [];
    // Bound upstream fan-out; use the same shared caches as Markets.
    for (let i = 0; i < batches.length; i += 2) {
      pages.push(
        ...(await Promise.all(
          batches.slice(i, i + 2).map(async (batch) => {
            const [observations, markets, backpack] = await Promise.all([
              readMarketBatch(database, batch, {
                rpcUrl,
                pools: false,
                history: false,
              }),
              marketsRequest,
              backpackRequest,
            ]);
            return {
              ...observations,
              markets,
              backpack,
              registry,
              catalog: emptySource([]),
            };
          }),
        )),
      );
    }
    if (pages.length)
      result = calculateHolderTier(holdings, mergeMarketPages(pages));
  }
  // A temporary quote outage must not erase a still-valid result for the
  // same holdings. Changed balances clear the stored tier during refresh.
  if (!result.tier && result.expiresAt === 0) {
    const previous = await database
      .prepare(
        'SELECT value_tier,value_tier_expires_at FROM community_members WHERE id=?',
      )
      .bind(memberId)
      .first<{ value_tier: string | null; value_tier_expires_at: number }>();
    if (
      previous?.value_tier &&
      previous.value_tier_expires_at > Date.now() &&
      HOLDER_TIERS.some((tier) => tier.id === previous.value_tier)
    )
      result = {
        tier: previous.value_tier as HolderTierResult['tier'],
        expiresAt: previous.value_tier_expires_at,
      };
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
