import { TOKENS, TOKEN_REVIEW_DATE } from '@/lib/tokens';
import { verifiedRegistry } from '@/lib/registry-server';
import { TokenDirectory } from '@/components/token-directory';
import { communityTokens } from '@/lib/community-eligibility';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let tokens = communityTokens(TOKENS);
  let unavailable = false;
  try { tokens = communityTokens((await verifiedRegistry()).tokens); } catch { unavailable = true; }
  return (
    <div className="page">
      <p className="eyebrow">SUPPORTED TOKENS</p>
      <h1>One holding. Every channel.</h1>
      <p>
        {tokens.length.toLocaleString()} eligible Backpack tokens.
      </p>
      <details className="market-methodology">
        <summary>Membership eligibility</summary>
        <p>Base list reviewed {TOKEN_REVIEW_DATE}. Verified Backpack additions use the same refreshed registry as Markets and membership checks.{unavailable ? ' Registry refresh is unavailable; the base list is shown.' : ''}</p>
        <p>
          Only Backpack-issued tokens qualify. We match Backpack’s official
          Solana asset list with verified onchain mint addresses. Other issuers’
          tokens do not grant community access.
        </p>
        <p>
          This is a reviewed coverage list, not a claim to include every stock
          token on Solana. New listings appear after automatic issuer and onchain verification. Tokens on other chains
          and ordinary brokerage balances do not qualify. Rights differ across
          products; some provide indirect private-company exposure.
        </p>
      </details>
      <TokenDirectory tokens={tokens} />
    </div>
  );
}
