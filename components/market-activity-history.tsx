'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import type { MarketOverview } from '@/lib/market-data';
import { tradingActivity, activityBreakdown, validTradingActivity, type TradingActivity } from '@/lib/trading-activity';
import { activityWindow, activitySnapshots, volumeObservationTime } from '@/lib/market-presentation';
import Link from '@/components/site-link';
import { MetricInfo } from './metric-info';

const compact = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-US', {
  style:'currency', currency:'USD', notation:'compact', maximumFractionDigits:2,
}).format(value);
const dateLabel = (day: string) => new Date(day+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const colors = ['#cc3049','#d86072','#de8693','#e7aab3','#eed0d5','#b4b8c0'];

export function MarketActivityHistory({data, now}: {data: MarketOverview | null; now: number}) {
  const tooltipId = useId();
  const [hovered,setHovered] = useState<{point: TradingActivity; x: number; symbol?: string}|null>(null);
  const [points,setPoints] = useState<TradingActivity[]>([]);
  const [days,setDays] = useState<7|30|90>(30);
  const [selected,setSelected] = useState<string|null>(null);
  const [status,setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const current = useMemo(() => tradingActivity(data, now),[data,now]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await api<{points: unknown[]}>('trading-activity');
        if (!Array.isArray(response.points)) throw Error('Invalid history');
        if (active) { setPoints(response.points.filter(validTradingActivity)); setStatus('ready'); }
      } catch { if (active) setStatus('error'); }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); },3600000);
    return () => { active=false; clearInterval(timer); };
  },[]);
  const today = new Date(now).toISOString().slice(0,10);
  const basis = data?.tokenVolumes ? 'turnover' : 'pools';
  const byDay = activitySnapshots(points, current, basis);
  const series = activityWindow(byDay.values(), today, days);
  const chosen = series.find(row => row.day === selected)?.point ?? series.at(-1)?.point ?? null;
  const breakdown = chosen ? activityBreakdown(chosen) : [];
  const available = series.filter(s => s.point).length;
  const availableHistory = activityWindow(byDay.values(), today, 90);
  const hasPeriods = availableHistory.length >= 7;
  const showHistory = available > 1;
  const max = Math.max(1,...series.map(s => s.point?.total ?? 0));
  const metric = '24h volume';
  const choose = (day: string) => setSelected(day === series.at(-1)?.day ? null : day);
  const plot = {x:60,y:12,width:890,height:185};
  const cell = plot.width / Math.max(1, series.length);
  const barWidth = Math.min(80, cell * .66);
  return <section className={`market-history-panel trading-activity${showHistory ? '' : ' activity-snapshot'}`} aria-labelledby="market-history-title">
    <header>
      <h3 id="market-history-title">Trading activity <MetricInfo label="About trading activity" learnMore="/data-methodology#activity">{metric}. Rolling 24-hour observations, not daily trade totals. Missing days stay blank. {basis==='turnover' ? 'Source: Birdeye. Trades between tracked tokens may count twice.' : 'Shared pools are split between tokens.'}{chosen && <><br />Source times: {new Date(chosen.oldestAt).toLocaleString()} – {new Date(chosen.newestAt).toLocaleString()}. {chosen.covered}/{chosen.known} {chosen.basis==='pools'?'pools':'tokens'} included; coverage may be incomplete.</>}</MetricInfo></h3>
      {hasPeriods && <div className="market-history-controls"><fieldset aria-label="Activity period"><legend className="sr-only">Activity period</legend>
        {([7,30,90] as const).map(n => <button key={n} type="button" disabled={n===90 && ![...byDay.keys()].some(day => Date.parse(day+'T00:00:00Z') < Date.parse(today+'T00:00:00Z')-30*86400000)} aria-pressed={days===n} onClick={() => {setDays(n);setSelected(null);setHovered(null);}}>{n}D</button>)}
      </fieldset></div>}
    </header>
    <div className="activity-body">
      <div className="activity-chart">
        <div className="activity-selected" aria-live="polite"><span className="activity-value-label">24h volume</span><strong>{compact(chosen?.total ?? null)}</strong><span>{chosen ? `${chosen === current ? 'Latest' : 'Snapshot'} · ${volumeObservationTime(chosen.newestAt)}` : 'Volume unavailable'}</span></div>
        {showHistory ? <>
          <div className="activity-plot" onPointerLeave={() => setHovered(null)}>
          <svg viewBox="0 0 1000 245" preserveAspectRatio="none" aria-label={`${metric}. ${available} observations over ${series.length} days. Missing dates are gaps.`}>
            {[0,.5,1].map(f => <g key={f}><line x1={plot.x} x2={plot.x+plot.width} y1={plot.y+plot.height*(1-f)} y2={plot.y+plot.height*(1-f)} className="market-history-grid"/><text x={plot.x-10} y={plot.y+plot.height*(1-f)+4} textAnchor="end" className="market-history-axis">{compact(max*f)}</text></g>)}
            {series.map(({day,point},i) => {
              if (!point) return null;
              let offset = 0;
              const parts = [...breakdown.slice(0,5).map(r => ({symbol:r.symbol,value:point.tokens.find(t => t.symbol===r.symbol)?.value ?? 0})),{symbol:'Other',value:Math.max(0,point.total-breakdown.slice(0,5).reduce((n,r) => n+(point.tokens.find(t => t.symbol===r.symbol)?.value ?? 0),0))}];
              return <g key={day} className="activity-day">
                <rect x={plot.x+i*cell} y={plot.y} width={cell} height={plot.height} fill="transparent"/>
                {parts.map((part,j) => { const height=part.value/max*plot.height; offset+=height; return <rect key={part.symbol} x={plot.x+i*cell+(cell-barWidth)/2} y={plot.y+plot.height-offset} width={barWidth} height={height} rx={0} fill={colors[j]} opacity={chosen?.day===day?1:.65}/>;})}
                <foreignObject x={plot.x+i*cell} y={plot.y} width={cell} height={plot.height}><button type="button" className="activity-bar-target" aria-label={`${dateLabel(day)}: ${compact(point.total)}`} aria-pressed={chosen?.day===day} onKeyDown={e => {if(e.key==='Escape') setHovered(null);}} aria-describedby={hovered?.point.day===day ? tooltipId : undefined} onPointerEnter={() => setHovered({point,x:(plot.x+(i+.5)*cell)/10})} onFocus={() => setHovered({point,x:(plot.x+(i+.5)*cell)/10})} onBlur={() => setHovered(null)} onClick={() => {choose(day);setHovered({point,x:(plot.x+(i+.5)*cell)/10});}}><span className="sr-only">{dateLabel(day)}</span></button></foreignObject>
              </g>;
            })}
            <text x={plot.x+cell/2} y={232} textAnchor="middle" className="market-history-axis">{dateLabel(series[0].day)}</text><text x={plot.x+plot.width-cell/2} y={232} textAnchor="middle" className="market-history-axis">{dateLabel(series.at(-1)!.day)}</text>
          </svg>
          {hovered && <ActivityTooltip id={tooltipId} point={hovered.point} x={hovered.x} composition />}
          </div>
          <div className="activity-mobile-axis" aria-hidden="true"><span style={{left:`${(plot.x+cell/2)/10}%`}}>{dateLabel(series[0].day)}</span><span style={{left:`${(plot.x+plot.width-cell/2)/10}%`}}>{dateLabel(series.at(-1)!.day)}</span></div>
          <label className="activity-date">Date <select aria-label="Select activity observation" value={chosen?.day ?? today} onChange={e => choose(e.target.value)}>{series.filter(s => s.point).map(s => <option key={s.day} value={s.day}>{dateLabel(s.day)}{s.day===series.at(-1)?.day?' · Latest':''}</option>)}</select></label>
        </> : <div className="activity-building">{chosen && <div className="activity-plot activity-plot--mix" onPointerLeave={() => setHovered(null)}><div className="activity-current-mix" aria-label="Current volume composition">{breakdown.map((row,i) => {
          const x = chosen.total ? (breakdown.slice(0,i).reduce((sum,r) => sum+r.value,0)+row.value/2)/chosen.total*100 : 50;
          const show = () => setHovered({point:chosen,symbol:row.symbol,x});
          return <button type="button" key={row.symbol} style={{width:`${chosen.total ? row.value/chosen.total*100 : 0}%`,background:colors[i]}} aria-label={`${row.symbol}: ${compact(row.value)}`} onKeyDown={e => {if(e.key==='Escape') setHovered(null);}} aria-describedby={hovered?.symbol===row.symbol ? tooltipId : undefined} onPointerEnter={show} onFocus={show} onBlur={() => setHovered(null)} onClick={show}><span className="sr-only">{row.symbol}</span></button>;
        })}</div>{hovered && <ActivityTooltip id={tooltipId} point={hovered.point} x={hovered.x} symbol={hovered.symbol}/>}</div>}{status !== 'ready' && <output>{status==='loading' ? 'Loading history…' : 'History temporarily unavailable'}</output>}</div>}
      </div>
      <div className="activity-ranking"><div className="activity-ranking-heading"><h4>By token</h4></div>
        {breakdown.length ? <ol>{breakdown.map((r,i) => <li key={r.symbol}><span className="activity-token"><i aria-hidden="true" style={{background:colors[i]}}/>{r.symbol==='Other' ? 'Other' : <Link href={'/markets/'+r.symbol.toLowerCase()+'?token='+encodeURIComponent(r.symbol)}>{r.symbol}</Link>}</span>{showHistory && <span className="activity-track" aria-hidden="true"><span style={{width:`${chosen!.total ? r.value/chosen!.total*100 : 0}%`,background:colors[i]}}/></span>}<span className="activity-token-value"><strong>{compact(r.value)}</strong><span className="activity-token-share">{chosen!.total ? (r.value/chosen!.total*100).toFixed(1) : '0'}%</span></span></li>)}</ol> : <p className="market-history-note">No reliable volume available.</p>}
      </div>
    </div>
    <footer className="activity-footer">{chosen && <span>{chosen.covered}/{chosen.known} {chosen.basis === 'turnover' ? 'tokens' : 'pools'}</span>}<Link href="/data-methodology#activity">Data &amp; methodology ↗</Link></footer>
  </section>;
}


export function ActivityTooltip({id, point, x, symbol, composition=false}: {id: string; point: TradingActivity; x: number; symbol?: string; composition?: boolean}) {
  const rows = activityBreakdown(point);
  const row = symbol ? rows.find(r => r.symbol===symbol) : null;
  const full = (value: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
  return <div id={id} role="tooltip" className="activity-tooltip" style={{left:`clamp(110px, ${x}%, calc(100% - 110px))`}}>
    <span className="activity-tooltip-date">{dateLabel(point.day)} · UTC</span>
    <div className="activity-tooltip-total"><span>{row?.symbol ?? '24h volume'}</span><strong>{full(row?.value ?? point.total)}</strong></div>
    {row && <span className="activity-tooltip-date">{point.total ? (row.value/point.total*100).toFixed(1) : '0'}% of observed volume</span>}
    {composition && <ul>{rows.map((r,i) => <li key={r.symbol}><span><i style={{background:colors[i]}}/>{r.symbol}</span><strong>{full(r.value)}<small>{point.total ? (r.value/point.total*100).toFixed(1) : '0'}%</small></strong></li>)}</ul>}
  </div>;
}

