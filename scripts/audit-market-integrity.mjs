// Read-only, bounded public-source audit; no member data or production mutations.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))(
  'esbuild',
);
const root = new URL('../', import.meta.url).pathname;
const bundle = await build({
  stdin: {
    contents: `export {TOKENS} from './lib/tokens'; export {parsePools,parsePrices,fetchTokenVolumes} from './lib/market-data'; export {parseSupplies} from './lib/token-supply'; export {tokenObservation} from './lib/token-observation'; export {fetchTokenMarkets} from './lib/cmc-data';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {
  TOKENS,
  parsePools,
  parsePrices,
  parseSupplies,
  tokenObservation,
  fetchTokenMarkets,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const startedAt = Date.now(),
  records = [],
  failures = [];
const get = async (url, options) => {
  const r = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(new URL(url).hostname + ' HTTP ' + r.status);
  return r.json();
};
const wrap = (data) => ({
  data,
  fetchedAt: Date.now(),
  stale: false,
  error: null,
});
const markets = await fetchTokenMarkets().catch((e) => {
  failures.push({ source: 'CMC', error: e.message });
  return {};
});
for (let offset = 0; offset < TOKENS.length; offset += 90) {
  const tokens = TOKENS.slice(offset, offset + 90),
    batch = offset / 90;
  const result = await Promise.allSettled([
    get('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getMultipleAccounts',
        params: [
          tokens.map((t) => t.mint),
          { encoding: 'jsonParsed', commitment: 'finalized' },
        ],
      }),
    }),
    Promise.all(
      [0, 30, 60]
        .map((i) => tokens.slice(i, i + 30))
        .filter((t) => t.length)
        .map((t) =>
          get(
            'https://api.dexscreener.com/tokens/v1/solana/' +
              t.map((t) => t.mint).join(','),
          ),
        ),
    ),
    get(
      'https://coins.llama.fi/prices/current/' +
        tokens.map((t) => 'solana:' + t.mint).join(','),
    ),
    get(
      'https://coins.llama.fi/prices/historical/' +
        Math.floor(startedAt / 1000 - 86400) +
        '/' +
        tokens.map((t) => 'solana:' + t.mint).join(',') +
        '?searchWidth=15m',
    ),
  ]);
  const value = (i) =>
    result[i].status === 'fulfilled' ? result[i].value : null;
  result.forEach((r, i) => {
    if (r.status === 'rejected')
      failures.push({
        batch,
        source: ['rpc', 'dex', 'llama', 'history'][i],
        error: r.reason.message,
      });
  });
  const rpc = value(0),
    dex = value(1)?.flat() || [],
    llama = value(2),
    history = value(3);
  let supplies = {};
  try {
    if (rpc) supplies = parseSupplies(rpc, Date.now(), tokens);
  } catch (e) {
    failures.push({ batch, source: 'rpc', error: e.message });
  }
  const pools = parsePools(dex, tokens),
    prices = llama ? parsePrices(llama) : {};
  const data = {
    supplies: wrap(supplies),
    pools: wrap(pools),
    prices: wrap(prices),
    markets: wrap(markets),
    catalog: wrap([]),
  };
  const rows = tokens.map((t, index) => {
    const o = tokenObservation(data, t.symbol),
      info = rpc?.result?.value?.[index]?.data?.parsed?.info;
    return {
      symbol: t.symbol,
      mint: t.mint,
      issuer: t.issuer,
      supply: o.supply,
      price: o.price,
      priceSource: o.priceSource,
      change24h: o.change24h,
      issuedValue: o.issuedValue,
      poolCount: pools[t.symbol]?.length || 0,
      quotePoolCount: dex.filter((p) => p.quoteToken?.address === t.mint)
        .length,
      llama: prices[t.symbol],
      history: history?.coins?.['solana:' + t.mint],
      metadata: info?.extensions?.find((e) => e.extension === 'tokenMetadata')
        ?.state,
      extensions: info?.extensions?.filter((e) =>
        ['scaledUiAmountConfig', 'interestBearingConfig'].includes(e.extension),
      ),
    };
  });
  records.push({ batch, rows, rpc, dex, llama, history });
  console.log(
    JSON.stringify({
      batch,
      tokens: tokens.length,
      supplies: Object.keys(supplies).length,
      priced: rows.filter((r) => r.price != null).length,
      change: rows.filter((r) => r.change24h != null).length,
      pairs: dex.length,
      quoteOnly: rows.filter((r) => r.quotePoolCount > 0 && !r.poolCount)
        .length,
    }),
  );
}
const samples = [];
for (const symbol of [
  'GOOGLon',
  'MU',
  'SPCX',
  'GOOGLx',
  'NVDAon',
  'NVDAx',
  'TSLAon',
  'BABAon',
  'OPENAI',
  'TSLAr',
]) {
  const t = TOKENS.find((t) => t.symbol === symbol);
  if (!t) continue;
  const result = await Promise.allSettled([
    get('https://api.dexscreener.com/token-pairs/v1/solana/' + t.mint),
    get(
      'https://api.geckoterminal.com/api/v2/networks/solana/tokens/' + t.mint,
    ),
  ]);
  samples.push({
    symbol,
    mint: t.mint,
    pairs: result[0].status === 'fulfilled' ? result[0].value : null,
    gecko: result[1].status === 'fulfilled' ? result[1].value : null,
  });
}
const report = {
  startedAt: new Date(startedAt).toISOString(),
  completedAt: new Date().toISOString(),
  failures,
  records,
  samples,
};
fs.mkdirSync(root + 'research/market-integrity', { recursive: true });
fs.writeFileSync(
  root + 'research/market-integrity/audit-2026-09-12.json',
  JSON.stringify(report, null, 2),
);
const all = records.flatMap((r) => r.rows);
console.log(
  JSON.stringify(
    {
      tokens: all.length,
      supplies: all.filter((r) => r.supply).length,
      priced: all.filter((r) => r.price != null).length,
      change: all.filter((r) => r.change24h != null).length,
      failures,
      sample: samples.find((s) => s.symbol === 'GOOGLon'),
    },
    null,
    2,
  ),
);
