# Portfolio Backtester (web)

Build, visualize, and backtest multi-asset portfolios with live Yahoo Finance
data. A TypeScript / Next.js port of the Python + Streamlit app.

- **Search & add** any ticker (stocks, ETFs, `BTC-USD`, …) with a Yahoo-style overview.
- **Editable holdings** — any weights; whatever is under 100% is held as **cash**.
- **Composition** pie + bar and a **sector breakdown**.
- **Backtest** over any date range vs an optional **S&P 500 (SPY)** benchmark, with
  growth + drawdown charts, a yearly table (return **and** intra-year max drawdown),
  and performance/stability stats: total return, CAGR, vol, Sharpe, Sortino, Calmar,
  max drawdown, longest-underwater, ulcer index, % positive months, beta/correlation
  vs SPY, best/worst year.
- **Holdings that hadn't launched yet** at the chosen start are held as **cash**
  until their first trading day (the app tells you which, and from when).
- **Saved portfolios** persist in the browser (`localStorage`).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys needed — Yahoo data is fetched server-side via Route Handlers
(`/api/prices`, `/api/ticker`, `/api/meta`), which avoids browser CORS.

## Architecture

- `src/lib/backtest.ts` — pure, dependency-free engine (`simulateWithCash`,
  `computeMetrics`, `betaCorrelation`). Validated bit-exact against the Python engine.
- `src/app/api/*` — server Route Handlers using `yahoo-finance2`.
- `src/components/*` — client UI (search, composition, backtest) with Recharts.

## Deploy

Deployments are handled by **Vercel's Git integration** — import the repo once at
[vercel.com](https://vercel.com) → **Add New → Project** (Next.js is auto-detected,
no env vars needed). After that, every push to `main` deploys to production and
every PR gets a preview URL automatically; there's nothing to run by hand.

CI quality checks (typecheck, lint, build) run separately in GitHub Actions
(`.github/workflows/ci.yml`).
