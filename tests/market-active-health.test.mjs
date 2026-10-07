import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {bundle} from './helpers/bundle.mjs';
const api=await bundle(`export * from './lib/market-active-health';export * from './lib/expired-record-cleanup';export {backpackHistoryKey} from './lib/backpack-reference';export {birdeyeVolumeKey} from './lib/birdeye-volume';`);
const HOUR=3600000,now=Date.now(),token={issuer:'backpack',mint:'1'.repeat(32),symbol:'MU',name:'Micron',shortName:'Micron',underlyingSymbol:'MU',source:'fixture'};
const other={...token,mint:'2'.repeat(32),symbol:'NVDA'};
function fixture(tokens=[token]){
 const market={backpack:{data:{MU:{externalPrice:100,externalChange24h:2,externalBasis:'hourly-history',externalObservedAt:now-36*HOUR}},fetchedAt:now-36*HOUR},supplies:{data:{MU:{supply:20}},asOf:{MU:now},fetchedAt:now},tokenVolumes:{intervalMs:14*HOUR,data:{MU:{mint:token.mint,usd24h:50,observedAt:now,collectedAt:now}}}};
 const controls=new Map([['public-backpack-snapshot:v1',{payload:'{}',fetched_at:now,retry_after:0}],[api.backpackHistoryKey(token.mint),{payload:'{}',fetched_at:now,retry_after:0}],['birdeye-schedule:v1',{payload:JSON.stringify({status:'ok',checkedAt:now}),fetched_at:now,retry_after:now+60000}]]);
 return{market,tokens,controls,firstSeen:Object.fromEntries(tokens.map(t=>[t.mint,now-2*HOUR])),holder:{issuer:'backpack',registryHash:'scope',tokens:tokens.length,checkedAt:now},holderScope:{registryHash:'scope',mints:tokens.map(t=>t.mint)},activityAt:now,volumeEnabled:true,now};
}
void test('a closed stock market with unchanged dated candles is healthy while history checks run',()=>{
 const input=fixture();assert.deepEqual(api.activeHealthIssues(input),[]);
 input.controls.get(api.backpackHistoryKey(token.mint)).fetched_at=now-3*HOUR;
 assert.deepEqual(api.activeHealthIssues(input),[{source:'reference-history',code:'history_collection_overdue',affected:1}]);
});
void test('new verified listings receive bounded grace then missing references and supplies are reported',()=>{
 const input=fixture([token,other]);input.firstSeen[other.mint]=now;
 assert.deepEqual(api.activeHealthIssues(input),[]);
 input.firstSeen[other.mint]=now-2*HOUR;
 assert.deepEqual(api.activeHealthIssues(input).map(i=>i.source),['references','supplies']);
});
void test('never-indexed partial Birdeye coverage is distinct from previously collected volume aging out',()=>{
 const input=fixture([token,other]);input.market.backpack.data.NVDA={...input.market.backpack.data.MU};input.market.supplies.data.NVDA={supply:3};input.market.supplies.asOf.NVDA=now;
 input.controls.set(api.backpackHistoryKey(other.mint),{payload:'{}',fetched_at:now,retry_after:0});
 assert.deepEqual(api.activeHealthIssues(input),[]);
 input.controls.set(api.birdeyeVolumeKey(other.mint),{payload:'{"old":true}',fetched_at:now-80*HOUR,retry_after:0});
 assert.ok(api.activeHealthIssues(input).some(i=>i.source==='volume'&&i.affected===1));
 input.market.tokenVolumes.data.MU.observedAt=now-17*HOUR;
 input.market.tokenVolumes.data.MU.collectedAt=now-17*HOUR;
 assert.ok(api.activeHealthIssues(input).some(i=>i.source==='volume'&&i.affected===2));
});
void test('fresh collection with older provider data is disclosed separately; missed collection and expired data still fail',()=>{
 const input=fixture();input.market.tokenVolumes.data.MU.observedAt=now-17*HOUR;
 assert.deepEqual(api.activeHealthIssues(input),[]);
 assert.deepEqual(api.activeHealthWarnings(input),[{source:'volume',code:'volume_source_delayed',affected:1}]);
 input.market.tokenVolumes.data.MU.collectedAt=now-17*HOUR;
 assert.deepEqual(api.activeHealthIssues(input),[{source:'volume',code:'volume_coverage_overdue',affected:1}]);
 assert.deepEqual(api.activeHealthWarnings(input),[]);
 input.market.tokenVolumes.data.MU.collectedAt=now;input.market.tokenVolumes.data.MU.observedAt=now-73*HOUR;
 input.controls.set(api.birdeyeVolumeKey(token.mint),{payload:'{"old":true}',fetched_at:now,retry_after:0});
 assert.ok(api.activeHealthIssues(input).some(i=>i.code==='volume_coverage_overdue'));
});
void test('provider warnings remain visible in a healthy public response and malformed warnings cannot pass',async()=>{
 let payload=JSON.stringify({version:1,status:'ok',checkedAt:now,issues:[],warnings:[{source:'volume',code:'volume_source_delayed',affected:1,private:'secret'}]});
 const db={prepare(){return{bind(){return this;},async first(){return{payload};}};}};
 assert.deepEqual((await api.readActiveMarketHealth(db,now)).warnings,[{source:'volume',code:'volume_source_delayed',affected:1}]);
 payload=JSON.stringify({version:1,status:'ok',checkedAt:now,issues:[],warnings:[{source:'collector',code:'ignored_failure',affected:1}]});
 assert.equal((await api.readActiveMarketHealth(db,now)).status,'unavailable');
});
void test('dead volume collector, stale supply, holder scope changes, and missed activity are independently actionable',()=>{
 const input=fixture();input.controls.get('birdeye-schedule:v1').payload=JSON.stringify({status:'source_unavailable',checkedAt:now});input.market.supplies.asOf.MU=now-HOUR;input.holder.registryHash='old';input.activityAt=now-41*HOUR;
 assert.deepEqual(api.activeHealthIssues(input).map(i=>i.source),['supplies','volume-collector','holders','activity']);
 input.controls.get('birdeye-schedule:v1').payload=JSON.stringify({status:'budget_exhausted',checkedAt:now});
 assert.ok(api.activeHealthIssues(input).some(i=>i.code==='volume_budget_exhausted'));
});
void test('public monitor response drops private properties and rejects missing, future, expired or malformed summaries',async()=>{
 let payload=JSON.stringify({version:1,checkedAt:now,status:'degraded',issues:[{source:'volume',code:'volume_coverage_overdue',affected:1,wallet:'private'}],private:'secret'});
 const db={prepare(){return{bind(){return this;},async first(){return{payload};}};}};
 assert.deepEqual(await api.readActiveMarketHealth(db,now),{status:'degraded',checkedAt:now,issues:[{source:'volume',code:'volume_coverage_overdue',affected:1}]});
 for(const value of [null,{version:1,checkedAt:now-16*60000,issues:[]},{version:1,checkedAt:now+120000,issues:[]},{version:1,checkedAt:now,issues:[{source:'private',code:'secret',affected:1}]}]){payload=JSON.stringify(value);assert.equal((await api.readActiveMarketHealth(db,now)).status,'unavailable');}
});
void test('scheduled cleanup bounds every table, preserves current credentials and in-flight translation leases',async()=>{
 const raw=new DatabaseSync(':memory:');
 const tables=['limits','challenges','proofs','community_challenges','community_sessions','wallet_handoffs','admin_wallet_challenges','admin_wallet_sessions','trade_challenges','trade_sessions','community_attachment_drafts'];
 for(const table of tables){raw.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,expires_at INTEGER)`);const insert=raw.prepare(`INSERT INTO ${table} VALUES (?,?)`);for(let i=0;i<105;i++)insert.run('expired-'+i,now-1000);insert.run('active',now+HOUR);}
 raw.exec('CREATE TABLE community_translations(cache_key TEXT PRIMARY KEY,expires_at INTEGER,lease_until INTEGER);CREATE TABLE trade_orders(id TEXT,state TEXT);');
 raw.prepare('INSERT INTO community_translations VALUES (?,?,?)').run('expired',now-1000,0);raw.prepare('INSERT INTO community_translations VALUES (?,?,?)').run('in-flight',now-1000,now+HOUR);raw.prepare('INSERT INTO trade_orders VALUES (?,?)').run('pending','unknown');
 const db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},sql};},async batch(statements){return statements.map(s=>({meta:{changes:raw.prepare(s.sql).run(...s.args).changes}}));}};
 const result=await api.cleanupExpiredRecords(db,now);assert.equal(result.deleted,1101);assert.equal(result.maxRows,1200);
 for(const table of tables){assert.equal(raw.prepare(`SELECT count(*) n FROM ${table}`).get().n,6);assert.ok(raw.prepare(`SELECT id FROM ${table} WHERE id='active'`).get());}
 assert.equal(raw.prepare('SELECT cache_key FROM community_translations').get().cache_key,'in-flight');assert.equal(raw.prepare('SELECT state FROM trade_orders').get().state,'unknown');raw.close();
});
void test('the real cache-only monitor catches missing production lanes without making any provider request',async()=>{
 const {readdir,readFile}=await import('node:fs/promises');
 const raw=new DatabaseSync(':memory:');
 for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())raw.exec(await readFile('drizzle/'+name,'utf8'));
 const db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){return raw.prepare(sql).get(...this.args)??null;},async all(){return{results:raw.prepare(sql).all(...this.args)};},async run(){return{meta:{changes:raw.prepare(sql).run(...this.args).changes}};},sql};},async batch(statements){return statements.map(s=>({results:raw.prepare(s.sql).all(...s.args)}));}};
 const original=globalThis.fetch;let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;throw Error('Forbidden provider request');};
 try{
  const first=await api.checkActiveMarketHealth({DB:db},now);assert.equal(first.status,'degraded');assert.deepEqual(first.issues,[{source:'snapshot',code:'snapshot_publication_overdue',affected:1}]);assert.ok(first.coverage.tracked>0);
  const later=await api.checkActiveMarketHealth({DB:db},now+2*HOUR);assert.equal(later.status,'degraded');assert.ok(later.issues.some(i=>i.source==='references'));assert.ok(later.issues.some(i=>i.source==='supplies'));assert.ok(later.issues.some(i=>i.source==='activity'));assert.equal(providerCalls,0);
  const publicSummary=await api.readActiveMarketHealth(db,now+2*HOUR);assert.equal(publicSummary.status,'degraded');assert.ok(publicSummary.coverage.tracked===first.coverage.tracked);assert.equal(publicSummary.coverage.references,0);
 }finally{globalThis.fetch=original;raw.close();}
});

void test('a stale prepared public snapshot is detected independently of otherwise healthy collection',()=>{
 const input=fixture();input.controls.get('public-backpack-snapshot:v1').fetched_at=now-6*60000;
 assert.deepEqual(api.activeHealthIssues(input),[{source:'snapshot',code:'snapshot_publication_overdue',affected:1}]);
});
void test('new-listing grace never suppresses global snapshot absence, expiry or a future assembly time',()=>{
 const input=fixture();input.firstSeen[token.mint]=now;
 for(const at of [now-6*60000,now+1]){input.controls.get('public-backpack-snapshot:v1').fetched_at=at;assert.deepEqual(api.activeHealthIssues(input),[{source:'snapshot',code:'snapshot_publication_overdue',affected:1}]);}
 input.controls.delete('public-backpack-snapshot:v1');assert.deepEqual(api.activeHealthIssues(input),[{source:'snapshot',code:'snapshot_publication_overdue',affected:1}]);
});
void test('snapshot growth warns before its storage ceiling using UTF8 bytes without exposing the payload',async()=>{
 const input=fixture();input.controls.get('public-backpack-snapshot:v1').payload='x'.repeat(399999);assert.deepEqual(api.activeHealthIssues(input),[]);
 input.controls.get('public-backpack-snapshot:v1').payload='€'.repeat(140000);const issues=api.activeHealthIssues(input);assert.deepEqual(issues,[{source:'snapshot-capacity',code:'snapshot_payload_large',affected:1}]);
 const payload=JSON.stringify({version:1,status:'degraded',checkedAt:now,issues});const db={prepare(){return{bind(){return this;},async first(){return{payload};}};}};
 const summary=await api.readActiveMarketHealth(db,now);assert.equal(summary.status,'degraded');assert.deepEqual(summary.issues,issues);assert.equal(JSON.stringify(summary).includes('€'),false);
});
void test('expiry index migration is idempotent and selects expired rows through indexed range scans',async()=>{
 const {readFile}=await import('node:fs/promises'),raw=new DatabaseSync(':memory:');
 const tables=['limits','challenges','proofs','community_challenges','community_sessions','admin_wallet_challenges','trade_challenges'];
 for(const table of tables)raw.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,expires_at INTEGER)`);
 const migration=await readFile('drizzle/0022_expired_record_indexes.sql','utf8');raw.exec(migration);raw.exec(migration);
 for(const table of tables){const plan=raw.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE expires_at<? ORDER BY expires_at LIMIT ?`).all(now,100);assert.ok(plan.some(row=>row.detail.includes('USING COVERING INDEX '+table+'_expiry')),JSON.stringify(plan));}raw.close();
});

void test('daily activity grace accounts for the 14-hour source cadence crossing a UTC boundary',()=>{
 const input=fixture();input.activityAt=now-38*HOUR;assert.deepEqual(api.activeHealthIssues(input),[]);
 input.activityAt=now-41*HOUR;assert.ok(api.activeHealthIssues(input).some(i=>i.source==='activity'));
});

void test('comparison publication failures cannot hide behind a healthy main market',async()=>{
 const input=fixture();input.stockComparison={status:'daily'};assert.deepEqual(api.activeHealthIssues(input),[]);
 for(const status of ['delayed','pending']){input.stockComparison={status};const issues=api.activeHealthIssues(input);assert.deepEqual(issues,[{source:'stock-comparison',code:'stock_comparison_overdue',affected:1}]);
 const payload=JSON.stringify({version:1,status:'degraded',checkedAt:now,issues});const db={prepare(){return{bind(){return this;},async first(){return{payload};}};}};assert.equal((await api.readActiveMarketHealth(db,now)).status,'degraded');}
});
