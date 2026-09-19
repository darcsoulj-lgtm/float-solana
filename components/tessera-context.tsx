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
      <summary>Tessera issuer context · private-company exposure</summary>
      <p>
        Issuer terms determine the rights attached to this token. It should not
        be treated as direct ownership of the underlying company’s shares.
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
          ? 'The issuer supplies no price observation timestamp. This mark is informational, not a live DEX price; it is excluded from Float’s price and valuation calculations.'
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
