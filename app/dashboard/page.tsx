/* eslint-disable next/no-html-link-for-pages -- Sites authentication requires top-level anchor navigation and forbids prefetched sign-in links. */
import Link from '@/components/site-link';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { SurveyList } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const u = await requireChatGPTUser('/dashboard');
  return (
    <div className="page">
      <p className="eyebrow">RESEARCH WORKSPACE</p>
      <div className="row">
        <h1>Your research, with proof.</h1>
        <Link className="cta" href="/dashboard/new">
          + Create survey
        </Link>
      </div>
      <p>
        Welcome, {u.displayName}. Design a study, verify your audience, and
        build original evidence.
      </p>
      <div className="row">
        <Link href="/pricing">Plans & commercial requests →</Link>
        <a
          className="muted"
          href="/signout-with-chatgpt?return_to=%2F"
          target="_top"
        >
          Sign out
        </a>
      </div>
      <SurveyList mine />
    </div>
  );
}
