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
  const references=Object.values(market.backpack?.data??{});
  const validHistorical=row=>row.externalBasis==='hourly-history'&&Number.isFinite(row.externalPrice)&&row.externalPrice>0&&Number.isSafeInteger(row.externalObservedAt)&&row.externalObservedAt<=now&&now-row.externalObservedAt<=96*3600000;
  if(market.backpack?.data&&!references.some(row=>Number.isFinite(row.externalPrice)&&row.externalPrice>0))issues.push('No usable Backpack reference prices');
  for(const name of ['backpack','catalog']){
    const time=market[name]?.fetchedAt;
    if((!Number.isSafeInteger(time)||time>now+60000||now-time>15*60000)&&!(name==='backpack'&&references.length&&references.every(validHistorical)))issues.push(name+' collection is not fresh');
  }
  // Verify percentage semantics independently of the provider adapter. A fresh
  // timestamp and a successful pool import cannot hide a 100x unit regression.
  for(const [symbol, row] of Object.entries(market.backpack?.data??{})){
    if(row.externalBasis==='hourly-history'&&!validHistorical(row))issues.push(symbol+': invalid dated reference');
    if(row.externalChangeUnit!=='percent')issues.push(symbol+': unnormalized Backpack price change');
    const change=row.externalChange24h,first=row.externalFirstPrice,last=row.externalPrice;
    if(change!=null&&!Number.isFinite(change))issues.push(symbol+': invalid price change');
    if(change!=null&&Number.isFinite(first)&&first>0&&Number.isFinite(last)&&last>0&&
      Math.abs(change-(last/first-1)*100)>0.00011)issues.push(symbol+': price change disagrees with first/last prices');
  }
  // The public payload omits per-pool times only when they equal the enclosing
  // symbol's asOf (or legacy batch time). Reconstruct that same observation,
  // never the request time, before freshness and immutable-value comparisons.
  const publicPools=Object.fromEntries(Object.entries(market.pools.data).map(([symbol,pools])=>[
    symbol,Array.isArray(pools)?pools.map(p=>({...p,observedAt:p.observedAt===undefined?(market.pools.asOf?.[symbol]??market.pools.fetchedAt):p.observedAt})):pools,
  ]));
  const observations=Object.values(publicPools).filter(Array.isArray).flat().filter(p=>Number.isSafeInteger(p.observedAt)&&p.observedAt<=now+60000&&!p.unavailable);
  if(!observations.some(p=>now-p.observedAt<=15*60000))issues.push('No recent public pool observations');
  for(const token of expected.tokens){
    // A verified new listing can legitimately have no pool observation yet.
    // Only collected observations are required to reach the public response.
    const actual=publicPools[token.symbol]??(token.pools.length===0?[]:undefined);
    if(!Array.isArray(actual)){issues.push(token.symbol+': absent from public market');continue;}
    const byAddress=new Map(actual.map(p=>[p.address,p]));
    if(byAddress.size!==actual.length)issues.push(token.symbol+': duplicate public pools');
    for(const p of actual){
      if(p.observedAt>now+60000)issues.push(token.symbol+': future pool observation');
      if(p.volume24h!=null&&(!Number.isFinite(p.volume24h)||p.volume24h<0))issues.push(token.symbol+': invalid pool volume');
      // Independent publication guard: old/unqualified venue statistics must
      // not silently re-enter via a cached snapshot or a retention regression.
      if(p.source==='raydium'&&p.volume24h!=null)issues.push(token.symbol+': unqualified Raydium volume published');
    }
    for(const p of token.pools){
      if(p.unavailable||p.volumeDisputed||p.volume24h==null||!p.observedAt||now-p.observedAt>24*3600000)continue;
      const served=byAddress.get(p.address);
      if(!served){issues.push(token.symbol+': collected pool missing '+p.address);continue;}
      // A newer collection may have landed during verification. Its observed
      // zero or disagreement is meaningful; never insist on a larger total.
      if(served.observedAt>p.observedAt)continue;
      if(served.observedAt!==p.observedAt||served.volume24h!==p.volume24h||(p.source&&served.source!==p.source)||served.unavailable||served.volumeDisputed)
        issues.push(token.symbol+': observation not published '+p.address);
    }
  }
  return [...new Set(issues)];
}
