import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const branding = readFileSync(new URL('../js/grocery-branding-runtime.js', import.meta.url), 'utf8');
const movement = readFileSync(new URL('../js/grocery-financial-movement-reports.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../grocery-dashboard.html', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../grocery-reports.html', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../grocery-settings.html', import.meta.url), 'utf8');

test('Grocery branding remains industry-specific and cloud-backed', () => {
  assert.match(branding, /code !== 'grocery'/);
  assert.match(branding, /company\.profile/);
  assert.match(branding, /appearance\.grocery/);
  assert.match(branding, /readAsDataURL/);
  assert.match(branding, /MAX_IMAGE_BYTES = 1024 \* 1024/);
  assert.match(branding, /SUPERMARKET · FEFO · FRESH STOCK/);
  assert.match(branding, /Fresh Market/);
  assert.match(branding, /Night Market/);
  assert.match(branding, /Weighted PLU/);
  assert.match(branding, /Batch Traceability/);
});

test('Grocery exposes debit credit and payment method reporting', () => {
  assert.match(movement, /transaction-ledger/);
  assert.match(movement, /payment-receipt-methods/);
  for (const method of ['Cash', 'Online / Bank Transfer', 'POS / Card', 'Cheque', 'Debit Card', 'Credit Card']) {
    assert.ok(movement.includes(method), `${method} option missing`);
  }
  assert.match(movement, /\/api\/v1\/reports\//);
});

test('Dedicated Grocery entry points load only Grocery adapters', () => {
  assert.match(dashboard, /grocery-branding-runtime\.js\?v=20260804-branding1/);
  assert.match(settings, /grocery-branding-runtime\.js\?v=20260804-branding1/);
  assert.match(reports, /grocery-financial-movement-reports\.js\?v=20260804-branding1/);
  assert.doesNotMatch(dashboard, /retail|paint-app/i);
  assert.doesNotMatch(settings, /retail|paint-app/i);
});
