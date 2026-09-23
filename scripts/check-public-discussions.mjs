import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
await mkdir('outputs',{recursive:true});
try {
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});
  const page=await context.newPage();const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  const thread={id:'public-test',member_id:'author',alias:'Holder',bio:'Public test bio',topic:'channel-crypto',room_name:'Crypto',title:'Public reading test',body:'A discussion readable without connecting a wallet.',created_at:Date.now()-60000,reply_count:2,hidden:0,saved:0,value_tier:null,poll:{closed:false,results_visible:false,closes_at:Date.now()+86400000,total_votes:null,options:[{id:'yes',label:'Yes',selected:false,vote_count:null},{id:'no',label:'No',selected:false,vote_count:null}]}};
  await page.route('**/api/community/**',async route=>{
   const u=new URL(route.request().url());
   if(route.request().method()==='POST') {
    writes.push(u.pathname);
    return route.fulfill({json:{id:'85e158b6-5f36-4732-983c-54dd80d9a4ef',expiresAt:Date.now()+600000}});
   }
   if(u.pathname.endsWith('/status')) return route.fulfill({json:{member:null,memberCount:1,threadCount:1}});
   if(u.pathname.endsWith('/replies')) return route.fulfill({json:{replies:[{id:'reply1',thread_id:thread.id,member_id:'reply-author',alias:'Small holder',body:'I can read this reply.',created_at:Date.now(),hidden:0,value_tier:null}],nextCursor:null}});
   if(u.pathname.endsWith('/threads')) return route.fulfill({json:{threads:u.searchParams.get('topic')==='channel-technology'?[]:[thread],nextCursor:null}});
   return route.fulfill({json:{}});
  });
  await page.goto('http://localhost:3001/',{waitUntil:'networkidle'});
  await page.getByRole('link',{name:'Explore discussions',exact:true}).click();
  await page.getByRole('button',{name:'Public reading test',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Public reading test',exact:true}).click();
  await page.getByText('I can read this reply.',{exact:true}).waitFor();
  assert.equal(await page.locator('.holder-tier-badge').count(),0);
  for(const click of [()=>page.getByRole('button',{name:'Verify wallet to reply',exact:true}).click(),()=>page.getByRole('button',{name:'Yes',exact:true}).click(),()=>page.getByRole('button',{name:'Save discussion',exact:true}).click()]) {
   await click();await page.getByRole('dialog').waitFor();
   await page.getByRole('heading',{name:'Connect your wallet'}).waitFor();
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Back to discussions',exact:true}).click();
  await page.getByRole('button',{name:'Technology',exact:true}).click();
  await page.getByText('No discussions here yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'All',exact:true}).click();
  await page.getByRole('button',{name:'Public reading test',exact:true}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false);assert.deepEqual(errors,[]);
  assert.ok(writes.every(p=>p==='/api/community/handoff/start'),JSON.stringify(writes));
  await page.screenshot({path:`outputs/public-discussions-${name}.png`,fullPage:true});
  results.push({viewport:name,guestReading:true,repliesVisible:true,mutationsRequireVerification:true,noBadgeForNullTier:true,overflow,pageErrors:errors});
  await context.close();
 }
 await writeFile('outputs/public-discussions-check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
