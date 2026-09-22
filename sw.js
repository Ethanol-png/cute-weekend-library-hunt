// Little Library Treasure Hunt - Service Worker
// Bump CACHE_VERSION whenever the app shell changes so old caches get cleared.
const CACHE_VERSION = 'llth-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const PHOTO_CACHE = `${CACHE_VERSION}-photos`;

// Icons are inlined as data: URIs in manifest.json and the HTML's <head> for this
// hosted build, so there are no separate icon files to precache here.
const APP_SHELL = [
  './little_libraries_treasure_hunt.html',
  './manifest.json',
  './little_libraries_kenmore_20km.json'
];

self.addEventListener('install', (event) => {
  // Note: no self.skipWaiting() here on purpose. A new worker installs and then waits
  // so the page can show an "update ready" banner and let you choose when to switch —
  // otherwise content could swap out from under you mid-hunt. See the SKIP_WAITING
  // message handler below, triggered by that banner's Refresh button.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('[sw] precache failed', err))
  );
});

self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k.startsWith('llth-') && !k.startsWith(CACHE_VERSION))
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isPhotoRequest(url) {
  // Library hint photos are pulled from streetlibrary.org.au (og:image URLs)
  return url.hostname.includes('streetlibrary.org.au');
}

function isAppShellRequest(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // App shell + data JSON: cache-first, fall back to network, refresh cache in background.
  if (isAppShellRequest(url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((networkResp) => {
            if (networkResp && networkResp.ok) cache.put(req, networkResp.clone());
            return networkResp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Library hint photos: cache-first so photos work offline once viewed, never expire.
  if (isPhotoRequest(url)) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((networkResp) => {
            if (networkResp && networkResp.ok) cache.put(req, networkResp.clone());
            return networkResp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Everything else (Nominatim geocoding, Google Maps links, etc.) - just let the network handle it.
});
