import Link from '@/components/site-link';
import type { Metadata } from 'next';
import './globals.css';
import { AgentTools } from '@/components/agent-tools';
export const metadata: Metadata = {
  title: {
    default: 'HolderPulse — For Backpack stock-token holders',
    template: '%s | HolderPulse',
  },
  description:
    'A shared community for holders of Backpack-issued tokenized equities on Solana.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AgentTools />
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header>
          <Link className="brand" href="/">
            h<span className="brandmark">p</span>
            <strong>
              HolderPulse<span>FOR BACKPACK HOLDERS</span>
            </strong>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Community</Link>
            <Link href="/methodology">Membership</Link>
            <Link href="/rules">Guidelines</Link>
          </nav>
          <Link className="nav-cta" href="/#join">
            Verify & join ↗
          </Link>
        </header>
        <main id="main">{children}</main>
        <footer>
          <div>
            <Link className="footer-brand" href="/">
              HolderPulse
            </Link>
            <p>An independent community for Backpack stock-token holders.</p>
          </div>
          <div className="footerlinks">
            <Link href="/about">About</Link>
            <Link href="/trust">Trust & privacy</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/tokens">Supported stocks</Link>
            <Link href="/docs">Help</Link>
            <Link href="/admin/community">Administration</Link>
          </div>
          <p className="legal">
            Community discussions are not investment advice. Independent of
            Backpack and underlying issuers. Token ownership does not by itself
            establish registered shareholder status. ©{' '}
            {new Date().getFullYear()} HolderPulse
          </p>
        </footer>
      </body>
    </html>
  );
}
