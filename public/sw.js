/**
 * Minimal, safe service worker for Invoice UAE.
 *
 * It intentionally does NOT cache dynamic app data (that would risk showing
 * stale invoices). It only:
 *   - pre-caches an offline fallback page, and
 *   - serves that page when a navigation fails because the device is offline.
 * Everything else goes straight to the network.
 */
const CACHE = "invoice-uae-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Only handle page navigations; fall back to the offline page when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
