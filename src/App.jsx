import { useState, useEffect } from "react";
import { supabase } from "./lib/storage.js";
import AuthScreen, { AccountDeletionConfirmationScreen, PasswordRecoveryScreen } from "./AuthScreen.jsx";
import LiftingTracker from "./LiftingTracker.jsx";
import LoadingScreen from "./LoadingScreen.jsx";

export default function App() {
  // undefined = still checking for a saved session; null = signed out
  const [session, setSession] = useState(undefined);
  const [recovering, setRecovering] = useState(false);
  const [startupSlow, setStartupSlow] = useState(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { if (alive) setStartupSlow(true); }, 10000);
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (alive) { clearTimeout(timer); setSession(data.session ?? null); }
      })
      .catch((error) => {
        console.error("session startup failed", error);
        if (alive) setStartupSlow(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      clearTimeout(timer);
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => { alive = false; clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  if (session === undefined) {
    return <LoadingScreen forceHelp={startupSlow} />;
  }
  if (!session) return <AuthScreen />;
  if (recovering) return <PasswordRecoveryScreen onDone={() => setRecovering(false)} />;
  const deletionToken = new URLSearchParams(location.search).get("delete_account");
  if (deletionToken) return <AccountDeletionConfirmationScreen user={session.user} token={deletionToken}
    onCancel={() => { history.replaceState({},"",`${location.origin}${import.meta.env.BASE_URL}`); location.reload(); }} />;
  // key forces a clean remount (fresh data load) when a different user signs in
  return <LiftingTracker key={session.user.id} user={session.user} />;
}
