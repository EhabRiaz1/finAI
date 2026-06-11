import { useMemo } from "react";
import { usePriceHistory } from "./usePriceHistory";

const BENCHES = { SPY: "S&P 500", QQQ: "NASDAQ" };

/**
 * Builds a normalized (base 100) performance series comparing the portfolio
 * against S&P 500 (SPY) and NASDAQ (QQQ), using current share weights applied
 * across the daily price history of held symbols.
 */
export function usePerformance(holdings) {
  const symbols = useMemo(() => {
    const held = (holdings ?? []).map((h) => h.ticker);
    return Array.from(new Set([...held, ...Object.keys(BENCHES)]));
  }, [holdings]);

  const { history, loading } = usePriceHistory(symbols);

  const series = useMemo(() => {
    if (loading || !holdings?.length) return [];

    // Build a common date axis from SPY (most complete benchmark).
    const spy = history.get("SPY") ?? [];
    if (!spy.length) return [];
    const dates = spy.map((d) => d.date);

    const closeAt = (sym) => {
      const arr = history.get(sym) ?? [];
      const m = new Map(arr.map((d) => [d.date, d.close]));
      return m;
    };

    const portMaps = holdings.map((h) => ({ shares: Number(h.shares), m: closeAt(h.ticker) }));
    const spyMap = closeAt("SPY");
    const qqqMap = closeAt("QQQ");

    // Portfolio value per date (carry forward last known close for missing days).
    const last = {};
    const portVals = [];
    const spyVals = [];
    const qqqVals = [];
    const keptDates = [];
    for (const date of dates) {
      let pv = 0;
      let ok = true;
      for (let i = 0; i < portMaps.length; i++) {
        const c = portMaps[i].m.get(date) ?? last[`p${i}`];
        if (c == null) {
          ok = false;
          break;
        }
        last[`p${i}`] = c;
        pv += c * portMaps[i].shares;
      }
      const sc = spyMap.get(date);
      const qc = qqqMap.get(date) ?? last.q;
      if (qc != null) last.q = qc;
      if (!ok || sc == null) continue;
      keptDates.push(date);
      portVals.push(pv);
      spyVals.push(sc);
      qqqVals.push(last.q ?? qc);
    }

    if (!portVals.length) return [];
    const base = (arr) => (arr[0] ? arr[0] : 1);
    const p0 = base(portVals);
    const s0 = base(spyVals);
    const q0 = base(qqqVals);

    return keptDates.map((date, i) => ({
      date,
      portfolio: (portVals[i] / p0) * 100,
      sp500: (spyVals[i] / s0) * 100,
      nasdaq: (qqqVals[i] / q0) * 100,
    }));
  }, [history, holdings, loading]);

  return { series, loading };
}
