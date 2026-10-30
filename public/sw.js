const CACHE_NAME = "echovest-pwa-v1";
const APP_SHELL = ["/pwa", "/echovest-icon.png", "/icons/echovest-192.png", "/echovest-mobile-hero.jfif"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("echovest-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname !== "/pwa") return;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/pwa")) || Response.error()));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/slides/") || url.pathname === "/echovest-icon.png") {
    event.respondWith(caches.match(request).then(async (cached) => {
      const fresh = fetch(request).then((response) => {
        if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
        return response;
      });
      if (cached) {
        event.waitUntil(fresh.catch(() => undefined));
        return cached;
      }
      return fresh;
    }));
  }
});
