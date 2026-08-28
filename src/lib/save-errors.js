// A shrink refusal is not a version conflict: never retry it through the merge loop.
export function normalizeSaveError(error) {
  const message = String(error?.message || "");
  const code = message.includes("STATE_SHRINK_BLOCKED") ? "STATE_SHRINK_BLOCKED"
    : message.includes("STATE_CONFLICT") ? "STATE_CONFLICT" : null;
  if (!code) return error;
  const result = new Error(code === "STATE_CONFLICT"
    ? "Cloud state changed on another device"
    : "Saving paused because this change would remove a large amount of data");
  result.code = code;
  return result;
}
