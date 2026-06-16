import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { modifiedDietz } from "../lib/modifiedDietz";

/* ------------------------------------------------------------------
   Per-account (RLS-scoped) Modified Dietz YTD return.

   BMV is reconstructed for the start of the year by replaying the
   account's own ledger backward:
     • shares_start = shares_now − Σ signed trades after start
     • cash_start   = cash_now   − Σ cash events after start
       (deposits/withdrawals + trade settlements + dividends)
     • BMV = Σ shares_start × close_at_start + cash_start
   EMV = current market value (holdings × live quote) + current cash.
   External flows (for the weighting) = cash_transactions only.

   NOTE: accuracy depends on the account being internally consistent
   (its purchases funded by its own recorded cash). See docs/modified-dietz.md.
   ------------------------------------------------------------------ */

const DAY = 86400000;

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function useModifiedDietz({ holdings = [], quotesByTicker, cash = 0 }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);

  // Stable key: refetch when the set of holdings changes.
  const holdingsKey = useMemo(
    () => holdings.map((h) => `${h.ticker}:${h.shares}`).sort().join("|"),
    [holdings],
  );

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); // Jan 1, current year

    async function run() {
      setLoading(true);
      const [tx, cashTx, divs] = await Promise.all([
        supabase.from("transactions").select("symbol, side, quantity, price, commission, fees, trade_time"),
        supabase.from("cash_transactions").select("txn_date, type, amount"),
        supabase.from("dividends").select("pay_date, net"),
      ]);

      const transactions = tx.data ?? [];
      const tickers = Array.from(new Set([...holdings.map((h) => h.ticker), ...transactions.map((t) => t.symbol)]));

      // Prices around the window start for each ticker that ever appeared.
      const lo = ymd(start.getTime() - 25 * DAY);
      const hi = ymd(start.getTime() + 7 * DAY);
      let startPrices = new Map();
      if (tickers.length) {
        const ph = await supabase
          .from("price_history")
          .select("symbol, date, close")
          .in("symbol", tickers)
          .gte("date", lo)
          .lte("date", hi)
          .order("date", { ascending: true });
        const target = start.getTime();
        for (const r of ph.data ?? []) {
          const cur = startPrices.get(r.symbol);
          const dt = new Date(r.date).getTime();
          // Prefer the close on/just-before start; else the nearest available.
          if (!cur || Math.abs(dt - target) < Math.abs(cur.dt - target)) {
            startPrices.set(r.symbol, { dt, close: Number(r.close) });
          }
        }
      }

      if (!cancelled) {
        setRaw({ transactions, cashTx: cashTx.data ?? [], dividends: divs.data ?? [], startPrices, start, end: now });
        setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [holdingsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (loading || !raw) return { loading: true, ready: false };
    const { transactions, cashTx, dividends, startPrices, start, end } = raw;
    const startMs = start.getTime();

    const sharesNow = new Map(holdings.map((h) => [h.ticker, Number(h.shares)]));
    const costNow = new Map(holdings.map((h) => [h.ticker, Number(h.cost_per_share ?? 0)]));
    const txPrice = new Map(); // fallback start price = first trade price seen

    // shares_start = shares_now − Σ signed trades after start; cash flow from trades
    const sharesStart = new Map(sharesNow);
    let netCashAfter = 0;
    for (const t of transactions) {
      if (!txPrice.has(t.symbol)) txPrice.set(t.symbol, Number(t.price));
      if (new Date(t.trade_time).getTime() <= startMs) continue;
      const qty = Number(t.quantity);
      const px = Number(t.price);
      const cost = Number(t.commission ?? 0) + Number(t.fees ?? 0);
      const signed = t.side === "buy" ? qty : -qty;
      sharesStart.set(t.symbol, (sharesStart.get(t.symbol) ?? 0) - signed);
      netCashAfter += t.side === "buy" ? -(qty * px + cost) : qty * px - cost;
    }
    for (const c of cashTx) {
      if (new Date(c.txn_date).getTime() > startMs) netCashAfter += Number(c.amount);
    }
    for (const d of dividends) {
      if (new Date(d.pay_date).getTime() > startMs) netCashAfter += Number(d.net);
    }

    // BMV = reconstructed equity value at start + reconstructed start cash
    let bmvEquity = 0;
    let uncovered = 0;
    for (const [ticker, sh] of sharesStart) {
      if (!sh) continue;
      const px = startPrices.get(ticker)?.close ?? costNow.get(ticker) ?? txPrice.get(ticker);
      if (px == null) { uncovered++; continue; }
      bmvEquity += sh * px;
    }
    const cashStart = cash - netCashAfter;
    const bmv = bmvEquity + cashStart;

    // EMV = current holdings × live quote + current cash
    let emvEquity = 0;
    for (const h of holdings) {
      const px = quotesByTicker?.get?.(h.ticker)?.price ?? costNow.get(h.ticker) ?? 0;
      emvEquity += Number(h.shares) * px;
    }
    const emv = emvEquity + cash;

    const flows = cashTx
      .filter((c) => { const t = new Date(c.txn_date).getTime(); return t > startMs && t <= end.getTime(); })
      .map((c) => ({ date: c.txn_date, amount: Number(c.amount) }));

    const res = modifiedDietz({ bmv, emv, flows, start, end });
    if (!res) return { loading: false, ready: false };

    return {
      loading: false,
      ready: true,
      ret: res.ret,
      bmv: res.bmv,
      emv: res.emv,
      netFlows: res.netFlows,
      gain: res.gain,
      asOf: end,
      cashStartNegative: cashStart < 0, // signals a split/ledger inconsistency
      uncovered,
    };
  }, [loading, raw, holdings, quotesByTicker, cash]);
}
