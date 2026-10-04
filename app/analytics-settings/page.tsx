'use client';
import { useSyncExternalStore } from 'react';
import Link from '@/components/site-link';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function preference() {
  try { return localStorage.getItem('float-analytics-excluded') === '1'; }
  catch { return null; }
}
export default function AnalyticsSettings() {
  const excluded = useSyncExternalStore(subscribe, preference, () => null);
  return <div className="page info-page">
    <h1>Visit counting</h1>
    <section className="panel">
      <p>{excluded === null ? 'Checking this browser…' : excluded ? 'Visits from this browser are excluded.' : 'Visits from this browser are counted.'}</p>
      <p>This setting applies only to this browser or installed app. Set it separately on each device. Clearing website data resets it.</p>
      <Link className="button" href={`/analytics-settings?float_internal=${excluded ? '0' : '1'}`}>{excluded ? 'Include my visits' : 'Exclude my visits'}</Link>
    </section>
  </div>;
}
