import {appendFile} from 'node:fs/promises';
import {publicationAttempts} from './publication-policy.mjs';
import {publicationIssues} from './publication-check.mjs';
const repo=process.env.GITHUB_REPOSITORY??'darcsoulj-lgtm/float-solana';
if(repo!=='darcsoulj-lgtm/float-solana')throw Error('Unexpected market repository');
const headers={'Accept':'application/vnd.github+json',...(process.env.GH_TOKEN?{'Authorization':'Bearer '+process.env.GH_TOKEN}:{})};
async function get(url,options={}){const r=await fetch(url,{signal:AbortSignal.timeout(15000),...options});if(!r.ok)throw Error('HTTP '+r.status+' '+new URL(url).hostname);return r;}
// Resolve a pinned branch head through the API; raw branch caches cannot make
// this verifier silently select an older expected generation.
const ref=await(await get('https://api.github.com/repos/'+repo+'/git/ref/heads/market-data',{headers})).json();
if(!/^[a-f0-9]{40}$/.test(ref.object?.sha))throw Error('Invalid snapshot head');
const root='https://raw.githubusercontent.com/'+repo+'/';
const manifest=await(await get(root+ref.object.sha+'/manifest.json')).json();
if(!/^[a-f0-9]{40}$/.test(manifest.commit))throw Error('Invalid immutable snapshot');
const expected=await(await get(root+manifest.commit+'/verification.json')).json();
if(expected.version!==1||!Array.isArray(expected.tokens)||!expected.tokens.length||expected.generatedAt!==manifest.generatedAt||Date.now()-expected.generatedAt>15*60000||expected.generatedAt>Date.now()+60000)throw Error('Missing or stale collection verification');
const attempts=publicationAttempts(manifest.chunks?.length);
let issues=[];
// Bounded import/propagation allowance. Every failed comparison is repeated;
// two sequential ordinary reads also exercise cache MISS/HIT behavior.
for(let attempt=0;attempt<attempts;attempt++){
 issues=[];const cache=[];
 for(let read=0;read<2;read++)try{
  const r=await get('https://joinfloat.xyz/api/backpack-market',{headers:{'User-Agent':'Mozilla/5.0 (compatible; FloatPublicationCheck/1.0; +https://joinfloat.xyz)'}});
  issues.push(...publicationIssues(expected,await r.text(),r.headers));cache.push({status:r.headers.get('cf-cache-status'),control:r.headers.get('cache-control')});
 }catch(error){issues.push(error.message);}
 issues=[...new Set(issues)];
 console.log(JSON.stringify({attempt:attempt+1,generation:manifest.commit,issues,cache}));
 if(!issues.length)break;
 if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,60000));
}
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,(issues.length?'Publication failed: '+issues.join('; '):'Publication verified: '+expected.tokens.length+' markets; two ordinary reads; immutable generation '+manifest.commit)+ '\n');
if(issues.length)throw Error('Confirmed public market publication failure');
