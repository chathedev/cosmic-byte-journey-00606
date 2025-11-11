// Lightweight, fast SW optimized for Firebase + React
const CACHE_VERSION = 'tivly-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        await cache.addAll(STATIC_ASSETS);
      } catch (e) {
        // Ignore caching errors
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    // Only cache http(s) requests
    const url = new URL(request.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // Unsupported schemes (e.g., chrome-extension) should bypass SW
    return fetch(request);
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_VERSION);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never cache dev server or module transforms
  const url = new URL(request.url);
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/src/')) {
    return; // Let browser handle normally
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  const dest = request.destination;
  const isAsset = dest === 'style' || dest === 'image' || dest === 'font' || dest === 'script';
  if (isAsset || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Default: network
});
