"""Publish only public market observations; a dedicated data branch owns its snapshots."""
import base64,json,os,pathlib,urllib.request,urllib.error
repo=os.environ['GITHUB_REPOSITORY']; token=os.environ['GH_TOKEN']; branch='market-data'
def api(path,method='GET',data=None):
    request=urllib.request.Request('https://api.github.com/repos/'+repo+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
if api('').get('private'):raise SystemExit('Public-repository-only zero-cost workflow')
root=pathlib.Path('work/market-snapshot'); manifest=json.loads((root/'pending.json').read_text())
entries=[]
for path in [root/'state.json',*[root/'chunks'/(h+'.json') for h in manifest['chunks']]]:
    blob=api('/git/blobs','POST',{'content':base64.b64encode(path.read_bytes()).decode(),'encoding':'base64'})
    entries.append({'path':str(path.relative_to(root)),'mode':'100644','type':'blob','sha':blob['sha']})
tree=api('/git/trees','POST',{'tree':entries})
# Each generation is independent; no unbounded market-data commit chain.
source=api('/git/commits','POST',{'message':'Collect public Backpack market observations','tree':tree['sha'],'parents':[]})
manifest['commit']=source['sha']
updated=api('/git/trees','POST',{'base_tree':tree['sha'],'tree':[{'path':'manifest.json','mode':'100644','type':'blob','content':json.dumps(manifest,separators=(',',':'))}]})
head=api('/git/commits','POST',{'message':'Publish verified market snapshot manifest','tree':updated['sha'],'parents':[source['sha']]})
try:api('/git/ref/heads/'+branch)
except urllib.error.HTTPError as error:
    if error.code!=404:raise
    api('/git/refs','POST',{'ref':'refs/heads/'+branch,'sha':head['sha']})
else:api('/git/refs/heads/'+branch,'PATCH',{'sha':head['sha'],'force':True})
print('Published immutable public market snapshot: '+str(len(manifest['chunks']))+' chunks')
