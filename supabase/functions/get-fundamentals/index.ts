import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   GET-FUNDAMENTALS — the single data adapter for the equity research
   report. Normalizes multi-source financials into one `Fundamentals`
   bundle the deterministic valuation engine consumes. The ONLY place
   that talks to data providers; the engine and renderer never do.

   Free stack (v1):
     - SEC EDGAR companyfacts (XBRL) — primary statements (us-gaap; best-
       effort ifrs-full for 20-F filers like TSMC, which is degraded).
     - Finnhub — price, beta, shares, sector, peers (already provisioned).
     - FMP (best-effort) — analyst Y1 growth consensus.
     - FRED (best-effort) — country risk-free rate.
   Auth-gated (caller JWT). App-global cache write via service role.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TICKER_RX = /^[A-Z0-9.\-]{1,12}$/; // SSRF guard: no raw user string ever becomes a host/path
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UA = "financeAI research-report (contact: admin@financeai.local)"; // EDGAR requires a descriptive UA
const MM = 1e6; // statements are returned in millions

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<Json | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ----------------------- EDGAR XBRL tag maps ----------------------- */
const USGAAP: Record<string, string[]> = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  pretaxIncome: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  depreciation: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"],
  assets: ["Assets"],
  equity: ["StockholdersEquity"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  shortTermInvest: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  currentDebt: ["LongTermDebtCurrent", "DebtCurrent"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  inventory: ["InventoryNet"],
  payables: ["AccountsPayableCurrent", "AccountsPayableTradeCurrent"],
  shares: ["CommonStockSharesOutstanding", "CommonStockSharesIssued"],
};
const IFRS: Record<string, string[]> = {
  revenue: ["Revenue", "RevenueFromContractsWithCustomers"],
  costOfRevenue: ["CostOfSales"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["ProfitLossFromOperatingActivities"],
  netIncome: ["ProfitLoss"],
  pretaxIncome: ["ProfitLossBeforeTax"],
  incomeTax: ["IncomeTaxExpenseContinuingOperations", "TaxExpenseIncome"],
  depreciation: ["DepreciationAndAmortisationExpense", "DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"],
  assets: ["Assets"],
  equity: ["EquityAttributableToOwnersOfParent", "Equity"],
  currentAssets: ["CurrentAssets"],
  currentLiabilities: ["CurrentLiabilities"],
  cash: ["CashAndCashEquivalents"],
  shortTermInvest: ["OtherCurrentFinancialAssets", "CurrentInvestments"],
  longTermDebt: ["NoncurrentPortionOfNoncurrentBorrowings", "LongtermBorrowings", "NoncurrentBorrowings"],
  currentDebt: ["CurrentPortionOfNoncurrentBorrowings", "ShorttermBorrowings", "CurrentBorrowings"],
  receivables: ["TradeAndOtherCurrentReceivables", "CurrentTradeReceivables"],
  inventory: ["Inventories"],
  payables: ["TradeAndOtherCurrentPayables", "CurrentTradePayables"],
  shares: ["NumberOfSharesOutstanding"],
};

/** Find the units array for the first matching concept across both taxonomies.
 *  Returns { entries, currency, taxonomy } or null. */
function findConcept(facts: Json, key: string): { entries: Json[]; currency: string; taxonomy: string } | null {
  for (const [tax, map] of [["us-gaap", USGAAP], ["ifrs-full", IFRS]] as const) {
    const block = facts?.facts?.[tax];
    if (!block) continue;
    for (const name of map[key] ?? []) {
      const units = block[name]?.units;
      if (!units) continue;
      // Prefer a currency unit; fall back to "shares" or the first unit present.
      const unitKey = Object.keys(units).find((u) => u !== "shares") ?? Object.keys(units)[0];
      if (unitKey && units[unitKey]?.length) {
        return { entries: units[unitKey], currency: unitKey === "shares" ? "" : unitKey, taxonomy: tax };
      }
    }
  }
  return null;
}

// An annual report form. CRITICAL: companyfacts tags a filing's comparative
// prior-year figures with the FILING's `fy`, so keying by `fy` mixes years.
// We key by the period-END year instead, and require a ~full-year duration so
// quarterly facts that share the annual form/fp are excluded.
const ANNUAL_FORM = (e: Json) => e?.form === "10-K" || e?.form === "20-F" || e?.form === "40-F";
const endYear = (e: Json) => (typeof e?.end === "string" ? Number(e.end.slice(0, 4)) : null);
const isFullYear = (e: Json) => {
  if (typeof e?.start !== "string" || typeof e?.end !== "string") return false;
  const dur = (Date.parse(e.end) - Date.parse(e.start)) / 86_400_000;
  return dur >= 340 && dur <= 400;
};

/** Annual series aligned to `years`, keyed by the period-END year and
 *  restatement-deduped (latest `filed` wins). Durations (income statement)
 *  must be ~full-year; instants (balance sheet) have no `start`. */
function annualSeries(facts: Json, key: string, years: number[], instant: boolean): { values: (number | null)[]; currency: string } {
  const found = findConcept(facts, key);
  if (!found) return { values: years.map(() => null), currency: "" };
  const byYear = new Map<number, { val: number; filed: string }>();
  for (const e of found.entries) {
    if (!e || e.val == null || !ANNUAL_FORM(e)) continue;
    const hasStart = typeof e.start === "string";
    if (instant && hasStart) continue; // instant facts have no start
    if (!instant && !isFullYear(e)) continue; // duration must be a full year
    const y = endYear(e);
    if (y == null) continue;
    const prev = byYear.get(y);
    if (!prev || String(e.filed) > prev.filed) byYear.set(y, { val: Number(e.val), filed: String(e.filed) });
  }
  return { values: years.map((y) => (byYear.has(y) ? byYear.get(y)!.val : null)), currency: found.currency };
}

/** Discover the most recent ~6 fiscal years that have full-year revenue. */
function discoverYears(facts: Json): number[] {
  const found = findConcept(facts, "revenue");
  if (!found) return [];
  const ys = new Set<number>();
  for (const e of found.entries) {
    if (ANNUAL_FORM(e) && isFullYear(e) && e.val != null) {
      const y = endYear(e);
      if (y != null) ys.add(y);
    }
  }
  return [...ys].sort((a, b) => a - b).slice(-6);
}

const div = (arr: (number | null)[], by: number) => arr.map((v) => (v == null ? null : v / by));
const addArr = (a: (number | null)[], b: (number | null)[]) =>
  a.map((v, i) => (v == null && b[i] == null ? null : (v ?? 0) + (b[i] ?? 0)));

/* ------------------------------ CIK ------------------------------- */
async function resolveCik(admin: Json, ticker: string): Promise<{ cik: string; title: string } | null> {
  const { data: cached } = await admin.from("sec_ticker_map").select("cik, title").eq("ticker", ticker).maybeSingle();
  if (cached?.cik) return { cik: cached.cik, title: cached.title ?? ticker };

  const map = await fetchJson("https://www.sec.gov/files/company_tickers.json", { "User-Agent": UA });
  if (!map) return null;
  // Refresh the whole map opportunistically (small, ~10k rows) for next time.
  const rows: { ticker: string; cik: string; title: string }[] = [];
  let hit: { cik: string; title: string } | null = null;
  for (const k of Object.keys(map)) {
    const r = map[k];
    if (!r?.ticker || r.cik_str == null) continue;
    const t = String(r.ticker).toUpperCase();
    const cik = String(r.cik_str).padStart(10, "0");
    rows.push({ ticker: t, cik, title: r.title ?? t });
    if (t === ticker) hit = { cik, title: r.title ?? ticker };
  }
  // Upsert in chunks (best-effort; ignore failures).
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from("sec_ticker_map").upsert(rows.slice(i, i + 1000), { onConflict: "ticker" });
  }
  return hit;
}

/* ----------------------------- handler ----------------------------- */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Not authenticated" }, 401);

  let body: { ticker?: string; refresh?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const ticker = String(body?.ticker ?? "").trim().toUpperCase();
  if (!ticker) return json({ error: "ticker is required" }, 400);
  if (!TICKER_RX.test(ticker)) return json({ error: "Invalid ticker format" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  // Validate the caller (RLS client) and get a service client for cache writes.
  const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);
  const admin = serviceKey ? createClient(SUPABASE_URL, serviceKey) : userClient;

  // 1) Cache hit?
  if (!body.refresh) {
    const { data: cached } = await admin.from("fundamentals_cache").select("data, fetched_at").eq("ticker", ticker).maybeSingle();
    if (cached?.data && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return json({ fundamentals: cached.data, cached: true });
    }
  }

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
  const fredKey = Deno.env.get("FRED_API_KEY") ?? "";
  const { data: fmpCfg } = await admin.from("app_config").select("value").eq("key", "fmp_api_key").maybeSingle();
  const fmpKey = fmpCfg?.value ?? "";

  const warnings: string[] = [];
  const sources: Record<string, string> = {};

  // 2) Parallel fetch: SEC + Finnhub.
  const cikP = resolveCik(admin, ticker);
  const enc = encodeURIComponent(ticker);
  const [profile, quote, metric, peersRaw] = await Promise.all([
    finnhubKey ? fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${enc}&token=${finnhubKey}`) : null,
    finnhubKey ? fetchJson(`https://finnhub.io/api/v1/quote?symbol=${enc}&token=${finnhubKey}`) : null,
    finnhubKey ? fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${enc}&metric=all&token=${finnhubKey}`) : null,
    finnhubKey ? fetchJson(`https://finnhub.io/api/v1/stock/peers?symbol=${enc}&token=${finnhubKey}`) : null,
  ]);
  if (profile || quote) sources.market = "finnhub";

  const cik = await cikP;
  let facts: Json = null;
  if (cik) {
    facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.cik}.json`, { "User-Agent": UA });
    if (facts) sources.statements = "sec-edgar";
  }
  if (!facts) warnings.push("No SEC filing data found for this ticker — statement history is unavailable (the company may not file with the SEC).");

  // 3) Build statement series from EDGAR (in millions of reporting currency).
  const years = facts ? discoverYears(facts) : [];
  const isIfrs = facts && findConcept(facts, "revenue")?.taxonomy === "ifrs-full";
  if (isIfrs) warnings.push("Filer reports under IFRS (20-F) — EDGAR IFRS coverage is sparse; some line items may be missing and are shown as data unavailable.");

  const rev = annualSeries(facts, "revenue", years, false);
  const reportingCurrency = rev.currency || profile?.currency || "USD";
  const get = (k: string, instant = false) => annualSeries(facts, k, years, instant).values;

  const revenue = div(get("revenue"), MM);
  const grossProfitRaw = get("grossProfit");
  const costOfRevenue = get("costOfRevenue");
  const grossProfit = div(grossProfitRaw.map((g, i) => (g != null ? g : revenue[i] != null && costOfRevenue[i] != null ? revenue[i]! * MM - costOfRevenue[i]! : null)), MM);
  const operatingIncome = div(get("operatingIncome"), MM);
  const netIncome = div(get("netIncome"), MM);
  const pretaxIncome = div(get("pretaxIncome"), MM);
  const incomeTaxExpense = div(get("incomeTax"), MM);
  const depreciation = div(get("depreciation"), MM);
  const ebitda = operatingIncome.map((e, i) => (e != null && depreciation[i] != null ? e + depreciation[i]! : null));
  const totalAssets = div(get("assets", true), MM);
  const totalEquity = div(get("equity", true), MM);
  const currentAssets = div(get("currentAssets", true), MM);
  const currentLiabilities = div(get("currentLiabilities", true), MM);
  const cash = get("cash", true);
  const sti = get("shortTermInvest", true);
  const cashAndSTInvest = div(addArr(cash, sti), MM);
  const longTermDebt = get("longTermDebt", true);
  const currentDebt = get("currentDebt", true);
  const totalDebt = div(addArr(longTermDebt, currentDebt), MM);
  const receivables = div(get("receivables", true), MM);
  const inventory = div(get("inventory", true), MM);
  const payables = div(get("payables", true), MM);
  const cogs = div(costOfRevenue, MM);

  // 4) Identity / market fields.
  const sharesOut = profile?.shareOutstanding != null
    ? Number(profile.shareOutstanding) // Finnhub: already in millions
    : (() => { const s = get("shares", true).filter((v) => v != null); return s.length ? s[s.length - 1]! / MM : null; })();
  const price = quote?.c ?? null;
  const m = metric?.metric ?? {};
  const beta = m.beta ?? null;

  // Net debt (latest), preferring computed series.
  const lastOf = (a: (number | null)[]) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]!; return null; };
  const latestDebt = lastOf(totalDebt);
  const latestCash = lastOf(cashAndSTInvest);
  const netDebt = latestDebt != null || latestCash != null ? (latestDebt ?? 0) - (latestCash ?? 0) : null;
  const bookValueEquity = lastOf(totalEquity);

  // 5) Risk-free rate (FRED, best-effort; currency-aware fallback).
  let riskFreeRate: number | null = null;
  if (fredKey) {
    const series = reportingCurrency === "TWD" ? "IRLTLT01TWM156N" : "DGS10";
    const fred = await fetchJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&sort_order=desc&limit=1&file_type=json&api_key=${fredKey}`);
    const v = Number(fred?.observations?.[0]?.value);
    if (Number.isFinite(v)) { riskFreeRate = v / 100; sources.riskFreeRate = "fred"; }
  }
  if (riskFreeRate == null) {
    riskFreeRate = reportingCurrency === "TWD" ? 0.014 : 0.0428;
    warnings.push("Live risk-free rate unavailable — using a default 10Y government yield for the reporting currency.");
  }

  // 6) Analyst Y1 growth (FMP, best-effort).
  let analystY1Growth: number | null = null;
  if (fmpKey) {
    const est = await fetchJson(`https://financialmodelingprep.com/api/v3/analyst-estimates/${enc}?limit=2&apikey=${fmpKey}`);
    const next = est?.[0]?.estimatedRevenueAvg, base = lastOf(revenue);
    if (Number.isFinite(Number(next)) && base) { analystY1Growth = Number(next) / MM / base - 1; sources.analystEstimates = "fmp"; }
  }
  if (analystY1Growth == null) warnings.push("No analyst consensus available — Year-1 growth defaults to the last reported growth rate.");

  // 7) Peers (Finnhub list → enrich with cached quotes/metrics is out of scope
  //    for v1; we pass the symbols and any metrics we can cheaply attach).
  const peerSymbols: string[] = Array.isArray(peersRaw) ? peersRaw.filter((p: string) => p && p !== ticker).slice(0, 10) : [];
  const peers = peerSymbols.map((sym) => ({ ticker: sym, name: sym }));
  if (!peers.length) warnings.push("No peer set available — cross-sectional comparison and median multiples are omitted.");

  const fundamentals = {
    ticker,
    name: profile?.name ?? cik?.title ?? ticker,
    exchange: profile?.exchange ?? null,
    sector: profile?.finnhubIndustry ?? null,
    currency: reportingCurrency,
    asOf: new Date().toISOString().slice(0, 10),
    price, sharesOut, beta, riskFreeRate, analystY1Growth,
    bookValueEquity, netDebt,
    years,
    revenue, grossProfit, operatingIncome, ebitda, netIncome, pretaxIncome, incomeTaxExpense, depreciation,
    totalAssets, totalEquity, currentAssets, currentLiabilities, cashAndSTInvest, totalDebt,
    receivables, inventory, payables, cogs,
    peers,
    reportingTaxonomy: isIfrs ? "ifrs-full" : facts ? "us-gaap" : null,
    dataQuality: { sources, warnings },
  };

  // 8) Cache (service role; app-global).
  await admin.from("fundamentals_cache").upsert(
    { ticker, data: fundamentals, source_summary: { sources, warnings }, fetched_at: new Date().toISOString() },
    { onConflict: "ticker" },
  );

  return json({ fundamentals, cached: false });
});
