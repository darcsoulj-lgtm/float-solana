import { InstallFloat } from '@/components/install-float';
export const metadata = {
  title: 'Add Float to Home Screen',
  description: 'Quick access to Float from your home screen.',
};
export default function Page() {
  return <div className="page info-page install-page">
    <h1>Float, one tap away.</h1>
    <p className="lede">Add Float to your home screen for quick access.</p>
    <InstallFloat />
  </div>;
}
