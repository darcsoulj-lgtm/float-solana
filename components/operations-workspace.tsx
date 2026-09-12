'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Activity,
  Newspaper,
  CalendarDays,
  ShieldCheck,
  Users,
  Plus,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import Link from './site-link';
import { Button } from './ui/button';
import { EditorialEditor } from './editorial-editor';
import { CommunityAdmin } from './community-admin';
import { api } from '@/lib/client';
import {
  eventLabel,
  type EditorialItem,
  type OperationsData,
} from '@/lib/editorial';

async function fetchOperations() {
  await api('editorial/initialize', {});
  return api<OperationsData>('editorial/operations');
}
export function OperationsWorkspace() {
  const [data, setData] = useState<OperationsData | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [importing, setImporting] = useState(false);
  const [tab, setTab] = useState('overview'),
    [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{
      kind: 'news' | 'event';
      item?: EditorialItem;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await fetchOperations());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    fetchOperations()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const items = (data?.items || []).filter(
    (i) =>
      (filter === 'all' || i.status === filter) &&
      (i.title + ' ' + i.publisher + ' ' + i.symbols.join(' '))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="operations-page">
      <header className="operations-header">
        <Link href="/" className="operations-brand">
          <b aria-hidden="true">F</b>
          <span>
            Float <small>ADMIN</small>
          </span>
        </Link>
        <Link className="operations-return" href="/">
          View community <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="operations-title">
        <div>
          <p className="eyebrow">THE EDITOR’S DESK</p>
          <h1>Keep it worth coming back to.</h1>
          <p>Publish useful context. Keep the conversation healthy.</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={16} />
          {busy ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      {notice && <output className="operations-notice">{notice}</output>}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(String(v))}
        className="operations-tabs"
      >
        <TabsList variant="line" aria-label="Admin workspace">
          <TabsTrigger value="overview">
            <Activity size={17} />
            Overview
          </TabsTrigger>
          <TabsTrigger value="editorial">
            <Newspaper size={17} />
            Publishing
          </TabsTrigger>
          <TabsTrigger value="moderation">
            <ShieldCheck size={17} />
            Moderation{data?.counts.reports ? ` (${data.counts.reports})` : ''}
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users size={17} />
            Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {!data ? (
            <p className="operations-loading">
              {error ? 'Admin access is required.' : 'Opening your workspace…'}
            </p>
          ) : (
            <>
              <div className="operations-metrics">
                {[
                  ['Members · not suspended', data.counts.members],
                  ['Discussions', data.counts.posts],
                  ['Open reports', data.counts.reports],
                  ['Editorial drafts', data.counts.drafts],
                ].map(([label, count]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
              <div className="operations-grid">
                <section className="operations-panel">
                  <div className="operations-section-heading">
                    <h2>Ready for a little context?</h2>
                    <FileText size={21} />
                  </div>
                  <p>
                    A short, sourced update can start a better conversation.
                  </p>
                  <div className="operations-quick-actions">
                    <button onClick={() => setEditing({ kind: 'news' })}>
                      <Newspaper />
                      <strong>Write a story</strong>
                      <span>Summarize a source and tag its stocks.</span>
                      <ArrowUpRight size={17} />
                    </button>
                    <button onClick={() => setEditing({ kind: 'event' })}>
                      <CalendarDays />
                      <strong>Add a date</strong>
                      <span>Earnings, calls, and company events.</span>
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div
                    className={`editorial-freshness ${!data.lastReviewed || data.sampledAt - data.lastReviewed > 72 * 3600000 ? 'needs-review' : ''}`}
                  >
                    <span className="small-dot" />
                    <div>
                      <strong>
                        {!data.lastReviewed
                          ? 'No published coverage'
                          : data.sampledAt - data.lastReviewed > 72 * 3600000
                            ? 'Coverage needs a review'
                            : 'Updated within the last 72 hours'}
                      </strong>
                      <p>
                        {data.lastReviewed
                          ? `Last published update ${new Date(data.lastReviewed).toLocaleString()}. Review at least every 72 hours.`
                          : 'Publish the first reviewed story to begin.'}
                      </p>
                    </div>
                  </div>
                  <p className="editorial-help">
                    This is a curated feed. No automatic newswire is connected.
                  </p>
                </section>
                <section className="operations-panel">
                  <div className="operations-section-heading">
                    <h2>Service signals</h2>
                    <Activity size={20} />
                  </div>
                  <p>
                    Server requests during the last 24 hours, rounded to the
                    hour.
                  </p>
                  {['verify', 'post'].map((op) => {
                    const count = (outcome: string) =>
                      data.operations.find(
                        (o) => o.operation === op && o.outcome === outcome,
                      )?.count || 0;
                    const total =
                      count('success') + count('rejected') + count('error');
                    return (
                      <div className="operation-signal" key={op}>
                        <strong>
                          {op === 'verify'
                            ? 'Membership verification'
                            : 'Discussion posting'}
                        </strong>
                        {!total ? (
                          <p>No requests recorded yet.</p>
                        ) : (
                          <div>
                            <span>
                              <b>{count('success')}</b> Completed
                            </span>
                            <span>
                              <b>{count('rejected')}</b> Rejected
                            </span>
                            <span
                              className={count('error') ? 'signal-error' : ''}
                            >
                              <b>{count('error')}</b> Server errors
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="editorial-help">
                    Rejected requests include validation and eligibility checks.
                    Wallet popups and browser failures are not measured here.
                  </p>
                </section>
              </div>
              <section className="operations-panel operations-audit">
                <h2>Recent activity</h2>
                {data.audit.length ? (
                  data.audit.map((a, i) => (
                    <div key={a.created_at + '-' + i}>
                      <span>
                        {a.action
                          .replace('editorial:', 'Content · ')
                          .replace('community:', 'Community · ')}
                      </span>
                      <time>{new Date(a.created_at).toLocaleString()}</time>
                    </div>
                  ))
                ) : (
                  <p>Admin actions will appear here.</p>
                )}
              </section>
            </>
          )}
        </TabsContent>
        <TabsContent value="editorial">
          <section className="operations-panel news-provider-panel">
            <div>
              <h2>
                Benzinga news{' '}
                <small>
                  {data?.newsProvider?.configured
                    ? 'Key configured'
                    : 'Not connected'}
                </small>
              </h2>
              <p>
                Import recent Micron headlines with original article links.
                Review relevance and attribution before publishing. Other stocks
                need a reviewed provider mapping.
              </p>
              <a
                href="https://www.benzinga.com/apis/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Licensed news API access ↗
              </a>
              {!data?.newsProvider?.configured && (
                <p className="editorial-help">
                  A licensed Benzinga API key is required. Your published feed
                  remains manually curated.
                </p>
              )}
            </div>
            <Button
              disabled={importing || !data?.newsProvider?.configured}
              onClick={async () => {
                setImporting(true);
                setError('');
                setNotice('');
                try {
                  const result = await api<{
                    imported: number;
                    skipped: number;
                  }>('editorial/import-news', { symbol: 'MU' });
                  setNotice(
                    `${result.imported} new drafts imported. ${result.skipped} existing stories left unchanged.`,
                  );
                  setData(await fetchOperations());
                  setFilter('draft');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? 'Importing…' : 'Import MU drafts'}
            </Button>
          </section>
          <div className="operations-section-heading">
            <div>
              <h2>Content library</h2>
              <p>
                Draft, review, publish. One source can belong to several stocks.
              </p>
            </div>
            <div className="operations-create">
              <Button
                variant="outline"
                onClick={() => setEditing({ kind: 'event' })}
              >
                <CalendarDays size={16} />
                Add event
              </Button>
              <Button onClick={() => setEditing({ kind: 'news' })}>
                <Plus size={16} />
                New story
              </Button>
            </div>
          </div>
          <div className="operations-filters">
            <input
              type="search"
              aria-label="Search content library"
              placeholder="Find a story, publisher, or stock"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
              <TabsList aria-label="Publication status">
                {['all', 'draft', 'published', 'archived'].map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="editorial-library">
            {items.map((item) => (
              <article key={item.id}>
                <div className="editorial-kind">
                  {item.kind === 'news' ? (
                    <Newspaper size={20} />
                  ) : (
                    <CalendarDays size={20} />
                  )}
                </div>
                <div>
                  <div className="brief-meta">
                    <span className={`publication-status ${item.status}`}>
                      {item.status}
                    </span>
                    <span>{item.symbols.join(' · ')}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.kind === 'event' ? eventLabel(item) : item.publisher}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setEditing({ kind: item.kind, item })}
                >
                  Edit
                </Button>
              </article>
            ))}
            {!items.length && (
              <div className="brief-empty">
                <FileText size={25} />
                <h3>
                  {data ? 'No items match this view.' : 'Loading your library…'}
                </h3>
              </div>
            )}
          </div>
          <details className="reference-library">
            <summary>Manage reference links</summary>
            <CommunityAdmin section="sources" />
          </details>
        </TabsContent>
        <TabsContent value="moderation">
          <CommunityAdmin section="moderation" />
        </TabsContent>
        <TabsContent value="members">
          <CommunityAdmin section="members" />
        </TabsContent>
      </Tabs>
      <footer className="operations-footer">
        <span>Float · Community operations</span>
        <Link href="/admin/research">
          Research administration <ArrowUpRight size={14} />
        </Link>
      </footer>
      {editing && (
        <EditorialEditor
          key={editing.item?.id || editing.kind}
          {...editing}
          onClose={() => setEditing(null)}
          onSaved={(status) => {
            setEditing(null);
            setNotice(
              status === 'draft'
                ? 'Draft saved. Only administrators can see it.'
                : status === 'archived'
                  ? 'Item archived and hidden from member feeds.'
                  : 'Published. This update is now available to members.',
            );
            void load();
          }}
        />
      )}
    </div>
  );
}
