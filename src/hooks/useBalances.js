import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";

export function useBalances() {
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("account_balances").select("*").maybeSingle();
    setBalances(data ?? { buying_power: 0, cash: 0, currency: "USD" });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAuthReload(load);

  const updateBuyingPower = useCallback(
    async (value) => {
      const { data: existing } = await supabase
        .from("account_balances")
        .select("user_id")
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("account_balances")
          .update({ buying_power: value, updated_at: new Date().toISOString() })
          .eq("user_id", existing.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("account_balances")
          .insert({ buying_power: value, cash: value });
        if (error) throw error;
      }
      await load();
    },
    [load],
  );

  return { balances, loading, updateBuyingPower, reload: load };
}
