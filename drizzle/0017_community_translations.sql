CREATE TABLE community_translations (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_community_translations_expiry ON community_translations(expires_at);
CREATE TABLE translation_daily_usage (
  day TEXT PRIMARY KEY NOT NULL,
  units INTEGER NOT NULL
);
