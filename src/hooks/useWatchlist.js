import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";

async function registerInstrument(type, symbol) {
  await supabase
    .from("instrument_registry")
    .upsert({ instrument_type: type, symbol, is_active: true }, { onConflict: "instrument_type,symbol" });
}

export function useWatchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("watchlist")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAuthReload(load);

  const add = useCallback(
    async (symbol, instrumentType = "equity") => {
      const sym = symbol.trim().toUpperCase();
      if (!sym) return;
      const { error } = await supabase
        .from("watchlist")
        .upsert({ symbol: sym, instrument_type: instrumentType }, { onConflict: "user_id,symbol" });
      if (error) throw error;
      await registerInstrument(instrumentType, sym);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id) => {
      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
      await load();
    },
    [load],
  );

  const has = useCallback(
    (symbol) => items.some((i) => i.symbol === String(symbol).toUpperCase()),
    [items],
  );

  return { items, loading, add, remove, has, reload: load };
}
