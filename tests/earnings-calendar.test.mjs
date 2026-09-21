import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = await mkdtemp(tmpdir() + '/float-calendar-');
const source = await readFile(
  new URL('../lib/earnings-calendar.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
await writeFile(dir + '/calendar.mjs', output);
const { calendarDates, parseNasdaqEarnings } = await import(
  pathToFileURL(dir + '/calendar.mjs')
);

void test('earnings dates roll across month boundaries in UTC', () => {
  assert.deepEqual(calendarDates(new Date('2026-09-30T23:00:00Z'), 3), [
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
  ]);
});

void test('calendar uses exact ticker plus company identity and tags each issuer once', () => {
  const tokens = [
    { symbol: 'MU', underlyingSymbol: 'MU', name: 'Micron Technology' },
    { symbol: 'MUx', underlyingSymbol: 'MU', name: 'Micron Technology' },
    { symbol: 'BOT', underlyingSymbol: 'BOT', name: 'RoboStrategy' },
  ];
  const body = {
    status: { rCode: 200 },
    data: {
      asOf: 'Sep 30, 2026',
      rows: [
        { symbol: 'MU', name: 'Micron Technology Inc.' },
        { symbol: 'MU', name: 'Micron Technology Inc.' },
        { symbol: 'BOT', name: 'Botanic Industries' },
      ],
    },
  };
  const events = parseNasdaqEarnings(body, '2026-09-30', tokens);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].symbols, ['MU', 'MUx']);
  assert.match(events[0].url, /date=2026-09-30/);
});

void test('malformed or wrong-day source responses are rejected instead of clearing events', () => {
  assert.throws(() =>
    parseNasdaqEarnings(
      { status: { rCode: 200 }, data: { asOf: 'Sep 29, 2026', rows: [] } },
      '2026-09-30',
      [],
    ),
  );
  assert.throws(() =>
    parseNasdaqEarnings(
      { status: { rCode: 429 }, data: { asOf: 'Sep 30, 2026', rows: [] } },
      '2026-09-30',
      [],
    ),
  );
});
