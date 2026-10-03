import unittest,base64,json,tempfile,pathlib,urllib.error,io
from unittest.mock import patch
from collect import parse_accounts,collect_batch,collect_issuer,scope_hash,validate_registry,decode58,ProviderError,main,registry_url
MINT='MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1';PROGRAM='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
def account(key,owner,amount,state=1):
 b=bytearray(109);b[:32]=decode58(MINT);b[32:64]=bytes([owner])*32;b[64:72]=amount.to_bytes(8,'little');b[108]=state
 return {'pubkey':key,'account':{'owner':PROGRAM,'data':[base64.b64encode(b).decode(),'base64']}}
def mint(supply):return {'owner':PROGRAM,'data':{'parsed':{'type':'mint','info':{'supply':str(supply)}}}}
class Tests(unittest.TestCase):
 def test_dedup_and_zero_and_frozen(self):
  total,owners=parse_accounts([account('a',1,2),account('b',1,3),account('c',2,0),account('d',3,4,2)],MINT,PROGRAM)
  self.assertEqual(total,9);self.assertEqual(len(owners),2)
 def test_malformed_never_partial(self):
  for rows in [[account('a',1,2),account('a',1,3)],[account('a',1,2,0)]]:
   with self.assertRaises(ProviderError):parse_accounts(rows,MINT,PROGRAM)
 def test_supply_change_and_missing_response_fail_closed(self):
  class Fake:
   def __init__(self,supply):self.supply=supply;self.step=0
   def rpc(self,method,params):
    self.step+=1
    if self.step==2:return {'context':{'slot':2},'value':[account('a',1,10)]}
    return {'context':{'slot':self.step},'value':[mint(10 if self.step==1 else self.supply)]}
  self.assertEqual(collect_batch(Fake(11),[MINT]),{})
  with patch('collect.time.time',return_value=123):
   good=collect_batch(Fake(10),[MINT]);self.assertEqual(len(good[MINT][0]),1)
 def test_retry_unresolved_token_and_union(self):
  scope={'issuer':'backpack','mints':[MINT,'other'],'registryHash':'a'*64}
  with patch('collect.collect_batch',side_effect=[{MINT:({b'a'},1,2)},{'other':({b'a',b'b'},3,4)}]):
   result=collect_issuer(None,scope);self.assertEqual(result['wallets'],2);self.assertEqual(result['tokens'],2)
  with patch('collect.collect_batch',return_value={}):self.assertIsNone(collect_issuer(None,scope))
 def test_daily_collection_only_refreshes_backpack(self):
  rows=[{'issuer':issuer,'wallets':1,'tokens':1,'registryHash':issuer,'startedAt':1,'checkedAt':2} for issuer in ['backpack','xstocks','ondo']]
  scopes=[{'issuer':r['issuer'],'registryHash':r['registryHash']} for r in rows]
  with tempfile.TemporaryDirectory() as directory:
   previous=pathlib.Path(directory)/'previous.json';output=pathlib.Path(directory)/'next.json'
   previous.write_text(json.dumps({'issuers':rows}))
   with patch('sys.argv',['collect','--previous',str(previous),'--output',str(output)]),patch('collect.registry_url',return_value=scopes),patch('collect.collect_issuer',return_value={**rows[0],'checkedAt':3}) as collect:
    main()
   self.assertEqual(collect.call_count,1);self.assertEqual(collect.call_args.args[1]['issuer'],'backpack')
   saved=json.loads(output.read_text())['issuers'];self.assertEqual(saved[1:],rows[1:]);self.assertEqual(saved[0]['checkedAt'],3)
 def test_bad_registry(self):
  with self.assertRaises(ValueError):validate_registry({'version':1,'issuers':[]})
 def test_registry_retries_transient_503_but_not_invalid_identity_or_auth(self):
  failure=urllib.error.HTTPError('https://joinfloat.xyz/api/issuer-holders/registry',503,'unavailable',{},None)
  with patch('collect.urllib.request.urlopen',side_effect=[failure,io.BytesIO(b'{}')]) as read,patch('collect.time.sleep') as sleep,patch('collect.validate_registry',return_value=['verified']):
   self.assertEqual(registry_url('https://joinfloat.xyz/api/issuer-holders/registry'),['verified']);self.assertEqual(read.call_count,2);sleep.assert_called_once_with(2)
  for code in [401,403,429]:
   with patch('collect.urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://joinfloat.xyz',code,'blocked',{},None)) as read,patch('collect.time.sleep') as sleep:
    with self.assertRaises(urllib.error.HTTPError):registry_url('https://joinfloat.xyz/api/issuer-holders/registry')
    self.assertEqual(read.call_count,1);sleep.assert_not_called()
  with patch('collect.urllib.request.urlopen',return_value=io.BytesIO(b'{}')) as read,patch('collect.time.sleep') as sleep:
   with self.assertRaises(ValueError):registry_url('https://joinfloat.xyz/api/issuer-holders/registry')
   self.assertEqual(read.call_count,1);sleep.assert_not_called()
 def test_registry_outage_has_three_attempts_and_never_fabricates_a_scope(self):
  with patch('collect.urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://joinfloat.xyz',503,'unavailable',{},None)) as read,patch('collect.time.sleep') as sleep:
   with self.assertRaises(urllib.error.HTTPError):registry_url('https://joinfloat.xyz/api/issuer-holders/registry')
   self.assertEqual(read.call_count,3);self.assertEqual(sleep.call_count,2)
 def test_listing_added_mid_scan_retains_previous_count_and_date(self):
  rows=[{'issuer':issuer,'wallets':1,'tokens':1,'registryHash':issuer,'startedAt':1,'checkedAt':2} for issuer in ['backpack','xstocks','ondo']]
  scopes=[{'issuer':r['issuer'],'registryHash':r['registryHash']} for r in rows];changed=[{**r,'registryHash':'new'} if r['issuer']=='backpack' else r for r in scopes]
  with tempfile.TemporaryDirectory() as directory:
   previous=pathlib.Path(directory)/'previous.json';output=pathlib.Path(directory)/'next.json';previous.write_text(json.dumps({'issuers':rows}))
   with patch('sys.argv',['collect','--previous',str(previous),'--output',str(output)]),patch('collect.registry_url',side_effect=[scopes,changed]),patch('collect.collect_issuer',return_value={**rows[0],'checkedAt':3}):
    with self.assertRaisesRegex(SystemExit,'previous snapshot unchanged'):main()
   self.assertFalse(output.exists());self.assertEqual(json.loads(previous.read_text())['issuers'],rows)
if __name__=='__main__':unittest.main()
