// Versioned transport only. Domain records retain full observations and nulls.
const fields=['address','dex','quote','price','change24h','liquidity','volume24h','url','source','observedAt','origin','unavailable','delayed','volumeDisputed'];
export function encodePublicMarketWire(market){
 if(market.marketWireVersion!==undefined)throw Error('Market wire is already encoded');
 return {...market,marketWireVersion:1,pools:{...market.pools,data:market.pools.data===null?null:Object.fromEntries(Object.entries(market.pools.data).map(([symbol,pools])=>[symbol,pools.map(pool=>{
  const values=fields.map(field=>pool[field]??null);
  while(values.length>7&&values.at(-1)===null)values.pop();
  return values;
 })]))}};
}
export function decodePublicMarketWire(market){
 if(!market||typeof market!=='object')throw Error('Invalid market response');
 if(market.marketWireVersion===undefined)return market; // Older clients/cache rollout.
 if(market.marketWireVersion!==1||!market.pools||!('data' in market.pools))throw Error('Unsupported market wire');
 const data=market.pools.data;
 if(data!==null&&(typeof data!=='object'||Array.isArray(data)))throw Error('Invalid market pools');
 const pools=data===null?null:Object.fromEntries(Object.entries(data).map(([symbol,rows])=>{
  if(!Array.isArray(rows))throw Error('Invalid market pool rows');
  return [symbol,rows.map(row=>{
   if(!Array.isArray(row)||row.length<7||row.length>fields.length||row.slice(0,3).some(v=>typeof v!=='string')||row.slice(3,7).some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v))))throw Error('Invalid market pool tuple');
   const pool=Object.fromEntries(fields.slice(0,7).map((field,i)=>[field,row[i]]));
   for(let i=7;i<row.length;i++)if(row[i]!==null){
    const value=row[i];
    if((i===9&&(!Number.isSafeInteger(value)||value<=0))||(i>=11&&typeof value!=='boolean')||([7,8,10].includes(i)&&typeof value!=='string'))throw Error('Invalid market pool metadata');
    pool[fields[i]]=value;
   }
   return pool;
  })];
 }));
 const {marketWireVersion:_version,...rest}=market;
 return {...rest,pools:{...market.pools,data:pools}};
}
