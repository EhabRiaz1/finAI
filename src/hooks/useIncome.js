import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";

/** Loads dividend income and cash flow (deposits/withdrawals/fees). */
export function useIncome() {
  const [dividends, setDividends] = useState([]);
  const [cashFlows, setCashFlows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [div, cash] = await Promise.all([
      supabase.from("dividends").select("*").order("pay_date", { ascending: false }),
      supabase.from("cash_transactions").select("*").order("txn_date", { ascending: false }),
    ]);
    if (!div.error) setDividends(div.data ?? []);
    if (!cash.error) setCashFlows(cash.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAuthReload(load);

  return { dividends, cashFlows, loading, reload: load };
}
