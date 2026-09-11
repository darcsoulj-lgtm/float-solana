import Link from '@/components/site-link';
import { TOKENS } from '@/lib/tokens';
export default function Page() {
  return (
    <div className="page">
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
    </div>
  );
}
