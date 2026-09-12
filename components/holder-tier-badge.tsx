'use client';
import { useEffect, useState } from 'react';
import { Gem, ShieldCheck } from 'lucide-react';
import { HOLDER_TIERS } from '@/lib/holder-tier';

export function HolderTierBadge({
  tier,
  expiresAt,
}: {
  tier?: string | null;
  expiresAt?: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiresAt - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const level =
    expiresAt !== undefined && expiresAt <= now
      ? undefined
      : HOLDER_TIERS.find((t) => t.id === tier);
  return (
    <span
      className={'holder-tier-badge ' + (level?.id || 'verified')}
      title={
        level
          ? `${level.range} in verified stock tokens · estimated USD value`
          : 'Verified holder'
      }
    >
      {level ? (
        <Gem size={13} aria-hidden="true" />
      ) : (
        <ShieldCheck size={13} aria-hidden="true" />
      )}
      {level?.label || 'Verified holder'}
    </span>
  );
}
