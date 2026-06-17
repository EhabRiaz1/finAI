import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Per-account YTD performance series from the `portfolio-performance` edge
 * function: a daily Jan-1-based time-weighted return index (equities at daily
 * close + bonds + cash, external flows removed) vs SPY / QQQ rebased to the
 * same start. Returns { series, loading, meta } where series items are
 * { date, portfolio, sp500, nasdaq } (base-100 index) and meta carries the
 * headline { twrPct, startNav, endNav, asOf }.
 */
export function usePerformance() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("portfolio-performance", { body: {} });
        if (cancelled) return;
        if (error || !data?.ready) {
          setSeries([]);
          setMeta(error ? { error: error.message } : data?.error ? { error: data.error } : null);
        } else {
          setSeries(data.series.map((d) => ({ date: d.date, portfolio: d.port, sp500: d.sp500, nasdaq: d.nasdaq })));
          setMeta({ twrPct: data.twrPct, startNav: data.startNav, endNav: data.endNav, asOf: data.asOf });
        }
      } catch (e) {
        if (!cancelled) {
          setSeries([]);
          setMeta({ error: String(e?.message ?? e) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { series, loading, meta };
}
