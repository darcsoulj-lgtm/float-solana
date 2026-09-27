import { readBoundedText } from './request-body';
import { SourceHttpError } from './market-data';

export const ONDO_VOLUME_URL =
  'https://api.llama.fi/summary/dexs/ondo-global-markets?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=false';
export type OndoDailyVolume = { usd: number; startAt: number; endAt: number };
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function parseOndoVolume(
  raw: unknown,
  now = Date.now(),
): OndoDailyVolume {
  const root = record(raw);
  if (
    root.name !== 'Ondo Global Markets' ||
    !Array.isArray(root.totalDataChartBreakdown)
  )
    throw Error('Invalid Ondo volume dataset');
  const points = root.totalDataChartBreakdown.filter(
    (p): p is [number, unknown] =>
      Array.isArray(p) && p.length === 2 && typeof p[0] === 'number',
  );
  const latest = [...points].sort((a, b) => b[0] - a[0])[0];
  const startAt = latest?.[0] * 1000;
  const endAt = startAt + 86400000;
  const usd = record(record(latest?.[1]).Solana)['Ondo Global Markets'];
  if (
    !Number.isFinite(startAt) ||
    startAt <= 0 ||
    startAt % 86400000 !== 0 ||
    endAt > now ||
    now - endAt > 72 * 3600000 ||
    points.filter((p) => p[0] === latest[0]).length !== 1 ||
    typeof usd !== 'number' ||
    !Number.isFinite(usd) ||
    usd < 0
  )
    throw Error('Ondo Solana daily volume missing or expired');
  // Never use global total24h or add this daily issuer flow to rolling pool volume.
  return { usd, startAt, endAt };
}
export async function fetchOndoVolume(fetcher: typeof fetch = fetch) {
  const response = await fetcher(ONDO_VOLUME_URL, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new SourceHttpError('api.llama.fi', response);
  return parseOndoVolume(
    JSON.parse(await readBoundedText(response, 2 * 1024 * 1024)),
  );
}
