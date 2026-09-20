import type { StockToken } from './tokens';

export type AssetFilter = 'all' | 'stocks' | 'funds' | 'private';
// Some issuer records carry a ticker-only name. Classify every version of a
// known fund together, rather than showing its abbreviated version as a stock.
const tickerOnlyFunds = new Set(['SPY', 'GLD', 'SLV', 'QQQ', 'SQQQ', 'TQQQ']);
const hasFundName = (token: StockToken) =>
  /\b(ETF|ETN|fund)\b|^iShares .+ Trust$/i.test(token.name);
export function fundUnderlyings(tokens: readonly StockToken[]) {
  return new Set([
    ...tickerOnlyFunds,
    ...tokens.filter(hasFundName).map((token) => token.underlyingSymbol),
  ]);
}
const isFund = (token: StockToken, knownFunds: ReadonlySet<string>) =>
  knownFunds.has(token.underlyingSymbol) || hasFundName(token);
const isPrivateExposure = (token: StockToken) =>
  (token.issuer === 'prestocks' || token.issuer === 'tessera') &&
  token.underlyingSymbol !== 'SPCX';
// Conservative discovery filters, not a securities classification. Do not
// infer that every remaining registry item is an ordinary listed share.
export function matchesAssetFilter(
  token: StockToken,
  filter: AssetFilter,
  knownFunds: ReadonlySet<string> = tickerOnlyFunds,
) {
  if (filter === 'all') return true;
  if (filter === 'funds') return isFund(token, knownFunds);
  if (filter === 'private') return isPrivateExposure(token);
  return !isFund(token, knownFunds) && !isPrivateExposure(token);
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

export function marketAssetPath(underlyingSymbol: string, tokenSymbol?: string) {
  const path = `/markets/${encodeURIComponent(underlyingSymbol.toLowerCase())}`;
  return tokenSymbol ? `${path}?token=${encodeURIComponent(tokenSymbol)}` : path;
}
