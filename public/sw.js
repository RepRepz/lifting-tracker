/* Offline support: network-first for same-origin files, falling back to
   the last cached copy when there's no signal. Supabase API calls are
   never intercepted. */
const CACHE = "the-lab-v91";

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
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
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
