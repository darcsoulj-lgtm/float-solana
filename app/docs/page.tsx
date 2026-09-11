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
          Use a desktop wallet extension or compatible wallet browser. Mobile
          deep-link pairing is not supported.
        </p>
      </section>
      <section className="panel">
        <h2>Participate</h2>
        <p>
          Join or create rooms, post discussions and reply. All verified members
          can access every room. Save posts and sources for later.
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
    </div>
  );
}
