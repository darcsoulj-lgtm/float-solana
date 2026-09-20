import type { Metadata } from 'next';
import Link from '@/components/site-link';

export const metadata: Metadata = { title: 'Open article' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
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
      <h1>{destination ? 'Read the original article' : 'Article unavailable'}</h1>
      {destination ? (
        <>
          <p>This article opens on {destination.hostname}.</p>
          <a href={destination.href} target="_blank" rel="noopener noreferrer">
            Open article ↗
          </a>
        </>
      ) : (
        <p>We couldn’t open this article link.</p>
      )}
    </section>
  );
}
