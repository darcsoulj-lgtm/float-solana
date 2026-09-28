import Link from '@/components/site-link';
import { ISSUERS } from '@/lib/tokens';
export const metadata = { title: 'Data & methodology | Float' };
const sections = [
  ['value', 'Tracked value'], ['prices', 'Prices & supply'], ['pools', 'Volume & liquidity'],
  ['wallets', 'Holding wallets'], ['updates', 'Updates & missing data'], ['sources', 'Sources'],
] as const;
export default function Page() {
  return <main className="page info-page data-methodology">
    <Link href="/markets">← Markets</Link>
    <h1>Data &amp; methodology</h1>
    <p>What our numbers mean, where they come from, and what they leave out.</p>
    <nav aria-label="Data topics">{sections.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}</nav>
    <section className="panel" id="value"><h2>Tracked value</h2>
      <p>An estimate for the tokens we track on Solana—not the entire market or the value of the stock companies.</p>
      <ul><li>xStocks: reported circulating tokens × reference price. Issuer inventory is excluded.</li><li>Ondo: reported Solana supply and USD value when available; token estimates may use saved prices × verified Solana supply.</li><li>Other issuers: token price × tokens created on Solana. This can include tokens the issuer still holds.</li></ul>
      <p>Supply rules differ, so issuer values are not directly comparable. Missing values are left out, not counted as zero. Current coverage stays available in Markets.</p>
    </section>
    <section className="panel" id="prices"><h2>Prices &amp; supply</h2>
      <p>Backpack prices come from Backpack. Other token prices use CoinMarketCap first, then recent DefiLlama data, then a DEX pool when available.</p>
      <p>A 24-hour change compares the same token using the same source. A displayed price is an observation, not a guaranteed price you can trade at.</p>
      <p>xStocks supply uses reported circulating tokens. Other issuers show tokens created on Solana, which can include issuer-held tokens. We match exact token addresses, not just ticker names.</p>
    </section>
    <section className="panel" id="pools"><h2>Volume &amp; liquidity</h2>
      <p><strong>Volume:</strong> the dollar value traded in the pools we track during each source’s 24-hour window.</p>
      <p><strong>Liquidity:</strong> the value of both tokens held in those pools. It does not tell you exactly how much you can sell without moving the price.</p>
      <p>DEX Screener supplies these figures. We include checked Solana pairs, including Stonkfun pairs where stock tokens are exchanged for newly launched coins. This activity does not necessarily mean investors are buying more stock exposure.</p>
      <p>Coverage is partial. Exchange trades, direct issuer trades and quote-based trades outside tracked pools are excluded. Full private market-maker coverage is not verified.</p>
      <p>Each pool counts once in the market total. A shared pool can appear under two token rows or issuers—do not add those rows together. Updates happen at different times, so the total is not a synchronized live figure.</p>
      <h3>Ondo creation &amp; redemption trades</h3><p>Shown separately from pool volume, using DefiLlama’s issuer-trade data, including Jupiter routes. Data is at least 10 hours behind and is not added to pool totals. It does not cover all trading between holders or private market makers.</p>
    </section>
    <section className="panel" id="wallets"><h2>Holding wallets</h2>
      <p>Each wallet with a positive tracked-token balance counts once per issuer, even if it holds several of that issuer’s tokens. The same wallet can count under multiple issuers.</p>
      <p>Wallets are not people. One person may use several wallets; exchanges, pools and issuers also hold tokens. Counts come from Solana token accounts and have not been verified against an independent provider.</p>
      <p>Checks run daily. Issuers are observed at different times. Failed checks keep the last successful count and its original date.</p>
      <p>Trends appear after seven observed days. Missing days stay as gaps. A change in tracked tokens starts a new trend. A 30-day percentage needs a real count from 30 days earlier.</p>
    </section>
    <section className="panel" id="updates"><h2>Updates &amp; missing data</h2>
      <p>A dash means missing data, not zero. Saved prices and pool figures may remain visible for up to 24 hours while updates run. Wallet counts follow the daily rules above.</p>
      <p>Open a token’s “Sources &amp; timestamps” for its observation times. Saved volume covers the 24 hours before that observation, not necessarily the latest 24 hours.</p>
      <p>Other chains and unclear token identities are excluded. Different issuers’ versions of one stock are separate products. We do not send your exact wallet balance to market-data sources.</p>
      <p>Holding a token does not prove shareholder rights or backing. Voting, dividends, redemption and eligibility depend on the issuer. <Link href="/methodology">Membership rules →</Link></p>
    </section>
    <section className="panel" id="sources"><h2>Sources</h2>
      <ul><li><a href="https://docs.backpack.exchange/">Backpack</a> — Backpack prices and price changes.</li><li><a href="https://coinmarketcap.com/">CoinMarketCap</a> — token prices.</li><li><a href="https://defillama.com/">DefiLlama</a> — price fallback and issuer data; <a href="https://api.llama.fi/protocol/ondo-global-markets">Ondo valuation feed</a>.</li><li><a href="https://dexscreener.com/">DEX Screener</a> — tracked pool prices, volume and liquidity.</li><li><a href="https://solana.com/docs/rpc">Solana RPC</a> — token supply and holding-wallet observations.</li><li><a href="https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/ondo-global-markets/index.ts">Ondo trade calculation</a> — separate creation and redemption volume.</li></ul>
      <h3>Issuer references</h3><ul>{ISSUERS.map(i => <li key={i.id}><a href={i.url}>{i.name}</a> — issuer information and product terms.</li>)}</ul>
      <p>Token-specific source records remain on each token’s page.</p>
    </section>
  </main>;
}
