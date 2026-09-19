import type { StockToken } from './tokens';

export type AssetFilter = 'all' | 'funds' | 'private';
// Conservative discovery filters, not a securities classification. Do not
// infer that every remaining registry item is an ordinary listed share.
export function matchesAssetFilter(token: StockToken, filter: AssetFilter) {
  if (filter === 'all') return true;
  if (filter === 'funds') return /\b(ETF|ETN|fund|trust)\b/i.test(token.name);
  return (
    (token.issuer === 'prestocks' || token.issuer === 'tessera') &&
    token.underlyingSymbol !== 'SPCX'
  );
}

// Registry underlying identity is shared across issuer versions. Preserve each
// token and its own metrics; never invent a consolidated price for a company.
export function groupMarketTokens(tokens: readonly StockToken[]) {
  const groups = new Map<string, StockToken[]>();
  for (const token of tokens) {
    const key = token.underlyingSymbol;
    const group = groups.get(key) ?? [];
    group.push(token);
    groups.set(key, group);
  }
  return [...groups].map(([key, versions]) => ({ key, versions }));
}
