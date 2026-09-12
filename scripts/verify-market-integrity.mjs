// Recompute the immutable live audit through current production parsers, then
// exercise live public price/pool HTTP in the deployment's Workers runtime.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  rr = createRequire(require.resolve('wrangler/package.json'));
const { build } = rr('esbuild'),
  { Miniflare } = rr('miniflare');
const root = new URL('../', import.meta.url).pathname;
const audit = JSON.parse(
  fs.readFileSync(
    root + 'research/market-integrity/audit-2026-09-12.json',
    'utf8',
  ),
);
const contents = `export {TOKENS} from './lib/tokens'; export {parsePools,parsePrices,fetchPrices,fetchHistoricalPrices,fetchTokenPools} from './lib/market-data'; export {parseSupplies} from './lib/token-supply'; export {tokenObservation} from './lib/token-observation';`;
const compiled = await build({
  stdin: { contents, resolveDir: root, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const now = Date.parse(audit.completedAt),
  wrap = (data) => ({ data, fetchedAt: now, stale: false, error: null }),
  rows = [];
for (const page of audit.records) {
  const tokens = page.rows.map((r) =>
    api.TOKENS.find((t) => t.mint === r.mint),
  );
  const supplies = api.parseSupplies(page.rpc, now, tokens);
  const data = {
    supplies: wrap(supplies),
    pools: wrap(api.parsePools(page.dex, tokens)),
    prices: wrap(api.parsePrices(page.llama, now)),
    history: wrap(api.parsePrices(page.history, now)),
    markets: wrap({}),
    catalog: wrap([]),
  };
  for (const token of tokens) {
    const observed = api.tokenObservation(data, token.symbol, now),
      raw = page.rpc.result.value[tokens.indexOf(token)].data.parsed.info;
    assert.equal(observed.supply.amount, raw.supply);
    assert.equal(
      observed.supply.supply,
      Number(raw.supply) / 10 ** raw.decimals,
    );
    rows.push({
      symbol: token.symbol,
      issuer: token.issuer,
      price: observed.price,
      priceSource: observed.priceSource,
      change24h: observed.change24h,
      issuedValue: observed.issuedValue,
      supply: observed.supply.supply,
      adjusted: observed.supply.uiSupply,
    });
  }
}
const selected = ['MU', 'GOOGLon', 'NVDAon'];
const records = audit.records
  .flatMap((page) =>
    page.rows.map((r, i) => ({
      symbol: r.symbol,
      mint: r.mint,
      account: page.rpc.result.value[i],
      slot: page.rpc.result.context.slot,
    })),
  )
  .filter((r) => selected.includes(r.symbol));
const workerCode = await build({
  stdin: {
    contents: `
import {TOKENS} from './lib/tokens'; import {fetchPrices,fetchHistoricalPrices,fetchTokenPools} from './lib/market-data'; import {parseSupplies} from './lib/token-supply'; import {tokenObservation} from './lib/token-observation';
export default {async fetch(req,env){
 const tokens=TOKENS.filter(t=>['MU','GOOGLon','NVDAon'].includes(t.symbol));
 const records=JSON.parse(env.RECORDS),now=Date.now(),wrap=data=>({data,fetchedAt:now,stale:false,error:null});
 const supplies=parseSupplies({result:{context:{slot:Math.min(...records.map(r=>r.slot))},value:tokens.map(t=>records.find(r=>r.mint===t.mint).account)}},now,tokens);
 const [prices,history,poolEntries]=await Promise.all([fetchPrices(fetch,tokens),fetchHistoricalPrices(fetch,tokens),Promise.all(tokens.map(async t=>[t.symbol,await fetchTokenPools(t)]))]);
 const pools=Object.fromEntries(poolEntries),data={supplies:wrap(supplies),prices:wrap(prices),history:wrap(history),pools:wrap(pools),markets:wrap({}),catalog:wrap([])};
 return Response.json(tokens.map(t=>({...tokenObservation(data,t.symbol,now),poolCount:pools[t.symbol].length})));
}}`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
});
const worker = new Miniflare({
  modules: true,
  script: workerCode.outputFiles[0].text,
  compatibilityDate: '2026-05-15',
  bindings: { RECORDS: JSON.stringify(records) },
});
let live;
try {
  const response = await worker.dispatchFetch('http://localhost/');
  assert.equal(response.status, 200);
  live = await response.json();
  assert.ok(live.find((r) => r.symbol === 'MU').poolCount > 1);
  assert.equal(
    live.find((r) => r.symbol === 'GOOGLon').priceSource,
    'DefiLlama',
  );
  assert.ok(
    Number.isFinite(live.find((r) => r.symbol === 'GOOGLon').change24h),
  );
} finally {
  await worker.dispose();
}
const output = {
  verifiedAt: new Date().toISOString(),
  mode: 'All-token replay of live captured source responses; live price/history/pool HTTP in Workers, captured finalized supply; no production member session',
  coverage: {
    tokens: rows.length,
    priced: rows.filter((r) => r.price !== null).length,
    change24h: rows.filter((r) => r.change24h !== null).length,
    valued: rows.filter((r) => r.issuedValue !== null).length,
  },
  rows,
  live,
};
fs.writeFileSync(
  root + 'research/market-integrity/verification-2026-09-12.json',
  JSON.stringify(output, null, 2),
);
console.log(
  JSON.stringify(
    {
      coverage: output.coverage,
      live: live.map((r) => ({
        symbol: r.symbol,
        price: r.price,
        change: r.change24h,
        pools: r.poolCount,
      })),
    },
    null,
    2,
  ),
);
