import Link from 'next/link';
export const metadata = { title: 'Pricing' };
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">CLEAR SCOPE. ORIGINAL EVIDENCE.</p>
      <h1>Research on your terms.</h1>
      <p className="lede">
        Start with one question. Build a recurring research program when the
        evidence earns its place.
      </p>
      <div
        className="research-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))' }}
      >
        <section className="panel">
          <span className="badge">PER SURVEY</span>
          <h2>
            $500 <span className="muted">proposed starting price / study</span>
          </h2>
          <p>One focused research objective.</p>
          <ul>
            <li>One verified token-holder audience</li>
            <li>Up to 10 questions</li>
            <li>Private analytics and JSON export</li>
            <li>Moderated research brief</li>
          </ul>
          <p className="muted">
            Final sample, recruitment, and reward costs agreed separately. No
            guaranteed number of participants.
          </p>
          <Link className="cta" href="/enterprise">
            Request a study quote ↗
          </Link>
        </section>
        <section className="panel">
          <span className="badge">ENTERPRISE SUBSCRIPTION</span>
          <h2>Custom agreement</h2>
          <p>A recurring program for investment and research teams.</p>
          <ul>
            <li>Agreed study cadence and coverage</li>
            <li>Research methodology and delivery scope</li>
            <li>Contracted service and data-use terms</li>
            <li>Discuss integration requirements</li>
          </ul>
          <p className="muted">
            Team seats, historical cohorts, and API delivery require a scoped
            agreement and additional integration. They are not enabled today.
          </p>
          <Link className="cta" href="/enterprise">
            Discuss enterprise research ↗
          </Link>
        </section>
      </div>
      <div className="notice">
        Commercial requests are saved for administrator review. Online checkout
        and automatic subscription billing are not enabled. Drafting surveys is
        currently free; no charge occurs without agreed commercial terms.
      </div>
      <Link href="/dashboard/new">Create a research draft →</Link>
    </div>
  );
}
