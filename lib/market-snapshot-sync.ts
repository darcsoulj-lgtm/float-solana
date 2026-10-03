import type { MarketEnvironment } from './market-overview-server';
// Heavy provider parsing runs on our public repository's free standard runner.
// Only bounded public market cache rows cross this private service boundary.
const ROOT='https://raw.githubusercontent.com/darcsoulj-lgtm/float-solana/';
const SYNC_KEY='market-snapshot-sync:v1';
export type SnapshotChunkJob={kind:'snapshot';commit:string;hash:string};
export type MarketManifest={version:1;generatedAt:number;commit:string;chunks:string[]};
const hashPattern=/^[a-f0-9]{64}$/;
const allowedKey=/^(backpack-verified-listings-v1|pool-token-stonkfun-v2:[1-9A-HJ-NP-Za-km-z]{32,44}|(?:llama-prices-v3|llama-history-v1|solana-supplies-v4|backpack-catalog-v2|backpack-tickers-v1):[a-zA-Z0-9:-]+)$/;
// Structural validation is shared with the recovery trigger. An old generation
// must be eligible for recollection even when it is too old to import.
export function parseMarketGeneration(raw:unknown,now=Date.now()):MarketManifest {
 const m=raw as Partial<MarketManifest>;
 if(!m||m.version!==1||!Number.isSafeInteger(m.generatedAt)||m.generatedAt!<=0||m.generatedAt!>now+60000||typeof m.commit!=='string'||!/^[a-f0-9]{40}$/.test(m.commit)||!Array.isArray(m.chunks)||!m.chunks.length||m.chunks.length>100||new Set(m.chunks).size!==m.chunks.length||!m.chunks.every(h=>typeof h==='string'&&hashPattern.test(h)))throw Error('Invalid market manifest');
 return m as MarketManifest;
}
export function parseMarketManifest(raw:unknown,now=Date.now()):MarketManifest {
 const m=parseMarketGeneration(raw,now);
 if(now-m.generatedAt>48*3600000)throw Error('Invalid market manifest');
 return m;
}
async function boundedText(url:string,limit:number,fetcher:typeof fetch) {
 const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error(`Market snapshot HTTP ${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw Error('Missing snapshot');
 const decoder=new TextDecoder();let text='',size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit)throw Error('Oversized market snapshot');text+=decoder.decode(r.value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function parseMarketRows(text:string,now=Date.now()) {
 const raw:unknown=JSON.parse(text);
 if(!Array.isArray(raw)||!raw.length||raw.length>10)throw Error('Invalid market snapshot rows');
 return raw.map(row=>{
  if(!row||typeof row.key!=='string'||!allowedKey.test(row.key)||typeof row.payload!=='string'||row.payload.length>85000||!Number.isSafeInteger(row.fetched_at)||row.fetched_at<=0||row.fetched_at>now+60000||/"(?:wallet[^"\\]*|session[^"\\]*|private[^"\\]*)"\s*:/i.test(row.payload))throw Error('Invalid public market row');
  JSON.parse(row.payload); // Never publish malformed provider state.
  return {key:row.key as string,payload:row.payload as string,fetched_at:row.fetched_at as number};
 });
}
export async function syncMarketChunk(env:MarketEnvironment,job:SnapshotChunkJob,fetcher:typeof fetch=fetch) {
 if(!/^[a-f0-9]{40}$/.test(job.commit)||!hashPattern.test(job.hash))throw Error('Invalid snapshot reference');
 const text=await boundedText(ROOT+job.commit+'/chunks/'+job.hash+'.json',100000,fetcher);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==job.hash)throw Error('Snapshot digest mismatch');
 const rows=parseMarketRows(text);
 await env.DB.batch(rows.map(row=>env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=0 WHERE market_cache.fetched_at<excluded.fetched_at')
 .bind(row.key,row.payload,row.fetched_at)));
}
export async function syncMarketSchedule(env:MarketEnvironment & {MARKET_REFRESH:{run(job:SnapshotChunkJob|{kind:'holders'}):Promise<void>}},fetcher:typeof fetch=fetch) {
 const manifest=parseMarketManifest(JSON.parse(await boundedText(ROOT+'market-data/manifest.json?minute='+Math.floor(Date.now()/60000),10000,fetcher)));
 const prior=await env.DB.prepare('SELECT payload FROM market_cache WHERE key=?').bind(SYNC_KEY).first<{payload:string|null}>();
 if(prior?.payload===manifest.commit)return;
 let failures=0;
 for(const hash of manifest.chunks)try{await env.MARKET_REFRESH.run({kind:'snapshot',commit:manifest.commit,hash});}catch(error){failures++;console.error('Market snapshot chunk failed',hash,error instanceof Error?error.message:'unknown');}
 if(failures)throw Error(`${failures} market snapshot chunks failed`);
 await env.DB.prepare('INSERT INTO market_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at')
 .bind(SYNC_KEY,manifest.commit,Date.now()).run();
 console.log('Market snapshot synchronized',{generatedAt:manifest.generatedAt,chunks:manifest.chunks.length});
}
