export type OrderState =
  | 'preparing'
  | 'ready'
  | 'submitting'
  | 'unknown'
  | 'confirmed'
  | 'failed'
  | 'superseded'
  | 'expired';
export type StoredOrder = {
  id: string;
  walletKey: string;
  state: OrderState;
  revision: number;
  expiresAt: number;
  updatedAt: number;
  signature: string | null;
  payload: Record<string, unknown>;
};
type Row = {
  id: string;
  wallet_key: string;
  state: OrderState;
  revision: number;
  expires_at: number;
  updated_at: number;
  signature: string | null;
  payload: string;
};
const decode = (row: Row | null): StoredOrder | null =>
  row
    ? {
        id: row.id,
        walletKey: row.wallet_key,
        state: row.state,
        revision: row.revision,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at,
        signature: row.signature,
        payload: JSON.parse(row.payload),
      }
    : null;

/** Database constraints are authoritative across Workers, tabs, and new sessions. */
export function orderStore(database: D1Database, now = Date.now) {
  // Recovery must not read a lagging replica. CAS writes remain the execution authority.
  const db = database.withSession('first-primary');
  const get = async (id: string, walletKey: string) =>
    decode(
      await db
        .prepare('SELECT * FROM trade_orders WHERE id=? AND wallet_key=?')
        .bind(id, walletKey)
        .first<Row>(),
    );
  const active = async (walletKey: string) =>
    decode(
      await db
        .prepare(
          "SELECT * FROM trade_orders WHERE wallet_key=? AND state IN ('preparing','ready','submitting','unknown')",
        )
        .bind(walletKey)
        .first<Row>(),
    );
  return {
    get,
    active,
    async reserve(id: string, walletKey: string) {
      const time = now();
      const results = await db.batch([
        db
          .prepare(
            "UPDATE trade_orders SET state='expired',revision=revision+1,updated_at=?,payload='{}' WHERE wallet_key=? AND state='preparing' AND expires_at<=?",
          )
          .bind(time, walletKey, time),
        db
          .prepare(
            "UPDATE trade_orders SET state='superseded',revision=revision+1,updated_at=?,payload='{}' WHERE wallet_key=? AND state='ready'",
          )
          .bind(time, walletKey),
        db
          .prepare(
            "INSERT INTO trade_orders (id,wallet_key,state,expires_at,updated_at,payload) SELECT ?,?,'preparing',?,?,'{}' WHERE NOT EXISTS (SELECT 1 FROM trade_orders WHERE wallet_key=? AND state IN ('preparing','ready','submitting','unknown'))",
          )
          .bind(id, walletKey, time + 60000, time, walletKey),
      ]);
      return results[2].meta.changes === 1;
    },
    async ready(
      id: string,
      walletKey: string,
      payload: Record<string, unknown>,
      expiresAt: number,
    ) {
      const time = now();
      return decode(
        await db
          .prepare(
            "UPDATE trade_orders SET state='ready',revision=revision+1,payload=?,expires_at=?,updated_at=? WHERE id=? AND wallet_key=? AND state='preparing' AND expires_at>? AND ?>? RETURNING *",
          )
          .bind(
            JSON.stringify(payload),
            expiresAt,
            time,
            id,
            walletKey,
            time,
            expiresAt,
            time,
          )
          .first<Row>(),
      );
    },
    async abandon(id: string, walletKey: string) {
      await db
        .prepare(
          "UPDATE trade_orders SET state='expired',revision=revision+1,payload='{}',updated_at=? WHERE id=? AND wallet_key=? AND state='preparing'",
        )
        .bind(now(), id, walletKey)
        .run();
    },
    async claim(
      id: string,
      walletKey: string,
      revision: number,
      signature: string,
    ) {
      const time = now();
      // Exactly one acknowledged row grants permission to call execute.
      // A thrown/ambiguous write MUST NOT be retried as a submission.
      return decode(
        await db
          .prepare(
            "UPDATE trade_orders SET state='submitting',revision=revision+1,signature=?,updated_at=? WHERE id=? AND wallet_key=? AND revision=? AND state='ready' AND expires_at>? RETURNING *",
          )
          .bind(signature, time, id, walletKey, revision, time)
          .first<Row>(),
      );
    },
    async enrich(order: StoredOrder, payload: Record<string, unknown>) {
      return decode(
        await db
          .prepare(
            "UPDATE trade_orders SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND wallet_key=? AND revision=? AND state='confirmed' RETURNING *",
          )
          .bind(
            JSON.stringify(payload),
            now(),
            order.id,
            order.walletKey,
            order.revision,
          )
          .first<Row>(),
      );
    },
    async settle(
      order: StoredOrder,
      state: 'unknown' | 'confirmed' | 'failed',
      payload: Record<string, unknown>,
    ) {
      // Stale provider/status responses cannot regress a terminal outcome.
      return decode(
        await db
          .prepare(
            "UPDATE trade_orders SET state=?,revision=revision+1,payload=?,updated_at=? WHERE id=? AND wallet_key=? AND revision=? AND state IN ('submitting','unknown') RETURNING *",
          )
          .bind(
            state,
            JSON.stringify(payload),
            now(),
            order.id,
            order.walletKey,
            order.revision,
          )
          .first<Row>(),
      );
    },
  };
}
