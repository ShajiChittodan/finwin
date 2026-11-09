// Shared test helpers: a tiny static server for app/, a browser, and number formatting
// that mirrors how FinWin displays money (so expected values can be compared as text).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

async function openApp(opts = {}) {
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: opts.serviceWorkers || 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.url);
  await page.waitForSelector('.shell');
  return {
    server, browser, context, page, errors,
    async close() { await browser.close(); server.srv.close(); },
  };
}

// FinWin's formatting: "AED 1,234", "−AED 12", "+AED 5", "11.9%"
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function num(v, dec = 0) { const [i, f] = Math.abs(v).toFixed(dec).split('.'); return (v < 0 ? '−' : '') + group(i) + (f ? '.' + f : ''); }
function aed(v, dec = 0) { const neg = v < 0 && Math.round(Math.abs(v) * 10 ** dec) > 0; return (neg ? '−' : '') + 'AED ' + num(Math.abs(v), dec); }
function signedAed(v) { return (v >= 0 ? '+' : '−') + 'AED ' + num(Math.abs(v)); }
function pct(v, dec = 1) { return num(v, dec) + '%'; }
function signedPct(v, dec = 1) { return (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '') + num(Math.abs(v), dec) + '%'; }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(d) { return MON[d.getMonth()] + ' ' + d.getFullYear(); }
function isoToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Navigation and common reads
async function closeSheet(page) { if (await page.locator('.sheet').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached' }); } }
async function go(page, label) { await closeSheet(page); await page.click(`nav.sidebar button:has-text("${label}")`); await page.waitForTimeout(80); }
async function text(page, sel) { return (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim(); }
async function tile(page, label) { return text(page, `.tile:has-text("${label}") .val`); }
async function netWorth(page) { await go(page, 'Dashboard'); return text(page, '.bignum'); }
// Waits for a toast message matching `re` (earlier toasts may still be on screen).
async function toast(page, re) { const loc = re ? page.locator('.toast', { hasText: re }) : page.locator('.toast'); await loc.first().waitFor(); return text(page, '.toast'); }
async function savedState(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('finwin:v1'))); }

module.exports = { closeSheet, openApp, num, aed, signedAed, pct, signedPct, monthLabel, isoToday, go, text, tile, netWorth, toast, savedState, MON };
