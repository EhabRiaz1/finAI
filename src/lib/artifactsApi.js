import { supabase } from "./supabase";

/* CRUD helpers for spreadsheet artifacts (RLS-scoped to the owner). */

export async function loadArtifact(id) {
  const { data, error } = await supabase
    .from("ai_artifacts")
    .select("id, name, kind, data, updated_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function commitArtifact(id, data) {
  const { error } = await supabase
    .from("ai_artifacts")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
