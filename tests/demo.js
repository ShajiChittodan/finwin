// The design's dummy data, restated independently of the app (amounts in their own currency).
const FX = { USD: 1, AED: 3.6725, INR: 88 }; // units per 1 USD
const holdings = [
  { name: 'Savings account', type: 'Cash', cur: 'USD', inv: 12000, cur$: 12000, fire: true },
  { name: 'US stock portfolio', type: 'Stocks', cur: 'USD', inv: 40000, cur$: 52500, fire: true },
  { name: 'Indian equity mutual funds', type: 'Mutual funds', cur: 'INR', inv: 1500000, cur$: 1980000, fire: true },
  { name: 'UAE fixed deposit', type: 'Fixed deposits', cur: 'AED', inv: 100000, cur$: 104000, fire: true },
  { name: 'NPS account', type: 'NPS / pension', cur: 'INR', inv: 600000, cur$: 750000, fire: true },
  { name: 'Gold (100 g)', type: 'Gold', cur: 'USD', inv: 7000, cur$: 10500, fire: true },
  { name: 'Apartment', type: 'Real estate', cur: 'USD', inv: 180000, cur$: 210000, fire: false },
  { name: 'Crypto', type: 'Crypto', cur: 'USD', inv: 5000, cur$: 3800, fire: true },
  { name: 'Business stake', type: 'Other', cur: 'USD', inv: 10000, cur$: 10000, fire: false },
];
const liabilities = [
  { name: 'Home loan', home: true, cur: 'USD', bal: 120000, rate: 6.5, pay: 1100, orig: 150000 },
  { name: 'Car loan', home: false, cur: 'AED', bal: 38000, rate: 7.0, pay: 1450, orig: 60000 },
  { name: 'Credit card', home: false, cur: 'USD', bal: 1800, rate: null, pay: null, orig: null },
];
const toAED = (v, cur, fx = FX) => v / fx[cur] * fx.AED;
const totals = (hs = holdings, ls = liabilities, fx = FX) => {
  const a = hs.reduce((s, h) => s + toAED(h.cur$, h.cur, fx), 0);
  const i = hs.reduce((s, h) => s + toAED(h.inv, h.cur, fx), 0);
  const l = ls.reduce((s, x) => s + toAED(x.bal, x.cur, fx), 0);
  return { assets: a, invested: i, liabilities: l, netWorth: a - l };
};
const clone = (x) => JSON.parse(JSON.stringify(x));
module.exports = { FX, holdings, liabilities, toAED, totals, clone };
