const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const finalizer = fs.readFileSync(
  path.join(root, 'demo-static', 'js', 'retail-live-invoice-fixes.js'),
  'utf8'
);

test('Retail sidebar exposes one Settings entry with a gear icon', () => {
  assert.equal(finalizer.includes('Settings & Invoice Studio'), false);
  assert.equal(finalizer.includes('<i class="bi bi-gear"></i><span>Settings</span>'), true);
  assert.equal(finalizer.includes("href.includes('invoice-designer.html')"), true);
  assert.equal(finalizer.includes("duplicate.remove()"), true);
});

test('saved document View and Print use the configured invoice page', () => {
  assert.equal(finalizer.includes('data-sales-template-view-id'), true);
  assert.equal(finalizer.includes('data-sales-template-print-id'), true);
  assert.equal(finalizer.includes("control.removeAttribute('data-sales-view-id')"), true);
  assert.equal(finalizer.includes("new URL('invoice-view.html', location.href)"), true);
  assert.equal(finalizer.includes("url.searchParams.set('print', '1')"), true);
  assert.equal(finalizer.includes("url.searchParams.set('profile'"), true);
});

test('legacy demo invoice UI is removed without deleting live records', () => {
  assert.equal(finalizer.includes("document.getElementById('savedInvoicesBody')"), true);
  assert.equal(finalizer.includes("document.getElementById('invoiceModal')?.remove()"), true);
  assert.equal(finalizer.includes('PostgreSQL Connected'), true);
  assert.equal(/fetch\([^)]*DELETE|apiDelete|method:\s*['\"]DELETE/i.test(finalizer), false);
});

test('invoice settings and designer share the canonical saved configuration', () => {
  assert.equal(finalizer.includes("const DESIGN_KEY = 'invoiceDesignerSettings'"), true);
  assert.equal(finalizer.includes("const SELECTED_TEMPLATE_KEY = 'selectedInvoiceTemplate'"), true);
  assert.equal(finalizer.includes('Invoice & Print'), true);
  assert.equal(finalizer.includes("invoice.defaultInvoiceTemplate = value.templateBase"), true);
});
