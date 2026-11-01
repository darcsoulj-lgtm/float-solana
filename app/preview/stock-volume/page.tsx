import { notFound } from 'next/navigation';
import { StockVolumePreview } from './stock-volume-preview';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <StockVolumePreview />;
}
