export default function Page() {
  return (
    <div className="page info-page">
      <h1>Privacy</h1>
      <section className="panel">
        <h2>What connecting authorizes</h2>
        <p>
          Connecting shares your public wallet address. The site requests a
          readable, one-use membership message signature and reads token
          balances through Helius. It does not request transaction signing,
          spending approvals, token transfers, or your recovery phrase. Check
          that the signing domain matches the Float address you opened:
          joinfloat.xyz. The message should name Float and describe community
          access.
          Cancel any unexpected transaction request.
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
          expiry, optional value tier and its expiry, value-badge preference,
          followed topics, saved-item references, reply notification preferences
          and in-app notifications, posts, replies, reports, and moderation
          records.
        </p>
        <p>
          Raw wallet addresses are temporarily stored in five-minute challenges
          and deleted after successful verification or cleanup on later
          verification requests. The signed-in session also keeps the verified
          public wallet address to recheck holdings. This address is not exposed
          on profiles or returned by the member API. It is removed on sign-out,
          replacement verification, or expired-session cleanup on subsequent
          verification/refresh requests.
        </p>
        <p>
          Your latest token quantities are saved privately to show your
          portfolio value. They are returned only to your signed-in account,
          never in public profiles, discussions or exports. Unrelated token
          holdings are discarded. Detected holdings are replaced on each
          successful holdings check.
        </p>
        <p>
          Profile photos and bios are public; uploaded photos are resized
          and stripped of metadata.
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
          Discussions and replies are public. Anyone can see your alias, profile
          photo, bio, contributions and optional value badge without signing
          in. Posting, replying and voting require a verified holding. Your
          full holdings list, followed topics, saved items,
          and notifications are returned only to your own active session.
          Administrators can review content, reports, and member records.
          Anyone can copy or share public content. Do not post private information.
        </p>
      </section>
      <section className="panel">
        <h2>Limits of privacy</h2>
        <p>
          Wallet hashes are pseudonymous, not anonymous: a known public wallet
          can be matched to its hash. The RPC provider receives wallet addresses
          to check holdings. An HttpOnly session cookie lasts up to 24 hours;
          signing in again invalidates your previous session. Administrators
          authenticate through an explicitly allowed ChatGPT identity or
          administrator wallet. Access is checked on the server.
        </p>
      </section>
      <section className="panel">
        <h2>Post translations</h2>
        <p>When you choose to translate, the public post or reply text is sent to Cloudflare Workers AI. We do not attach wallet, profile or holdings data from the author&apos;s account. Any information written in the post itself is part of the text sent for translation. Translations may contain mistakes; the original is always available. Cached translations expire after 30 days and are removed during later translation requests. Hidden posts and replies cannot be translated or retrieved from this cache. Your translation language is saved on your device.</p>
      </section>
      <section className="panel">
        <h2>Retention and requests</h2>
        <p>
          Contributions and moderation records persist until operator deletion.
          Removing a contribution hides it from readers but retains it for
          moderation. Contact{' '}
          <a href="mailto:elcresearch.support@gmail.com">support</a> for
          privacy, deletion, or appeal requests. Automatic long-term retention
          deletion is not yet implemented.
        </p>
      </section>
      <section className="panel">
        <h2>Disclosures</h2>
        <p>
          Discussion and market research are not investment advice. Token
          ownership does not establish expertise, direct equity ownership, or an
          affiliation with an issuer. Float is independent of Backpack and
          underlying companies. There are no funded rewards or guaranteed
          benefits. Legacy research tools retain their separate consent and
          simulated-data labels.
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
