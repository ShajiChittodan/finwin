// 4) Do backup and restore work?
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./helpers');
const D = require('./demo');

let app, p, backupPath, backupJson;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finwin-test-'));
const original = D.totals();

async function download(click) {
  const [dl] = await Promise.all([p.waitForEvent('download'), click()]);
  const file = path.join(tmp, dl.suggestedFilename());
  await dl.saveAs(file);
  return file;
}
async function chooseFile(file) {
  await H.go(p, 'Settings');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('button:has-text("Choose JSON file")')]);
  await fc.setFiles(file);
}
function writeJson(name, obj) { const f = path.join(tmp, name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; }
async function addHolding(name, amount) {
  await p.click('.qa-top');
  await p.fill('#q-name', name);
  await p.fill('#q-inv', String(amount));
  await p.fill('#q-cur', String(amount));
  await p.click('.sheet .sfoot .btn.primary');
}

test.before(async () => { app = await H.openApp(); p = app.page; });
test.after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('download full backup: a complete, readable JSON file', async () => {
  backupPath = await download(() => p.click('section button:has-text("Download full backup")'));
  assert.equal(path.basename(backupPath), `finwin-backup-${H.isoToday()}.json`);
  backupJson = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backupJson.app, 'FinWin');
  assert.equal(backupJson.schema, 1);
  assert.equal(backupJson.settings.base, 'AED');
  assert.equal(backupJson.data.holdings.length, 9);
  assert.equal(backupJson.data.liabilities.length, 3);
  assert.deepEqual(Object.keys(backupJson.data.rates).sort(), ['AED', 'INR']);
  assert.equal(backupJson.data.holdings.reduce((n, h) => n + h.history.length, 0), 36);
  assert.match(await H.text(p, '.hdr-actions'), /Last backup: today/);
});

test('restore (replace): wipes later changes and brings back the backup exactly', async () => {
  await addHolding('Added after backup', 99999);
  await H.go(p, 'Settings');
  await p.selectOption('#s-num', 'in');
  assert.notEqual(await H.netWorth(p), H.aed(original.netWorth));

  await chooseFile(backupPath);
  const preview = await H.text(p, '.sheet');
  assert.match(preview, new RegExp(path.basename(backupPath)));
  assert.match(preview, /9 holdings/); assert.match(preview, /3 liabilities/); assert.match(preview, /2 FX rates/); assert.match(preview, /36 value entries/);
  assert.match(preview, /Base currency in backup: AED/);
  await p.click('.sheet .sfoot .btn.primary');
  assert.match(await H.toast(p, /Restored from/), /Restored from/);

  assert.equal(await H.netWorth(p), H.aed(original.netWorth));
  const saved = await H.savedState(p);
  assert.deepEqual(saved.data.holdings, backupJson.data.holdings, 'holdings identical to the backup');
  assert.deepEqual(saved.data.liabilities, backupJson.data.liabilities, 'liabilities identical to the backup');
  assert.deepEqual(saved.data.rates, backupJson.data.rates, 'FX rates identical to the backup');
  assert.equal(saved.numFmt, 'en', 'settings restored too');
});

test('restore survives a refresh', async () => {
  await p.reload();
  await p.waitForSelector('.shell');
  assert.equal(await H.netWorth(p), H.aed(original.netWorth));
});

test('restore (merge): keeps new entries and restores the backup ones', async () => {
  await addHolding('Kept by merge', 1000);
  await H.go(p, 'Holdings');
  await p.click('.hrow:has-text("Savings account")');
  await p.fill('#uv-val', '1');
  await p.click('button:has-text("Log update")');

  await chooseFile(backupPath);
  await p.click('.sheet .seg button:has-text("Merge")');
  await p.click('.sheet .sfoot button:has-text("Merge")');
  const expected = D.totals(D.holdings.concat([{ cur: 'AED', inv: 1000, cur$: 1000 }]));
  assert.equal(await H.netWorth(p), H.aed(expected.netWorth), 'backup values back, plus the new holding');
  await H.go(p, 'Holdings');
  assert.equal(await p.locator('.hrow:has-text("Kept by merge")').count(), 1);
});

