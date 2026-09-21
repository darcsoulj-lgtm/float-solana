CREATE TABLE wallet_handoffs (
  id TEXT PRIMARY KEY NOT NULL,
  secret_hash TEXT NOT NULL,
  member_id TEXT,
  wallet TEXT,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (member_id) REFERENCES community_members(id)
);
CREATE INDEX wallet_handoffs_expiry ON wallet_handoffs(expires_at);
