import { TOKENS } from './tokens';
import { SourceHttpError } from './market-data';

export const CIRCULATION_REFRESH_MS = 600000;
export const CIRCULATION_MAX_AGE_MS = 900000;
export type IssuerCirculation = {
  mint: string;
  circulatingSupply: number;
  totalSupply: number;
  referencePriceUsd: number | null;
  valueUsd: number | null;
  currency: string;
  fxDate: string | null;
};
export type ReferenceFx = { hkdUsd: number; date: string };
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function amount(v: unknown): number | null {
  if (
    typeof v !== 'number' &&
    (typeof v !== 'string' || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v))
  )
    return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// This is the public query used by defi.xstocks.fi. Its collateral prices are
// in cents and deployment supplies are already adjusted, scaled by decimals.
// Never apply the onchain multiplier again or sum deployments for a Solana row.
export const XSTOCKS_CIRCULATION_QUERY = `  query Tokens(
    $page: Int!
    $pageSize: Int!
    $where: TokensWhereInput
    $orderBy: TokenSortInput
    $maxAge: Int
    $maxDivergencePercent: Float
    $ignoreCurrentSession: Boolean
  ) {
    tokens(page: $page, pageSize: $pageSize, where: $where, orderBy: $orderBy) {
      nodes {
        symbol
        tokenCollaterals {
          collateral {
            price(
              maxAge: $maxAge
              maxDivergencePercent: $maxDivergencePercent
              ignoreCurrentSession: $ignoreCurrentSession
            )
            priceCurrency
          }
        }
        deployments {
          network
          address
          decimals
          totalSupply
          circulatingSupply
        }
      }
      page {
        totalPages
        totalNodes
      }
    }
  }
`;
export function parseReferenceFx(xml: string, now = Date.now()): ReferenceFx {
  const dates = [...xml.matchAll(/\btime=['"](\d{4}-\d{2}-\d{2})['"]/g)];
  if (dates.length !== 1) throw new Error('Invalid ECB reference date');
  const date = dates[0][1],
    at = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(at) || at > now || now - at > 96 * 3600000)
    throw new Error('Expired ECB reference');
  const rates = new Map<string, number>();
  for (const m of xml.matchAll(
    /currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g,
  )) {
    if (rates.has(m[1])) throw new Error('Duplicate ECB currency');
    rates.set(m[1], Number(m[2]));
  }
  const usd = rates.get('USD'),
    hkd = rates.get('HKD');
  if (!usd || !hkd || !Number.isFinite(usd / hkd))
    throw new Error('Missing ECB currency');
  return { hkdUsd: usd / hkd, date };
}
export function parseCirculationPages(
  rawPages: unknown[],
  fx: ReferenceFx | null,
): Record<string, IssuerCirculation> {
  const out: Record<string, IssuerCirculation> = {};
  const seen = new Set<string>();
  let expected = -1;
  for (const raw of rawPages) {
    const root = record(raw),
      tokens = record(record(root.data).tokens),
      page = record(tokens.page);
    if (
      (root.errors && (!Array.isArray(root.errors) || root.errors.length)) ||
      !Array.isArray(tokens.nodes) ||
      typeof page.totalNodes !== 'number' ||
      !Number.isInteger(page.totalNodes) ||
      page.totalNodes < 1 ||
      page.totalPages !== rawPages.length ||
      (expected !== -1 && expected !== page.totalNodes)
    )
      throw new Error('Incomplete issuer circulation response');
    expected = page.totalNodes;
    for (const node of tokens.nodes) {
      const n = record(node);
      if (typeof n.symbol !== 'string' || seen.has(n.symbol))
        throw new Error('Duplicate issuer asset');
      seen.add(n.symbol);
      const token = TOKENS.find(
        (t) => t.issuer === 'xstocks' && t.symbol === n.symbol,
      );
      if (!token) continue;
      const deployments = Array.isArray(n.deployments)
        ? n.deployments.map(record).filter((d) => d.network === 'Solana')
        : [];
      if (deployments.length !== 1) continue;
      const d = deployments[0];
      if (d.address !== 'svm:' + token.mint && d.address !== token.mint)
        continue;
      if (
        typeof d.decimals !== 'number' ||
        !Number.isInteger(d.decimals) ||
        d.decimals < 0 ||
        d.decimals > 18
      )
        continue;
      const rawSupply = amount(d.circulatingSupply),
        rawTotal = amount(d.totalSupply);
      if (
        rawSupply === null ||
        rawTotal === null ||
        rawSupply > rawTotal * (1 + 1e-12)
      )
        continue;
      const circulatingSupply = rawSupply / 10 ** d.decimals,
        totalSupply = rawTotal / 10 ** d.decimals;
      const collateral =
        Array.isArray(n.tokenCollaterals) && n.tokenCollaterals.length === 1
          ? record(record(n.tokenCollaterals[0]).collateral)
          : {};
      const currency =
        typeof collateral.priceCurrency === 'string'
          ? collateral.priceCurrency
          : 'Unknown';
      const rate =
        currency === 'USD' ? 1 : currency === 'HKD' ? fx?.hkdUsd : null;
      const cents = amount(collateral.price);
      const referencePriceUsd = cents && rate ? (cents / 100) * rate : null;
      const valueUsd =
        circulatingSupply === 0
          ? 0
          : referencePriceUsd === null
            ? null
            : circulatingSupply * referencePriceUsd;
      out[token.symbol] = {
        mint: token.mint,
        circulatingSupply,
        totalSupply,
        referencePriceUsd,
        valueUsd:
          valueUsd !== null && Number.isFinite(valueUsd) ? valueUsd : null,
        currency,
        fxDate: currency === 'HKD' ? (fx?.date ?? null) : null,
      };
    }
  }
  if (seen.size !== expected || !Object.keys(out).length)
    throw new Error('Incomplete issuer asset coverage');
  return out;
}
export async function fetchXstocksCirculationPage(
  page: number,
  fetcher: typeof fetch = fetch,
) {
  const r = await fetcher('https://api.xstocks.fi/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(18000),
    body: JSON.stringify({
      query: XSTOCKS_CIRCULATION_QUERY,
      variables: {
        page,
        // The issuer query expands collateral prices and deployments. Smaller
        // pages finish reliably within the Worker fetch timeout.
        pageSize: 50,
        where: { businessLine: { equals: 'xStocks' } },
        orderBy: { field: 'symbol', direction: 'asc' },
        maxAge: 259200,
        maxDivergencePercent: 25,
        ignoreCurrentSession: true,
      },
    }),
  });
  if (!r.ok) throw new SourceHttpError('api.xstocks.fi', r);
  return r.json();
}

export async function fetchXstocksCirculation(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  const requestPage = (page: number) =>
    fetchXstocksCirculationPage(page, fetcher);
  const [first, fx] = await Promise.all([
    requestPage(0),
    (async () => {
      try {
        const r = await fetcher(
          'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
          { redirect: 'manual', signal: AbortSignal.timeout(10000) },
        );
        if (!r.ok) return null;
        return parseReferenceFx(await r.text(), now);
      } catch {
        return null;
      }
    })(),
  ]);
  const count = record(
    record(record(record(first).data).tokens).page,
  ).totalPages;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20
  )
    throw new Error('Invalid issuer pagination');
  const pages = [first];
  for (let i = 1; i < count; i += 3)
    pages.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(3, count - i) }, (_, j) =>
          requestPage(i + j),
        ),
      )),
    );
  return parseCirculationPages(pages, fx);
}
