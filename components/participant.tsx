'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { api } from '@/lib/client';
import { Analytics, Picker } from './workspace';
import { TOKENS, type Survey, type ResponseReceipt } from '@/lib/tokens';
import { selectedWallet, type WalletWindow } from '@/lib/wallet-provider';
export function Participant({ id }: { id: string }) {
  const [s, setS] = useState<Survey | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [proof, setProof] = useState(''),
    [wallet, setWallet] = useState(''),
    [provider, setProvider] = useState('backpack'),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [consent, setConsent] = useState(false),
    [result, setResult] = useState<ResponseReceipt | null>(null),
    [stage, setStage] = useState('');
  useEffect(() => {
    api<Survey>('surveys/' + id)
      .then(setS)
      .catch((e) => setError(e.message));
  }, [id]);
  async function connect() {
    setBusy(true);
    setError('');
    setProof('');
    try {
      const p = selectedWallet(provider, window as unknown as WalletWindow);
      setStage('Connect your wallet…');
      const c = await p.connect(),
        address = (c?.publicKey || p.publicKey)?.toString();
      if (!address)
        throw new Error('The wallet did not return a public address.');
      setWallet(address);
      const challenge = await api<{ id: string; message: string }>(
        `surveys/${id}/challenge`,
        {
          wallet: address,
        },
      );
      setStage('Sign the ownership message in your wallet…');
      const signed = await p.signMessage(
          new TextEncoder().encode(challenge.message),
          'utf8',
        ),
        sig = signed instanceof Uint8Array ? signed : signed.signature;
      setStage('Checking your holding on Solana…');
      const r = await api<{ proof: string }>(`surveys/${id}/verify`, {
        challengeId: challenge.id,
        signature: Array.from(sig),
      });
      setProof(r.proof);
      setStage('Holding verified. Complete your response within 10 minutes.');
    } catch (e) {
      setError((e as Error).message);
      setStage('');
    }
    setBusy(false);
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(
        await api<ResponseReceipt>(`surveys/${id}/respond`, {
          proof,
          answers,
          consent,
        }),
      );
      setProof('');
      setWallet('');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  if (!s)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Loading research brief…'}
      </p>
    );
  if (s.demo) return <Analytics id={id} />;
  const token = TOKENS.find((t) => t.symbol === s.symbol);
  return (
    <>
      <span className="badge">
        {s.symbol} · {s.status}
      </span>
      <h1>{s.title}</h1>
      <p className="lede">{s.description}</p>
      <div className="stats">
        <div className="stat">
          <strong>{s.questions.length}</strong>
          <span>Questions</span>
        </div>
        <div className="stat">
          <strong>
            {s.response_count}/{s.target}
          </strong>
          <span>Verified responses</span>
        </div>
        <div className="stat">
          <strong>
            {s.reward_cents ? (s.reward_cents / 100).toFixed(2) : '—'}
          </strong>
          <span>
            {s.reward_cents ? 'Planned USDC · unfunded' : 'No reward offered'}
          </span>
        </div>
      </div>
      <div className="notice">
        Eligibility: a positive balance of the approved {s.symbol} token in a
        Solana wallet you control. Wallet signing costs no gas and authorizes no
        transfer. Exact balances and wallet addresses are excluded from
        researcher results. <Link href="/trust">Privacy details →</Link>
      </div>
      {result ? (
        <section className="panel">
          <span className="badge">RESPONSE SAVED</span>
          <h2>Thank you for contributing.</h2>
          <p>Your response was stored after a fresh ownership check.</p>
          <p className="muted">Receipt: {result.id}</p>
          {result.rewardCents > 0 && (
            <>
              <p>
                Reward status: unfunded. No USDC is currently available to
                claim.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api(`surveys/${id}/claim`, { responseId: result.id });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Check reward availability
              </Button>
            </>
          )}
          <p>
            <Link href="/surveys">Explore other studies →</Link>
          </p>
        </section>
      ) : (
        <>
          <section className="panel form">
            <p className="eyebrow">01 / VERIFY ELIGIBILITY</p>
            <Picker
              value={provider}
              onChange={(v) => {
                setProvider(v);
                setProof('');
                setWallet('');
              }}
              label="Solana wallet"
              items={[
                { value: 'backpack', label: 'Backpack' },
                { value: 'phantom', label: 'Phantom' },
                { value: 'solflare', label: 'Solflare' },
              ]}
            />
            <Button
              disabled={
                busy ||
                !!proof ||
                s.status !== 'active' ||
                s.response_count >= s.target
              }
              onClick={connect}
            >
              {busy && !proof
                ? 'Checking…'
                : proof
                  ? '✓ Holding verified'
                  : 'Connect wallet & verify'}
            </Button>
            <output className="muted">{stage}</output>
            {wallet && (
              <p className="muted">
                Connected: {wallet.slice(0, 6)}…{wallet.slice(-6)}
              </p>
            )}
            <p className="muted">
              Mint: <code>{token?.mint}</code>
            </p>
          </section>
          <form className="form" onSubmit={submit}>
            <p className="eyebrow">02 / SHARE YOUR PERSPECTIVE</p>
            {s.questions.map((q, i) => (
              <fieldset className="panel" key={q.id} disabled={!proof || busy}>
                <legend>
                  {i + 1}. {q.prompt}
                </legend>
                {q.type === 'single' ? (
                  <RadioGroup
                    aria-label={q.prompt}
                    value={answers[q.id] || ''}
                    onValueChange={(v) =>
                      setAnswers((a) => ({ ...a, [q.id]: v as string }))
                    }
                  >
                    {q.options.map((o, j) => (
                      <label
                        className="choice"
                        htmlFor={q.id + '-' + j}
                        key={o}
                      >
                        <RadioGroupItem id={q.id + '-' + j} value={o} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </RadioGroup>
                ) : (
                  <textarea
                    aria-label={q.prompt}
                    required
                    maxLength={500}
                    value={answers[q.id] || ''}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                    }
                  />
                )}
              </fieldset>
            ))}
            <label className="choice" htmlFor="research-consent">
              <Checkbox
                id="research-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                disabled={!proof}
              />
              <span>
                I consent to the use of my answers and coarse position cohort
                for this study under the{' '}
                <Link href="/trust">privacy notice</Link>. I will not disclose
                personal or material nonpublic information. I understand any
                planned reward is unfunded.
              </span>
            </label>
            <Button type="submit" disabled={!proof || !consent || busy}>
              {busy ? 'Verifying & saving…' : 'Submit verified response →'}
            </Button>
          </form>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
