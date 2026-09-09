export const metadata = { title: 'Methodology' };
export default function Page() {
  return (
    <div className="page prose">
      <p className="eyebrow">METHODOLOGY / VERSION 1.0</p>
      <h1>Know what the evidence means.</h1>
      <p className="lede">
        Verification improves the provenance of a response. It does not make an
        opinion true, representative, or predictive.
      </p>
      <h2>What “verified holder” means</h2>
      <p>
        A participant controls a Solana wallet that holds a positive raw balance
        of the study’s approved mint at the time we check. A message signature
        establishes wallet control. A finalized server-side RPC query
        establishes the token balance. We repeat that check before storing the
        response and record the verification time and Solana slot.
      </p>
      <h2>How the check works</h2>
      <ol>
        <li>
          A five-minute challenge binds the wallet, survey, site origin, nonce,
          and expiration.
        </li>
        <li>
          The server verifies the Ed25519 signature and consumes the challenge
          once.
        </li>
        <li>
          The mint must be a valid parsed mint owned by the SPL Token or
          Token-2022 program.
        </li>
        <li>
          All parsed token accounts for that wallet and mint are aggregated
          using integer arithmetic, including frozen balances. Delegated
          third-party ownership does not qualify.
        </li>
        <li>
          A ten-minute proof authorizes one response. A fresh finalized check
          runs on submission. Database constraints enforce one response per
          wallet per study.
        </li>
      </ol>
      <h2>What we do not establish</h2>
      <ul>
        <li>
          Unique people: one person can control several wallets. Transferred or
          borrowed tokens can qualify.
        </li>
        <li>
          Registered shareholder status, legal beneficial ownership, or
          eligibility for shareholder rights.
        </li>
        <li>
          Exchange-held balances, positions in custody or DeFi contracts, and
          unobserved wallets.
        </li>
        <li>
          Holding duration or new purchases. A transfer is not necessarily a
          buy.
        </li>
        <li>
          Accurate economic share equivalents for every Token-2022 extension.
          Cohorts use raw token units, not valuations or adjusted share
          exposure.
        </li>
      </ul>
      <h2>Sampling and interpretation</h2>
      <p>
        Participation is self-selected. Small samples, recruitment methods,
        incentives, and wallet concentration can bias results. We show sample
        counts and question distributions without statistical significance
        claims. Do not generalize a study to every holder or to the underlying
        company’s shareholder base. The platform does not supply a
        representative panel or guarantee recruitment.
      </p>
      <h2>Segmentation and privacy</h2>
      <p>
        Coarse cohorts are under 10, 10–99, and 100+ token units. Cohort
        aggregates are shown only after five total responses; this is basic data
        minimization, not formal anonymity. Holding-duration and new-buyer
        analysis remain unavailable without historical validation. Exact
        balances and wallet addresses are not included in researcher results or
        exports.
      </p>
      <h2>Examples are not evidence</h2>
      <p>
        Seeded example studies and their responses are marked simulated in the
        database and interface. They cannot accept live submissions or be
        converted to live studies. Real analytics never include simulated
        answers.
      </p>
      <h2>Technical references</h2>
      <p>
        <a href="https://solana.com/docs/rpc/http/gettokenaccountsbyowner">
          Solana: getTokenAccountsByOwner
        </a>{' '}
        ·{' '}
        <a href="https://solana.com/docs/rpc/http/getaccountinfo">
          Solana: getAccountInfo
        </a>{' '}
        ·{' '}
        <a href="https://docs.backpack.app/deeplinks/provider-methods/signmessage">
          Backpack: message signing
        </a>
      </p>
    </div>
  );
}
