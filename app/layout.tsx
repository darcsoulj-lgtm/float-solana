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
    icon: { url: '/favicon.svg?v=float-minimal', type: 'image/svg+xml' },
    apple: { url: '/favicon.svg?v=float-minimal', type: 'image/svg+xml' },
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
      'A shared community for holders of tokenized equities on Solana.',
  },
  description:
    'A shared community for holders of tokenized equities on Solana.',
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
            <Link href="/">Community</Link>
            <Link href="/markets">Markets</Link>
          </nav>
          <ThemeToggle />
          <Link className="nav-cta" href="/#join">
            How to join
          </Link>
        </header>
        <main id="main">{children}</main>
        <footer>
          <div>
            <Link className="footer-brand" href="/">
              Float
            </Link>
            <p>An independent community for Solana tokenized stock holders.</p>
          </div>
          <div className="footerlinks">
            <Link href="/about">About</Link>
            <Link href="/trust">Privacy</Link>
            <Link href="/methodology">Membership</Link>
            <Link href="/tokens">Supported stocks</Link>
            <Link href="/docs">Help</Link>
            <Link href="/admin/community">Admin</Link>
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
