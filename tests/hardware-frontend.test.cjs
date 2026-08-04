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
const printSettings = fs.readFileSync(path.join(root, 'js/hardware-print-settings-backend.js'), 'utf8');
const documentRouter = fs.readFileSync(path.join(root, 'js/hardware-document-router.js'), 'utf8');
assert.match(app, /\/api\/v1\/hardware/);
assert.match(app, /\/api\/v1\/sales-documents/);
assert.match(app, /Idempotency-Key/);
assert.match(app, /Hardware tenants/);
assert.match(app, /hardware_trade_terminal/);
assert.match(app, /\/quotations/);
assert.match(app, /\/deliveries/);
assert.match(app, /\/rentals/);
assert.match(printSettings, /invoice\.settings/);
assert.match(printSettings, /\/api\/v1\/settings/);
assert.match(printSettings, /Thermal 80 mm|thermal-80/i);
assert.match(printSettings, /Thermal 58 mm|thermal-58/i);
assert.match(printSettings, /project|job/i);
assert.match(printSettings, /LPO/i);
assert.match(printSettings, /canReadSettings/);
assert.match(printSettings, /hardware manager/);
assert.match(printSettings, /if\(!canReadSettings\(\)\)/);
assert.doesNotMatch(printSettings, /AxtorHardwarePrintSettings\.current\s*=/);
assert.match(documentRouter, /invoice-view\.html/);
assert.match(documentRouter, /project/);
assert.match(documentRouter, /lpo/);
assert.match(documentRouter, /deliveryStatus/);
assert.match(documentRouter, /serialNumber/);
assert.match(documentRouter, /warrantyUntil/);
for (const file of ['hardware-settings.html','hardware-terminal.html','hardware-quotations.html','hardware-deliveries.html','hardware-warranties.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /hardware-print-settings-backend\.js/);
  assert.match(html, /hardware-document-router\.js/);
  assert.match(html, /20260804-role-aware1/);
}
console.log(`PASS: ${pages.length} purpose-built Hardware pages with role-aware tenant print settings and shared document routing`);
