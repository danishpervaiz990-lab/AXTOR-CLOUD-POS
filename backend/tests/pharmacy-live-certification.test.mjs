import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = fs.readFileSync(new URL('../scripts/qa-pharmacy-live-audit.mjs', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../scripts/qa-pharmacy-live-audit-with-canonical-roles.mjs', import.meta.url), 'utf8');
const finalizer = fs.readFileSync(new URL('../scripts/qa-pharmacy-live-audit-finalize.mjs', import.meta.url), 'utf8');
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

test('Pharmacy role adapter preserves the actual industry role catalog', () => {
  assert.doesNotMatch(adapter, /replaceAll\('Pharmacy Manager', 'Manager'\)/);
  assert.match(adapter, /roleByName\.get\('pharmacy manager'\) \|\| roleByName\.get\('manager'\)/);
  assert.match(adapter, /roleByName\.get\('pharmacy cashier'\) \|\| roleByName\.get\('cashier'\)/);
  assert.match(adapter, /roleByName\.get\('salesperson'\) \|\| roleByName\.get\('salesman'\)/);
  assert.match(adapter, /could not find the industry transformation marker/);
  assert.match(adapter, /double-patching/);
  assert.match(adapter, /flag: 'wx'/);
  assert.match(adapter, /fs\.unlink\(temporaryUrl\)/);
  assert.match(workflow, /qa-pharmacy-live-audit-with-canonical-roles\.mjs/);
  assert.doesNotMatch(workflow, /AXTOR_PHARMACY_ROLE_ADAPTER_INSPECT/);
});

test('Pharmacy finalizer verifies every persisted customer and invoice page', () => {
  assert.match(finalizer, /waitForFile\(runtimePath\)/);
  assert.match(finalizer, /waitForFile\(reportPath\)/);
  assert.match(finalizer, /page=\$\{page\}&limit=100/);
  assert.match(finalizer, /fetchAll\('\/api\/v1\/customers\?active=true'\)/);
  assert.match(finalizer, /fetchAll\('\/api\/v1\/sales-documents\?documentType=invoice'\)/);
  assert.match(finalizer, /uniqueCustomerIds\.size === 200/);
  assert.match(finalizer, /uniqueInvoiceIds\.size === 500/);
  assert.match(finalizer, /uniqueDocumentNumbers\.size === 500/);
  assert.match(finalizer, /customerReceivables/);
  assert.match(finalizer, /expectedReceivables/);
  assert.match(finalizer, /report\.overall = acceptancePass && reconciliationPass && modulePass && securityPass/);
  assert.match(workflow, /qa-pharmacy-live-audit-finalize\.mjs/);
});

test('Pharmacy browser audit isolates roles, routes and evidence origins', () => {
  assert.match(browser, /const publicOrigin = runtime\.publicOrigin/);
  assert.match(browser, /report\.environment\?\.frontendUrl/);
  assert.match(browser, /process\.env\.AXTOR_PUBLIC_ORIGIN/);
  assert.match(browser, /const backendOrigin = runtime\.backendOrigin/);
  assert.match(browser, /report\.environment\?\.backendUrl/);
  assert.match(browser, /process\.env\.AXTOR_BACKEND_ORIGIN/);
  assert.match(browser, /requires resolved frontend and backend origins/);
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
  assert.match(workflow, /Base Pharmacy audit exit status/);
  assert.match(workflow, /openssl cms -encrypt/);
  assert.match(workflow, /pharmacy-live-audit-credentials\.p7m/);
  assert.match(workflow, /shred -u pharmacy-live-audit-credentials\.json/);
  assert.match(workflow, /report\.counts\?\.productCount !== 100/);
  assert.match(workflow, /report\.counts\?\.customerCount !== 200 \|\| report\.counts\?\.uniqueCustomerIds !== 200/);
  assert.match(workflow, /report\.counts\?\.invoiceCount !== 500 \|\| report\.counts\?\.uniqueInvoiceIds !== 500 \|\| report\.counts\?\.uniqueDocumentNumbers !== 500/);
  assert.match(workflow, /users\.length !== 5/);
  assert.match(workflow, /user\.pages\?\.length !== 8/);
});
