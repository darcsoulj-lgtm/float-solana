// Independent of the collector/resolver: compare immutable observations with
// what ordinary visitors receive. No provider requests or wallet operations.
export function publicationIssues(expected, text, headers, now=Date.now()) {
  const issues=[];
  if(Buffer.byteLength(text)>400000)issues.push('Public market payload exceeds 400KB');
  if(!/(?:^|,)\s*no-store(?:\s|,|$)/i.test(headers.get('cache-control')??''))issues.push('Public market Cache-Control lacks no-store');
  if(headers.has('set-cookie'))issues.push('Public market sets a cookie');
  if(/"(?:wallet(?:Address|Hash)|session[^"\\]*|private[^"\\]*)"\s*:/i.test(text))issues.push('Private field in public market');
  let market;try{market=JSON.parse(text);}catch{return [...issues,'Public market JSON is invalid'];}
  if(!market?.pools?.data)return [...issues,'Public pool observations unavailable'];
  for(const name of ['backpack','markets']){
    const time=market[name]?.fetchedAt;
    if(!Number.isSafeInteger(time)||time>now+60000||now-time>15*60000)issues.push(name+' collection is not fresh');
  }
  const observations=Object.values(market.pools.data).flat().filter(p=>Number.isSafeInteger(p.observedAt)&&p.observedAt<=now+60000&&!p.unavailable);
  if(!observations.some(p=>now-p.observedAt<=15*60000))issues.push('No recent public pool observations');
  for(const token of expected.tokens){
    const actual=market.pools.data[token.symbol];
    if(!Array.isArray(actual)){issues.push(token.symbol+': absent from public market');continue;}
    const byAddress=new Map(actual.map(p=>[p.address,p]));
    if(byAddress.size!==actual.length)issues.push(token.symbol+': duplicate public pools');
    for(const p of actual){
      if(p.observedAt>now+60000)issues.push(token.symbol+': future pool observation');
      if(p.volume24h!=null&&(!Number.isFinite(p.volume24h)||p.volume24h<0))issues.push(token.symbol+': invalid pool volume');
    }
    for(const p of token.pools){
      if(p.unavailable||p.volumeDisputed||p.volume24h==null||!p.observedAt||now-p.observedAt>24*3600000)continue;
      const served=byAddress.get(p.address);
      if(!served){issues.push(token.symbol+': collected pool missing '+p.address);continue;}
      // A newer collection may have landed during verification. Its observed
      // zero or disagreement is meaningful; never insist on a larger total.
      if(served.observedAt>p.observedAt)continue;
      if(served.observedAt!==p.observedAt||served.volume24h!==p.volume24h||served.unavailable||served.volumeDisputed)
        issues.push(token.symbol+': observation not published '+p.address);
    }
  }
  return [...new Set(issues)];
}
