import { useState } from "react";
import { supabase, setSecurityQuestion, getSecurityQuestion, resetPasswordWithAnswer } from "./lib/storage.js";

export const SECURITY_QUESTIONS = [
  "What was your first pet's name?",
  "What city were you born in?",
  "What's your mom's first name?",
  "What was your first car?",
  "What elementary school did you go to?",
  "What's your go-to gym machine?",
];

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
  // 16px so iOS Safari doesn't zoom in when the field is tapped
  padding: "11px 12px", fontSize: 16, minHeight: 44, background: C.input, color: C.ink, boxSizing: "border-box",
  WebkitAppearance: "none", appearance: "none",
};

export default function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [secQ, setSecQ] = useState(SECURITY_QUESTIONS[0]);
  const [secA, setSecA] = useState("");
  const [fq, setFq] = useState(null); // fetched question in the forgot flow

  const switchMode = (m) => { setMode(m); setError(""); setInfo(""); setFq(null); };

  /* ----- forgot password: find the question, then verify + reset ----- */
  const findQuestion = async () => {
    setError(""); setInfo("");
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setError("Type your username first."); return; }
    setBusy(true);
    try {
      const q = await getSecurityQuestion(u);
      if (!q) setError("That profile never set a security question, so it can't self-reset. Ask the group admin (dimi) to get you back in.");
      else { setFq(q); setSecA(""); setPassword(""); }
    } catch (err) { setError(String(err?.message || err)); }
    finally { setBusy(false); }
  };
  const doReset = async (e) => {
    e.preventDefault();
    setError("");
    if (!secA.trim()) { setError("Type your answer."); return; }
    if (password.length < 6) { setError("New password needs at least 6 characters."); return; }
    setBusy(true);
    try {
      await resetPasswordWithAnswer(username.trim().toLowerCase(), secA, password);
      switchMode("signin");
      setPassword("");
      setInfo("✅ Password updated — sign in with your new password.");
    } catch (err) {
      const msg = String(err?.message || err);
      setError(/wrong answer/i.test(msg) ? "Wrong answer — try again." : msg);
    } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      setError("Username must be 3–20 characters: letters, numbers, or underscore.");
      return;
    }
    if (password.length < 6) {
      setError("Password needs at least 6 characters.");
      return;
    }
    if (mode === "signup" && secA.trim().length < 2) {
      setError("Pick a security question and type your answer — it's how you reset a forgotten password.");
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
        // save the reset question right away (signed in at this point)
        try { await setSecurityQuestion(secQ, secA); } catch { /* can also be set later in Library */ }
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
      fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", background: C.bg, minHeight: "100dvh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "calc(20px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))", color: C.ink,
    }}>
      <div style={{
        fontWeight: 800, letterSpacing: ".2px",
        fontSize: 26, color: C.head, marginBottom: 18,
      }}>
        🏋️ MY LIFTING TRACKER
      </div>

      <form onSubmit={mode === "forgot" ? (fq ? doReset : (e) => { e.preventDefault(); findQuestion(); }) : submit} style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
        padding: 22, width: "100%", maxWidth: 380,
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.head, marginBottom: 14 }}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your profile" : "Reset your password"}
        </div>

        {info && (
          <div style={{
            background: "rgba(0,200,5,.12)", color: C.teal, borderRadius: 8,
            padding: "9px 12px", fontSize: 13.5, marginBottom: 12, fontWeight: 600,
          }}>
            {info}
          </div>
        )}

        <label style={lbl}>
          Username
          <input
            style={inp} value={username} onChange={(e) => setUsername(e.target.value)}
            name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="e.g. mike" disabled={mode === "forgot" && !!fq}
          />
        </label>

        {mode === "forgot" && fq && (
          <>
            <div style={{
              background: C.input, border: `1px solid ${C.line}`, borderRadius: 8,
              padding: "10px 12px", fontSize: 14, marginTop: 12,
            }}>
              🔒 {fq}
            </div>
            <label style={{ ...lbl, marginTop: 12 }}>
              Your answer
              <input style={inp} value={secA} onChange={(e) => setSecA(e.target.value)}
                autoCapitalize="none" placeholder="not case-sensitive" />
            </label>
          </>
        )}

        {(mode !== "forgot" || fq) && (
          <label style={{ ...lbl, marginTop: 12 }}>
            {mode === "forgot" ? "New password" : "Password"}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inp, flex: 1 }} type={showPw ? "text" : "password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="at least 6 characters"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} style={{
                border: `1px solid ${C.line}`, borderRadius: 8, background: C.input,
                padding: "0 12px", fontSize: 13, color: C.sub, cursor: "pointer",
              }}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        )}

        {mode === "signup" && (
          <>
            <label style={{ ...lbl, marginTop: 12 }}>
              Security question <span style={{ fontWeight: 400, color: C.sub }}>(your password reset — no email needed)</span>
              <select style={inp} value={secQ} onChange={(e) => setSecQ(e.target.value)}>
                {SECURITY_QUESTIONS.map(q => <option key={q}>{q}</option>)}
              </select>
            </label>
            <label style={{ ...lbl, marginTop: 12 }}>
              Your answer
              <input style={inp} value={secA} onChange={(e) => setSecA(e.target.value)}
                autoCapitalize="none" placeholder="something you'll remember (not case-sensitive)" />
            </label>
          </>
        )}

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
          {busy ? "One sec…"
            : mode === "signin" ? "Sign in"
            : mode === "signup" ? "Create profile"
            : fq ? "Set new password" : "Find my question"}
        </button>

        <div style={{ marginTop: 14, fontSize: 13.5, color: C.sub, textAlign: "center" }}>
          {mode === "signin" && (
            <>New here?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode("signup"); }} style={{ color: C.teal, fontWeight: 600 }}>
                Create a profile
              </a>
              <span style={{ margin: "0 6px" }}>·</span>
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode("forgot"); }} style={{ color: C.teal, fontWeight: 600 }}>
                Forgot password?
              </a>
            </>
          )}
          {mode !== "signin" && (
            <>Remembered it?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode("signin"); }} style={{ color: C.teal, fontWeight: 600 }}>
                Back to sign in
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
