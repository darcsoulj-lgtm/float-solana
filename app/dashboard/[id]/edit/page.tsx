import Link from '@/components/site-link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { CreateSurvey } from '@/components/workspace';
export const dynamic = 'force-dynamic';
async function Content({ id }: { id: string }) {
  await requireChatGPTUser('/dashboard/' + id + '/edit');
  return (
    <div className="page">
      <Link href={'/dashboard/' + id}>← Study overview</Link>
      <h1>Refine your research draft.</h1>
      <CreateSurvey id={id} />
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
