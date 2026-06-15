import { useMemo } from "react";
import { usePriceHistory } from "./usePriceHistory";
import {
  computeMetrics,
  toReturns,
  mean,
  capmExpectedReturn,
  volatility,
  sharpe,
  maxDrawdown,
  cumulative,
  weightedBeta,
  DEFAULT_RF,
  DEFAULT_MRP,
} from "../lib/metrics";

const BENCH = "SPY";

/**
 * Computes per-position and portfolio-level risk metrics (Beta, Alpha, Sharpe,
 * volatility, max drawdown, total return) from daily price history vs SPY.
 * Portfolio beta/CAPM use market-value-weighted position betas with a fixed MRP.
 */
export function usePortfolioMetrics(holdings, marketValuesByTicker = {}, rf = DEFAULT_RF, mrp = DEFAULT_MRP) {
  const symbols = useMemo(() => {
    const held = (holdings ?? []).map((h) => h.ticker);
    return Array.from(new Set([...held, BENCH]));
  }, [holdings]);

  const { history, loading } = usePriceHistory(symbols);
  const mvKey = useMemo(
    () => Object.entries(marketValuesByTicker).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join("|"),
    [marketValuesByTicker],
  );

  return useMemo(() => {
    if (loading || !holdings?.length) return { byTicker: {}, portfolio: null, loading };

    const bench = (history.get(BENCH) ?? []).map((d) => d.close);

    const byTicker = {};
    for (const h of holdings) {
      const arr = (history.get(h.ticker) ?? []).map((d) => d.close);
      byTicker[h.ticker] = computeMetrics(arr, bench, rf, mrp);
    }

    const portBeta = weightedBeta(
      holdings.map((h) => ({
        beta: byTicker[h.ticker]?.beta ?? null,
        marketValue: marketValuesByTicker[h.ticker] ?? 0,
      })),
    );

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
        beta: portBeta,
        alpha: portBeta != null ? mean(pRet) * 252 - capmExpectedReturn(portBeta, rf, mrp) : null,
        capm: capmExpectedReturn(portBeta, rf, mrp),
        volatility: volatility(pRet),
        sharpe: sharpe(pRet, rf),
        maxDrawdown: maxDrawdown(cum),
        totalReturn: portVals[portVals.length - 1] / portVals[0] - 1,
      };
    }

    return { byTicker, portfolio, loading };
  }, [history, holdings, loading, rf, mrp, mvKey]);
}
