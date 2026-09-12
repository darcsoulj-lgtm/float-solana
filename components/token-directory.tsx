'use client';
import { useState } from 'react';
import { TOKENS, ISSUERS, issuerName, type IssuerId } from '@/lib/tokens';
export function TokenDirectory() {
  const [query, setQuery] = useState(''),
    [issuer, setIssuer] = useState<IssuerId | 'all'>('all'),
    [page, setPage] = useState(0);
  const matches = TOKENS.filter(
    (t) =>
      (issuer === 'all' || t.issuer === issuer) &&
      (t.symbol + ' ' + t.name + ' ' + t.mint)
        .toLowerCase()
        .includes(query.toLowerCase()),
  ).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const last = Math.max(0, Math.ceil(matches.length / 20) - 1),
    current = Math.min(page, last);
  return (
    <>
      <fieldset className="issuer-filters" aria-label="Issuer">
        <button
          aria-pressed={issuer === 'all'}
          onClick={() => {
            setIssuer('all');
            setPage(0);
          }}
        >
          All issuers
        </button>
        {ISSUERS.map((i) => (
          <button
            key={i.id}
            aria-pressed={issuer === i.id}
            onClick={() => {
              setIssuer(i.id);
              setPage(0);
            }}
          >
            {i.name}
          </button>
        ))}
      </fieldset>
      <label className="directory-search">
        Find a token
        <input
          type="search"
          placeholder="Name, ticker or mint"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <p aria-live="polite">{matches.length.toLocaleString()} tokens</p>
      <div className="token-directory">
        {matches.slice(current * 20, current * 20 + 20).map((t) => (
          <article className="token-directory-row" key={t.mint}>
            <div>
              <h2>{t.symbol}</h2>
              <p>
                {t.shortName} · {issuerName(t.issuer)}
              </p>
              <a
                className="token-issuer-link"
                href={t.source}
                target="_blank"
                rel="noreferrer"
              >
                Registry record ↗
              </a>
            </div>
            <a
              href={'https://explorer.solana.com/address/' + t.mint}
              target="_blank"
              rel="noreferrer"
              aria-label={'View ' + t.symbol + ' mint on Solana Explorer'}
            >
              <code>{t.mint}</code>
            </a>
          </article>
        ))}
      </div>
      {!matches.length && <p>No matching tokens.</p>}
      <nav className="directory-pagination" aria-label="Token pages">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        <span>
          {current + 1} / {last + 1}
        </span>
        <button
          disabled={current === last}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </nav>
    </>
  );
}
