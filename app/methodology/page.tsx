import Link from '@/components/site-link';
import { TOKENS } from '@/lib/tokens';
export default function Page() {
  return (
    <div className="page info-page">
      <h1>Membership</h1>
      <section className="panel">
        <h2>Eligibility</h2>
        <p>
          Anyone can read discussions. To post, reply or vote, hold any of the
          {TOKENS.length} supported stock or ETF tokens in a Solana wallet you
          control and verify your wallet. One holding qualifies for every channel.
          Exchange balances and perpetual positions do not qualify.{' '}
          <Link href="/tokens">Supported tokens</Link>.
        </p>
      </section>
      <section className="panel">
        <h2>Verification</h2>
        <p>
          We check token accounts against verified mint addresses on Solana. You
          sign a one-use membership message to prove wallet control. This
          authorizes no transaction or transfer.
        </p>
      </section>
      <section className="panel">
        <h2>Session</h2>
        <p>
          A session lasts 24 hours. Holdings are checked every minute while the
          site is open. If a successful check finds no supported holdings,
          posting, replying and voting end. Reading remains open to everyone.
          Checks are periodic, so changes are not instant.
        </p>
      </section>
      <section className="panel">
        <h2>Privacy</h2>
        <p>
          Holdings personalize your news feed. Exact balances and wallet
          addresses are not shown publicly. Your wallet address is
          stored during the session for automatic checks. Value badges are
          optional and hidden by default.
        </p>
        <p>
          A verified token balance does not establish expertise or registered
          shareholder status. <Link href="/trust">Privacy details</Link>.
        </p>
      </section>
      <section className="panel">
        <h2>Holder tiers</h2>
        <p>
          Tiers use the estimated USD value of supported tokenized stocks in
          your verified wallet: no badge under $100; Bronze $100–$999;
          Silver $1,000–$9,999; Gold
          $10,000–$99,999; Platinum $100,000–$999,999; Diamond $1 million or more.
        </p>
        <p>
          Badges require reliable prices and current holdings checks. If value
          cannot be determined reliably, no value badge is shown. This does
          not mean the wallet holds less than $100. A verified supported
          holding still lets you post, reply and vote, with or without a badge.
          Tiers do not indicate expertise or total wealth.
        </p>
        <p>
          Value badges are private by default. Enable Show value badge in
          Profile to share your tier and its range. Exact balances stay private.
        </p>
      </section>
    </div>
  );
}
