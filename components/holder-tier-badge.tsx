'use client';
import { useEffect, useState } from 'react';
import { Gem } from 'lucide-react';
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
  if (!level) return null;
  return (
    <span
      className={'holder-tier-badge ' + level.id}
      title={`${level.range} in verified tokenized stocks · estimated USD value`}
    >
      <Gem size={13} aria-hidden="true" />
      {level.label}
    </span>
  );
}
