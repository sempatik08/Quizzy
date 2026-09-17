/* eslint-disable no-restricted-globals */
/**
 * Quizzy service worker (PBI 15) — installability, deliberately not offline play.
 *
 * The whole game is a live socket conversation with an authoritative server, so
 * there is no meaningful offline mode to cache toward: a cached lobby would show
 * a room that no longer exists and a cached game page would sit there with a
 * dead socket. What a service worker buys here is the install prompt, an app
 * icon on the home screen, and a readable offline screen instead of the
 * browser's dinosaur.
 *
 * So the caching policy is intentionally narrow:
 *
 *  - Same-origin GET static assets  -> stale-while-revalidate. Safe: Next
 *    fingerprints its build output, so a stale hit is only ever the file that
 *    URL has always meant.
 *  - Navigations                    -> network first, offline page as fallback.
 *    Never serve a cached HTML shell for a room that may be gone.
 *  - Everything else (socket.io polling, the API, cross-origin, non-GET)
 *                                   -> straight to the network, untouched.
 *
 * Bumping CACHE_VERSION evicts everything on the next activate.
 */

const CACHE_VERSION = 'quizzy-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll rejects the whole install if any single request 404s, so each
      // entry is added individually and a miss is tolerated.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** True for URLs that are safe to serve from cache. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // socket.io long-polling lives under /socket.io/ when the server shares the
  // origin; caching any of it would be actively harmful.
  if (url.pathname.startsWith('/socket.io')) return false;
  if (url.pathname.startsWith('/api')) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // ---- Navigations: always try the network first ----
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // ---- Static assets: stale-while-revalidate ----
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Refresh in the background; the caller gets the cached copy now.
          event.waitUntil(network);
          return cached;
        }
        return (await network) ?? Response.error();
      }),
    );
  }

  // Anything else falls through to the browser's own handling.
});
