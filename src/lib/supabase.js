import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(url ?? "", key ?? "");

export async function triggerMarketRefresh() {
  const { data, error } = await supabase.functions.invoke("refresh-market-data");
  if (error) throw error;
  return data;
}
