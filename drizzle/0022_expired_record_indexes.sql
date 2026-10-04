-- Bound maintenance selection by expiry rather than scanning active sessions.
CREATE INDEX IF NOT EXISTS limits_expiry ON limits(expires_at);
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges(expires_at);
CREATE INDEX IF NOT EXISTS proofs_expiry ON proofs(expires_at);
CREATE INDEX IF NOT EXISTS community_challenges_expiry ON community_challenges(expires_at);
CREATE INDEX IF NOT EXISTS community_sessions_expiry ON community_sessions(expires_at);
CREATE INDEX IF NOT EXISTS admin_wallet_challenges_expiry ON admin_wallet_challenges(expires_at);
CREATE INDEX IF NOT EXISTS trade_challenges_expiry ON trade_challenges(expires_at);
