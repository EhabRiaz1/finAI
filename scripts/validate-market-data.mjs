#!/usr/bin/env node
/**
 * Validates live market data in Supabase after refresh.
 * Usage: node scripts/validate-market-data.mjs
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://spyacqjjceboodaxsnbi.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function query(table, select = "*") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=5`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!ANON_KEY) {
    console.error("Set VITE_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  console.log("Triggering market refresh…");
  const refresh = await fetch(`${SUPABASE_URL}/functions/v1/refresh-market-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const refreshBody = await refresh.json();
  console.log("Refresh response:", JSON.stringify(refreshBody, null, 2));

  const [equities, curve, bonds] = await Promise.all([
    query("market_equity_quotes", "ticker,price,prev_close,change_pct,source,updated_at"),
    query("market_yield_curve", "tenor,yield,fred_series_id,updated_at"),
    query("market_bond_quotes", "identifier,yield,source,updated_at"),
  ]);

  console.log("\n--- Equity quotes (sample) ---");
  equities.forEach((e) => console.log(`${e.ticker}: $${e.price} (${e.change_pct?.toFixed(2)}%) [${e.source}]`));

  console.log("\n--- Treasury 10Y ---");
  const tenY = curve.find((p) => p.tenor === "10Y") || bonds.find((b) => b.identifier === "US 10Y");
  console.log(tenY ? `10Y yield: ${tenY.yield}%` : "10Y not found — check FRED_API_KEY");

  const ok = equities.length >= 3 && curve.length >= 5;
  console.log(ok ? "\nValidation PASSED" : "\nValidation INCOMPLETE — set FINNHUB_API_KEY and FRED_API_KEY in Supabase secrets");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
