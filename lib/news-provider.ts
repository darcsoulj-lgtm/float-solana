import { canonicalSource } from './editorial';
import { AppError } from './validation';

// Explicit issuer mappings only. Token labels are not automatically vendor tickers.
export const NEWS_TICKERS: Record<string, string> = { MU: 'MU' };
export type NewsDraft = {
  id: string;
  title: string;
  url: string;
  publishedAt: number;
  symbol: string;
};
export async function fetchNewsDrafts(
  key: string | undefined,
  symbol: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<NewsDraft[]> {
  if (!key?.trim())
    throw new AppError(
      'Benzinga is not connected. Add a licensed news API key in the site settings.',
      503,
    );
  const ticker = NEWS_TICKERS[symbol];
  if (!ticker)
    throw new AppError(
      'This stock does not have a reviewed news-provider mapping yet.',
    );
  const url = new URL('https://api.benzinga.com/api/v2/news');
  url.search = new URLSearchParams({
    token: key.trim(),
    tickers: ticker,
    pageSize: '20',
    page: '0',
    displayOutput: 'headline',
    dateFrom: new Date(now - 7 * 86400000).toISOString().slice(0, 10),
    dateTo: new Date(now).toISOString().slice(0, 10),
  }).toString();
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
      redirect: 'manual',
    });
  } catch {
    throw new AppError(
      'The news provider could not be reached. Please try again later.',
      502,
    );
  }
  if (!response.ok)
    throw new AppError(
      response.status === 401 || response.status === 403
        ? 'The news provider rejected the key or its permissions. Check the licensed API access.'
        : 'The news provider is temporarily unavailable. Please try again later.',
      502,
    );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError(
      'The news provider returned an unreadable response.',
      502,
    );
  }
  if (!Array.isArray(payload))
    throw new AppError(
      'The news provider returned an unexpected response.',
      502,
    );
  const drafts = new Map<string, NewsDraft>();
  for (const item of payload.slice(0, 20)) {
    if (
      !item ||
      typeof item !== 'object' ||
      !/^\d{1,30}$/.test(String(item.id)) ||
      typeof item.title !== 'string' ||
      item.title.trim().length < 5 ||
      item.title.length > 160
    )
      continue;
    if (
      !Array.isArray(item.stocks) ||
      !item.stocks.some(
        (stock: { name?: unknown } | null) => stock?.name === ticker,
      )
    )
      continue;
    const publishedAt = Date.parse(item.created);
    if (
      !Number.isFinite(publishedAt) ||
      publishedAt > now ||
      publishedAt < now - 8 * 86400000
    )
      continue;
    try {
      const source = canonicalSource(item.url),
        host = new URL(source).hostname;
      if (host !== 'benzinga.com' && !host.endsWith('.benzinga.com')) continue;
      const id = 'benzinga-' + item.id;
      drafts.set(id, {
        id,
        title: item.title.trim(),
        url: source,
        publishedAt,
        symbol,
      });
    } catch {
      /* Skip malformed sources; never replace them with a homepage. */
    }
  }
  return [...drafts.values()];
}

export async function persistNewsDrafts(
  database: D1Database,
  drafts: NewsDraft[],
) {
  let imported = 0;
  for (const item of drafts) {
    const stamp = Date.now(),
      editToken = crypto.randomUUID();
    const results = await database.batch([
      database
        .prepare(
          "INSERT OR IGNORE INTO editorial_items (id,kind,title,summary,publisher,url,published_at,event_date,event_at,certainty,status,featured,created_at,updated_at,edit_token,coverage) VALUES (?,'news',?,?,?,?,?,NULL,NULL,'confirmed','draft',0,?,?,?,'direct')",
        )
        .bind(
          item.id,
          item.title,
          'Headline from Benzinga. Read the original article for the full reporting.',
          'Benzinga',
          item.url,
          item.publishedAt,
          stamp,
          stamp,
          editToken,
        ),
      database
        .prepare(
          'INSERT OR IGNORE INTO editorial_tags (item_id,symbol) SELECT ?,? WHERE EXISTS (SELECT 1 FROM editorial_items WHERE id=? AND edit_token=?)',
        )
        .bind(item.id, item.symbol, item.id, editToken),
    ]);
    imported += Number(results[0].meta.changes || 0);
  }

  return imported;
}
