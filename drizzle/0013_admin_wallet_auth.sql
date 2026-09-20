CREATE TABLE admin_wallet_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  wallet TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE admin_wallet_sessions (
  hash TEXT PRIMARY KEY NOT NULL,
  wallet TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_wallet_sessions_expiry ON admin_wallet_sessions(expires_at);
