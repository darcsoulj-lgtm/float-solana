export type CollectorRow={key:string;payload:string|null;fetched_at:number;retry_after:number};
const repo='darcsoulj-lgtm/float-solana';
export async function restoreCollectorState(fetcher:typeof fetch,token:string|undefined,now=Date.now()):Promise<CollectorRow[]> {
 const refResponse=await fetcher('https://api.github.com/repos/'+repo+'/git/ref/heads/market-data',{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})},signal:AbortSignal.timeout(15000)});
 if(!refResponse.ok)throw Error('Previous collector state reference unavailable; preserving published data');
 const ref=await refResponse.json() as {object:{sha:string}};
 if(!/^[a-f0-9]{40}$/.test(ref.object?.sha))throw Error('Invalid collector state reference');
 const response=await fetcher('https://raw.githubusercontent.com/'+repo+'/'+ref.object.sha+'/state.json',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Previous collector state unavailable; preserving published data');
 const reader=response.body?.getReader();if(!reader)throw Error('Missing collector state');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8000000)throw Error('Oversized collector state');parts.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const text=new TextDecoder().decode(bytes);
 if(/"(?:wallet[^"\\]*|session[^"\\]*|private[^"\\]*)"\s*:/i.test(text))throw Error('Private fields in collector state');
 const state=JSON.parse(text) as CollectorRow[];
 if(!Array.isArray(state)||!state.length||state.length>3000||new Set(state.map(row=>row?.key)).size!==state.length)throw Error('Invalid collector state');
 for(const row of state){
  if(!row||typeof row.key!=='string'||!Number.isSafeInteger(row.fetched_at)||row.fetched_at<0||row.fetched_at>now+60000||!Number.isSafeInteger(row.retry_after)||(row.payload!==null&&typeof row.payload!=='string'))throw Error('Invalid collector state row');
  if(row.payload!==null){
   JSON.parse(row.payload);
   if(/"(?:wallet[^"\\]*|session[^"\\]*|private[^"\\]*)"\s*:/i.test(row.payload))throw Error('Private fields in collector payload');
  }
 }
 return state;
}
