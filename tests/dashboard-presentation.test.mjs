import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
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
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => overrides[id] ?? require(id),
    module,
    module.exports,
  );
  return module.exports;
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
test('Portfolio ring and list agree on value and allocation', async () => {
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
test('An unpriced holding suppresses allocation instead of presenting a false 100 percent', async () => {
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
test('Hide balances removes dollar values and allocation from the rendered chart and list', async () => {
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
test('Large portfolios group smaller holdings in the ring and initially show five rows', async () => {
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
test('Appearance offers direct Light selection, persists it, and synchronizes all controls', async () => {
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
test('value badge renders a compact label, never an exact balance, and hides expired tiers', async () => {
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
async function renderDashboard(search) {
  const Empty = () => null;
  const Wrap = ({ children }) => React.createElement('div', null, children);
  const { MemberDashboard } = await component('member-dashboard.tsx', {
    './site-link': { default: Wrap },
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
  globalThis.window = { location: { search } };
  try {
    return renderToStaticMarkup(
      React.createElement(MemberDashboard, {
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
      }),
    );
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}
test('old Saved links open Discussions with Saved selected, not a separate destination', async () => {
  const html = await renderDashboard('?view=saved');
  assert.match(html, /<h1>Discussions<\/h1>/);
  assert.match(html, /<button aria-pressed="true">[^]*?Saved<\/button>/);
  assert.doesNotMatch(html.split('</aside>')[0], />Saved</);
  assert.match(html, /Holders only/);
  assert.doesNotMatch(html, /Members only/);
});
test('Profile stays Profile after navigation and displays the private value badge control', async () => {
  const html = await renderDashboard('?view=profile');
  assert.match(html, /<h1>Profile<\/h1>/);
  assert.match(html, /Show value badge/);
  assert.match(html, /Exact balances stay private/);
});

test('Saved filter survives a fresh page load through its own URL', async () => {
  const html = await renderDashboard('?view=home&feed=saved');
  assert.match(html, /<h1>Discussions<\/h1>/);
  assert.match(html, /<button aria-pressed="true">[^]*?Saved<\/button>/);
});

test('old Calendar links open News and Calendar is absent from sidebar destinations', async () => {
  const html = await renderDashboard('?view=calendar');
  assert.match(html, /<h1>Your news<\/h1>/);
  assert.doesNotMatch(html.split('</aside>')[0], />Calendar</);
  for (const name of ['News', 'Markets', 'Discussions', 'Profile'])
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
  const key = `MU:MU:0:0:0:${localToday()}`;
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
test('Upcoming previews two events and View all expands the same dated agenda', async () => {
  const f = await agendaFixture();
  let tree = f.render();
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
test('changing the stock filter hides the previous agenda while new events load', async () => {
  const f = await agendaFixture({ expanded: true });
  const html = renderToStaticMarkup(f.render('SPCX'));
  assert.match(html, /Loading events/);
  assert.doesNotMatch(html, /Event one/);
});
test('agenda failures are explicit and longer agendas expose bounded pagination', async () => {
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

async function marketFixture() {
  const states = [];
  let index = 0;
  const Empty = () => null;
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
      MARKET_BATCH_SIZE: 90,
      issuerName: (id) => id,
    },
    '@/lib/market-data': {},
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
      tokenObservation: () => ({
        price: null,
        change24h: null,
        issuedValue: null,
        cmcDexVolume24h: null,
        priceTime: null,
        supply: null,
      }),
    },
  });
  return {
    states,
    render: () => {
      index = 0;
      return MarketOverviewPanel({ holdings: ['MU'], positions: [] });
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
test('one market table filters to owned tokens without removing market-wide metrics', async () => {
  const f = await marketFixture();
  let tree = f.render();
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

test('News keeps its agenda visible when the headline request fails', async () => {
  let index = 0;
  const key = 'holder-news?symbol=MU&offset=0&retry=0&holdings=MU';
  const states = [
    null,
    'Headline request failed',
    0,
    key,
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
