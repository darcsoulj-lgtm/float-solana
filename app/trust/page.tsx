export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">Trust & privacy</p>
      <h1>Verified entry, considered disclosure.</h1>
      <section className="panel">
        <h2>What connecting authorizes</h2>
        <p>
          Connecting shares your public wallet address. The site requests a
          readable, one-use membership message signature and reads token
          balances through Helius. It does not request transaction signing,
          spending approvals, token transfers, or your recovery phrase. Check
          that the signing domain is holderpulse.glossy-kid-6048.chatgpt.site
          and that the message says HolderPulse community membership. Cancel any
          unexpected transaction request.
        </p>
        <p>
          This is a limited code review and testing, not an independent security
          audit or a guarantee. Website, dependency, account, and wallet
          compromise remain possible. Your public address can reveal onchain
          activity even though it is not shown on your community profile.
        </p>
      </section>
      <section className="panel">
        <h2>What we store</h2>
        <p>
          We store a private hash of your wallet address, display name,
          supported token symbols and verification slots/times, verification
          expiry, badge choice, followed topics, saved-item references, reply
          notification preferences and in-app notifications, posts, replies,
          reports, and moderation records. Raw wallet addresses are temporarily
          stored in five-minute challenges and deleted after successful
          verification or cleanup on later verification requests. Exact balances
          are checked but not saved in the community data model. Unrelated token
          holdings are discarded. Detected holdings are replaced on each
          successful verification.
        </p>
        <p>
          Wallet troubleshooting logs record the wallet app name, the completed
          or failed step, a fixed error category, and a random attempt ID. These
          diagnostic events exclude wallet addresses, balances, signatures, and
          the message being signed.
        </p>
      </section>
      <section className="panel">
        <h2>What others see</h2>
        <p>
          Member discussions require an active verified session. Other members
          see your alias, contributions, and optional qualifying-token badge.
          Public visitors see an illustrative preview with no member data. Your
          full holdings list, followed topics, saved items, and notifications
          are returned only to your own active session. Administrators can
          review content, reports, and member records. Members can copy content,
          so this is not a confidential channel.
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
