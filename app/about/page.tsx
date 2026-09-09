import Link from 'next/link';
export const metadata = { title: 'About' };
export default function Page() {
  return (
    <div className="page prose">
      <p className="eyebrow">ABOUT HOLDERPULSE</p>
      <h1>A new source of primary research.</h1>
      <p className="lede">
        Markets have no shortage of opinions. HolderPulse gives research teams a
        way to ask focused questions of wallets that can prove they hold a
        specific asset.
      </p>
      <h2>The unit of value is the study.</h2>
      <p>
        A research brief, a defined audience, original responses, and a
        transparent method. HolderPulse is built for investment teams, research
        firms, and investor-relations teams that need evidence they can inspect.
      </p>
      <h2>A deliberate focus</h2>
      <p>
        Verified ownership already exists in brokerage-connected products. Our
        starting point is tokenized-equity holder research on Solana:
        commissioned surveys and private research outputs. Social profiles, chat
        rooms, follower counts, and community feeds are outside our product
        scope.
      </p>
      <h2>Why start on Solana?</h2>
      <p>
        Public token-account data and wallet signatures make it possible to
        check wallet control and asset holdings without collecting brokerage
        credentials. This lowers one verification barrier, while leaving
        sampling quality, privacy, incentives, and willingness to pay as
        questions that must be tested.
      </p>
      <h2>Independent by design</h2>
      <p>
        HolderPulse is not affiliated with Backpack, EquiChamber, Solana, or the
        underlying issuers. Names and symbols identify the assets and
        infrastructure being researched. Token holdings should not be equated
        with verified legal shareholder identity.
      </p>
      <Link className="cta" href="/methodology">
        Explore the methodology →
      </Link>
    </div>
  );
}
