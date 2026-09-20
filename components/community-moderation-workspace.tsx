'use client';
import { useEffect, useState } from 'react';
import Link from './site-link';
import { FloatLogo } from './float-logo';
import { WalletList } from './wallet-list';
import { CommunityAdmin } from './community-admin';
import { selectedWallet, walletLabel } from '@/lib/wallet-provider';
import { api } from '@/lib/client';

export function CommunityModerationWorkspace() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState<'moderation' | 'members' | 'sources'>('moderation');
  useEffect(() => {
    api<{ admin: boolean }>('community/admin-auth/status')
      .then((result) => setAdmin(result.admin))
      .catch((e) => setError(e.message));
  }, []);

  async function connect(name: string) {
    setBusy(true);
    setSelected(name);
    setError('');
    try {
      const wallet = selectedWallet(name);
      const connection = await wallet.connect();
      const challenge = await api<{ id: string; message: string }>('community/admin-auth/challenge', {
        wallet: connection.publicKey.toString(),
      });
      if (!wallet.accountUnchanged()) throw new Error('Your wallet account changed. Connect again.');
      const signature = Array.from(await wallet.signMessage(new TextEncoder().encode(challenge.message)));
      if (!wallet.accountUnchanged()) throw new Error('Your wallet account changed. Connect again.');
      await api('community/admin-auth/verify', { challengeId: challenge.id, signature });
      setAdmin(true);
    } catch (e) {
      setError(`${walletLabel(name)}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api('community/admin-auth/logout', {});
      setAdmin(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="page">
    <header className="operations-header">
      <Link href="/" className="operations-brand"><FloatLogo admin /></Link>
      <Link href="/?view=home">View community →</Link>
    </header>
    <p className="eyebrow">COMMUNITY MODERATION</p>
    <h1>Review reports</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {admin === null ? <p>Checking administrator access…</p> : admin ? <>
      <nav aria-label="Moderation sections" className="filter-row">
        {(['moderation', 'members', 'sources'] as const).map((item) =>
          <button key={item} type="button" aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item === 'moderation' ? 'Reports' : item === 'members' ? 'Members' : 'Sources'}</button>)}
        <button type="button" disabled={busy} onClick={() => void logout()}>Sign out</button>
      </nav>
      <CommunityAdmin key={section} section={section} />
    </> : <section className="panel">
      <p>Connect the Solana wallet approved for Float moderation. This does not require token holdings.</p>
      <WalletList disabled={busy} selected={selected} onConnect={(name) => void connect(name)} />
    </section>}
  </main>;
}
