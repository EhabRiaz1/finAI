import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ------------------------------------------------------------------
   On-demand single-symbol quote + company profile (Finnhub), for the
   Research tab when the user opens a ticker that isn't in the cached
   market_equity_quotes. Auth-gated (verify_jwt) so the key isn't abused.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYMBOL_MAP: Record<string, string> = { "BRK.B": "BRK-B", VIX: "^VIX" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function fj(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const key = Deno.env.get("FINNHUB_API_KEY");
  if (!key) return json({ error: "FINNHUB_API_KEY not configured" }, 503);

  let body: { symbol?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const raw = (body?.symbol ?? "").trim().toUpperCase();
  if (!raw) return json({ error: "symbol is required" }, 400);
  const sym = SYMBOL_MAP[raw] ?? raw;

  try {
    const [quote, profile] = await Promise.all([
      fj(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`),
      fj(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${key}`),
    ]);

    if (!quote?.c) return json({ found: false, ticker: raw });

    const price = quote.c;
    const prev = quote.pc ?? price;
    const change_pct = quote.dp ?? (prev ? ((price - prev) / prev) * 100 : 0);

    return json({
      found: true,
      ticker: raw,
      name: profile?.name ?? raw,
      sector: profile?.finnhubIndustry ?? null,
      price,
      prev_close: prev,
      change_pct,
      mcap: profile?.marketCapitalization ? profile.marketCapitalization / 1000 : null,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
