import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import LoadingScreen from "./LoadingScreen.jsx";

class AppCrashBoundary extends React.Component {
  constructor(props) { super(props); this.state = { crashed:false }; }
  static getDerivedStateFromError() { return { crashed:true }; }
  componentDidCatch(error) {
    // Keep one small, device-only breadcrumb for diagnosing repeat iOS failures.
    // Never include account data, form values, or cloud state.
    try { localStorage.setItem("lt-last-startup-error", JSON.stringify({ at:new Date().toISOString(), message:String(error?.message || "Unknown app error").slice(0,240) })); } catch {}
    console.error("app render failed", error);
  }
  render() {
    if (this.state.crashed) return <LoadingScreen forceHelp label="The app hit a device error" />;
    return this.props.children;
  }
}

// Apple devices keep their native emoji; other platforms use the self-hosted Twemoji font.
const ua = navigator.userAgent || "";
const isApple = /iPhone|iPad|iPod|Macintosh|Mac OS X/.test(ua) ||
  (navigator.platform && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
if (!isApple) document.documentElement.classList.add("tw");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppCrashBoundary>
      <App />
    </AppCrashBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js")
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  });
}

/* Auto-update: installed iOS/Android home-screen apps often don't re-fetch on reopen,
   so users get stuck on an old version. On every reopen/focus we quietly check the live
   index.html; if it points at a different app bundle than the one running, we reload to
   the new version. No deleting/reinstalling needed. Only reloads when there's genuinely
   a new build, and never while offline. */
(() => {
  const runningBundle = () => {
    const s = [...document.scripts].map((x) => x.src).find((src) => /assets\/index-[\w-]+\.js/.test(src));
    return s ? (s.match(/index-[\w-]+\.js/) || [])[0] : null;
  };
  const mine = runningBundle();
  let checking = false, reloaded = false;
  async function checkForUpdate() {
    if (checking || reloaded || !mine || document.visibilityState !== "visible") return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL).then((r) => r?.update()).catch(() => {});
      const html = await fetch(import.meta.env.BASE_URL + "index.html?cb=" + Date.now(), { cache: "no-store", signal:controller.signal }).then((r) => r.text());
      const live = (html.match(/index-[\w-]+\.js/) || [])[0];
      if (live && live !== mine) { reloaded = true; location.reload(); }
    } catch { /* offline — try again next time */ }
    finally { clearTimeout(timeout); checking = false; }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
  window.addEventListener("focus", checkForUpdate);
  setTimeout(checkForUpdate, 3000); // also shortly after first load
})();
