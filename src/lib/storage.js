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

/* ---------- groups ---------- */

/** Groups the signed-in user belongs to. */
export async function listMyGroups() {
  const { data, error } = await supabase.from("groups").select("id, name, invite_code").order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Members of one group (only visible if you're in it). */
export async function listMembers(groupId) {
  const { data, error } = await supabase
    .from("group_members").select("user_id, username")
    .eq("group_id", groupId).order("joined_at");
  if (error) throw error;
  return data ?? [];
}

/** Creates a group and returns { group_id, invite_code }. */
export async function createGroup(name) {
  const { data, error } = await supabase.rpc("create_group", { p_name: name });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** Joins a group by invite code; returns { group_id, group_name }. */
export async function joinGroup(code) {
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function leaveGroup(groupId, userId) {
  const { error } = await supabase
    .from("group_members").delete()
    .eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

/* ---------- reactions (💪 on feed items) ---------- */

export async function listReactions(groupId) {
  const { data, error } = await supabase
    .from("reactions").select("event_key, reactor_id, reactor_name")
    .eq("group_id", groupId);
  if (error) throw error;
  return data ?? [];
}

export async function addReaction(groupId, eventKey, reactorName) {
  const { error } = await supabase
    .from("reactions").insert({ group_id: groupId, event_key: eventKey, reactor_name: reactorName });
  if (error && error.code !== "23505") throw error; // 23505 = already reacted, fine
}

export async function removeReaction(groupId, eventKey, userId) {
  const { error } = await supabase
    .from("reactions").delete()
    .eq("group_id", groupId).eq("event_key", eventKey).eq("reactor_id", userId);
  if (error) throw error;
}

