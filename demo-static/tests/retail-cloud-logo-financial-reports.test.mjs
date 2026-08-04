import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reports = readFileSync(new URL('../js/reports-backend.js', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../js/settings-backend.js', import.meta.url), 'utf8');
const invoiceView = readFileSync(new URL('../js/invoice-view-backend.js', import.meta.url), 'utf8');

test('Retail exposes debit credit and payment method reports', () => {
  assert.match(reports, /transaction-ledger/);
  assert.match(reports, /Debit \/ Credit Transaction Ledger/);
  assert.match(reports, /payment-receipt-methods/);
  assert.match(reports, /Payments \/ Receipts by Method/);
  assert.match(reports, /All payment methods/);
  for (const method of ['Cash', 'Online / Bank Transfer', 'POS / Card', 'Cheque', 'Debit Card', 'Credit Card']) {
    assert.ok(reports.includes(method), `${method} filter is missing`);
  }
});

test('Retail company images are validated and persisted in company.profile', () => {
  assert.match(settings, /IMAGE_MAX_BYTES = 1024 \* 1024/);
  assert.match(settings, /image\/png/);
  assert.match(settings, /image\/jpeg/);
  assert.match(settings, /image\/webp/);
  assert.match(settings, /image\/svg\+xml/);
  assert.match(settings, /readAsDataURL/);
  assert.match(settings, /values\["company\.profile"\]/);
  assert.match(settings, /Company and invoice logo uploaded/);
  assert.match(settings, /Object\.assign\(\{\}, values\["company\.profile"\]/);
});

test('Invoice view continues loading company.profile cloud branding', () => {
  assert.match(invoiceView, /settings\["company\.profile"\]/);
  assert.match(invoiceView, /setCloudConfig/);
});
