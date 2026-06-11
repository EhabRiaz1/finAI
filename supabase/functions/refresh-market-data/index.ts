import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const FRED_SERIES: Record<string, string> = {
  "US 1M": "DGS1MO",
  "US 3M": "DGS3MO",
  "US 6M": "DGS6MO",
  "US 1Y": "DGS1",
  "US 2Y": "DGS2",
  "US 5Y": "DGS5",
  "US 7Y": "DGS7",
  "US 10Y": "DGS10",
  "US 20Y": "DGS20",
  "US 30Y": "DGS30",
};

const YIELD_CURVE_TENORS: Record<string, string> = {
  "1M": "DGS1MO",
  "3M": "DGS3MO",
  "6M": "DGS6MO",
  "1Y": "DGS1",
  "2Y": "DGS2",
  "5Y": "DGS5",
  "7Y": "DGS7",
  "10Y": "DGS10",
  "20Y": "DGS20",
  "30Y": "DGS30",
};

const INDEX_LABELS: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "NASDAQ",
  DIA: "DOW",
  IWM: "RUSSELL 2K",
  VIX: "VIX",
  UUP: "DXY",
  GLD: "GOLD",
  USO: "BRENT",
};

const TREASURY_NAMES: Record<string, string> = {
  "US 1M": "US Treasury Bill 1M",
  "US 3M": "US Treasury Bill 3M",
  "US 6M": "US Treasury Bill 6M",
  "US 1Y": "US Treasury Note 1Y",
  "US 2Y": "US Treasury Note 2Y",
  "US 5Y": "US Treasury Note 5Y",
  "US 7Y": "US Treasury Note 7Y",
  "US 10Y": "US Treasury Note 10Y",
  "US 20Y": "US Treasury Bond 20Y",
  "US 30Y": "US Treasury Bond 30Y",
};

const TREASURY_DURATION: Record<string, number> = {
  "US 1M": 0.08,
  "US 3M": 0.25,
  "US 6M": 0.5,
  "US 1Y": 0.95,
  "US 2Y": 1.92,
  "US 5Y": 4.61,
  "US 7Y": 6.5,
  "US 10Y": 8.74,
  "US 20Y": 15.0,
  "US 30Y": 19.43,
};

const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  "BRK.B": "BRK-B",
  VIX: "^VIX",
};

