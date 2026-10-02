import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bundle } from './helpers/bundle.mjs';
const api = await bundle(
  `export * from './lib/pool-provider-adapters'; export * from './lib/pool-fallback'; export * from './lib/pool-provider-fetch'; export {TOKENS} from './lib/tokens'; export {poolMetrics} from './lib/stock-pools'; export {cachedMarket} from './lib/market-cache'; export {tokenPoolSource} from './lib/pool-observations';`,
);
const djt = api.TOKENS.find(
    (t) => t.symbol === 'DJT' && t.issuer === 'backpack',
  ),
  usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const fixture = async (name) =>
  JSON.parse(
    await readFile(
      new URL('./fixtures/pool-backup/' + name + '.json', import.meta.url),
      'utf8',
    ),
  );
const known = {
  address: 'EucBL6QwwK5TXwqacCYeJZZev7j7PNAks8KpQMYiRE1T',
  dex: 'meteora',
  baseMint: djt.mint,
  quoteMint: usdc,
  quote: 'USDC',
  price: 9,
  change24h: 1,
  liquidity: 100,
  volume24h: 900,
  url: '',
};
void test('detail and list share token freshness and partial observations', () => {
  const source = {data:{DJT:[known,{...known,address:'missing',unavailable:true,volume24h:null,liquidity:null}]},asOf:{DJT:990000,OTHER:1},fetchedAt:1,stale:true,error:'other token old'};
  const detail = api.tokenPoolSource(source,'DJT',1000000);
  assert.equal(detail.fetchedAt,990000);
  assert.equal(detail.stale,false);
  assert.equal(api.poolMetrics(detail.data).volume24h,null);
  assert.match(detail.error,/Some pools/);
  assert.equal(api.tokenPoolSource(source,'DJT',1300000).stale,true);
  assert.equal(api.tokenPoolSource(source,'UNKNOWN',1000000).data,null);
  assert.equal(api.tokenPoolSource({...source,asOf:{DJT:2000000}},'DJT',1000000).stale,true);
});
for (const provider of ['geckoterminal', 'orca', 'raydium', 'meteora'])
  void test(
    provider + ' real-response adapter uses exact mint and USD volume',
    async () => {
      const raw = await fixture(
        provider === 'geckoterminal' ? 'gecko' : provider,
      );
      const data = api.parseProviderPools(
        provider,
        raw,
        [djt],
        api.TOKENS,
        [],
        100,
      );
      assert.ok(data.DJT.length);
      assert.ok(
        data.DJT.every(
          (p) =>
            p.source === provider &&
            p.observedAt === 100 &&
            (p.baseMint === djt.mint || p.quoteMint === djt.mint),
        ),
      );
      if (provider !== 'geckoterminal')
        assert.ok(data.DJT.every((p) => p.price === null)); // No ratio mistaken for USD.
      const spoof = api.parseProviderPools(
        provider,
        raw,
        [{ ...djt, mint: usdc }],
        [],
        [],
        100,
      );
      assert.equal(spoof.DJT.length, 0);
    },
  );
