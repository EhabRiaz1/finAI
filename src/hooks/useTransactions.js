import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";

export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("trade_time", { ascending: false });
    if (!error) setTransactions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAuthReload(load);

  const add = useCallback(
    async (payload) => {
      const { error } = await supabase.from("transactions").insert({
        symbol: payload.symbol.toUpperCase(),
        asset_type: payload.assetType ?? "equity",
        side: payload.side,
        quantity: payload.quantity,
        price: payload.price,
        commission: payload.commission ?? 0,
        fees: payload.fees ?? 0,
        trade_time: payload.tradeTime,
        realized_pnl: payload.realizedPnl ?? null,
        notes: payload.notes ?? null,
        code: payload.code ?? null,
      });
      if (error) throw error;
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      await load();
    },
    [load],
  );

  return { transactions, loading, add, remove, reload: load };
}
