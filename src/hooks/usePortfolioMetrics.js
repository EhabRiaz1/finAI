import { useMemo } from "react";
import { usePriceHistory } from "./usePriceHistory";
import { computeMetrics, toReturns, beta, alpha, capm, volatility, sharpe, maxDrawdown, cumulative } from "../lib/metrics";

const BENCH = "SPY";

/**
 * Computes per-position and portfolio-level risk metrics (Beta, Alpha, Sharpe,
 * volatility, max drawdown, total return) from daily price history vs SPY.
 */
export function usePortfolioMetrics(holdings, rf = 0.0428) {
  const symbols = useMemo(() => {
    const held = (holdings ?? []).map((h) => h.ticker);
    return Array.from(new Set([...held, BENCH]));
  }, [holdings]);

  const { history, loading } = usePriceHistory(symbols);

  return useMemo(() => {
    if (loading || !holdings?.length) return { byTicker: {}, portfolio: null, loading };

    const bench = (history.get(BENCH) ?? []).map((d) => d.close);

    const byTicker = {};
    for (const h of holdings) {
      const arr = (history.get(h.ticker) ?? []).map((d) => d.close);
      byTicker[h.ticker] = computeMetrics(arr, bench, rf);
    }

    // Portfolio series: weight each holding's closes by current shares on a
    // common date axis (SPY dates), carrying forward last known closes.
    const spy = history.get(BENCH) ?? [];
    const dates = spy.map((d) => d.date);
    const maps = holdings.map((h) => ({
      shares: Number(h.shares),
      m: new Map((history.get(h.ticker) ?? []).map((d) => [d.date, d.close])),
    }));
    const last = {};
    const portVals = [];
    for (const date of dates) {
      let pv = 0;
      let ok = true;
      for (let i = 0; i < maps.length; i++) {
        const c = maps[i].m.get(date) ?? last[i];
        if (c == null) {
          ok = false;
          break;
        }
        last[i] = c;
        pv += c * maps[i].shares;
      }
      if (ok) portVals.push(pv);
    }

    let portfolio = null;
    if (portVals.length > 5 && bench.length > 5) {
      const pRet = toReturns(portVals);
      const bRet = toReturns(bench.slice(-portVals.length));
      const cum = cumulative(pRet);
      portfolio = {
        beta: beta(pRet, bRet),
        alpha: alpha(pRet, bRet, rf),
        capm: capm(pRet, bRet, rf),
        volatility: volatility(pRet),
        sharpe: sharpe(pRet, rf),
        maxDrawdown: maxDrawdown(cum),
        totalReturn: portVals[portVals.length - 1] / portVals[0] - 1,
      };
    }

    return { byTicker, portfolio, loading };
  }, [history, holdings, loading, rf]);
}
