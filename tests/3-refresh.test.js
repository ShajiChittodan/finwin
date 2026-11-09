// 3) Do entries survive a page refresh?
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const D = require('./demo');

let app, p;
test.before(async () => { app = await H.openApp(); p = app.page; });
test.after(async () => { await app.close(); });

test('first visit loads the dummy data in AED and saves it to localStorage', async () => {
  assert.equal(await H.netWorth(p), H.aed(D.totals().netWorth));
  const s = await H.savedState(p);
  assert.equal(s.app, 'FinWin');
  assert.equal(s.base, 'AED');
  assert.equal(s.data.holdings.length, 9);
  assert.equal(s.data.liabilities.length, 3);
});

test('new entries, edits and settings are all still there after refresh', async () => {
  // a new holding
  await p.click('.qa-top');
  await p.fill('#q-name', 'Refresh check');
  await p.fill('#q-inv', '1000');
  await p.fill('#q-cur', '1234');
  await p.click('.sheet .sfoot .btn.primary');
  // an edit
  await H.go(p, 'Holdings');
  await p.click('.hrow:has-text("Crypto")');
  await p.fill('#uv-val', '4100');
  await p.click('button:has-text("Log update")');
  // settings and FIRE inputs
  await H.go(p, 'Settings');
  await p.selectOption('#s-num', 'eu');
  await p.selectOption('#s-date', 'iso');
  await p.click('.seg button:has-text("Dark")');
  await H.go(p, 'FIRE');
  await p.fill('#fi-age', '40');
  await p.fill('#fa-ret', '6.5');
  await H.go(p, 'Dashboard');
  const before = await H.text(p, '.bignum');

  await p.reload();
  await p.waitForSelector('.shell');
  assert.equal(await H.text(p, '.bignum'), before, 'net worth unchanged after refresh');
  assert.match(await p.getAttribute('.app', 'class'), /dark/, 'dark theme kept');
  await H.go(p, 'Holdings');
  assert.ok((await H.text(p, '.hrow:has-text("Refresh check")')).includes('1.234'), 'new holding kept (EU number format)');
  await p.click('.hrow:has-text("Crypto")');
  assert.equal(await p.locator('.card:has-text("Value history") .list .li').count(), 5, '4 demo entries + the logged update');
  assert.ok((await H.text(p, '.card:has-text("Value history") .list')).includes(H.isoToday()), 'ISO date format kept');
  await H.go(p, 'FIRE');
  assert.equal(await p.inputValue('#fi-age'), '40');
  assert.equal(await p.inputValue('#fa-ret'), '6.5');
  await H.go(p, 'Settings');
  assert.equal(await p.inputValue('#s-num'), 'eu');
  assert.equal(await p.inputValue('#s-base'), 'AED');
});

test('a second tab sees the same saved data', async () => {
  const p2 = await app.context.newPage();
  await p2.goto(app.server.url);
  await p2.waitForSelector('.shell');
  await H.go(p2, 'Holdings');
  assert.equal(await p2.locator('.hrow:has-text("Refresh check")').count(), 1);
  await p2.close();
});

test('erasing all data survives a refresh (the demo data does not come back)', async () => {
  await H.go(p, 'Settings');
  await p.click('button:has-text("Erase all data on this device")');
  await p.fill('#er-in', 'DELETE');
  await p.click('.sheet button:has-text("Erase all data")');
  await p.reload();
  await p.waitForSelector('.shell');
  assert.match(await H.text(p, '.content'), /Welcome to FinWin/);
  const s = await H.savedState(p);
  assert.equal(s.data.holdings.length, 0);
  assert.equal(s.base, 'AED');
});

test('an entry added after erasing is kept after refresh', async () => {
  await p.click('.qa-top');
  await p.fill('#q-name', 'Only holding');
  await p.fill('#q-inv', '500');
  await p.fill('#q-cur', '750');
  await p.click('.sheet .sfoot .btn.primary');
  await p.reload();
  await p.waitForSelector('.shell');
  assert.equal(await H.netWorth(p), 'AED 750');
});

test('unreadable saved data is kept aside, never silently overwritten', async () => {
  await p.evaluate(() => localStorage.setItem('finwin:v1', '{this is not json'));
  await p.reload();
  await p.waitForSelector('.shell');
  const keys = await p.evaluate(() => Object.keys(localStorage));
  const aside = keys.find((k) => k.startsWith('finwin:v1:unreadable-'));
  assert.ok(aside, 'a copy of the unreadable data was kept');
  assert.equal(await p.evaluate((k) => localStorage.getItem(k), aside), '{this is not json');
  assert.equal(app.errors.filter((e) => !/saved data could not be read/.test(e)).length, 0, 'no other errors');
});
