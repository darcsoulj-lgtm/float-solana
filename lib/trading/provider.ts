import {
  backpackRegistry,
  registryTokens,
  verifiedBackpackMints,
} from '../backpack-registry';
import { DEFAULT_SOLANA_RPC } from '../solana-network';
import { readBoundedText } from '../request-body';
import { AppError } from '../validation';
export function tradeProvider(
  database: D1Database,
  rpcUrl = DEFAULT_SOLANA_RPC,
  fetcher = fetch,
  now = Date.now,
) {
  const db = database.withSession('first-primary');
  async function readRpc(method: string, params: unknown[]) {
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (compatible; FloatTrading/1.0; +https://joinfloat.xyz)',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(18000),
      redirect: 'manual',
      cache: 'no-store',
    };
    const response = await fetcher(rpcUrl, options);
    if (!response.ok) {
      if (process.env.NODE_ENV === 'development')
        console.error('Trade RPC HTTP', response.status);
      throw new AppError('Network check unavailable. Try again shortly.', 503);
    }
    const data = JSON.parse(await readBoundedText(response, 2 * 1024 * 1024));
    if (data.error) throw Error('The network could not verify this order.');
    return data.result;
  }
  let heightCache: { height: number; checkedAt: number } | undefined;
  async function rpc(method: string, params: unknown[]) {
    if (method !== 'getBlockHeight') return readRpc(method, params);
    if (params.length > 1 || (params[0] != null && (typeof params[0] !== 'object' || Object.keys(params[0]).some(key => key !== 'commitment') || (params[0] as { commitment?: string }).commitment !== 'confirmed')))
      throw new AppError('Only confirmed block validity is supported.', 400);
    if (heightCache && now() - heightCache.checkedAt < 2000) return heightCache.height;
    // PublicNode's getBlockHeight returned the slot number in live checks.
    // Read the exact confirmed block header instead; never equate slots and heights.
    const latest = await readRpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    if (!Number.isSafeInteger(latest?.context?.slot) || latest.context.slot <= 0 || typeof latest?.value?.blockhash !== 'string')
      throw new AppError('Network validity check unavailable. Try again shortly.', 503);
    const block = await readRpc('getBlock', [latest.context.slot, { commitment: 'confirmed', transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0 }]);
    if (block?.blockhash !== latest.value.blockhash || !Number.isSafeInteger(block?.blockHeight) || block.blockHeight <= 0 || block.blockHeight > latest.context.slot ||
      !Number.isSafeInteger(block?.blockTime) || now() - block.blockTime * 1000 > 60000 || block.blockTime * 1000 - now() > 10000)
      throw new AppError('Network validity check unavailable. Try again shortly.', 503);
    heightCache = { height: block.blockHeight, checkedAt: now() };
    return block.blockHeight;
  }
  return {
    rpc,
    async resolveToken(symbol: string) {
      if (typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol))
        throw Error('Choose a supported stock.');
      const registry = await backpackRegistry(
        database,
        () => {},
        rpcUrl,
        fetcher,
        now(),
        true,
      );
      const token = registryTokens(registry).find(
        (t) => t.issuer === 'backpack' && t.symbol === symbol && t.mint,
      );
      if (!token) throw Error('This stock is unavailable for trading.');
      // Use the canonical mint; user-supplied decimals and addresses are never accepted.
      const result = await rpc('getAccountInfo', [
        token.mint,
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]);
      const info = result?.value?.data?.parsed?.info;
      if (
        result?.value?.data?.parsed?.type !== 'mint' ||
        info?.isInitialized !== true ||
        !Number.isInteger(info.decimals) ||
        info.decimals < 0 ||
        info.decimals > 18
      )
        throw Error('Token details could not be verified.');
      if (
        verifiedBackpackMints(
          [{ symbol: token.symbol, mint: token.mint, decimals: info.decimals }],
          { result: { context: result.context, value: [result.value] } },
        ).length !== 1
      )
        throw new AppError(
          'This token could not be verified for trading.',
          503,
        );
      return {
        symbol: token.symbol,
        mint: token.mint,
        decimals: info.decimals,
        program: result.value.owner,
      };
    },
    async providerSlot() {
      // A shared budget protects the free provider across Worker instances.
      const time = now();
      const row = await db
        .prepare(
          'INSERT INTO trade_provider_slot (id,next_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE trade_provider_slot.next_at<=? RETURNING id',
        )
        .bind(time + 2600, time)
        .first();
      if (!row)
        throw new AppError(
          'Please wait a moment before requesting another quote.',
          429,
        );
    },
  };
}
