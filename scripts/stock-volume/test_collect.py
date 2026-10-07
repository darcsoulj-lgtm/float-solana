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
        selected,coverage=select_tokens({'tokenVolumes':{'data':volumes}},assets,now,{t['tokens'][0]['contractAddress'] for t in assets})
        self.assertEqual([t['symbol'] for t in selected],['T6','T5','T4','T3','T2']);self.assertEqual(coverage['unavailable'],['T0','T1'])
        foreign={**assets[-1],'symbol':'FOREIGN.US'}
        foreign['tokens']=[{'blockchain':'Solana','contractAddress':'2'*44}]
        picked,scoped=select_tokens({'tokenVolumes':{'data':{**volumes,'FOREIGN':{'mint':'2'*44,'usd24h':1e12,'observedAt':ms}}}},assets+[foreign],now,{t['tokens'][0]['contractAddress'] for t in assets})
        self.assertEqual(scoped['total'],7);self.assertNotIn('FOREIGN',[t['symbol'] for t in picked])
        del volumes['T6']
        with self.assertRaises(ValueError):select_tokens({'tokenVolumes':{'data':volumes}},assets,now,{t['tokens'][0]['contractAddress'] for t in assets})
    def test_pagination_and_empty_closed_day(self):
        a,b=window(datetime(2026,10,4,12,tzinfo=timezone.utc))
        def closed(url,headers):return {'bars':{}} if '/bars?' in url else {'trades':{}}
        self.assertEqual(stock_volume('MU',a,b,{},True,closed,lambda _:None),0)
        def loop(url,headers):return {'bars':{}} if '/bars?' in url else {'trades':{},'next_page_token':'same'}
        with self.assertRaises(ValueError):stock_volume('MU',a,b,{},True,loop,lambda _:None)

    def test_inclusive_provider_end_does_not_include_next_day_bar(self):
        from urllib.parse import urlsplit, parse_qs
        a,b=window(datetime(2026,10,5,12,tzinfo=timezone.utc))
        calls=[]
        def provider(url,headers):
            q=parse_qs(urlsplit(url).query);calls.append(q)
            if '/bars?' in url:
                # Reproduce the real Sunday response: an inclusive Monday
                # midnight endpoint returns Monday's bar, even on a closed day.
                return {'bars':{'DJT':[{'t':iso(b),'v':4580016,'n':27830}]}} if q['end']==[iso(b)] else {'bars':{}}
            return {'trades':{}}
        self.assertEqual(stock_volume('DJT',a,b,{},True,provider,lambda _:None),0)
        self.assertEqual(len(calls),2)
        for q in calls:
            self.assertEqual(q['start'],['2026-10-04T04:00:00Z'])
            self.assertEqual(q['end'],['2026-10-05T03:59:59.999999999Z'])

    def test_publication_failure_monitor(self):
        now=datetime(2026,10,4,12,tzinfo=timezone.utc);_,end=window(now)
        p={'status':'daily','comparisons':[{'endUtc':iso(end),'rows':[{}]*5}]}
        check_public(p,now)
        for bad in [{**p,'status':'delayed'},{'status':'daily','comparisons':[]},{'status':'daily','comparisons':[{'endUtc':'old','rows':[{}]*5}]}]:
            with self.assertRaises(ValueError):check_public(bad,now)

    def test_partial_publication_requires_explicit_missing_identity(self):
        now=datetime(2026,10,5,12,tzinfo=timezone.utc);_,end=window(now)
        comparison={'endUtc':iso(end),'rows':[{'symbol':s} for s in ['DJT','SPCX','IBM','PFE']], 'comparisonCoverage':{'selected':['DJT','SPCX','IBM','PFE','EWZ'],'unavailable':[{'symbol':'EWZ','reason':'token-history-unavailable'}]}}
        check_public({'status':'daily','comparisons':[comparison]},now)
        for scope in [None, {'selected':['DJT','SPCX','IBM','PFE','EWZ'],'unavailable':[]}, {'selected':['DJT','SPCX','IBM','PFE','EWZ'],'unavailable':[{'symbol':'IBM','reason':'token-history-unavailable'}]}]:
            with self.assertRaises(ValueError):check_public({'status':'daily','comparisons':[{**comparison,'comparisonCoverage':scope}]},now)

class JobRecoveryTests(unittest.TestCase):
    def test_lost_response_reuses_signed_run_and_budget_denials_are_not_retried(self):
        import collect
        from unittest.mock import patch
        from urllib.parse import urlsplit
        with patch.object(collect,'identity',return_value='fixture'), patch.object(collect.time,'sleep') as pause:
            with patch.object(collect,'request_json',side_effect=[collect.SourceNetworkError('unavailable'), {'skipped':True}]) as request:
                self.assertEqual(collect.job({'action':'begin'}), {'skipped':True})
                self.assertEqual(request.call_count,2)
                self.assertEqual(request.call_args_list[0],request.call_args_list[1])
                pause.assert_called_once_with(2)
            for code in [403,409,429]:
                with patch.object(collect,'request_json',side_effect=collect.SourceHTTPError(code,urlsplit(collect.SITE+'/api/stock-volume-job'))) as request:
                    with self.assertRaises(collect.SourceHTTPError):collect.job({'action':'begin'})
                    self.assertEqual(request.call_count,1)
    def test_complete_day_exits_without_provider_reads(self):
        import collect
        from unittest.mock import patch
        with patch.object(collect,'job',return_value={'skipped':True}), patch.object(collect,'check_public'), patch.object(collect,'request_json',return_value={}) as request:
            collect.main()
            self.assertEqual(request.call_count,1)
            self.assertEqual(request.call_args.args[0],collect.SITE+'/api/stock-volume')

class ProviderPacingTests(unittest.TestCase):
    def test_empty_history_is_still_paced_and_a_throttle_retry_needs_budget(self):
        import collect
        from unittest.mock import Mock
        from urllib.parse import urlsplit
        query={'address':MINT}
        pause=Mock();fetch=Mock(return_value={'data':{'items':[]}});reserve=Mock()
        collect.birdeye_candles(query,{},fetch,pause,reserve)
        collect.birdeye_candles(query,{},fetch,pause,reserve)
        self.assertEqual(pause.call_args_list,[unittest.mock.call(2),unittest.mock.call(2)])
        reserve.assert_not_called()
        fetch=Mock(side_effect=[collect.SourceHTTPError(429,urlsplit(collect.SITE)),{'data':{'items':[]}}]);pause=Mock()
        collect.birdeye_candles(query,{},fetch,pause,reserve)
        reserve.assert_called_once_with({'action':'retry','retryId':MINT+':1'})
        self.assertEqual(pause.call_args_list,[unittest.mock.call(2),unittest.mock.call(5)])
        fetch=Mock(side_effect=collect.SourceHTTPError(429,urlsplit(collect.SITE)));reserve=Mock(side_effect=RuntimeError('Budget exhausted'))
        with self.assertRaises(RuntimeError):collect.birdeye_candles(query,{},fetch,Mock(),reserve)
        self.assertEqual(fetch.call_count,1)
