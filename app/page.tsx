import Link from 'next/link';
import {
  ArrowUpRight,
  ShieldCheck,
  ScanLine,
  ChartNoAxesCombined,
} from 'lucide-react';
export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span className="dot" /> VERIFIED INVESTOR INTELLIGENCE
          </p>
          <h1>
            Go beyond sentiment.
            <br />
            <em>Ask the holders.</em>
          </h1>
          <p className="lede">
            Primary research from people who can prove they own the asset. Turn
            verified token holdings into a new source of investor intelligence.
          </p>
          <div className="actions">
            <Link className="cta" href="/dashboard/new">
              Create a survey <ArrowUpRight size={18} />
            </Link>
            <Link className="textlink" href="/surveys">
              Participate in research ↗
            </Link>
          </div>
          <p className="fine">Starting with tokenized equities on Solana.</p>
        </div>
        <div className="signal">
          <div className="signal-top">
            <span>FROM QUESTION TO EVIDENCE</span>
            <ShieldCheck size={18} />
          </div>
          <div className="signal-body">
            <p className="eyebrow">MU · RESEARCH DESIGN EXAMPLE</p>
            <h2>What would change your investment thesis?</h2>
            <div className="flowrow">
              <span>01</span>
              <div>
                <b>Define your audience</b>
                <p>Verified MU token holders</p>
              </div>
              <ScanLine />
            </div>
            <div className="flowrow">
              <span>02</span>
              <div>
                <b>Collect original responses</b>
                <p>Wallet-signed. Ownership-checked.</p>
              </div>
              <ShieldCheck />
            </div>
            <div className="flowrow">
              <span>03</span>
              <div>
                <b>Build your own evidence</b>
                <p>Aggregate results with a clear methodology</p>
              </div>
              <ChartNoAxesCombined />
            </div>
          </div>
          <div className="signal-foot">
            <span className="dot" /> Proof of holdings. A clearer starting
            point.
          </div>
        </div>
      </section>
      <section className="audience">
        <span>BUILT FOR THE QUESTIONS THAT MOVE CAPITAL</span>
        <b>Investment teams</b>
        <b>Research firms</b>
        <b>Investor relations</b>
      </section>
      <section className="section">
        <p className="eyebrow">THE RESEARCH ADVANTAGE</p>
        <div className="split">
          <h2>
            A verified audience.
            <br />
            An original dataset.
          </h2>
          <p>
            Commission focused research around a specific asset. Every accepted
            live response is backed by a fresh onchain ownership check, with
            exact balances excluded from research results.
          </p>
        </div>
        <div className="three">
          <article>
            <span className="number">01 / TARGET</span>
            <h3>Start with ownership</h3>
            <p>
              Choose an approved stock token and ask questions that matter to
              your thesis.
            </p>
          </article>
          <article>
            <span className="number">02 / VERIFY</span>
            <h3>Evidence before answers</h3>
            <p>
              Respondents sign a message. We verify token holdings server-side
              before accepting a response.
            </p>
          </article>
          <article>
            <span className="number">03 / UNDERSTAND</span>
            <h3>Research you can inspect</h3>
            <p>
              Explore response distributions, sample counts, verification
              timestamps, and disclosed limitations.
            </p>
          </article>
        </div>
      </section>
      <section className="closing">
        <p className="eyebrow">YOUR NEXT RESEARCH QUESTION STARTS HERE</p>
        <h2>Find out what holders think.</h2>
        <Link className="cta light" href="/dashboard/new">
          Create your first survey ↗
        </Link>
        <Link href="/methodology">Read our methodology →</Link>
      </section>
    </>
  );
}
