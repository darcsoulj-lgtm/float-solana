-- Private trading state. Never join these records into public market/community responses.
CREATE TABLE trade_orders (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('preparing','ready','submitting','unknown','confirmed','failed','superseded','expired')),
  revision INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  signature TEXT,
  payload TEXT NOT NULL
);
CREATE UNIQUE INDEX trade_one_active_wallet ON trade_orders(wallet_key)
  WHERE state IN ('preparing','ready','submitting','unknown');
CREATE INDEX trade_wallet_history ON trade_orders(wallet_key, updated_at DESC);
CREATE TABLE trade_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  wallet TEXT NOT NULL,
  message TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE trade_sessions (
  hash TEXT PRIMARY KEY NOT NULL,
  wallet TEXT NOT NULL,
  wallet_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX trade_session_expiry ON trade_sessions(expires_at);
CREATE TABLE IF NOT EXISTS trade_provider_slot (id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL);
