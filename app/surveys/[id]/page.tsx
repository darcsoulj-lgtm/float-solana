import Link from '@/components/site-link';
import { Participant } from '@/components/participant';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="page">
      <Link className="muted" href="/surveys">
        ← All studies
      </Link>
      <Participant id={id} />
    </div>
  );
}
