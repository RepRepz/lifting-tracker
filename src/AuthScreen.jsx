import { useState } from "react";
import { supabase } from "./lib/storage.js";

const C = {
  teal: "#00C805", btn: "#00C805", head: "#FFFFFF",
  bg: "#000000", card: "#0C0D0D", input: "#111213",
  ink: "#FFFFFF", sub: "#8C8F90", line: "#222527",
  danger: "#FF5000", dangerBg: "#2A1105",
};

// Usernames double as login emails on a fake domain; Supabase never sends
// mail to them (email confirmation is disabled in the project settings).
const emailFor = (u) => `${u}@lifting.local`;

const lbl = { display: "block", fontSize: 12.5, fontWeight: 600, color: "#A9BDBA", marginBottom: 4 };
const inp = {
  width: "100%", border: `1px solid ${C.line}`, borderRadius: 8,
  padding: "11px 12px", fontSize: 15, background: C.input, color: C.ink, boxSizing: "border-box",
};

export default function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      setError("Username must be 3–20 characters: letters, numbers, or underscore.");
      return;
    }
    if (password.length < 6) {
      setError("Password needs at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailFor(u),
          password,
          options: { data: { username: u } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailFor(u),
          password,
        });
        if (error) throw error;
      }
      // App.jsx listens for the auth change and switches to the tracker.
    } catch (err) {
      const msg = String(err?.message || err);
      if (/already registered/i.test(msg)) setError("That username is taken — try another, or sign in instead.");
      else if (/invalid login credentials/i.test(msg)) setError("Wrong username or password.");
      else if (/email not confirmed/i.test(msg)) setError("Setup issue: email confirmation is still turned ON in the Supabase settings.");
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      fontFamily: "'Inter',system-ui,sans-serif", background: C.bg, minHeight: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20, color: C.ink,
    }}>
      <div style={{
        fontFamily: "'Inter',system-ui", fontWeight: 800, letterSpacing: ".2px",
        fontSize: 26, color: C.head, marginBottom: 18,
      }}>
        🏋️ MY LIFTING TRACKER
      </div>

      <form onSubmit={submit} style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
        padding: 22, width: "100%", maxWidth: 380,
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.head, marginBottom: 14 }}>
          {mode === "signin" ? "Sign in" : "Create your profile"}
        </div>

        <label style={lbl}>
          Username
          <input
            style={inp} value={username} onChange={(e) => setUsername(e.target.value)}
            name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="e.g. reprepz"
          />
        </label>

        <label style={{ ...lbl, marginTop: 12 }}>
          Password
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inp, flex: 1 }} type={showPw ? "text" : "password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              name="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "at least 6 characters" : ""}
            />
            <button type="button" onClick={() => setShowPw(s => !s)} style={{
              border: `1px solid ${C.line}`, borderRadius: 8, background: C.input,
              padding: "0 12px", fontSize: 13, color: C.sub, cursor: "pointer",
            }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {error && (
          <div style={{
            background: C.dangerBg, color: C.danger, borderRadius: 8,
            padding: "9px 12px", fontSize: 13.5, marginTop: 12,
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 24,
          background: C.btn, color: "#000", fontWeight: 700, fontSize: 16,
          cursor: "pointer", opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "One sec…" : mode === "signin" ? "Sign in" : "Create profile"}
        </button>

        <div style={{ marginTop: 14, fontSize: 13.5, color: C.sub, textAlign: "center" }}>
          {mode === "signin" ? (
            <>New here?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); setError(""); }} style={{ color: C.teal, fontWeight: 600 }}>
                Create a profile
              </a>
            </>
          ) : (
            <>Already have a profile?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); setError(""); }} style={{ color: C.teal, fontWeight: 600 }}>
                Sign in
              </a>
            </>
          )}
        </div>
      </form>

      <div style={{ marginTop: 14, fontSize: 12.5, color: C.sub, maxWidth: 380, textAlign: "center" }}>
        💾 When your browser offers to save your password, say yes — and you stay
        signed in on this device until you sign out, so no typing at the gym.
      </div>
    </div>
  );
}
