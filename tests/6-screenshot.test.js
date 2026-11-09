// 6) Paste a screenshot: the statement reader (unit tests) and the full flow in a browser,
// using a statement image generated here and read by the real on-device OCR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const P = require('../app/statement-parser.js');
const H = require('./helpers');
const D = require('./demo');

/* ---------- statement reader ---------- */
test('amounts: international, Indian, European and spaced formats', () => {
  assert.equal(P.parseAmount('1,234.56'), 1234.56);
  assert.equal(P.parseAmount('19,80,000'), 1980000);
  assert.equal(P.parseAmount('1.234.567,89'), 1234567.89);
  assert.equal(P.parseAmount('1234,56'), 1234.56);
  assert.equal(P.parseAmount('1 234 567'), 1234567);
  assert.equal(P.parseAmount('45,250.75'), 45250.75);
});

test('statement lines become rows with name, amount, currency and type', () => {
  const rows = P.parseStatement([
    'Emirates NBD - Account summary',
    'Statement date 09/11/2026',
    { text: 'Savings Account XXXX4521   AED 45,250.75', confidence: 93 },
    { text: 'Current account  AED 3,120.00', confidence: 60 },
    'Fixed Deposit 12 months 4.25%   AED 100,000',
    'Mutual fund', '₹ 19,80,000',
    'Total balance AED 148,370.75',
    'Customer ID 88213455',
  ], { base: 'AED', holdings: [{ id: 'h4', name: 'UAE fixed deposit' }] });
  const brief = rows.map((r) => [r.name, r.amount, r.cur, r.type]);
  assert.deepEqual(brief, [
    ['Savings Account', 45250.75, 'AED', 'cash'],
    ['Current account', 3120, 'AED', 'cash'],
    ['Fixed Deposit 12 months', 100000, 'AED', 'fd'],
    ['Mutual fund', 1980000, 'INR', 'mf'],
    ['Total balance', 148370.75, 'AED', 'cash'],
  ]);
  assert.equal(rows[0].conf, 'High');
  assert.equal(rows[1].conf, 'Please check', 'low OCR confidence is flagged');
  assert.equal(rows[2].match, 'new', 'only one meaningful word in common with “UAE fixed deposit”, so not auto-matched');
  assert.equal(rows[4].include, false, 'totals are left out so they are not counted twice');
});

test('matching ignores generic words: "Salary account" is not "Savings account"', () => {
  const hs = [{ id: 'h1', name: 'Savings account' }, { id: 'h4', name: 'UAE fixed deposit' }];
  assert.equal(P.matchHolding('Salary Account', hs), null);
  assert.equal(P.matchHolding('savings account', hs).id, 'h1', 'an exact name still matches');
  assert.equal(P.matchHolding('UAE Fixed Deposit 12m', hs).id, 'h4');
  assert.equal(P.matchHolding('Gold savings plan', [{ id: 'h6', name: 'Gold (100 g)' }]), null, 'one shared word is not enough');
});

test('dates, percentages, IDs and years are not mistaken for balances', () => {
  assert.deepEqual(P.parseStatement(['Statement period 01/10/2026 - 31/10/2026', 'Interest rate 4.25%', 'Account 1029384756', 'Since 2019'], { base: 'AED' }), []);
});

