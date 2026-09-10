import { TOKENS } from './tokens';
import { AppError, textValue } from './validation';

export type EditorialItem = {
  id: string;
  kind: 'news' | 'event';
  coverage: 'direct' | 'context';
  title: string;
  summary: string;
  publisher: string;
  url: string;
  published_at: number;
  event_date: string | null;
  event_at: number | null;
  certainty: 'confirmed' | 'estimated';
  status: 'draft' | 'published' | 'archived';
  featured: number;
  created_at: number;
  updated_at: number;
  symbols: string[];
};
export type BriefData = {
  items: EditorialItem[];
  hasMore: boolean;
  lastReviewed: number | null;
};
export type OperationsData = {
  items: EditorialItem[];
  counts: { members: number; posts: number; reports: number; drafts: number };
  operations: {
    operation: string;
    outcome: string;
    count: number;
    last_at: number;
  }[];
  audit: { action: string; target: string; created_at: number }[];
  lastReviewed: number | null;
  sampledAt: number;
};
export function canonicalSource(value: unknown) {
  const raw = textValue(value, 10, 1000, 'Source link');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('Add a valid HTTPS source link.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname.includes('.') ||
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    url.hostname.includes(':')
  )
    throw new AppError('Use a public HTTPS source link.');
  url.hash = '';
  const trackingKeys = Array.from(url.searchParams.keys()).filter((key) =>
    /^(utm_|fbclid$|gclid$)/i.test(key),
  );
  for (const key of trackingKeys) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function dateValue(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new AppError('Choose a valid calendar date.');
  return value;
}
export function validateEditorial(
  b: Record<string, unknown>,
  now = Date.now(),
) {
  if (b.kind !== 'news' && b.kind !== 'event')
    throw new AppError('Choose news or an event.');
  if (!['draft', 'published', 'archived'].includes(String(b.status)))
    throw new AppError('Choose a publication status.');
  if (
    !Array.isArray(b.symbols) ||
    !b.symbols.length ||
    b.symbols.length > 10 ||
    b.symbols.some((s) => !TOKENS.some((t) => t.symbol === s))
  )
    throw new AppError('Select 1–10 supported stocks.');
  if (b.certainty !== 'confirmed' && b.certainty !== 'estimated')
    throw new AppError('Label the event date as confirmed or estimated.');
  if (typeof b.featured !== 'boolean')
    throw new AppError('Invalid featured setting.');
  if (
    b.coverage !== undefined &&
    !['direct', 'context'].includes(String(b.coverage))
  )
    throw new AppError('Choose direct company news or industry context.');
  const published = dateValue(b.published_date);
  if (published > new Date(now).toISOString().slice(0, 10))
    throw new AppError('The source publication date cannot be in the future.');
  let event_date = null,
    event_at = null;
  if (b.kind === 'event') {
    event_date = dateValue(b.event_date);
    if (b.event_at !== null && b.event_at !== '' && b.event_at !== undefined) {
      if (
        typeof b.event_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(b.event_at) ||
        !Number.isFinite(Date.parse(b.event_at))
      )
        throw new AppError('Choose a valid event time.');
      event_at = Date.parse(b.event_at);
      if (new Date(event_at).toISOString().slice(0, 10) !== event_date)
        throw new AppError('Event date and time do not match.');
    }
  }
  return {
    kind: b.kind,
    coverage: (b.coverage || 'direct') as 'direct' | 'context',
    title: textValue(b.title, 5, 160, 'Title'),
    summary: textValue(b.summary, 20, 800, 'Summary'),
    publisher: textValue(b.publisher, 2, 80, 'Publisher'),
    url: canonicalSource(b.url),
    published_at: Date.parse(published),
    event_date,
    event_at,
    certainty: b.certainty,
    status: String(b.status),
    featured: b.featured ? 1 : 0,
    symbols: [...new Set(b.symbols)] as string[],
  };
}
export function eventLabel(
  item: Pick<EditorialItem, 'event_at' | 'event_date'>,
  zone?: string,
) {
  return item.event_at !== null
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        ...(zone ? { timeZone: zone } : {}),
      }).format(item.event_at)
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(Date.parse(item.event_date!)) + ' · Time not announced';
}
