/*
 * FinWin statement reader: turns text lines read from a screenshot (by on-device OCR)
 * into suggested holdings — a name, an amount and a currency per row.
 * Pure functions, no DOM: used by the app and by the unit tests.
 */
(function (root) {
  'use strict';

  var CUR_WORDS = [
    [/\bAED\b|\bDhs?\.?(?=\s|\d|$)|\bDirhams?\b/i, 'AED'],
    [/\bUSD\b|\bUS\$|\$/, 'USD'],
    [/\bINR\b|₹|\bRs\.?(?=\s|\d)/i, 'INR'],
    [/\bEUR\b|€/, 'EUR'],
    [/\bGBP\b|£/, 'GBP'],
    [/\bSAR\b/, 'SAR'], [/\bQAR\b/, 'QAR'], [/\bOMR\b/, 'OMR'], [/\bKWD\b/, 'KWD'], [/\bBHD\b/, 'BHD'], [/\bSGD\b/, 'SGD'], [/\bCHF\b/, 'CHF'],
  ];
  var CUR_STRIP = /\b(?:AED|USD|INR|EUR|GBP|SAR|QAR|OMR|KWD|BHD|SGD|CHF|US\$|Dhs?\.?|Dirhams?|Rs\.?)(?=\s|\d|$)|[$₹€£]/gi;
  // Amount: grouped (1,234,567.89 / 19,80,000 / 1.234.567,89 / 1 234 567) or plain with decimals (1234.56)
  var AMOUNT = /-?\d{1,3}(?:[,.  ']\d{2,3})+(?:[.,]\d{1,2})?(?!\d)|-?\d+[.,]\d{1,2}(?!\d)|-?\d+(?!\d)/g;
  var DATE = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b/gi;
  var TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi;
  var PERCENT = /[+\-−]?\d+(?:[.,]\d+)?\s*%/g;
  var TOTAL = /\b(?:total|sub-?total|grand total|net worth|portfolio value)\b/i;

  var TYPE_HINTS = [
    [/\b(?:fixed deposit|term deposit|\bFD\b|\bTD\b)/i, 'fd'],
    [/\b(?:mutual fund|fund|\bMF\b|\bSIP\b|\bNAV\b)/i, 'mf'],
    [/\b(?:stock|stocks|shares?|equity|equities|ETF|brokerage|demat|portfolio)\b/i, 'stocks'],
    [/\b(?:gold|silver|bullion)\b/i, 'gold'],
    [/\b(?:bitcoin|BTC|ethereum|ETH|crypto|USDT|USDC|wallet)\b/i, 'crypto'],
    [/\b(?:NPS|pension|provident|EPF|PPF|gratuity|retirement)\b/i, 'nps'],
    [/\b(?:property|apartment|villa|flat|land|real estate)\b/i, 're'],
    [/\b(?:savings?|current|account|cash|balance|deposit|bank)\b/i, 'cash'],
  ];

  function detectCurrency(text) {
    for (var i = 0; i < CUR_WORDS.length; i++) if (CUR_WORDS[i][0].test(text)) return CUR_WORDS[i][1];
    return null;
  }

  // "1,234.56" → 1234.56 · "19,80,000" → 1980000 · "1.234,56" → 1234.56 · "1 234" → 1234
  function parseAmount(raw) {
    var s = String(raw).replace(/[  ']/g, '').replace(/^−/, '-');
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
    var dec = null;
    if (lastC >= 0 && lastD >= 0) dec = lastC > lastD ? ',' : '.';
    else if (lastC >= 0) dec = (s.split(',').length === 2 && /,\d{1,2}$/.test(s)) ? ',' : null;
    else if (lastD >= 0) dec = (s.split('.').length === 2 && !/\.\d{3}$/.test(s)) ? '.' : null;
    var intPart = s, frac = '';
    if (dec) { var k = s.lastIndexOf(dec); intPart = s.slice(0, k); frac = s.slice(k + 1); }
    intPart = intPart.replace(/[.,]/g, '');
    if (!/^\d+$/.test(intPart) || (frac && !/^\d+$/.test(frac))) return null;
    var v = parseFloat(intPart + (frac ? '.' + frac : ''));
    return neg ? -v : v;
  }

  function guessType(name) {
    for (var i = 0; i < TYPE_HINTS.length; i++) if (TYPE_HINTS[i][0].test(name)) return TYPE_HINTS[i][1];
    return 'cash';
  }

  function cleanName(s) {
    return s.replace(CUR_STRIP, ' ')
      .replace(/[|•·:=_~*#>]+/g, ' ')
      .replace(/\b(?:x{2,}|\*{2,})\d*\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—,.;()]+|[\s\-–—,.;(]+$/g, '')
      .trim();
  }
  function letters(s) { return (s.match(/[A-Za-z؀-ۿऀ-ॿ]/g) || []).length; }

  // Generic words ("account", "savings"…) are ignored so "Salary account" doesn't match "Savings account".
  var GENERIC = { account: 1, accounts: 1, acc: 1, bank: 1, balance: 1, savings: 1, saving: 1, current: 1, deposit: 1, fund: 1, funds: 1, plan: 1,
    card: 1, total: 1, the: 1, and: 1, your: 1, main: 1, personal: 1, value: 1, amount: 1, available: 1, ltd: 1, llc: 1 };
  function words(s) { return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 3 && !GENERIC[w]; }); }
  function matchHolding(name, holdings) {
    var a = words(name), best = null, bestScore = 0;
    holdings.forEach(function (h) {
      if (h.name.trim().toLowerCase() === name.trim().toLowerCase()) { if (bestScore < 2) { bestScore = 2; best = h; } return; }
      var b = words(h.name); if (!a.length || !b.length) return;
      var common = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
      if (common < 2) return; // one shared word ("gold") is too weak: a wrong match would overwrite a holding
      var score = common / Math.max(a.length, b.length);
      if (h.name.toLowerCase() === name.toLowerCase()) score = 2;
      if (score > bestScore) { bestScore = score; best = h; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  /**
   * lines: [{text, confidence}] (confidence 0–100) or plain strings.
   * opts: {base: 'AED', holdings: [{id, name}]}
   * returns [{raw, name, amount, cur, type, conf: 'High'|'Please check', include, match}]
   */
  function parseStatement(lines, opts) {
    opts = opts || {};
    var base = opts.base || 'AED', holdings = opts.holdings || [];
    var norm = lines.map(function (l) { return typeof l === 'string' ? { text: l, confidence: 100 } : l; })
      .map(function (l) { return { text: String(l.text || '').replace(/\s+/g, ' ').trim(), confidence: l.confidence == null ? 100 : l.confidence }; })
      .filter(function (l) { return l.text; });
    // statement-wide currency: the most common currency marker
    var counts = {};
    norm.forEach(function (l) { var c = detectCurrency(l.text); if (c) counts[c] = (counts[c] || 0) + 1; });
    var docCur = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || base;

    var rows = [], label = null;
    norm.forEach(function (l) {
      var text = l.text.replace(DATE, ' ').replace(TIME, ' ').replace(PERCENT, ' ');
      var lineCur = detectCurrency(text);
      var cands = [], m;
      AMOUNT.lastIndex = 0;
      while ((m = AMOUNT.exec(text))) {
        var tok = m[0].trim();
        var grouped = /[,.  ']/.test(tok);
        var v = parseAmount(tok);
        if (v === null || v <= 0) continue;
        // a bare number with no separators and no currency is usually an ID, a year or a count
        if (!grouped && !lineCur) continue;
        if (!grouped && v < 10) continue;
        cands.push({ tok: tok, v: v, at: m.index });
      }
      if (!cands.length) {
        if (letters(text) >= 3 && !lineCur) label = cleanName(text);
        return;
      }
      var amt = cands[cands.length - 1]; // statements put the balance last on the line
      var name = cleanName(text.slice(0, amt.at));
      if (letters(name) < 2 && label) name = label;
      label = null;
      if (letters(name) < 2) return;
      var cur = lineCur || docCur;
      var h = matchHolding(name, holdings);
      rows.push({
        raw: l.text, name: name, amount: amt.v, cur: cur, type: guessType(name),
        conf: l.confidence >= 85 ? 'High' : 'Please check',
        include: !TOTAL.test(name), isTotal: TOTAL.test(name), match: h ? h.id : 'new',
      });
    });
    return rows;
  }

  var api = { parseStatement: parseStatement, parseAmount: parseAmount, detectCurrency: detectCurrency, guessType: guessType, matchHolding: matchHolding };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinWinParse = api;
})(typeof window !== 'undefined' ? window : this);
