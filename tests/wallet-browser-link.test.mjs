import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileBrowser,
  walletBrowserLink,
  walletLaunchIntent,
} from '../lib/wallet-browser-link.ts';
import { readWalletHandoff, walletHandoffId, WALLET_HANDOFF_KEY } from '../lib/wallet-handoff.ts';

void test('mobile wallet buttons open the current Float page in the selected wallet', () => {
  const page =
    'https://float-solana.darcsoulj.workers.dev/?view=overview&join=1#join';
  assert.equal(
    walletBrowserLink('backpack', page),
    'https://backpack.app/ul/v1/browse/' +
      encodeURIComponent(
        'https://float-solana.darcsoulj.workers.dev/?view=overview&join=1&float_wallet=backpack',
      ) +
      '?ref=' +
      encodeURIComponent('https://float-solana.darcsoulj.workers.dev'),
  );
  assert.match(walletBrowserLink('phantom', page), /^https:\/\/phantom\.app/);
  assert.equal(
    walletLaunchIntent(decodeURIComponent(walletBrowserLink('phantom', page).split('/browse/')[1].split('?ref=')[0])),
    'phantom',
  );
  assert.equal(walletLaunchIntent(page), null);
  assert.equal(walletLaunchIntent(page.replace('join=1', 'float_wallet=unknown')), null);
  assert.match(walletBrowserLink('solflare', page), /^https:\/\/solflare\.com/);
  const handoff = '85e158b6-5f36-4732-983c-54dd80d9a4ef';
  const link = walletBrowserLink('phantom', page, handoff);
  assert.equal(walletHandoffId(decodeURIComponent(link.split('/browse/')[1].split('?ref=')[0])), handoff);
  assert.equal(walletBrowserLink('unknown', page), null);
  assert.equal(walletBrowserLink('constructor', page), null);
  assert.equal(walletLaunchIntent(page.replace('join=1', 'float_wallet=constructor')), null);
  assert.equal(walletBrowserLink('backpack', 'javascript:alert(1)'), null);
});

void test('the installed app keeps the claim secret out of the wallet link', () => {
  const secret = 'a'.repeat(64);
  const handoff = { id: '85e158b6-5f36-4732-983c-54dd80d9a4ef', secret, expiresAt: 10000 };
  const storage = new Map([[WALLET_HANDOFF_KEY, JSON.stringify(handoff)]]);
  const store = { getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key) };
  assert.deepEqual(readWalletHandoff(store, 9000), handoff);
  const link = walletBrowserLink('backpack', 'https://float.example/', handoff.id);
  assert.ok(!link.includes(secret));
  assert.equal(readWalletHandoff(store, 10000), null);
  assert.equal(storage.has(WALLET_HANDOFF_KEY), false);
});

void test('mobile detection covers phones, Android and touch iPads', () => {
  assert.equal(isMobileBrowser('Mozilla/5.0 (iPhone)'), true);
  assert.equal(isMobileBrowser('Mozilla/5.0 (Linux; Android 15)'), true);
  assert.equal(isMobileBrowser('Mozilla/5.0', 'MacIntel', 5), true);
  assert.equal(isMobileBrowser('Mozilla/5.0', 'MacIntel', 0), false);
});
