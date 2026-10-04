import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as handoffs from '../lib/wallet-handoff.ts';
const require = createRequire(import.meta.url);
const id = '85e158b6-5f36-4732-983c-54dd80d9a4ef';
const flush = () => new Promise(resolve=>setImmediate(resolve));
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };

function fixture({url=`https://float.test/wallet/connect/${id}?float_wallet=backpack&float_handoff=${id}&join=1`, savedReturn=null, savedClaim=false, delayedClaim=null, initialMember=null, statusFailure=null, appHandoffId=id}={}) {
  let cursor=0, member=initialMember, hydrated=false;
  const slots=[], effects=[], timers=[], events=new Map(), calls=[], listeners=new Map();
  const values=new Map(savedReturn?[[handoffs.WALLET_RETURN_KEY,JSON.stringify(savedReturn)]]:[]);
  if(savedClaim) values.set(handoffs.WALLET_HANDOFF_KEY,JSON.stringify({id,secret:'a'.repeat(64),expiresAt:Date.now()+600000}));
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const location={href:url,search:new URL(url).search,replace(value){this.href=new URL(value,this.href).href;this.search=new URL(this.href).search;}};
  const window={location,history:{replaceState(_a,_b,value){location.replace(value);}},scrollTo(){},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
  const document={visibilityState:'visible',addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
  const types={};for(const name of ['Button','Dialog','DialogContent','DialogTitle','DialogDescription','WalletList','WalletReturn','MemberDashboard','PublicDiscussions']) types[name]=()=>null;
  const deps={
    react:{...React,useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useSyncExternalStore:(_subscribe,getSnapshot,getServerSnapshot)=>hydrated?getSnapshot():getServerSnapshot()},
    '@/lib/wallet-handoff':handoffs,
    '@/lib/wallet-browser-link':{isMobileBrowser:()=>true},
    '@/lib/client':{ApiError:Error,api:async(path,body)=>{
      calls.push([path,body]);
      if(path==='community/status') {if(statusFailure) throw statusFailure;return {member};}
      if(path==='community/handoff/claim') return delayedClaim?delayedClaim.promise:{ready:false};
      if(path==='community/logout'){member=null;return {ok:true};}
      if(path==='community/challenge') return {id:'challenge',message:'membership',expiresAt:Date.now()+600000,holdingCount:1,signInInput:{}};
      if(path==='community/verify'){member={id:'member'};return {ok:true,handoffReady:!!body.handoffId};}
      return {};
    }},
    '@/lib/wallet-provider':{walletLabel:v=>v,selectedWallet:name=>({requireSignIn(){},connect:async()=>({publicKey:{toString:()=>name+'-wallet'}}),accountUnchanged:()=>true,signMessage:async()=>new Uint8Array([1]),signIn:async()=>new Uint8Array([1]),onAccountChange(fn){listeners.set(name,fn);return ()=>{listeners.delete(name);calls.push(['unsubscribe',name]);};}})},
    '@/components/ui/button':{Button:types.Button},
    '@/components/ui/dialog':types,
    './wallet-list':{WalletList:types.WalletList},'./wallet-return':{WalletReturn:types.WalletReturn},'./member-dashboard':{MemberDashboard:types.MemberDashboard},'./public-discussions':{PublicDiscussions:types.PublicDiscussions},'./float-logo':{FloatLogo:()=>null},'next/image':{default:()=>null},'@/components/site-link':{default:()=>null},
  };
  const code=ts.transpileModule(readFileSync('components/community.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  compileFunction(code,['require','module','exports','window','document','navigator','localStorage','sessionStorage','setTimeout','clearTimeout','setInterval','clearInterval'])(k=>deps[k]||(k.startsWith('.')||k.startsWith('@/')?{}:require(k)),mod,mod.exports,window,document,{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1},storage,storage,(fn,ms)=>{if(!ms)timers.push(fn);return 1;},()=>{},()=>1,()=>{});
  const render=()=>{cursor=0;return mod.exports.Community({appHandoffId});};
  const find=(tree,type)=>{if(tree?.type===type)return tree;let match;React.Children.forEach(tree?.props?.children,c=>{match ||= find(c,type);});return match;};
  return {calls,values,location,events,listeners,effects,timers,render,find,types,setMember:v=>{member=v;},setStatusFailure:v=>{statusFailure=v;},async initialize(){render();hydrated=true;effects.splice(0).forEach(fn=>fn());timers.splice(0).forEach(fn=>fn());await flush();},async connect(name){await find(render(),types.WalletList).props.onConnect(name);},async sign(){await find(render(),types.Button).props.onClick();}};
}

void test('public posts remain readable during membership failure and interactions cannot start wallet verification until recovery',async()=>{
 const f=fixture({url:'https://float.test/?view=home',appHandoffId:null,statusFailure:Error('Membership unavailable')});
 assert.equal(f.find(f.render(),f.types.PublicDiscussions),undefined,'The initial client tree matches the server entry before browser-only routing is ready');
 await f.initialize();
 assert.ok(f.find(f.render(),f.types.PublicDiscussions),'A failed status read must not hide public posts');
 assert.equal(f.find(f.render(),'p').props.role,'alert');
 f.find(f.render(),f.types.PublicDiscussions).props.verify();await flush();
 assert.equal(f.find(f.render(),f.types.Dialog),undefined);
 assert.ok(f.calls.every(([path])=>path==='community/status'),'An unverified interaction only retries membership');
 f.setStatusFailure(null);f.find(f.render(),f.types.PublicDiscussions).props.verify();await flush();
 assert.equal(f.find(f.render(),f.types.Dialog).props.open,true,'A confirmed guest can open the existing wallet flow');
 assert.equal(f.calls.some(([path])=>path==='community/challenge'||path==='community/verify'),false);
});

for (const [first, second] of [['phantom','backpack'],['backpack','phantom']]) void test(`${first} → sign out → ${second} in the same mounted receiver never reuses its consumed transfer`,async()=>{
  const f=fixture({initialMember:{id:'old-member'}});await f.initialize();
  const dashboard=f.find(f.render(),f.types.MemberDashboard);
  await f.connect(first);await f.sign();
  assert.equal(f.calls.find(([p])=>p==='community/challenge')[1].handoffId,id);
  // Invoke the owner's logout callback without remounting. Neither the stale
  // route prop nor the completed return context may revive the transfer.
  await dashboard.props.signOutWallet();
  assert.equal(f.values.has(handoffs.WALLET_RETURN_KEY),false);
  assert.equal(f.values.has(handoffs.WALLET_HANDOFF_KEY),false);
  assert.equal(handoffs.walletHandoffId(f.location.href),null);
  assert.equal(f.listeners.has(first),false);
  await f.connect(second);await f.sign();
  const challenges=f.calls.filter(([p])=>p==='community/challenge');
  assert.equal(challenges.length,2);
  assert.equal(challenges[1][1].wallet,second+'-wallet');
  assert.equal(challenges[1][1].handoffId,undefined);
  assert.ok(f.find(f.render(),f.types.WalletReturn));
  assert.equal(f.listeners.has(second),true);
});

void test('completed receiver context is navigation only even before it is dismissed',async()=>{
  const f=fixture({savedReturn:{id,completed:true,expiresAt:Date.now()+600000}});await f.initialize();await f.connect('backpack');
  assert.equal(f.calls.find(([p])=>p==='community/challenge')[1].handoffId,undefined);
});

void test('logout waits for a pending claim, then clears its cookie and local flow before allowing reconnect',async()=>{
  const claim=deferred();const f=fixture({savedClaim:true,delayedClaim:claim,initialMember:{id:"member"}});await f.initialize();
  const dashboard=f.find(f.render(),f.types.MemberDashboard);const logout=dashboard.props.signOutWallet();
  await flush();assert.equal(f.calls.some(([p])=>p==='community/logout'),false);
  claim.resolve({ready:true});await logout;
  assert.equal(f.calls.filter(([p])=>p==='community/logout').length,1);
  assert.equal(f.values.has(handoffs.WALLET_HANDOFF_KEY),false);
  assert.equal(f.find(f.render(),f.types.MemberDashboard),undefined);
  await f.connect('backpack');assert.equal(f.calls.filter(([p])=>p==='community/challenge').at(-1)[1].handoffId,undefined);
});
