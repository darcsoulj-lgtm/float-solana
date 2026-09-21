import { Community } from '@/components/community';
import { notFound } from 'next/navigation';

export default async function WalletConnectPage({ params }: { params: Promise<{ handoffId: string }> }) {
  const { handoffId } = await params;
  if (!/^[a-f0-9-]{36}$/.test(handoffId)) notFound();
  return <Community appHandoffId={handoffId} />;
}
