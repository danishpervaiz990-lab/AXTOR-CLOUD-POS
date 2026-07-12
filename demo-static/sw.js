const CACHE_NAME = 'axtor-pos-cloud-global-saas-v23-20260712';
const APP_SHELL = [
  './',
  'accounts.html',
  'approvals.html',
  'barcode-labels.html',
  'branches.html',
  'communications.html',
  'change-password.html',
  'customer.html',
  'delivery.html',
  'expenses.html',
  'index.html',
  'inventory.html',
  'invoice-designer.html',
  'invoice-view.html',
  'login.html',
  'loyalty.html',
  'notifications.html',
  'offline.html',
  'plans.html',
  'products.html',
  'promotions.html',
  'purchase.html',
  'quotations.html',
  'reports.html',
  'sales.html',
  'salesmen.html',
  'settings.html',
  'setup.html',
  'shifts.html',
  'terminal.html',
  'css/style.css',
  'css/retro-pos-theme.css',
  'js/access-control-backend.js',
  'js/accounts-backend.js',
  'js/app-data.js',
  'js/approvals-backend.js',
  'js/axtor-api.js',
  'js/axtor-fixes.js',
  'js/backend-page-utils.js',
  'js/barcode-labels-backend.js',
  'js/branches-backend.js',
  'js/charts.js',
  'js/communications-backend.js',
  'js/core-data.js',
  'js/customers-backend.js',
  'js/dashboard-backend.js',
  'js/delivery-backend.js',
  'js/expenses-backend.js',
  'js/inventory-backend.js',
  'js/invoice-designer-backend.js',
  'js/invoice-templates.js',
  'js/invoice-view-backend.js',
  'js/loyalty-backend.js',
  'js/main.js',
  'js/notifications-backend.js',
  'js/platform-runtime.js',
  'js/plans-backend.js',
  'js/products-backend.js',
  'js/promotions-backend.js',
  'js/purchase-backend.js',
  'js/quotations-backend.js',
  'js/receive-payment-backend.js',
  'js/reports-backend.js',
  'js/retail-advanced.js',
  'js/returns-backend.js',
  'js/sales-backend.js',
  'js/sales-production-upgrade.js',
  'js/salesmen-backend.js',
  'js/settings-backend.js',
  'js/setup-backend.js',
  'js/shifts-backend.js',
  'js/terminal-backend.js',
  'js/theme-switcher.js',
  'i18n/en.json',
  'i18n/ar.json',
  'i18n/zh-CN.json',
  'i18n/hi.json',
  'i18n/ur.json',
  'i18n/hinglish.json',
  'i18n/sw.json',
  'i18n/fr.json',
  'i18n/es.json',
  'i18n/pt.json',
  'manifest.webmanifest',
  'assets/images/logo.svg',
  'assets/images/icon-192.png',
  'assets/images/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_SHELL.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
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

  // Railway/API requests must never be intercepted by the frontend service worker.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request).then(response => response || caches.match('offline.html')));
    return;
  }

  // Always prefer the newest application code after a Vercel deployment.
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === 'font' || request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
