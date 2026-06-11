import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Loads cached news.
 * @param {Object} opts
 * @param {"general"|"company"|"all"} opts.category
 * @param {string[]} opts.symbols  Filter company news to these symbols.
 * @param {number} opts.limit
 */
export function useNews({ category = "all", symbols = null, limit = 40 } = {}) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  const key = symbols ? symbols.join(",") : "";

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("news_cache")
      .select("*")
      .order("datetime", { ascending: false })
      .limit(limit);

    if (category !== "all") query = query.eq("category", category);
    if (symbols && symbols.length) query = query.in("symbol", symbols);

    const { data } = await query;
    setNews(data ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, key, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { news, loading, reload: load };
}
