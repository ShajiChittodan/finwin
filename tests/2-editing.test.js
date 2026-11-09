// 2) Does editing actually work?
// Each change is made through the app's own screens, then the totals are checked
// against independently calculated values.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');
const D = require('./demo');

let app, p;
const hs = D.clone(D.holdings), ls = D.clone(D.liabilities), fx = D.clone(D.FX);
async function expectTotals(msg) {
  const t = D.totals(hs, ls, fx);
  assert.equal(await H.netWorth(p), H.aed(t.netWorth), msg + ': net worth');
  assert.equal(await H.tile(p, 'Total assets'), H.aed(t.assets), msg + ': total assets');
  assert.equal(await H.tile(p, 'Total liabilities'), H.aed(t.liabilities), msg + ': total liabilities');
}
const save = () => p.click('.sheet .sfoot .btn.primary');

test.before(async () => { app = await H.openApp(); p = app.page; });
test.after(async () => { await app.close(); });

test('starting totals match the dummy data', async () => { await expectTotals('start'); });

test('quick add: a new AED holding is added to every total', async () => {
  await p.click('.qa-top');
  await p.fill('#q-name', 'Emergency fund');
  await p.fill('#q-inv', '50000');
  await p.fill('#q-cur', '55000');
  assert.match(await H.text(p, '.livegain'), /\+AED 5,000 \(\+10\.0%\)/, 'live gain preview');
  await save();
  assert.match(await H.toast(p, /Saved — Emergency fund/), /Saved — Emergency fund/);
  hs.push({ name: 'Emergency fund', cur: 'AED', inv: 50000, cur$: 55000 });
  await expectTotals('after quick add');
  await H.go(p, 'Holdings');
  assert.ok((await H.text(p, '.hrow:has-text("Emergency fund")')).includes('AED 55,000'));
});

test('quick add: a holding in a new currency asks for its FX rate and converts with it', async () => {
  await p.click('.qa-top');
  await p.click('.sheet .curbtn');
  await p.fill('#q-search', 'EUR');
  await p.click('.sheet .pick:has-text("EUR")');
  await p.fill('#q-rate', '0.25'); // 1 AED = 0.25 EUR
  await p.fill('#q-name', 'Euro savings');
  await p.fill('#q-inv', '1000');
  await p.fill('#q-cur', '1200');
  await save();
  fx.EUR = 0.25 * fx.AED; // EUR per USD
  hs.push({ name: 'Euro savings', cur: 'EUR', inv: 1000, cur$: 1200 });
  await expectTotals('after EUR holding');
  await H.go(p, 'Holdings');
  assert.ok((await H.text(p, '.hrow:has-text("Euro savings")')).includes('AED 4,800'), '€1,200 ÷ 0.25 = AED 4,800');
  await H.go(p, 'Settings');
  assert.equal(await p.inputValue('#fx-EUR'), '0.25');
});

test('form validation: nothing saves without a name or with a negative amount', async () => {
  await p.click('.qa-top');
  await p.fill('#q-inv', '-5');
  await p.fill('#q-cur', '100');
  await save();
  assert.match(await H.text(p, '.sheet'), /Give this holding a name\./);
  assert.match(await H.text(p, '.sheet'), /Can’t be negative\./);
  await H.closeSheet(p);
  await expectTotals('after rejected form');
});

test('edit all fields: changing a holding value updates totals and logs history', async () => {
  await H.go(p, 'Holdings');
  await p.click('.hrow:has-text("Savings account")');
  const before = await p.locator('.card:has-text("Value history") .list .li').count();
  await p.click('button:has-text("Edit all fields")');
  assert.equal(await p.inputValue('#q-cur'), '12000', 'form is pre-filled');
  await p.fill('#q-cur', '15000');
  await p.fill('#q-name', 'Savings account (ENBD)');
  await save();
  assert.match(await H.toast(p, /Updated — Savings account \(ENBD\)/), /Updated — Savings account \(ENBD\)/);
  assert.equal(await p.locator('.card:has-text("Value history") .list .li').count(), before + 1, 'history entry added');
  hs[0].cur$ = 15000; hs[0].name = 'Savings account (ENBD)';
  await expectTotals('after edit');
});

test('log update: a new value from the holding page updates totals', async () => {
  await H.go(p, 'Holdings');
  await p.click('.hrow:has-text("Crypto")');
  await p.fill('#uv-val', '5000');
  await p.click('button:has-text("Log update")');
  assert.match(await H.toast(p, /Value logged for Crypto/), /Value logged for Crypto/);
  assert.equal(await H.text(p, '.bignum'), H.aed(D.toAED(5000, 'USD')));
  hs[7].cur$ = 5000;
  await expectTotals('after log update');
});

test('edit liability: a lower balance reduces total liabilities and moves the payoff date', async () => {
  await H.go(p, 'Liabilities');
  await p.click('.hrow:has-text("Car loan")');
  await p.click('button:has-text("Edit")');
  await p.fill('#q-bal', '30000');
  await save();
  ls[1].bal = 30000;
  const r = 0.07 / 12, months = -Math.log(1 - r * 30000 / 1450) / Math.log(1 + r);
  assert.ok((await H.text(p, '.list')).includes('Months remaining ' + H.num(months, 1)));
  await expectTotals('after liability edit');
});

test('quick add: a new liability is included in totals', async () => {
  await p.click('.qa-top');
  await p.click('.sheet button:has-text("Liability")');
  await p.fill('#q-lname', 'Personal loan');
  await p.fill('#q-bal', '20000');
  await save();
  ls.push({ name: 'Personal loan', cur: 'AED', bal: 20000 });
  await expectTotals('after adding liability');
});

test('FIRE switch: excluding a holding changes the FIRE portfolio only', async () => {
  await H.go(p, 'FIRE');
  const before = await H.text(p, '.formula .eq');
  await p.click('button:has-text("Choose which assets count")');
  await p.click('button.switch:has-text("Gold (100 g)")');
  const after = await H.text(p, '.formula .eq');
  assert.notEqual(before, after);
  const gold = D.toAED(10500, 'USD');
  const num = (s) => parseFloat(s.split(' = ')[1].replace(/[^\d.]/g, ''));
  assert.ok(Math.abs(num(before) - num(after) - gold) <= 1, 'FIRE portfolio drops by the gold value');
  await p.click('button.switch:has-text("Gold (100 g)")');
  assert.equal(await H.text(p, '.formula .eq'), before);
});

test('delete: removing a holding and a liability updates totals', async () => {
  await H.go(p, 'Holdings');
  await p.click('.hrow:has-text("Emergency fund")');
  await p.click('.card button:has-text("Delete")');
  assert.match(await H.text(p, '.sheet'), /“Emergency fund” will be removed/);
  await p.click('.sheet .btn.danger.fill');
  assert.match(await H.toast(p, /Deleted — Emergency fund/), /Deleted — Emergency fund/);
  assert.equal(await p.locator('.hrow:has-text("Emergency fund")').count(), 0);
  hs.splice(hs.findIndex((h) => h.name === 'Emergency fund'), 1);

  await H.go(p, 'Liabilities');
  await p.click('.hrow:has-text("Credit card")');
  await p.click('button:has-text("Edit")');
  await p.click('.sheet button:has-text("Delete")');
  await p.click('.sheet .btn.danger.fill');
  ls.splice(ls.findIndex((l) => l.name === 'Credit card'), 1);
  await expectTotals('after deletes');
});

test('no errors in the browser console', () => { assert.deepEqual(app.errors, []); });
