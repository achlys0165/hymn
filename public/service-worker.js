const cacheName = 'hymn-shell-v1';
const appShell = ['/', '/Logo1.png', '/manifest.webmanifest', '/hymn-192.png', '/hymn-512.png'];

function isBuiltAsset(url) {
  return url.origin === self.location.origin && /^\/assets\/[^/]+\.(?:js|css|woff2)$/.test(url.pathname);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(appShell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hymn-shell-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'hymn-assets' || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.filter(value => {
    try { return isBuiltAsset(new URL(value)); } catch { return false; }
  }))];
  event.waitUntil(caches.open(cacheName).then(cache => Promise.all(urls.map(async url => {
    if (!await cache.match(url)) await cache.add(url).catch(() => {});
  }))));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
        const cache = await caches.open(cacheName);
        await cache.put('/', response.clone());
      }
      return response;
    }).catch(() => caches.match('/')));
    return;
  }
  if (isBuiltAsset(url) || appShell.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
      if (response.ok) (await caches.open(cacheName)).put(event.request, response.clone()).catch(() => {});
      return response;
    })));
  }
});
