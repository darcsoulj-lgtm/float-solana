import Link from 'next/link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { CreateSurvey } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireChatGPTUser('/dashboard/new');
  return (
    <div className="page">
      <Link className="muted" href="/dashboard">
        ← Research workspace
      </Link>
      <h1>Design your research.</h1>
      <p>Start with a clear question and an audience that holds the asset.</p>
      <CreateSurvey />
    </div>
  );
}
