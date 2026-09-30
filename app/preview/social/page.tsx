import { notFound } from 'next/navigation';
import { SocialPreview } from './social-preview';
import './social-preview.css';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SocialPreview />;
}
