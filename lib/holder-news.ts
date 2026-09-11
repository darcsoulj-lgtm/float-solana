import { TOKENS } from './tokens';
export const NEWS_WINDOW_MS = 7 * 86400000;
export const HEADLINE_REFRESH_MS = 15 * 60000;
export type Headline = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  published_at: number;
  symbols: string[];
};
const aliases: Record<string, string[]> = {
  MU: ['Micron'],
  SPCX: ['SpaceX'],
  SKHY: ['SK Hynix'],
  BABA: ['Alibaba'],
  BA: ['Boeing'],
  BOT: ['RoboStrategy'],
  DNUT: ['Krispy Kreme'],
  GRND: ['Grindr'],
  COST: ['Costco'],
  DJT: ['Trump Media'],
  DRAM: ['Roundhill Memory'],
  GPRO: ['GoPro'],
  HIMS: ['Hims'],
  HOOD: ['Robinhood'],
  HTZ: ['Hertz'],
  IBM: ['IBM'],
  INTC: ['Intel'],
  NKE: ['Nike'],
  SNDK: ['SanDisk'],
  TTWO: ['Take-Two'],
  UPS: ['United Parcel Service', 'UPS'],
};
export function companyAliases(symbol: string) {
  const t = TOKENS.find((t) => t.symbol === symbol);
  if (!t) throw Error('Unsupported stock');
  return (
    aliases[symbol] ||
    [t.shortName, t.name]
      .map((n) =>
        n
          .replace(/^The /, '')
          .replace(
            /,? (Inc\.?|Corporation|Corp\.?|Company|Limited|Ltd\.?).*$/i,
            '',
          )
          .trim(),
      )
      .filter((n) => n.length >= 4)
  );
}
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const value =
        n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    })
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, n) =>
        (
          ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }) as Record<
            string,
            string
          >
        )[n] || '',
    )
    .replace(/<[^>]*>/g, '')
    .trim();
export function matchesCompany(title: string, symbol: string) {
  return companyAliases(symbol).some((a) =>
    new RegExp(
      '(^|[^a-z0-9])' +
        a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '([^a-z0-9]|$)',
      'i',
    ).test(title),
  );
}
export function parseHeadlines(
  xml: string,
  symbol: string,
  now = Date.now(),
): Headline[] {
  if (
    xml.length > 1000000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<rss[\s>]/i.test(xml)
  )
    throw Error('Invalid headline feed');
  const result = new Map<string, Headline>();
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const field = (name: string) =>
      decode(
        match[1].match(
          new RegExp(
            '<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>',
          ),
        )?.[1] || '',
      );
    const title = field('title'),
      published_at = Date.parse(field('pubDate'));
    if (
      !title ||
      title.length > 300 ||
      !matchesCompany(title, symbol) ||
      !Number.isFinite(published_at) ||
      published_at > now ||
      published_at < now - NEWS_WINDOW_MS
    )
      continue;
    try {
      const u = new URL(field('link'));
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.port ||
        !u.hostname.includes('.') ||
        /^(localhost|\d+[.:])/.test(u.hostname) ||
        u.hostname.endsWith('.local') ||
        u.hostname.endsWith('.internal') ||
        u.pathname.length < 2
      )
        continue;
      const tracking = Array.from(u.searchParams.keys()).filter((k) =>
        /^(utm_|\.tsrc|guccounter|guce_referrer)/.test(k),
      );
      for (const k of tracking) u.searchParams.delete(k);
      u.hash = '';
      const url = u.href;
      const host = u.hostname.replace(/^www\./, '');
      const publisher =
        (
          {
            'finance.yahoo.com': 'Yahoo Finance',
            'reuters.com': 'Reuters',
            'cnbc.com': 'CNBC',
            'bloomberg.com': 'Bloomberg',
            'wsj.com': 'The Wall Street Journal',
            'fool.com': 'The Motley Fool',
            'barrons.com': "Barron's",
            'investors.com': "Investor's Business Daily",
          } as Record<string, string>
        )[host] || host;
      result.set(url, {
        id: 'headline:' + url,
        title,
        url,
        publisher,
        published_at,
        symbols: [symbol],
      });
    } catch {
      /* Reject malformed links. Never substitute a publisher homepage. */
    }
  }
  return [...result.values()]
    .sort((a, b) => b.published_at - a.published_at)
    .slice(0, 40);
}
export async function fetchHeadlines(
  symbol: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  companyAliases(symbol);
  // Foreign listing override; all other feeds remain candidate sources and must pass company-name matching.
  const ticker = symbol === 'SKHY' ? '000660.KS' : symbol;
  const url = new URL('https://feeds.finance.yahoo.com/rss/2.0/headline');
  url.search = new URLSearchParams({
    s: ticker,
    region: 'US',
    lang: 'en-US',
  }).toString();
  const r = await fetcher(url, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    headers: { Accept: 'application/rss+xml, application/xml' },
  });
  if (!r.ok) throw Error('Headline feed unavailable');
  const reader = r.body?.getReader();
  if (!reader) throw Error('Headline feed unavailable');
  const decoder = new TextDecoder();
  let text = '',
    size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 1000000) {
      await reader.cancel();
      throw Error('Headline feed too large');
    }
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();
  return parseHeadlines(text, symbol, now);
}
