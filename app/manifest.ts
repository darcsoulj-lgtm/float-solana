import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Float — Solana tokenized stocks',
    short_name: 'Float',
    description: 'Markets and community for Solana tokenized stock holders.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#f7f7f5',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/brand/float-mark.svg',
        sizes: '64x64',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
