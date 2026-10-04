'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import Link from '@/components/site-link';
import { phantomWallet } from '@/lib/wallet-provider';
import type { CommunitySignInInput } from '@/lib/community-sign-in';
import { exceedsBalance, formatBalance } from '@/lib/trading/quantity.mjs';

type Balances = { symbol: string; token: string; usdc: string; sol: string; checkedAt: number };

type Quote = {
  symbol: string;
  side: string;
  input: string;
  output: number;
  unit: string;
  expiresAt: number;
  feeBps: number;
  impact: number;
};
type Order = Quote & {
  id: string;
  state: string;
  wallet: string;
  minimum: number;
  networkFeeSol: number;
  transaction?: string;
  signature: string | null;
  error: string | null;
  actualOutput: number | null;
};
const pending = (o: Order | null) =>
  !!o && ['preparing', 'submitting', 'unknown'].includes(o.state);
const number = (n: number) =>
  n.toLocaleString('en-US', { maximumSignificantDigits: 8 });
async function request<T>(action: string, body: object): Promise<T> {
  const res = await fetch('/api/trade/' + action, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(action === 'execute' ? 65000 : 60000),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw Error(data?.error || 'Unable to continue. Try again.');
  return data;
}
let config: Promise<boolean> | undefined;
export function StockTrade({ symbol }: { symbol: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [open, setOpen] = useState(false),
    [side, setSide] = useState('buy');
  useEffect(() => {
    let live = true;
    config ??= fetch('/api/trade/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (d) =>
          !!d && typeof d === 'object' && 'enabled' in d && d.enabled === true,
      )
      .catch(() => false);
    void config.then((value) => {
      if (live) setEnabled(value);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!enabled) return null;
  return (
    <>
      <div className="stock-trade-actions">
        <button
          type="button"
          onClick={() => {
            setSide('buy');
            setOpen(true);
          }}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => {
            setSide('sell');
            setOpen(true);
          }}
        >
          Sell
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          placement="responsive-sheet"
          className="stock-trade-dialog"
        >
          {open && <TradeTicket symbol={symbol} initialSide={side} recoveryOnly={!enabled} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function PausedTradeRecovery() {
  const [order, setOrder] = useState<Order | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    // One authenticated lookup for the whole page, never one per feed card.
    void request<Order | null>('status', {}).then(value => {
      if (live) setOrder(value);
    }).catch(() => { /* No trading session: no public recovery control. */ });
    return () => { live = false; };
  }, [open]);
  if (!pending(order)) return null;
  return <>
    <aside className="trade-recovery-notice" aria-label="Pending trade">
      <span>You have a pending trade.</span>
      <button type="button" onClick={() => setOpen(true)}>View order</button>
    </aside>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent placement="responsive-sheet" className="stock-trade-dialog">
        {open && order && <TradeTicket symbol={order.symbol} initialSide={order.side} recoveryOnly />}
      </DialogContent>
    </Dialog>
  </>;
}
function TradeTicket({
  symbol,
  initialSide,
  recoveryOnly,
}: {
  symbol: string;
  initialSide: string;
  recoveryOnly: boolean;
}) {
  const [side, setSide] = useState(initialSide),
    [amount, setAmount] = useState(''),
    [quote, setQuote] = useState<Quote | null>(null),
    [order, setOrder] = useState<Order | null>(null);
  const [wallet, setWallet] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [quoteError, setQuoteError] = useState(''),
    [balances, setBalances] = useState<Balances | null>(null),
    [balanceError, setBalanceError] = useState(''),
    [balanceRefresh, setBalanceRefresh] = useState(0),
    [refresh, setRefresh] = useState(0),
    [clock, setClock] = useState(Date.now),
    [autoChecking, setAutoChecking] = useState(false),
    [recovering, setRecovering] = useState(true);
  const adapter = useRef<ReturnType<typeof phantomWallet> | null>(null),
    nextQuote = useRef(0),
    quoteRequest = useRef<Promise<Quote> | null>(null),
    generation = useRef(0),
    operation = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requireOpen = () => {
    if (!mounted.current) throw Error('Trade window closed.');
  };
  const pendingOrderId = order?.id, pendingOrderState = order?.state;
  useEffect(() => {
    if (!pendingOrderId || !pendingOrderState || !['submitting', 'unknown'].includes(pendingOrderState)) return;
    let live = true, attempts = 0;
    const id = pendingOrderId;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!live) return;
      setAutoChecking(true);
      try {
        if (!operation.current) {
          const updated = await request<Order>('status', { id });
          if (live) setOrder(updated);
        }
      } catch { /* Keep the order and manual recovery available after a read failure. */ }
      if (!live) return;
      if (++attempts < 10) timer = setTimeout(() => void poll(), 6000);
      else setAutoChecking(false);
    }
    timer = setTimeout(() => void poll(), 1500);
    return () => { live = false; clearTimeout(timer); };
  }, [pendingOrderId, pendingOrderState]);
  useEffect(() => {
    if (pendingOrderState !== 'confirmed') return;
    const timer = setTimeout(() => setBalanceRefresh(v => v + 1), 0);
    return () => clearTimeout(timer);
  }, [pendingOrderState]);
  const blocked = pending(order),
    locked = !!busy || blocked || recovering;
  const available = balances && (side === 'buy' ? balances.usdc : balances.token);
  const insufficient = available !== null && exceedsBalance(amount, available);
  useEffect(() => {
    if (!wallet || recoveryOnly) return;
    let live = true;
    void request<Balances>('balances', { symbol }).then((value) => {
      if (!live) return;
      setBalances(value);
      setBalanceError('');
    }).catch(() => {
      if (!live) return;
      setBalances(null);
      setBalanceError('Balance unavailable');
    });
    return () => { live = false; };
  }, [wallet, symbol, balanceRefresh, recoveryOnly]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let live = true;
    void request<{ wallet: string }>('session', {})
      .then(async (session) => {
        if (!live) return;
        setWallet(session.wallet);
        const recovered = await request<Order | null>('status', {});
        if (live) setOrder(recovered);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setRecovering(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const id = ++generation.current;
    let cancelled = false;
    if (
      recoveryOnly ||
      order ||
      busy ||
      recovering ||
      (quote && quote.expiresAt > Date.now()) ||
      !/^\d+(\.\d+)?$/.test(amount) ||
      Number(amount) <= 0
    )
      return;
    const timer = setTimeout(
      async () => {
        nextQuote.current = Date.now() + 2700;
        const pendingQuote = request<Quote>('quote', { symbol, side, amount });
        quoteRequest.current = pendingQuote;
        try {
          const q = await pendingQuote;
          if (!cancelled && id === generation.current) {
            setQuote(q);
            setQuoteError('');
          }
        } catch (e) {
          if (!cancelled && id === generation.current)
            setQuoteError(e instanceof Error ? e.message : 'Quote unavailable.');
        } finally {
          // The server reserves its slot after resolving the token. Start the
          // client gap after the response, not before that variable network work.
          nextQuote.current = Date.now() + 2700;
          if (quoteRequest.current === pendingQuote) quoteRequest.current = null;
        }
      },
      Math.max(450, nextQuote.current - Date.now()),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, side, amount, refresh, order, busy, recovering, quote, recoveryOnly]);
  useEffect(() => {
    if (!quote) return;
    const expire = () => {
      if (Date.now() >= quote.expiresAt && !document.hidden) {
        setQuote(null);
        setRefresh((v) => v + 1);
      }
    };
    const timer = setTimeout(expire, Math.max(0, quote.expiresAt - Date.now()));
    document.addEventListener('visibilitychange', expire);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [quote]);
  function edit(value: string) {
    generation.current++;
    setAmount(value);
    setQuote(null);
    setOrder(null);
    setError('');
    setQuoteError('');
  }
  async function connect() {
    const current = phantomWallet();
    adapter.current = current;
    const connected = await current.connect(),
      address = connected.publicKey.toString();
    requireOpen();
    if (order && address !== order.wallet)
      throw Error('Reconnect the wallet used for this order.');
    let signedIn = false;
    try {
      const session = await request<{ wallet: string }>('session', {});
      signedIn = session.wallet === address;
    } catch {
      /* A new message sign-in is needed. */
    }
    requireOpen();
    if (!signedIn) {
      current.requireSignIn();
      const challenge = await request<{ id: string; input: CommunitySignInInput; message: string }>(
        'challenge',
        { wallet: address },
      );
      requireOpen();
      const signature = await current.signIn(
        challenge.input,
        new TextEncoder().encode(challenge.message),
      );
      requireOpen();
      await request('verify', {
        id: challenge.id,
        signature: Array.from(signature),
      });
    }
    requireOpen();
    if (!current.accountUnchanged())
      throw Error('Wallet changed. Connect again.');
    if (wallet !== address) setBalances(null);
    setWallet(address);
    const recovered = await request<Order | null>('status', {});
    requireOpen();
    if (pending(recovered)) {
      setOrder(recovered);
      return null;
    }
    return { current, address };
  }
  async function review() {
    if (
      operation.current ||
      recovering ||
      !quote ||
      quote.expiresAt <= Date.now()
    )
      return;
    operation.current = true;
    setBusy('Checking order…');
    setError('');
    try {
      const connection = await connect();
      if (!connection) return;
      // Share the free-provider pacing with autoquotes instead of immediately
      // colliding with the quote that just enabled Review order.
      await quoteRequest.current?.catch(() => {});
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, nextQuote.current - Date.now())));
      requireOpen();
      const ready = await request<Order>('prepare', { symbol, side, amount });
      if (
        !connection.current.accountUnchanged() ||
        ready.wallet !== connection.address
      )
        throw Error('Wallet changed. Review a fresh order.');
      requireOpen();
      setOrder(ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order unavailable.');
    } finally {
      nextQuote.current = Date.now() + 2700;
      operation.current = false;
      setBusy('');
    }
  }
  async function sign() {
    if (
      operation.current ||
      !order?.transaction ||
      order.state !== 'ready' ||
      order.expiresAt <= Date.now()
    )
      return;
    operation.current = true;
    setBusy('Confirm in Phantom');
    setError('');
    let submitting = false;
    try {
      const current = adapter.current;
      if (!current?.accountUnchanged())
        throw Error('Reconnect Phantom and review your order.');
      const signedTransaction = await current.signTransaction(
        order.transaction,
        order.wallet,
      );
      requireOpen();
      // Once sending begins, ambiguous responses must be recovered, never re-sent.
      submitting = true;
      setBusy('Confirming…');
      setOrder({ ...order, state: 'submitting' });
      setOrder(
        await request<Order>('execute', { id: order.id, signedTransaction }),
      );
    } catch (e) {
      if (submitting)
        setOrder({
          ...order,
          state: 'unknown',
          error: 'Check status before placing another order.',
        });
      setError(e instanceof Error ? e.message : 'Unable to confirm.');
    } finally {
      operation.current = false;
      setBusy('');
    }
  }
  async function reconnect() {
    if (operation.current) return;
    operation.current = true;
    setBusy('Connecting Phantom…');
    setError('');
    try {
      await connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconnect failed.');
    } finally {
      operation.current = false;
      setBusy('');
    }
  }
  async function status() {
    if (operation.current) return;
    operation.current = true;
    setBusy('Checking status…');
    setError('');
    try {
      setOrder(await request<Order | null>('status', { id: order?.id }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Reconnect the same wallet to recover this order.',
      );
    } finally {
      operation.current = false;
      setBusy('');
    }
  }
  const ready = order?.state === 'ready',
    done = order?.state === 'confirmed',
    expired = ready && clock >= order.expiresAt;
  return (
    <>
      <DialogTitle>
        {done
          ? 'Trade confirmed'
          : blocked
            ? order?.state === 'unknown' ? 'Status unconfirmed' : 'Confirming trade'
            : order?.state === 'failed' ? 'Trade not completed'
            : recoveryOnly ? 'Trade status'
            : `${(order?.side || side) === 'buy' ? 'Buy' : 'Sell'} ${order?.symbol || symbol}`}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {recoveryOnly ? 'Check an existing order with the same wallet. New trades are paused.' : `Exchange USDC and ${symbol}. Review the current quote and approve in your own wallet.`}
      </DialogDescription>
      {recoveryOnly && <p className="trade-message">New trades are paused. Connect the same wallet to check an existing order.</p>}
      {!order && !recoveryOnly && (
        <>
          <div className="trade-direction" aria-label="Trade direction">
            {['buy', 'sell'].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={side === value}
                disabled={locked}
                onClick={() => {
                  setSide(value);
                  edit('');
                }}
              >
                {value === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <label
            className="trade-amount-label"
            htmlFor={'trade-amount-' + symbol}
          >
            You pay · {side === 'buy' ? 'USDC' : symbol}
          </label>
          <input
            id={'trade-amount-' + symbol}
            className="trade-amount-input"
            autoComplete="off"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            disabled={locked}
            onChange={(e) => edit(e.target.value)}
          />
          {wallet && (
            <div className="trade-balance">
              {available !== null ? (
                <button
                  type="button"
                  className="trade-balance-fill"
                  disabled={locked || !exceedsBalance(available, '0')}
                  aria-label={`Use full trading balance: ${formatBalance(available)} ${side === 'buy' ? 'USDC' : symbol}`}
                  onClick={() => { if (!locked && exceedsBalance(available, '0')) edit(available); }}
                >
                  <span>Trading balance {formatBalance(available)} {side === 'buy' ? 'USDC' : symbol}</span>
                  <span className="trade-balance-max">Max</span>
                </button>
              ) : <span>{balanceError || 'Checking balance…'}</span>}
              <button type="button" className="trade-data-link" disabled={locked || (!balances && !balanceError)} onClick={() => {
                setBalances(null);
                setBalanceError('');
                setBalanceRefresh((v) => v + 1);
              }}>Refresh balance</button>
            </div>
          )}
          <div className="trade-estimate" aria-live="polite">
            <span>Estimated receive</span>
            <strong>
              {quote ? `${number(quote.output)} ${quote.unit}` : '—'}
            </strong>
          </div>
        </>
      )}
      {order?.state === 'preparing' && (
        <p className="trade-message">
          Another order is being checked for this wallet.
        </p>
      )}
      {order && typeof order.output === 'number' && (
        <div className="trade-review">
          <div>
            <span>You pay</span>
            <strong>
              {order.input} {order.side === 'buy' ? 'USDC' : order.symbol}
            </strong>
          </div>
          <div>
            <span>{done ? 'Received' : 'Estimated receive'}</span>
            <strong>
              {done
                ? order.actualOutput == null
                  ? 'Confirming receipt…'
                  : `${number(order.actualOutput)} ${order.unit}`
                : `${number(order.output)} ${order.unit}`}
            </strong>
          </div>
          {ready && (
            <>
              <div>
                <span>Minimum receive</span>
                <strong>
                  {number(order.minimum)} {order.unit}
                </strong>
              </div>
              <div>
                <span>Trading fee · included</span>
                <strong>{order.feeBps / 100}%</strong>
              </div>
              <div>
                <span>Network + account costs</span>
                <strong>Up to {number(order.networkFeeSol)} SOL</strong>
              </div>
              <div>
                <span>Quote expires</span>
                <strong>
                  {Math.max(0, Math.ceil((order.expiresAt - clock) / 1000))}s
                </strong>
              </div>
            </>
          )}
        </div>
      )}
      {wallet && (
        <p className="trade-wallet">
          Phantom · {wallet.slice(0, 4)}…{wallet.slice(-4)}
        </p>
      )}
      {(error || order?.error || quoteError || insufficient) && (
        <p role="alert" className="trade-message">
          {error || order?.error || (insufficient ? `Not enough ${side === 'buy' ? 'USDC' : symbol} for this amount.` : quoteError)}
        </p>
      )}
      {blocked ? (
        <>
          {autoChecking && <output className="trade-wallet">Checking status automatically…</output>}
          <button
            className="trade-primary"
            disabled={!!busy}
            onClick={() => void status()}
          >
            {busy || 'Check status'}
          </button>
          {error && (
            <button
              className="trade-secondary"
              disabled={!!busy}
              onClick={() => void reconnect()}
            >
              Reconnect Phantom
            </button>
          )}
          {order?.signature && <a className="trade-secondary" href={`https://solscan.io/tx/${order.signature}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}
        </>
      ) : ready && !recoveryOnly ? (
        <>
          <button
            className="trade-primary"
            disabled={!!busy || expired}
            onClick={() => void sign()}
          >
            {busy || (expired ? 'Quote expired' : 'Confirm in Phantom')}
          </button>
          <button
            className="trade-secondary"
            disabled={!!busy}
            onClick={() => {
              setOrder(null);
              setRefresh((v) => v + 1);
            }}
          >
            Update order
          </button>
        </>
      ) : done ? (
        <>
          {order.actualOutput == null && (
            <button
              className="trade-secondary"
              disabled={!!busy}
              onClick={() => void status()}
            >
              {busy || 'Check receipt'}
            </button>
          )}
          <a
            className="trade-secondary"
            href={`https://solscan.io/tx/${order.signature}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction ↗
          </a>
        </>
      ) : recoveryOnly ? (
        <button className="trade-primary" disabled={!!busy || recovering} onClick={() => void (wallet ? status() : reconnect())}>
          {busy || (wallet ? 'Check status' : 'Connect Phantom')}
        </button>
      ) : order ? (
        <button
          className="trade-primary"
          onClick={() => {
            setOrder(null);
            setRefresh((v) => v + 1);
          }}
        >
          Start a new order
        </button>
      ) : (
        <>
          <button
            className="trade-primary"
            disabled={!!busy || !quote || quote.expiresAt <= clock}
            onClick={() => void review()}
          >
            {busy || (wallet ? 'Review order' : 'Connect Phantom')}
          </button>
          {quoteError && (
            <button
              className="trade-secondary"
              disabled={!!busy}
              onClick={() => {
                setQuote(null);
                setQuoteError('');
                setRefresh((v) => v + 1);
              }}
            >
              Refresh quote
            </button>
          )}
        </>
      )}
      {order && !blocked && error && (
        <button
          className="trade-secondary"
          disabled={!!busy}
          onClick={() => void reconnect()}
        >
          Reconnect Phantom
        </button>
      )}
      <div className="trade-footer">
        {!wallet && !order && !recoveryOnly && (
          <button
            className="trade-data-link"
            disabled={!!busy}
            onClick={() => void reconnect()}
          >
            Pending trade?
          </button>
        )}
        <Link className="trade-data-link" href="/data-methodology#trading">
          Trading details
        </Link>
      </div>
    </>
  );
}
