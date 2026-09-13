import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { bundle } from './helpers/bundle.mjs';
const stockPools = await bundle("export * from './lib/stock-pools';");
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const Empty = () => null;
async function component(file, overrides) {
  const source = await readFile(
    new URL('../components/' + file, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const compiledModule = { exports: {} };
  compileFunction(outputText, ['require', 'module', 'exports'])(
    (id) =>
      (id === '@/components/site-link'
        ? {
            default: ({ children, ...props }) =>
              React.createElement('a', props, children),
          }
        : id === '@/hooks/use-community-feed'
          ? {
              useCommunityFeed: () => ({
                threads: [],
                cursor: null,
                error: '',
                loading: false,
                hasPage: true,
                refresh: async () => {},
                loadMore: async () => {},
              }),
            }
          : id === '@/lib/token-registry'
            ? { registryTokens: () => overrides['@/lib/tokens']?.TOKENS ?? [] }
            : id === '@/lib/market-data'
              ? {
                  ...overrides[id],
                  marketTokens: () => overrides['@/lib/tokens']?.TOKENS ?? [],
                }
              : overrides[id]) ??
      (id === '@/lib/stock-pools'
        ? stockPools
        : id === './metric-info'
          ? {
              MetricInfo: ({ label }) =>
                React.createElement('button', { 'aria-label': label }),
            }
          : id === '@/lib/client-loading'
            ? {
                readThenRefresh: () => {
                  throw Error('Unexpected effect in static render test');
                },
              }
            : require(id)),
    compiledModule,
    compiledModule.exports,
  );
  return compiledModule.exports;
}
async function portfolio({ hidden = false, prices = {}, positions }) {
  let hook = 0;
  const { PortfolioSummary } = await component('portfolio-summary.tsx', {
    react: {
      ...React,
      useState: () => [hook++ === 0 ? hidden : false, () => {}],
    },
    '@/lib/tokens': {
      TOKENS: positions.map((p) => ({ symbol: p.symbol, issuer: 'backpack' })),
    },
    '@/lib/token-observation': {
      tokenObservation: (_, symbol) => ({
        price: prices[symbol] ?? null,
        priceSource: 'test quote',
        priceTime: 1,
      }),
    },
  });
  return PortfolioSummary({ positions, data: null, now: 1 });
}
const holding = (symbol, raw_amount = '100') => ({
  symbol,
  raw_amount,
  decimals: 2,
  ui_amount: '1',
  verified_at: 1,
});
function elements(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => elements(n, type));
  return [
    ...(node.type === type ? [node] : []),
    ...elements(node.props?.children, type),
  ];
}
void test('Portfolio ring and list agree on value and allocation', async () => {
  const tree = await portfolio({
    positions: [holding('MU'), holding('SPCX')],
    prices: { MU: 75, SPCX: 25 },
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /\$100\.00/);
  assert.match(html, /MU: 75\.0%/);
  assert.match(html, /SPCX: 25\.0%/);
  const arcs = elements(tree, 'circle').filter((c) => c.props.pathLength);
  assert.equal(arcs.length, 2);
  assert.equal(arcs[1].props.strokeDashoffset, -75);
});
void test('An unpriced holding suppresses allocation instead of presenting a false 100 percent', async () => {
  const tree = await portfolio({
    positions: [holding('MU'), holding('SPCX')],
    prices: { MU: 75 },
  });
  assert.equal(
    elements(tree, 'circle').filter((c) => c.props.pathLength).length,
    0,
  );
  assert.match(renderToStaticMarkup(tree), /Priced holdings/);
});
void test('Hide balances removes dollar values and allocation from the rendered chart and list', async () => {
  const tree = await portfolio({
    hidden: true,
    positions: [holding('MU')],
    prices: { MU: 75 },
  });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /\$75|100\.0%|MU: 100/);
  assert.equal(
    elements(tree, 'circle').filter((c) => c.props.pathLength).length,
    0,
  );
});
void test('Large portfolios group smaller holdings in the ring and initially show five rows', async () => {
  const positions = Array.from({ length: 8 }, (_, i) => holding('T' + i));
  const prices = Object.fromEntries(positions.map((p, i) => [p.symbol, 8 - i]));
  const tree = await portfolio({ positions, prices });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Other: 16\.7%/);
  assert.match(html, /Show all 8 holdings/);
  assert.equal(
    elements(tree, 'li').filter(
      (e) => e.props.className === 'portfolio-position',
    ).length,
    5,
  );
});
void test('Appearance offers direct Light selection, persists it, and synchronizes all controls', async () => {
  const callbacks = new Map(),
    saved = new Map(),
    effects = [];
  let dark = true;
  const prior = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  globalThis.document = {
    documentElement: {
      dataset: { theme: 'dark' },
      classList: {
        toggle: (_, enabled) => {
          dark = enabled;
        },
      },
    },
  };
  globalThis.localStorage = { setItem: (key, value) => saved.set(key, value) };
  globalThis.window = {
    matchMedia: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener: (key, callback) => callbacks.set(key, callback),
    removeEventListener: (key) => callbacks.delete(key),
    dispatchEvent: (event) => callbacks.get(event.type)?.(),
  };
  try {
    const { ThemeToggle } = await component('theme-toggle.tsx', {
      react: {
        ...React,
        useState: () => ['dark', () => {}],
        useEffect: (effect) => effects.push(effect),
      },
      '@/components/ui/toggle-group': {
        ToggleGroup: 'group',
        ToggleGroupItem: 'choice',
      },
    });
    const tree = ThemeToggle();
    const cleanup = effects[0]();
    assert.deepEqual(
      tree.props.children.map((child) => child.props.value),
      ['light', 'dark', 'system'],
    );
    tree.props.onValueChange(['light']);
    assert.equal(saved.get('hp-theme'), 'light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(dark, false);
    tree.props.onValueChange([]);
    assert.equal(document.documentElement.dataset.theme, 'light');
    cleanup();
  } finally {
    Object.assign(globalThis, prior);
  }
});

const tierLevels = [
  { id: 'bronze', label: 'Bronze', range: 'Under $100' },
  { id: 'silver', label: 'Silver', range: '$100–$999' },
  { id: 'gold', label: 'Gold', range: '$1k–$9,999' },
  { id: 'platinum', label: 'Platinum', range: '$10k–$99,999' },
  { id: 'diamond', label: 'Diamond', range: '$100k+' },
];
void test('value badge renders a compact label, never an exact balance, and hides expired tiers', async () => {
  const { HolderTierBadge } = await component('holder-tier-badge.tsx', {
    '@/lib/holder-tier': { HOLDER_TIERS: tierLevels },
  });
  const active = renderToStaticMarkup(
    React.createElement(HolderTierBadge, {
      tier: 'gold',
      expiresAt: Date.now() + 60000,
    }),
  );
  assert.match(active, /Gold/);
  assert.match(active, /estimated USD value/);
  const expired = renderToStaticMarkup(
    React.createElement(HolderTierBadge, { tier: 'gold', expiresAt: 1 }),
  );
  assert.doesNotMatch(expired, /Gold/);
  assert.match(expired, /Verified holder/);
});
const navSource = await readFile(
  new URL('../lib/member-navigation.ts', import.meta.url),
  'utf8',
);
const navModule = { exports: {} };
compileFunction(
  ts.transpileModule(navSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  ['require', 'module', 'exports'],
)(
  (id) =>
    id === './tokens'
      ? {
          ISSUERS: ['backpack', 'xstocks', 'ondo', 'prestocks', 'tessera'].map(
            (id) => ({ id }),
          ),
        }
      : require(id),
  navModule,
  navModule.exports,
);

async function renderDashboard(search, interact) {
  const Wrap = ({ children }) => React.createElement('div', null, children);
  const { MemberDashboard } = await component('member-dashboard.tsx', {
    ...(interact
      ? {
          react: {
            ...React,
            useState: (initial) => [
              typeof initial === 'function' ? initial() : initial,
              () => {},
            ],
            useEffect: () => {},
            useRef: (initial) => ({ current: initial }),
            useCallback: (fn) => fn,
            useId: () => 'test-id',
          },
        }
      : {}),
    '@/lib/member-navigation': navModule.exports,
    './member-home': { MemberHomePanel: Empty },
    './member-markets': { MemberMarkets: Empty },
    './member-section-boundary': { MemberSectionBoundary: Wrap },
    '@/lib/client-module': { loadClientModule: (load) => load() },
    './site-link': { default: Wrap },
    './float-logo': { FloatLogo: Empty },
    './holdings-update-info': { HoldingsUpdateInfo: Empty },
    './backpack-dashboard': { BackpackDashboardPage: Empty },
    './ui/button': { Button: Wrap },
    './ui/checkbox': { Checkbox: Empty },
    './ui/dialog': {
      Dialog: Empty,
      DialogContent: Wrap,
      DialogTitle: Wrap,
      DialogDescription: Wrap,
    },
    './search-picker': { SearchPicker: Empty },
    './community-thread': { Thread: Empty },
    './room-directory': { RoomDirectory: Empty },
    './room-creator': { RoomCreator: Empty },
    './market-overview': { MarketOverviewPanel: Empty },
    './theme-toggle': { ThemeToggle: Empty },
    './member-avatar': { MemberAvatar: Empty },
    './member-brief': { MemberBrief: Empty },
    './holder-tier-badge': { HolderTierBadge: Empty },
    '@/lib/holder-tier': { HOLDER_TIERS: tierLevels },
    '@/lib/client': { api: () => {} },
    '@/lib/community-post': {
      communityPostErrors: () => ({}),
      POST_LIMITS: { title: { max: 200 }, body: { max: 50000 } },
    },
  });
  const previous = globalThis.window;
  const pushed = [];
  globalThis.window = {
    location: { search, href: 'https://example.com/' + search },
    scrollY: 0,
    history: { pushState: (_, __, url) => pushed.push(url) },
  };
  try {
    const props = {
      status: {
        member: {
          id: 'me',
          alias: 'Alias',
          qualifying_symbol: 'MU',
          show_badge: 0,
          notify_replies: 1,
          verified_until: Date.now() + 60000,
        },
        memberCount: 1,
        threadCount: 0,
        admin: false,
      },
      refreshStatus: async () => {},
      renew: () => {},
    };
    if (interact) return interact(MemberDashboard(props), pushed);
    return renderToStaticMarkup(React.createElement(MemberDashboard, props));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}
void test('old Saved links open Discussions with Saved selected, not a separate destination', async () => {
  const html = await renderDashboard('?view=saved');
  assert.match(html, /<h1>Discussions<\/h1>/);
  assert.match(html, /<button aria-pressed="true">[^]*?Saved<\/button>/);
  assert.doesNotMatch(html.split('</aside>')[0], />Saved</);
  assert.match(html, /Holders only/);
  assert.doesNotMatch(html, /Members only/);
});
void test('Profile stays Profile after navigation and displays the private value badge control', async () => {
  const html = await renderDashboard('?view=profile');
  assert.match(html, /<h1>Profile<\/h1>/);
  assert.match(html, /Show value badge/);
  assert.match(html, /Exact balances stay private/);
});

void test('Saved filter survives a fresh page load through its own URL', async () => {
  const html = await renderDashboard('?view=home&feed=saved');
  assert.match(html, /<h1>Discussions<\/h1>/);
  assert.match(html, /<button aria-pressed="true">[^]*?Saved<\/button>/);
});

void test('old Calendar links open Home and Calendar is absent from sidebar destinations', async () => {
  const html = await renderDashboard('?view=calendar');
  assert.match(html, /member-shell markets-view home-view/);
  assert.doesNotMatch(html.split('</aside>')[0], />Calendar</);
  for (const name of ['Home', 'Markets', 'Discussions', 'Profile'])
    assert.ok(html.split('</aside>')[0].includes(name));
});

const agendaItem = (id, day = '2026-09-20') => ({
  id,
  title: 'Event ' + id,
  symbols: ['MU'],
  event_at: null,
  event_date: day,
  certainty: 'confirmed',
  url: 'https://example.com/events/' + id,
});
function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
async function agendaFixture({
  expanded = false,
  error = '',
  hasMore = false,
} = {}) {
  const items = [
    agendaItem('one'),
    agendaItem('two'),
    agendaItem('three', '2026-09-21'),
  ];
  const key = `MU:MU:0:${localToday()}`;
  const states = [
    expanded,
    { key: 'MU:MU', page: 0 },
    { key, data: { items, hasMore }, error },
    0,
  ];
  let index = 0;
  const { UpcomingAgenda, groupAgendaEvents } = await component(
    'upcoming-agenda.tsx',
    {
      react: {
        ...React,
        useState: (initial) => {
          const i = index++;
          if (states[i] === undefined)
            states[i] = typeof initial === 'function' ? initial() : initial;
          return [
            states[i],
            (update) => {
              states[i] =
                typeof update === 'function' ? update(states[i]) : update;
            },
          ];
        },
        useEffect: () => {},
        useId: () => 'agenda',
      },
      '@/lib/client': { api: () => {} },
      '@/lib/editorial': { eventLabel: (i) => i.event_date },
    },
  );
  return {
    states,
    groupAgendaEvents,
    render: (symbol = 'MU') => {
      index = 0;
      return UpcomingAgenda({ symbol, holdingsKey: 'MU', refresh: 0 });
    },
  };
}
void test('Upcoming previews two events and View all expands the same dated agenda', async () => {
  const f = await agendaFixture();
  const tree = f.render();
  let html = renderToStaticMarkup(tree);
  assert.match(html, /Event one/);
  assert.match(html, /Event two/);
  assert.doesNotMatch(html, /Event three/);
  const previous = globalThis.window;
  let nextUrl = '';
  globalThis.window = {
    location: { href: 'https://test.local/?view=brief' },
    history: {
      replaceState: (_, __, url) => {
        nextUrl = url;
      },
    },
  };
  try {
    tree.props.children[0].props.children[1].props.onClick();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  html = renderToStaticMarkup(f.render());
  assert.match(html, /Event three/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(nextUrl, /agenda=open/);
  assert.match(html, /https:\/\/example.com\/events\/three/);
  assert.equal(
    f.groupAgendaEvents([
      agendaItem('b', '2026-09-21'),
      agendaItem('a'),
      agendaItem('c'),
    ]).length,
    2,
  );
});
void test('changing the stock filter hides the previous agenda while new events load', async () => {
  const f = await agendaFixture({ expanded: true });
  const html = renderToStaticMarkup(f.render('SPCX'));
  assert.match(html, /Loading events/);
  assert.doesNotMatch(html, /Event one/);
});
void test('agenda failures are explicit and longer agendas expose bounded pagination', async () => {
  const failed = await agendaFixture({ error: 'Events unavailable.' });
  const html = renderToStaticMarkup(failed.render());
  assert.match(html, /Events unavailable/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /No upcoming events/);
  const paged = await agendaFixture({ expanded: true, hasMore: true });
  assert.match(
    renderToStaticMarkup(paged.render()),
    /aria-label="Event pages"/,
  );
});

async function marketFixture(props = {}, valuation = {}) {
  const states = [];
  let index = 0;
  const Wrap = ({ children }) => React.createElement('div', null, children);
  const tokens = [
    {
      symbol: 'MU',
      underlyingSymbol: 'MU',
      shortName: 'Micron',
      name: 'Micron',
      issuer: 'backpack',
      mint: 'mint1',
      source: 'https://example.com/mu',
    },
    {
      symbol: 'GOOGLon',
      underlyingSymbol: 'GOOGL',
      shortName: 'Alphabet',
      name: 'Alphabet',
      issuer: 'ondo',
      mint: 'mint2',
      source: 'https://example.com/googl',
    },
  ];
  const { MarketOverviewPanel } = await component('market-overview.tsx', {
    react: {
      ...React,
      useState: (initial) => {
        const i = index++;
        if (!(i in states))
          states[i] = typeof initial === 'function' ? initial() : initial;
        return [
          states[i],
          (update) => {
            states[i] =
              typeof update === 'function' ? update(states[i]) : update;
          },
        ];
      },
      useEffect: () => {},
      useRef: (v) => ({ current: v }),
    },
    '@/lib/client': { api: () => {} },
    '@/lib/tokens': {
      TOKENS: tokens,
      ISSUERS: [
        { id: 'backpack', name: 'Backpack' },
        { id: 'ondo', name: 'Ondo' },
      ],
      MARKET_BATCH_SIZE: 90,
      issuerName: (id) => id,
    },
    '@/lib/market-data': {},
    '@/hooks/use-market-overview': {
      useMarketOverview: () => ({ data: null, busy: false, error: '' }),
    },
    './ui/button': { Button: Wrap },
    './portfolio-summary': {
      PortfolioSummary: () =>
        React.createElement('div', null, 'Portfolio summary'),
    },
    './market-stock-row': {
      MarketStockRow: ({ symbol, held, children }) =>
        React.createElement(
          'tr',
          null,
          React.createElement('td', null, symbol, held ? ' Held' : ''),
          children,
        ),
    },
    './solana-ecosystem': {
      SolanaEcosystem: () =>
        React.createElement('div', null, 'Market-wide totals'),
    },
    '@/lib/token-observation': {
      trackedValuation: () => ({
        total: 24000,
        issuers: [
          { id: 'backpack', total: 12000 },
          { id: 'ondo', total: 12000 },
        ],
      }),
      issuerValuation: () => ({
        label: 'Minted value',
        basis: 'minted',
        total: 12000,
        valued: [{}],
        rows: [{}, {}],
        issuerCount: 1,
        ...valuation,
      }),
      tokenValuation: () => ({
        value: 12000,
        label: 'Minted value',
        basis: 'Minted',
      }),
      tokenObservation: () => ({
        price: null,
        change24h: null,
        issuedValue: null,
        cmcDexVolume24h: null,
        poolVolume24h: null,
        priceTime: null,
        supply: null,
      }),
    },
  });
  return {
    states,
    render: () => {
      index = 0;
      return MarketOverviewPanel({ holdings: ['MU'], positions: [], ...props });
    },
  };
}
function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}
void test('one market table filters to owned tokens without removing market-wide metrics', async () => {
  const f = await marketFixture();
  const tree = f.render();
  let html = renderToStaticMarkup(tree);
  assert.match(html, /GOOGLon/);
  assert.match(html, /MU Held/);
  assert.match(html, /Market-wide totals/);
  assert.doesNotMatch(html, /Solana overview/);
  findElement(tree, (e) => e.props?.role === 'switch').props.onChange({
    target: { checked: true },
  });
  html = renderToStaticMarkup(f.render());
  assert.doesNotMatch(html, /GOOGLon/);
  assert.match(html, /MU Held/);
  assert.match(html, /Market-wide totals/);
  assert.match(html, /Portfolio summary/);
});

void test('News keeps its agenda visible when the headline request fails', async () => {
  let index = 0;
  const key = 'holder-news?symbol=MU&offset=0&holdings=MU';
  const states = [
    null,
    'Headline request failed',
    0,
    key,
    false,
    { key: 'news:MU:MU', page: 0 },
    localToday(),
  ];
  const Wrap = ({ children }) => React.createElement('div', null, children);
  const { MemberBrief } = await component('member-brief.tsx', {
    react: {
      ...React,
      useState: () => [states[index++], () => {}],
      useEffect: () => {},
      useRef: () => ({ current: '' }),
    },
    './ui/button': { Button: Wrap },
    './search-picker': { SearchPicker: () => null },
    './upcoming-agenda': {
      UpcomingAgenda: ({ symbol }) =>
        React.createElement('section', null, 'Agenda for ' + symbol),
    },
    '@/lib/client': { api: () => {} },
    '@/lib/tokens': { TOKENS: [] },
    '@/lib/editorial': { eventLabel: () => '' },
  });
  const html = renderToStaticMarkup(
    MemberBrief({
      kind: 'news',
      holdings: ['MU'],
      symbol: 'MU',
      onSymbolChange: () => {},
      onDiscuss: () => {},
    }),
  );
  assert.match(html, /Headline request failed/);
  assert.match(html, /Agenda for MU/);
});

void test('compact issuer filters select and reset while the table prioritizes trading data', async () => {
  const f = await marketFixture();
  let tree = f.render();
  const filters = () =>
    findElement(tree, (e) => e.props?.['aria-label'] === 'Filter by issuer');
  const button = (name) =>
    findElement(
      filters(),
      (e) => e.type === 'button' && e.props['aria-label'] === name,
    );
  assert.equal(button('All issuers').props['aria-pressed'], true);
  button('Ondo').props.onClick();
  tree = f.render();
  let html = renderToStaticMarkup(tree);
  assert.equal(button('Ondo').props['aria-pressed'], true);
  assert.match(html, /GOOGLon/);
  assert.doesNotMatch(html, /MU Held/);
  assert.match(html, /Market-wide totals/);
  assert.match(html, /Portfolio summary/);
  const cards = findElement(
    tree,
    (e) => typeof e.props?.onIssuer === 'function',
  );
  assert.doesNotMatch(
    renderToStaticMarkup(filters()),
    /Minted value|Circulating value/,
  );
  assert.match(renderToStaticMarkup(filters()), /title="1 tokenized stocks"/);
  const table = findElement(
    tree,
    (e) => e.type === 'table' && e.props.className === 'market-table',
  );
  const body = findElement(table, (e) => e.type === 'tbody');
  assert.doesNotMatch(renderToStaticMarkup(body), />Minted<|>Circulating</);
  assert.match(renderToStaticMarkup(table), /About DEX volume/);
  assert.match(renderToStaticMarkup(table), /Pool liquidity/);
  assert.doesNotMatch(html, /Not verified/);
  assert.equal(button('Ondo').props.type, 'button');
  assert.doesNotMatch(html, /issuer-card/);
  cards.props.onIssuer('backpack');
  tree = f.render();
  assert.equal(button('Backpack').props['aria-pressed'], true);
  html = renderToStaticMarkup(tree);
  assert.match(html, /MU Held/);
  assert.doesNotMatch(html, /GOOGLon/);
  button('All issuers').props.onClick();
  tree = f.render();
  html = renderToStaticMarkup(tree);
  assert.match(html, /MU Held/);
  assert.match(html, /GOOGLon/);
  assert.equal(button('All issuers').props['aria-pressed'], true);
});

void test('Ecosystem overview keeps valuation estimates and their caveats inside collapsed coverage', async () => {
  const issuers = [
    {
      id: 'xstocks',
      name: 'xStocks',
      url: 'https://xstocks.fi',
      label: 'Circulating value',
      total: 1000,
      rows: [{}],
      valued: [{}],
      delayed: true,
      observedAt: 1,
    },
    {
      id: 'backpack',
      name: 'Backpack',
      url: 'https://backpack.exchange',
      label: 'Minted value',
      total: 500,
      rows: [{}, {}],
      valued: [{}],
    },
  ];
  const { SolanaEcosystem } = await component('solana-ecosystem.tsx', {
    '@/lib/tokens': {
      TOKENS: [
        { symbol: 'MUx', underlyingSymbol: 'MU' },
        { symbol: 'MU', underlyingSymbol: 'MU' },
      ],
      ISSUERS: issuers,
    },
    '@/lib/token-observation': {
      trackedValuation: () => ({
        total: 1500,
        issuers,
        partial: true,
        mixedBases: true,
        delayed: true,
        rows: [{}, {}, {}],
        valued: [
          { symbol: 'MUx', value: 1000 },
          { symbol: 'MU', value: 500 },
        ],
        issuerCount: 2,
      }),
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(SolanaEcosystem, {
      data: null,
      now: 1,
      onIssuer: () => {},
      select: () => {},
    }),
  );
  assert.equal((html.match(/<details/g) || []).length, 1);
  const headline = html.split('<details')[0];
  assert.match(headline, /Tracked onchain value/);
  assert.match(headline, /\$1.5K/);
  assert.doesNotMatch(headline, /circulating market cap/);
  assert.match(headline, /Tokens/);
  assert.match(headline, /Underlying assets/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[ =>])/);
  assert.match(html, /Coverage &amp; methodology/);
  assert.match(html, /2 \/ 2 issuers/);
  assert.match(html, /Tracked value · est./);
  assert.match(html, /Mixed supply bases/);
  assert.match(html, /Partial coverage/);
  assert.match(html, /Includes delayed data/);
  assert.match(html, /\$1.5K/);
  assert.doesNotMatch(
    html,
    /xStocks circulating value|issuer-comparison|issuer-card/,
  );
});

void test('Legacy Backpack links open Markets and preserve the four-item member shell', async () => {
  const html = await renderDashboard('?view=backpack');
  const nav = html.match(
    /<nav[^>]*aria-label="Member navigation"[^>]*>([\s\S]*?)<\/nav>/,
  )?.[1];
  assert.ok(nav);
  assert.match(nav, /<button aria-current="page">[^]*?Markets[^]*?<\/button>/);
  assert.equal((nav.match(/<button/g) || []).length, 4);
  assert.doesNotMatch(nav, />Backpack</);
  assert.doesNotMatch(nav, /href="\/backpack"/);
  assert.match(html, /member-shell markets-view/);
  assert.match(html, /member-sidebar/);
  assert.match(html, /Loading markets/);
  assert.doesNotMatch(html, /<h1>Profile/);
});

void test('Legacy routes and direct issuer links resolve consistently', () => {
  assert.equal(navModule.exports.memberLocation('').view, 'overview');
  assert.equal(
    navModule.exports.memberLocation('?view=brief').view,
    'overview',
  );
  assert.equal(navModule.exports.memberLocation('?view=calendar').agenda, true);
  assert.equal(navModule.exports.memberLocation('?view=saved').feed, 'saved');
  assert.equal(
    navModule.exports.memberLocation('?view=backpack').market,
    'backpack',
  );
  assert.deepEqual(
    navModule.exports.memberLocation('?view=markets&issuer=backpack'),
    navModule.exports.memberLocation('?view=backpack'),
  );
});

void test('Home news starts with five headlines, expands on demand, and Discuss passes the exact source', async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: 'n' + i,
    title: 'Micron headline ' + i,
    publisher: 'Publisher',
    published_at: Date.now(),
    url: 'https://example.com/news/' + i,
    symbols: ['MU'],
    kind: 'news',
    coverage: 'direct',
  }));
  const key = 'holder-news?symbol=MU&offset=0&holdings=MU';
  const states = [
    { items, hasMore: true, lastReviewed: Date.now() },
    '',
    0,
    key,
    false,
    { key: 'news:MU:MU', page: 0 },
    localToday(),
  ];
  let index = 0;
  const Wrap = ({ children, ...props }) =>
    React.createElement('button', props, children);
  const { MemberBrief, SourceCard } = await component('member-brief.tsx', {
    react: {
      ...React,
      useState: () => {
        const i = index++;
        return [
          states[i],
          (update) => {
            states[i] =
              typeof update === 'function' ? update(states[i]) : update;
          },
        ];
      },
      useEffect: () => {},
      useRef: () => ({ current: '' }),
    },
    './ui/button': { Button: Wrap },
    './search-picker': { SearchPicker: () => null },
    './upcoming-agenda': {
      UpcomingAgenda: () =>
        React.createElement('aside', null, 'Upcoming events'),
    },
    '@/lib/client': { api: () => {} },
    '@/lib/tokens': { TOKENS: [] },
    '@/lib/editorial': { eventLabel: () => '' },
  });
  let selected;
  const render = () => {
    index = 0;
    return MemberBrief({
      kind: 'news',
      compact: true,
      holdings: ['MU'],
      symbol: 'MU',
      onSymbolChange: () => {},
      onDiscuss: (item) => {
        selected = item;
      },
    });
  };
  let tree = render();
  assert.equal(elements(tree, SourceCard).length, 5);
  const source = elements(tree, SourceCard)[0];
  source.props.onDiscuss(source.props.item);
  assert.equal(selected.url, items[0].url);
  findElement(
    tree,
    (e) => e.type === 'button' && e.props.className === 'brief-expand',
  ).props.onClick();
  tree = render();
  assert.equal(elements(tree, SourceCard).length, 12);
  assert.match(renderToStaticMarkup(tree), /Older news/);
  assert.match(renderToStaticMarkup(tree), /Upcoming events/);
  for (const failure of [
    { unavailable: 1 },
    { notice: 'Could not update. Showing saved headlines.' },
  ]) {
    states[0] = { items, ...failure };
    const delayed = renderToStaticMarkup(render());
    assert.match(delayed, /Updates delayed/);
    assert.match(delayed, /Micron headline/);
    assert.doesNotMatch(delayed, /Retry|inline-status|Try again/);
  }
  states[0] = { items: [], unavailable: 1 };
  const empty = renderToStaticMarkup(render());
  assert.match(empty, /News temporarily unavailable/);
  assert.match(empty, /Try again/);
  assert.doesNotMatch(empty, /Updates delayed|inline-status/);
  states[0] = { items };
  assert.doesNotMatch(renderToStaticMarkup(render()), /Updates delayed/);
});

void test('Issuer filters remain usable when valuation data is delayed', async () => {
  const f = await marketFixture(
    {},
    { delayed: true, observedAt: Date.now() - 3600000 },
  );
  const tree = f.render();
  const filters = findElement(
    tree,
    (e) => e.props?.['aria-label'] === 'Filter by issuer',
  );
  const html = renderToStaticMarkup(filters);
  assert.match(html, /Backpack/);
  assert.match(html, /Ondo/);
  assert.match(html, /issuer-filter-count/);
  assert.doesNotMatch(html, /Delayed|Minted|Circulating|Unavailable/);
});

void test('Home portfolio links filter the existing news area and market navigation stays explicit', async () => {
  let selected,
    markets = 0;
  const positions = [holding('MU')];
  const Portfolio = () => null;
  const News = () => null;
  const { MemberHomePanel } = await component('member-home.tsx', {
    './portfolio-summary': { PortfolioSummary: Portfolio },
    './member-brief': { MemberBrief: News },
    '@/hooks/use-market-overview': {
      useMarketOverview: (_holdings, _refresh, scope) => {
        assert.equal(scope, 'holdings');
        return { data: null, error: '' };
      },
    },
    '@/lib/client': { api: Empty },
    react: {
      ...React,
      useState: (initial) => [
        typeof initial === 'function' ? initial() : initial,
        () => {},
      ],
      useEffect: () => {},
    },
  });
  const tree = MemberHomePanel({
    positions,
    revision: 0,
    symbol: 'all',
    onSymbolChange: (s) => {
      selected = s;
    },
    onMarkets: () => markets++,
    onDiscuss: Empty,
    onThread: (id) => {
      assert.equal(typeof id, 'string');
    },
    onDiscussions: Empty,
    onCreate: Empty,
  });
  const prior = globalThis.document;
  globalThis.document = { getElementById: () => ({ scrollIntoView() {} }) };
  try {
    elements(tree, Portfolio)[0].props.onSelect('MU');
  } finally {
    globalThis.document = prior;
  }
  assert.equal(selected, 'MU');
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Latest news/);
  assert.match(html, /Holder discussions/);
  assert.match(html, /Explore markets/);
  assert.doesNotMatch(html, /Backpack dashboard/);
});

