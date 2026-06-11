# Finance AI

An institutional-grade personal investment terminal: auth-gated, with a live
market dashboard, a metrics-rich portfolio, balances, a TradingView research
workspace, a portfolio news feed, and a **portfolio-aware AI analyst**.

Black/amber Bloomberg-style UI · React + Vite · Supabase (Auth + Postgres + RLS +
Edge Functions) · live Finnhub/FRED feeds · Anthropic Claude.

## Run locally

```bash
npm install
cp .env.example .env.local   # already points at the financeAI project
npm run dev
```

Open http://localhost:5173/ and sign in.

### Default login

A single owner account is provisioned (single-user mode):

- **Email:** `omer@financeai.app`
- **Password:** `FinanceAI!2026`  ← change this (see "Change password" below)

## Features

- **Auth** — Supabase email/password. The whole app is gated; every table is
  protected by Row Level Security so only the signed-in owner can see their data.
- **Dashboard** — market overview (indices), performance vs S&P 500 & NASDAQ,
  top positions, an editable watchlist, and a trading-news card.
- **Portfolio** — all positions with live P&L plus risk metrics (Beta, Alpha,
  Sharpe, volatility, max drawdown), a manual **Add Position** modal, and full
  transaction history with realized P&L.
- **Balances** — total account value, **manually-editable buying power**,
  investment holdings and sector allocation.
- **Research** — TradingView advanced candlestick chart, symbol info, company
  profile, fundamentals, news/events, a market screener, and your live position.
- **Portfolio News** — news filtered to the equities and sectors you hold.
- **AI Analyst** — chat that is wired to your live portfolio (Claude, server-side).

## Supabase backend

**Project:** `https://spyacqjjceboodaxsnbi.supabase.co` (org: OYahya)

### Required secrets (Edge Functions)

```bash
supabase secrets set --project-ref spyacqjjceboodaxsnbi \
  FINNHUB_API_KEY=your_finnhub_key \      # live quotes + news (set)
  ANTHROPIC_API_KEY=sk-ant-... \          # AI Analyst (required for chat)
  FRED_API_KEY=your_fred_key              # Treasury yield curve (optional)
```

### Edge functions

| Function | Purpose | Auth |
|---|---|---|
| `refresh-market-data` | Finnhub quotes + news, FRED yields, daily portfolio snapshot | public (cron) |
| `backfill-history` | ~1yr daily OHLC from Yahoo into `price_history` | public (cron) |
| `ai-analyst` | Anthropic proxy w/ live portfolio context | JWT required |

Cron: `refresh-market-data` every 5 min; `backfill-history` weekdays 22:00 UTC.

### Tables (RLS enabled)

Per-user: `equity_holdings`, `bond_holdings`, `transactions`, `account_balances`,
`watchlist`, `portfolio_snapshots`.
Shared (authenticated read; service-role write): `market_equity_quotes`,
`market_indices`, `market_bond_quotes`, `market_yield_curve`, `price_history`,
`news_cache`, `instrument_registry`, `market_refresh_log`.

## Seeded data

Your HSBC statement (Jan 1 – Jun 8, 2026) is seeded: 27 open positions with exact
cost basis & quantities, the period's transaction history (with realized P&L), and
buying power set to the ending cash of **$26,973.90**.

## Data sources & upgrading to paid tiers

Currently on free tiers (Finnhub free, Yahoo history, TradingView embeds). See
[docs/market-data-paid-migration.md](docs/market-data-paid-migration.md) to switch
to Polygon/Alpha Vantage/Finnhub-paid, and [docs/ai-provider.md](docs/ai-provider.md)
to configure or swap the AI provider.

## Change password

Supabase dashboard → Authentication → Users → `omer@financeai.app` → reset, or via
the app once a password-reset flow is added. The account email can also be changed
there.

## Architecture

```
React (Vite)  ──►  Supabase JS  ──►  Postgres (+RLS)
   │                                    ▲
   │ functions.invoke                   │ service-role upserts
   ▼                                    │
ai-analyst ──► Anthropic        refresh-market-data / backfill-history (cron)
                                   ▲
                                   └── Finnhub · FRED · Yahoo
Research tab ──► TradingView embeds
```
