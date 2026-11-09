// Extras: works offline after the first visit, and the phone / tablet layouts render without errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const H = require('./helpers');
const D = require('./demo');

test('works offline after the first visit (service worker)', async () => {
  const app = await H.openApp({ serviceWorkers: 'allow' });
  const p = app.page;
  try {
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); // now controlled by the service worker
    await p.waitForSelector('.shell');
    await app.context.setOffline(true);
    await p.reload();
    await p.waitForSelector('.shell');
    assert.equal(await H.netWorth(p), H.aed(D.totals().netWorth));
  } finally { await app.close(); }
});

for (const [label, opts] of [['phone (iPhone 13)', devices['iPhone 13']], ['tablet (iPad)', devices['iPad (gen 7)']]]) {
  test(`${label}: every screen renders, no sideways scrolling`, async () => {
    const server = await (async () => { const a = await H.openApp(); await a.browser.close(); return a.server; })();
    const browser = await chromium.launch();
    const ctx = await browser.newContext(Object.assign({}, opts, { serviceWorkers: 'block' }));
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    try {
      await p.goto(server.url);
      await p.waitForSelector('.shell');
      const sidebar = await p.locator('nav.sidebar').isVisible(); // tablets get the sidebar, phones the bottom tab bar
      const tabs = sidebar ? ['Holdings', 'Liabilities', 'FIRE', 'Settings', 'Dashboard'] : ['Holdings', 'Debts', 'FIRE', 'Settings', 'Home'];
      for (const tab of tabs) {
        await p.click(`nav.${sidebar ? 'sidebar' : 'tabbar'} button:has-text("${tab}")`);
        const wide = await p.evaluate(() => { const m = document.querySelector('.main'); return m.scrollWidth - m.clientWidth; });
        assert.ok(wide <= 1, `${tab}: content is ${wide}px wider than the screen`);
      }
      await p.click(sidebar ? '.qa-top' : '.fab'); // Quick add
      await p.waitForSelector('.sheet');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.srv.close(); }
  });
}
