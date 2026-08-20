import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/** Returns the signed-in user's saved tracker state, or null if none yet. */
export async function loadUserState(userId) {
  const row = await loadUserStateRecord(userId);
  return row?.value ?? null;
}

/** Returns state plus its cloud version for conflict-safe writes. */
export async function loadUserStateRecord(userId) {
  const { data, error } = await supabase
    .from("user_state")
    .select("value,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Sanitized states for the signed-in user's groupmates. The server strips journals,
    nutrition, routines, notes and every field the owner did not choose to share. */
export async function loadSharedUserStates(userIds) {
  if (!userIds?.length) return {};
  const { data, error } = await supabase.rpc("get_shared_user_states", { p_user_ids: userIds });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.value]));
}

/**
 * Saves only if the cloud row is still the version this device loaded. This prevents
 * an old phone, offline tab, or slow request from silently overwriting newer data.
 */
export async function saveUserState(userId, value, expectedUpdatedAt = null) {
  // userId is retained in the signature for call-site clarity; the server always uses
  // auth.uid() and never trusts a browser-supplied account id.
  if (!userId) throw new Error("Missing user");
  const { data, error } = await supabase.rpc("save_user_state", {
    p_value: value,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.code === "P0001" || String(error.message || "").includes("STATE_CONFLICT")) {
      const err = new Error("Cloud state changed on another device"); err.code = "STATE_CONFLICT"; throw err;
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.updated_at) {
    const err = new Error("Cloud state changed on another device"); err.code = "STATE_CONFLICT"; throw err;
  }
  return row.updated_at;
}

/* ---------- private exercise images / GIFs ---------- */

const exerciseMediaUrlCache = new Map();

/** Uploads one private exercise visual. The database stores only this path—not the file. */
export async function uploadExerciseMedia(userId, file) {
  if (!userId || !file) throw new Error("Missing exercise media");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(file.type)) throw new Error("Use a JPG, PNG, WebP, or GIF");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image or GIF must be 8 MB or smaller");
  const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[file.type];
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${id}.${ext}`;
  const { error } = await supabase.storage.from("exercise-media").upload(path, file, {
    cacheControl: "3600", contentType: file.type, upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Returns a short-lived URL for the signed-in owner's private visual. */
export async function getExerciseMediaUrl(path) {
  if (!path) return null;
  const cached = exerciseMediaUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("exercise-media").createSignedUrl(path, 60 * 60 * 12);
  if (error) throw error;
  const url = data?.signedUrl || null;
  if (url) exerciseMediaUrlCache.set(path, { url, expires: Date.now() + 11 * 60 * 60 * 1000 });
  return url;
}

/** Removes a visual owned by the signed-in user. */
export async function deleteExerciseMedia(path) {
  if (!path) return;
  const { error } = await supabase.storage.from("exercise-media").remove([path]);
  if (error) throw error;
  exerciseMediaUrlCache.delete(path);
}

/* ---------- steps (Apple Health via the phone Shortcut) ---------- */

/** Returns (and lazily creates) the signed-in user's secret step-upload code. */
export async function getStepToken() {
  const { data, error } = await supabase.rpc("my_step_token");
  if (error) throw error;
  return data ?? null;
}

/** Invalidates the previous Shortcut secret and returns a replacement. */
export async function rotateStepToken() {
  const { data, error } = await supabase.rpc("rotate_step_token");
  if (error) throw error;
  return data ?? null;
}

/** Revokes Shortcut access and optionally removes every synced step row. */
export async function disconnectSteps(deleteData = true) {
  const { error } = await supabase.rpc("disconnect_steps", { p_delete_data: deleteData });
  if (error) throw error;
}

/** When the user's steps were last written (ISO string), or null. */
export async function lastStepSync(userId) {
  const { data, error } = await supabase.from("steps").select("updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data?.updated_at || null;
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

/* ---------- The Lab Pro (premium flag) ---------- */

/** Whether the currently signed-in account has an active Pro membership. */
export async function getMyProStatus() {
  const { data, error } = await supabase.rpc("my_pro_active");
  if (error) throw error;
  return data === true;
}

/** IDs of Pro members you can see (yourself + groupmates), excluding expired ones. */
export async function listProUserIds() {
  const { data, error } = await supabase.rpc("visible_active_pro_user_ids");
  if (error) throw error;
  return (data || []).map(r => r.user_id);
}

/* ---------- step duels (head-to-head) ---------- */

/** Send a duel challenge to another user. Stays "pending" until they accept.
    start/end are a placeholder window; the real clock starts when they accept. */
export async function createDuel(bId, days) {
  const { error } = await supabase.rpc("duel_create", { p_b_id: bId, p_days: days });
  if (error) throw error;
}

/** Opponent accepts a pending duel — the window starts today for `days` days. */
export async function acceptDuel(id) {
  const { error } = await supabase.rpc("duel_accept", { p_id: id });
  if (error) throw error;
}

/** Opponent declines a pending duel. */
export async function declineDuel(id) {
  const { error } = await supabase.rpc("duel_decline", { p_id: id });
  if (error) throw error;
}

/** All duels you can see: yours + your groupmates'. Standings are computed from steps. */
export async function listDuels() {
  const { data, error } = await supabase.from("duels").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Cancel/remove a duel (either participant may). */
export async function deleteDuel(id) {
  const { error } = await supabase.rpc("duel_delete", { p_id: id });
  if (error) throw error;
}

/** Forfeit an active duel — the other person is recorded as the winner. */
export async function forfeitDuel(id) {
  const { error } = await supabase.rpc("duel_forfeit", { p_id: id });
  if (error) throw error;
}

/** Ask to void an active duel with no result. Voiding only happens once BOTH sides agree:
    one calls this to request, the other calls deleteDuel to agree (or clearDuelCancel to decline). */
export async function requestDuelCancel(id) {
  const { error } = await supabase.rpc("duel_request_cancel", { p_id: id });
  if (error) throw error;
}

/** Withdraw / decline a pending void request. */
export async function clearDuelCancel(id) {
  const { error } = await supabase.rpc("duel_clear_cancel", { p_id: id });
  if (error) throw error;
}

/* ---------- account recovery ---------- */

export async function generateBackupCodes() {
  const { data, error } = await supabase.rpc("generate_backup_codes");
  if (error) throw error;
  return (data ?? []).map((row) => row.code);
}

export async function hasBackupCodes() {
  const { data, error } = await supabase.rpc("has_backup_codes");
  if (error) throw error;
  return data === true;
}

export async function resetPasswordWithBackupCode(username, code, newPassword) {
  const { data, error } = await supabase.rpc("reset_password_with_backup_code", {
    p_username: username,
    p_code: code,
    p_new_password: newPassword,
  });
  if (error) throw error;
  return data ?? { ok: false, code: "invalid" };
}

export async function requestAccountDeletion() {
  const { error } = await supabase.functions.invoke("account-deletion", { body: { action:"request" } });
  if (error) throw error;
}

export async function confirmAccountDeletion(token) {
  const { error } = await supabase.functions.invoke("account-deletion", { body: { action:"confirm", token } });
  if (error) throw error;
}

/** Remove this account's private cached state/backups from the current browser. */
export function clearLocalAccountData(userId) {
  const exact = new Set([`lt-data-${userId}`, `lt-cache-${userId}`, `lt-pending-${userId}`, `lt-pro-${userId}`, `lt-cloud-version-${userId}`, `lt-save-protected-${userId}`]);
  for (const key of Object.keys(localStorage)) {
    if (exact.has(key) || key.startsWith(`lt-bk-${userId}-`) || key.startsWith(`lt-recovery-${userId}-`)) localStorage.removeItem(key);
  }
}

/* ---------- groups ---------- */

/** Groups the signed-in user belongs to. */
export async function listMyGroups() {
  const { data, error } = await supabase.from("groups").select("id, name, invite_code, emoji, created_by, record_lifts").order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Any member can change the group's emoji (only the emoji column is writable). */
export async function setGroupEmoji(groupId, emoji) {
  const { error } = await supabase.rpc("set_group_emoji", { p_group_id: groupId, p_emoji: emoji });
  if (error) throw error;
}

/** Owner-only: set which lifts appear on the group's strength/records board (array of
    exercise names, or null to fall back to the default big lifts). Enforced server-side. */
export async function setGroupRecordLifts(groupId, lifts) {
  const { error } = await supabase.rpc("set_group_record_lifts", { p_group_id: groupId, p_lifts: lifts });
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
  const states = await loadSharedUserStates(userIds);
  return Object.fromEntries(userIds.map(id => [id, lastLoggedTs(states[id])]));
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
  return data;
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
