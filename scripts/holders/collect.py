"""Finite daily collector. Publishes aggregate counts only; no raw address artifacts."""
import argparse,base64,hashlib,json,pathlib,time,urllib.request,urllib.error
ISSUERS=('backpack','xstocks','ondo')
PROGRAMS={'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'}
AL='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def decode58(s):
 n=0
 for c in s:n=n*58+AL.index(c)
 return b'\0'*(len(s)-len(s.lstrip('1')))+n.to_bytes((n.bit_length()+7)//8,'big')
def scope_hash(mints):return hashlib.sha256('\n'.join(sorted(mints)).encode()).hexdigest()
def validate_registry(doc):
 rows=doc.get('issuers',[])
 if doc.get('version')!=1 or len(rows)!=3 or {r['issuer'] for r in rows}!=set(ISSUERS):raise ValueError('Invalid registry')
 seen=set()
 for r in rows:
  mints=r['mints']
  if not mints or len(mints)!=len(set(mints)) or len(mints)>10000 or r['registryHash']!=scope_hash(mints):raise ValueError('Invalid registry coverage')
  for m in mints:
   if m in seen or len(decode58(m))!=32:raise ValueError('Invalid or duplicate mint')
   seen.add(m)
 return rows
class ProviderError(Exception):pass
class Client:
 def __init__(self,url,gap=2.1):self.url=url;self.last=0;self.gap=gap
 def rpc(self,method,params):
  time.sleep(max(0,self.gap-(time.monotonic()-self.last)));self.last=time.monotonic()
  request=urllib.request.Request(self.url,data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),headers={'Content-Type':'application/json','User-Agent':'FloatHolderCensus/1.0'})
  try:
   with urllib.request.urlopen(request,timeout=60) as response:
    raw=response.read(120000001)
    if len(raw)>120000000:raise ProviderError('Response size limit')
    doc=json.loads(raw)
  except urllib.error.HTTPError as e:
   # Stop the entire run on throttling/auth failure; do not hammer a blocked endpoint.
   if e.code in (401,403,429):raise SystemExit('RPC access or rate limit; prior snapshot retained')
   raise ProviderError('RPC HTTP failure') from None
  except (OSError,ValueError):raise ProviderError('RPC unavailable or malformed') from None
  if doc.get('error') or not isinstance(doc.get('result'),dict):raise ProviderError('RPC returned an error')
  return doc['result']
def registry_url(url):
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; FloatHolderCensus/1.0; +https://joinfloat.xyz)','Accept':'application/json'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(request,timeout=30) as response:
    raw=response.read(1000001)
    if len(raw)>1000000:raise ValueError('Registry too large')
    return validate_registry(json.loads(raw))
  except urllib.error.HTTPError as error:
   if error.code not in (500,502,503,504) or attempt==2:raise
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
  time.sleep(2*(attempt+1))
def parse_accounts(accounts,mint,program):
 owners=set();seen=set();total=0;expected=decode58(mint)
 if not isinstance(accounts,list):raise ProviderError('Missing accounts')
 for a in accounts:
  b=base64.b64decode(a['account']['data'][0],validate=True);key=a['pubkey']
  if key in seen or len(b)!=109 or b[:32]!=expected or b[108] not in (1,2) or a['account']['owner']!=program or a['account'].get('executable'):
   raise ProviderError('Invalid or duplicate token account')
  seen.add(key);amount=int.from_bytes(b[64:72],'little');total+=amount
  if amount:owners.add(b[32:64])
 return total,owners

