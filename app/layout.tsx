import Link from 'next/link';
import type { Metadata } from 'next';
import './globals.css';
import { AgentTools } from '@/components/agent-tools';
export const metadata: Metadata = {
  title: {
    default: 'HolderPulse — Verified investor intelligence',
    template: '%s | HolderPulse',
  },
  description:
    'Primary research from people who provably hold the asset. Verified token-holder surveys on Solana.',
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
              HolderPulse<span>RESEARCH WITH PROOF</span>
            </strong>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/surveys">Surveys</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
          </nav>
          <Link className="nav-cta" href="/dashboard">
            Research workspace ↗
          </Link>
        </header>
        <main id="main">{children}</main>
        <footer>
          <div>
            <Link className="footer-brand" href="/">
              HolderPulse
            </Link>
            <p>Research from people who provably hold the asset.</p>
          </div>
          <div className="footerlinks">
            <Link href="/about">About</Link>
            <Link href="/trust">Trust & privacy</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/admin">Administration</Link>
          </div>
          <p className="legal">
            Market research, not investment advice. Independent of Backpack and
            underlying issuers. Token ownership does not by itself establish
            registered shareholder status. © {new Date().getFullYear()}{' '}
            HolderPulse
          </p>
        </footer>
      </body>
    </html>
  );
}
