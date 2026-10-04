'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/site-link';
import { ChartNoAxesCombined, ChartPie, MessageCircle, Bookmark, X } from 'lucide-react';
import { BackpackChartCard } from '@/components/backpack-chart-card';
import { DiscussionAttachment } from '@/components/discussion-attachment';
import type { BackpackChart } from '@/lib/backpack-charts';


type Attachment = 'chart' | 'portfolio';
type Post = { id: number; text: string; attachment: Attachment; period: number; chart?: BackpackChart };
const allocation = [
  { symbol: 'MU', name: 'Micron', percent: 50, color: '#cc354b' },
  { symbol: 'NOK', name: 'Nokia', percent: 30, color: '#8c7bac' },
  { symbol: 'SKHY', name: 'SK hynix', percent: 20, color: '#8796a7' },
];


function PortfolioCard() {
  return <><p className="sp-footnote">Example allocation · not your wallet</p><DiscussionAttachment attachment={{kind:'portfolio',version:1,checkedAt:1790748000000,pricesAt:1790747940000,rows:allocation}} /></>;
}

function AttachmentCard({ type, period, chart, error }: { type: Attachment; period: number; chart?: BackpackChart; error?: string }) {
  return type === 'chart' ? <div className="discussion-attachment"><BackpackChartCard chart={chart} period={period} error={error} /></div> : <PortfolioCard />;
}

export function SocialPreview() {
  const [chartChoices, setChartChoices] = useState<{ symbol: string; name: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/preview/chart', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const body = await response.json() as { tokens: { symbol: string; name: string }[] };
      if (!controller.signal.aborted) setChartChoices(body.tokens);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const [symbol, setSymbol] = useState('MU');
  const [loaded, setLoaded] = useState<BackpackChart>();
  const [error, setError] = useState('');
  const chart = loaded?.symbol === symbol ? loaded : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/preview/chart?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal }).then(async response => {
      const body = await response.json() as { chart?: BackpackChart; error?: string };
      if (!response.ok || !body.chart) throw Error(body.error || 'Chart unavailable');
      if (!controller.signal.aborted) setLoaded(body.chart);
    }).catch(() => { if (!controller.signal.aborted) setError('Backpack chart unavailable. Reload to try again.'); });
    return () => controller.abort();
  }, [symbol]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [period, setPeriod] = useState(7);
  const chartReady = !!chart && chart.points.filter(p => p[0] >= chart.windowEnd - period * 86400000).length >= 2;
  const [text, setText] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [notice, setNotice] = useState('');
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const examples: Post[] = [
    { id: -1, text: `Watching ${symbol} this week. What would change your view?`, attachment: 'chart', period: 7, chart },
    { id: -2, text: 'A little more semiconductors, a little less telecom. How are you thinking about concentration?', attachment: 'portfolio', period: 7 },
  ];
  function addPreview() {
    if (!text.trim() || !attachment || (attachment === 'chart' && !chartReady)) return;
    setPosts(current => [{ id: Date.now(), text: text.trim(), attachment, period, chart: attachment === 'chart' ? chart : undefined }, ...current]);
    setText(''); setAttachment(null); setNotice('Added to this preview only. Refreshing clears your draft posts.');
  }
  return <div className="social-preview">
    <div className="sp-preview-note"><span>LOCAL DESIGN PREVIEW</span><Link href="/markets">Back to markets ↗</Link></div>
    <h1>Ideas, with context.</h1>
    <p className="sp-intro">A chart for your thesis. A snapshot of your allocation.</p>
    <p className="sp-disclosure">Example posts and portfolios stay in this preview. Trading, when enabled, uses real tokens and requires your wallet approval.</p>
    <div className="sp-layout"><section className="sp-feed" aria-label="Discussion preview">
      <div className="sp-composer">
        <label htmlFor="sp-text">Try a post</label>
        <textarea id="sp-text" value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="What's your take?" />
        <div className="sp-tools"><button aria-pressed={attachment === 'chart'} onClick={() => setAttachment('chart')}><ChartNoAxesCombined size={18} /> Add chart</button><button aria-pressed={attachment === 'portfolio'} onClick={() => setAttachment('portfolio')}><ChartPie size={18} /> Add snapshot</button></div>
        {attachment && <div className="sp-compose-attachment"><div className="sp-attachment-tools">{attachment === 'chart' ? <div aria-label="Chart period"><select aria-label="Chart stock" value={symbol} onChange={e => { setLoaded(undefined); setError(''); setSymbol(e.target.value); }}>{chartChoices.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}</select>{[1, 7].map(days => <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days}D</button>)}</div> : <span>Percentages only</span>}<button aria-label="Remove attachment" onClick={() => setAttachment(null)}><X size={18} /></button></div><AttachmentCard type={attachment} period={period} chart={chart} error={error} /></div>}
        <div className="sp-compose-footer"><span>Visible only in this tab</span><button className="sp-primary" disabled={!text.trim() || !attachment || (attachment === 'chart' && !chartReady)} onClick={addPreview}>Preview post</button></div>
        <output className="sp-status">{notice}</output>
      </div>
      {[...posts, ...examples].map(post => <article className="sp-post" key={post.id}>
        <div className="sp-author"><span className="sp-avatar">{post.id > 0 ? 'Y' : 'F'}</span><div><strong>{post.id > 0 ? 'You' : 'Float demo'}</strong><span>{post.id > 0 ? 'Local draft' : 'Example post'}</span></div></div>
        <p className="sp-post-text">{post.text}</p><AttachmentCard type={post.attachment} period={post.period} chart={post.chart} error={post.id === -1 ? error : undefined} />
        <div className="sp-actions"><span><MessageCircle size={19} /> 0 replies</span><button aria-label={bookmarks.includes(post.id) ? 'Unsave preview post' : 'Save preview post'} aria-pressed={bookmarks.includes(post.id)} onClick={() => setBookmarks(current => current.includes(post.id) ? current.filter(id => id !== post.id) : [...current, post.id])}><Bookmark size={19} fill={bookmarks.includes(post.id) ? 'currentColor' : 'none'} /></button></div>
      </article>)}
    </section><aside className="sp-aside"><h2>Two optional attachments.</h2><h3>Give an idea context</h3><p>Attach a stock reference chart from Backpack to give your idea context.</p><h3>Share your allocation</h3><p>Show percentages without exposing how much money you hold.</p><hr /><p>Charts show external stock-market prices supplied by Backpack, not token DEX execution prices. Portfolio percentages remain fictional.</p></aside></div>
  </div>;
}
