CREATE TABLE IF NOT EXISTS community_likes (
  thread_id TEXT NOT NULL REFERENCES community_threads(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, member_id)
);
