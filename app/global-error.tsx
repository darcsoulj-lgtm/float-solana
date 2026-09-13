'use client';
import { useEffect } from 'react';
import { reportClientFault } from '@/lib/client-module';
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => reportClientFault(error, 'App'), [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#111216',
          color: '#f5f5f5',
        }}
      >
        <main style={{ maxWidth: 420, margin: '20vh auto', padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Float couldn’t load</h1>
          <p>Please reload to try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '12px 18px', borderRadius: 8, cursor: 'pointer' }}
          >
            Reload Float
          </button>
        </main>
      </body>
    </html>
  );
}
