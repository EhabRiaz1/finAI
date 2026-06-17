import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   PORTFOLIO PERFORMANCE — per-account daily NAV → time-weighted return.
   Builds a Jan-1-to-today daily NAV series for the caller's own account
   (equities at daily close + bonds + cash), reconstructed from the
   ledger, then chains daily returns into a base-100 index with external
   flows (deposits, withdrawals, transfers) removed. Internal events
   (trades, dividends, fees) stay in the return. Benchmarks SPY/QQQ are
   rebased to 100 at the same start. See docs/modified-dietz.md.
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

const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const FLOW_TYPES = new Set(["deposit", "withdrawal", "transfer"]); // external; fees stay internal

async function pricesFor(sb: Json, symbols: string[], fromStr: string) {
  // Daily closes for the given symbols from fromStr onward, paginated past the 1000-row cap.
  const out = new Map<string, Map<string, number>>();
  if (!symbols.length) return out;
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("price_history").select("symbol, date, close")
      .in("symbol", symbols).gte("date", fromStr)
      .order("symbol", { ascending: true }).order("date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data || !data.length) break;
    for (const r of data) {
      if (!out.has(r.symbol)) out.set(r.symbol, new Map());
      out.get(r.symbol)!.set(r.date, Number(r.close));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function computeSeries(sb: Json, userIds: string[]) {
  const now = new Date();
  const startMs = Date.UTC(now.getUTCFullYear(), 0, 1);
  const fromStr = dstr(startMs - 10 * DAY); // small lead so the first axis day has a prior close

  const [hold, tx, cashTx, divs, bals, bondRes] = await Promise.all([
    sb.from("equity_holdings").select("ticker, shares").in("user_id", userIds),
    sb.from("transactions").select("symbol, side, quantity, price, commission, fees, trade_time").in("user_id", userIds),
    sb.from("cash_transactions").select("txn_date, type, amount").in("user_id", userIds),
    sb.from("dividends").select("pay_date, net").in("user_id", userIds),
    sb.from("account_balances").select("cash").in("user_id", userIds),
    sb.from("bond_holdings").select("face_value, quantity, purchase_price, start_price, current_price").in("user_id", userIds),
  ]);

  const holdings = hold.data ?? [];
  const transactions = tx.data ?? [];
  const cashRows = cashTx.data ?? [];
  const dividends = divs.data ?? [];
  const bonds = bondRes.data ?? [];
  const cashNow = (bals.data ?? []).reduce((s: number, b: Json) => s + Number(b.cash ?? 0), 0);

  // --- Current shares per ticker, then back out 2026 trades to get Jan-1 shares.
  const sharesNow = new Map<string, number>();
  for (const h of holdings) sharesNow.set(h.ticker, (sharesNow.get(h.ticker) ?? 0) + Number(h.shares));

  // Per-ticker dated share deltas (buy +qty / sell -qty) and per-account cash events.
  type Ev = { ms: number; delta: number; flow: number };
  const shareDeltas = new Map<string, { ms: number; d: number }[]>();
  const cashEvents: Ev[] = [];
  const sharesStart = new Map(sharesNow);

  for (const t of transactions) {
    const ms = new Date(t.trade_time).getTime();
    const qty = Number(t.quantity), px = Number(t.price);
    const cf = Number(t.commission ?? 0) + Number(t.fees ?? 0);
    const signed = t.side === "buy" ? qty : -qty;
    if (ms > startMs) {
      sharesStart.set(t.symbol, (sharesStart.get(t.symbol) ?? 0) - signed);
      if (!shareDeltas.has(t.symbol)) shareDeltas.set(t.symbol, []);
      shareDeltas.get(t.symbol)!.push({ ms, d: signed });
      // Trade settlement moves cash but is internal (cash <-> stock), so flow = 0.
      cashEvents.push({ ms, delta: t.side === "buy" ? -(qty * px + cf) : qty * px - cf, flow: 0 });
    }
  }
  for (const c of cashRows) {
    const ms = new Date(c.txn_date).getTime();
    if (ms > startMs) {
      const amt = Number(c.amount);
      cashEvents.push({ ms, delta: amt, flow: FLOW_TYPES.has(c.type) ? amt : 0 });
    }
  }
  for (const d of dividends) {
    const ms = new Date(d.pay_date).getTime();
    if (ms > startMs) cashEvents.push({ ms, delta: Number(d.net), flow: 0 }); // dividend = internal income
  }

  const netCashAfter = cashEvents.reduce((s, e) => s + e.delta, 0);
  const cashStart = cashNow - netCashAfter;

  // --- Bonds: clean price interpolated start->current across the window (held all period).
  const endMs = now.getTime();
  const bondValueAt = (ms: number) => {
    let v = 0;
    const frac = endMs > startMs ? Math.min(1, Math.max(0, (ms - startMs) / (endMs - startMs))) : 1;
    for (const b of bonds) {
      const nominal = Number(b.face_value ?? 0) * Number(b.quantity ?? 0);
      const p0 = Number(b.start_price ?? b.purchase_price ?? 100);
      const p1 = Number(b.current_price ?? b.purchase_price ?? p0);
      v += (nominal * (p0 + (p1 - p0) * frac)) / 100;
    }
    return v;
  };

  // --- Price axis from SPY, restricted to >= Jan 1.
  const tickers = Array.from(new Set([...sharesNow.keys(), ...transactions.map((t: Json) => t.symbol)]));
  const prices = await pricesFor(sb, Array.from(new Set([...tickers, "SPY", "QQQ"])), fromStr);
  const spy = prices.get("SPY") ?? new Map();
  const qqq = prices.get("QQQ") ?? new Map();
  const axis = Array.from(spy.keys()).filter((d) => new Date(d).getTime() >= startMs).sort();
  if (!axis.length) return { ready: false };

  // Iterate the axis, accumulating shares + cash and valuing NAV each day.
  const shareCursor = new Map<string, number>(); // index into each ticker's sorted delta list
  for (const [, arr] of shareDeltas) arr.sort((a, b) => a.ms - b.ms);
  cashEvents.sort((a, b) => a.ms - b.ms);
  let ci = 0, cash = cashStart;
  const curShares = new Map(sharesStart);
  const lastClose = new Map<string, number>();

  const series: { date: string; port: number; sp500: number; nasdaq: number; nav: number }[] = [];
  let prevNav = 0, idx = 100, spy0 = 0, qqq0 = 0;

  for (const date of axis) {
    const ms = new Date(date).getTime();
    // Apply share deltas up to and including this day.
    for (const [sym, arr] of shareDeltas) {
      let k = shareCursor.get(sym) ?? 0;
      while (k < arr.length && arr[k].ms <= ms + DAY - 1) { curShares.set(sym, (curShares.get(sym) ?? 0) + arr[k].d); k++; }
      shareCursor.set(sym, k);
    }
    // Apply cash events up to this day; sum today's external flow.
    let flowToday = 0;
    while (ci < cashEvents.length && cashEvents[ci].ms <= ms + DAY - 1) { cash += cashEvents[ci].delta; flowToday += cashEvents[ci].flow; ci++; }

    let equity = 0;
    for (const [sym, sh] of curShares) {
      const c = prices.get(sym)?.get(date) ?? lastClose.get(sym);
      if (c != null) lastClose.set(sym, c);
      if (sh) equity += sh * (lastClose.get(sym) ?? 0);
    }
    const nav = equity + bondValueAt(ms) + cash;
    const sc = spy.get(date) ?? 0;
    const qc = qqq.get(date) ?? 0;

    if (!series.length) { idx = 100; spy0 = sc || 1; qqq0 = qc || 1; }
    else if (prevNav > 0) { idx *= 1 + (nav - flowToday - prevNav) / prevNav; }
    prevNav = nav;
    series.push({ date, port: idx, sp500: (sc / spy0) * 100, nasdaq: (qc / qqq0) * 100, nav });
  }

  const last = series[series.length - 1];
  return {
    ready: true,
    series,
    startNav: series[0].nav,
    endNav: last.nav,
    twrPct: last.port - 100,
    asOf: now.toISOString(),
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
    return json(await computeSeries(admin, [user.id]));
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
