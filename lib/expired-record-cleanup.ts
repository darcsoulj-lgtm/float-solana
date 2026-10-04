// Private scheduled maintenance, independent of sign-in traffic. Fixed tables
// and bounded batches; never delete member content, holdings or unresolved orders.
export const EXPIRED_CLEANUP_BATCH = 100;
const expiringTables = ['limits','challenges','proofs','community_challenges','community_sessions','wallet_handoffs','admin_wallet_challenges','admin_wallet_sessions','trade_challenges','trade_sessions','community_attachment_drafts'] as const;
export async function cleanupExpiredRecords(database:D1Database,now=Date.now()){
  const statements=expiringTables.map(table=>database.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<? ORDER BY expires_at LIMIT ?)`)
    .bind(now,EXPIRED_CLEANUP_BATCH));
  // An in-flight translation owns its lease even when the previous cache expired.
  statements.push(database.prepare('DELETE FROM community_translations WHERE rowid IN (SELECT rowid FROM community_translations WHERE expires_at<? AND lease_until<? ORDER BY expires_at LIMIT ?)').bind(now,now,EXPIRED_CLEANUP_BATCH));
  const results=await database.batch(statements);
  return{deleted:results.reduce((n,r)=>n+(r.meta?.changes??0),0),maxRows:statements.length*EXPIRED_CLEANUP_BATCH};
}
