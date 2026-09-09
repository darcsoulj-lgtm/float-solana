/* eslint-disable next/no-html-link-for-pages -- Sites authentication requires top-level anchor navigation and forbids prefetched sign-in links. */
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Picker } from './workspace';
import { api } from '@/lib/client';
export function Commercial() {
  const [plan, setPlan] = useState('enterprise'),
    [organization, setOrganization] = useState(''),
    [notes, setNotes] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ id: string }>('orders', {
        plan,
        organization,
        notes,
      });
      setDone(r.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return done ? (
    <div className="panel">
      <h2>Your request is saved.</h2>
      <p>
        It is now in the administrator’s commercial queue. This is not a paid
        subscription; no payment was taken and no response date is promised.
      </p>
      <p className="muted">Request reference: {done}</p>
      <Link href="/dashboard">Go to workspace →</Link>
    </div>
  ) : (
    <form className="form" onSubmit={submit}>
      <p className="field-label">Plan</p>
      <Picker
        value={plan}
        onChange={setPlan}
        label="Plan"
        items={[
          { value: 'survey', label: 'Per-survey research' },
          { value: 'enterprise', label: 'Enterprise subscription' },
        ]}
      />
      <label htmlFor="org">Organization</label>
      <input
        id="org"
        required
        minLength={2}
        maxLength={150}
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
      />
      <label htmlFor="needs">Research needs</label>
      <textarea
        id="needs"
        required
        maxLength={1500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Assets, study cadence, sample requirements, and intended use"
      />
      <p className="muted">
        Your signed-in email accompanies the request. A commercial request
        creates no payment obligation.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}{' '}
          <a href="/signin-with-chatgpt?return_to=%2Fenterprise" target="_top">
            Sign in →
          </a>
        </p>
      )}
      <Button disabled={busy} type="submit">
        {busy ? 'Saving…' : 'Request commercial terms →'}
      </Button>
    </form>
  );
}
