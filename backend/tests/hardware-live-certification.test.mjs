import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const transaction = fs.readFileSync(new URL('../scripts/qa-hardware-live-audit.mjs', import.meta.url), 'utf8');
const browser = fs.readFileSync(new URL('../scripts/qa-hardware-browser-audit.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/hardware-live-audit.yml', import.meta.url), 'utf8');

test('Hardware transaction audit preserves production-scale data and idempotency', () => {
  assert.match(transaction, /AXTOR_AUDIT_PRODUCT_COUNT = '100'/);
  assert.match(transaction, /AXTOR_AUDIT_CUSTOMER_COUNT = '200'/);
  assert.match(transaction, /AXTOR_AUDIT_INVOICE_COUNT = '500'/);
  assert.match(transaction, /Exactly 500 posted invoices/);
  assert.match(transaction, /Exactly 500 unique invoice identities/);
  assert.match(transaction, /idempotencyKey/);
  assert.match(transaction, /customerVerification: 'individual'/);
  assert.match(transaction, /fiveUsersPass/);
  assert.match(transaction, /expectedRoleShape/);
  assert.match(transaction, /HARDWARE_ACCESS_ROLE_NAMES/);
  assert.match(transaction, /access\.roles\.map\(\(role\) => role\.name\)/);
});

test('Hardware browser audit uses live readonly login and isolated route checks', () => {
  assert.match(browser, /prepareLoginIdentity/);
  assert.match(browser, /workspace\.isEditable/);
  assert.match(browser, /backendSession/);
  assert.match(browser, /serviceWorkers: 'block'/);
  assert.match(browser, /async function verifyRoute/);
  assert.match(browser, /const page = await context\.newPage\(\)/);
  assert.match(browser, /pageResults\.length === pages\.length/);
  assert.match(browser, /fiveIndependentUsers/);
  assert.match(browser, /allTenantsPass/);
  assert.match(browser, /expectedRestrictionDataIsolationPass/);
  assert.match(browser, /state\.dataRows === 0/);
  assert.match(browser, /noUnexpectedBrowserErrors/);
});

test('Hardware workflow fails closed across all audit phases and protects credentials', () => {
  for (const id of ['transaction_audit','payment_finalizer','operations_audit','branding_audit','browser_audit']) {
    assert.match(workflow, new RegExp(`id: ${id}`));
    assert.match(workflow, new RegExp(`steps\\.${id}\\.outcome`));
  }
  assert.match(workflow, /openssl cms -encrypt/);
  assert.match(workflow, /shred -u hardware-live-audit-credentials\.json/);
  assert.match(workflow, /shred -u hardware-live-audit-runtime\.json/);
  assert.match(workflow, /report\.counts\?\.productCount !== 100/);
  assert.match(workflow, /report\.counts\?\.customerCount !== 200/);
  assert.match(workflow, /report\.counts\?\.invoiceCount !== 500/);
  assert.match(workflow, /users\.length !== 5/);
  assert.match(workflow, /user\.pages\?\.length !== 12/);
  assert.match(workflow, /expectedRestrictionDataIsolationPass !== true/);
});
