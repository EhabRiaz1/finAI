import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Fetches daily close history for the given symbols from public.price_history
 * and returns a Map<symbol, Array<{date, close}>> sorted oldest -> newest.
 * Handles PostgREST's 1000-row page cap via range pagination.
 */
export function usePriceHistory(symbols) {
  const [history, setHistory] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const key = (symbols ?? []).slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split(",") : [];
    if (!list.length) {
      setHistory(new Map());
      setLoading(false);
      return;
    }

    async function run() {
      setLoading(true);
      const map = new Map();
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("price_history")
          .select("symbol, date, close")
          .in("symbol", list)
          .order("symbol", { ascending: true })
          .order("date", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error || !data || !data.length) break;
        for (const row of data) {
          if (!map.has(row.symbol)) map.set(row.symbol, []);
          map.get(row.symbol).push({ date: row.date, close: Number(row.close) });
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (!cancelled) {
        setHistory(map);
        setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { history, loading };
}
