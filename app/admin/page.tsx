import Link from '@/components/site-link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { actor } from '@/lib/server';
import { OperationsWorkspace } from '@/components/operations-workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireChatGPTUser('/admin');
  const user = await actor();
  if (!user.admin)
    return (
      <main className="page">
        <p className="eyebrow">ADMIN ACCESS</p>
        <h1>This workspace is for administrators.</h1>
        <p>
          Your signed-in account is not on the administrator list. Wallet
          membership does not grant publishing or moderation access.
        </p>
        <Link href="/">Return to the community →</Link>
      </main>
    );
  return <OperationsWorkspace />;
}
