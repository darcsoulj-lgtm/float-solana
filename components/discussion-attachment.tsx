import Link from '@/components/site-link';
import Image from 'next/image';
import type { DiscussionAttachment as Attachment } from '@/lib/discussion-attachments';
import { BackpackChartCard } from './backpack-chart-card';
import stockLogos from '@/lib/stock-logo-assets.json';
const snapshotTime = (time: number) => new Date(time).toLocaleString('en-US', {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'}) + ' UTC';
const colors=['#cc354b','#647aab','#a77bba','#ba934b','#499787'];
export function DiscussionAttachment({attachment, compact = false, onOpen}:{attachment:Attachment; compact?:boolean; onOpen?:()=>void}) {
  if (compact) {
    const chart = attachment.kind === 'chart' ? attachment.chart : null;
    const last = chart?.points.at(-1);
    const logo = chart ? (stockLogos as Record<string,string>)[chart.symbol] : null;
    const content = chart ? <>
      {logo && <Image src={logo} alt="" width={28} height={28} unoptimized />}
      <span className="attachment-summary-name"><strong>{chart.name}</strong><span>{chart.symbol}</span></span>
      <span className="attachment-summary-value"><strong>{last ? last[1].toLocaleString('en-US',{style:'currency',currency:'USD'}) : '—'}</strong><small>At posting</small></span>
    </> : attachment.kind === 'portfolio' ? <>
      <span className="attachment-summary-name"><strong>Portfolio snapshot</strong><span>{attachment.rows.slice(0,3).map(r=>r.symbol).join(' · ')}{attachment.rows.length > 3 ? ` +${attachment.rows.length-3}` : ''}</span></span>
    </> : null;
    return onOpen ? <button type="button" className="attachment-summary" onClick={onOpen} aria-label={chart ? `Open post with ${chart.name} chart` : 'Open post with portfolio snapshot'}>{content}</button> : <div className="attachment-summary">{content}</div>;
  }
  if(attachment.kind==='chart') return <div className="discussion-attachment discussion-chart-attachment"><BackpackChartCard chart={attachment.chart} period={attachment.period} /></div>;
  const top=attachment.rows.slice(0,4),rest=attachment.rows.slice(4);
  const rows=[...top,...(rest.length?[{symbol:'Other',name:`${rest.length} other holdings`,percent:rest.reduce((s,r)=>s+r.percent,0)}]:[])];
  return <section className="discussion-attachment portfolio-attachment" aria-label="Shared Backpack portfolio snapshot">
    <h4>Portfolio snapshot</h4>
    {attachment.rows.length > 1 && <div className="portfolio-share-bar" aria-hidden="true">{rows.map((r,i)=><span key={r.symbol} style={{width:`${r.percent}%`,background:colors[i]}} />)}</div>}
    {rows.map((r,i)=><div className="portfolio-share-row" key={r.symbol}><span><i style={{background:colors[i]}} />{r.symbol}</span><strong>{r.percent===0?'<0.1':Number.isInteger(r.percent)?String(r.percent):r.percent.toFixed(1)}%</strong></div>)}
    {rest.length > 0 && <details><summary>Show other holdings</summary>{rest.map(r=><p key={r.symbol}>{r.symbol}: {r.percent===0?'<0.1':Number.isInteger(r.percent)?String(r.percent):r.percent.toFixed(1)}%</p>)}</details>}
    <div className="attachment-meta"><time dateTime={new Date(attachment.checkedAt).toISOString()}>Saved {snapshotTime(attachment.checkedAt)}</time><Link href="/data-methodology#attachments" aria-label={`About portfolio snapshots. Earliest price observation ${snapshotTime(attachment.pricesAt)}.`}>About this data</Link></div>
  </section>;
}
