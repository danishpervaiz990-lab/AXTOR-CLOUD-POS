const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../demo-static');
const pages = ['restaurant-dashboard.html','restaurant-floor.html','restaurant-menu.html','restaurant-orders.html','restaurant-kitchen.html','restaurant-reservations.html','restaurant-modifiers.html','restaurant-recipes.html','restaurant-wastage.html','restaurant-reports.html','restaurant-settings.html'];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /restaurant-app\.js/);
  assert.match(html, /data-page=/);
  assert.doesNotMatch(html, /industry\.html\?module=/);
}
const app = fs.readFileSync(path.join(root, 'js/restaurant-app.js'), 'utf8');
assert.match(app, /\/api\/v1\/restaurant/);
assert.match(app, /\/api\/v1\/industry\/registry/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /Restaurant tenants/);
assert.match(app, /\/orders/);
assert.match(app, /\/kitchen/);
assert.match(app, /\/reservations/);
assert.match(app, /\/wastage/);
console.log(`PASS: ${pages.length} purpose-built Restaurant pages`);
