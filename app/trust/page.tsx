export const metadata = { title: 'Trust & privacy' };
export default function Page() {
  return (
    <div className="page prose">
      <p className="eyebrow">TRUST / PRIVACY NOTICE</p>
      <h1>Proof with clear boundaries.</h1>
      <p className="lede">
        HolderPulse is an independent market-research service. We do not broker
        securities, recommend trades, or claim affiliation with Backpack or
        underlying issuers.
      </p>
      <h2>Data we process</h2>
      <p>
        Researcher authentication is provided by Sign in with ChatGPT. We
        receive a site-specific user ID and email, and an optional display name.
        We associate drafts, studies, and commercial requests with that
        identity. Administrators can review study briefs and commercial
        requests.
      </p>
      <p>
        For participants, we temporarily process the wallet address, signed
        challenge, and token balances to verify eligibility. We retain
        survey-specific pseudonymous wallet identifiers to prevent duplicates,
        answers, a coarse position cohort, and verification timestamps and
        slots. We do not store exact balances in response records.
      </p>
      <h2>Wallet privacy</h2>
      <p>
        Wallet addresses are public on Solana. This service does not make an
        onchain wallet anonymous. Researchers receive answers and aggregate
        cohorts; they do not receive addresses or exact balances. The RPC
        provider receives the wallet and mint query. Avoid sharing identifying
        information in open-text answers.
      </p>
      <h2>Retention and access</h2>
      <p>
        Challenges expire after five minutes and proofs after ten minutes.
        Expired records are removed during subsequent verification traffic; they
        may remain stored until that cleanup occurs. Survey responses persist
        for research use until an operator processes a deletion request. There
        is currently no automatic retention schedule or self-service deletion.
      </p>
      <p>
        For an access or deletion request, sign in and submit a request through
        the enterprise form, identify the study and your response receipt, and
        mark it “privacy request.” Operators may need additional proof to
        prevent deletion by unrelated parties. Research exports already
        downloaded by a researcher are outside platform deletion control.
      </p>
      <h2>Consent and research conduct</h2>
      <p>
        Submitting a live response requires consent to use the answers and
        coarse position cohort for the study. Do not submit secrets, personal
        identifiers, confidential company information, or material nonpublic
        information. Researchers must have a lawful basis for their study and
        follow applicable privacy and market-abuse requirements.
      </p>
      <h2>Security controls</h2>
      <p>
        Protected operations check researcher ownership or administrator access
        on the server. Wallet signatures are single-use and time-bound. Requests
        are rate-limited, mutation routes enforce same-origin JSON requests, and
        queries use prepared statements. No seed phrase or private key is
        requested. Wallet connection and signing do not authorize asset
        transfers.
      </p>
      <h2>Commercial and reward status</h2>
      <p>
        Pricing is proposed and subject to an agreed scope. Requests do not
        activate paid subscriptions. Planned USDC rewards are unfunded; funding
        and payouts are not enabled. There is no current right to claim a
        displayed planning amount.
      </p>
      <h2>Service limitations</h2>
      <p>
        Ownership checks depend on external Solana infrastructure and fail
        closed during provider errors. This release has not undergone an
        external security audit. Legal entity details, final commercial terms,
        payment processing, and a dedicated support channel must be established
        before paid institutional rollout.
      </p>
    </div>
  );
}
