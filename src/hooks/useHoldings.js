import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthReload } from "./useAuthReload";

async function registerInstrument(type, symbol) {
  await supabase
    .from("instrument_registry")
    .upsert({ instrument_type: type, symbol, is_active: true }, { onConflict: "instrument_type,symbol" });
}

export function useHoldings() {
  const [equityHoldings, setEquityHoldings] = useState([]);
  const [bondHoldings, setBondHoldings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [eq, bonds] = await Promise.all([
      supabase.from("equity_holdings").select("*").order("created_at"),
      supabase.from("bond_holdings").select("*").order("created_at"),
    ]);
    if (eq.error) console.warn("equity_holdings load error:", eq.error.message);
    else setEquityHoldings(eq.data ?? []);
    if (!bonds.error) setBondHoldings(bonds.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAuthReload(load);

  const addEquity = useCallback(
    async (payload) => {
      const { data, error } = await supabase
        .from("equity_holdings")
        .insert({
          ticker: payload.ticker.toUpperCase(),
          shares: payload.shares,
          cost_per_share: payload.costPerShare,
          purchase_date: payload.purchaseDate || null,
          notes: payload.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      await registerInstrument("equity", payload.ticker.toUpperCase());
      await load();
      return data;
    },
    [load],
  );

  const updateEquity = useCallback(
    async (id, payload) => {
      const { error } = await supabase
        .from("equity_holdings")
        .update({
          ticker: payload.ticker.toUpperCase(),
          shares: payload.shares,
          cost_per_share: payload.costPerShare,
          purchase_date: payload.purchaseDate || null,
          notes: payload.notes || null,
        })
        .eq("id", id);
      if (error) throw error;
      await registerInstrument("equity", payload.ticker.toUpperCase());
      await load();
    },
    [load],
  );

  const deleteEquity = useCallback(
    async (id) => {
      const { error } = await supabase.from("equity_holdings").delete().eq("id", id);
      if (error) throw error;
      await load();
    },
    [load],
  );

  const addBond = useCallback(
    async (payload) => {
      const { data, error } = await supabase
        .from("bond_holdings")
        .insert({
          bond_type: payload.bondType,
          identifier: payload.identifier,
          name: payload.name || null,
          face_value: payload.faceValue,
          quantity: payload.quantity,
          purchase_price: payload.purchasePrice || null,
          purchase_yield: payload.purchaseYield || null,
          coupon_rate: payload.couponRate || null,
          maturity_date: payload.maturityDate || null,
          rating: payload.rating || null,
          purchase_date: payload.purchaseDate || null,
          notes: payload.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      await registerInstrument("bond", payload.identifier);
      await load();
      return data;
    },
    [load],
  );

  const updateBond = useCallback(
    async (id, payload) => {
      const { error } = await supabase
        .from("bond_holdings")
        .update({
          bond_type: payload.bondType,
          identifier: payload.identifier,
          name: payload.name || null,
          face_value: payload.faceValue,
          quantity: payload.quantity,
          purchase_price: payload.purchasePrice || null,
          purchase_yield: payload.purchaseYield || null,
          coupon_rate: payload.couponRate || null,
          maturity_date: payload.maturityDate || null,
          rating: payload.rating || null,
          purchase_date: payload.purchaseDate || null,
          notes: payload.notes || null,
        })
        .eq("id", id);
      if (error) throw error;
      await registerInstrument("bond", payload.identifier);
      await load();
    },
    [load],
  );

  const deleteBond = useCallback(
    async (id) => {
      const { error } = await supabase.from("bond_holdings").delete().eq("id", id);
      if (error) throw error;
      await load();
    },
    [load],
  );

  return {
    equityHoldings,
    bondHoldings,
    loading,
    reload: load,
    addEquity,
    updateEquity,
    deleteEquity,
    addBond,
    updateBond,
    deleteBond,
  };
}
