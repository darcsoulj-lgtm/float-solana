export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">Trust & privacy</p>
      <h1>Verified entry, considered disclosure.</h1>
      <section className="panel">
        <h2>What we store</h2>
        <p>
          We store a private hash of your wallet address, display name,
          qualifying token, verification expiry, badge preference, posts,
          replies, reports, and moderation records. Raw wallet addresses are
          temporarily stored in five-minute challenges and deleted after
          successful verification or cleanup on later verification requests.
          Exact balances are checked but not saved in the community data model.
        </p>
      </section>
      <section className="panel">
        <h2>What others see</h2>
        <p>
          Member discussions require an active verified session. Other members
          see your alias, contributions, and optional qualifying-token badge.
          Public visitors see aggregate member and discussion counts.
          Administrators can review content, reports, and member records.
          Members can copy content, so this is not a confidential channel.
        </p>
      </section>
      <section className="panel">
        <h2>Limits of privacy</h2>
        <p>
          Wallet hashes are pseudonymous, not anonymous: a known public wallet
          can be matched to its hash. The RPC provider receives wallet addresses
          to check holdings. An HttpOnly session cookie lasts up to 24 hours;
          signing in again invalidates your previous session. Administrators
          authenticate through ChatGPT and a server-side allowlist.
        </p>
      </section>
      <section className="panel">
        <h2>Retention and requests</h2>
        <p>
          Contributions and moderation records persist until operator deletion.
          Removing a contribution hides it from members but retains it for
          moderation. Contact elcresearch.support@gmail.com for privacy,
          deletion, or appeal requests. Automatic long-term retention deletion
          is not yet implemented.
        </p>
      </section>
      <section className="panel">
        <h2>Disclosures</h2>
        <p>
          Discussion and market research are not investment advice. Token
          ownership does not establish expertise, direct equity ownership, or an
          affiliation with an issuer. HolderPulse is independent of Backpack and
          underlying companies. There are no funded rewards or guaranteed
          benefits. Legacy research tools retain their separate consent and
          simulated-data labels.
        </p>
      </section>
    </div>
  );
}
