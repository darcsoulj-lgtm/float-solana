// Read-only Workers-runtime verification. No member or production DB is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url),
  rr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = rr('miniflare'),
  { build } = rr('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const env = ['.dev.vars', '.env']
  .map((f) =>
    fs.existsSync(root + f) ? fs.readFileSync(root + f, 'utf8') : '',
  )
  .join('\n');
const rpc = env.match(/^SOLANA_RPC_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert.ok(rpc, 'Configured read-only RPC required');
const captured = process.argv.includes('--captured-rpc')
  ? JSON.parse(
      fs.readFileSync(
        root + 'research/multi-issuer/mint-accounts-2026-09-12.json',
        'utf8',
      ),
    )
  : null;
const { outputFiles } = await build({
  stdin: {
    contents: `
 import {TOKENS, MARKET_BATCH_SIZE} from './lib/tokens';
 import {fetchPools,fetchPrices} from './lib/market-data';
 import {fetchSupplies} from './lib/token-supply';
 import {issuedCoverage} from './lib/token-observation';
 export default { async fetch(req,env) {
 const batch=Number(new URL(req.url).searchParams.get('batch')||0);
 const tokens=TOKENS.slice(batch*MARKET_BATCH_SIZE,(batch+1)*MARKET_BATCH_SIZE);
 const now=Date.now(), wrap=(data)=>({data,fetchedAt:now,stale:false,error:null});
 const supplyFetch=env.CAPTURED ? async (url,opts) => {
  const captured=JSON.parse(env.CAPTURED),body=JSON.parse(opts.body);
  const records=body.params[0].map(m=>captured.records.find(r=>r.mint===m));
  return Response.json({result:{context:{slot:Math.min(...records.map(r=>r.slot))},value:records.map(r=>r.account)}});
 } : fetch;
 const result=await Promise.allSettled([fetchPools(fetch,tokens),fetchPrices(fetch,tokens),fetchSupplies(env.RPC_URL,supplyFetch,tokens)]);
 const safe=(i)=>result[i].status==='fulfilled'?wrap(result[i].value):{data:null,fetchedAt:null,stale:true,error:'Provider unavailable'};
 const data={pools:safe(0),prices:safe(1),supplies:safe(2),catalog:wrap([]),markets:wrap({})};
 const c=issuedCoverage(data,now);
 return Response.json({batch,tokens:tokens.length,priced:c.pricedCount,supplies:c.supplyCount,valued:c.valued.length,total:c.total,errors:result.map(r=>r.status==='fulfilled'?'fulfilled':String(r.reason?.message).replaceAll(env.RPC_URL,'[RPC]')),data});
 }};`,
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
  script: outputFiles[0].text,
  compatibilityDate: '2026-05-15',
  bindings: {
    RPC_URL: rpc,
    ...(captured ? { CAPTURED: JSON.stringify(captured) } : {}),
  },
});
try {
  const all = [];
  for (
    let batch = 0;
    batch < (process.argv.includes('--one') ? 1 : 15);
    batch++
  ) {
    const response = await worker.dispatchFetch(
      'http://localhost/?batch=' + batch,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    all.push(result);
    const { data: _data, ...summary } = result;
    console.log(JSON.stringify(summary));
  }
  fs.mkdirSync(root + 'research/multi-issuer', { recursive: true });
  fs.writeFileSync(
    root + 'research/multi-issuer/market-runtime-2026-09-12.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: captured
          ? 'live prices and captured finalized RPC responses; no member session'
          : 'live public market data; no member session',
        pages: all,
      },
      null,
      2,
    ),
  );
  assert.ok(
    all.some((r) => r.priced > 0),
    'No live prices returned',
  );
  assert.ok(
    all.every((r) => r.supplies === r.tokens),
    'Incomplete supply checks',
  );
} finally {
  await worker.dispose();
}
