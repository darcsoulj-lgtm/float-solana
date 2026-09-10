export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">Getting started</p>
      <h1>From holding to conversation.</h1>
      <section className="panel">
        <h2>1. Verify a supported token</h2>
        <p>
          On the community homepage choose Connect wallet & join, select your
          wallet and search for the stock token you hold, accept the guidelines,
          and sign the membership message. Desktop wallet extensions and
          compatible wallet browsers are supported; mobile deep-link pairing is
          not enabled.
        </p>
      </section>
      <section className="panel">
        <h2>2. Join any topic</h2>
        <p>
          Choose General or a ticker, write a question or thesis, and post. You
          can reply across every topic regardless of which supported token
          unlocked membership. Use Edit profile to choose an alias and
          optionally display a token badge.
        </p>
      </section>
      <section className="panel">
        <h2>3. Keep it useful</h2>
        <p>
          Report content that breaks the guidelines. You can remove your own
          posts and replies. Sign out on shared devices. Membership expires
          after 24 hours and must be verified again.
        </p>
      </section>
      <section className="panel">
        <h2>If verification fails</h2>
        <p>
          Check that the supported token is in the connected Solana wallet. RPC
          outages or rate limits prevent entry rather than granting unverified
          access. Start a new verification if a signature expires. Support:
          elcresearch.support@gmail.com.
        </p>
      </section>
    </div>
  );
}
