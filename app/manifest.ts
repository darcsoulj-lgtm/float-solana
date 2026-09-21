import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Float — Solana tokenized stocks',
    short_name: 'Float',
    description: 'Markets and community for Solana tokenized stock holders.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#f7f7f5',
    id: '/',
    icons: [
      { src: '/brand/float-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/float-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/float-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
