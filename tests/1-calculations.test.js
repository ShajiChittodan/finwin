// 1) Are the calculations correct?
// Every expected figure below is worked out here, independently, from the dummy data
// (the same holdings, liabilities and FX rates as the design), then compared with what
// the app shows on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

const { FX, holdings, liabilities, toAED } = require('./demo');

// ---- expected values in AED ----
const totalAssets = holdings.reduce((s, h) => s + toAED(h.cur$, h.cur), 0);
const totalInvested = holdings.reduce((s, h) => s + toAED(h.inv, h.cur), 0);
const totalLiab = liabilities.reduce((s, l) => s + toAED(l.bal, l.cur), 0);
const netWorth = totalAssets - totalLiab;
const gain = totalAssets - totalInvested;
const gainPct = gain / totalInvested * 100;
const debtToAsset = totalLiab / totalAssets * 100;

// FIRE (defaults: age 35 → 50, AED 13,000/month, inflation 3%, return 7%, SWR 4%, invest AED 5,500/month)
const age = 35, target = 50, years = target - age, monthlyExp = 13000, infl = 0.03, ret = 0.07, swr = 0.04, invest = 5500;
const fireAssets = holdings.filter((h) => h.fire).reduce((s, h) => s + toAED(h.cur$, h.cur), 0);
const nonMortgageDebt = liabilities.filter((l) => !l.home).reduce((s, l) => s + toAED(l.bal, l.cur), 0);
const firePortfolio = fireAssets - nonMortgageDebt;
const fireNumber = monthlyExp * 12 / swr;
const fireNumberAtTarget = fireNumber * (1 + infl) ** years;
const progress = firePortfolio / fireNumber * 100;
const grown = firePortfolio * (1 + ret) ** years;
const rm = ret / 12, n = years * 12;
const monthlyNeeded = Math.max(0, fireNumberAtTarget - grown) / (((1 + rm) ** n - 1) / rm);
let fireAge = null;
for (let m = 0; m <= (100 - age) * 12; m++) {
  const port = firePortfolio * (1 + ret) ** (m / 12) + invest * (((1 + rm) ** m - 1) / rm);
  if (port >= fireNumber * (1 + infl) ** (m / 12)) { fireAge = age + m / 12; break; }
}

// Loans: n = −ln(1 − r·B/P) / ln(1 + r), r = annual rate / 12
function payoff(l) {
  const r = l.rate / 100 / 12;
  const months = -Math.log(1 - r * l.bal / l.pay) / Math.log(1 + r);
  const d = new Date(); d.setMonth(d.getMonth() + Math.ceil(months));
  return { months, whole: Math.ceil(months), date: d, interest: months * l.pay - l.bal };
}
const home = payoff(liabilities[0]), car = payoff(liabilities[1]);
const debtFree = home.date > car.date ? home.date : car.date;
const monthlyDebt = toAED(1100, 'USD') + 1450;

let app;
test.before(async () => { app = await H.openApp(); });
test.after(async () => { await app.close(); });

test('dashboard: net worth, totals, gain and debt-to-asset ratio', async () => {
  const p = app.page;
  assert.equal(await H.netWorth(p), H.aed(netWorth));
  assert.equal(await H.tile(p, 'Total assets'), H.aed(totalAssets));
  assert.equal(await H.tile(p, 'Total liabilities'), H.aed(totalLiab));
  assert.equal(await H.tile(p, 'Total gain / loss'), H.signedAed(gain));
  assert.match(await H.text(p, '.tile:has-text("Total gain / loss") .sub'), new RegExp(H.signedPct(gainPct).replace('+', '\\+') + ' on ' + H.aed(totalInvested)));
  assert.equal(await H.tile(p, 'Debt-to-asset ratio'), H.pct(debtToAsset));
  console.log(`  net worth ${H.aed(netWorth)} = ${H.aed(totalAssets)} − ${H.aed(totalLiab)}`);
});

test('dashboard: "How is this calculated?" shows the same sum', async () => {
  const p = app.page;
  await p.click('button.info:has-text("How is this calculated?")');
  assert.equal(await H.text(p, '.sheet .eq'), `${H.aed(totalAssets)} − ${H.aed(totalLiab)} = ${H.aed(netWorth)}`);
  await p.click('.sheet .shead button[aria-label="Close"]');
});

test('allocation by type: each share = group value ÷ total assets', async () => {
  const p = app.page;
  const groups = {};
  holdings.forEach((h) => { groups[h.type] = (groups[h.type] || 0) + toAED(h.cur$, h.cur); });
  const rows = await p.$$eval('.legend button', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  assert.equal(rows.length, Object.keys(groups).length);
  for (const [type, v] of Object.entries(groups)) {
    const row = rows.find((r) => r.startsWith(type + ' '));
    assert.ok(row, 'missing row for ' + type);
    assert.equal(row, `${type} ${H.pct(v / totalAssets * 100)} ${H.aed(v)}`);
  }
  const sum = Object.values(groups).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - totalAssets) < 1e-6, 'groups add up to total assets');
});

test('holdings: per-holding value in AED and gain %', async () => {
  const p = app.page;
  await H.go(p, 'Holdings');
  assert.equal(await H.text(p, '.card.accent .num.serif'), H.aed(totalAssets));
  for (const h of holdings) {
    const row = await H.text(p, `.hrow:has-text("${h.name}")`);
    assert.ok(row.includes(H.aed(toAED(h.cur$, h.cur))), `${h.name}: value ${H.aed(toAED(h.cur$, h.cur))} in "${row}"`);
    assert.ok(row.includes(H.signedPct((h.cur$ - h.inv) / h.inv * 100)), `${h.name}: gain % in "${row}"`);
  }
});

