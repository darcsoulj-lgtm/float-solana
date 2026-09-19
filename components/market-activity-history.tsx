'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { MarketDailyPoint } from '@/lib/market-history';

const compact = (value: number | null) =>
  value === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);

export function MarketActivityHistory({ ready, now }: { ready: boolean; now: number }) {
  const [points, setPoints] = useState<MarketDailyPoint[]>([]);
  const [metric, setMetric] = useState<'volume_24h' | 'liquidity'>('volume_24h');
  const [days, setDays] = useState<7 | 30>(30);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function load() {
      try {
        const response = await api<{ points: MarketDailyPoint[] }>(
          'market-data?history=1',
        );
        if (active) {
          setPoints(response.points);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 300000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ready]);

  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const byDay = new Map(points.map((point) => [point.day, point]));
  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(end.getTime() - (days - index - 1) * 86400000);
    const day = date.toISOString().slice(0, 10);
    return { day, point: byDay.get(day) };
  });
  const available = series.filter(
    ({ point }) => point && point[metric] !== null,
  ).length;
  const max = Math.max(
    1,
    ...series.map(({ point }) => point?.[metric] ?? 0),
  );
  const label = metric === 'volume_24h' ? 'Eligible DEX volume · 24h' : 'Pool liquidity';
  const plot = { x: 56, y: 18, width: 920, height: 210 };
  const cell = plot.width / days;
  return (
    <section className="market-history-panel" aria-labelledby="market-history-title">
      <header>
        <div>
          <h3 id="market-history-title">Market activity over time</h3>
          <p>Solana · One complete daily observation, where available</p>
        </div>
        <div className="market-history-controls">
          <label>
            <span className="sr-only">Historical metric</span>
            <select
              aria-label="Historical metric"
              value={metric}
              onChange={(event) => setMetric(event.target.value as typeof metric)}
            >
              <option value="volume_24h">DEX volume · 24h</option>
              <option value="liquidity">Pool liquidity</option>
            </select>
          </label>
          <fieldset aria-label="Historical range">
            <legend className="sr-only">Historical range</legend>
            <button type="button" aria-pressed={days === 7} onClick={() => setDays(7)}>7D</button>
            <button type="button" aria-pressed={days === 30} onClick={() => setDays(30)}>30D</button>
          </fieldset>
        </div>
      </header>
      <div className="market-history-value">
        <strong>{label}</strong>
        <span>{available} of {days} days recorded</span>
      </div>
      <div className="market-history-plot">
        <svg viewBox="0 0 1000 270" aria-label={`${label} over the past ${days} days. ${available} observed days; missing days are gaps.`}>
          {[0, 0.5, 1].map((fraction) => {
            const y = plot.y + plot.height * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={plot.x} x2={plot.x + plot.width} y1={y} y2={y} className="market-history-grid" />
                <text x={plot.x - 8} y={y + 4} textAnchor="end" className="market-history-axis">{compact(max * fraction)}</text>
              </g>
            );
          })}
          {series.map(({ day, point }, index) => {
            const value = point?.[metric];
            if (value == null) return null;
            const height = Math.max(value > 0 ? 3 : 0, (value / max) * plot.height);
            return (
              <rect
                key={day}
                x={plot.x + index * cell + cell * 0.17}
                y={plot.y + plot.height - height}
                width={Math.max(2, cell * 0.66)}
                height={height}
                rx={Math.min(3, cell * 0.1)}
                className="market-history-bar"
              >
                <title>{day}: {compact(value)} · observed {new Date(point!.observed_at).toLocaleString()}</title>
              </rect>
            );
          })}
          <text x={plot.x} y={256} className="market-history-axis">{series[0].day}</text>
          <text x={plot.x + plot.width} y={256} textAnchor="end" className="market-history-axis">{series[series.length - 1].day}</text>
        </svg>
      </div>
      <p className="market-history-note">
        {unavailable
          ? 'Historical observations are temporarily unavailable.'
          : available === 0
            ? 'Recording starts when every market batch has a fresh, verified pool snapshot. No historical values are estimated.'
            : available === 1
              ? 'The first observation is recorded. A trend will appear as new complete days are collected.'
              : 'Daily points are 24-hour rolling volume or observed liquidity at the recorded time. Gaps mean incomplete coverage.'}
      </p>
    </section>
  );
}
