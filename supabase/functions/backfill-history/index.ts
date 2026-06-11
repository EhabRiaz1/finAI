import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   BACKFILL-HISTORY — pulls ~1yr of daily OHLC from the free Yahoo
   Finance chart endpoint into public.price_history for every active
   equity in the registry plus the benchmark ETFs (SPY/QQQ/VOO).
   Powers Alpha/Beta/Sharpe/vol/drawdown and the performance benchmarks.

   NOTE: Yahoo's public chart endpoint is unofficial and rate-limited.
   To switch to a paid/licensed provider (Polygon/Alpha Vantage/Finnhub
   paid/Tiingo), see docs/market-data-paid-migration.md.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Map our ticker -> Yahoo symbol (class shares use a dash).
function yahooSymbol(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchYahoo(
  ticker: string,
): Promise<Array<Record<string, unknown>>> {
  const sym = yahooSymbol(ticker);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp) return [];

  const ts: number[] = result.timestamp;
  const q = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i] ?? adj?.[i];
    if (close == null || !Number.isFinite(close)) continue;
    rows.push({
      symbol: ticker,
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: Number.isFinite(q.open?.[i]) ? q.open[i] : null,
      high: Number.isFinite(q.high?.[i]) ? q.high[i] : null,
      low: Number.isFinite(q.low?.[i]) ? q.low[i] : null,
      close,
      volume: Number.isFinite(q.volume?.[i]) ? q.volume[i] : null,
      source: "yahoo",
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = { symbols: 0, rows: 0, errors: [] as string[] };

  try {
    const { data: registry } = await supabase
      .from("instrument_registry")
      .select("symbol")
      .eq("instrument_type", "equity")
      .eq("is_active", true);

    const benchmarks = ["SPY", "QQQ", "VOO"];
    const symbols = Array.from(
      new Set([
        ...(registry ?? []).map((r) => r.symbol as string),
        ...benchmarks,
      ]),
    );

    for (const sym of symbols) {
      try {
        const rows = await fetchYahoo(sym);
        if (rows.length) {
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = await supabase
              .from("price_history")
              .upsert(chunk, { onConflict: "symbol,date" });
            if (error) results.errors.push(`${sym}: ${error.message}`);
          }
          results.symbols++;
          results.rows += rows.length;
        } else {
          results.errors.push(`${sym}: no data`);
        }
      } catch (e) {
        results.errors.push(`${sym}: ${e}`);
      }
      await sleep(300);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err), results }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