void test('Indexer zero after prior activity remains unknown until corroborated by the venue', async () => {
  const parsed = api.parseProviderPools(
    'geckoterminal',
    await fixture('gecko-missing'),
    [djt],
    api.TOKENS,
    [],
    100,
  ).DJT;
  const result = api.resolvePoolSources([...parsed, ...parsed], [known], djt);
  assert.equal(result.length, 2);
  assert.equal(api.poolMetrics(result).volume24h, null);
  assert.equal(api.poolMetrics(result).partial, true);
});
void test('source disagreement is flagged instead of choosing or summing larger volume', () => {
  const a = { ...known, source: 'dexscreener', volume24h: 10000 },
    b = { ...known, source: 'geckoterminal', volume24h: 20000 };
  const result = api.resolvePoolSources([a, b], [known], djt);
  assert.equal(result.length, 1);
  assert.equal(result[0].volume24h, null);
  assert.equal(result[0].volumeDisputed, true);
  assert.equal(api.poolMetrics(result).partial, true);
  const consistent = api.resolvePoolSources(
    [a, { ...b, volume24h: 10100 }],
    [known],
    djt,
  );
  assert.equal(consistent[0].volume24h, 10000);
});
void test('DEX cooldown does not block Gecko fallback; no primary DEX request is made', async () => {
  const calls = [];
  const raw = await fixture('gecko-missing');
  const data = await api.collectPoolFallbacks({
    tokens: [djt],
    verified: api.TOKENS,
    known: [known],
    detailMints: [],
    dexAvailable: false,
    primary: async (input) => {
      assert.match(String(input), /stonkfun/);
      return Response.json({ data: { tokens: [] } });
    },
    request: async (provider, url) => {
      calls.push([provider, url]);
      return raw;
    },
  });
  assert.ok(calls.some(([provider])=>provider==='geckoterminal'));
  assert.equal(data.DJT.find((p) => p.address === known.address).volume24h, null);
  assert.ok(calls.some(([provider])=>provider==='meteora'));
});
void test('Gecko failure falls through to exact venue; total outage preserves old timestamp by rejecting', async () => {
  const meteora = await fixture('meteora');
  const missing = meteora.data.find((p) => p.address === known.address);
  const opts = {
    tokens: [djt],
    verified: api.TOKENS,
    known: [known],
    detailMints: [],
    dexAvailable: false,
    primary: async () => Response.json({ data: { tokens: [] } }),
  };
  const data = await api.collectPoolFallbacks({
    ...opts,
    request: async (provider) => {
      if (provider === 'meteora') return { data: missing };
      throw Error('offline');
    },
  });
  assert.equal(data.DJT[0].source, 'meteora');
  assert.equal(data.DJT[0].volume24h, 0);
  await assert.rejects(
    api.collectPoolFallbacks({
      ...opts,
      request: async () => {
        throw Error('all offline');
      },
    }),
    /No pool provider/,
  );
});
void test('new-token discovery runs without DEX or known pool addresses', async () => {
  const raw = await fixture('gecko');
  let n = 0;
  const data = await api.collectPoolFallbacks({
    tokens: [djt],
    verified: api.TOKENS,
    known: [],
    detailMints: [djt.mint],
    dexAvailable: false,
    primary: async () => Response.json({ data: { tokens: [] } }),
    request: async (provider, url) => {
      if (provider === 'geckoterminal') {
        n++;
        assert.match(url, /tokens\//);
        return raw;
      }
      throw Error('offline');
    },
  });
  assert.equal(n, 2);
  assert.ok(data.DJT.length);
});
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(
    'CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)',
  );
  return {
    raw,
    db: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              first: async () => raw.prepare(sql).get(...args) ?? null,
              run: async () => raw.prepare(sql).run(...args),
            };
          },
        };
      },
    },
  };
}
void test('provider cooldown and budget are shared, independent and cannot be bypassed by another caller', async () => {
  const { raw, db } = database();
  let calls = 0;
  raw
    .prepare('INSERT INTO market_cache VALUES (?,NULL,0,?)')
    .run('provider-cooldown:geckoterminal', Date.now() + 60000);
  const req = api.poolProviderRequest(
    db,
    async () => {
      calls++;
      return Response.json({ data: [] });
    },
    new AbortController().signal,
  );
  await assert.rejects(
    req(
      'geckoterminal',
      'https://api.geckoterminal.com/api/v2/networks/solana/pools',
    ),
    /cooling down/,
  );
  assert.equal(calls, 0);
  await req('orca', 'https://api.orca.so/v2/solana/pools');
  assert.equal(calls, 1);
  await assert.rejects(req('orca', 'https://evil.example/pools'), /Untrusted/);
  raw.close();
});
void test('composite cache is not gated by DEX provider cooldown', async () => {
  const { raw, db } = database();
  const now = Date.now();
  raw
    .prepare('INSERT INTO market_cache VALUES (?,NULL,0,?)')
    .run('provider-cooldown:dexscreener', now + 60000);
  let n = 0;
  const result = await api.cachedMarket(
    db,
    'dex-pools-composite',
    1000,
    async () => {
      n++;
      return { ok: true };
    },
    now,
    undefined,
    180000,
    true,
  );
  assert.equal(n, 1);
  assert.equal(result.data.ok, true);
  raw.close();
});
void test('a full shared provider queue makes another worker defer without a network request', async()=>{
 const {raw,db}=database();let calls=0;
 raw.prepare('INSERT INTO market_cache VALUES (?,NULL,0,?)').run('pool-request-slot:geckoterminal',Date.now()+60000);
 const request=api.poolProviderRequest(db,async()=>{calls++;return Response.json({data:[]});},new AbortController().signal);
 await assert.rejects(request('geckoterminal','https://api.geckoterminal.com/api/v2/networks/solana/pools'),/queue full/);
 assert.equal(calls,0);raw.close();
});
void test('empty newly discovered pools do not grow the permanent retry set; known zero pools remain valid',()=>{
 const p={...known,source:'meteora',volume24h:0,liquidity:0};
 assert.equal(api.resolvePoolSources([p],[],djt).length,0);
 assert.equal(api.resolvePoolSources([p],[known],djt)[0].volume24h,0);
});

