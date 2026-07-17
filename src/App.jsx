import { useState, useEffect } from "react";
import { supabase } from "./lib/storage.js";
import AuthScreen from "./AuthScreen.jsx";
import LiftingTracker from "./LiftingTracker.jsx";

export default function App() {
  // undefined = still checking for a saved session; null = signed out
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ fontFamily: "system-ui", padding: 40, color: "#5B6B69" }}>Loading…</div>;
  }
  if (!session) return <AuthScreen />;
  // key forces a clean remount (fresh data load) when a different user signs in
  return <LiftingTracker key={session.user.id} user={session.user} />;
}
