// Run against a compiled production build, with browser-only API fixtures.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})});
try {
for(const width of [390,1440]) {
const page=await browser.newPage({viewport:{width,height:900},locale:'ko-KR'}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const member={id:'qa-owner',alias:'QA Holder',bio:'Long-term investor. Learning with other holders.',show_value_badge:1,notify_replies:1,verified_until:Date.now()+86400000,suspended:0,created_at:Date.now()};
let posts=[{id:'own',member_id:member.id,alias:member.alias,bio:member.bio,topic:'channel-market-talk',title:'My first discussion',body:'A discussion for browser testing only.',created_at:Date.now(),reply_count:0},{id:'other',member_id:'other',alias:'Other Holder',bio:'Technology researcher.',topic:'channel-market-talk',title:'Another member’s discussion',body:'Other content.',created_at:Date.now()-1000,reply_count:0}];
await page.route('**/api/community/**',async route=>{const url=new URL(route.request().url());const p=url.pathname;let data={ok:true};
if(p.endsWith('/status')) data={member,admin:false};
else if(p.endsWith('/home')) data={holdingsRefreshAvailable:true,rooms:[],holdings:[{symbol:'MU',raw_amount:'100',decimals:2,verified_at:Date.now()}],follows:[],sources:[],notifications:[],blockedMembers:[]};
else if(p.endsWith('/holder-tier')) data={tier:null,expiresAt:0};
else if(p.endsWith('/threads') && route.request().method()==='POST') {const body=route.request().postDataJSON();posts.unshift({...posts[0],...body,member_id:member.id,alias:member.alias,bio:member.bio,id:'new',created_at:Date.now()});data={id:'new'};}
else if(p.endsWith('/edit')) {const body=route.request().postDataJSON();posts=posts.map(t=>p.includes('/'+t.id+'/')?{...t,...body,updated_at:Date.now()}:t);}
else if(p.endsWith('/threads')) data={threads:posts.filter(t=>(url.searchParams.get('feed')!=='mine'||t.member_id===member.id)&&(!url.searchParams.get('thread')||t.id===url.searchParams.get('thread'))),nextCursor:null};
else if(p.endsWith('/replies')) data={replies:[],nextCursor:null};
else if(p.endsWith('/remove')) {posts=posts.filter(t=>!p.includes('/'+t.id+'/'));}
await route.fulfill({json:data});});
let calls=0, fail=false;
await page.route('**/api/translate', async route=>{calls++;await route.fulfill({status:fail?429:200,json:fail?{error:'Translation limit reached.'}:{title:'첫 번째 토론',body:'번역 화면을 확인하는 글입니다.',translated:true,target:'ko'}});});
await page.goto((process.env.TEST_BASE_URL || 'http://localhost:8788') + '/?view=home');
await page.getByRole('button',{name:'My posts',exact:true}).click();
const translate=page.getByRole('button',{name:'한국어로 번역',exact:true});
await translate.waitFor(); assert.equal(calls,0);
await translate.click();
await page.getByRole('button',{name:'첫 번째 토론',exact:true}).waitFor();
await page.getByRole('button',{name:'원문 보기',exact:true}).click();
await page.getByRole('button',{name:'My first discussion',exact:true}).waitFor();
await translate.click(); assert.equal(calls,1);
await page.screenshot({path:`/tmp/float-translation-${width}.png`});
await page.getByRole('button',{name:'Profile',exact:true}).click();
await page.getByRole('combobox',{name:'Translation language',exact:true}).selectOption('en');
assert.equal(await page.evaluate(()=>localStorage.getItem('float-translation-language-v1')),'en');
await page.reload();
await page.getByRole('button',{name:'Profile',exact:true}).click();
assert.equal(await page.getByRole('combobox',{name:'Translation language',exact:true}).inputValue(),'en');
await page.getByRole('combobox',{name:'Translation language',exact:true}).selectOption('ko');
await page.getByRole('button',{name:'Discussions',exact:true}).click();
await page.getByRole('button',{name:'My posts',exact:true}).click();
fail=true;await translate.click();
await page.getByText('번역 요청 한도에 도달했어요. 나중에 다시 시도해 주세요.').waitFor();
await page.getByRole('button',{name:'My first discussion',exact:true}).waitFor();
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
assert.deepEqual(errors,[]); console.log(`${width}px translation toggle, caching, saved language, quota fallback and layout passed`);
await page.close();
}
}finally{await browser.close();}
