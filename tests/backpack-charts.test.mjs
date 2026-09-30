import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { parseBackpackChart, fetchBackpackChart, TOKENS } = await bundle("export {parseBackpackChart,fetchBackpackChart} from './lib/backpack-charts'; export {TOKENS} from './lib/tokens';");
const token = TOKENS.find(t => t.symbol === 'MU' && t.issuer === 'backpack');
const now = Date.parse('2026-09-30T03:30:00Z');
const row = hour => ({start:`2026-09-30 0${hour}:00:00`,end:`2026-09-30 0${hour+1}:00:00`,open:'100',high:'103',low:'99',close:'102',volume:'2',trades:'1'});
void test('chart preserves source and skips unfinished and empty hours',()=>{
 const result=parseBackpackChart([row(0),row(1),{...row(2),volume:'0',trades:'0'},row(3)],token,now);
 assert.equal(result.points.length,2);assert.equal(result.omittedHours,2);
 assert.equal(result.points[1][0],Date.parse('2026-09-30T02:00:00Z'));
 assert.equal(result.source,'Backpack External');assert.equal(result.basis,'stock-reference');assert.equal(result.fetchedAt,now);
});
void test('chart rejects malformed, duplicate, unordered, empty, future and impossible data',()=>{
 for (const rows of [[],[row(0)],[row(0),row(0)],[row(1),row(0)],[row(0),{...row(1),close:'NaN'}],[row(0),{...row(1),high:'50'}],[row(0),{...row(1),start:'bad'}],[row(0),{...row(1),volume:''}],[row(0),row(5)]]) assert.throws(()=>parseBackpackChart(rows,token,now));
});
void test('uses exact registered stock symbol and External; never substitutes venue',async()=>{
 const result=await fetchBackpackChart(token,async url=>{
 const parsed=new URL(url);assert.equal(parsed.hostname,'api.backpack.exchange');assert.equal(parsed.searchParams.get('symbol'),'MU.US_USDC');assert.equal(parsed.searchParams.get('source'),'External');return Response.json([row(0),row(1)]);
 },now);assert.equal(result.symbol,'MU');
 await assert.rejects(fetchBackpackChart(token,async()=>new Response('',{status:429}),now));
 await assert.rejects(fetchBackpackChart({...token,issuer:'ondo'},async()=>{throw Error('Must not fetch');},now));
});
void test('preview chart endpoint is closed outside development without fetching',async()=>{
 const {GET}=await bundle("export {GET} from './app/api/preview/chart/route';");
 const previous=process.env.NODE_ENV;
 try {process.env.NODE_ENV='production';const response=await GET(new Request('http://localhost/api/preview/chart?symbol=MU'));assert.equal(response.status,404);}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
