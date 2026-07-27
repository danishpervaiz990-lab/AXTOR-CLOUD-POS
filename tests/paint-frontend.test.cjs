const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../demo-static');
const pages = ['paint-dashboard.html','paint-catalogue.html','paint-formulas.html','paint-formula-revisions.html','paint-mix-jobs.html','paint-component-stock.html','paint-consumption.html','paint-quality.html','paint-labels.html','paint-deliveries.html','paint-reports.html','paint-settings.html'];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /paint-app\.js/);
  assert.match(html, /data-page=/);
  assert.doesNotMatch(html, /industry\.html\?module=/);
}
const app = fs.readFileSync(path.join(root, 'js/paint-app.js'), 'utf8');
assert.match(app, /\/api\/v1\/paint/);
assert.match(app, /\/api\/v1\/industry\/registry/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /Paint tenants/);
assert.match(app, /\/formulas/);
assert.match(app, /\/post-consumption/);
assert.match(app, /\/quality-checks/);
assert.match(app, /\/label/);
assert.match(app, /\/deliver/);
assert.match(app, /\/reverse/);
console.log(`PASS: ${pages.length} purpose-built Paint pages`);
