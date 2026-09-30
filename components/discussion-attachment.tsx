import type { DiscussionAttachment as Attachment } from '@/lib/discussion-attachments';
import { BackpackChartCard } from './backpack-chart-card';
const colors=['#cc354b','#647aab','#a77bba','#ba934b','#499787'];
export function DiscussionAttachment({attachment}:{attachment:Attachment}) {
  if(attachment.kind==='chart') return <div className="discussion-attachment discussion-chart-attachment"><BackpackChartCard chart={attachment.chart} period={attachment.period} /></div>;
  const top=attachment.rows.slice(0,4),rest=attachment.rows.slice(4);
  const rows=[...top,...(rest.length?[{symbol:'Other',name:`${rest.length} other holdings`,percent:rest.reduce((s,r)=>s+r.percent,0)}]:[])];
  return <section className="discussion-attachment portfolio-attachment" aria-label="Shared Backpack portfolio snapshot">
    <h4>Portfolio snapshot</h4><p className="attachment-caption">Backpack holdings in one verified wallet · estimated allocation</p>
    <div className="portfolio-share-bar" aria-hidden="true">{rows.map((r,i)=><span key={r.symbol} style={{width:`${r.percent}%`,background:colors[i]}} />)}</div>
    {rows.map((r,i)=><div className="portfolio-share-row" key={r.symbol}><span><i style={{background:colors[i]}} />{r.symbol}</span><strong>{r.percent===0?'<0.1':r.percent.toFixed(1)}%</strong></div>)}
    <details><summary>Snapshot details</summary><p>Only Backpack tokens in the connected wallet are included. Other assets and wallets are excluded. Percentages are estimates, frozen when prepared; they are not returns.</p><p>Holdings checked {new Date(attachment.checkedAt).toLocaleString()}. Earliest price observation {new Date(attachment.pricesAt).toLocaleString()}.</p>{rest.map(r=><p key={r.symbol}>{r.symbol}: {r.percent===0?'<0.1':r.percent.toFixed(1)}%</p>)}</details>
  </section>;
}
