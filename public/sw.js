/* Offline support: network-first for same-origin files, falling back to
   the last cached copy when there's no signal. Supabase API calls are
   never intercepted. */
const CACHE = "the-lab-v178";
const NETWORK_TIMEOUT_MS = 8000;

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try { return await fetch(request, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const exerciseMedia = url.origin === "https://wger.de" && url.pathname.startsWith("/media/exercise-images/");
  if (exerciseMedia) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetchWithTimeout(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }
  if (url.origin !== location.origin) return;

  // Build assets are content-hashed and immutable. Once one successfully loads, prefer
  // that known-good copy on later launches instead of making iOS networking a blocker.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetchWithTimeout(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetchWithTimeout(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          if (e.request.mode === "navigate") {
            return caches.match("./", { ignoreSearch: true })
              .then((idx) => idx || caches.match("./index.html", { ignoreSearch: true }));
          }
          return undefined;
        })
      )
  );
});
