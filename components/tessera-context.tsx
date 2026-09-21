'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { SourceResult } from '@/lib/market-data';
import type { TesseraContext as Context } from '@/lib/tessera-data';
export function TesseraContext({ mint }: { mint: string }) {
  const [source, setSource] = useState<SourceResult<Context[]> | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await api<SourceResult<Context[]>>('tessera-context');
        if (active) setSource(next);
      } catch {
        if (active) setSource(null);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const item = !source?.stale
    ? source?.data?.find((row) => row.mint === mint)
    : null;
  return (
    <details className="market-methodology">
      <summary>About this pre-IPO token</summary>
      <p>
        The issuer decides what this token gives you. It is not direct ownership of the company’s shares.
      </p>
      {item && (
        <p>
          {item.sector}
          {item.markPrice !== null && (
            <>
              {' '}
              · Issuer mark:{' '}
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(item.markPrice)}
            </>
          )}
        </p>
      )}
      <p>
        {item
          ? 'The issuer does not provide a time for this price. It is for context only, not a live DEX price, and Float does not use it in totals.'
          : 'Issuer pricing context is currently unavailable.'}
      </p>
      {item && source?.fetchedAt && (
        <p>Retrieved {new Date(source.fetchedAt).toLocaleString()}.</p>
      )}
      <a
        href="https://docs.tessera.pe"
        target="_blank"
        rel="noopener noreferrer"
      >
        Issuer documentation ↗
      </a>
    </details>
  );
}