def collect_batch(client,mints):
 start=int(time.time()*1000)
 before=client.rpc('getMultipleAccounts',[mints,{'encoding':'jsonParsed','commitment':'finalized'}])
 if len(before['value'])!=len(mints):raise ProviderError('Missing mint records')
 slot=before['context']['slot'];observations={}
 for mint,m in zip(mints,before['value']):
  try:
   if not m or m['owner'] not in PROGRAMS or m['data']['parsed']['type']!='mint':raise ProviderError('Unverified mint program')
   ac=client.rpc('getProgramAccounts',[m['owner'],{'encoding':'base64','dataSlice':{'offset':0,'length':109},'commitment':'finalized','minContextSlot':slot,'withContext':True,'filters':[{'memcmp':{'offset':0,'bytes':mint}}]}])
   if ac['context']['slot']<before['context']['slot']:raise ProviderError('Regressed slot')
   slot=max(slot,ac['context']['slot']);total,owners=parse_accounts(ac['value'],mint,m['owner'])
   observations[mint]=(total,owners,m['data']['parsed']['info']['supply'])
  except (ProviderError,KeyError,ValueError,TypeError):pass
 after=client.rpc('getMultipleAccounts',[mints,{'encoding':'jsonParsed','commitment':'finalized','minContextSlot':slot}])
 if len(after['value'])!=len(mints) or after['context']['slot']<slot:raise ProviderError('Invalid after snapshot')
 results={}
 for mint,m in zip(mints,after['value']):
  if mint in observations and m:
   total,owners,supply=observations[mint]
   if str(total)==supply==m['data']['parsed']['info']['supply']:
    results[mint]=(owners,start,int(time.time()*1000))
 return results

def collect_issuer(client,scope):
 owners=set();failed=[];starts=[];ends=[];mints=scope['mints']
 def retain(results):
  for addresses,start,end in results.values():owners.update(addresses);starts.append(start);ends.append(end)
 for offset in range(0,len(mints),25):
  batch=mints[offset:offset+25]
  try:results=collect_batch(client,batch)
  except (ProviderError,KeyError,ValueError,TypeError):results={}
  retain(results);failed.extend(m for m in batch if m not in results)
  print(scope['issuer'],min(offset+25,len(mints)),'/',len(mints),'checked',flush=True)
 for mint in failed[:]:
  for attempt in range(2):
   try:results=collect_batch(client,[mint])
   except (ProviderError,KeyError,ValueError,TypeError):results={}
   if mint in results:retain(results);failed.remove(mint);break
 if failed or max(ends,default=0)-min(starts,default=0)>86400000:return None
 return {'issuer':scope['issuer'],'wallets':len(owners),'tokens':len(mints),'registryHash':scope['registryHash'],'startedAt':min(starts),'checkedAt':max(ends)}

def main():
 p=argparse.ArgumentParser();p.add_argument('--registry-url',default='https://joinfloat.xyz/api/issuer-holders/registry');p.add_argument('--rpc',default='https://api.mainnet-beta.solana.com');p.add_argument('--previous',default='public/data/issuer-holders.json');p.add_argument('--output',required=True);args=p.parse_args()
 scopes=registry_url(args.registry_url);previous=json.loads(pathlib.Path(args.previous).read_text());old={r['issuer']:r for r in previous['issuers']};client=Client(args.rpc);fresh={}
 for scope in scopes:
  # Keep the aggregate schema/history, but collect only the active product scope.
  if scope['issuer'] != 'backpack':continue
  row=collect_issuer(client,scope)
  if row:fresh[scope['issuer']]=row
  else:print('::warning::Incomplete '+scope['issuer']+' scan; retaining prior observation',flush=True)
 # New listings during collection invalidate only that issuer's new observation.
 final={r['issuer']:r for r in registry_url(args.registry_url)}
 rows=[];updated=0
 for issuer in ISSUERS:
  row=fresh.get(issuer)
  if row and row['registryHash']==final[issuer]['registryHash'] and row['checkedAt']>old[issuer]['checkedAt']:
   rows.append(row);updated+=1
  else:rows.append(old[issuer])
 if not updated:raise SystemExit('No complete updated issuer; previous snapshot unchanged')
 output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);tmp=output.with_suffix('.tmp');tmp.write_text(json.dumps({'version':1,'chain':'solana','method':'positive-owner-union-v1','issuers':rows},indent=2)+'\n');tmp.replace(output)
 print('Validated issuer updates:',updated,flush=True)
if __name__=='__main__':main()
