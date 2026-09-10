import Link from '@/components/site-link';
import { TOKENS } from '@/lib/tokens';
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">Membership</p>
      <h1>One verified holding. Every conversation.</h1>
      <section className="panel">
        <h2>The gate</h2>
        <p>
          A positive balance of any of our {TOKENS.length} supported Backpack
          stock and ETF tokens in a Solana wallet you control unlocks every
          discussion topic.{' '}
          <Link href="/tokens">See the supported token directory</Link>.
          Brokerage balances and perpetual positions do not qualify.
        </p>
      </section>
      <section className="panel">
        <h2>The check</h2>
        <p>
          Connect your wallet. We read token accounts from both Solana token
          programs, match their mint addresses against our reviewed registry,
          and validate detected mints onchain. If a supported holding is found,
          sign a one-use message for this site. We then verify the signature and
          check the holdings again using finalized data before opening your
          home. Signing authorizes no asset transfer.
        </p>
      </section>
      <section className="panel">
        <h2>The window</h2>
        <p>
          Membership lasts 24 hours, then requires a fresh signature and balance
          check. This is a snapshot: selling after verification does not
          instantly remove access. A token badge means the qualifying holding
          was checked within that window; it does not establish expertise or
          direct shareholder rights.
        </p>
      </section>
      <section className="panel">
        <h2>The profile</h2>
        <p>
          Your detected supported stocks personalize your home. You can follow
          other stocks and participate in every topic. Choose a display name.
          Your qualifying token badge is optional and hidden by default. Exact
          balances and wallet addresses are not displayed to other members.
          Hosted exchange balances cannot be verified through this wallet-only
          flow.
        </p>
      </section>
    </div>
  );
}
