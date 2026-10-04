import {
  validateOrderTransaction,
  validateSignedTransaction,
  TradePolicyError,
} from './policy.mjs';
import { executionRequest, executionResponse, executionOutcome } from './execution.mjs';
export class TradeError extends Error {}
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pending = (state) => ['submitting', 'unknown'].includes(state);
export function amountRaw(value, decimals) {
  if (typeof value !== 'string' || !/^\d{1,9}(\.\d+)?$/.test(value))
    throw new TradeError('Enter a positive amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals)
    throw new TradeError('Too many decimal places.');
  const raw =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (raw <= 0n || raw > 10n ** 18n)
    throw new TradeError('Amount is outside the supported range.');
  return raw.toString();
}
export function createTradeService({
  store,
  resolveToken,
  rpc,
  fetcher = fetch,
  validate = validateOrderTransaction,
  validateSigned = validateSignedTransaction,
  now = Date.now,
  providerSlot = async () => {},
}) {
  async function checkHeight(lastValid) {
    const height = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]);
    if (!Number.isSafeInteger(height) || height <= 0)
      throw new TradeError('Network validity check unavailable.');
    if (height > lastValid)
      throw new TradeError('Order expired. Request a fresh quote.');
  }
  function publicOrder(row) {
    if (!row) return null;
    const o = row.payload;
    return {
      id: row.id,
      state: row.state,
      symbol: o.symbol,
      side: o.side,
      wallet: o.wallet,
      input: o.amount,
      output: o.output,
      unit: o.unit,
      minimum: o.minimum,
      feeBps: o.feeBps,
      networkFeeSol: o.networkFeeSol,
      impact: o.impact,
      expiresAt: row.expiresAt,
      signature: row.signature,
      error: o.error || null,
      actualOutput: o.actualOutput ?? null,
      ...(row.state === 'ready' && row.expiresAt > now()
        ? { transaction: o.transaction }
        : {}),
    };
  }
  async function owned(id, session) {
    const row = await store.get(id, session.walletKey);
    if (!row) throw new TradeError('Order not found.');
    return row;
  }
  async function quote(body) {
    if (!['buy', 'sell'].includes(body.side))
      throw new TradeError('Choose Buy or Sell.');
    const token = await resolveToken(body.symbol),
      buy = body.side === 'buy';
    const inputMint = buy ? USDC : token.mint,
      outputMint = buy ? token.mint : USDC,
      raw = amountRaw(body.amount, buy ? 6 : token.decimals);
    await providerSlot();
    const started = now();
    const query = new URLSearchParams({
      inputMint,
      outputMint,
      amount: raw,
      excludeRouters: 'jupiterz,dflow,okx',
    });
    const res = await fetcher('https://api.jup.ag/swap/v2/order?' + query, {
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
      cache: 'no-store',
    });
    if (!res.ok)
      throw new TradeError(
        res.status === 429
          ? 'Quotes are busy. Please try again shortly.'
          : 'No quote available at this amount.',
      );
    const d = await res.json();
    if (
      d.transaction !== null ||
      d.taker != null ||
      d.inputMint !== inputMint ||
      d.outputMint !== outputMint ||
      d.inAmount !== raw ||
      !/^\d+$/.test(d.outAmount) ||
      BigInt(d.outAmount) <= 0n ||
      !Array.isArray(d.routePlan) ||
      !d.routePlan.length ||
      d.router !== 'metis'
    )
      throw new TradeError('Quote could not be verified.');
    if (
      d.priceImpact == null ||
      !Number.isFinite(Number(d.priceImpact)) ||
      Math.abs(Number(d.priceImpact)) > 2 ||
      !Number.isInteger(d.feeBps) ||
      d.feeBps < 0 ||
      d.feeBps > 100
    )
      throw new TradeError(
        'Costs or price impact are outside the supported range.',
      );
    if (now() >= started + 20000)
      throw new TradeError('Quote expired. Try again.');
    return {
      symbol: token.symbol,
      side: body.side,
      input: body.amount,
      output: Number(d.outAmount) / 10 ** (buy ? token.decimals : 6),
      unit: buy ? token.symbol : 'USDC',
      feeBps: d.feeBps,
      impact: Number(d.priceImpact),
      expiresAt: started + 20000,
    };
  }
  async function prepare(body, session) {
    if (!['buy', 'sell'].includes(body.side))
      throw new TradeError('Choose Buy or Sell.');
    const token = await resolveToken(body.symbol),
      id = crypto.randomUUID();
    // Reserve before slow upstream work; the lease and unique wallet constraint are shared.
    if (!(await store.reserve(id, session.walletKey)))
      throw new TradeError('Check your pending order before starting another.');
    try {
      await providerSlot();
      const inputMint = body.side === 'buy' ? USDC : token.mint,
        outputMint = body.side === 'buy' ? token.mint : USDC;
      const inputAmount = amountRaw(
          body.amount,
          body.side === 'buy' ? 6 : token.decimals,
        ),
        outDecimals = body.side === 'buy' ? token.decimals : 6;
      const query = new URLSearchParams({
        inputMint,
        outputMint,
        amount: inputAmount,
        taker: session.wallet,
        excludeRouters: 'jupiterz,dflow,okx',
      });
      const requestedAt = now();
      const response = await fetcher(
        'https://api.jup.ag/swap/v2/order?' + query,
        {
          signal: AbortSignal.timeout(18000),
          redirect: 'manual',
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') console.info('Trade order provider HTTP', response.status);
        throw new TradeError(
          response.status === 429
            ? 'Please wait before requesting another order.'
            : 'Unable to prepare an order right now. Try again shortly.',
        );
      }
      const data = await response.json();
      if (!data.transaction)
        throw new TradeError(
          data.errorCode === 1
            ? 'Not enough funds for this order.'
            : data.errorCode === 2
              ? 'Not enough SOL for network fees.'
              : 'An executable order is unavailable.',
        );
      if (
        data.router !== 'metis' ||
        data.taker !== session.wallet ||
        data.inputMint !== inputMint ||
        data.outputMint !== outputMint ||
        data.inAmount !== inputAmount
      )
        throw new TradeError('The order does not match your request.');
      if (
        !/^\d+$/.test(data.outAmount) ||
        !/^\d+$/.test(data.otherAmountThreshold) ||
        BigInt(data.otherAmountThreshold) <= 0n ||
        BigInt(data.otherAmountThreshold) > BigInt(data.outAmount) ||
        BigInt(data.outAmount) <= 0n
      )
        throw new TradeError('The minimum received could not be verified.');
      if (
        !Number.isInteger(data.feeBps) ||
        data.feeBps < 0 ||
        data.feeBps > 100 ||
        data.priceImpact == null ||
        !Number.isFinite(Number(data.priceImpact)) ||
        Math.abs(Number(data.priceImpact)) > 2
      )
        throw new TradeError(
          'Costs or price impact are outside the supported range.',
        );
      const fees = [
        'signatureFeeLamports',
        'prioritizationFeeLamports',
        'rentFeeLamports',
      ].map((k) => data[k]);
      if (fees.some((v) => !Number.isSafeInteger(v) || v < 0))
        throw new TradeError('Network fees are incomplete.');
      const solBudget = fees.reduce((a, b) => a + b, 0);
      if (solBudget > 10000000)
        throw new TradeError('Network costs exceed the supported limit.');
      // The live v2 API encodes block height as a decimal string.
      if (typeof data.lastValidBlockHeight === 'string' && /^[1-9]\d{0,15}$/.test(data.lastValidBlockHeight))
        data.lastValidBlockHeight = Number(data.lastValidBlockHeight);
      if (
        !Number.isSafeInteger(data.lastValidBlockHeight) ||
        data.lastValidBlockHeight <= 0 ||
        typeof data.requestId !== 'string' ||
        data.requestId.length > 200
      ) {
        throw new TradeError('Order validity could not be established.');
      }
      const validation = await validate(data, {
        wallet: session.wallet,
        inputMint,
        outputMint,
        inputAmount,
        minimumOutput: data.otherAmountThreshold,
        maximumSolDebitLamports: solBudget,
        rpc,
      });
      await checkHeight(data.lastValidBlockHeight);
      if (now() >= requestedAt + 60000)
        throw new TradeError(
          'Order check took too long. Request a fresh quote.',
        );
      const record = {
        policyVersion: 1,
        id,
        state: 'ready',
        wallet: session.wallet,
        symbol: body.symbol,
        side: body.side,
        amount: body.amount,
        inputMint,
        outputMint,
        inputRaw: inputAmount,
        minimumRaw: data.otherAmountThreshold,
        inputDecimals: body.side === 'buy' ? 6 : token.decimals,
        outputDecimals: outDecimals,
        output: Number(data.outAmount) / 10 ** outDecimals,
        minimum: Number(data.otherAmountThreshold) / 10 ** outDecimals,
        unit: body.side === 'buy' ? token.symbol : 'USDC',
        feeBps: data.feeBps,
        networkFeeSol: solBudget / 1e9,
        impact: Number(data.priceImpact),
        expiresAt: requestedAt + 60000,
        lastValidBlockHeight: data.lastValidBlockHeight,
        requestId: data.requestId,
        transaction: data.transaction,
        validation,
        receiptContext: { recentBlockhash: validation.recentBlockhash, messageHash: validation.messageHash,
          simulationSlot: validation.simulationSlot, lastValidBlockHeight: data.lastValidBlockHeight },
      };

      const saved = await store.ready(
        id,
        session.walletKey,
        record,
        record.expiresAt,
      );
      if (!saved)
        throw new TradeError(
          'Order expired while checking. Review a new order.',
        );
      return publicOrder(saved);
    } catch (error) {
      await store.abandon(id, session.walletKey);
      if (error instanceof TradePolicyError) {
        // Only controlled policy messages; never log wallet/transaction payloads.
        if (process.env.NODE_ENV === 'development') console.info('Trade policy rejected:', error.message);
        throw new TradeError('This route could not be verified. Request a fresh quote.');
      }
      throw error;
    }
  }
  async function receipt(order) {
    if (
      order.state !== 'confirmed' ||
      order.actualOutput != null ||
      !order.inputRaw
    )
      return;
    try {
      const tx = await rpc('getTransaction', [
        order.signature,
        {
          encoding: 'json',
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        },
      ]);
      if (
        tx?.meta?.err !== null ||
        tx.transaction?.signatures?.[0] !== order.signature
      )
        return;
      const balances = (key) => {
        if (!Array.isArray(tx.meta[key]))
          throw new TradeError('Missing receipt balances');
        const totals = new Map();
        for (const row of tx.meta[key])
          if (
            row.owner === order.wallet &&
            [order.inputMint, order.outputMint].includes(row.mint)
          ) {
            const value = row.uiTokenAmount;
            if (
              !value ||
              !/^\d+$/.test(value.amount) ||
              value.decimals !==
                (row.mint === order.inputMint
                  ? order.inputDecimals
                  : order.outputDecimals)
            )
              throw new TradeError('Invalid receipt amount');
            totals.set(
              row.mint,
              (totals.get(row.mint) || 0n) + BigInt(value.amount),
            );
          }
        return totals;
      };
      const pre = balances('preTokenBalances'),
        post = balances('postTokenBalances');
      const paid =
          (pre.get(order.inputMint) || 0n) - (post.get(order.inputMint) || 0n),
        received =
          (post.get(order.outputMint) || 0n) -
          (pre.get(order.outputMint) || 0n);
      if (
        paid === BigInt(order.inputRaw) &&
        received >= BigInt(order.minimumRaw)
      )
        order.actualOutput = Number(received) / 10 ** order.outputDecimals;
    } catch {
      /* Confirmation remains valid when receipt enrichment is unavailable. */
    }
  }

  async function execute(body, session) {
    let row = await owned(body.id, session);
    if (row.state !== 'ready') return publicOrder(row);
    if (now() >= row.expiresAt)
      throw new TradeError('Order expired. Review a fresh order.');
    const order = row.payload;
    if (order.policyVersion !== 1 || order.wallet !== session.wallet)
      throw new TradeError('Review a fresh order.');
    await checkHeight(order.lastValidBlockHeight);
    const signature = validateSigned(body.signedTransaction, order.validation);
    const submission = executionRequest(body.signedTransaction, order);
    row = await store.claim(row.id, session.walletKey, row.revision, signature);
    if (!row) return publicOrder(await owned(body.id, session));
    // Only an acknowledged CAS winner may submit. Never retry ambiguous submission.
    let state = 'unknown',
      error = 'We could not confirm the outcome. Do not place this order again.',
      executionEvidence = { http: null, code: null, status: null, kind: 'transport_unconfirmed' };
    try {
      const res = await fetcher('https://api.jup.ag/swap/v2/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
        signal: AbortSignal.timeout(45000),
        redirect: 'manual',
        cache: 'no-store',
      });
      executionEvidence.http = res.status;
      const data = await executionResponse(res);
      const outcome = executionOutcome(res.status, data, signature);
      state = outcome.state; error = outcome.error; executionEvidence = outcome.evidence;
    } catch {
      /* Unknown until chain reconciliation. */
    }
    const payload = { ...order, state, signature, error, executionEvidence: { ...executionEvidence, checkedAt: now() },
      receiptContext: order.receiptContext };
    delete payload.transaction;
    delete payload.validation;
    await receipt(payload);
    const saved = await store.settle(row, state, payload);
    return publicOrder(saved || (await owned(body.id, session)));
  }
  async function status(body, session) {
    let row = body.id
      ? await owned(body.id, session)
      : await store.active(session.walletKey);
    if (!row) return null;
    if (row.state === 'preparing') {
      if (row.expiresAt <= now()) {
        await store.abandon(row.id, session.walletKey);
        return null;
      }
      return {
        id: row.id,
        state: row.state,
        wallet: session.wallet,
        expiresAt: row.expiresAt,
      };
    }
    if (pending(row.state) && row.signature) {
      let state = 'unknown',
        error =
          'We could not confirm the outcome. Do not place this order again.';
      try {
        const result = await rpc('getSignatureStatuses', [
            [row.signature],
            { searchTransactionHistory: true },
          ]),
          found = result.value?.[0];
        if (
          found &&
          ['confirmed', 'finalized'].includes(found.confirmationStatus)
        ) {
          state = found.err ? 'failed' : 'confirmed';
          error = found.err ? 'The transaction failed on the network.' : null;
        }
      } catch {
        error =
          'Status is temporarily unavailable. Do not place this order again.';
      }
      const payload = {
        ...row.payload,
        state,
        signature: row.signature,
        error,
      };
      delete payload.transaction;
      delete payload.validation;
      await receipt(payload);
      row =
        (await store.settle(row, state, payload)) ||
        (await owned(row.id, session));
    }
    if (row.state === 'confirmed' && row.payload.actualOutput == null) {
      const payload = {
        ...row.payload,
        state: row.state,
        signature: row.signature,
      };
      await receipt(payload);
      if (payload.actualOutput != null)
        row =
          (await store.enrich(row, payload)) || (await owned(row.id, session));
    }
    return publicOrder(row);
  }
  return { quote, prepare, execute, status };
}
