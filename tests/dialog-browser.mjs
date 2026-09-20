// UI fixtures intercept browser requests only. They never create hosted members or content.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const output = process.env.QA_OUTPUT || '/tmp/holderpulse-ui-qa';
await mkdir(output, { recursive: true });
const errors = [];
let checks = 0;
async function fits(page, label) {
  await page.getByRole('dialog').waitFor();
  await page.waitForFunction(() => {
    const e = document.querySelector('[role=dialog]');
    return (
      e &&
      Number(getComputedStyle(e).opacity) === 1 &&
      e.getAnimations().every((a) => a.playState !== 'running')
    );
  });
  const r = await page.getByRole('dialog').evaluate((el) => {
    const b = el.getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      right: b.right,
      bottom: b.bottom,
      width: innerWidth,
      height: innerHeight,
      client: el.clientWidth,
      scroll: el.scrollWidth,
      display: getComputedStyle(el).display,
    };
  });
  assert.ok(
    r.x >= 0 && r.y >= 0 && r.right <= r.width + 1 && r.bottom <= r.height + 1,
    label + JSON.stringify(r),
  );
  assert.ok(r.scroll <= r.client + 1, label + ' horizontal overflow');
  assert.equal(r.display, 'flex');
  checks += 3;
}
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 500 ? 740 : 1000 },
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page
      .getByRole('button', { name: 'Connect wallet & join', exact: true })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Page overflow ' + width,
    );
    checks++;
    await page.screenshot({
      path: output + '/home-' + width + '.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Connect wallet & join', exact: true })
      .click();
    await fits(page, 'Join ' + width);
    const dialog = page.getByRole('dialog'),
      action = dialog.getByRole('button', {
        name: 'Connect & verify',
        exact: true,
      });
    assert.ok(await action.isDisabled());
    checks++;
    await dialog
      .getByRole('combobox', { name: 'Your wallet', exact: true })
      .click();
    await page.getByRole('option', { name: 'Phantom', exact: true }).click();
    await dialog
      .getByRole('combobox', { name: 'Token you hold', exact: true })
      .click();
    await page
      .getByRole('option', { name: 'SKHY · SK Hynix', exact: true })
      .click();
    await dialog.getByRole('checkbox').check();
    assert.ok(await action.isEnabled());
    checks++;
    await action.click();
    await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').innerText(), /wallet browser/);
    checks++;
    await fits(page, 'Error ' + width);
    await page.screenshot({ path: output + '/join-' + width + '.png' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    checks++;
    // Synthetic member data is limited to this isolated browser context.
    const member = {
      id: 'fixture-member',
      alias: 'Test Holder',
      qualifying_symbol: 'MU',
      show_badge: 0,
      verified_until: Date.now() + 86400000,
      suspended: 0,
      created_at: Date.now(),
    };
    const thread = {
      id: 'fixture-thread',
      member_id: member.id,
      alias: member.alias,
      topic: 'SKHY',
      title: 'A browser-only discussion fixture',
      body: 'Content used only to verify dialog layout.',
      created_at: Date.now(),
      reply_count: 0,
      hidden: 0,
    };
    await page.route('**/api/community/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      const data = p.endsWith('/status')
        ? { member, admin: false, memberCount: 1, threadCount: 1 }
        : p.endsWith('/threads')
          ? { threads: [thread], nextCursor: null }
          : p.endsWith('/replies')
            ? { replies: [], nextCursor: null }
            : { ok: true };
      await route.fulfill({ json: data });
    });
    await page.reload();
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await fits(page, 'Profile ' + width);
    await page.screenshot({ path: output + '/profile-' + width + '.png' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await fits(page, 'Report ' + width);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await fits(page, 'Remove ' + width);
    await page.keyboard.press('Escape');
    await page.close();
  }
  assert.deepEqual(errors, [], 'Browser errors');
  checks++;
  console.log(
    checks +
      ' UI checks passed across desktop, tablet, and 390/320px mobile: page overflow, four dialogs, dropdowns, consent, wallet-error rendering, close and Escape.',
  );
} finally {
  await browser.close();
}
