export default function Page() {
  return (
    <div className="page info-page">
      <h1>Help</h1>
      <section className="panel">
        <h2>Join</h2>
        <p>
          Choose Connect wallet. We detect supported tokens in your Solana
          wallet. Accept the guidelines, then sign the membership message. No
          transaction or transfer is required.
        </p>
        <p>
          On mobile, choosing a wallet opens this page in that wallet’s browser.
          On desktop, use a browser with the wallet extension enabled.
        </p>
      </section>
      <section className="panel">
        <h2>Participate</h2>
        <p>
          Browse curated channels, post discussions and reply. All verified
          members can access every channel. Save posts and sources for later.
        </p>
        <p>
          Set your display name, optional token badge and reply notifications in
          Profile.
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
          Markets combines your portfolio with Solana-wide metrics. Use Only my
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
