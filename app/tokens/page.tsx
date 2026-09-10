import { TOKENS, TOKEN_REVIEW_DATE } from '@/lib/tokens';
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">SUPPORTED STOCKS & ETFS</p>
      <h1>One holding opens every topic.</h1>
      <p>
        {TOKENS.length} supported Solana tokens. Reviewed {TOKEN_REVIEW_DATE}{' '}
        against Backpack’s official asset registry and finalized onchain mint
        accounts.
      </p>
      <p>
        We include securities whose Solana deposits or withdrawals are enabled
        in{' '}
        <a
          href="https://api.backpack.exchange/api/v1/assets"
          target="_blank"
          rel="noreferrer"
        >
          Backpack’s public asset registry
        </a>
        . Ordinary brokerage positions, perpetuals, and disabled catalogue
        entries are not eligible. Availability can change after this review.
      </p>
      <div className="token-directory">
        {[...TOKENS]
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
          .map((t) => (
            <article className="token-directory-row" key={t.symbol}>
              <div>
                <h2>{t.symbol}</h2>
                <p>{t.name}</p>
              </div>
              <a
                href={'https://explorer.solana.com/address/' + t.mint}
                target="_blank"
                rel="noreferrer"
                aria-label={'View ' + t.symbol + ' mint on Solana Explorer'}
              >
                <code>{t.mint}</code>
              </a>
            </article>
          ))}
      </div>
    </div>
  );
}
