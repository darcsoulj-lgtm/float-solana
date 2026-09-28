"""Publish a compact aggregate to the repository's dedicated data branch."""
import base64,json,os,pathlib,urllib.request,urllib.error
repo=os.environ['GITHUB_REPOSITORY'];token=os.environ['GH_TOKEN'];branch='holder-data'
def api(path,method='GET',data=None):
 request=urllib.request.Request('https://api.github.com/repos/'+repo+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
 with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
metadata=api('')
if metadata.get('private'):raise SystemExit('Public-repository-only zero-cost workflow')
try:api('/git/ref/heads/'+branch)
except urllib.error.HTTPError as e:
 if e.code!=404:raise
 head=api('/git/ref/heads/'+metadata['default_branch']);api('/git/refs','POST',{'ref':'refs/heads/'+branch,'sha':head['object']['sha']})
raw=pathlib.Path('work/issuer-holders.json').read_bytes()
if len(raw)>16384:raise SystemExit('Unexpected aggregate size')
doc=json.loads(raw)
if len(doc['issuers'])!=3 or any(set(r)!= {'issuer','wallets','tokens','registryHash','startedAt','checkedAt'} for r in doc['issuers']):raise SystemExit('Unexpected public fields')
body={'message':'Refresh verified issuer holding wallets','content':base64.b64encode(raw).decode(),'branch':branch}
try:
 old=api('/contents/issuer-holders.json?ref='+branch);body['sha']=old['sha']
except urllib.error.HTTPError as e:
 if e.code!=404:raise
api('/contents/issuer-holders.json','PUT',body)
print('Published aggregate snapshot; no wallet addresses included')
