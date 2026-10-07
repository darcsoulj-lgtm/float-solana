"""Publish only public market observations; a dedicated data branch owns its snapshots."""
import base64,json,os,pathlib,urllib.request,urllib.error,time
def api(path,method='GET',data=None,*,opener=None,sleep=time.sleep):
    repo=os.environ['GITHUB_REPOSITORY']; token=os.environ['GH_TOKEN']
    opener=opener or urllib.request.urlopen
    body=json.dumps(data).encode() if data is not None else None
    # These object writes are content addressed; a lost response creates no
    # duplicate public generation. Never blindly replay a branch mutation.
    retryable=method=='GET' or (method=='POST' and path in ['/git/blobs','/git/trees','/git/commits'])
    for attempt in range(4):
        request=urllib.request.Request('https://api.github.com/repos/'+repo+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
        try:
            with opener(request,timeout=30) as response:return json.load(response)
        except urllib.error.HTTPError as error:
            permitted=retryable and error.code in [429,500,502,503,504] and attempt<3
            raw=error.headers.get('Retry-After') if error.headers else None
            delay=max(2**attempt,int(raw)) if raw and raw.isdigit() else 2**attempt
            error.close()
            if not permitted or delay>30:raise
        except (urllib.error.URLError,TimeoutError,ConnectionError):
            if not retryable or attempt>=3:raise
            delay=2**attempt
        print('GitHub transient publication error; retrying in '+str(delay)+'s',flush=True)
        sleep(delay)

def main():
    branch='market-data'
    if api('').get('private'):raise SystemExit('Public-repository-only zero-cost workflow')
    root=pathlib.Path('work/market-snapshot'); manifest=json.loads((root/'pending.json').read_text())
    entries=[]
    for path in [root/'state.json',root/'verification.json',*[root/'chunks'/(h+'.json') for h in manifest['chunks']]]:
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
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        report=json.loads((root/'verification.json').read_text())
        health=report['health']
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:
            f.write('Public pool reconciliation: '+str(sum(h['status']=='healthy' for h in health))+'/'+str(len(health))+' markets fresh.\n\n')
            for h in health:
                if h['status']!='healthy':f.write('- '+h['symbol']+': '+h['status']+'; missing '+str(len(h['missing']))+', retained '+str(len(h['retained']))+', stale '+str(len(h['stale']))+' pools. Recovery remains scheduled.\n')
    print('Published immutable public market snapshot: '+str(len(manifest['chunks']))+' chunks')

if __name__=='__main__':main()
