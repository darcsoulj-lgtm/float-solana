import { TOKENS, type StockToken } from './tokens';
import { detectHoldings } from './solana';
import { AppError } from './validation';

// Address comes ONLY from a session created after signature verification.
export async function refreshHoldings(
  db: D1Database,
  hash: string,
  memberId: string,
  rpcUrl?: string,
  force = false,
  tokens: readonly StockToken[] = TOKENS,
) {
  const now = Date.now();
  const session = await db
    .prepare(
      'SELECT wallet FROM community_sessions WHERE hash=? AND member_id=? AND expires_at>?',
    )
    .bind(hash, memberId, now)
    .first<{ wallet: string | null }>();
  if (!session)
    throw new AppError('Your wallet session expired. Verify again.', 401);
  if (!session.wallet) return { needsVerification: true, checked: false };
  const lease = await db
    .prepare(
      'UPDATE community_sessions SET holdings_refresh_at=? WHERE hash=? AND member_id=? AND expires_at>? AND holdings_refresh_at<? RETURNING wallet',
    )
    .bind(now, hash, memberId, now, now - (force ? 10000 : 60000))
    .first<{ wallet: string }>();
  if (!lease) return { needsVerification: false, checked: false };
  // An RPC failure leaves the previous list intact and propagates a visible error.
  const holdings = await detectHoldings(
    lease.wallet,
    rpcUrl,
    fetch,
    true,
    tokens,
  );
  const guard =
    'EXISTS(SELECT 1 FROM community_sessions WHERE hash=? AND member_id=? AND holdings_refresh_at=? AND expires_at>?)';
  const args = [hash, memberId, now, Date.now()];
  const writes = await db.batch([
    db
      .prepare('DELETE FROM community_holdings WHERE member_id=? AND ' + guard)
      .bind(memberId, ...args),
    ...holdings.map((h) =>
      db
        .prepare(
          'INSERT INTO community_holdings (member_id,symbol,verified_at,slot,raw_amount,decimals,ui_amount) SELECT ?,?,?,?,?,?,? WHERE ' +
            guard,
        )
        .bind(
          memberId,
          h.symbol,
          h.verifiedAt,
          h.slot,
          h.rawAmount ?? null,
          h.decimals ?? null,
          h.uiAmount ?? null,
          ...args,
        ),
    ),
    db
      .prepare(
        'UPDATE community_members SET show_badge=0,qualifying_symbol=? WHERE id=? AND qualifying_symbol NOT IN (SELECT value FROM json_each(?)) AND ' +
          guard,
      )
      .bind(
        holdings[0]?.symbol || 'MU',
        memberId,
        JSON.stringify(holdings.map((h) => h.symbol)),
        ...args,
      ),
    db
      .prepare(
        'UPDATE community_members SET value_tier=NULL,value_tier_expires_at=0 WHERE id=? AND ' +
          guard,
      )
      .bind(memberId, ...args),
    ...(!holdings.length
      ? [
          db
            .prepare(
              'UPDATE community_members SET verified_until=? WHERE id=? AND ' +
                guard,
            )
            .bind(now, memberId, ...args),
          db
            .prepare(
              'DELETE FROM community_sessions WHERE member_id=? AND ' + guard,
            )
            .bind(memberId, ...args),
        ]
      : []),
  ]);
  if (!holdings.length && !writes.at(-1)?.meta.changes)
    return { needsVerification: false, checked: false };
  if (!holdings.length)
    throw new AppError(
      'No supported tokenized stocks remain in this wallet. Verify a wallet with a supported holding to return.',
      401,
    );
  return { needsVerification: false, checked: true };
}
