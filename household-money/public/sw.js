/* Household Money service worker.
 * - Precaches the offline page + icons.
 * - Pages and GET /api data: network-first, falling back to the last cached copy (offline view of
 *   last-synced data). Auth endpoints and non-GET requests are never cached.
 * - Static Next.js assets: cache-first (they're content-hashed).
 */
const VERSION = "hm-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const PRECACHE = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];
const CACHEABLE_API = ["/api/summary", "/api/accounts", "/api/transactions"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(caches.delete(DATA));
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected && res.type === "basic") cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (fallbackUrl) {
      const shell = await caches.open(SHELL);
      const offline = await shell.match(fallbackUrl);
      if (offline) return offline;
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    if (["/login", "/signup", "/lock", "/enroll"].some((p) => url.pathname.startsWith(p))) return;
    event.respondWith(networkFirst(request, "/offline"));
    return;
  }

  if (CACHEABLE_API.some((p) => url.pathname === p)) {
    event.respondWith(networkFirst(request));
  }
});
