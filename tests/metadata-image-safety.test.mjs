import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createMetadataRouteEntryData } from '../node_modules/vinext/dist/server/metadata-route-build-data.js';

const metadataModule = new URL(
  '../node_modules/vinext/dist/server/metadata-route-build-data.js',
  import.meta.url,
).href;
const route = (
  filePath,
  contentType = 'image/png',
  type = 'opengraph-image',
) => ({
  filePath,
  contentType,
  type,
  isDynamic: false,
  routePrefix: '',
  servedUrl: type === 'icon' ? '/icon.svg' : '/opengraph-image',
});

void test('Patched metadata reader preserves raster dimensions and vector icons', () => {
  const pngPath = new URL('../public/wallets/backpack.png', import.meta.url);
  const bytes = readFileSync(pngPath);
  const entry = createMetadataRouteEntryData(route(pngPath));
  assert.equal(entry.headData.width, bytes.readUInt32BE(16));
  assert.equal(entry.headData.height, bytes.readUInt32BE(20));
  assert.ok(entry.headData.width > 0);
  assert.deepEqual(Buffer.from(entry.fileDataBase64, 'base64'), bytes);
  const svg = createMetadataRouteEntryData(
    route(
      new URL('../public/favicon.svg', import.meta.url),
      'image/svg+xml',
      'icon',
    ),
  );
  assert.equal(svg.headData.sizes, 'any');
  assert.equal(svg.headData.type, 'image/svg+xml');
});

void test('Malformed ICNS, JXL and HEIF metadata terminates with an error, without blocking the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'float-image-safety-'));
  try {
    // Zero-sized records/boxes are the infinite-loop triggers in the removed parser.
    const fixtures = [
      Buffer.from('69636e73000000106963303700000000', 'hex'),
      Buffer.from('0000000c4a584c200d0a870a000000006a786c63', 'hex'),
      Buffer.from(
        '00000018667479706865696300000000686569636d696631000000006d657461',
        'hex',
      ),
      Buffer.alloc(0),
      Buffer.from('unsupported file'),
    ];
    const paths = fixtures.map((bytes, i) => {
      const file = join(dir, `invalid-${i}.png`);
      writeFileSync(file, bytes);
      return file;
    });
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {createMetadataRouteEntryData} from ${JSON.stringify(metadataModule)};
      for (const filePath of ${JSON.stringify(paths)}) {
        assert.throws(() => createMetadataRouteEntryData({
          filePath, contentType:'image/png', type:'opengraph-image',
          isDynamic:false, routePrefix:'', servedUrl:'/opengraph-image'
        }), /Failed to read metadata image dimensions/);
      }
    `,
      ],
      { timeout: 3000, encoding: 'utf8' },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('The vulnerable image-size package cannot silently return in the dependency graph', () => {
  const lock = readFileSync(
    new URL('../pnpm-lock.yaml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(lock, /^\s+image-size@/m);
  const reader = readFileSync(new URL(metadataModule), 'utf8');
  assert.ok(reader.includes('image-dimensions'));
  assert.ok(!reader.includes('image-size'));
});
