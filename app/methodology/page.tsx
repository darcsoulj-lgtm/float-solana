import Link from '@/components/site-link';
import { TOKENS } from '@/lib/tokens';
export default function Page() {
  return (
    <div className="page info-page">
      <h1>Membership</h1>
      <section className="panel">
        <h2>Eligibility</h2>
        <p>
          Hold any of the {TOKENS.length} supported stock or ETF tokens in a
          Solana wallet you control. One holding gives access to every room.
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
          access ends. Checks are periodic, so changes are not instant.
        </p>
      </section>
      <section className="panel">
        <h2>Privacy</h2>
        <p>
          Holdings personalize your news feed. Exact balances and wallet
          addresses are not shown to other members. Your wallet address is
          stored during the session for automatic checks. Token badges are
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
          Tiers use the estimated USD value of supported stock tokens in your
          verified wallet: Bronze under $100; Silver $100–$999; Gold
          $1,000–$9,999; Platinum $10,000–$99,999; Diamond $100,000 or more.
        </p>
        <p>
          Every holding needs a reliable current price. Tiers expire when checks
          become stale. They do not indicate expertise or total wealth, and do
          not change posting rights.
        </p>
        <p>
          Value badges are private by default. Enable Show value badge in
          Profile to share your tier and its range. Exact balances stay private.
        </p>
      </section>
    </div>
  );
}
