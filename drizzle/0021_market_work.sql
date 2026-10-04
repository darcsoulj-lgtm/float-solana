-- Private durable collection state; never returned in a public market payload.
CREATE TABLE market_work (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  payload TEXT NOT NULL,
  scope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_ms INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  succeeded_at INTEGER,
  published_at INTEGER,
  failure_code TEXT,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX market_work_due ON market_work(enabled,lane,due_at,lease_until);
CREATE TABLE market_incidents (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  recovered_at INTEGER,
  notified_at INTEGER
);
CREATE TABLE market_pool_shards (
  address TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_key TEXT NOT NULL,
  PRIMARY KEY(address,provider)
);
