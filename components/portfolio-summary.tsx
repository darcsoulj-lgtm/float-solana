'use client';
import { useState } from 'react';
import { Eye, EyeOff, ChevronDown, LockKeyhole } from 'lucide-react';
import type { Holding } from '@/lib/community-types';
import type { MarketOverview } from '@/lib/market-data';
import { TOKENS } from '@/lib/tokens';
import { tokenObservation } from '@/lib/token-observation';
const colors = ['#e94b56', '#6495ed', '#b092ed', '#d9a44b', '#42a8a1'];
const quantityFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 5,
});
function displayQuantity(value: string | null | undefined) {
  if (value == null || value.trim() === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '—';
  if (amount > 0 && amount < 0.00001) return '<0.00001';
  return quantityFormat.format(amount);
}
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
  const [expanded, setExpanded] = useState(false);
  const rows = positions
    .map((p) => {
      const o = tokenObservation(data, p.symbol, now);
      const comparable =
        TOKENS.find((t) => t.symbol === p.symbol)?.issuer === 'backpack'
          ? o.supply?.valuationSafe !== false
          : o.supply?.valuationSafe === true;
      const raw =
        p.raw_amount && p.decimals != null
          ? Number(p.raw_amount) / 10 ** p.decimals
          : null;
      const estimate =
        raw !== null &&
        Number.isFinite(raw) &&
        raw >= 0 &&
        o.price !== null &&
        !o.priceConflict &&
        comparable
          ? raw * o.price
          : null;
      const value =
        estimate !== null && Number.isFinite(estimate) && estimate >= 0
          ? estimate
          : null;
      return { ...p, value, source: o.priceSource, priceTime: o.priceTime };
    })
    .sort(
      (a, b) =>
        (b.value ?? -1) - (a.value ?? -1) || a.symbol.localeCompare(b.symbol),
    );
  const valued = rows.filter((r) => r.value !== null);
  const total = valued.reduce((s, r) => s + r.value!, 0);
  const complete =
    rows.length > 0 && valued.length === rows.length && Number.isFinite(total);
  const allocation = complete && total > 0 && !hidden;
  const money = (v: number | null) =>
    hidden
      ? '••••'
      : v === null || !Number.isFinite(v)
        ? '—'
        : new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(v);
  const segments = rows.slice(0, 5).map((r, i) => ({
    label: r.symbol,
    value: r.value ?? 0,
    color: colors[i],
  }));
  if (rows.length > 5)
    segments.push({
      label: 'Other',
      value: rows.slice(5).reduce((s, r) => s + (r.value ?? 0), 0),
      color: '#858a98',
    });
  const visible = expanded ? rows : rows.slice(0, 5);
  return (
    <section className="portfolio-summary" aria-label="Private portfolio">
      <div className="portfolio-heading">
        <div>
          <h2>Portfolio</h2>
          <span>
            <LockKeyhole size={12} aria-hidden="true" /> Only you
          </span>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? 'Show balances' : 'Hide balances'}
          aria-pressed={hidden}
        >
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      <div className="portfolio-layout">
        <div className="portfolio-overview">
          <div className="portfolio-total">
            <strong>{money(valued.length ? total : null)}</strong>
            <small>
              {complete ? 'Estimated value' : 'Priced holdings · subtotal'}
            </small>
          </div>
          <div className="allocation-ring">
            <svg
              viewBox="0 0 180 180"
              role="img"
              aria-label={
                allocation
                  ? 'Portfolio allocation by estimated value; percentages are listed beside each holding'
                  : hidden
                    ? 'Balances hidden'
                    : 'Allocation unavailable'
              }
            >
              <circle
                cx="90"
                cy="90"
                r="72"
                fill="none"
                stroke="var(--border)"
                strokeWidth="15"
              />
              {allocation &&
                segments.map((segment, index) => {
                  const weight = (100 * segment.value) / total;
                  const start =
                    (100 *
                      segments
                        .slice(0, index)
                        .reduce((s, r) => s + r.value, 0)) /
                    total;
                  const gap =
                    segments.filter((s) => s.value > 0).length > 1
                      ? Math.min(0.8, weight / 4)
                      : 0;
                  return (
                    weight > 0 && (
                      <circle
                        key={segment.label}
                        cx="90"
                        cy="90"
                        r="72"
                        fill="none"
                        stroke={segment.color}
                        strokeWidth="15"
                        pathLength="100"
                        strokeDasharray={`${weight - gap} ${100 - weight + gap}`}
                        strokeDashoffset={-start}
                        transform="rotate(-90 90 90)"
                      >
                        <title>{`${segment.label}: ${weight.toFixed(1)}%`}</title>
                      </circle>
                    )
                  );
                })}
            </svg>
            <div className="allocation-center">
              <strong>{hidden ? '•••' : rows.length}</strong>
              <span>{rows.length === 1 ? 'holding' : 'holdings'}</span>
            </div>
          </div>
        </div>
        <div className="portfolio-breakdown">
          <div className="portfolio-list-heading">
            <span>Asset / quantity</span>
            <span>Value / weight</span>
          </div>
          <ul className="portfolio-positions">
            {visible.map((r, index) => (
              <li key={r.symbol} className="portfolio-position">
                <span
                  className="allocation-dot"
                  style={{
                    background: allocation
                      ? (colors[index] ?? '#858a98')
                      : 'var(--muted-foreground)',
                  }}
                  aria-hidden="true"
                />
                <div className="position-asset">
                  <strong>{r.symbol}</strong>
                  <span>
                    {hidden ? '••••' : displayQuantity(r.ui_amount)} tokens
                  </span>
                </div>
                <div className="position-value">
                  <strong>{money(r.value)}</strong>
                  <span>
                    {hidden
                      ? '••••'
                      : allocation && r.value !== null
                        ? `${((100 * r.value) / total).toFixed(1)}%`
                        : '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <button
              type="button"
              className="portfolio-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : `Show all ${rows.length} holdings`}
              <ChevronDown size={14} />
            </button>
          )}
          {!complete && (
            <p className="portfolio-notice">
              Some prices are unavailable. Allocation will appear when every
              holding is priced.
            </p>
          )}
        </div>
      </div>
      <details className="portfolio-methodology">
        <summary>
          Valuation details <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div>
          <p>
            Raw token units × observed price. Displayed quantities include
            issuer adjustments. Estimates exclude fees and slippage.
          </p>
          <ul>
            {rows.map((r) => (
              <li key={r.symbol}>
                {r.symbol} · {r.source} · Price{' '}
                {r.priceTime
                  ? new Date(r.priceTime).toLocaleTimeString()
                  : 'unavailable'}{' '}
                · Balance {new Date(r.verified_at).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
