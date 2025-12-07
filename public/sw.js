// Lightweight, fast SW optimized for Firebase + React
// Cache version - increment this to force cache refresh
const CACHE_VERSION = 'tivly-v2';
const STATIC_ASSETS = [
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
      // Force immediate activation
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete ALL old caches
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
      // Take control immediately
      await self.clients.claim();
    })()
  );
});

// Always use network-first for everything to avoid stale content
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Only cache successful responses
    if (fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      const url = new URL(request.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        cache.put(request, fresh.clone());
      }
    }
    return fresh;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache dev server or module transforms
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/src/')) {
    return; // Let browser handle normally
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Use network-first for EVERYTHING to prevent stale CSS/JS
  event.respondWith(networkFirst(request));
});
