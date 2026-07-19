import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
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
    try {
      const html = await fetch(import.meta.env.BASE_URL + "index.html?cb=" + Date.now(), { cache: "no-store" }).then((r) => r.text());
      const live = (html.match(/index-[\w-]+\.js/) || [])[0];
      if (live && live !== mine) { reloaded = true; location.reload(); }
    } catch { /* offline — try again next time */ }
    finally { checking = false; }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
  window.addEventListener("focus", checkForUpdate);
  setTimeout(checkForUpdate, 3000); // also shortly after first load
})();
