import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = fs.readFileSync(new URL('../scripts/qa-pharmacy-live-audit.mjs', import.meta.url), 'utf8');
const browser = fs.readFileSync(new URL('../scripts/qa-pharmacy-browser-audit.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/pharmacy-live-audit.yml', import.meta.url), 'utf8');

test('Pharmacy live audit preserves the required production dataset and reconciliation', () => {
  assert.match(live, /AXTOR_AUDIT_PRODUCT_COUNT = '100'/);
  assert.match(live, /AXTOR_AUDIT_CUSTOMER_COUNT = '200'/);
  assert.match(live, /AXTOR_AUDIT_INVOICE_COUNT = '500'/);
  assert.match(live, /Exactly 500 posted invoices/);
  assert.match(live, /Customer balances reconcile/);
  assert.match(live, /No duplicate invoices/);
  assert.match(live, /Idempotency-Key/);
});

test('Pharmacy browser audit isolates all roles and page navigations', () => {
  assert.match(browser, /const pages = \[/);
  assert.match(browser, /pages\.length/);
  assert.match(browser, /async function verifyRoute/);
  assert.match(browser, /const page = await context\.newPage\(\)/);
  assert.match(browser, /await page\.close\(\)/);
  assert.match(browser, /prepareLoginIdentity/);
  assert.match(browser, /backendSession/);
  assert.match(browser, /allTenantsPass/);
  assert.match(browser, /fiveIndependentUsers/);
  assert.match(browser, /pages\.length === pages\.length/);
});

test('Pharmacy workflow fails closed and protects credentials', () => {
  assert.match(workflow, /steps\.transaction_audit\.outcome/);
  assert.match(workflow, /steps\.browser_audit\.outcome/);
  assert.match(workflow, /openssl cms -encrypt/);
  assert.match(workflow, /pharmacy-live-audit-credentials\.p7m/);
  assert.match(workflow, /shred -u pharmacy-live-audit-credentials\.json/);
  assert.match(workflow, /report\.counts\?\.productCount !== 100/);
  assert.match(workflow, /report\.counts\?\.customerCount !== 200/);
  assert.match(workflow, /report\.counts\?\.invoiceCount !== 500/);
  assert.match(workflow, /users\.length !== 5/);
  assert.match(workflow, /user\.pages\?\.length !== 8/);
});
