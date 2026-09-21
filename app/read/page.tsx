import type { Metadata } from 'next';
import Link from '@/components/site-link';

export const metadata: Metadata = { title: 'News', robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; title?: string; publisher?: string; summary?: string }>;
}) {
  const { url, title, publisher, summary } = await searchParams;
  let destination: URL | null = null;
  try {
    const parsed = new URL(url || '');
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    ) destination = parsed;
  } catch {
    // Keep the visitor on Float when the article URL is invalid.
  }
  return (
    <section className="article-handoff">
      <Link href="/?view=home#home-news">← Back to news</Link>
      <h1>{destination ? (title?.slice(0, 300) || 'News') : 'Article unavailable'}</h1>
      {destination ? (
        <>
          <p className="article-publisher">{publisher?.slice(0, 100) || destination.hostname}</p>
          {summary && <p className="article-summary">{summary.slice(0, 1000)}</p>}
          <a className="article-source-link" href={destination.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            Read at source ↗
          </a>
          <p className="article-return-note">The source opens separately. Float stays on this page.</p>
        </>
      ) : (
        <p>We couldn’t open this article link.</p>
      )}
    </section>
  );
}
