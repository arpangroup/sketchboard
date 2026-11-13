/* SketchBoard service worker — offline support for the installed app (no build-time plugin needed).
 *
 * Strategies
 *  - App shell (/, manifest, icons): precached on install. The hashed JS/CSS referenced by
 *    index.html are discovered by parsing it, so the very first visit is fully offline-capable.
 *  - Navigations: network-first (always get the latest deploy), fall back to the cached shell.
 *  - /assets/* (content-hashed by Vite): cache-first, immutable.
 *  - Google Fonts: stale-while-revalidate.
 *  - Everything else (incl. the WebSocket relay): untouched.
 * Bump VERSION to invalidate old caches.
 */
const VERSION = 'v2';
// Everything is resolved against the registration scope, so the app also works from a sub-folder (GitHub Pages).
const BASE = new URL(self.registration.scope).pathname; // e.g. '/' or '/sketchboard-whiteboard/'
const SHELL_CACHE = `sketchboard-shell-${VERSION}`;
const ASSET_CACHE = `sketchboard-assets-${VERSION}`;
const FONT_CACHE = `sketchboard-fonts-${VERSION}`;
const SHELL = ['', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL);
      // Discover the hashed bundles from index.html and precache them too.
      const html = await (await shell.match(BASE)).text();
      const urls = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)]
        .map((m) => new URL(m[1], self.registration.scope))
        .filter((u) => u.origin === self.location.origin && u.pathname.startsWith(BASE + 'assets/'))
        .map((u) => u.pathname);
      if (urls.length) await (await caches.open(ASSET_CACHE)).addAll(urls);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
  } else if (url.origin === self.location.origin && url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  } else if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(BASE, response.clone()); // SPA: every route serves index.html
    return response;
  } catch {
    return (await cache.match(BASE)) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || network;
}
