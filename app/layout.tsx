import Link from '@/components/site-link';
import { FloatLogo } from '@/components/float-logo';
import type { Metadata } from 'next';
import './globals.css';
import './backpack-theme.css';
import './refinements.css';
import './backpack-dashboard.css';
import './member-experience.css';
import { ThemeToggle } from '@/components/theme-toggle';
import { AgentTools } from '@/components/agent-tools';
export const metadata: Metadata = {
  title: {
    default: 'Float — For Solana tokenized stock holders',
    template: '%s | Float',
  },
  icons: {
    icon: { url: '/favicon.svg?v=float-refined-03', type: 'image/svg+xml' },
    apple: { url: '/brand/float-192.png', type: 'image/png' },
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Float',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'Float — For Solana tokenized stock holders',
    siteName: 'Float',
    description:
      'A private community for people who hold tokenized stocks on Solana.',
  },
  description:
    'A private community for people who hold tokenized stocks on Solana.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hp-theme')||'system';if(!['light','dark','system'].includes(t))t='system';document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <AgentTools />
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header>
          <Link className="brand" href="/">
            <FloatLogo />
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/markets">Markets</Link>
            <Link href="/?view=home">Community</Link>
            <Link href="/install">Install Float</Link>
          </nav>
          <ThemeToggle />
        </header>
        <main id="main">{children}</main>
        <footer>
          <div>
            <Link className="footer-brand" href="/">
              <FloatLogo small />
            </Link>
            <p>An independent community for Solana tokenized stock holders.</p>
          </div>
          <div className="footerlinks">
            <Link href="/install">Install Float</Link>
            <Link href="/about">About</Link>
            <Link href="/trust">Privacy</Link>
            <Link href="/methodology">Membership</Link>
            <Link href="/docs">Help</Link>
          </div>
          <p className="legal">
            Community discussions are not investment advice. Independent of
            Backpack and underlying issuers. Token ownership does not by itself
            establish registered shareholder status. ©{' '}
            {new Date().getFullYear()} Float
          </p>
        </footer>
      </body>
    </html>
  );
}
