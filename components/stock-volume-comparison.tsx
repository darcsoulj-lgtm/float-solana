'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { MetricInfo } from './metric-info';
import Link from '@/components/site-link';
import { MarketDateNavigation } from './market-date-navigation';
import { nextStockVolumeCollection, rankedStockVolumeRows, stockVolumeDateLabel, stockVolumeRatio, validStockVolumeComparison, type StockVolumeComparison, type StockVolumePeriod } from '@/lib/stock-volume-comparison';

const money = (value: number, compact = true) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: 2,
}).format(value);
const snapshotTime = (value: number) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(value);

export function StockVolumeComparisonCard({ comparisons, historicalSnapshot = false, automatic = false }: { comparisons: StockVolumeComparison[]; historicalSnapshot?: boolean; automatic?: boolean }) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const [selectedDate,setSelectedDate] = useState<string|null>(null);
  const dismissed = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<{ comparisons: StockVolumeComparison[]; status: string; checkedAt?: number } | null>(null);
  useEffect(() => {
    if (!automatic) return;
    let active = true; const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/stock-volume', {signal: controller.signal});
        if (!response.ok) throw Error('Comparison unavailable');
        const value = await response.json() as {comparisons?: StockVolumeComparison[]; history?: StockVolumeComparison[]; status?: string; checkedAt?: number};
        if (!Array.isArray(value.comparisons) || value.comparisons.length !== 1 || !value.comparisons.every(validStockVolumeComparison) || !['daily','delayed','pending'].includes(value.status ?? '')) throw Error('Invalid comparison');
        if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length>90 || !value.history.every(validStockVolumeComparison))) throw Error('Invalid history');
        if (value.checkedAt !== undefined && (!Number.isSafeInteger(value.checkedAt) || value.checkedAt <= 0)) throw Error('Invalid check time');
        if (active) setLive({comparisons:[...value.comparisons,...(value.history??[])],status:value.status!,checkedAt:value.checkedAt});
      } catch { if (active) setLive(previous => ({comparisons:previous?.comparisons ?? comparisons,status:'delayed',checkedAt:previous?.checkedAt})); }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [automatic, comparisons]);
  const available = (live?.comparisons ?? comparisons).filter(validStockVolumeComparison);
  const periods = ([1, 7, 30] as const).filter(n => available.some(c => c.period === n));
  const missing = ([1, 7, 30] as const).filter(n => !periods.includes(n));
  const [period, setPeriod] = useState<StockVolumePeriod>(available.some(c => c.period === 7) ? 7 : 1);
  const dateKey=(c:StockVolumeComparison)=>new Intl.DateTimeFormat('en-CA',{timeZone:c.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.parse(c.startUtc));
  const daily=available.filter(c=>c.period===1);
  const chosen = (period===1 && selectedDate ? daily.find(c=>dateKey(c)===selectedDate) : undefined) ?? available.find(c => c.period === period) ?? available[0];
  const nextCollection = automatic && live && daily[0] ? nextStockVolumeCollection(daily[0]) : null;
  useEffect(() => {
    if (!selected) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setSelected(null); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selected]);
  if (!chosen) return null;
  const allStocksClosed = chosen.rows.every(row => row.stockMarketClosed);
  return <section ref={root} className="stock-volume-comparison" aria-labelledby={id + '-title'}>
    <header className="stock-volume-heading">
      <div><div className="stock-volume-title"><h3 id={id + '-title'}>Token vs stock volume</h3><MetricInfo label="About token vs stock volume" learnMore="/data-methodology#stock-volume-comparison">
        Same New York day. US volume combines reported venues.
      </MetricInfo></div><p>Daily · New York time</p></div>
      <div className="stock-volume-controls">{period===1 && <MarketDateNavigation label="Comparison date" days={daily.map(dateKey)} value={dateKey(chosen)} onChange={day=>{setSelectedDate(day===dateKey(daily[0])?null:day);setSelected(null);}}/>}
      {periods.length > 1 && <fieldset className="stock-volume-periods"><legend className="sr-only">Comparison period</legend>
        {periods.map(n => <button key={n} type="button" aria-pressed={chosen.period === n} onClick={() => { setPeriod(n); setSelected(null); }}>{n}D</button>)}
      </fieldset>}</div>
    </header>
    {allStocksClosed && <p className="stock-volume-closed-note">US market closed · Choose an earlier date</p>}
    <ol className="stock-volume-rows">
      {rankedStockVolumeRows(chosen).map(row => {
        const maximum = Math.max(row.tokenUsd, row.stockUsd);
        const ratio = stockVolumeRatio(row);
        return <li key={row.mint}>
          <div className="stock-volume-identity"><strong>{row.symbol}</strong><span>{row.name}</span></div>
          <div className="stock-volume-pair-block">
          <button type="button" className="stock-volume-pair" aria-label={`${row.symbol}: Backpack ${money(row.tokenUsd, false)}, US stock ${money(row.stockUsd, false)}`} aria-describedby={selected === row.symbol ? id + '-exact' : undefined} onPointerEnter={() => { if (dismissed.current !== row.symbol) setSelected(row.symbol); }} onPointerLeave={e => { if (document.activeElement !== e.currentTarget) { dismissed.current = null; setSelected(null); } }} onFocus={() => { dismissed.current = null; setSelected(row.symbol); }} onBlur={() => { dismissed.current = null; setSelected(null); }} onClick={() => { dismissed.current = null; setSelected(row.symbol); }} onKeyDown={e => { if (e.key === 'Escape') { dismissed.current = row.symbol; setSelected(null); } }}>
            {([{ label: 'Backpack', value: row.tokenUsd, kind: 'token' }, { label: 'US stock', value: row.stockUsd, kind: 'stock' }] as const).map(bar => <span key={bar.kind} className={'stock-volume-bar-row stock-volume-bar-row--' + bar.kind}>
              <span className="stock-volume-source">{bar.label}</span><span className="stock-volume-track" aria-hidden="true"><i style={{ width: `${maximum ? bar.value / maximum * 100 : 0}%` }} /></span>
              <span className="stock-volume-amount"><span aria-hidden="true">{money(bar.value)}</span><span className="sr-only">{money(bar.value, false)}</span></span>
            </span>)}
          </button>
          {selected === row.symbol && <div id={id + '-exact'} role="tooltip" className="stock-volume-tooltip"><strong>{row.symbol}</strong><small>Primary listing: {row.listingExchange}</small><small>US volume: reported venues combined</small><span>Backpack <b>{money(row.tokenUsd, false)}</b></span><span>US stock <b>{money(row.stockUsd, false)}</b></span><small>{stockVolumeDateLabel(chosen)}</small></div>}
          </div>
          <div className="stock-volume-ratio" aria-label={`${row.symbol}: Backpack divided by US stock volume, ${ratio === '—' ? 'unavailable because US stock volume is zero' : ratio}`}><strong>{ratio}</strong>{!allStocksClosed && <small>{row.stockMarketClosed ? 'US market closed' : 'of stock volume'}</small>}</div>
        </li>;
      })}
    </ol>
    <footer className="stock-volume-footer">
      <div>{automatic ? <p className="stock-volume-snapshot-note">{live?.status === 'daily' ? 'Updated daily' : live?.status === 'delayed' ? 'Update delayed' : 'Daily update pending'}</p> : historicalSnapshot && <p className="stock-volume-snapshot-note">Historical snapshot · Not automatically updated</p>}{!!chosen.comparisonCoverage?.unavailable.length && <p className="stock-volume-snapshot-note">{chosen.rows.length} / 5 comparisons · {chosen.comparisonCoverage.unavailable.map(r=>r.symbol).join(', ')} history unavailable</p>}</div>
      <details><summary>Data &amp; methodology</summary>
        {(chosen.selectedAt || nextCollection !== null) && <p>{chosen.selectedAt && <>Tokens selected: {snapshotTime(chosen.selectedAt)}.<br /></>}{nextCollection !== null && <>{live?.checkedAt && live.checkedAt >= nextCollection ? 'Collection due: ' : 'Next collection: '}{snapshotTime(nextCollection)}.</>}</p>}
        {missing.length > 0 && <p>{missing.map(n => n + 'D').join(' and ')} need complete matched history.</p>}
        <p>{chosen.selectionBasis ? <>Five tokens are selected from the rolling 24h Markets ranking when this snapshot is collected. That selection stays fixed for this date; the five are then sorted by their matched-day volume. This is not an exhaustive top-five ranking for that historical day. {chosen.coverage.available} of {chosen.coverage.total} tokens had fresh ranking data. Only the selected five are queried for historical comparison.</> : <>{chosen.coverage.available} of {chosen.coverage.total} tracked tokens had historical data.</>}{chosen.coverage.unavailable.length > 0 && <> Unavailable: {chosen.coverage.unavailable.join(', ')}.</>} Ranking excludes unavailable tokens. Missing data never counts as zero. A closed US market is shown only when the official calendar and empty SIP tape agree.</p><p>Backpack: Birdeye historical dollar volume. US stock: Alpaca consolidated SIP trades, including reported extended hours; separate overnight feeds excluded. The listing exchange identifies the stock, not the scope of its volume.</p><p>Stock dollar volume sums eligible trade price × shares, excluding canceled and incorrect prints and retaining corrections. Shares and trade counts reconcile with the provider’s daily totals. Token activity is not independently wash-trade filtered. This calendar-day comparison differs from the rolling 24h figures in the token list. The two bars for each stock share a dollar scale; scales differ between stocks. The ratio compares activity, not market share. Collection is scheduled daily at 06:30 UTC; completion can be delayed. A delayed update retains the last verified date.</p><Link href="/data-methodology#stock-volume-comparison">Full methodology →</Link></details>
    </footer>
  </section>;
}
