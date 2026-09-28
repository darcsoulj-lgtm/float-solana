import type { HoldingWallets } from './issuer-holders';
export type HolderPoint = Pick<HoldingWallets, 'issuer' | 'wallets' | 'checkedAt' | 'registryHash'>;
const DAY = 86400000;
export const holderDay = (at: number) => Math.floor(at / DAY);
export function parseHolderHistory(value: unknown, now = Date.now()): HolderPoint[] {
  if (!Array.isArray(value) || value.length > 300) return [];
  return value.filter((p): p is HolderPoint => !!p && ['backpack','xstocks','ondo'].includes(p.issuer) && Number.isSafeInteger(p.wallets) && p.wallets >= 0 && Number.isSafeInteger(p.checkedAt) && p.checkedAt > 0 && p.checkedAt <= now + 60000 && typeof p.registryHash === 'string' && /^[a-f0-9]{64}$/.test(p.registryHash)).map(({issuer,wallets,checkedAt,registryHash}) => ({issuer,wallets,checkedAt,registryHash}));
}
export function appendHolderHistory(previous: unknown, observations: HolderPoint[], now = Date.now()) {
  const days = new Map<string, HolderPoint>();
  for (const p of [...parseHolderHistory(previous, now), ...parseHolderHistory(observations, now)]) {
    if (holderDay(p.checkedAt) < holderDay(now) - 89) continue;
    const key = `${p.issuer}:${holderDay(p.checkedAt)}`;
    if (!days.has(key) || days.get(key)!.checkedAt < p.checkedAt) days.set(key, p);
  }
  return [...days.values()].sort((a,b) => a.checkedAt - b.checkedAt);
}
export function holderTrend(history: HolderPoint[], row: HoldingWallets) {
  // Changing the tracked mint set starts a new comparable series.
  const points = history.filter(p => p.issuer === row.issuer && p.checkedAt <= row.checkedAt).sort((a,b) => a.checkedAt-b.checkedAt);
  const lastChange = points.findLastIndex(p => p.registryHash !== row.registryHash);
  const consistent = points.slice(lastChange + 1).filter(p => holderDay(p.checkedAt) >= holderDay(row.checkedAt)-30);
  if (new Set(consistent.map(p => holderDay(p.checkedAt))).size < 7) return null;
  const baseline = consistent.find(p => holderDay(p.checkedAt) === holderDay(row.checkedAt)-30);
  return {points:consistent, change:baseline && baseline.wallets > 0 ? (row.wallets / baseline.wallets - 1)*100 : null};
}
