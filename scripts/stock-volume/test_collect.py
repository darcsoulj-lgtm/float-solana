import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from collect import window, token_volume, TradeAccumulator, select_tokens, stock_volume, check_public, iso, request_json

MINT='MUxFhHbcHwygMiUEjAMrAQbiKGUCFTLP89DUs3gqGay1'
class DailyComparisonTests(unittest.TestCase):
    def test_collector_identification_and_safe_error(self):
        import urllib.error
        with patch('urllib.request.urlopen', side_effect=urllib.error.HTTPError('https://example.com?key=private',403,'blocked',{},None)) as call:
            with self.assertRaisesRegex(RuntimeError, '^Source HTTP 403 at example.com$'):
                request_json('https://example.com?key=private')
            self.assertIn('FloatStockCollector/1.0',call.call_args[0][0].get_header('User-agent'))
    def test_calendar_dst(self):
        for day,hours in [('2026-03-09T12:00:00+00:00',23),('2026-11-02T12:00:00+00:00',25),('2026-10-04T12:00:00+00:00',24)]:
            a,b=window(datetime.fromisoformat(day));self.assertEqual((b.timestamp()-a.timestamp())/3600,hours)
    def test_sparse_missing_and_identity(self):
        a,b=window(datetime(2026,10,4,12,tzinfo=timezone.utc))
        good={'success':True,'data':{'items':[{'unix_time':int(a.timestamp()),'v_usd':3,'address':MINT}]}}
        self.assertEqual(token_volume(good,MINT,a,b),3)
        for items in [[],[{'unix_time':int(a.timestamp()),'v_usd':None}],[{'unix_time':int(a.timestamp()),'v_usd':3,'address':'wrong'}],good['data']['items']*2]:
            with self.assertRaises(Exception):token_volume({'success':True,'data':{'items':items}},MINT,a,b)
    def test_conditions_corrections_and_reconciliation(self):
        a,b=window(datetime(2026,10,4,12,tzinfo=timezone.utc));stamp=a.isoformat()
        base={'t':stamp,'x':'V','i':1,'p':10,'s':2,'c':['@'],'z':'C'}
        acc=TradeAccumulator(a,b)
        acc.add([base,{**base,'i':2,'u':'canceled'},{**base,'i':3,'u':'incorrect'},{**base,'i':4,'u':'corrected','p':11},{**base,'i':5,'c':['M']}])
        self.assertEqual(acc.reconcile({'t':stamp,'v':4,'n':2}),42)
        with self.assertRaises(ValueError):acc.reconcile({'t':stamp,'v':4,'n':3})
        with self.assertRaises(ValueError):acc.add([base])
        with self.assertRaises(ValueError):acc.add([{**base,'i':9,'u':'unrecognized'}])
        with self.assertRaises(ValueError):acc.add([{**base,'i':10,'c':['new']}])
        with self.assertRaises(ValueError):acc.add([{**base,'i':11,'t':b.isoformat()}])
    def test_closed_market_needs_empty_tape(self):
        a,b=window(datetime(2026,10,4,12,tzinfo=timezone.utc));acc=TradeAccumulator(a,b)
        self.assertEqual(acc.reconcile(None,True),0)
        with self.assertRaises(ValueError):acc.reconcile(None,False)
        with self.assertRaises(ValueError):acc.reconcile({'t':a.isoformat(),'v':0,'n':0},True)
    def test_listing_expansion_stale_and_mint_mismatch(self):
        now=datetime(2026,10,4,12,tzinfo=timezone.utc);ms=int(now.timestamp()*1000)
        assets=[{'symbol':f'T{i}.US','displayName':f'Token {i}','tokens':[{'blockchain':'Solana','contractAddress':MINT[:-1]+str(i+1)}]} for i in range(7)]
        volumes={f'T{i}':{'mint':assets[i]['tokens'][0]['contractAddress'],'usd24h':i+1,'observedAt':ms} for i in range(7)}
        volumes['T0']['observedAt']=ms-25*3600000;volumes['T1']['mint']='wrong'
        selected,coverage=select_tokens({'tokenVolumes':{'data':volumes}},assets,now)
        self.assertEqual([t['symbol'] for t in selected],['T6','T5','T4','T3','T2']);self.assertEqual(coverage['unavailable'],['T0','T1'])
        del volumes['T6']
        with self.assertRaises(ValueError):select_tokens({'tokenVolumes':{'data':volumes}},assets,now)
    def test_pagination_and_empty_closed_day(self):
        a,b=window(datetime(2026,10,4,12,tzinfo=timezone.utc))
        def closed(url,headers):return {'bars':{}} if '/bars?' in url else {'trades':{}}
        self.assertEqual(stock_volume('MU',a,b,{},True,closed,lambda _:None),0)
        def loop(url,headers):return {'bars':{}} if '/bars?' in url else {'trades':{},'next_page_token':'same'}
        with self.assertRaises(ValueError):stock_volume('MU',a,b,{},True,loop,lambda _:None)

    def test_publication_failure_monitor(self):
        now=datetime(2026,10,4,12,tzinfo=timezone.utc);_,end=window(now)
        p={'status':'daily','comparisons':[{'endUtc':iso(end),'rows':[{}]*5}]}
        check_public(p,now)
        for bad in [{**p,'status':'delayed'},{'status':'daily','comparisons':[]},{'status':'daily','comparisons':[{'endUtc':'old','rows':[{}]*5}]}]:
            with self.assertRaises(ValueError):check_public(bad,now)
