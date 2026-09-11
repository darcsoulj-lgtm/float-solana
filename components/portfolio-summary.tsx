'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Holding } from '@/lib/community-types';
import type { MarketOverview } from '@/lib/market-data';
import { tokenObservation } from '@/lib/token-observation';
export function PortfolioSummary({
  positions,
  data,
  now,
}: {
  positions: Holding[];
  data: MarketOverview | null;
  now: number;
}) {
  const [hidden, setHidden] = useState(false);
  const rows = positions.map((p) => {
    const o = tokenObservation(data, p.symbol, now);
    const raw =
      p.raw_amount && p.decimals != null
        ? Number(p.raw_amount) / 10 ** p.decimals
        : null;
    const value =
      raw !== null && Number.isFinite(raw) && o.price !== null
        ? raw * o.price
        : null;
    return { ...p, value, source: o.priceSource, priceTime: o.priceTime };
  });
  const valued = rows.filter((r) => r.value !== null),
    total = valued.reduce((s, r) => s + r.value!, 0);
  const money = (v: number | null) =>
    hidden
      ? '••••'
      : v === null
        ? '—'
        : new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(v);
  const complete = rows.length > 0 && valued.length === rows.length;
  return (
    <section className="portfolio-summary" aria-label="Private portfolio">
      <small>
        {complete
          ? 'Your holdings · estimated value'
          : 'Priced holdings · subtotal'}
      </small>
      <div className="portfolio-total">
        <strong>{money(valued.length ? total : null)}</strong>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? 'Show balances' : 'Hide balances'}
        >
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      <small>
        Only you can see these balances.
        {!complete && ' Some values are unavailable.'}
      </small>
      <div className="portfolio-positions">
        {rows.map((r) => (
          <div key={r.symbol} className="portfolio-position">
            <strong>{r.symbol}</strong>
            <span>{hidden ? '••••' : (r.ui_amount ?? '—')} tokens</span>
            <span>{money(r.value)}</span>
            {complete && total > 0 && r.value !== null && !hidden && (
              <>
                <progress
                  value={r.value}
                  max={total}
                  aria-label={`${r.symbol} portfolio weight`}
                />
                <small>
                  {((100 * r.value) / total).toFixed(1)}% of portfolio
                </small>
              </>
            )}
          </div>
        ))}
      </div>
      <details className="market-methodology">
        <summary>Valuation details</summary>
        <small>
          Estimated from raw token units × observed token price. The displayed
          token balance includes issuer adjustments. Values are not executable
          sell quotes; fees and slippage are excluded.
        </small>
        <ul>
          {rows.map((r) => (
            <li key={r.symbol}>
              <small>
                {r.symbol} · {r.source} · Price{' '}
                {r.priceTime
                  ? new Date(r.priceTime).toLocaleTimeString()
                  : 'unavailable'}{' '}
                · Balance {new Date(r.verified_at).toLocaleTimeString()}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
