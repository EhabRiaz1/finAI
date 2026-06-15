import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Loads the user's saved AI Buy/Hold/Sell verdicts (one per symbol) into a
 * Map keyed by uppercased ticker. Used by the Research tab to show a dated
 * recommendation badge under each stock.
 */
export function useStockRatings() {
  const [ratings, setRatings] = useState(() => new Map());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("ai_stock_ratings")
      .select("symbol, rating, rationale, updated_at");
    if (error) return;
    setRatings(new Map((data ?? []).map((r) => [r.symbol, r])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratingFor = useCallback(
    (symbol) => ratings.get((symbol ?? "").toUpperCase()) ?? null,
    [ratings],
  );

  return { ratings, ratingFor, reload: load };
}