function finnhubSymbol(symbol: string): string {
  return FINNHUB_SYMBOL_MAP[symbol] ?? symbol;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFredYield(
  seriesId: string,
  fredKey: string,
): Promise<number | null> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&file_type=json&api_key=${fredKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const val = parseFloat(data?.observations?.[0]?.value);
  return Number.isFinite(val) ? val : null;
}

async function fetchFinnhubQuote(symbol: string, finnhubKey: string) {
  const url =
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchFinnhubProfile(symbol: string, finnhubKey: string) {
  const url =
    `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchFinnhubMetrics(symbol: string, finnhubKey: string) {
  const url =
    `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.metric ?? null;
}

async function fetchCompanyNews(
  symbol: string,
  finnhubKey: string,
): Promise<Array<Record<string, unknown>>> {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchMarketNews(
  finnhubKey: string,
): Promise<Array<Record<string, unknown>>> {
  const url =
    `https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function mapNewsRow(
  category: string,
  symbol: string | null,
  n: Record<string, unknown>,
) {
  const ts = Number(n.datetime ?? 0);
  return {
    category,
    symbol,
    headline: String(n.headline ?? "").slice(0, 600),
    summary: n.summary ? String(n.summary).slice(0, 2000) : null,
    source: n.source ? String(n.source) : null,
    url: n.url ? String(n.url) : null,
    image: n.image ? String(n.image) : null,
    datetime: new Date((ts || Date.now() / 1000) * 1000).toISOString(),
    external_id: n.id != null ? String(n.id) : null,
  };
}

function estimateTreasuryPrice(yieldPct: number, duration: number): number {
  return Number((100 - duration * (yieldPct - 4) * 0.15).toFixed(2));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  const fredKey = Deno.env.get("FRED_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const logId = crypto.randomUUID();
  await supabase.from("market_refresh_log").insert({
    id: logId,
    status: "running",
    details: { finnhub: !!finnhubKey, fred: !!fredKey },
  });

  const results = {
    equities: 0,
    indices: 0,
    bonds: 0,
    yieldCurve: 0,
    news: 0,
    snapshots: 0,
    errors: [] as string[],
  };

  try {
    const { data: registry } = await supabase
      .from("instrument_registry")
      .select("instrument_type, symbol")
      .eq("is_active", true);

    const equities = (registry ?? []).filter((r) => r.instrument_type === "equity");
    const indices = (registry ?? []).filter((r) => r.instrument_type === "index");
    const bonds = (registry ?? []).filter((r) => r.instrument_type === "bond");

    if (fredKey) {
      for (const [tenor, seriesId] of Object.entries(YIELD_CURVE_TENORS)) {
        try {
          const y = await fetchFredYield(seriesId, fredKey);
          if (y != null) {
            await supabase.from("market_yield_curve").upsert({
              tenor,
              yield: y,
              fred_series_id: seriesId,
              updated_at: new Date().toISOString(),
            });
            results.yieldCurve++;
          }
        } catch (e) {
          results.errors.push(`FRED ${tenor}: ${e}`);
        }
        await sleep(100);
      }

      for (const bond of bonds) {
        const seriesId = FRED_SERIES[bond.symbol];
        if (!seriesId) continue;
        try {
          const y = await fetchFredYield(seriesId, fredKey);
          if (y != null) {
            const dur = TREASURY_DURATION[bond.symbol] ?? 5;
            const estPrice = estimateTreasuryPrice(y, dur);
            await supabase.from("market_bond_quotes").upsert({
              identifier: bond.symbol,
              name: TREASURY_NAMES[bond.symbol] ?? bond.symbol,
              bond_type: "sovereign",
              yield: y,
              bid: estPrice - 0.02,
              ask: estPrice + 0.02,
              duration: dur,
              rating: "AAA",
              source: "FRED",
              updated_at: new Date().toISOString(),
            });
            results.bonds++;
          }
        } catch (e) {
          results.errors.push(`FRED bond ${bond.symbol}: ${e}`);
        }
        await sleep(100);
      }
    } else {
      results.errors.push("FRED_API_KEY not configured");
    }

    if (finnhubKey) {
      for (const eq of equities) {
        try {
          const sym = finnhubSymbol(eq.symbol);
          const [quote, profile, metrics] = await Promise.all([
            fetchFinnhubQuote(sym, finnhubKey),
            fetchFinnhubProfile(sym, finnhubKey),
            fetchFinnhubMetrics(sym, finnhubKey),
          ]);

          if (quote?.c) {
            const price = quote.c;
            const prev = quote.pc ?? price;
            const changePct = quote.dp ?? ((price - prev) / prev) * 100;
            await supabase.from("market_equity_quotes").upsert({
              ticker: eq.symbol,
              name: profile?.name ?? eq.symbol,
              sector: profile?.finnhubIndustry ?? "—",
              price,
              prev_close: prev,
              change_pct: changePct,
              beta: metrics?.beta ?? null,
              mcap_b: profile?.marketCapitalization
                ? profile.marketCapitalization / 1000
                : null,
              pe: metrics?.peBasicExclExtraTTM ?? metrics?.peTTM ?? null,
              div_yield: metrics?.dividendYieldIndicatedAnnual ?? null,
              source: "Finnhub",
              updated_at: new Date().toISOString(),
            });
            results.equities++;
          }
        } catch (e) {
          results.errors.push(`Equity ${eq.symbol}: ${e}`);
        }
        await sleep(1100);
      }

      for (const idx of indices) {
        try {
          const sym = finnhubSymbol(idx.symbol);
          const quote = await fetchFinnhubQuote(sym, finnhubKey);
          if (quote?.c) {
            const price = quote.c;
            const prev = quote.pc ?? price;
            const changePct = quote.dp ?? ((price - prev) / prev) * 100;
            await supabase.from("market_indices").upsert({
              symbol: idx.symbol,
              name: INDEX_LABELS[idx.symbol] ?? idx.symbol,
              price,
              change_pct: changePct,
              updated_at: new Date().toISOString(),
            });
            results.indices++;
          }
        } catch (e) {
          results.errors.push(`Index ${idx.symbol}: ${e}`);
        }
        await sleep(1100);
      }
    } else {
      results.errors.push("FINNHUB_API_KEY not configured");
    }

    // ---- News: general market news + company news for held/active equities ----
    if (finnhubKey) {
      try {
        const general = await fetchMarketNews(finnhubKey);
        const generalRows = general
          .slice(0, 30)
          .map((n) => mapNewsRow("general", null, n))
          .filter((r) => r.headline);
        if (generalRows.length) {
          const { error } = await supabase
            .from("news_cache")
            .upsert(generalRows, { onConflict: "category,symbol,external_id" });
          if (!error) results.news += generalRows.length;
          else results.errors.push(`news general: ${error.message}`);
        }
      } catch (e) {
        results.errors.push(`news general: ${e}`);
      }

      for (const eq of equities) {
        try {
          const items = await fetchCompanyNews(finnhubSymbol(eq.symbol), finnhubKey);
          const rows = items
            .slice(0, 8)
            .map((n) => mapNewsRow("company", eq.symbol, n))
            .filter((r) => r.headline);
          if (rows.length) {
            const { error } = await supabase
              .from("news_cache")
              .upsert(rows, { onConflict: "category,symbol,external_id" });
            if (!error) results.news += rows.length;
            else results.errors.push(`news ${eq.symbol}: ${error.message}`);
          }
        } catch (e) {
          results.errors.push(`news ${eq.symbol}: ${e}`);
        }
        await sleep(1100);
      }
    }

    // ---- Daily portfolio snapshots (per user) ----
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: quotes } = await supabase
        .from("market_equity_quotes")
        .select("ticker, price");
      const priceMap = new Map(
        (quotes ?? []).map((q) => [q.ticker as string, Number(q.price)]),
      );

      const { data: holdings } = await supabase
        .from("equity_holdings")
        .select("user_id, ticker, shares, cost_per_share");
      const { data: balances } = await supabase
        .from("account_balances")
        .select("user_id, cash");
      const cashMap = new Map(
        (balances ?? []).map((b) => [b.user_id as string, Number(b.cash)]),
      );

      const byUser = new Map<string, { mv: number; cb: number }>();
      for (const h of holdings ?? []) {
        const px = priceMap.get(h.ticker as string) ?? 0;
        const mv = px * Number(h.shares);
        const cb = Number(h.cost_per_share) * Number(h.shares);
        const agg = byUser.get(h.user_id as string) ?? { mv: 0, cb: 0 };
        agg.mv += mv;
        agg.cb += cb;
        byUser.set(h.user_id as string, agg);
      }

      const snapshots = Array.from(byUser.entries()).map(([userId, agg]) => {
        const cash = cashMap.get(userId) ?? 0;
        return {
          user_id: userId,
          snapshot_date: today,
          market_value: agg.mv,
          cash,
          cost_basis: agg.cb,
          total_value: agg.mv + cash,
          unrealized_pnl: agg.mv - agg.cb,
        };
      });

      if (snapshots.length) {
        const { error } = await supabase
          .from("portfolio_snapshots")
          .upsert(snapshots, { onConflict: "user_id,snapshot_date" });
        if (!error) results.snapshots = snapshots.length;
        else results.errors.push(`snapshots: ${error.message}`);
      }
    } catch (e) {
      results.errors.push(`snapshots: ${e}`);
    }

    await supabase
      .from("market_refresh_log")
      .update({
        finished_at: new Date().toISOString(),
        status: results.errors.length ? "partial" : "success",
        details: results,
      })
      .eq("id", logId);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    await supabase
      .from("market_refresh_log")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        details: { error: String(err), results },
      })
      .eq("id", logId);

    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
