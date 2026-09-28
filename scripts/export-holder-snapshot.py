"""Publish only a fully reconciled research aggregate to the local public artifact.
Never copies wallet addresses. A failed/incomplete run leaves the old file intact.
"""
import argparse,json,gzip,pathlib,datetime,hashlib
parser=argparse.ArgumentParser();parser.add_argument('--research',required=True);parser.add_argument('--output',default='public/data/issuer-holders.json');a=parser.parse_args();root=pathlib.Path(a.research)
base=json.loads((root/'full/results.json').read_text());retry=json.loads((root/'recheck/results.json').read_text());overrides={r['mint']:r for r in retry}
assert json.loads((root/'full/progress.json').read_text())['state']=='complete'
assert json.loads((root/'recheck/progress.json').read_text())['state']=='complete'
universe=json.loads((root.parent/'holder-metrics-full-2026-09-28/universe.json').read_text());issuers=[]
for issuer in ['backpack','xstocks','ondo']:
 expected={r['mint'] for r in universe if r['issuer']==issuer};rows=[r for r in base if r['issuer']==issuer]
 assert len(rows)==len(expected) and {r['mint'] for r in rows}==expected, 'Incomplete registry coverage'
 owners=set();times=[]
 for original in rows:
  r=overrides.get(original['mint'],original);folder='recheck' if original['mint'] in overrides else 'full'
  assert r['passed'] and r['rawSum']==r['beforeSupply']==r['afterSupply'] and r['invalidAccounts']==0, 'Unreconciled token'
  with gzip.open(root/folder/(r['mint']+'-owners.json.gz'),'rt') as f:addresses=json.load(f)
  assert len(set(addresses))==r['uniqueOwners'] and all(len(x)==64 and all(c in '0123456789abcdef' for c in x) for x in addresses)
  owners.update(addresses)
  suffix='-accounts' if folder=='recheck' else ''
  with gzip.open(root/folder/(r['mint']+suffix+'.json.gz'),'rt') as f:raw=json.load(f)
  times.extend([raw['requestedAt']*1000,raw['receivedAt']*1000])
 issuers.append({'issuer':issuer,'wallets':len(owners),'tokens':len(expected),'registryHash':hashlib.sha256('\n'.join(sorted(expected)).encode()).hexdigest(),'startedAt':int(min(times)),'checkedAt':int(max(times))})
data={'version':1,'chain':'solana','method':'positive-owner-union-v1','issuers':issuers}
output=pathlib.Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);temp=output.with_suffix('.tmp');temp.write_text(json.dumps(data,indent=2)+'\n');temp.replace(output)
print('Exported aggregate only:',[(r['issuer'],r['wallets']) for r in issuers])
