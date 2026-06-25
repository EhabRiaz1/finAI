import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   PORTFOLIO RETURN — single-account Modified Dietz.
   Computes the caller's OWN account return only (the logged-in user_id).

   Window:
   - If the caller has a row in portfolio_return_baseline, the return is
     measured SINCE INCEPTION: start = that inception_date, BMV = the
     stored baseline_value, and inter-account transfers are treated as
     in-kind (NOT cash flows) so funding the sleeve doesn't distort it.
     This lets an account "reset to 0%" from a chosen date and accrue
     real performance forward.
   - Otherwise it falls back to YTD (start = Jan 1), with transfers
     treated as external cash flows.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DAY = 86400000;
// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function modifiedDietz(bmv: number, emv: number, flows: { date: string; amount: number }[], start: number, end: number) {
  const T = (end - start) / DAY;
  if (!(T > 0)) return null;
  let F = 0, weighted = 0;
  for (const f of flows) {
    const t = (new Date(f.date).getTime() - start) / DAY;
    const w = Math.min(1, Math.max(0, (T - t) / T));
    F += f.amount;
    weighted += f.amount * w;
  }
  const denom = bmv + weighted;
  if (!(Math.abs(denom) > 1e-9)) return null;
  return { ret: (emv - bmv - F) / denom, bmv, emv, netFlows: F, gain: emv - bmv - F };
}

type Baseline = { inception_date: string; baseline_value: number } | null;

