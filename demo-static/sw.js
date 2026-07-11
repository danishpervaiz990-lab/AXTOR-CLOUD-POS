const CACHE_NAME = 'axtor-pos-cloud-performance-v21-20260711';
const APP_SHELL = [
  './', 'index.html', 'login.html', 'sales.html',
  'css/style.css', 'css/retro-pos-theme.css',
  'js/axtor-api.js', 'js/core-data.js', 'js/main.js', 'js/theme-switcher.js',
  'js/app-data.js', 'js/sales-backend.js', 'js/receive-payment-backend.js',
  'js/returns-backend.js', 'js/sales-production-upgrade.js',
  'manifest.webmanifest', 'assets/images/logo.svg',
  'assets/images/icon-192.png', 'assets/images/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => Promise.allSettled(APP_SHELL.map(asset => cache.add(asset))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function networkFirst(request) {
  return fetch(request, { cache: 'no-cache' }).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(request));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => null);
    return cached || network;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never intercept backend/API or cross-origin traffic.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request).then(response => response || caches.match('index.html')));
    return;
  }

  if (['script', 'style', 'font', 'image'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
