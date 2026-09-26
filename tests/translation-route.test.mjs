import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFunction } from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { bundle } from './helpers/bundle.mjs';
const { readBoundedText } = await bundle("export * from './lib/request-body';");
class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const output=ts.transpileModule(readFileSync('app/api/translate/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
void test('translation endpoint rejects cross-origin, oversized and unsupported requests before inference and accepts guest content IDs',async()=>{
 let calls=0;
 const deps={
 '@/lib/community-server':{communityMember:async()=>null},
 '@/lib/community-translation':{TRANSLATION_MODEL:'model',translateCommunityContent:async(db,infer,input,viewer)=>{calls++;assert.equal(viewer,null);assert.deepEqual(input,{type:'thread',id:'post',target:'ko'});return {title:'번역',body:'글',translated:true};}},
 '@/lib/server':{db:()=>({}),rateLimit:async()=>{},runtime:()=>({})},
 '@/lib/request-body':{readBoundedText},'@/lib/validation':{AppError}};
 const exports={};compileFunction(output,['require','exports'])(name=>deps[name],exports);
 const req=(body,origin='https://float.test',contentType='application/json')=>new Request('https://float.test/api/translate',{method:'POST',headers:{origin,'content-type':contentType},body});
 const valid=JSON.stringify({type:'thread',id:'post',target:'ko',body:'UNTRUSTED CLIENT TEXT'});
 assert.equal((await exports.POST(req(valid,'https://evil.test'))).status,403);
 assert.equal((await exports.POST(req(valid,undefined,'text/plain'))).status,415);
 assert.equal((await exports.POST(req('x'.repeat(1025)))).status,400);
 assert.equal((await exports.POST(req(JSON.stringify({type:'thread',id:'post',target:'xx'})))).status,400);
 assert.equal(calls,0);
 const response=await exports.POST(req(valid));assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
