import Link from 'next/link';
import { TOKENS } from '@/lib/tokens';
export const metadata = { title: 'Documentation' };
export default function Page() {
  return (
    <div className="page prose">
      <p className="eyebrow">PRODUCT DOCUMENTATION</p>
      <h1>From brief to evidence.</h1>
      <h2>For researchers</h2>
      <ol>
        <li>Open the research workspace and sign in with ChatGPT.</li>
        <li>
          Create a survey: choose MU or SKHY, add a brief, target count, and up
          to ten single-choice or open-text questions.
        </li>
        <li>
          Save the private draft, inspect it, and submit it for administrator
          review.
        </li>
        <li>
          Once approved, distribute the participant link to your intended
          audience. HolderPulse does not automatically recruit holders.
        </li>
        <li>
          Review results in your private dashboard. Export a JSON research
          package with distributions, counts, and methodology fields.
        </li>
      </ol>
      <h2>For participants</h2>
      <p>
        Choose an active live study and select Backpack, Phantom, or Solflare.
        Use the installed extension or a compatible wallet browser. Connect and
        sign the displayed verification message; no transaction is requested.
        Complete your response within ten minutes, consent to research use, and
        submit. If verification expires or the RPC is unavailable, reconnect and
        sign a new challenge.
      </p>
      <h2>Supported token registry</h2>
      {TOKENS.map((t) => (
        <section className="panel" key={t.symbol}>
          <h3>
            {t.symbol} · {t.name}
          </h3>
          <p>
            {t.mint
              ? 'Official published mint · live verification architecture enabled'
              : 'Live verification disabled: official mint confirmation outstanding'}
          </p>
          {t.mint && <code>{t.mint}</code>}
          <p>
            <Link href={t.source}>Issuer source →</Link>
          </p>
        </section>
      ))}
      <h2>What is available today</h2>
      <p>
        Persistent surveys and responses, researcher authentication, server-side
        authorization, admin moderation, Solana ownership checks, live
        analytics, labeled examples, and saved commercial requests.
      </p>
      <h2>Integration boundaries</h2>
      <p>
        USDC funding, transfers, checkout, recurring billing, historical indexer
        cohorts, and mobile deep-link pairing are not enabled. An authenticated
        private RPC endpoint can be configured for reliable throughput; the
        default public endpoint is best-effort and may reject requests.
      </p>
      <h2>For operators</h2>
      <p>
        Deployment, database schema, environment setup, test coverage, and
        integration notes are included with the project source in this
        workspace. Administrator emails must be explicitly allowlisted. The
        public token registry is controlled by reviewed code; researchers cannot
        supply arbitrary mints.
      </p>
      <Link className="cta" href="/dashboard/new">
        Create a study ↗
      </Link>
    </div>
  );
}
