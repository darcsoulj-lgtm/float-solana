"""One authorized UTC-day recovery. Raw evidence stays local; no live-volume writes.

Reuse the existing Birdeye history adapter. Reserve every request in the regular
rolling volume ledger before contact, including its one bounded retry. Reruns
reuse completed evidence and never replay an interrupted request silently.
"""
import argparse, hashlib, json, pathlib, re, sys, time, urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/stock-volume'))
from collect import request_json, birdeye_candles, token_volume, TokenDayUnavailable, SourceHTTPError

CU = 40
BUDGET = 20000
CF = 'https://api.cloudflare.com/client/v4/accounts/d3e7bd4eb990bc3978aa78cae19c509f/d1/database/9b18cdb5-e516-4116-8ab0-90eb670aa6d2/query'

def write(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)

def query(sql, params):
    config = pathlib.Path.home() / 'Library/Preferences/.wrangler/config/default.toml'
    match = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config.read_text(), re.M)
    if not match: raise ValueError('Existing Cloudflare access unavailable')
    result = request_json(CF, {'Authorization': 'Bearer ' + match[1]}, {'sql': sql, 'params': params})
    if result.get('success') is not True: raise ValueError('D1 query failed')
    return result['result'][0]['results']

def reserve(key, units, reuse=False):
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    day = now // 86400000 * 86400000
    existing = query('SELECT payload FROM market_cache WHERE key=?', [key])
    if existing:
        if reuse and existing[0]['payload'] == str(units): return
        raise ValueError('Reservation already exists; refusing an uncharged replay')
    rows = query("""INSERT INTO market_cache(key,payload,fetched_at,retry_after)
      SELECT ?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM market_cache WHERE key=?)
      AND (SELECT COALESCE(SUM(CASE WHEN key LIKE 'birdeye-usage:v1:%'
        THEN CAST((CAST(payload AS INTEGER)*7+4)/5 AS INTEGER)
        ELSE CAST(payload AS INTEGER) END),0) FROM market_cache
        WHERE (key LIKE 'birdeye-usage:v1:%' OR key LIKE 'birdeye-usage:v2:%') AND fetched_at>=?) + ? <= ?
      RETURNING key""", [key, str(units), day, key, day - 31 * 86400000, units, BUDGET])
    if len(rows) != 1: raise ValueError('Historical recovery exceeds the existing free-volume budget')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--day', required=True)
    parser.add_argument('--tokens', type=pathlib.Path, required=True)
    parser.add_argument('--failed-pass', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    start = datetime.strptime(args.day, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    if start.date().isoformat() != args.day: raise ValueError('Invalid UTC day')
    end = start + timedelta(days=1)
    if end > datetime.now(timezone.utc): raise ValueError('The UTC day has not ended')
    tokens = json.loads(args.tokens.read_text())
    if not tokens or len(tokens) > 2000 or any(not re.fullmatch(r'[A-Za-z0-9._-]{1,20}', t['symbol']) or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', t['mint']) for t in tokens):
        raise ValueError('Invalid verified token scope')
    if len({t['mint'] for t in tokens}) != len(tokens) or len({t['symbol'] for t in tokens}) != len(tokens): raise ValueError('Duplicate identity')
    registry_hash = hashlib.sha256('\n'.join(sorted(t['mint'] for t in tokens)).encode()).hexdigest()
    private_capture = json.loads(args.failed_pass.read_text())
    def staged(value):
        if isinstance(value, dict):
            if value.get('key') == 'birdeye-volume-round:v1': return json.loads(value['payload'])
            for child in value.values():
                found = staged(child)
                if found: return found
        elif isinstance(value, list):
            for child in value:
                found = staged(child)
                if found: return found
    original = staged(private_capture)
    if not original or original.get('mints') != sorted(t['mint'] for t in tokens) or datetime.fromtimestamp(original['startedAt']/1000, timezone.utc).date().isoformat() != args.day:
        raise ValueError('Scope does not match the captured failed historical pass')
    args.output.mkdir(parents=True, exist_ok=True)
    raw_dir = args.output / 'raw'; raw_dir.mkdir(exist_ok=True)
    manifest_path = args.output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        'version': 1, 'day': args.day, 'registryHash': registry_hash, 'tokens': tokens,
        'startAt': int(start.timestamp()*1000), 'endAt': int(end.timestamp()*1000), 'outcomes': {},
    }
    if manifest['registryHash'] != registry_hash or manifest['day'] != args.day: raise ValueError('Recovery manifest scope mismatch')
    write(manifest_path, manifest)
    base_key = 'birdeye-usage:v2:activity-backfill:' + args.day
    reserve(base_key, len(tokens) * CU, reuse=True)
    secret = next((line.split('=', 1)[1].strip().strip('"\'') for line in (ROOT / '.env.stock-volume-research.local').read_text().splitlines() if line.startswith('BIRDEYE_API_KEY=')), None)
    if not secret: raise ValueError('Existing Birdeye access unavailable')
    headers = {'X-API-KEY': secret, 'x-chain': 'solana'}
    for token in tokens:
        symbol, mint = token['symbol'], token['mint']
        saved = manifest['outcomes'].get(symbol)
        if saved:
            if saved['status'] == 'started': raise ValueError('Interrupted request for ' + symbol + '; a new retry reservation is required')
            continue
        manifest['outcomes'][symbol] = {'status': 'started'}; write(manifest_path, manifest)
        def extra(body):
            if body.get('action') != 'retry' or body.get('retryId') != mint + ':1': raise ValueError('Invalid retry scope')
            reserve(base_key + ':retry:' + mint + ':1', CU)
        params = {'address': mint, 'type': '1H', 'currency': 'usd', 'mode': 'range',
          'time_from': int(start.timestamp()), 'time_to': int(end.timestamp())-1,
          'ui_amount_mode': 'scaled', 'padding': 'false'}
        try:
            raw = birdeye_candles(params, headers, reserve=extra)
            write(raw_dir / (symbol + '.json'), raw)
            try:
                amount = token_volume(raw, mint, start, end)
                stamps = [item.get('unix_time', item.get('unixTime')) for item in raw['data']['items']]
                if any(not int(start.timestamp()) <= stamp < int(end.timestamp()) for stamp in stamps): raise ValueError('History outside the requested UTC day')
                manifest['outcomes'][symbol] = {'status': 'ok', 'usd': str(amount), 'firstAt': min(stamps)*1000, 'lastAt': max(stamps)*1000}
            except TokenDayUnavailable:
                manifest['outcomes'][symbol] = {'status': 'unavailable', 'reason': 'token-history-unavailable'}
        except SourceHTTPError as error:
            if error.status != 404: raise
            manifest['outcomes'][symbol] = {'status': 'unavailable', 'reason': 'token-history-unavailable'}
        write(manifest_path, manifest)
        print(json.dumps({'symbol': symbol, 'status': manifest['outcomes'][symbol]['status'], 'completed': len(manifest['outcomes']), 'known': len(tokens)}), flush=True)
    numeric = [(symbol, v) for symbol, v in manifest['outcomes'].items() if v['status'] == 'ok']
    excluded = sorted(symbol for symbol, v in manifest['outcomes'].items() if v['status'] == 'unavailable')
    if not numeric or len(numeric)+len(excluded) != len(tokens): raise ValueError('Incomplete recovery pass')
    now = int(datetime.now(timezone.utc).timestamp()*1000)
    point = {'day': args.day, 'capturedAt': now, 'collectedAt': now,
      'oldestAt': min(v['firstAt'] for _, v in numeric), 'newestAt': max(v['lastAt'] for _, v in numeric),
      'basis': 'turnover', 'total': float(sum((Decimal(v['usd']) for _, v in numeric), Decimal(0))),
      'partial': bool(excluded), 'covered': len(numeric), 'known': len(tokens),
      'tokens': sorted([{'symbol': s, 'value': float(Decimal(v['usd']))} for s, v in numeric], key=lambda r: (-r['value'], r['symbol'])),
      'backfill': {'source': 'birdeye-ohlcv', 'startAt': int(start.timestamp()*1000), 'endAt': int(end.timestamp()*1000), 'registryHash': registry_hash},
      **({'excludedSymbols': excluded} if excluded else {})}
    write(args.output / 'point.json', point)
    print(json.dumps({'validatedDay': args.day, 'total': point['total'], 'covered': point['covered'], 'known': point['known'], 'excluded': excluded, 'published': False}), flush=True)

if __name__ == '__main__':
    main()
