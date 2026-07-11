const CACHE_NAME = 'axtor-pos-cloud-auth-sales-v20-20260711';
const ASSETS = [
  './',
  'index.html',
  'login.html',
  'terminal.html',
  'shifts.html',
  'sales.html',
  'customer.html',
  'salesmen.html',
  'products.html',
  'inventory.html',
  'barcode-labels.html',
  'purchase.html',
  'branches.html',
  'promotions.html',
  'loyalty.html',
  'approvals.html',
  'reports.html',
  'accounts.html',
  'expenses.html',
  'setup.html',
  'notifications.html',
  'settings.html',
  'invoice-designer.html',
  'invoice-view.html',
  'quotations.html',
  'delivery.html',
  'communications.html',
  'css/style.css',
  'css/retro-pos-theme.css',
  'js/axtor-api.js',
  'js/sales-backend.js',
  'js/receive-payment-backend.js',
  'js/returns-backend.js',
  'js/core-data.js',
  'js/main.js',
  'js/theme-switcher.js',
  'js/app-data.js',
  'js/retail-advanced.js',
  'js/axtor-fixes.js',
  'js/charts.js',
  'js/invoice-templates.js',
  'manifest.webmanifest',
  'assets/images/logo.svg',
  'assets/images/icon-192.png',
  'assets/images/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(ASSETS.map(asset => cache.add(asset).catch(err => {
        console.warn('[Axtor SW] Cache skipped:', asset, err && err.message);
        return null;
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isFreshAssetRequest(request, url) {
  if(request.mode === 'navigate') return true;
  if(['document','script','style'].includes(request.destination)) return true;
  return /\.(?:html|js|css)$/i.test(url.pathname);
}

function networkFirst(request) {
  return fetch(request, { cache: 'no-cache' }).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('index.html')));
}

function cacheFirst(request) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    return response;
  }));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (isFreshAssetRequest(event.request, url) ? networkFirst(event.request) : cacheFirst(event.request))
      .catch(() => {
        if (event.request.mode === 'navigate') return caches.match('index.html');
        if (event.request.destination === 'image') return caches.match('assets/images/logo.svg');
        return new Response('Offline asset unavailable. Check network/CDN or reload when online.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
