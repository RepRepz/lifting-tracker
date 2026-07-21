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

/* ---------- cloud backups (daily automatic snapshots, ~30 days) ---------- */

/** Lists the signed-in user's cloud snapshots: [{ day, sets, weighins, cardio }], newest first. */
export async function listCloudBackups() {
  const { data, error } = await supabase.rpc("list_state_history");
  if (error) throw error;
  return data ?? [];
}

/** Fetches one snapshot's full data by day ("YYYY-MM-DD"); RLS limits it to your own. */
export async function getCloudBackup(day) {
  const { data, error } = await supabase
    .from("user_state_history")
    .select("value")
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/* ---------- steps (Apple Health via the phone Shortcut) ---------- */

/** Returns (and lazily creates) the signed-in user's secret step-upload code. */
export async function getStepToken() {
  const { data, error } = await supabase.rpc("my_step_token");
  if (error) throw error;
  return data ?? null;
}

/** Recent step counts for a set of users: { user_id: { "YYYY-MM-DD": count } }.
    RLS limits results to yourself + groupmates. */
export async function stepsFor(userIds, sinceDay) {
  if (!userIds.length) return {};
  let q = supabase.from("steps").select("user_id, day, count").in("user_id", userIds);
  if (sinceDay) q = q.gte("day", sinceDay);
  const { data, error } = await q;
  if (error) throw error;
  const out = {};
  for (const r of data ?? []) (out[r.user_id] ||= {})[r.day] = r.count;
  return out;
}

/* ---------- security question (password reset without email) ---------- */

/** Signed-in user sets/changes their reset question + answer (answer is hashed server-side). */
export async function setSecurityQuestion(q, a) {
  const { error } = await supabase.rpc("set_security_question", { q, a });
  if (error) throw error;
}

/** Anyone can look up a username's question (null if they never set one). */
export async function getSecurityQuestion(uname) {
  const { data, error } = await supabase.rpc("get_security_question", { uname });
  if (error) throw error;
  return data ?? null;
}

/** Resets the password if the answer matches; locks for 1h after 5 wrong tries. */
export async function resetPasswordWithAnswer(uname, answer, new_password) {
  const { error } = await supabase.rpc("reset_password_with_answer", { uname, answer, new_password });
  if (error) throw error;
}

/* ---------- groups ---------- */

/** Groups the signed-in user belongs to. */
export async function listMyGroups() {
  const { data, error } = await supabase.from("groups").select("id, name, invite_code, emoji, created_by").order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Any member can change the group's emoji (only the emoji column is writable). */
export async function setGroupEmoji(groupId, emoji) {
  const { error } = await supabase.from("groups").update({ emoji }).eq("id", groupId);
  if (error) throw error;
}

/** Members of one group (only visible if you're in it). */
export async function listMembers(groupId) {
  const { data, error } = await supabase
    .from("group_members").select("user_id, username")
    .eq("group_id", groupId).order("joined_at");
  if (error) throw error;
  return data ?? [];
}

/* Real "last active" = last time they actually LOGGED something (a set, a cardio
   session, or a weigh-in) — NOT the last app save/open. Log & cardio entries carry
   an `id` that is Date.now() at the moment of logging (accurate wall-clock even if
   the entry's date is backdated); bodyweight rows have no id, so we fall back to the
   weigh-in date. Returns null for members who've never logged anything. */
function lastLoggedTs(value) {
  if (!value || typeof value !== "object") return null;
  let ms = 0;
  const CAP = 4102444800000; // ignore absurd/future ids (> year 2100)
  const scanIds = (arr) => {
    if (Array.isArray(arr)) for (const e of arr) {
      const t = Number(e?.id);
      if (t > ms && t < CAP) ms = t;
    }
  };
  scanIds(value.log); scanIds(value.cardio);
  if (Array.isArray(value.bodyweight)) for (const b of value.bodyweight) {
    const t = b?.date ? new Date(b.date + "T00:00").getTime() : 0;
    if (t > ms && t < CAP) ms = t;
  }
  return ms ? new Date(ms).toISOString() : null;
}

/** When each user last actually logged a workout entry: { user_id: ISO string | null }. */
export async function lastActiveFor(userIds) {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from("user_state").select("user_id, value")
    .in("user_id", userIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(r => [r.user_id, lastLoggedTs(r.value)]));
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

/** Owner-only: regenerates the invite code and returns the new one. */
export async function resetInviteCode(groupId) {
  const { data, error } = await supabase.rpc("reset_invite_code", { p_group_id: groupId });
  if (error) throw error;
  return data;
}

/** Also used by the owner to remove a member (RLS decides who may). */
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

