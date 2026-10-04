// Browser-only API fixtures: no real wallet, provider calls or public posts.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const stock={symbol:'NEXT',shortName:'Next Company',name:'Next Company',issuer:'backpack',underlyingSymbol:'NEXT',mint:'NEXTQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow',source:'https://api.backpack.exchange/api/v1/assets'};
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const member={id:'qa',alias:'QA Holder',verified_until:Date.now()+86400000,suspended:0,created_at:Date.now()};
 let submitted,fail=false,requests=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data={ok:true};
  if(path.endsWith('/status'))data={member,admin:false};
  if(path.endsWith('/home'))data={holdingsRefreshAvailable:true,rooms:[],holdings:[{symbol:'MU',raw_amount:'100',decimals:2,verified_at:Date.now()}],follows:[],sources:[],notifications:[],blockedMembers:[],registry:{additions:[stock],checkedAt:Date.now(),refreshing:false,delayed:false}};
  if(path.endsWith('/backpack-market')){const source=data=>({data,fetchedAt:Date.now(),stale:false,error:null});data={registry:{additions:[stock],checkedAt:Date.now(),refreshing:false,delayed:false},prices:source({}),supplies:source({}),pools:source({}),markets:source({}),backpack:source({NEXT:{market:'NEXT.US_USDC',externalPrice:101,externalChange24h:1}}),catalog:source([])};}
  if(path.endsWith('/holder-tier'))data={tier:null,expiresAt:0};
  if(path.endsWith('/threads')){data={threads:[],nextCursor:null};if(route.request().method()==='POST'){submitted=route.request().postDataJSON();data={id:'qa-post'};}}
  if(path.endsWith('/attachments')){
   requests++;const body=route.request().postDataJSON();await new Promise(r=>setTimeout(r,body.period===1?600:200));
   if(fail){await route.fulfill({status:503,json:{error:'Temporary reference outage'}});return;}
   const now=Date.now();
   data={id:`${body.kind}-${body.symbol}-${body.period}`,expiresAt:now+600000,attachment:body.kind==='portfolio'?{kind:'portfolio',version:1,checkedAt:now,pricesAt:now,rows:[{symbol:'MU',name:'Micron',percent:100}]}:{kind:'chart',version:1,period:body.period,chart:{symbol:body.symbol,name:body.symbol,market:`${body.symbol}.US_USDC`,source:'Backpack External',basis:'stock-reference',fetchedAt:now,windowEnd:now,omittedHours:0,points:[[now-7200000,100],[now-3600000,101]]}}};
  }
  await route.fulfill({json:data});
 });
 await page.goto((process.env.TEST_BASE_URL||'http://localhost:8789')+'/?view=home');
 await page.getByRole('button',{name:'Create post',exact:true}).first().click();
 await page.locator('input[name=title]').fill('Chart without preview');await page.locator('textarea[name=body]').fill('Automatic attachment regression.');
 await page.getByRole('button',{name:'Add chart',exact:true}).click();
 await page.getByRole('button',{name:'Publish post',exact:true}).waitFor();
 const search=page.getByRole('combobox',{name:'Chart stock'});
 assert.equal(await search.inputValue(),'');
 await search.fill('Next Company');
 if(width===1440){await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');}else await page.getByRole('option',{name:/NEXT.*Next Company/}).click();
 await page.waitForTimeout(350);
 await search.click();assert.equal(await search.inputValue(),'');await page.keyboard.press('Escape');
 assert.match(await search.inputValue(),/NEXT/);
 await page.getByLabel('Chart range').selectOption('1');await page.getByLabel('Chart range').selectOption('7');
 await page.waitForTimeout(750);
 assert.ok(await page.getByRole('button',{name:'Publish post',exact:true}).isEnabled());
 await page.screenshot({path:`/tmp/float-auto-chart-${width}.png`});
 await page.getByRole('button',{name:'Publish post',exact:true}).click();
 await page.getByText('Post published.',{exact:true}).waitFor({timeout:1500}).catch(()=>{});
 assert.equal(submitted.attachmentId,'chart-NEXT-7');
 await page.getByRole('button',{name:'Create post',exact:true}).first().click();
 await page.locator('input[name=title]').fill('Snapshot test');await page.locator('textarea[name=body]').fill('Consent regression.');
 await page.getByRole('button',{name:'Add snapshot',exact:true}).click();await page.waitForTimeout(400);
 assert.equal(await page.getByRole('button',{name:'Publish post',exact:true}).isEnabled(),false);
 await page.getByRole('checkbox',{name:'Share these holdings and percentages with my post.'}).check();
 assert.equal(await page.getByRole('button',{name:'Publish post',exact:true}).isEnabled(),true);
 await page.screenshot({path:`/tmp/float-auto-snapshot-${width}.png`});
 fail=true;await page.getByRole('button',{name:'Add chart',exact:true}).click();await page.waitForTimeout(400);
 assert.equal(await page.getByRole('button',{name:'Publish post',exact:true}).isEnabled(),false);
 await page.getByRole('button',{name:'Remove attachment'}).click();
 assert.equal(await page.getByRole('button',{name:'Publish post',exact:true}).isEnabled(),true);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Markets',exact:true}).first().click();
 await page.getByPlaceholder('Search company, symbol or token').fill('Next Company');
 await page.getByText('Next Company',{exact:true}).first().waitFor();
 assert.deepEqual(errors,[]);assert.ok(requests>=4);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 console.log(`${width}px: automatic chart, searchable new listing, latest range, consent, failed attachment blocking and removal passed`);
 await page.close();
}}finally{await browser.close();}