async function computeReturn(sb: Json, userIds: string[], opts: { inclTransfer: boolean; baseline: Baseline }) {
  const { inclTransfer, baseline } = opts;
  const now = new Date();
  // Since-inception when a baseline is set; otherwise YTD (Jan 1).
  const start = baseline ? new Date(baseline.inception_date) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const startMs = start.getTime();

  const [hold, tx, cashTx, divs, bals, bondRes] = await Promise.all([
    sb.from("equity_holdings").select("ticker, shares, cost_per_share").in("user_id", userIds),
    sb.from("transactions").select("symbol, side, quantity, price, commission, fees, trade_time").in("user_id", userIds),
    sb.from("cash_transactions").select("txn_date, type, amount").in("user_id", userIds),
    sb.from("dividends").select("pay_date, net").in("user_id", userIds),
    sb.from("account_balances").select("cash").in("user_id", userIds),
    sb.from("bond_holdings").select("face_value, quantity, purchase_price, start_price, current_price").in("user_id", userIds),
  ]);

  // Bonds are held across the whole window (no flows): they add to both BMV and EMV.
  let bmvBonds = 0, emvBonds = 0;
  for (const b of bondRes.data ?? []) {
    const nominal = Number(b.face_value ?? 0) * Number(b.quantity ?? 0);
    bmvBonds += (nominal * Number(b.start_price ?? b.purchase_price ?? 100)) / 100;
    emvBonds += (nominal * Number(b.current_price ?? b.purchase_price ?? 100)) / 100;
  }

  const holdings = hold.data ?? [];
  const transactions = tx.data ?? [];
  const cashNow = (bals.data ?? []).reduce((s: number, b: Json) => s + Number(b.cash ?? 0), 0);

  // Aggregate current shares per ticker (the account may hold a ticker in >1 row).
  const sharesNow = new Map<string, number>();
  const costNow = new Map<string, number>();
  for (const h of holdings) {
    sharesNow.set(h.ticker, (sharesNow.get(h.ticker) ?? 0) + Number(h.shares));
    costNow.set(h.ticker, Number(h.cost_per_share ?? 0));
  }

  const tickers = Array.from(new Set([...sharesNow.keys(), ...transactions.map((t: Json) => t.symbol)]));

  // Start-of-year prices.
  const lo = new Date(startMs - 25 * DAY).toISOString().slice(0, 10);
  const hi = new Date(startMs + 7 * DAY).toISOString().slice(0, 10);
  const startPrices = new Map<string, number>();
  if (tickers.length) {
    const ph = await sb.from("price_history").select("symbol, date, close").in("symbol", tickers).gte("date", lo).lte("date", hi).order("date", { ascending: true });
    const best = new Map<string, number>();
    for (const r of ph.data ?? []) {
      const dt = new Date(r.date).getTime();
      const cur = best.get(r.symbol);
      if (cur == null || Math.abs(dt - startMs) < Math.abs(cur - startMs)) { best.set(r.symbol, dt); startPrices.set(r.symbol, Number(r.close)); }
    }
  }
  // Current quotes for EMV.
  const quotes = new Map<string, number>();
  if (sharesNow.size) {
    const q = await sb.from("market_equity_quotes").select("ticker, price").in("ticker", Array.from(sharesNow.keys()));
    for (const r of q.data ?? []) quotes.set(r.ticker, Number(r.price));
  }

  // Reconstruct shares_start + cash flow after start.
  const sharesStart = new Map(sharesNow);
  const txPrice = new Map<string, number>();
  let netCashAfter = 0;
  for (const t of transactions) {
    if (!txPrice.has(t.symbol)) txPrice.set(t.symbol, Number(t.price));
    if (new Date(t.trade_time).getTime() <= startMs) continue;
    const qty = Number(t.quantity), px = Number(t.price), cf = Number(t.commission ?? 0) + Number(t.fees ?? 0);
    sharesStart.set(t.symbol, (sharesStart.get(t.symbol) ?? 0) - (t.side === "buy" ? qty : -qty));
    netCashAfter += t.side === "buy" ? -(qty * px + cf) : qty * px - cf;
  }
  for (const c of cashTx.data ?? []) {
    if ((inclTransfer || c.type !== "transfer") && new Date(c.txn_date).getTime() > startMs) netCashAfter += Number(c.amount);
  }
  for (const d of divs.data ?? []) {
    if (new Date(d.pay_date).getTime() > startMs) netCashAfter += Number(d.net);
  }

  let bmvEquity = 0;
  for (const [ticker, sh] of sharesStart) {
    if (!sh) continue;
    const px = startPrices.get(ticker) ?? costNow.get(ticker) ?? txPrice.get(ticker);
    if (px != null) bmvEquity += sh * px;
  }
  const cashStart = cashNow - netCashAfter;
  // Since-inception: BMV is the stored baseline value (the portfolio's worth at
  // the reset). YTD: BMV is reconstructed from the start-of-year ledger.
  const bmv = baseline ? Number(baseline.baseline_value) : bmvEquity + bmvBonds + cashStart;

  let emvEquity = 0;
  for (const [ticker, sh] of sharesNow) emvEquity += sh * (quotes.get(ticker) ?? costNow.get(ticker) ?? 0);
  const emv = emvEquity + emvBonds + cashNow;

  const flows = (cashTx.data ?? [])
    .filter((c: Json) => (inclTransfer || c.type !== "transfer") && new Date(c.txn_date).getTime() > startMs)
    .map((c: Json) => ({ date: c.txn_date, amount: Number(c.amount) }));

  const r = modifiedDietz(bmv, emv, flows, startMs, now.getTime());
  if (!r) return { ready: false };
  return {
    ready: true,
    ...r,
    cashStart,
    asOf: now.toISOString(),
    mode: baseline ? "inception" : "ytd",
    label: baseline ? "Since inception" : "YTD",
    startDate: start.toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // Since-inception (transfers in-kind) when the caller has a baseline; else
    // YTD with transfers treated as external flows.
    const { data: baseline } = await admin
      .from("portfolio_return_baseline")
      .select("inception_date, baseline_value")
      .eq("user_id", user.id)
      .maybeSingle();
    const result = await computeReturn(admin, [user.id], { inclTransfer: !baseline, baseline: baseline ?? null });
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
