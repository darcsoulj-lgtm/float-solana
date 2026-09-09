import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { Admin } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireChatGPTUser('/admin');
  return (
    <div className="page">
      <p className="eyebrow">OPERATIONS</p>
      <h1>Research oversight.</h1>
      <p>
        Review research objectives and participant disclosures before approving
        a live study. Do not approve requests for sensitive or material
        nonpublic information.
      </p>
      <Admin />
    </div>
  );
}
