import { TOKENS, type StockToken } from './tokens';

// One policy for admission, renewal and participation. Markets scope is separate.
export const COMMUNITY_HOLDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function communityTokens(tokens: readonly StockToken[] = TOKENS) {
  return tokens.filter(token => token.issuer === 'backpack');
}
export async function hasCommunityHolding(database: D1Database, memberId: string, tokens: readonly StockToken[], now = Date.now()) {
  const symbols = communityTokens(tokens).map(token => token.symbol);
  return !!await database.prepare(
    'SELECT 1 FROM community_holdings WHERE member_id=? AND symbol IN (SELECT value FROM json_each(?)) AND verified_at>? AND verified_at<=? AND raw_amount IS NOT NULL AND raw_amount<>\'\' AND raw_amount NOT GLOB \'*[^0-9]*\' AND CAST(raw_amount AS REAL)>0 LIMIT 1',
  ).bind(memberId, JSON.stringify(symbols), now - COMMUNITY_HOLDING_MAX_AGE_MS, now + 1000).first();
}
