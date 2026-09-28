import { db } from '@/lib/server';
import { readHoldingWallets, readHolderHistory } from '@/lib/issuer-holders-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const database = db();
  const snapshot = await readHoldingWallets(database);
  const history = await readHolderHistory(database).catch(() => []);
  return Response.json({...snapshot, history}, {headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
}
