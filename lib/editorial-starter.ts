// Reviewed release content, not simulated news. Each item links to its source.
// Initialized once by an authenticated POST; later admin edits are never reset.
export const EDITORIAL_RELEASE = 'editorial-2026-09-10';
export const REVIEWED_AT = Date.parse('2026-09-10T14:00:00Z');
export const STARTER_CONTENT = [
  {
    id: 'skhy-future-forum-2026',
    kind: 'news',
    title: 'SK hynix outlines its next direction in AI memory',
    summary:
      'At its September 8 Future Forum, SK hynix discussed memory systems designed with AI partners, including HBM and new 3D approaches. The company described the technical challenges still ahead.',
    publisher: 'SK hynix Newsroom',
    url: 'https://news.skhynix.com/en/future-forum-2026/',
    published_date: '2026-09-09',
    symbols: ['SKHY'],
    featured: true,
  },
  {
    id: 'mu-earnings-date-2026-q4-news',
    kind: 'news',
    title: 'Micron confirms September 30 earnings call',
    summary:
      'Micron has scheduled its fiscal fourth-quarter earnings call for September 30 at 2:30 p.m. Mountain time. A webcast and subsequent replay will be available through investor relations.',
    publisher: 'Micron Investor Relations',
    url: 'https://investors.micron.com/news/press-release/2026/Micron-Technology-to-Report-Fiscal-Fourth-Quarter-Results-on-September-30-2026/default.aspx',
    published_date: '2026-08-26',
    symbols: ['MU'],
    featured: false,
  },
  {
    id: 'nvda-2026-q2-memory-context',
    kind: 'news',
    title: 'NVIDIA releases its latest quarterly results',
    summary:
      'NVIDIA has published results for the quarter ended July 26 and its financial outlook. This is industry context for memory holders; the original release includes the detailed results and guidance.',
    publisher: 'NVIDIA Investor Relations',
    url: 'https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx',
    published_date: '2026-08-26',
    symbols: ['MU', 'SKHY', 'DRAM'],
    featured: false,
  },
  {
    id: 'mu-earnings-date-2026-q4-event',
    kind: 'event',
    title: 'Micron · Q4 FY2026 earnings call',
    summary:
      'Quarterly results and management commentary. The company has confirmed the date and webcast time; use the source link for access details.',
    publisher: 'Micron Investor Relations',
    url: 'https://investors.micron.com/news/press-release/2026/Micron-Technology-to-Report-Fiscal-Fourth-Quarter-Results-on-September-30-2026/default.aspx',
    published_date: '2026-08-26',
    event_date: '2026-09-30',
    event_at: '2026-09-30T20:30:00Z',
    symbols: ['MU'],
    featured: false,
  },
].map((item) => ({ certainty: 'confirmed', status: 'published', ...item }));
