ALTER TABLE community_threads ADD COLUMN attachment_json TEXT;
CREATE TABLE community_attachment_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_attachment_drafts_expiry ON community_attachment_drafts(expires_at);
