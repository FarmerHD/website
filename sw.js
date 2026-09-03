// Service Worker für "Meine Rezepte" (2.5): cacht das App-Grundgerüst,
// damit die Seite auch ganz ohne Verbindung öffnet. Daten (Supabase)
// werden bewusst NICHT hier gecacht — das übernimmt js/lib/offline.js
// per localStorage, inkl. Warteschlange für Änderungen.

const CACHE_VERSION = "mr-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "impressum.html",
  "datenschutz.html",
  "css/styles.css",
  "js/app.js",
  "js/auth.js",
  "js/config.js",
  "js/lib/preact.js",
  "js/lib/icons.js",
  "js/lib/constants.js",
  "js/lib/parser.js",
  "js/lib/categorize.js",
  "js/lib/offline.js",
  "js/lib/format.js",
  "js/lib/jsonld.js",
  "js/views/recipes.js",
  "js/views/plan.js",
  "js/views/shopping.js",
  "js/views/pantry.js",
  "js/views/stats.js",
  "js/vendor/preact.module.js",
  "js/vendor/hooks.module.js",
  "js/vendor/htm.module.js",
  "js/vendor/supabase.min.js",
  "fonts/inter-latin-300-normal.woff2",
  "fonts/inter-latin-400-normal.woff2",
  "fonts/inter-latin-500-normal.woff2",
  "fonts/inter-latin-600-normal.woff2",
  "fonts/playfair-display-latin-400-normal.woff2",
  "fonts/playfair-display-latin-500-normal.woff2",
  "fonts/playfair-display-latin-600-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppAsset(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || (await network) || Response.error();
      })
    );
  }
  // Alle anderen Requests (Supabase API/Storage) unangetastet ans Netz.
});
