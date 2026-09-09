import Link from 'next/link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { Analytics } from '@/components/workspace';
export const dynamic = 'force-dynamic';
async function Content({ id }: { id: string }) {
  await requireChatGPTUser('/dashboard/' + id);
  return (
    <div className="page">
      <Link className="muted" href="/dashboard">
        ← Research workspace
      </Link>
      <Analytics id={id} />
    </div>
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Content id={id} />;
}
