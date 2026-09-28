import unittest,base64
from unittest.mock import patch
from collect import parse_accounts,collect_batch,collect_issuer,scope_hash,validate_registry,decode58,ProviderError
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
 def test_bad_registry(self):
  with self.assertRaises(ValueError):validate_registry({'version':1,'issuers':[]})
if __name__=='__main__':unittest.main()