test('liabilities: monthly payments, payoff months, interest and debt-free date', async () => {
  const p = app.page;
  await H.go(p, 'Liabilities');
  assert.equal(await H.tile(p, 'Monthly debt payments'), H.aed(monthlyDebt));
  assert.equal(await H.tile(p, 'Estimated debt-free'), H.monthLabel(debtFree));
  assert.ok((await H.text(p, '.hrow:has-text("Home loan")')).includes('Payoff ≈ ' + H.monthLabel(home.date)));
  assert.ok((await H.text(p, '.hrow:has-text("Car loan")')).includes('Payoff ≈ ' + H.monthLabel(car.date)));
  assert.ok((await H.text(p, '.hrow:has-text("Home loan")')).includes('20% paid of $150,000'), 'paid-off bar: 1 − 120,000 ÷ 150,000 = 20%');
  assert.ok((await H.text(p, '.hrow:has-text("Credit card")')).includes('No payoff estimate'), 'card with no rate or payment has no estimate');
  await p.click('.hrow:has-text("Home loan")');
  const fields = await H.text(p, '.list');
  assert.ok(fields.includes('Months remaining ' + H.num(home.months, 1)), `months ${H.num(home.months, 1)} in "${fields}"`);
  assert.ok(fields.includes('Interest still to pay (est.) $' + H.num(home.interest)), `interest $${H.num(home.interest)}`);
  console.log(`  home loan: ${H.num(home.months, 1)} months, interest $${H.num(home.interest)}, debt-free ${H.monthLabel(debtFree)}`);
});

test('FIRE: portfolio, FIRE number, progress, monthly needed and FIRE age', async () => {
  const p = app.page;
  await H.go(p, 'FIRE');
  assert.equal(await H.text(p, '.formula .eq'), `${H.aed(fireAssets)} − ${H.aed(nonMortgageDebt)} = ${H.aed(firePortfolio)}`);
  const card = (label) => H.text(p, `.tiles.cols3 section:has-text("${label}") .serif.num`);
  assert.equal(await card('FIRE number (today’s money)'), H.aed(fireNumber));
  assert.equal(await card('FIRE number at age 50'), '≈ ' + H.aed(fireNumberAtTarget));
  assert.equal(await card('Progress'), H.pct(progress));
  assert.equal(await card('Monthly investment needed'), '≈ ' + H.aed(monthlyNeeded));
  await p.click('button:has-text("What I can invest per month")');
  assert.equal(await H.text(p, '.serif.num.gain'), '≈ ' + H.num(fireAge, 1));
  console.log(`  FIRE number ${H.aed(fireNumber)}, progress ${H.pct(progress)}, need ${H.aed(monthlyNeeded)}/month, FIRE age ≈ ${H.num(fireAge, 1)}`);
});

test('FIRE: changing an assumption recalculates (SWR 4% → 3.5%)', async () => {
  const p = app.page;
  await p.fill('#fa-swr', '3.5');
  const fn2 = monthlyExp * 12 / 0.035;
  assert.equal(await H.text(p, '.tiles.cols3 section:has-text("FIRE number (today’s money)") .serif.num'), H.aed(fn2));
  assert.equal(await H.text(p, '.tiles.cols3 section:has-text("Progress") .serif.num'), H.pct(firePortfolio / fn2 * 100));
  await p.fill('#fa-swr', '4');
});

test('edge case: a payment smaller than the monthly interest gives no payoff date', async () => {
  const p = app.page;
  await H.go(p, 'Liabilities');
  await p.click('.hrow:has-text("Car loan")');
  await p.click('button:has-text("Edit")');
  await p.fill('#q-lm', '200'); // interest alone is 38,000 × 7% ÷ 12 ≈ AED 222 a month
  await p.click('.sheet .sfoot .btn.primary');
  assert.match(await H.text(p, '.card:has-text("Estimated payoff")'), /doesn't cover the interest/);
  await p.click('button:has-text("Edit")');
  await p.fill('#q-lm', '1450');
  await p.click('.sheet .sfoot .btn.primary');
});

test('switching the base currency to USD converts every total consistently', async () => {
  const p = app.page;
  await H.go(p, 'Settings');
  await p.selectOption('#s-base', 'USD');
  const nwUsd = netWorth / FX.AED;
  assert.equal(await H.netWorth(p), '$' + H.num(nwUsd));
  await H.go(p, 'Settings');
  await p.selectOption('#s-base', 'AED');
  assert.equal(await H.netWorth(p), H.aed(netWorth));
});

test('Indian number format groups in lakhs and crores', async () => {
  const p = app.page;
  await H.go(p, 'Settings');
  await p.selectOption('#s-num', 'in');
  const v = Math.round(netWorth).toString(); // e.g. 829963 → 8,29,963
  const lakh = v.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + v.slice(-3);
  assert.equal(await H.netWorth(p), 'AED ' + lakh);
  await H.go(p, 'Settings');
  await p.selectOption('#s-num', 'en');
});

test('no errors in the browser console', () => { assert.deepEqual(app.errors, []); });
