import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { CommunityAdmin } from '@/components/community-admin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireChatGPTUser('/admin/community');
  return (
    <div className="page">
      <p className="eyebrow">COMMUNITY OPERATIONS</p>
      <h1>Keep the conversation useful.</h1>
      <CommunityAdmin />
    </div>
  );
}
