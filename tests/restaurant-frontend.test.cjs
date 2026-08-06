const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const pages = [
  'restaurant-dashboard.html',
  'restaurant-floor.html',
  'restaurant-menu.html',
  'restaurant-orders.html',
  'restaurant-kitchen.html',
  'restaurant-reservations.html',
  'restaurant-modifiers.html',
  'restaurant-recipes.html',
  'restaurant-wastage.html',
  'restaurant-reports.html',
  'restaurant-settings.html'
];

for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /restaurant-app\.js\?v=20260806-2/, `${file} must load the current Restaurant runtime`);
  assert.match(html, /restaurant-app\.css\?v=20260806-2/, `${file} must load the current Restaurant theme`);
  assert.match(html, /data-page=/);
  assert.doesNotMatch(html, /industry\.html\?module=/);
}

const app = fs.readFileSync(path.join(root, 'js/restaurant-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/restaurant-app.css'), 'utf8');

assert.match(app, /\/api\/v1\/restaurant/);
assert.match(app, /\/api\/v1\/industry\/registry/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /Restaurant tenants/);

// Production Restaurant workflows.
assert.match(app, /\/context/);
assert.match(app, /\/areas/);
assert.match(app, /\/tables\/.*\/status/);
assert.match(app, /\/orders\/.*\/settle/);
assert.match(app, /\/kitchen\/board/);
assert.match(app, /\/kitchen\/.*\/status/);
assert.match(app, /Waiter POS & Billing/);
assert.match(app, /split payment/i);
assert.match(app, /change due/i);
assert.match(app, /visual table map/i);
assert.match(app, /Recipe builder/);

// The original scaffold required operators to paste internal IDs and JSON.
assert.doesNotMatch(app, /Items JSON/);
assert.doesNotMatch(app, /Ingredients JSON/);
assert.doesNotMatch(app, /Table ID/);
assert.doesNotMatch(app, /Category ID/);
assert.doesNotMatch(app, /Product ID/);
assert.doesNotMatch(app, /Menu item ID/);
assert.doesNotMatch(app, /JSON\.parse\(body\.itemsJson/);

// Dedicated Restaurant visual identity: black/charcoal with warm yellow.
assert.match(css, /--bg:\s*#090909/);
assert.match(css, /--brand:\s*#f7c948/);
assert.match(css, /\.r-table-map/);
assert.match(css, /\.r-order-layout/);
assert.match(css, /\.r-kds-board/);
assert.match(css, /\.r-payment-line/);

console.log(`PASS: ${pages.length} production Restaurant pages, waiter POS, KDS and settlement contracts`);
