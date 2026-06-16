import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Household + per-account Modified Dietz YTD return, from the service-role
 * `portfolio-return` edge function (aggregates the caller's linked accounts).
 * Returns { loading, household, account, members, error }.
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
        else setState({ loading: false, household: data.household, account: data.account, members: data.members });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e?.message ?? e) });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
