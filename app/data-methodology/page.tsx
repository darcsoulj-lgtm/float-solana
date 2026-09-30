import Link from '@/components/site-link';
import { ISSUERS } from '@/lib/tokens';
import { MARKET_ISSUER_SCOPE } from '@/lib/market-scope';
export const metadata = { title: 'Data & methodology | Float' };
const sections = [
  ['value', 'Tracked value'], ['prices', 'Prices & supply'], ['pools', 'Volume & liquidity'],
  ['wallets', 'Holding wallets'], ['updates', 'Updates & missing data'], ['sources', 'Sources'],
] as const;
export default function Page() {
  return <main className="page info-page data-methodology">
    <Link href="/markets">← Markets</Link>
    <h1>Data &amp; methodology</h1>
    <p>Markets covers Backpack tokenized stocks. Here is what each number means and what it leaves out.</p>
    <nav aria-label="Data topics">{sections.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}</nav>
    <section className="panel" id="value"><h2>Tracked value</h2>
      <p>An estimate of the Backpack tokens we track, not the value of the underlying companies.</p>
      <p>Token price × tokens created on Solana, including tokens the issuer still holds. This is minted token value, not circulating market cap.</p>
      <p>Missing values are left out, not counted as zero. Current coverage stays available in Markets.</p>
    </section>
    <section className="panel" id="prices"><h2>Prices &amp; supply</h2>
      <p>We prefer Backpack’s external stock reference when available. It reflects external stock-market data, not the token’s DEX execution price. Fallbacks use CoinMarketCap, DefiLlama or a tracked DEX pool; source freshness affects selection.</p>
      <p>The 24-hour change follows the selected source. Open a token’s page for its source and timestamp. Prices are observations, not guaranteed buy or sell quotes.</p>
      <p>Supply shows tokens created on Solana, including issuer-held tokens. We match exact token addresses and account for display-unit adjustments where verified.</p>
    </section>
    <section className="panel" id="pools"><h2>Volume &amp; liquidity</h2>
      <p><strong>Volume:</strong> the dollar value traded in the pools we track during each source’s 24-hour window.</p>
      <p><strong>Liquidity:</strong> the value of both tokens held in those pools. It does not tell you exactly how much you can sell without moving the price.</p>
      <p>DEX Screener supplies these figures. We include checked Solana pairs, including Stonkfun pairs where stock tokens are exchanged for newly launched coins. This activity does not necessarily mean investors are buying more stock exposure.</p>
      <p>Coverage is partial. Exchange trades, direct issuer trades and quote-based trades outside tracked pools are excluded. Full private market-maker coverage is not verified.</p>
      <p>Each pool counts once in the market total. A shared pool can appear under two token rows—do not add those rows together. Updates happen at different times, so the total is not a synchronized live figure.</p>
    </section>
    <section className="panel" id="wallets"><h2>Holding wallets</h2>
      <p>Each wallet with a positive balance of a tracked Backpack token counts once, even if it holds several Backpack tokens.</p>
      <p>Wallets are not people. One person may use several wallets; exchanges, pools and issuers also hold tokens. Counts come from Solana token accounts and have not been verified against an independent provider.</p>
      <p>Checks run daily. Failed checks keep the last successful count and its original date.</p>
      <p>Trends appear after seven observed days. Missing days stay as gaps. A change in tracked tokens starts a new trend. A 30-day percentage needs a real count from 30 days earlier.</p>
    </section>
    <section className="panel" id="updates"><h2>Updates &amp; missing data</h2>
      <p>A dash means missing data, not zero. Saved prices and pool figures may remain visible for up to 24 hours while updates run. Wallet counts follow the daily rules above.</p>
      <p>Open a token’s “Sources &amp; timestamps” for its observation times. Saved volume covers the 24 hours before that observation, not necessarily the latest 24 hours.</p>
      <p>Other chains and unclear token identities are excluded. Markets covers Backpack only. Discussions remain open to ideas, questions and conversations; existing membership eligibility is unchanged. We do not send your exact wallet balance to market-data sources.</p>
      <p>Holding a token does not prove shareholder rights or backing. Voting, dividends, redemption and eligibility depend on the issuer. <Link href="/methodology">Membership rules →</Link></p>
    </section>
    <section className="panel" id="sources"><h2>Sources</h2>
      <ul><li><a href="https://docs.backpack.exchange/">Backpack</a> — Backpack prices and price changes.</li><li><a href="https://coinmarketcap.com/">CoinMarketCap</a> — token prices.</li><li><a href="https://defillama.com/">DefiLlama</a> — fallback token prices.</li><li><a href="https://dexscreener.com/">DEX Screener</a> — tracked pool prices, volume and liquidity.</li><li><a href="https://solana.com/docs/rpc">Solana RPC</a> — token supply and holding-wallet observations.</li></ul>
      <h3>Issuer references</h3><ul>{ISSUERS.filter(i => i.id === MARKET_ISSUER_SCOPE).map(i => <li key={i.id}><a href={i.url}>{i.name}</a> — issuer information and product terms.</li>)}</ul>
      <p>Token-specific source records remain on each token’s page.</p>
    </section>
  </main>;
}
