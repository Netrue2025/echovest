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

self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { message = { body: event.data?.text() ?? "" }; }
  const title = message.title || "EchoVest update";
  const options = {
    body: message.body || "You have a new account notification.",
    icon: "/icons/echovest-192.png",
    badge: "/icons/echovest-192.png",
    tag: message.notificationId || `echovest-${Date.now()}`,
    data: { url: message.url || "/dashboard?view=notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard?view=notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return self.clients.openWindow(target);
  }));
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
