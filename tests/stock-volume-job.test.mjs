import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { bundle } from './helpers/bundle.mjs';
const a=await bundle("export * from './lib/stock-volume-job';export * from './lib/stock-volume-published';");
function database(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)');const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return {results:raw.prepare(sql).all(...this.args)};},async run(){return raw.prepare(sql).run(...this.args);}};}};return {raw,db};}
const now=Date.parse('2026-10-04T12:00:00Z');
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'fixture-key',alg:'RS256'};
const claims=()=>({iss:'https://token.actions.githubusercontent.com',aud:a.STOCK_VOLUME_AUDIENCE,sub:'repo:darcsoulj-lgtm/float-solana:ref:refs/heads/main',repository:'darcsoulj-lgtm/float-solana',repository_id:'1369155506',repository_owner_id:'273481610',ref:'refs/heads/main',workflow_ref:'darcsoulj-lgtm/float-solana/.github/workflows/stock-volume.yml@refs/heads/main',event_name:'schedule',iat:now/1000,nbf:now/1000,exp:now/1000+300,jti:'fixture'});
async function jwt(changes={}){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const input=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode({...claims(),...changes});return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,Buffer.from(input))).toString('base64url');}
const fetcher=async url=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]});};
const request=async body=>new Request('https://joinfloat.xyz/api/stock-volume-job',{method:'POST',headers:{Authorization:'Bearer '+await jwt()},body:JSON.stringify(body)});
void test('signed workflow identity binds repository, branch, workflow, audience and expiry',async()=>{
 assert.equal((await a.verifyStockJobIdentity(await jwt(),fetcher,now)).repository,claims().repository);
 assert.equal((await a.verifyStockJobIdentity(await jwt({sub:'repo:darcsoulj-lgtm@273481610/float-solana@1369155506:ref:refs/heads/main'}),fetcher,now)).repository_id,'1369155506');
 for(const change of [{repository_id:'other'},{repository_owner_id:'other'},{sub:'repo:darcsoulj-lgtm@1/float-solana@2:ref:refs/heads/main'},{aud:'wrong'},{repository:'other/repo'},{ref:'refs/pull/1/merge'},{workflow_ref:'other'},{event_name:'pull_request'},{exp:now/1000-1},{iat:now/1000-1000},{nbf:now/1000+90},{exp:now/1000+3600}])await assert.rejects(a.verifyStockJobIdentity(await jwt(change),fetcher,now));
 const forged=(await jwt()).split('.');forged[1]=Buffer.from(JSON.stringify({...claims(),jti:'changed'})).toString('base64url');await assert.rejects(a.verifyStockJobIdentity(forged.join('.'),fetcher,now));
});
void test('unauthenticated and disabled callers cannot receive credentials or mutate state',async()=>{
 const {raw,db}=database();const env={DB:db,STOCK_VOLUME_ENABLED:'1',BIRDEYE_API_KEY:'fixture-bird',APCA_API_KEY_ID:'fixture-id',APCA_API_SECRET_KEY:'fixture-secret'};
 const denied=await a.stockVolumeJob(new Request('https://joinfloat.xyz/api/stock-volume-job',{method:'POST',body:'{"action":"begin"}'}),env,fetcher,now);assert.equal(denied.status,403);assert.equal(raw.prepare('SELECT COUNT(*) n FROM market_cache').get().n,0);
 const disabled=await a.stockVolumeJob(await request({action:'begin'}),{...env,STOCK_VOLUME_ENABLED:'0'},fetcher,now);assert.equal(disabled.status,404);raw.close();
});
void test('comparison reservation bounds concurrent daily attempts and rolling budget across month change',async()=>{
 const {raw,db}=database();assert.equal((await Promise.all(Array.from({length:6},()=>a.reserveStockComparison(db,now)))).filter(Boolean).length,2);
 for(let day=1;day<20;day++){assert.equal(await a.reserveStockComparison(db,now+day*86400000),true);assert.equal(await a.reserveStockComparison(db,now+day*86400000),true);}
 assert.equal(await a.reserveStockComparison(db,now+20*86400000),false);assert.equal(await a.reserveStockComparison(db,now+32*86400000),true);raw.close();
});
void test('publish validates complete data, keeps prior results on failure and rejects older windows',async()=>{
 const {raw,db}=database(),env={DB:db,STOCK_VOLUME_ENABLED:'1',BIRDEYE_API_KEY:'fixture-bird',APCA_API_KEY_ID:'fixture-id',APCA_API_SECRET_KEY:'fixture-secret'};
 const c={...a.publishedStockVolumeComparisons()[0],startUtc:'2026-10-03T04:00:00Z',endUtc:'2026-10-04T04:00:00Z',selectionBasis:'latest-market-volume',selectedAt:now-10000,generatedAt:now-1000};
 assert.equal((await a.stockVolumeJob(await request(null),env,fetcher,now)).status,400);
 const started=await a.stockVolumeJob(await request({action:'begin'}),env,fetcher,now);assert.equal(started.headers.get('cache-control'),'no-store');assert.equal((await started.json()).alpacaId,'fixture-id');
 const prior={...c,startUtc:'2026-10-02T04:00:00Z',endUtc:'2026-10-03T04:00:00Z'};
 assert.equal((await a.stockVolumeJob(await request({action:'publish',comparison:prior}),env,fetcher,now)).status,204);
 assert.equal((await a.stockVolumeJob(await request({action:'publish',comparison:c}),env,fetcher,now)).status,204);
 const history=(await a.readStockVolume(db,now)).history;assert.equal(history.length,1);assert.equal(Date.parse(history[0].endUtc),Date.parse(prior.endUtc));assert.ok(history[0].rows.every(r=>r.stockUsd>0));
 assert.equal((await a.readStockVolume(db,now)).status,'daily');assert.equal((await a.readStockVolume(db,now)).comparisons[0].endUtc,c.endUtc);
 assert.equal((await a.stockVolumeJob(await request({action:'publish',comparison:{...c,rows:c.rows.slice(0,4)}}),env,fetcher,now)).status,422);
 const old={...c,startUtc:'2026-10-02T04:00:00Z',endUtc:'2026-10-03T04:00:00Z'};assert.equal((await a.stockVolumeJob(await request({action:'publish',comparison:old}),env,fetcher,now)).status,409);
 await a.stockVolumeJob(await request({action:'failed'}),env,fetcher,now);const result=await a.readStockVolume(db,now);assert.equal(result.status,'delayed');assert.equal(result.comparisons[0].endUtc,c.endUtc);assert.ok(!JSON.stringify(result).includes('fixture-secret'));raw.close();
});
void test('missing or corrupt cache retains dated fallback and becomes delayed when overdue',async()=>{
 const {raw,db}=database();assert.equal((await a.readStockVolume(db,now)).status,'delayed');raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(a.STOCK_VOLUME_KEY,'{"period":1}',now);assert.equal((await a.readStockVolume(db,now)).comparisons[0].coverage.available,70);raw.close();
});
void test('collector exercises DST, sparse histories, newly listed identities, missing data, corrections, reconciliation and pagination',()=>{
 const result=spawnSync(process.env.FLOAT_PYTHON??'python3',['-m','unittest','discover','-s','scripts/stock-volume','-p','test_*.py'],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr);
});
