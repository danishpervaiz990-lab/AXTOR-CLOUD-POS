const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const printFix = fs.readFileSync(path.join(root, 'demo-static', 'js', 'retail-modern-a4-saved-print.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'demo-static', 'js', 'salesmen-bootstrap.js'), 'utf8');

test('Retail Sales loads the saved-invoice template print correction', () => {
  assert.match(loader, /retail-modern-a4-saved-print\.js\?v=20260731-modern-a4-all-saved-print-v2/);
  assert.match(loader, /data-axtor-modern-saved-print/);
});

test('PostgreSQL View, direct Print, and modal Print use invoice-view', () => {
  assert.match(printFix, /new URL\('invoice-view\.html', location\.href\)/);
  assert.match(printFix, /url\.searchParams\.set\('id', id\)/);
  assert.match(printFix, /url\.searchParams\.set\('profile', outputProfile\(\)\)/);
  assert.match(printFix, /url\.searchParams\.set\('print', '1'\)/);
  assert.match(printFix, /#axtorSalesDocViewModal/);
  assert.match(printFix, /data-sales-template-print-id/);
});

test('capture listener wins before legacy document print handlers', () => {
  assert.match(printFix, /window\.addEventListener\('click', handleCapturedClick, true\)/);
  assert.match(printFix, /stopImmediatePropagation\(\)/);
});

test('imported browser invoices use the selected invoice template locally', () => {
  assert.match(printFix, /selectedInvoiceTemplate/);
  assert.match(printFix, /invoiceSettings/);
  assert.match(printFix, /engine\.print\(template, \{ data: data \}\)/);
  assert.match(printFix, /engine\.preview\(template, \{ data: data \}\)/);
  assert.match(printFix, /Imported Saved Invoices/);
  assert.match(printFix, /axtorAdvancedDemoDB/);
});

test('static placeholders and the obsolete invoice modal are removed', () => {
  assert.match(printFix, /document\.getElementById\('savedInvoicesBody'\)/);
  assert.match(printFix, /document\.getElementById\('invoiceModal'\)\?\.remove\(\)/);
  assert.doesNotMatch(printFix, /openBackend\([^\n]*data-print-invoice/);
});
