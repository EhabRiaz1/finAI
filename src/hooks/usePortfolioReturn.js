import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Single-account Modified Dietz return from the `portfolio-return` edge function
 * (the caller's own account only). Measured since-inception when the account has
 * a reset baseline, else YTD — `label` says which.
 * Returns { loading, ready, ret, bmv, emv, netFlows, gain, mode, label, error }.
 */
export function usePortfolioReturn() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("portfolio-return", { body: {} });
        if (cancelled) return;
        if (error) setState({ loading: false, error: error.message });
        else setState({ loading: false, ...data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e?.message ?? e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
