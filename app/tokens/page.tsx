import { TOKENS, TOKEN_REVIEW_DATE } from '@/lib/tokens';
import { TokenDirectory } from '@/components/token-directory';
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">SUPPORTED TOKENS</p>
      <h1>One holding. Every room.</h1>
      <p>
        {TOKENS.length.toLocaleString()} Solana stock tokens. Registry review:{' '}
        {TOKEN_REVIEW_DATE}.
      </p>
      <details className="market-methodology">
        <summary>Coverage & verification</summary>
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
      <TokenDirectory />
    </div>
  );
}
