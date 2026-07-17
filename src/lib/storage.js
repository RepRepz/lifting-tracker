import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/** Returns the signed-in user's saved tracker state, or null if none yet. */
export async function loadUserState(userId) {
  const { data, error } = await supabase
    .from("user_state")
    .select("value")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/** Upserts the signed-in user's tracker state (a plain JSON object). */
export async function saveUserState(userId, value) {
  const { error } = await supabase
    .from("user_state")
    .upsert({ user_id: userId, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Data saved before accounts existed, kept for one-time import. */
export async function loadLegacyState() {
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", "lifting-tracker-v1")
      .maybeSingle();
    if (error) return null;
    return data?.value ?? null;
  } catch {
    return null;
  }
}
