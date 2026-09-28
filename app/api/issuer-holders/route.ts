import { db } from '@/lib/server';
import { readHoldingWallets } from '@/lib/issuer-holders-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(await readHoldingWallets(db()), {headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
}
