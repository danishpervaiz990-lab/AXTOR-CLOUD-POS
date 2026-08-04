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
for (const file of ['paint-settings.html','paint-mix-jobs.html','paint-quality.html','paint-labels.html','paint-deliveries.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /paint-role-aware-settings\.js\?v=20260805-role-aware1/, `${file}: role-aware settings guard missing`);
  assert.match(html, /paint-print-settings-backend\.js/, `${file}: tenant print settings missing`);
  assert.match(html, /paint-document-print-backend\.js/, `${file}: shared document renderer missing`);
  assert.ok(html.indexOf('paint-role-aware-settings.js') < html.indexOf('paint-print-settings-backend.js'), `${file}: guard must load before print settings`);
}
const settingsPage = fs.readFileSync(path.join(root, 'paint-settings.html'), 'utf8');
assert.ok(settingsPage.indexOf('paint-role-aware-settings.js') < settingsPage.indexOf('paint-isolation-branding-runtime.js'), 'settings guard must load before branding runtime');

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

const roleGuard = fs.readFileSync(path.join(root, 'js/paint-role-aware-settings.js'), 'utf8');
new Function(roleGuard);
for (const token of ['Paint Salesperson','paint shop manager','SETTINGS_READ_ROLES','SETTINGS_WRITE_ROLES','/api/v1/settings','emptySettings','paintSettingsRoleNotice']) {
  assert.ok(roleGuard.toLowerCase().includes(token.toLowerCase()), `role-aware settings guard missing ${token}`);
}
assert.match(roleGuard, /verb === "GET" && !canReadSettings\(\)/);
assert.match(roleGuard, /verb !== "GET" && !canWriteSettings\(\)/);
assert.match(roleGuard, /#paintPrintSettings,#paintBrandingPanel/);

const settings = fs.readFileSync(path.join(root, 'js/paint-print-settings-backend.js'), 'utf8');
for (const token of ['/api/v1/settings','invoice.settings','thermal-80','thermal-58','showColourCode','showFormulaReference','showMixJobReference','showBatch','showQualityApproval']) assert.ok(settings.includes(token), `print settings missing ${token}`);
const docs = fs.readFileSync(path.join(root, 'js/paint-document-print-backend.js'), 'utf8');
for (const token of ['invoice-view.html','normalizeMix','formulaReference','mixJobReference','qualityApproval']) assert.ok(docs.includes(token), `document router missing ${token}`);
console.log(`PASS: ${pages.length} purpose-built Paint pages with role-aware tenant print and document routing`);
