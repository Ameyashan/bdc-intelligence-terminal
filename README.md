# ◈ BDC Intelligence Terminal

Bloomberg terminal-style risk intelligence dashboard for 7 Business Development Companies — real data pulled directly from SEC EDGAR XBRL filings.

**Live data:** Dec 31, 2025 | 5,013 positions across GSCR, GSBD, ARCC, BXSL, OBDC, ADS, FSK

---

## Architecture

```
EDGAR XBRL → refresh script → public/data/bdc-data.json → React SPA → Vercel
```

- **Frontend**: React SPA (Vite) served as static files on Vercel
- **Data**: Pre-extracted JSON committed to the repo — zero server required on Vercel
- **Refresh**: Run locally when you want fresh EDGAR data, commit the output

---

## Quick Start (local)

```bash
# 1. Clone and install
git clone https://github.com/Ameyashan/bdc-intelligence-terminal
cd bdc-intelligence-terminal
npm install

# 2. Start local dev server (uses committed JSON data)
npm run dev
# → http://localhost:5000
```

---

## Refreshing Live EDGAR Data

Run this whenever you want to re-pull from SEC EDGAR (e.g. after a new 10-K is filed):

```bash
npm run refresh-data
```

**What this does:**
1. Fetches XBRL instance documents from EDGAR for all 7 funds
2. Parses per-investment facts (par, cost, fair value, rate, maturity)
3. Enriches industry labels from HTM filings
4. Writes `public/data/bdc-data.json`

**First run:** ~60 seconds (downloads raw XBRL files, caches them in `./cache/`)  
**Subsequent runs:** ~5 seconds (uses cached XMLs)

Then commit and push to deploy:

```bash
git add public/data/bdc-data.json
git commit -m "data: refresh EDGAR Dec 31 2025"
git push
# → Vercel auto-deploys in ~30 seconds
```

---

## Deploying to Vercel

### One-time setup

1. Push this repo to GitHub: `https://github.com/Ameyashan/bdc-intelligence-terminal`

2. Go to [vercel.com/new](https://vercel.com/new) → Import Git Repository → select this repo

3. Vercel settings (auto-detected from `vercel.json`):
   - **Framework**: Other (Vite)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - No environment variables needed — data is static

4. Click **Deploy** — done. Vercel gives you a URL like `bdc-intelligence-terminal.vercel.app`

### Updating data

```bash
npm run refresh-data    # re-extract from EDGAR
git add public/data/bdc-data.json
git commit -m "data: EDGAR refresh $(date +%Y-%m-%d)"
git push                # Vercel auto-deploys
```

---

## Local dev with live EDGAR API

If you want to run with live EDGAR extraction (not static JSON):

```bash
npm run build:full    # builds Vite SPA + compiles Express server
npm run start         # starts Express on port 5000
# → http://localhost:5000
# → /api/bdc-data (live EDGAR pipeline)
# → /api/bdc-data?refresh=1 (force re-extract)
```

---

## Fund Coverage

| Fund | CIK | Manager |
|------|-----|---------|
| GSCR | 0001920145 | Goldman Sachs Asset Management |
| GSBD | 0001572694 | Goldman Sachs Asset Management |
| ARCC | 0001287750 | Ares Management |
| BXSL | 0001736035 | Blackstone Credit |
| OBDC | 0001655888 | Blue Owl Capital |
| ADS  | 0001837532 | Ares Management |
| FSK  | 0001422183 | FS Investments / KKR Credit |

---

## Project Structure

```
bdc-intelligence-terminal/
├── src/
│   ├── App.jsx              # Root: fetches data, renders BDCTerminal
│   └── BDCTerminal.jsx      # Terminal UI — all 5 tabs
├── server/                  # Node.js EDGAR pipeline (local use only)
│   ├── edgar.ts             # XBRL extraction
│   ├── normalize.ts         # Dedup, industry enrichment, fund stats
│   ├── cache.ts             # File-based cache layer
│   └── api.ts               # Express server (local live-API mode)
├── scripts/
│   └── refresh-data.ts      # Run locally to re-extract from EDGAR
├── public/
│   └── data/
│       └── bdc-data.json    # ← committed: 1.5MB normalized data
├── cache/                   # gitignored: raw XBRL files (250MB)
├── vercel.json              # Vercel config (static Vite SPA)
└── package.json
```
