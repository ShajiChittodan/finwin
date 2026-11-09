# FinWin — private finance tracker

A manual, private net-worth and FIRE tracker built from the FinWin design.
No sign-up, no server, no bank links: everything you enter is saved in this browser's
`localStorage`, and the only way data leaves the device is a backup file you download.

## What's in it

- **Dashboard:** net worth with month-on-month change and trend line, total assets, total liabilities, total gain, debt-to-asset ratio, allocation by type or currency (chart or table), FIRE progress, "Needs updating" list, backup reminder.
- **Holdings (assets):** 9 asset types with sub-types, any currency, filters, sorting, groups you can open and close, detail page with value history, **Log update**, **Edit all fields** and **Delete**.
- **Liabilities:** loans and cards with payoff progress, estimated payoff date, interest still to pay, debt-free date, **Edit** and **Delete**.
- **FIRE plan:** FIRE portfolio, FIRE number (today's money and at your target age), progress, monthly investment needed, estimated FIRE age, projection chart and year-by-year table, and the choice of which assets count.
- **All assumptions:** inflation, return, withdrawal rate, when to mark items stale, and FX rates, each with reset to default.
- **Settings:** base currency (default **AED**), number format (including Indian lakh–crore), date format, theme, FX rates, full JSON backup, CSV export (holdings, liabilities, value history), restore (replace or merge, with a preview), backup reminder, "Keep my data safe" (asks the browser for persistent storage), erase everything.
- **"How is this calculated?"** panels everywhere, showing the formula with your own numbers.
- Works on phone, tablet and desktop, in light and dark mode, and offline after the first visit (it can also be installed to the home screen).

First visit loads the design's dummy data so you can explore. Erase it in **Settings › Danger zone**.

## Run it locally

```bash
npm start
```

Then open http://localhost:8080. Any static web server pointed at `app/` works.

## Deploy

`app/` is the whole site: plain HTML, CSS and JavaScript with no build step. `netlify.toml` already sets this up for Netlify (publish directory `app`, no build command). Upload that folder to any
static host, such as Netlify, Vercel, GitHub Pages or Cloudflare Pages. It must be served over HTTPS
(or `localhost`) for offline mode and "Keep my data safe" to work.

## Tests

```bash
npm install
npm test
```

There are 40 browser tests (Playwright plus Node's built-in test runner) in `tests/`:

| File | What it checks |
|---|---|
| `1-calculations.test.js` | Every dashboard, holdings, liabilities and FIRE figure, compared with values worked out independently from the dummy data. Also covers edge cases, base-currency switching and Indian number format. |
| `2-editing.test.js` | Quick add (AED and a new currency with its FX rate), form validation, editing, logging a value, editing a liability, the FIRE switch and delete. Totals are re-checked after every change. |
| `3-refresh.test.js` | Entries, edits and settings after a page reload; a second tab; erase-then-reload; unreadable saved data is kept aside, never overwritten. |
| `4-backup-restore.test.js` | Backup file contents, restore (replace and merge), the lost-device scenario, rejection of bad or foreign files, cancel, and CSV exports. |
| `5-offline-and-layout.test.js` | Offline reload; phone and tablet layouts with no sideways scrolling. |

## How the data is stored

- Key `finwin:v1` in `localStorage`, saved after every change.
- FX rates are stored as "units per 1 USD" internally, and every screen shows them as "1 AED = x". Changing the base currency never changes your amounts.
- The backup file is versioned JSON (`app: "FinWin"`, `schema: 1`). It is validated before restore, and a preview is shown before anything changes.
- Clearing browser data or using private browsing deletes everything. Keep backups.

## Not included yet

- **Paste a screenshot (Beta)** from the design, which reads balances from an image on the device. It was left out on purpose, to add as a second step.
- No live FX or price feeds: rates are entered by you, as in the design.