test('lost-device scenario: erase everything, then restore from the file', async () => {
  await H.go(p, 'Settings');
  await p.click('button:has-text("Erase all data on this device")');
  await p.fill('#er-in', 'DELETE');
  await p.click('.sheet button:has-text("Erase all data")');
  assert.match(await H.text(p, '.content'), /Welcome to FinWin/);
  await chooseFile(backupPath);
  await p.click('.sheet .sfoot .btn.primary');
  assert.equal(await H.netWorth(p), H.aed(original.netWorth));
  await H.go(p, 'Liabilities');
  assert.equal(await p.locator('.hrow').count(), 3);
});

test('bad files are rejected and change nothing', async () => {
  const before = await H.savedState(p);
  const bad = {
    'not-json.json': 'hello, this is not JSON',
    'other-app.json': { app: 'SomethingElse', data: {} },
    'newer.json': Object.assign(D.clone(backupJson), { schema: 99 }),
    'negative.json': (() => { const b = D.clone(backupJson); b.data.holdings[0].current = -5; return b; })(),
    'missing-rate.json': (() => { const b = D.clone(backupJson); delete b.data.rates.INR; return b; })(),
  };
  const messages = {
    'not-json.json': /isn’t valid JSON/, 'other-app.json': /Not a FinWin backup/, 'newer.json': /newer version/,
    'negative.json': /invalid amount/, 'missing-rate.json': /No FX rate for INR/,
  };
  for (const [name, body] of Object.entries(bad)) {
    await chooseFile(writeJson(name, body));
    assert.match(await H.toast(p, messages[name]), messages[name], name);
    assert.equal(await p.locator('.sheet').count(), 0, name + ': no restore preview opened');
    await p.waitForSelector('.toast', { state: 'detached', timeout: 8000 });
  }
  const after = await H.savedState(p);
  assert.deepEqual(after.data, before.data, 'data untouched by bad files');
});

test('cancel on the restore preview changes nothing', async () => {
  await addHolding('Survives cancel', 10);
  const before = await H.savedState(p);
  await chooseFile(backupPath);
  await p.click('.sheet .sfoot button:has-text("Cancel")');
  assert.deepEqual((await H.savedState(p)).data, before.data);
});

test('CSV exports open as proper spreadsheets', async () => {
  await H.go(p, 'Settings');
  const hold = fs.readFileSync(await download(() => p.click('button:has-text("Download CSV")')), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
  assert.equal(hold[0], 'Name,Type,Sub-type,Currency,Amount invested,Current value,Value in AED,Gain,Gain %,Counts toward FIRE,Last updated,Notes');
  assert.equal(hold.length, 1 + 10);
  assert.ok(hold.some((l) => l.startsWith('Indian equity mutual funds,Mutual funds,Equity fund,INR,1500000,1980000,82631.25,480000,32,Yes,')), '₹19,80,000 ÷ 88 × 3.6725 = AED 82,631.25');
  await p.selectOption('#s-csv', 'liabilities');
  const liab = fs.readFileSync(await download(() => p.click('button:has-text("Download CSV")')), 'utf8').trim().split(/\r\n/);
  assert.equal(liab.length, 1 + 3);
  assert.ok(liab.some((l) => l.startsWith('Home loan,Home loan,USD,120000,440700,6.5,1100,150000,')));
  await p.selectOption('#s-csv', 'history');
  const hist = fs.readFileSync(await download(() => p.click('button:has-text("Download CSV")')), 'utf8').trim().split(/\r\n/);
  assert.equal(hist.length, 1 + 36 + 1, '36 demo entries + the "Survives cancel" holding');
});

test('no unexpected errors in the browser console', () => { assert.deepEqual(app.errors, []); });
