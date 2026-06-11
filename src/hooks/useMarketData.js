import { useCallback, useEffect, useState } from "react";
import { supabase, triggerMarketRefresh } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";
import {
  isStale,
  toBondShape,
  toEquityShape,
  toIndexShape,
} from "../lib/marketData";

const FALLBACK_EQUITIES = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", price: 0, prev: 0, beta: 0, mcap: 0, pe: 0, div: 0 },
];

export function useMarketData() {
  const [equities, setEquities] = useState(FALLBACK_EQUITIES);
  const [indices, setIndices] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [yieldCurve, setYieldCurve] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadCache = useCallback(async () => {
    const [eqRes, idxRes, bondRes, curveRes, logRes] = await Promise.all([
      supabase.from("market_equity_quotes").select("*").order("ticker"),
      supabase.from("market_indices").select("*").order("symbol"),
      supabase.from("market_bond_quotes").select("*").order("identifier"),
      supabase.from("market_yield_curve").select("*"),
      supabase
        .from("market_refresh_log")
        .select("finished_at, status, details")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (eqRes.data?.length) setEquities(eqRes.data.map(toEquityShape));
    if (idxRes.data?.length) setIndices(idxRes.data.map(toIndexShape));
    if (bondRes.data?.length) setBonds(bondRes.data.map(toBondShape));
    if (curveRes.data?.length) {
      const order = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "7Y", "10Y", "20Y", "30Y"];
      setYieldCurve(
        [...curveRes.data]
          .sort((a, b) => order.indexOf(a.tenor) - order.indexOf(b.tenor))
          .map((r) => ({ tenor: r.tenor, yield: Number(r.yield) })),
      );
    }

    const latestQuote = eqRes.data?.[0]?.updated_at ?? bondRes.data?.[0]?.updated_at;
    setLastUpdated(logRes.data?.finished_at ?? latestQuote ?? null);
    setError(eqRes.error?.message ?? idxRes.error?.message ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await triggerMarketRefresh();
      await loadCache();
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
  }, [loadCache]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await loadCache();
      if (cancelled) return;

      const { data: eqCheck } = await supabase
        .from("market_equity_quotes")
        .select("updated_at")
        .limit(1)
        .maybeSingle();

      if (isStale(eqCheck?.updated_at)) {
        refresh();
      }
    }

    init();
    const poll = setInterval(loadCache, 30000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [loadCache, refresh]);

  useAuthReload(loadCache);

  return {
    equities,
    indices,
    bonds,
    yieldCurve,
    lastUpdated,
    refreshing,
    error,
    refresh,
    reload: loadCache,
  };
}
