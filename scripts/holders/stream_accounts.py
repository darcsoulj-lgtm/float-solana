"""Bounded JSON streaming for large public getProgramAccounts responses."""
import codecs,json

class StreamError(ValueError):pass

class Reader:
 def __init__(self,response,max_bytes=1024*1024*1024):
  self.response=response;self.max_bytes=max_bytes;self.bytes=0;self.buffer='';self.pos=0;self.eof=False
  self.utf8=codecs.getincrementaldecoder('utf-8')();self.decoder=json.JSONDecoder()
 def fill(self):
  self.buffer=self.buffer[self.pos:];self.pos=0
  raw=self.response.read(65536);self.bytes+=len(raw)
  if self.bytes>self.max_bytes:raise StreamError('Account response byte limit')
  self.eof=not raw
  try:self.buffer+=self.utf8.decode(raw,final=self.eof)
  except UnicodeError:raise StreamError('Invalid response encoding') from None
 def peek(self):
  while True:
   while self.pos<len(self.buffer) and self.buffer[self.pos] in ' \r\n\t':self.pos+=1
   if self.pos<len(self.buffer):return self.buffer[self.pos]
   if self.eof:return ''
   self.fill()
 def expect(self,char):
  if self.peek()!=char:raise StreamError('Invalid account response structure')
  self.pos+=1
 def value(self):
  self.peek()
  while True:
   if len(self.buffer)-self.pos>262144:raise StreamError('Account record size limit')
   try:
    value,end=self.decoder.raw_decode(self.buffer,self.pos)
    if end==len(self.buffer) and not self.eof:self.fill();continue
    self.pos=end;return value
   except json.JSONDecodeError:
    if self.eof:raise StreamError('Truncated or malformed account response') from None
    self.fill()
 def members(self):
  self.expect('{');seen=set()
  if self.peek()=='}':self.pos+=1;return
  while True:
   key=self.value()
   if not isinstance(key,str) or key in seen:raise StreamError('Invalid or duplicate response field')
   seen.add(key);self.expect(':');yield key
   if self.peek()=='}':self.pos+=1;return
   self.expect(',')
 def accounts(self):
  self.expect('[');count=0
  if self.peek()==']':self.pos+=1;return
  while True:
   count+=1
   if count>2000000:raise StreamError('Account count limit')
   yield self.value()
   if self.peek()==']':self.pos+=1;return
   self.expect(',')

def read_program_accounts(response,consume,max_bytes=1024*1024*1024):
 reader=Reader(response,max_bytes);root={};context=None;observation=None
 for key in reader.members():
  if key=='result':
   for field in reader.members():
    if field=='context':context=reader.value()
    elif field=='value':observation=consume(reader.accounts())
    else:raise StreamError('Unexpected account result field')
   root[key]=True
  else:root[key]=reader.value()
 if reader.peek():raise StreamError('Trailing account response data')
 if root.get('error') or root.get('jsonrpc')!='2.0' or root.get('id')!=1 or root.get('result') is not True:
  raise StreamError('Invalid account RPC envelope')
 if not isinstance(context,dict) or type(context.get('slot')) is not int or context['slot']<0 or observation is None:
  raise StreamError('Missing account context or observation')
 return {'context':context,'observation':observation}