void test('zero primary response triggers bounded venue fallback and stays unresolved across failed retries',async()=>{
 const old={...known,dex:'raydium',volume24h:44000};
 const raw={chainId:'solana',pairAddress:old.address,dexId:'raydium',baseToken:{address:djt.mint},quoteToken:{address:usdc},volume:{h24:0},liquidity:{usd:100}};
 const calls=[];
 const options={tokens:[djt],verified:api.TOKENS,known:[old],detailMints:[],dexAvailable:true,
 primary:async input=>{const url=String(input);return Response.json(url.includes('stonkfun')?{data:{tokens:[]}}:url.includes('/latest/dex/pairs/')?{pairs:[raw]}:[raw]);},
 request:async(provider)=>{calls.push(provider);throw Error('offline');}};
 const first=await api.collectPoolFallbacks(options);
 assert.ok(calls.includes('geckoterminal'));assert.ok(calls.includes('raydium'));
 assert.equal(api.poolMetrics(first.DJT).volume24h,null);
 calls.length=0;
 const second=await api.collectPoolFallbacks({...options,known:first.DJT});
 assert.ok(calls.includes('raydium'));assert.equal(api.poolMetrics(second.DJT).volume24h,null);
 const recovered=await api.collectPoolFallbacks({...options,known:second.DJT,request:async provider=>{
 if(provider!=='raydium')throw Error('offline');
 return {success:true,data:[{id:old.address,mintA:{chainId:101,address:djt.mint},mintB:{chainId:101,address:usdc},tvl:100,day:{volume:0}}]};}});
 assert.equal(api.poolMetrics(recovered.DJT).volume24h,null);
 assert.equal(api.poolMetrics(recovered.DJT).partial,true);
 const corroborated=api.resolvePoolSources([{...old,source:"dexscreener",volume24h:0,observedAt:Date.now()},{...old,source:"geckoterminal",volume24h:0,observedAt:Date.now()}],second.DJT,djt);
 assert.equal(api.poolMetrics(corroborated).volume24h,0);
});
void test('zero versus positive volume is a conflict even below the usual dollar threshold',()=>{
 const result=api.resolvePoolSources([{...known,source:'dexscreener',volume24h:0},{...known,source:'meteora',volume24h:50}],[known],djt);
 assert.equal(api.poolMetrics(result).volume24h,null);assert.equal(result[0].volumeDisputed,true);
});
void test('DRAM regression: Gecko discovers ZeroFi outside the primary subset and Meteora refreshes all eight known pools in one mint request',async()=>{
 const dram=api.TOKENS.find(t=>t.symbol==='DRAM'&&t.issuer==='backpack');
 const gecko=await fixture('dram-gecko'), meteora=await fixture('dram-meteora');
 const old=api.parseProviderPools('meteora',meteora,[dram],api.TOKENS,[],1).DRAM;
 assert.ok(old.length>=8);
 const calls=[];
 const result=await api.collectPoolFallbacks({tokens:[dram],verified:api.TOKENS,known:old,detailMints:[dram.mint],mode:'discovery',dexAvailable:false,
 primary:async()=>Response.json({data:{tokens:[]}}),request:async(provider,url)=>{
 calls.push([provider,url]);if(provider==='geckoterminal')return gecko;if(provider==='meteora')return meteora;throw Error('offline');}});
 const zerofi=result.DRAM.find(p=>p.address==='AoFqHa5Mm7GDD81S9P69ibtUuLBZa2JpDZH3jz3YcXCr');
 assert.ok(zerofi);assert.equal(zerofi.dex,'zerofi');assert.ok(zerofi.volume24h>0);
 assert.equal(result.DRAM.filter(p=>p.address===zerofi.address).length,1);
 assert.equal(calls.filter(([p])=>p==='meteora').length,1);
 assert.ok(calls.find(([p])=>p==='meteora')[1].includes('query='+dram.mint));
 assert.ok(result.DRAM.filter(p=>p.dex==='meteora').every(p=>p.volume24h!==null));
});
void test('backups are dispatched while the primary request is still pending',async()=>{
 const raw=await fixture('meteora');let release;const held=new Promise(r=>{release=r;});let started=false;
 const primary=async input=>{if(String(input).includes('stonkfun'))return Response.json({data:{tokens:[]}});await held;throw Error('primary timeout');};
 const pending=api.collectPoolFallbacks({tokens:[djt],verified:api.TOKENS,known:[known],detailMints:[],dexAvailable:true,primary,
 request:async provider=>{if(provider==='meteora'){started=true;return {data:raw.data.find(p=>p.address===known.address)};}throw Error('offline');}});
 await new Promise(r=>setTimeout(r,10));assert.equal(started,true);release();
 const result=await pending;assert.equal(result.DJT[0].source,'meteora');
});
void test('a later provider throttle preserves successful discovery values without renewing their observation time',async()=>{
 const dram=api.TOKENS.find(t=>t.symbol==='DRAM'&&t.issuer==='backpack'), now=Date.now();
 const discovered=api.parseProviderPools('geckoterminal',await fixture('dram-gecko'),[dram],api.TOKENS,[],now-90000).DRAM;
 const options={tokens:[dram],verified:api.TOKENS,known:discovered,detailMints:[],dexAvailable:false,now,
  primary:async()=>Response.json({data:{tokens:[]}}),request:async()=>{throw Error('429');},recent:discovered};
 const result=await api.collectPoolFallbacks(options);
 const pool=result.DRAM.find(p=>p.dex==='zerofi');
 assert.ok(pool.volume24h>0);assert.equal(pool.observedAt,now-90000);
 const fresher={...pool,volume24h:pool.volume24h*2,observedAt:now};
 const chosen=api.resolvePoolSources([pool,fresher],discovered,dram).find(p=>p.address===pool.address);
 assert.equal(chosen.volume24h,fresher.volume24h);assert.equal(chosen.observedAt,now);assert.ok(!chosen.volumeDisputed);
 await assert.rejects(api.collectPoolFallbacks({...options,now:now+300000}),/No pool provider/);
 await assert.rejects(api.collectPoolFallbacks({...options,recent:discovered.map(p=>({...p,observedAt:now+60001}))}),/No pool provider/);
});
