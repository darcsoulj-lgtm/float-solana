import io,json,unittest
from unittest.mock import patch
from stream_accounts import read_program_accounts,StreamError
from collect import Client,parse_accounts,ProviderError
from test_collect import MINT,PROGRAM,account

def envelope(rows):return {'jsonrpc':'2.0','id':1,'result':{'context':{'slot':42},'value':rows}}

class Chunked(io.BytesIO):
 def read(self,size=-1):return super().read(min(size,7))

class Generated:
 """A >120 MB valid fixture, produced in chunks without materializing it."""
 def __init__(self,count):self.parts=self.generate(count);self.pending=b'';self.bytes=0
 def generate(self,count):
  yield b'{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":42},"value":['
  for n in range(count):
   row=account(str(n),1,1);row['padding']='x'*2200
   yield ((',' if n else '')+json.dumps(row)).encode()
  yield b']}}'
 def read(self,size):
  while len(self.pending)<size:
   try:self.pending+=next(self.parts)
   except StopIteration:break
  raw=self.pending[:size];self.pending=self.pending[size:];self.bytes+=len(raw);return raw

class Tests(unittest.TestCase):
 def test_chunk_boundaries_preserve_context_balances_owner_union_and_unicode(self):
  doc=envelope([account('a',1,2),account('b',1,3),account('c',2,0)])
  doc['result']['context']['apiVersion']='unicode-é'
  result=read_program_accounts(Chunked(json.dumps(doc,ensure_ascii=False).encode()),lambda rows:parse_accounts(rows,MINT,PROGRAM))
  self.assertEqual(result['context']['slot'],42);self.assertEqual(result['observation'],(5,{bytes([1])*32}))
 def test_responses_larger_than_old_limit_are_reconciled_with_bounded_reads(self):
  response=Generated(50000)
  result=read_program_accounts(response,lambda rows:parse_accounts(rows,MINT,PROGRAM))
  self.assertGreater(response.bytes,120000000);self.assertEqual(result['observation'],(50000,{bytes([1])*32}))
 def test_malformed_truncated_duplicate_and_over_budget_never_return_an_observation(self):
  good=json.dumps(envelope([])).encode()
  bad=[good[:-1],good+b'false',b'{"jsonrpc":"2.0","id":1,"result":{"value":[]}}',b'{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":[],"value":[]}}',b'{"jsonrpc":"2.0","id":1,"error":{"code":-1}}']
  for raw in bad:
   with self.assertRaises(StreamError):read_program_accounts(Chunked(raw),lambda rows:parse_accounts(rows,MINT,PROGRAM))
  with self.assertRaisesRegex(StreamError,'byte limit'):read_program_accounts(io.BytesIO(good),lambda rows:list(rows),max_bytes=10)
  huge=json.dumps(envelope([{'padding':'x'*300000}])).encode()
  with self.assertRaisesRegex(StreamError,'record size limit'):read_program_accounts(io.BytesIO(huge),lambda rows:list(rows))
 def test_duplicate_token_accounts_still_fail_and_client_uses_stream_adapter(self):
  doc=envelope([account('a',1,2),account('a',1,2)])
  with self.assertRaises(ProviderError):read_program_accounts(Chunked(json.dumps(doc).encode()),lambda rows:parse_accounts(rows,MINT,PROGRAM))
  good=envelope([account('a',1,2)])
  with patch('collect.urllib.request.urlopen',return_value=Chunked(json.dumps(good).encode())),patch('collect.time.sleep'):
   result=Client('https://fixture.invalid').rpc('getProgramAccounts',[PROGRAM,{'filters':[{'memcmp':{'offset':0,'bytes':MINT}}]}])
  self.assertEqual(result['observation'][0],2)

if __name__=='__main__':unittest.main()
