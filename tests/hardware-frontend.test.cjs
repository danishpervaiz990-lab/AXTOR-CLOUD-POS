const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../demo-static');
const pages = ['hardware-dashboard.html','hardware-terminal.html','hardware-projects.html','hardware-quotations.html','hardware-price-levels.html','hardware-deliveries.html','hardware-backorders.html','hardware-rentals.html','hardware-warranties.html','hardware-unit-conversions.html','hardware-reports.html','hardware-settings.html'];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /hardware-app\.js/);
  assert.match(html, /data-page=/);
  assert.doesNotMatch(html, /industry\.html\?module=/);
}
const app = fs.readFileSync(path.join(root, 'js/hardware-app.js'), 'utf8');
assert.match(app, /\/api\/v1\/hardware/);
assert.match(app, /\/api\/v1\/sales-documents/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /Hardware tenants/);
assert.match(app, /hardware_trade_terminal/);
assert.match(app, /\/quotations/);
assert.match(app, /\/deliveries/);
assert.match(app, /\/rentals/);
console.log(`PASS: ${pages.length} purpose-built Hardware pages`);
