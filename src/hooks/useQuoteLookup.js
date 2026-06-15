import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * On-demand single-symbol quote+profile lookup (Finnhub via the
 * quote-lookup edge function), for Research tickers not in the cached
 * market_equity_quotes. Caches results by symbol; de-dupes in-flight.
 */
export function useQuoteLookup() {
  const [quotes, setQuotes] = useState({}); // SYM -> { found, name, price, prev_close, change_pct, sector, mcap }
  const requested = useRef(new Set());

  const lookup = useCallback(async (symbol) => {
    const sym = (symbol ?? "").trim().toUpperCase();
    if (!sym || requested.current.has(sym)) return;
    requested.current.add(sym);
    try {
      const { data, error } = await supabase.functions.invoke("quote-lookup", { body: { symbol: sym } });
      if (!error && data) setQuotes((p) => ({ ...p, [sym]: data }));
      else requested.current.delete(sym); // allow retry on transient failure
    } catch {
      requested.current.delete(sym);
    }
  }, []);

  return { quotes, lookup };
}
