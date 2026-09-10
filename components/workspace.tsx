'use client';
import Link from '@/components/site-link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { api } from '@/lib/client';
import {
  TOKENS,
  type Survey,
  type AnalyticsData,
  type AdminData,
} from '@/lib/tokens';
export function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="w-full bg-white h-11">
        <SelectValue>{items.find((i) => i.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function SurveyCard({
  s,
  workspace = false,
}: {
  s: Survey;
  workspace?: boolean;
}) {
  return (
    <article className="panel">
      <div className="row">
        <span className="badge">{s.symbol}</span>
        <span className="muted">{s.demo ? 'SIMULATED EXAMPLE' : s.status}</span>
      </div>
      <h2>
        <Link href={workspace ? `/dashboard/${s.id}` : `/surveys/${s.id}`}>
          {s.title}
        </Link>
      </h2>
      <p>{s.description}</p>
      <p className="muted">
        {s.questions.length} questions · {s.response_count || 0}{' '}
        {s.demo ? 'simulated' : 'verified'} responses
      </p>
      <Link
        className="textlink"
        href={workspace ? `/dashboard/${s.id}` : `/surveys/${s.id}`}
      >
        {workspace
          ? 'Manage study'
          : s.demo
            ? 'Explore example'
            : 'View research brief'}{' '}
        →
      </Link>
    </article>
  );
}
export function SurveyList({ mine = false }: { mine?: boolean }) {
  const [rows, setRows] = useState<Survey[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<Survey[]>('surveys' + (mine ? '?mine=1' : ''))
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [mine]);
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (!rows) return <output>Loading studies…</output>;
  if (!rows.length)
    return (
      <div className="panel empty">
        <h2>
          {mine
            ? 'Your first research question belongs here.'
            : 'No live studies are accepting responses yet.'}
        </h2>
        <p>
          {mine
            ? 'Create a survey and send it for moderation to start collecting verified responses.'
            : 'Researchers can create a study now. Approved studies appear here.'}
        </p>
        <Link className="cta" href="/dashboard/new">
          Create a survey ↗
        </Link>
      </div>
    );
  return (
    <div className="research-grid">
      {rows.map((s) => (
        <SurveyCard key={s.id} s={s} workspace={mine} />
      ))}
    </div>
  );
}
export function CreateSurvey({ id }: { id?: string }) {
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [symbol, setSymbol] = useState('MU'),
    [target, setTarget] = useState(100),
    [reward, setReward] = useState(0),
    [questions, setQuestions] = useState([
      {
        prompt: '',
        type: 'single',
        options:
          'Increase my position\nMaintain my position\nReduce my position',
      },
    ]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id)
      api<Survey>('surveys/' + id)
        .then((s) => {
          setTitle(s.title);
          setDescription(s.description);
          setSymbol(s.symbol);
          setTarget(s.target);
          setReward(s.reward_cents / 100);
          setQuestions(
            s.questions.map((q) => ({
              ...q,
              options: q.options.join('\n'),
            })),
          );
        })
        .catch((e) => setError(e.message));
  }, [id]);
  function update(i: number, key: string, v: string) {
    setQuestions((q) => q.map((x, j) => (j === i ? { ...x, [key]: v } : x)));
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ id: string }>(
        id ? `surveys/${id}/edit` : 'surveys',
        {
          title,
          description,
          symbol,
          target,
          rewardCents: Math.round(reward * 100),
          questions: questions.map((q) => ({
            ...q,
            options: q.options
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          })),
        },
      );
      location.href = '/dashboard/' + r.id;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <label htmlFor="title">Study title</label>
      <input
        id="title"
        required
        minLength={8}
        maxLength={160}
        placeholder="What would change MU holders’ investment thesis?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label htmlFor="brief">Research brief</label>
      <textarea
        id="brief"
        required
        minLength={20}
        maxLength={1800}
        placeholder="Explain your research objective, who is conducting it, and how answers will be used."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <p className="field-label">Target stock token</p>
      <Picker
        value={symbol}
        onChange={setSymbol}
        label="Target stock token"
        items={TOKENS.filter((t) => t.mint).map((t) => ({
          value: t.symbol,
          label: t.symbol + ' — ' + t.name,
        }))}
      />
      <p className="muted">
        SPCX awaits official mint validation. All live eligibility checks use
        Solana mainnet.
      </p>
      <div className="research-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label htmlFor="target">Response target</label>
          <input
            id="target"
            type="number"
            min={5}
            max={1000}
            required
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="reward">Planned USDC / response</label>
          <input
            id="reward"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
          />
        </div>
      </div>
      <p className="notice">
        Rewards are planning amounts only. Funding and payouts are not enabled;
        participants will see “unfunded.” No payment is collected when creating
        a draft.
      </p>
      {questions.map((q, i) => (
        <fieldset className="panel" key={i}>
          <legend>Question {i + 1}</legend>
          <label htmlFor={'q' + i}>Question</label>
          <input
            id={'q' + i}
            required
            minLength={5}
            maxLength={500}
            value={q.prompt}
            onChange={(e) => update(i, 'prompt', e.target.value)}
          />
          <p className="field-label">Answer format</p>
          <Picker
            value={q.type}
            onChange={(v) => update(i, 'type', v)}
            label={'Question ' + (i + 1) + ' answer format'}
            items={[
              { value: 'single', label: 'Single choice' },
              { value: 'text', label: 'Open text' },
            ]}
          />
          {q.type === 'single' && (
            <>
              <label htmlFor={'options' + i}>
                Options · one per line, 2–8 options
              </label>
              <textarea
                id={'options' + i}
                value={q.options}
                onChange={(e) => update(i, 'options', e.target.value)}
                required
              />
            </>
          )}
          {questions.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
            >
              Remove question
            </Button>
          )}
        </fieldset>
      ))}
      {questions.length < 10 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setQuestions((q) => [
              ...q,
              { prompt: '', type: 'single', options: '' },
            ])
          }
        >
          + Add question
        </Button>
      )}
      <p className="muted">
        Drafts are private. Publication requires administrator review. Do not
        request sensitive personal information or material nonpublic
        information.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving draft…' : 'Save research draft →'}
      </Button>
    </form>
  );
}
export function Analytics({ id }: { id: string }) {
  const [d, setD] = useState<AnalyticsData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setD(await api<AnalyticsData>(`surveys/${id}/analytics`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    api<AnalyticsData>(`surveys/${id}/analytics`)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [id]);
  async function status(value: string) {
    setBusy(true);
    setError('');
    try {
      await api(`surveys/${id}/status`, { status: value });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  function download() {
    const blob = new Blob([JSON.stringify(d, null, 2)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `holderpulse-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!d)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Loading research results…'}
      </p>
    );
  const s = d.survey;
  return (
    <>
      <div className="row">
        <span className="badge">
          {s.symbol} · {s.demo ? 'SIMULATED EXAMPLE' : s.status}
        </span>
        <Button variant="outline" onClick={download}>
          Export research JSON ↓
        </Button>
      </div>
      <h1>{s.title}</h1>
      <p>{s.description}</p>
      {s.demo ? (
        <div className="notice">
          All figures in this example are simulated. No real holder research is
          represented.
        </div>
      ) : (
        <div className="row">
          <p className="muted">
            {s.status === 'active'
              ? `Share the participant link: ${location.origin}/surveys/${id}`
              : 'Publication is moderated. Drafts cannot accept responses.'}
          </p>
          <div className="actions">
            {s.status === 'draft' && (
              <Link className="textlink" href={'/dashboard/' + id + '/edit'}>
                Edit draft →
              </Link>
            )}
            {s.status === 'draft' && (
              <Button disabled={busy} onClick={() => status('pending')}>
                Submit for review
              </Button>
            )}
            {s.status === 'active' && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => status('paused')}
              >
                Pause responses
              </Button>
            )}
            {!['closed'].includes(s.status) && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => status('closed')}
              >
                Close study
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="stats">
        <div className="stat">
          <strong>{d.count}</strong>
          <span>{s.demo ? 'Simulated responses' : 'Verified responses'}</span>
        </div>
        <div className="stat">
          <strong>{s.target}</strong>
          <span>Response target</span>
        </div>
        <div className="stat">
          <strong>{s.questions.length}</strong>
          <span>Research questions</span>
        </div>
      </div>
      {d.questions.map((q) => (
        <section className="panel" key={q.id}>
          <p className="eyebrow">
            {q.id.toUpperCase()} / RESPONSE DISTRIBUTION
          </p>
          <h2>{q.prompt}</h2>
          {q.type === 'single' ? (
            q.distribution.map((x) => (
              <div key={x.option} style={{ margin: '20px 0' }}>
                <div className="row">
                  <span>{x.option}</span>
                  <span className="muted">
                    {x.count} ·{' '}
                    {d.count ? Math.round((x.count / d.count) * 100) : 0}%
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: (d.count ? (x.count / d.count) * 100 : 0) + '%',
                    }}
                  />
                </div>
              </div>
            ))
          ) : q.textResponses.length ? (
            q.textResponses.map((x: string, i: number) => (
              <p key={i} className="notice">
                {x}
              </p>
            ))
          ) : (
            <p>No responses yet.</p>
          )}
        </section>
      ))}
      <div className="research-grid">
        <section className="panel">
          <h3>Position-size cohorts</h3>
          {d.cohortsSuppressed ? (
            <p className="muted">
              Available once at least 5 responses are collected.
            </p>
          ) : (
            d.cohorts.map((c) => (
              <p className="row" key={c.label}>
                <span>{c.label}</span>
                <b>{c.count}</b>
              </p>
            ))
          )}
        </section>
        <section className="panel">
          <h3>Holding duration</h3>
          <span className="badge">Unavailable</span>
          <p className="muted">
            Requires validated historical ownership data. Current balance cannot
            establish duration.
          </p>
        </section>
        <section className="panel">
          <h3>New-buyer cohort</h3>
          <span className="badge">Unavailable</span>
          <p className="muted">
            A transfer does not necessarily mean a purchase. No buyer history is
            inferred.
          </p>
        </section>
      </div>
      <div className="notice">
        One response per wallet per survey. Multiple wallets can belong to one
        person. Results represent participating token holders, not all
        shareholders. Position cohorts use raw token units and may be affected
        by token extensions or corporate actions.{' '}
        <Link href="/methodology">Methodology →</Link>
      </div>
      {!s.demo && (
        <p className="muted">
          Latest verification:{' '}
          {d.latestVerifiedAt
            ? new Date(d.latestVerifiedAt).toLocaleString()
            : 'No verified responses yet'}
          . Planned reward: {(s.reward_cents / 100).toFixed(2)} USDC · unfunded.
        </p>
      )}
    </>
  );
}
export function Admin() {
  const [d, setD] = useState<AdminData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setD(await api<AdminData>('admin'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    api<AdminData>('admin')
      .then(setD)
      .catch((e) => setError(e.message));
  }, []);
  async function act(path: string, b: unknown) {
    setBusy(true);
    try {
      await api(path, b);
      await load();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!d ? (
        <p>Administrator access is checked on the server.</p>
      ) : (
        <>
          <div className="row">
            <h2>Survey moderation</h2>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => act('admin/seed', {})}
            >
              Add labeled example studies
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Study</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.surveys.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={'/dashboard/' + s.id}>{s.title}</Link>
                    <div className="muted">
                      {s.symbol}
                      {s.demo ? ' · simulated' : ''}
                    </div>
                  </TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell>
                    {!s.demo && (
                      <div className="actions">
                        {s.status === 'pending' && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                act(`surveys/${s.id}/status`, {
                                  status: 'active',
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={busy}
                              variant="outline"
                              onClick={() =>
                                act(`surveys/${s.id}/status`, {
                                  status: 'rejected',
                                })
                              }
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {s.status === 'active' && (
                          <Button
                            disabled={busy}
                            variant="outline"
                            onClick={() =>
                              act(`surveys/${s.id}/status`, {
                                status: 'paused',
                              })
                            }
                          >
                            Pause
                          </Button>
                        )}
                        {s.status === 'paused' && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              act(`surveys/${s.id}/status`, {
                                status: 'active',
                              })
                            }
                          >
                            Resume
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <h2>Commercial requests</h2>
          {d.orders.length ? (
            d.orders.map((o) => (
              <div className="panel" key={o.id}>
                <div className="row">
                  <h3>
                    {o.organization} · {o.plan}
                  </h3>
                  <span className="badge">{o.status}</span>
                </div>
                <p>{o.email}</p>
                <p>{o.notes}</p>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    act('admin/orders', {
                      id: o.id,
                      status: o.status === 'requested' ? 'contacted' : 'closed',
                    })
                  }
                >
                  {o.status === 'requested'
                    ? 'Mark contacted'
                    : 'Close request'}
                </Button>
              </div>
            ))
          ) : (
            <p>No requests yet.</p>
          )}
          <h2>Moderation audit</h2>
          {d.audit.map((a, i) => (
            <p className="muted" key={i}>
              {new Date(a.created_at).toLocaleString()} · {a.action} ·{' '}
              {a.target}
            </p>
          ))}
        </>
      )}
    </>
  );
}