/* ---------- full flow in the browser ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finwin-shot-'));
async function makeImage(name, html) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 760, height: 420 }, deviceScaleFactor: 2 });
  await pg.setContent(`<body style="margin:0;padding:28px 36px;font:22px/1.9 Arial,sans-serif;color:#111;background:#fff">${html}</body>`);
  const file = path.join(tmp, name);
  await pg.screenshot({ path: file });
  await b.close();
  return file;
}
const STATEMENT = `
  <div style="font-weight:bold;font-size:26px">ADCB - Account summary</div>
  <div>Statement date 09/11/2026</div>
  <div style="display:flex;justify-content:space-between"><span>Salary Account</span><span>AED 18,450.25</span></div>
  <div style="display:flex;justify-content:space-between"><span>Gold savings plan</span><span>AED 7,800.00</span></div>
  <div style="display:flex;justify-content:space-between"><span>UAE fixed deposit</span><span>AED 106,500.00</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total</span><span>AED 132,750.25</span></div>`;

let app, p, statementPng, blankPng;
test.before(async () => {
  statementPng = await makeImage('statement.png', STATEMENT);
  blankPng = await makeImage('blank.png', '');
  app = await H.openApp(); p = app.page; p.setDefaultTimeout(90000); // the first read loads the reader
});
test.after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function openShotTab() {
  await H.closeSheet(p);
  await p.click('.qa-top');
  await p.click('.sheet [role="tab"]:has-text("Paste a screenshot")');
}
async function chooseImage(file) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sheet button:has-text("Choose image")')]);
  await fc.setFiles(file);
}

test('choose image: reads the statement, previews rows, saves only after confirm', async () => {
  await openShotTab();
  assert.match(await H.text(p, '.sheet'), /about 7 MB/);
  await chooseImage(statementPng);
  await p.waitForSelector('.sheet .shotrow');
  const rows = await p.$$eval('.sheet .shotrow', (cards) => cards.map((c) => ({
    name: c.querySelector('input[type=text]').value, amount: c.querySelector('input[type=number]').value,
    cur: c.querySelectorAll('select')[0].value, save: c.querySelectorAll('select')[2].value,
    on: c.querySelector('[role=switch]').getAttribute('aria-checked') })));
  assert.deepEqual(rows.map((r) => [r.name, r.amount, r.cur, r.on]), [
    ['Salary Account', '18450.25', 'AED', 'true'],
    ['Gold savings plan', '7800', 'AED', 'true'],
    ['UAE fixed deposit', '106500', 'AED', 'true'],
    ['Total', '132750.25', 'AED', 'false'],
  ]);
  assert.equal(rows[2].save, 'h4', '"UAE fixed deposit" is matched to the existing holding');
  // nothing saved yet
  assert.equal((await H.savedState(p)).data.holdings.length, 9);
  // edit a name before saving
  await p.fill('.sheet .shotrow >> nth=0 >> input[type=text]', 'ADCB salary account');
  await p.click('.sheet .sfoot button:has-text("Save 3 rows")');
  assert.match(await H.toast(p, /3 rows saved/), /2 new, 1 updated/);

  const hs = D.clone(D.holdings);
  hs.find((h) => h.name === 'UAE fixed deposit').cur$ = 106500;
  hs.push({ cur: 'AED', inv: 18450.25, cur$: 18450.25 }, { cur: 'AED', inv: 7800, cur$: 7800 });
  assert.equal(await H.netWorth(p), H.aed(D.totals(hs).netWorth));
  await H.go(p, 'Holdings');
  assert.equal(await p.locator('.hrow:has-text("ADCB salary account")').count(), 1);
  assert.equal(await p.locator('.hrow:has-text("Gold savings plan")').count(), 1);
});

test('updating a holding kept in another currency converts at your FX rate', async () => {
  await openShotTab();
  await chooseImage(statementPng);
  await p.waitForSelector('.sheet .shotrow');
  // keep only "Gold savings plan" (AED 7,800) and save it into "Gold (100 g)", which is kept in USD
  for (const i of [0, 2]) await p.click(`.sheet .shotrow >> nth=${i} >> [role=switch]`);
  await p.selectOption('.sheet .shotrow >> nth=1 >> select >> nth=2', 'h6');
  const usd = 7800 / 3.6725;
  assert.match(await H.text(p, '.sheet .shotrow >> nth=1'), new RegExp('saved as \\$' + H.num(usd, 2).replace('.', '\\.')));
  await p.click('.sheet .sfoot button:has-text("Save 1 row")');
  await H.toast(p, /1 row saved/);
  const gold = (await H.savedState(p)).data.holdings.find((h) => h.id === 'h6');
  assert.equal(gold.cur, 'USD');
  assert.equal(gold.current, Math.round(usd * 100) / 100, 'AED 7,800 ÷ 3.6725 = $2,123.89');
});

test('paste: a screenshot pasted from the clipboard is read the same way', async () => {
  await openShotTab();
  const b64 = fs.readFileSync(statementPng).toString('base64');
  await p.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'clip.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, b64);
  await p.waitForSelector('.sheet .shotrow');
  assert.equal(await p.locator('.sheet .shotrow').count(), 4);
  await p.click('.sheet .sfoot button:has-text("Start over")');
  assert.match(await H.text(p, '.sheet'), /Paste, drop or choose a screenshot/);
});

test('an image with no balances shows a clear message and saves nothing', async () => {
  const before = (await H.savedState(p)).data;
  await openShotTab();
  await chooseImage(blankPng);
  await p.waitForSelector('.sheet [role=alert]');
  assert.match(await H.text(p, '.sheet [role=alert]'), /No balances found/);
  assert.deepEqual((await H.savedState(p)).data, before);
});

test('a file that is not an image is refused', async () => {
  await openShotTab();
  const txt = path.join(tmp, 'notes.txt'); fs.writeFileSync(txt, 'hello');
  await chooseImage(txt);
  assert.match(await H.text(p, '.sheet [role=alert]'), /isn’t an image/);
});

test('the reader is loaded from this site only, never from another server', async () => {
  const hosts = new Set();
  p.on('request', (r) => hosts.add(new URL(r.url()).host));
  await openShotTab();
  await chooseImage(statementPng);
  await p.waitForSelector('.sheet .shotrow');
  const appHost = new URL(app.server.url).host;
  assert.deepEqual([...hosts].filter((h) => h && h !== appHost), [], 'no requests to other hosts');
});

test('no errors in the browser console', () => { assert.deepEqual(app.errors.filter((e) => !/\.map\b/.test(e)), []); });
