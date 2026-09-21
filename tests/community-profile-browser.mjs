// Run against a compiled production build, with browser-only API fixtures.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})});
try {
for(const width of [320,390,640,768,1440]) {
const page=await browser.newPage({viewport:{width,height:900}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const member={id:'qa-owner',alias:'QA Holder',bio:'Long-term investor. Learning with other holders.',show_value_badge:1,notify_replies:1,verified_until:Date.now()+86400000,suspended:0,created_at:Date.now()};
let posts=[{id:'own',member_id:member.id,alias:member.alias,bio:member.bio,topic:'channel-market-talk',title:'My first discussion',body:'A discussion for browser testing only.',created_at:Date.now(),reply_count:0},{id:'other',member_id:'other',alias:'Other Holder',bio:'Technology researcher.',topic:'channel-market-talk',title:'Another member’s discussion',body:'Other content.',created_at:Date.now()-1000,reply_count:0}];
await page.route('**/api/community/**',async route=>{const url=new URL(route.request().url());const p=url.pathname;let data={ok:true};
if(p.endsWith('/status')) data={member,admin:false};
else if(p.endsWith('/home')) data={holdingsRefreshAvailable:true,rooms:[],holdings:[{symbol:'MU',raw_amount:'100',decimals:2,verified_at:Date.now()}],follows:[],sources:[],notifications:[],blockedMembers:[]};
else if(p.endsWith('/holder-tier')) data={tier:null,expiresAt:0};
else if(p.endsWith('/threads') && route.request().method()==='POST') {const body=route.request().postDataJSON();posts.unshift({...posts[0],...body,member_id:member.id,alias:member.alias,bio:member.bio,id:'new',created_at:Date.now()});data={id:'new'};}
else if(p.endsWith('/threads')) data={threads:posts.filter(t=>(url.searchParams.get('feed')!=='mine'||t.member_id===member.id)&&(!url.searchParams.get('thread')||t.id===url.searchParams.get('thread'))),nextCursor:null};
else if(p.endsWith('/replies')) data={replies:[],nextCursor:null};
else if(p.endsWith('/remove')) {posts=posts.filter(t=>!p.includes('/'+t.id+'/'));}
await route.fulfill({json:data});});
await page.goto((process.env.TEST_BASE_URL || 'http://localhost:8788') + '/?view=home');
await page.getByRole('button',{name:'My posts',exact:true}).click();
await page.getByRole('button',{name:'My first discussion',exact:true}).waitFor();
await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'Another member’s discussion',exact:true}).count(),0);
await page.getByRole('button',{name:"View QA Holder's profile"}).first().click();
await page.getByRole('dialog').getByText(member.bio).waitFor();
await page.waitForTimeout(400);
const box=await page.getByRole('dialog').boundingBox(); assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=900+1,JSON.stringify(box));
if(width<=640) { assert.ok(Math.abs(box.x)<1); assert.ok(Math.abs(box.width-width)<1); assert.ok(Math.abs(box.y+box.height-900)<1); }
await page.screenshot({path:`/tmp/float-profile-${width}.png`});
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Discussion options',exact:true}).click();
await page.getByRole('menuitem',{name:'Delete post'}).click();
await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
await page.getByRole('heading',{name:'No posts yet.'}).waitFor();
await page.getByRole('button',{name:'New discussion',exact:true}).click();
await page.locator('input[name=title]').fill('A freshly published post');
await page.locator('textarea[name=body]').fill('Testing return to the discussion list after posting.');
await page.getByRole('button',{name:'Post discussion',exact:true}).click();
await page.getByText('Discussion posted.',{exact:true}).waitFor();
assert.equal(new URL(page.url()).searchParams.has('thread'),false);
await page.getByRole('button',{name:'A freshly published post',exact:true}).waitFor();
assert.ok(await page.locator('.thread-post').first().getByText('Bronze',{exact:true}).count());
await page.waitForTimeout(400);
await page.screenshot({path:`/tmp/float-feed-${width}.png`});
await page.getByRole('button',{name:'Profile',exact:true}).click();
await page.locator('.profile-tier-heading').getByText('Bronze',{exact:true}).waitFor();
assert.equal(await page.getByText('Tier unavailable',{exact:true}).count(),0);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
assert.deepEqual(errors,[]);console.log(`${width}px passed: My posts, bio, delete, publish-to-feed, Bronze fallback, no overflow or page errors`);await page.close();
}
}finally{await browser.close();}
