// Rendered desktop/mobile recovery checks with deterministic public fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { bundle } from '../tests/helpers/bundle.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const {TOKENS,ISSUERS}=await bundle("export {TOKENS,ISSUERS} from './lib/tokens';");
const browser=await chromium.launch({headless:true,channel:'chrome'});
await mkdir('outputs',{recursive:true});
const results=[];
try {
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let requests=0,offline=false;
  const observed=Date.now()-45*60000;
  const source=data=>({data,fetchedAt:observed,stale:true,error:'Test provider delayed',refreshing:false});
  const fixture={
   registry:{additions:[],checkedAt:observed,refreshing:false,delayed:false},totalBatches:15,
   prices:source(Object.fromEntries(TOKENS.map(t=>[t.symbol,{price:12,confidence:1,timestamp:observed}]))),
   supplies:source({}),history:source({}),
   pools:source(Object.fromEntries(ISSUERS.map((issuer, index) => {
    const token = TOKENS.find(t => t.issuer === issuer.id);
    return [token.symbol, [{address: `fixture-pool-${index}`, dex: 'raydium', volume24h: 10000, liquidity: 20000, price: 12, base: token.symbol, quote: 'USDC', url: 'https://dexscreener.com/solana/fixture'}]];
   }))),
   markets:source({}),catalog:source([]),
  };
  await page.route('**/api/market-data?**',async route=>{
   if(route.request().url().includes('overview=1')){
    requests++;
    if(offline)return route.abort('failed');
    return route.fulfill({json:fixture});
   }
   return route.fulfill({json:{points:[],pools:source({})}});
  });
  await page.goto('http://localhost:3001/markets',{waitUntil:'networkidle'});
  const prices=page.locator(name==='mobile'?'.stock-row-mobile-market strong':'.market-price-cell').filter({hasText:'$12.00'}).filter({visible:true});
  await prices.first().waitFor();
  assert.equal(requests,1);
  const summaryValues=page.locator('.ecosystem-stats strong');
  assert.equal(await summaryValues.nth(1).innerText(), '$50K');
  assert.equal(await summaryValues.nth(2).innerText(), '$100K');
  assert.equal(await page.locator('.issuer-activity-row strong').filter({hasText:'$10K'}).count(),5);
  assert.equal(await page.locator('.market-data-note').count(),1);
  assert.equal(await page.getByText('Delayed',{exact:true}).count(),0);
  await page.locator('.market-data-note').waitFor({state:'visible'});
  if(name==='desktop') {
   await summaryValues.nth(1).waitFor({state:'visible'});
   await page.getByLabel('About market volume',{exact:true}).click();
   await page.getByText(/not a synchronized live total/).filter({visible:true}).first().waitFor();
  } else {
   assert.equal(await summaryValues.nth(1).isVisible(),false); // Existing mobile layout prioritizes the token list.
   await page.getByLabel('About saved market data',{exact:true}).click();
   await page.getByText(/not necessarily the latest 24 hours/).filter({visible:true}).first().waitFor();
  }
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Search company, symbol or token').click();
  await page.mouse.move(0,0);
  for(const popover of await page.locator('.holdings-info-popover').all()) await popover.waitFor({state:'hidden'});
  await page.evaluate(() => window.scrollTo(0,0));
  const priceCount=await prices.count();
  const widthBefore=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(widthBefore.scroll<=widthBefore.width+1);
  await page.screenshot({path:`outputs/markets-${name}-summary.png`,fullPage:false});
  await page.screenshot({path:`outputs/markets-${name}-delayed.png`,fullPage:true});
  const info=page.getByLabel(/Last price for/).filter({visible:true}).first();
  if(await info.count()){
   await info.click();
   await page.getByText(/Not a live price/).filter({visible:true}).first().waitFor();
   await page.keyboard.press('Escape');
  }
  offline=true;
  await page.reload({waitUntil:'networkidle'});
  await prices.first().waitFor();
  await page.getByText('Could not refresh. Showing the last available data.').waitFor();
  assert.equal(requests,2);
  assert.equal(await summaryValues.nth(1).innerText(), '$50K');
  assert.equal(await summaryValues.nth(2).innerText(), '$100K');
  assert.equal(await prices.count(),priceCount);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`outputs/markets-${name}-offline.png`,fullPage:true});
  results.push({viewport:name,initialOverviewRequests:1,savedVolume:"$50K",savedLiquidity:"$100K",issuerBarsInDOM:5,summaryVisible:name==='desktop',savedNoticeVisible:true,repeatedDelayedLabels:0,restoredPricesAfterFailedReload:priceCount,overflow:false,pageErrors:errors});
  await context.close();
 }
 await writeFile('outputs/market-browser-check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
