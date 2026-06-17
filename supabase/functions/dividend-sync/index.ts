import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   DIVIDEND SYNC — forward-looking dividend automation via FMP.
   FMP's free dividends-calendar is forward-only (it blocks `from`
   dates more than ~2 weeks in the past), so this fills dividends going
   ex from ~now onward. Historical dividends come from the HSBC
   statement (seeded separately). For each account it multiplies the
   per-share amount by the shares held on the ex-date (reconstructed
   from the ledger), applies withholding tax (30% US, ADR-specific for
   NVO/BYDDY), and credits net on the pay date. Idempotent: it only
   manages rows tagged notes='fmp'. Meant to run daily (cron). Admin
   endpoint (verify_jwt=false), same pattern as refresh-market-data.
   ------------------------------------------------------------------ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DAY = 86400000;
const FMP_CAL = "https://financialmodelingprep.com/stable/dividends-calendar";
const ADR_WHT: Record<string, number> = { NVO: 0.27, BYDDY: 0.10 }; // Denmark / China
const DEFAULT_WHT = 0.30; // US default
// deno-lint-ignore no-explicit-any
type Json = any;

const json = (b: Json, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: cfg } = await admin.from("app_config").select("value").eq("key", "fmp_api_key").maybeSingle();
  const key = cfg?.value;
  if (!key) return json({ error: "FMP key not configured" }, 500);

  const now = new Date();
  const startMs = Date.UTC(now.getUTCFullYear(), 0, 1);
  const fromStr = dstr(now.getTime() - 7 * DAY);  // free tier only allows a recent `from`
  const toStr = dstr(now.getTime() + 90 * DAY);

  let cal: Json;
  try {
    const res = await fetch(`${FMP_CAL}?from=${fromStr}&to=${toStr}&apikey=${key}`);
    cal = await res.json();
  } catch (e) {
    return json({ error: "FMP fetch failed", detail: String(e) }, 502);
  }
  if (!Array.isArray(cal)) return json({ error: "FMP returned non-array", detail: cal }, 502);

  const bySym = new Map<string, Json[]>();
  for (const d of cal) {
    if (!bySym.has(d.symbol)) bySym.set(d.symbol, []);
    bySym.get(d.symbol)!.push(d);
  }

  const { data: holders } = await admin.from("equity_holdings").select("user_id");
  const users = Array.from(new Set((holders ?? []).map((h: Json) => h.user_id)));

  const synced: Json[] = [];
  for (const uid of users) {
    const [hold, tx] = await Promise.all([
      admin.from("equity_holdings").select("ticker, shares").eq("user_id", uid),
      admin.from("transactions").select("symbol, side, quantity, trade_time").eq("user_id", uid),
    ]);
    const cur = new Map<string, number>();
    for (const h of hold.data ?? []) cur.set(h.ticker, (cur.get(h.ticker) ?? 0) + Number(h.shares));
    const trades = tx.data ?? [];
    const tickers = new Set<string>([...cur.keys(), ...trades.map((t: Json) => t.symbol)]);

    // Shares held on ex-date = current shares minus trades executed after the ex-date.
    const sharesOnEx = (sym: string, exMs: number) => {
      let s = cur.get(sym) ?? 0;
      for (const t of trades) {
        if (t.symbol === sym && new Date(t.trade_time).getTime() > exMs) {
          s -= t.side === "buy" ? Number(t.quantity) : -Number(t.quantity);
        }
      }
      return s;
    };

    for (const sym of tickers) {
      for (const d of bySym.get(sym) ?? []) {
        const exMs = new Date(d.date).getTime();
        if (exMs <= startMs) continue; // earlier divs come from the statement
        const sh = sharesOnEx(sym, exMs);
        if (sh <= 0) continue;
        const per = Number(d.dividend);
        if (!(per > 0)) continue;
        const rate = ADR_WHT[sym] ?? DEFAULT_WHT;
        const gross = per * sh;
        const wht = gross * rate;
        const pay = d.paymentDate || d.date;
        // Idempotent: replace any prior fmp row for this (user, symbol, pay date).
        await admin.from("dividends").delete().eq("user_id", uid).eq("symbol", sym).eq("pay_date", pay).eq("notes", "fmp");
        await admin.from("dividends").insert({
          user_id: uid, symbol: sym, pay_date: pay, per_share: per, shares: sh,
          gross, withholding_tax: wht, net: gross - wht, currency: "USD", notes: "fmp",
        });
        synced.push({ uid, sym, ex: d.date, pay, sh, net: +(gross - wht).toFixed(2) });
      }
    }
  }

  return json({ ok: true, window: [fromStr, toStr], accounts: users.length, synced: synced.length, detail: synced });
});
