import { TOKENS, TOKEN_REVIEW_DATE } from '@/lib/tokens';
import { verifiedRegistry } from '@/lib/registry-server';
import { TokenDirectory } from '@/components/token-directory';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let tokens = TOKENS;
  let unavailable = false;
  try { tokens = (await verifiedRegistry()).tokens; } catch { unavailable = true; }
  return (
    <div className="page">
      <p className="eyebrow">SUPPORTED TOKENS</p>
      <h1>One holding. Every channel.</h1>
      <p>
        {tokens.length.toLocaleString()} eligible Solana tokens.
      </p>
      <details className="market-methodology">
        <summary>Membership eligibility</summary>
        <p>Base list reviewed {TOKEN_REVIEW_DATE}. Verified Backpack additions use the same refreshed registry as Markets and membership checks.{unavailable ? ' Registry refresh is unavailable; the base list is shown.' : ''}</p>
        <p>
          xStocks uses its official assets API. Backpack uses its official
          Solana asset registry. Ondo, PreStocks and Tessera use Solana
          Foundation’s curated mint records, cross-checked against finalized
          onchain mint accounts. Membership checks those exact mints.
        </p>
        <p>
          This is a reviewed coverage list, not a claim to include every stock
          token on Solana. New listings require review. Tokens on other chains
          and ordinary brokerage balances do not qualify. Rights differ across
          products; some provide indirect private-company exposure.
        </p>
      </details>
      <TokenDirectory tokens={tokens} />
    </div>
  );
}
