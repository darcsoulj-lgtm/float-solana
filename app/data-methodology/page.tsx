import Link from '@/components/site-link';
import { ISSUERS } from '@/lib/tokens';
import { MARKET_ISSUER_SCOPE } from '@/lib/market-scope';
export const metadata = { title: 'Data & methodology | Float' };
const sections = [
  ['value', 'Tracked value'], ['prices', 'Prices & supply'], ['pools', 'DEX volume'],
  ['wallets', 'Holding wallets'], ['attachments', 'Shared charts & portfolios'], ['trading', 'Trading'], ['updates', 'Updates & missing data'], ['sources', 'Sources'],
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
      <p>Missing values are left out, not counted as zero. Current coverage and observation times are available in the Markets metric help buttons.</p>
    </section>
    <section className="panel" id="prices"><h2>Prices &amp; supply</h2>
      <p>We prefer Backpack’s external stock reference when available. It reflects external stock-market data, not the token’s DEX execution price. Fallbacks use DefiLlama or a tracked DEX pool. Each value keeps its source and observation time.</p>
      <p>The 24-hour change follows the selected source. Backpack’s fractional return is converted to a percentage and checked against its starting and ending prices when available. It uses a rolling 24-hour window, which can differ from the stock exchange’s daily change. Open a token’s page for its source and timestamp. Prices are observations, not guaranteed buy or sell quotes.</p>
      <p><strong>Tracked tokens:</strong> the number of tokens in the verified Backpack listings we track. The count follows supported new listings automatically; it does not mean every token has price or volume data.</p>
      <p>Supply counts minted units on Solana, including issuer-held tokens. We verify token addresses and decimals. Wallet balances also use verified display-unit adjustments; minted supply and displayed wallet balances can differ.</p>
    </section>
    <section className="panel" id="pools"><h2>DEX volume</h2>
      <p><strong>Volume:</strong> the dollar value traded in the pools we track during each source’s 24-hour window.</p>
      <p>Volume selection is separate from pool discovery. We compare pool-level USD observations on the configured 24-hour basis, using current observations before saved ones. DEX Screener and GeckoTerminal provide rolling-volume data; compatible direct venue observations can also be selected. Raydium remains a discovery and identity source, but its day.volume statistic is excluded from volume selection and conflict checks until its differing calculation is reconciled. A direct API is not automatically more accurate.</p>
      <p>Our observed inventory also includes Manifest, ZeroFi and HumidiFi through indexers. New venues discovered by those sources remain eligible after the same token-identity checks. We include checked Solana pairs, including Stonkfun pairs where stock tokens are exchanged for newly launched coins. This activity does not necessarily mean investors are buying more stock exposure.</p>
      <p>Coverage is partial. Exchange trades, direct issuer trades and quote-based trades outside tracked pools are excluded. Full private market-maker coverage is not verified.</p>
      <p>Markets display an observed-volume sum of qualified pool observations. Unresolved pools are excluded, and incomplete coverage is identified beside the market summary and in token details. This observed sum is not a complete DEX total. A market-wide sum counts shared pools once, rather than adding token-row totals. If an update fails, a valid earlier pool observation may remain visible for up to 24 hours with its original timestamp. We check backup sources and retry automatically. Each pool is counted once, even when several sources report it. Open a token’s Sources & timestamps for its coverage status; a displayed volume does not guarantee complete coverage.</p>
      <p>We do not apply our own wash-trading filter. Trades made to inflate activity may be included. Sources may use different filters, so totals can differ from other platforms.</p>
      <p>If sources disagree by more than 25% and $1,000, or one reports zero while another reports at least $1, we withhold that pool’s volume. A previously active pool reporting zero through an indexer requires a current compatible venue confirmation or agreement from two current indexers. A dash means no reliable amount is available. If only zero-volume observations are known while other pools are unresolved, the display stays a dash rather than suggesting zero total activity. Collection times and source windows can differ; backups do not guarantee complete coverage.</p>
      <p>Each pool counts once in the market total. A shared pool can appear under two token rows—do not add those rows together. Updates happen at different times, so the total is not a synchronized live figure.</p>
    </section>
    <section className="panel" id="wallets"><h2>Holding wallets</h2>
      <p>Each wallet with a positive balance of a tracked Backpack token counts once, even if it holds several Backpack tokens.</p>
      <p>Wallets are not people. One person may use several wallets; exchanges, pools and issuers also hold tokens. Counts come from Solana token accounts and have not been verified against an independent provider.</p>
      <p>Checks run daily. Failed checks keep the last successful count and its original date.</p>
      <p>Trends appear after seven observed days. Missing days stay as gaps. A change in tracked tokens starts a new trend. A 30-day percentage needs a real count from 30 days earlier.</p>
    </section>
    <section className="panel" id="attachments"><h2>Shared charts &amp; portfolios</h2>
      <p>Charts save Backpack’s external stock-market hourly closes with a post. They are stock references, not token trade prices. Empty hours stay as gaps. Charts do not update after posting. These prices have not been independently cross-checked. The saved time is when Float retrieved the chart, not when the stock last traded.</p>
      <p>Portfolio snapshots show estimated value percentages for Backpack tokens in one verified wallet. Other assets and wallets are excluded. No wallet address, quantity or total value is published.</p>
      <p>We check holdings when preparing a snapshot and require recent prices and matching units for every included token. Snapshots use Backpack’s external stock prices and freshly checked, adjusted wallet balances. Missing prices, stale data or mismatched units block sharing. Percentages are rounded to one decimal place and saved with the post; they are not investment returns.</p>
      <p>Charts prepare when you choose a stock; snapshots prepare when you add one. Portfolio sharing requires your approval before posting. Prepared attachments expire after ten minutes and refresh while the composer remains open. Published snapshots keep their original timestamps. The saved date on a portfolio is its holdings check time; its prices may have been observed earlier.</p>
    </section>
    <section className="panel" id="trading"><h2>Trading</h2>
      <p>New trades are currently paused while we resolve the production RPC issue. Existing order records remain available for recovery.</p>
      <p>Trading balance shows funds in the connected wallet’s standard token accounts for this pair. Tokens held in other accounts or locked accounts are excluded. Refresh after moving funds; the order checks your balance again.</p>
      <p>Where enabled, trades use Jupiter routes between USDC and verified Backpack tokens. The trading quote is separate from the stock reference chart. You review the minimum received and costs before approving in your wallet.</p>
      <p>Float adds no platform fee. Route fees, Solana network fees and token-account costs can still apply. Some tokens or amounts have no supported route.</p>
      <p>Signing in proves you control a wallet; it does not approve a trade. Float never asks for your seed phrase. Your wallet address and trade request are sent to Jupiter and Solana RPC to prepare and check the transaction.</p>
      <p>Private order records let you check a trade after a connection drops. Float stores your wallet address, order details and transaction signature; these are not added to your public profile. Sign-in lasts 24 hours. Resolved records are eligible for removal after 30 days; unresolved orders are kept for recovery. Blockchain transactions are public and cannot be deleted.</p>
    </section>
    <section className="panel" id="updates"><h2>Updates &amp; missing data</h2>
      <p>A dash means missing data, not zero. Collections are scheduled about every five minutes. Known-pool updates and new-pool discovery are separate. Discovery uses bounded rotating scans. An independent record of observed pool addresses detects omissions and prioritizes recovery; part of each scan remains reserved for tokens not recently checked. Publication checks verify that collected observations reach the site. Provider limits, indexing delays and scheduler delays can postpone updates. Saved prices and pool figures may remain visible for up to 24 hours while updates run. Wallet counts follow the daily rules above.</p>
      <p>Open a token’s “Sources &amp; timestamps” for its observation times. Saved volume covers the 24 hours before that observation, not necessarily the latest 24 hours.</p>
      <p>New Backpack listings are discovered automatically from its official asset list and checked on Solana before appearing in Markets and Add chart. Discovery or pricing delays can leave new listings temporarily unavailable. Other chains and unclear token identities are excluded. Markets covers Backpack only. Anyone can read community conversations. Only verified Backpack holders can post, reply or vote. We do not send your exact wallet balance to market-data sources.</p>
      <p>Holding a token does not prove shareholder rights or backing. Voting, dividends, redemption and eligibility depend on the issuer. <Link href="/methodology">Membership rules →</Link></p>
    </section>
    <section className="panel" id="sources"><h2>Sources</h2>
      <ul><li><a href="https://docs.backpack.exchange/">Backpack</a> — verified listings, stock reference prices and charts.</li><li><a href="https://defillama.com/">DefiLlama</a> — fallback token prices.</li><li><a href="https://dexscreener.com/">DEX Screener</a> and <a href="https://www.geckoterminal.com/">GeckoTerminal</a> — pool discovery, prices, volume and cross-checks.</li><li><a href="https://docs.orca.so/api-reference/overview">Orca</a>, <a href="https://api-v3.raydium.io/docs/">Raydium</a>, <a href="https://docs.meteora.ag/developer-guides/dlmm/api-reference/overview">Meteora DLMM</a>, <a href="https://docs.meteora.ag/developer-guides/damm-v2/api-reference/overview">Meteora DAMM</a>, <a href="https://github.com/byreal-git/byreal-api-docs">Byreal</a> and <a href="https://sol-explorer.pancakeswap.com/">PancakeSwap Solana</a> — direct venue pool data.</li><li><a href="https://solana.com/docs/rpc">Solana RPC</a> — token supply and holding-wallet observations.</li></ul>
      <h3>Issuer references</h3><ul>{ISSUERS.filter(i => i.id === MARKET_ISSUER_SCOPE).map(i => <li key={i.id}><a href={i.url}>{i.name}</a> — issuer information and product terms.</li>)}</ul>
      <p>Token-specific source records remain on each token’s page.</p>
    </section>
  </main>;
}
