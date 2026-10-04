import type { Pool } from './market-data';
import type { PoolProvider } from './pool-provider-adapters';

// Each durable work item performs one bounded provider request. URLs contain
// only verified mints/addresses supplied by the server-side inventory.
export function poolWorkRequest(provider: PoolProvider, mint: string, known: readonly Pool[], discovery: boolean, cursor = 0) {
  const matching = known.filter(p => provider === 'orca' ? p.dex === 'orca' : provider === 'raydium' ? p.dex === 'raydium' : provider === 'byreal' ? p.dex === 'byreal' : provider === 'pancakeswap' ? p.dex === 'pancakeswap-v3-solana' : provider.startsWith('meteora') ? p.dex === 'meteora' : true);
  const addresses = [...new Set(matching.map(p => p.address))].sort();
  const size = provider === 'dexscreener' || provider === 'geckoterminal' ? 30 : 20;
  const pages = Math.max(1, Math.ceil(addresses.length / size));
  const batch = addresses.slice((cursor % pages) * size, (cursor % pages + 1) * size);
  const page = 1 + cursor % 5;
  if (provider === 'dexscreener') return { url: discovery || !batch.length
    ? `https://api.dexscreener.com/token-pairs/v1/solana/${mint}`
    : 'https://api.dexscreener.com/latest/dex/pairs/solana/' + batch.join(','), next: discovery ? 0 : (cursor + 1) % pages };
  if (provider === 'geckoterminal') return { url: discovery || !batch.length
    ? `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=${page}`
    : 'https://api.geckoterminal.com/api/v2/networks/solana/pools/multi/' + batch.join(','), next: (cursor + 1) % (discovery ? 5 : pages) };
  if (provider === 'orca') return { url: discovery
    ? `https://api.orca.so/v2/solana/pools?token=${mint}&stats=24h&size=20`
    : `https://api.orca.so/v2/solana/pools?addresses=${batch.join(',')}&stats=24h&size=20`, next: discovery ? 0 : (cursor + 1) % pages };
  if (provider === 'raydium') return { url: discovery
    ? `https://api-v3.raydium.io/pools/info/mint?mint1=${mint}&poolType=all&poolSortField=volume24h&sortType=desc&pageSize=20&page=${page}`
    : 'https://api-v3.raydium.io/pools/info/ids?ids=' + batch.join(','), next: (cursor + 1) % (discovery ? 5 : pages) };
  if (provider === 'pancakeswap') return batch.length ? {url: 'https://sol-explorer.pancakeswap.com/api/cached/v1/pools/info/ids?ids=' + batch.join(','), next: (cursor + 1) % pages} : null;
  if (provider === 'byreal') return discovery
    ? {url:'https://api2.byreal.io/byreal/api/dex/v2/pools/info/list?sortField=volumeUsd24h&sortType=desc&page=1&pageSize=20', next:0}
    : addresses.length ? {url:'https://api2.byreal.io/byreal/api/dex/v2/pools/details?poolAddress=' + addresses[cursor % addresses.length], next:(cursor + 1) % addresses.length} : null;
  if (provider === 'meteora') return {url:`https://dlmm.datapi.meteora.ag/pools?query=${mint}&page_size=20&page=${page}`, next:(cursor + 1) % 5};
  if (provider === 'meteora-damm-v1') return {url:`https://damm-api.meteora.ag/pools/search?include_token_mints=${mint}&page=${page - 1}&size=20`, next:(cursor + 1) % 5};
  return {url:`https://damm-v2.datapi.meteora.ag/pools?query=${mint}&page_size=20&page=${page}`, next:(cursor + 1) % 5};
}
