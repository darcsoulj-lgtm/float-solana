import { fetchBackpackChart } from './backpack-charts';
import { cachedMarket } from './market-cache';
import { readMarketOverview } from './market-overview-server';
import { detectHoldings } from './solana';
import { portfolioAttachment, parseDiscussionAttachment, type DiscussionAttachment } from './discussion-attachments';
import { AppError } from './validation';
import type { RegistryStatus } from './token-registry';
import type { StockToken } from './tokens';

export async function prepareDiscussionAttachment(database:D1Database, memberId:string, sessionHash:string, input:Record<string,unknown>, registry:{tokens:readonly StockToken[];registry:RegistryStatus}, rpcUrl?:string) {
  const now=Date.now();
  let attachment:DiscussionAttachment;
  if(input.kind==='chart') {
    const token=registry.tokens.find(t=>t.issuer==='backpack' && t.symbol===input.symbol);
    if(!token || ![1,7].includes(input.period as number)) throw new AppError('Choose a Backpack stock and chart period.');
    const source=await cachedMarket(database,`discussion-chart-v1:${token.mint}`,300000,()=>fetchBackpackChart(token));
    if(!source.data || source.stale || !source.fetchedAt || Date.now()-source.fetchedAt>300000) throw new AppError('Chart unavailable. Try again shortly.',503);
    const chart=source.data;
    const period=input.period===1?1:7;
    if(chart.points.filter(p=>p[0]>=chart.windowEnd-period*86400000).length<2) throw new AppError('Not enough trading hours. Choose 7D.',422);
    attachment={kind:'chart',version:1,period,chart};
  } else if(input.kind==='portfolio') {
    const session=await database.prepare('SELECT wallet FROM community_sessions WHERE hash=? AND member_id=? AND expires_at>?').bind(sessionHash,memberId,now).first<{wallet:string|null}>();
    if(!session?.wallet) throw new AppError('Verify your wallet again before preparing a snapshot.',401);
    const [holdings,data]=await Promise.all([
      detectHoldings(session.wallet,rpcUrl,fetch,true,registry.tokens.filter(t=>t.issuer==='backpack')),
      readMarketOverview({DB:database,SOLANA_RPC_URL:rpcUrl},registry.tokens,registry.registry),
    ]);
    attachment=portfolioAttachment(holdings.map(h=>({symbol:h.symbol,verified_at:h.verifiedAt,slot:h.slot,raw_amount:h.rawAmount,decimals:h.decimals,ui_amount:h.uiAmount})),data);
  } else throw new AppError('Choose a chart or portfolio snapshot.');
  const id=crypto.randomUUID(),expiresAt=Date.now()+600000;
  await database.batch([
    database.prepare('DELETE FROM community_attachment_drafts WHERE expires_at<? OR member_id=?').bind(Date.now(),memberId),
    database.prepare('INSERT INTO community_attachment_drafts(id,member_id,payload,expires_at) VALUES(?,?,?,?)').bind(id,memberId,JSON.stringify(attachment),expiresAt),
  ]);
  return {id,expiresAt,attachment};
}
export async function attachmentForPost(database:D1Database,memberId:string,id:unknown,consent:unknown,now=Date.now()) {
  if(id===undefined || id===null) return null;
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id)) throw new AppError('Invalid attachment.');
  const draft=await database.prepare('SELECT payload FROM community_attachment_drafts WHERE id=? AND member_id=? AND expires_at>?').bind(id,memberId,now).first<{payload:string}>();
  const a=parseDiscussionAttachment(draft?.payload);
  if(!a) throw new AppError('Attachment expired. Prepare it again before posting.',422);
  if(a.kind==='portfolio' && consent!==true) throw new AppError('Confirm that you want to share these portfolio percentages.');
  return JSON.stringify(a);
}
