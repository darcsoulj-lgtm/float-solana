"""Daily, quota-bounded comparison. Provider keys stay inside the authorized runner.
No raw trade datasets, credentials or wallet data are published.
"""
import json, os, re, sys, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta, timezone
from decimal import Decimal as D
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
SITE = 'https://joinfloat.xyz'
AUDIENCE = SITE + '/stock-volume-collector'
KNOWN = {'A': set('B C E F H I K L M N O P Q R T U V X Z 4 5 6 7 9'.split()) | {' '},
         'B': set('B C E F H I K L M N O P Q R T U V X Z 4 5 6 7 9'.split()) | {' '},
         'C': set('@ A B C D F G H I K L M N O P Q R T U V W X Y Z 4 5 6 7 9'.split())}
EXCLUDED = {'M', 'Q', '9'}
class TokenDayUnavailable(ValueError): pass

def request_json(url, headers=None, body=None, limit=12000000):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
        headers={'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FloatStockCollector/1.0; +https://joinfloat.xyz)', **({'Content-Type': 'application/json'} if body is not None else {}), **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            if response.status == 204: return None
            raw = response.read(limit + 1)
        if len(raw) > limit: raise ValueError('Oversized provider data at ' + urllib.parse.urlsplit(url).hostname)
        return json.loads(raw)
    except urllib.error.HTTPError as error:
        source = urllib.parse.urlsplit(url)
        raise RuntimeError('Source HTTP ' + str(error.code) + ' at ' + source.hostname + source.path) from None
    except urllib.error.URLError:
        raise RuntimeError('Source network error at ' + urllib.parse.urlsplit(url).hostname) from None

def identity():
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=' + urllib.parse.quote(AUDIENCE, safe='')
    value = request_json(url, {'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}, limit=16000)['value']
    print('::add-mask::' + value, flush=True)
    # Public scope metadata only: never log the token, signature or credentials.
    import base64
    encoded = value.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
    print(json.dumps({'collectorIdentity': {k: claims.get(k) for k in ('repository','ref','workflow_ref','sub','event_name')}, 'identityLifetimeSeconds':claims.get('exp',0)-claims.get('iat',0)}),flush=True)
    return value

def job(body):
    return request_json(SITE + '/api/stock-volume-job', {'Authorization': 'Bearer ' + identity()}, body, limit=16000)

def window(now):
    end = now.astimezone(ET).replace(hour=0, minute=0, second=0, microsecond=0)
    return end - timedelta(days=1), end

def iso(value): return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
def parse_time(value):
    value = re.sub(r'\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)', lambda m: '.' + (m[1] + '000000')[:6], value)
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def select_tokens(market, assets, now, verified_mints):
    canonical = {}
    for asset in assets:
        if not asset.get('symbol', '').endswith('.US'): continue
        symbol = asset['symbol'][:-3]
        matches = [t for t in asset.get('tokens', []) if t.get('blockchain') == 'Solana']
        if len(matches) != 1: continue
        mint = matches[0].get('contractAddress')
        if mint in verified_mints and re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', mint or ''):
            if symbol in canonical: raise ValueError('Duplicate official token')
            canonical[symbol] = {'symbol': symbol, 'mint': mint, 'name': asset['displayName']}
    data = market.get('tokenVolumes', {}).get('data', {})
    candidates = []
    for symbol, token in canonical.items():
        v = data.get(symbol, {})
        if v.get('mint') != token['mint']: continue
        amount, observed = v.get('usd24h'), v.get('observedAt')
        if not isinstance(amount, (float, int)) or amount < 0 or not D(str(amount)).is_finite(): continue
        if not isinstance(observed, int) or observed > int(now.timestamp()*1000)+60000 or int(now.timestamp()*1000)-observed > 24*3600000: continue
        candidates.append({**token, 'observedUsd': amount})
    candidates.sort(key=lambda x: (-x['observedUsd'], x['symbol']))
    if len(candidates) < 5: raise ValueError('Insufficient fresh ranking observations')
    return candidates[:5], {'available': len(candidates), 'total': len(canonical), 'unavailable': sorted(set(canonical)-{t['symbol'] for t in candidates})}

def token_volume(payload, mint, start, end):
    if payload.get('success') is not True: raise ValueError('Unsuccessful token series')
    data = payload.get('data', {})
    if data.get('has_more') or data.get('hasMore'): raise ValueError('Incomplete token pagination')
    items = data.get('items'); seen = set(); values = []
    if not isinstance(items, list): raise ValueError('Missing token series')
    for item in items:
        stamp = item.get('unix_time', item.get('unixTime'))
        volume = item.get('v_usd', item.get('vUsd'))
        if not isinstance(stamp, int) or stamp % 3600 or stamp in seen: raise ValueError('Invalid candle time')
        seen.add(stamp)
        if item.get('address', mint) != mint or item.get('type', '1H') != '1H' or item.get('currency', 'usd') != 'usd': raise ValueError('Wrong token identity or basis')
        value = D(str(volume))
        if not value.is_finite() or value < 0: raise ValueError('Invalid token dollars')
        if int(start.timestamp()) <= stamp < int(end.timestamp()): values.append(value)
    # Sparse series can omit inactive hours; a wholly absent day is not proven zero.
    if not values: raise TokenDayUnavailable('Token day unavailable')
    return sum(values, D(0))

class TradeAccumulator:
    def __init__(self, start, end):
        self.start, self.end = start, end
        self.seen = set(); self.shares = D(0); self.usd = D(0); self.count = 0
    def add(self, trades):
        for trade in trades:
            t = parse_time(trade['t'])
            if not self.start <= t < self.end: raise ValueError('Trade outside comparison day')
            key = (trade['x'], str(trade['i']), trade['t'])
            if key in self.seen: raise ValueError('Duplicate eligible tape identity')
            self.seen.add(key)
            update = trade.get('u')
            if update in ('canceled', 'incorrect'): continue
            if update not in (None, '', 'corrected'): raise ValueError('Unknown correction status')
            conditions = trade.get('c')
            if not isinstance(conditions, list) or not conditions or any(c not in KNOWN.get(trade.get('z'), set()) for c in conditions): raise ValueError('Unknown trade condition')
            if EXCLUDED.intersection(conditions): continue
            price, size = D(str(trade['p'])), D(str(trade['s']))
            if not price.is_finite() or not size.is_finite() or price <= 0 or size <= 0: raise ValueError('Invalid eligible trade')
            self.shares += size; self.usd += price*size; self.count += 1
    def reconcile(self, bar, closed=False):
        if closed:
            if bar is not None or self.count or self.shares: raise ValueError('Unexpected closed-market trades')
            return D(0)
        if not bar or self.shares != D(str(bar['v'])) or self.count != bar.get('n'): raise ValueError('Stock tape does not reconcile')
        if parse_time(bar['t']).astimezone(ET) != self.start: raise ValueError('Wrong stock daily boundary')
        return self.usd

def stock_volume(symbol, start, end, headers, closed, fetch=request_json, pause=time.sleep):
    # Alpaca's end is inclusive. Stop one nanosecond before our exclusive day
    # boundary, otherwise Sunday's request includes Monday's entire daily bar.
    inclusive_end = iso(end - timedelta(seconds=1)).replace('Z', '.999999999Z')
    query = {'symbols':symbol, 'start':iso(start), 'end':inclusive_end, 'feed':'sip', 'currency':'USD', 'asof':start.date().isoformat()}
    daily = fetch('https://data.alpaca.markets/v2/stocks/bars?' + urllib.parse.urlencode({**query, 'timeframe':'1Day', 'limit':100, 'adjustment':'raw'}), headers)
    if daily.get('next_page_token') or set(daily.get('bars', {})) - {symbol}: raise ValueError('Invalid daily stock response')
    bars = daily.get('bars', {}).get(symbol, [])
    if len(bars) > 1: raise ValueError('Unexpected daily bar count')
    acc = TradeAccumulator(start, end); cursor = None; cursors = set()
    for _ in range(400):
        pause(0.35)
        q = {**query, 'limit':10000, 'sort':'asc', **({'page_token':cursor} if cursor else {})}
        payload = fetch('https://data.alpaca.markets/v2/stocks/trades?' + urllib.parse.urlencode(q), headers)
        trades = payload.get('trades')
        if not isinstance(trades, dict) or set(trades)-{symbol} or not isinstance(trades.get(symbol, []), list): raise ValueError('Wrong stock identity')
        acc.add(trades.get(symbol, [])); cursor = payload.get('next_page_token')
        if not cursor: return acc.reconcile(bars[0] if bars else None, closed)
        if cursor in cursors: raise ValueError('Stock pagination loop')
        cursors.add(cursor)
    raise ValueError('Stock pagination incomplete')

def main():
    now = datetime.now(timezone.utc); start, end = window(now)
    market = request_json(SITE+'/api/backpack-market', limit=4000000)
    assets = request_json('https://api.backpack.exchange/api/v1/assets', limit=8000000)
    import hashlib
    registry = request_json(SITE+'/api/issuer-holders/registry', limit=1000000)
    scoped = [r for r in registry.get('issuers',[]) if r.get('issuer')=='backpack']
    if registry.get('version')!=1 or len(scoped)!=1: raise ValueError('Verified Backpack scope unavailable')
    mints=scoped[0].get('mints',[])
    if not mints or len(mints)!=len(set(mints)) or scoped[0].get('registryHash')!=hashlib.sha256('\n'.join(sorted(mints)).encode()).hexdigest(): raise ValueError('Invalid verified Backpack scope')
    selected, coverage = select_tokens(market, assets, now, set(mints))
    settings = job({'action':'begin'})
    for value in settings.values(): print('::add-mask::'+value, flush=True)
    headers = {'APCA-API-KEY-ID':settings['alpacaId'], 'APCA-API-SECRET-KEY':settings['alpacaSecret']}
    date = start.date().isoformat()
    calendar = request_json('https://paper-api.alpaca.markets/v2/calendar?'+urllib.parse.urlencode({'start':date,'end':date}), headers)
    if not isinstance(calendar, list) or len(calendar)>1 or any(c.get('date')!=date for c in calendar): raise ValueError('Invalid US market calendar')
    closed = not calendar
    rows, unavailable = [], []
    for token in selected:
        symbol, mint = token['symbol'], token['mint']
        asset = request_json('https://paper-api.alpaca.markets/v2/assets/'+urllib.parse.quote(symbol), headers, limit=16000)
        if asset.get('symbol') != symbol or asset.get('class') != 'us_equity' or asset.get('status') != 'active' or asset.get('exchange') not in ('NASDAQ','NYSE','AMEX','ARCA','BATS','OTC'): raise ValueError('US stock identity unavailable')
        query = {'address':mint,'type':'1H','currency':'usd','mode':'range','time_from':int(start.timestamp()),'time_to':int(end.timestamp())-1,'ui_amount_mode':'scaled','padding':'false'}
        candles = request_json('https://public-api.birdeye.so/defi/v3/ohlcv?'+urllib.parse.urlencode(query), {'X-API-KEY':settings['birdeye'],'x-chain':'solana'}, limit=2000000)
        try: token_usd = token_volume(candles, mint, start, end)
        except TokenDayUnavailable:
            unavailable.append({'symbol':symbol,'reason':'token-history-unavailable'})
            print(json.dumps({'symbol':symbol,'date':date,'unavailable':'token-history-unavailable'}),flush=True)
            continue
        stock_usd = stock_volume(symbol, start, end, headers, closed)
        rows.append({'symbol':symbol,'mint':mint,'name':asset.get('name') or token['name'],'listingExchange':asset['exchange'],'tokenUsd':float(token_usd),'stockUsd':float(stock_usd),'reconciled':True,**({'stockMarketClosed':True} if closed else {})})
        print(json.dumps({'symbol':symbol,'date':date,'reconciled':True,'marketClosed':closed}),flush=True)
        time.sleep(1.1)
    if len(rows)<3: raise ValueError('Insufficient verified daily comparisons')
    result = {'period':1,'startUtc':iso(start),'endUtc':iso(end),'timeZone':'America/New_York','tokenSource':'birdeye','stockSource':'alpaca-sip','coverage':coverage,'rows':rows,'selectionBasis':'latest-market-volume','selectedAt':int(now.timestamp()*1000),'generatedAt':int(datetime.now(timezone.utc).timestamp()*1000), 'comparisonCoverage':{'selected':[t['symbol'] for t in selected],'unavailable':unavailable}}
    job({'action':'publish','comparison':result})
    check = request_json(SITE+'/api/stock-volume')
    if check['comparisons'][0]['endUtc'] != result['endUtc'] or check['comparisons'][0].get('generatedAt') != result['generatedAt']: raise ValueError('Published comparison verification failed')
    print('Published and verified '+date+' matched stock-volume comparison',flush=True)

def check_public(payload, now):
    _, end = window(now)
    comparisons = payload.get('comparisons', [])
    if payload.get('status') != 'daily' or len(comparisons) != 1 or comparisons[0].get('endUtc') != iso(end):
        raise ValueError('Daily stock comparison missing or delayed')
    comparison=comparisons[0]; rows=comparison.get('rows',[]); scope=comparison.get('comparisonCoverage')
    if scope is None:
        if len(rows)!=5: raise ValueError('Incomplete comparison coverage')
    else:
        selected=scope.get('selected',[]); missing=scope.get('unavailable',[])
        symbols=[r.get('symbol') for r in rows]; absent=[r.get('symbol') for r in missing]
        if len(selected)!=5 or len(set(selected))!=5 or not 3<=len(rows)<=5 or len(set(symbols+absent))!=5 or set(selected)!=set(symbols+absent) or any(r.get('reason')!='token-history-unavailable' for r in missing):
            raise ValueError('Incomplete comparison coverage')
    print('Daily stock comparison publication is current', flush=True)

if __name__ == '__main__':
    try:
        if '--check' in sys.argv: check_public(request_json(SITE+'/api/stock-volume'), datetime.now(timezone.utc))
        else: main()
    except Exception as error:
        if '--check' not in sys.argv:
            try: job({'action':'failed'})
            except Exception: pass
        # Only fixed error types/messages, never provider response bodies or keys.
        print('::error::Daily stock comparison failed: '+type(error).__name__+': '+str(error)[:160],flush=True)
        raise SystemExit(1) from None
