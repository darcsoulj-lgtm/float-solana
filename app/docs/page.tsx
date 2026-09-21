export default function Page() {
  return (
    <div className="page info-page">
      <h1>Help</h1>
      <section className="panel">
        <h2>Join</h2>
        <p>
          Choose Join the community. We detect supported tokens in your Solana
          wallet. Accept the guidelines, then sign the membership message. No
          transaction or transfer is required.
        </p>
        <p>
          On mobile, sign in your wallet, then reopen Float from your Home
          Screen to finish signing in there. You can also choose to continue
          in the wallet browser. On desktop, use a supported wallet extension.
        </p>
      </section>
      <section className="panel">
        <h2>Participate</h2>
        <p>
          Browse curated channels, post discussions and reply. All verified
          members can access every channel. Save posts and sources for later.
        </p>
        <p>
          Set your display name and reply notifications in Profile.
        </p>
      </section>
      <section className="panel">
        <h2>Update holdings</h2>
        <p>
          Holdings update every minute while the site is open. You can also
          choose Refresh holdings. Sign again when your 24-hour session expires.
        </p>
      </section>
      <section className="panel">
        <h2>Verification failed?</h2>
        <p>
          Check that a supported token is in the connected Solana wallet.
          Exchange account balances do not qualify. If the service is
          unavailable, retry later.
        </p>
        <p>
          <a href="mailto:elcresearch.support@gmail.com">Contact support</a>
        </p>
      </section>
      <section className="panel">
        <h2>News and markets</h2>
        <p>
          News includes upcoming events for your holdings. Choose View all to
          open the full agenda. The stock filter applies to both events and
          headlines.
        </p>
        <p>
          Your portfolio is on Home. Markets shows Solana-wide metrics. Use My
          holdings to narrow the token table. Issuer cards filter the table;
          overall market totals stay Solana-wide.
        </p>
      </section>
      <section className="panel">
        <h2>Saved and badges</h2>
        <p>
          Find saved posts under Discussions → Saved. Your holder tier is in
          Profile. Enable Show value badge to display its value range beside
          your name.
        </p>
      </section>
    </div>
  );
}
