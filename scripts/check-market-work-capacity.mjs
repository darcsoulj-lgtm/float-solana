// Accelerated scheduler model, NOT a wall-clock soak or Cloudflare CPU test.
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {bundle} from '../tests/helpers/bundle.mjs';
const api=await bundle(`export * from './lib/market-work-store';export * from './lib/market-work-scheduler';export {TOKENS} from './lib/tokens';export {REGISTRY_KEY,registryTokens} from './lib/backpack-registry';export {poolObservationKey} from './lib/pool-inventory';export {POOL_POLICY_VERSION} from './lib/stock-pools';`);
const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER);'+await readFile('drizzle/0021_market_work.sql','utf8'));
let rowsWritten=0,statements=0;
function execute(sql,args){statements++;const results=raw.prepare(sql).all(...args);if(/^(INSERT|UPDATE|DELETE)/.test(sql))rowsWritten+=raw.prepare('SELECT changes() AS n').get().n;return{results};}
const db={prepare(sql){return {args:[],_sql:sql,bind(...args){this.args=args;return this;},async first(){return execute(sql,this.args).results[0]??null;},async all(){return execute(sql,this.args);},async run(){return execute(sql,this.args);}};},async batch(items){raw.exec('BEGIN');try{const r=items.map(s=>execute(s._sql,s.args));raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
const realNow=Date.now,start=realNow();let clock=start;Date.now=()=>clock;
try{
 const snapshotPath=process.argv[2];
 const snapshot=snapshotPath?JSON.parse(await readFile(snapshotPath,'utf8')):null;
 const tokens=api.registryTokens({additions:snapshot?.registry?.additions??[]}).filter(t=>t.issuer==='backpack');
 const seed=(key,value)=>raw.prepare('INSERT INTO market_cache VALUES (?,?,?,0)').run(key,JSON.stringify(value),clock);
 seed(api.REGISTRY_KEY,snapshot?.registry?.additions??[]);
 for(const token of tokens){const pools=snapshot?.pools?.data?.[token.symbol]??[];seed(api.poolObservationKey(token),pools);seed('pool-inventory-'+api.POOL_POLICY_VERSION+':'+token.mint,pools);}
 const env={DB:db,MARKET_REFRESH:{async planTokens(mints,scope){return api.planMarketTokens(env,mints,scope);},async planShards(addresses,scope){return api.planMarketShards(env,addresses,scope);}}};
 let jobs=0;const gaps={references:[],supplies:[],refresh:[],discovery:[]},last=new Map(),first=new Map();
 for(let minute=0;minute<1440;minute++){
  clock=start+minute*60000;await api.planMarketWork(env);
  const lanes=[...api.WORK_LANE_BUDGET,[minute%2?'registry':'catalog',1]],providers=new Map();
  for(const [lane,count] of lanes)for(let n=0;n<count;n++){
   const excluded=[...providers].filter(([p,k])=>k>=(p==='geckoterminal'?1:3)).map(([p])=>p);
   const work=await api.claimMarketWork(db,lane,clock,excluded);if(!work)break;
   const job=JSON.parse(work.payload);jobs++;if(!first.has(work.id))first.set(work.id,minute);
   if(last.has(work.id)&&gaps[lane])gaps[lane].push(minute-last.get(work.id));last.set(work.id,minute);
   if(job.kind==='pool-source')providers.set(job.provider,(providers.get(job.provider)??0)+1);
   const writes=job.kind==='supplies'?job.mints.map(m=>({key:'model-supply:'+m,payload:'{}',fetchedAt:clock})):job.kind==='pool-publish'?[{key:'model-pools:'+job.mint,payload:'[]',fetchedAt:clock},{key:'model-inventory:'+job.mint,payload:'[]',fetchedAt:clock}]:[{key:'model-source:'+work.id,payload:'{}',fetchedAt:clock}];
   await api.completeMarketWork(db,work,writes,clock,job.kind==='pool-source'?job.mint:undefined);
   // Source transport slots/cooldowns are separate writes in the real executor.
   if(job.kind==='pool-source')rowsWritten++;
  }
 }
 const stats=Object.fromEntries(Object.entries(gaps).map(([lane,times])=>{times.sort((a,b)=>a-b);return[lane,{samples:times.length,p95Minutes:times[Math.ceil(times.length*.95)-1]??null,maxMinutes:times.at(-1)??null}];}));
 const report={environment:'accelerated 24-hour SQLite scheduler model; always-success providers, no network, no CPU claims',tokens:tokens.length,definitions:raw.prepare('SELECT COUNT(*) n FROM market_work WHERE enabled=1').get().n,jobs,modeledRowsWritten:rowsWritten,sqlStatements:statements,gaps:stats,discoveryFirstPassMaxMinutes:Math.max(...[...first].filter(([id])=>id.startsWith('discover:')).map(([,m])=>m)),cloudflareCpuMeasured:false,actualD1RowsReadMeasured:false,real24HourSoak:false,zeroBudgetRowWriteHeadroomAcceptable:rowsWritten<70000};
 await mkdir('outputs',{recursive:true});await writeFile('outputs/market-work-capacity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{Date.now=realNow;raw.close();}
