import type { Metadata } from 'next';
import { BackpackDashboardPage } from '@/components/backpack-dashboard';
export const metadata: Metadata = {
  title: 'Backpack tokenized stocks on Solana',
  description:
    'An independent dashboard for Backpack-issued tokenized stocks on Solana. Explore prices, onchain volume, liquidity and trading pools. No wallet required.',
};
export default function Page() {
  return <BackpackDashboardPage />;
}