void test('Stock details expand under the selected row and collapse without navigating away', async () => {
  const f = await marketFixture();
  let tree = f.render();
  assert.doesNotMatch(renderToStaticMarkup(tree), /id="selected-stock-detail"/);
  const row = () =>
    findElement(
      tree,
      (e) =>
        e.props?.symbol === 'MU' && typeof e.props?.onSelect === 'function',
    );
  row().props.onSelect('MU');
  tree = f.render();
  const detail = findElement(
    tree,
    (e) => e.type === 'tr' && e.props.className === 'stock-detail-row',
  );
  assert.ok(detail);
  assert.equal(detail.props.children.props.colSpan, 5);
  assert.match(renderToStaticMarkup(detail), /id="selected-stock-detail"/);
  assert.equal(row().props.selected, true);
  row().props.onSelect('MU');
  tree = f.render();
  assert.doesNotMatch(renderToStaticMarkup(tree), /id="selected-stock-detail"/);
});

void test('All issuer deep links resolve inside Markets and unknown issuers reset safely', () => {
  for (const issuer of [
    'backpack',
    'xstocks',
    'ondo',
    'prestocks',
    'tessera',
  ]) {
    const location = navModule.exports.memberLocation(
      '?view=markets&issuer=' + issuer,
    );
    assert.equal(location.view, 'markets');
    assert.equal(location.market, issuer);
  }
  assert.equal(
    navModule.exports.memberLocation('?view=markets&issuer=invalid').market,
    'all',
  );
});

