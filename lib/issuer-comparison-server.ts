import { marketCacheRows } from './market-cache';
import { backpackRegistry, registryTokens } from './backpack-registry';
import { birdeyeVolumeKey } from './birdeye-volume';
import { COMPARISON_ISSUERS, buildIssuerComparison, type ComparisonIssuer } from './issuer-comparison';
import type { MarketEnvironment } from './market-overview-server';

// Read-only preparation. No provider fetch, new quota, or extra collector.
// Explicitly disabled until a sustainable full-cohort collection is available.
export async function readIssuerComparison(env: MarketEnvironment & { BIRDEYE_COMPARISON_ENABLED?: string }, now = Date.now()) {
  if (env.BIRDEYE_COMPARISON_ENABLED !== '1' || env.BIRDEYE_VOLUME_ENABLED !== '1') return null;
  const registry = await backpackRegistry(env.DB, () => {}, env.SOLANA_RPC_URL, fetch, now, true);
  const tokens = registryTokens(registry).filter(token => COMPARISON_ISSUERS.includes(token.issuer as ComparisonIssuer));
  const rows = await marketCacheRows(env.DB, [...new Set(tokens.map(token => birdeyeVolumeKey(token.mint)))]);
  return buildIssuerComparison(tokens, rows, now);
}
