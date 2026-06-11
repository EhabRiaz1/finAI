import { useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * Re-runs `load` whenever the auth session is established or refreshed, so data
 * hooks self-heal after a token refresh / re-login instead of showing stale
 * (empty) results. Pass a stable (useCallback'd) loader.
 */
export function useAuthReload(load) {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        load();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);
}