void test('Issuer buttons open their matching dashboard when used inside Markets', async () => {
  const opened = [];
  const f = await marketFixture({ onIssuer: (issuer) => opened.push(issuer) });
  for (const name of ['Backpack', 'Ondo']) {
    const tree = f.render();
    findElement(
      tree,
      (e) => e.type === 'button' && e.props['aria-label'] === name,
    ).props.onClick();
  }
  assert.deepEqual(opened, ['backpack', 'ondo']);
});

void test('Markets sidebar resets every issuer dashboard to All markets and clears the stock deep link', async () => {
  for (const issuer of [
    'backpack',
    'xstocks',
    'ondo',
    'prestocks',
    'tessera',
  ]) {
    await renderDashboard(
      '?view=markets&issuer=' + issuer + '&stock=MU',
      (tree, pushed) => {
        const nav = findElement(
          tree,
          (e) => e.props?.['aria-label'] === 'Member navigation',
        );
        const button = findElement(
          nav,
          (e) =>
            e.type === 'button' &&
            React.Children.toArray(e.props.children).includes('Markets'),
        );
        assert.ok(button);
        button.props.onClick();
        const url = new URL(pushed[0], 'https://example.com');
        assert.equal(url.searchParams.get('view'), 'markets');
        assert.equal(url.searchParams.has('issuer'), false);
        assert.equal(url.searchParams.has('stock'), false);
      },
    );
  }
});
