# Market Data — Free Tier Now, Paid Tier Later

This app currently runs on **free data sources**. This document explains exactly
what is wired today and how another agent (or you) can upgrade to paid/licensed
providers for better coverage, intraday candles, and reliable history.

## What's wired today (free)

| Concern | Source | Where | Notes / limits |
|---|---|---|---|
| Live equity/ETF quotes, profile, metrics (beta, P/E, div) | **Finnhub (free)** | `supabase/functions/refresh-market-data/index.ts` | ~60 req/min; no intraday candles on free tier. Needs `FINNHUB_API_KEY`. |
| Company + market news | **Finnhub (free)** | same function -> `news_cache` table | `company-news`, `news?category=general`. |
| US Treasury yield curve | **FRED** | same function -> `market_yield_curve` | Needs `FRED_API_KEY` (currently **not set** — curve is empty until you add it). |
| ~1yr daily OHLC history (for Alpha/Beta/Sharpe/vol/drawdown + performance benchmarks) | **Yahoo Finance chart endpoint (unofficial, free, no key)** | `supabase/functions/backfill-history/index.ts` -> `price_history` table | Rate-limited, unofficial. Runs daily via cron `daily-backfill-history`. |
| Research candlestick chart, fundamentals, screener, symbol news/events | **TradingView free embed widgets** | `src/components/TradingView.jsx` | Client-side widgets; no key. |
| Daily portfolio value snapshots | computed from holdings × cached quotes | `refresh-market-data` -> `portfolio_snapshots` | Powers the performance chart over time. |

### Cron jobs (pg_cron)
- `*/5 * * * *` → `refresh-market-data` (quotes, news, daily snapshot)
- `0 22 * * 1-5` → `backfill-history` (refresh daily OHLC after US close)

### Required secrets
```bash
supabase secrets set FINNHUB_API_KEY=...   # live quotes + news
supabase secrets set FRED_API_KEY=...      # yield curve (optional)
supabase secrets set ANTHROPIC_API_KEY=... # AI analyst (see docs/ai-provider.md)
```

## Why upgrade

- **Yahoo + Finnhub free** are rate-limited and unofficial; history can be patchy
  and quotes are not real-time/streaming.
- No intraday candles, no options, limited fundamentals depth.

## Recommended paid providers

| Provider | Strengths | Good for replacing |
|---|---|---|
| **Polygon.io** | Real-time + historical equities/options, aggregates (candles), websockets | quotes, `price_history`, intraday charts |
| **Alpha Vantage** | Simple REST, daily/intraday history, fundamentals | `price_history`, fundamentals |
| **Finnhub paid** | Unlocks `/stock/candle`, websockets, deeper fundamentals | keep current code, just richer endpoints |
| **Tiingo** | Clean EOD + fundamentals + news | `price_history`, news |

## Migration steps (history → Polygon example)

Target file: `supabase/functions/backfill-history/index.ts`

1. Add the secret: `supabase secrets set POLYGON_API_KEY=...`
2. Replace `fetchYahoo(ticker)` with a Polygon aggregates call:

   ```ts
   // GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?apiKey=...
   const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${Deno.env.get("POLYGON_API_KEY")}`;
   // map results[].t (ms), .o .h .l .c .v  ->  { symbol, date, open, high, low, close, volume }
   ```

3. Keep the upsert into `price_history` (`onConflict: "symbol,date"`) and the
   `source` field (set it to `"polygon"`).
4. Redeploy: `supabase functions deploy backfill-history`.
5. Backfill once: `curl -X POST .../functions/v1/backfill-history`.

## Migration steps (live quotes → Polygon/Finnhub-paid)

Target file: `supabase/functions/refresh-market-data/index.ts`

- Swap `fetchFinnhubQuote` for the provider's snapshot/last-trade endpoint and map
  to the existing `market_equity_quotes` upsert shape
  (`ticker, name, sector, price, prev_close, change_pct, beta, mcap_b, pe, div_yield, source`).
- For **real-time streaming**, add a separate long-lived worker (provider websocket)
  that upserts `market_equity_quotes`; the 5-min cron can remain as a fallback.

## Native candlestick chart (optional)

The Research tab uses TradingView embeds today. To render candles natively from
your own data (after adding a candle source), build a chart from `price_history`
(e.g. `recharts` Candlestick via custom shapes, or `lightweight-charts`) in
`src/pages/Research.jsx`. The data is already in `price_history` (daily) — extend
the backfill to intraday for finer granularity.

## Data model reference (already created)

- `price_history (symbol, date, open, high, low, close, volume, source)` — PK `(symbol,date)`
- `market_equity_quotes`, `market_indices`, `market_bond_quotes`, `market_yield_curve`
- `news_cache (category, symbol, headline, summary, source, url, image, datetime, sentiment, external_id)`
- `portfolio_snapshots (user_id, snapshot_date, market_value, cash, cost_basis, total_value, unrealized_pnl)`

All market/reference tables are authenticated read-only via RLS; only the
service-role edge functions write to them.
