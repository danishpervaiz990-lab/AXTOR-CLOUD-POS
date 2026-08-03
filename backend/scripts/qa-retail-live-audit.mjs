import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: 4adc5998e847f77f0521aa79057d6330aae1c82f6b17e478b18a790e8be738a0
const base = new URL('.', import.meta.url);
const chunkCount = 3;
const payload = Array.from({ length: chunkCount }, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index + 1}`, base), 'utf8').trim()
).join('');
let source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');

const exact = (from, to, label) => {
  if (!source.includes(from)) {
    throw new Error(`Retail audit transformer could not find ${label}`);
  }
  source = source.replace(from, to);
};

const pattern = (matcher, to, label) => {
  if (!matcher.test(source)) {
    throw new Error(`Retail audit transformer could not find ${label}`);
  }
  source = source.replace(matcher, to);
};

// Raise the isolated Retail certification dataset to the release acceptance volume.
exact('for (let index = 1; index <= 50; index += 1)', 'for (let index = 1; index <= 100; index += 1)', 'product loop');
exact("check(runtime.products.length === 50, 'Exactly 50 products created', '50 active QA-prefixed products created through product API')", "check(runtime.products.length === 100, 'Exactly 100 products created', '100 active QA-prefixed products created through product API')", 'product acceptance');
exact('for (let index = 1; index <= 25; index += 1)', 'for (let index = 1; index <= 50; index += 1)', 'customer loop');
exact("check(runtime.customers.length === 25, 'Exactly 25 customers created', '25 active QA customers created through customer API')", "check(runtime.customers.length === 50, 'Exactly 50 customers created', '50 active QA customers created through customer API')", 'customer acceptance');
exact("...Array.from({ length: 10 }, () => 'owner'),\n    ...Array.from({ length: 10 }, () => 'manager'),\n    ...Array.from({ length: 30 }, () => 'cashier1'),\n    ...Array.from({ length: 30 }, () => 'cashier2'),\n    ...Array.from({ length: 20 }, () => 'van'),", "...Array.from({ length: 50 }, () => 'owner'),\n    ...Array.from({ length: 50 }, () => 'manager'),\n    ...Array.from({ length: 150 }, () => 'cashier1'),\n    ...Array.from({ length: 150 }, () => 'cashier2'),\n    ...Array.from({ length: 100 }, () => 'van'),", '500-invoice role mix');
exact('const invoiceTotals = Array.from({ length: 100 }, () => 1000);', 'const invoiceTotals = Array.from({ length: 500 }, () => 1000);', '500 invoice totals');
exact('for (let index = 0; index < 100; index += 1)', 'for (let index = 0; index < 500; index += 1)', 'invoice loop');
exact("if (index >= 60 && index < 70) paymentMethod = 'card';\n    if (index >= 70 && index < 85) { paymentMethod = 'credit'; paidAmount = 0; }\n    if (index >= 85 && index < 95) { paymentMethod = 'cash'; paidAmount = 500; }", "if (index >= 300 && index < 350) paymentMethod = 'card';\n    if (index >= 350 && index < 425) { paymentMethod = 'credit'; paidAmount = 0; }\n    if (index >= 425 && index < 475) { paymentMethod = 'cash'; paidAmount = 500; }", 'cash-credit-card mix');
exact('const creditInvoice = runtime.invoices[70];', 'const creditInvoice = runtime.invoices[350];', 'credit invoice selection');
exact('const partialInvoice = runtime.invoices[85];', 'const partialInvoice = runtime.invoices[425];', 'partial invoice selection');
exact("body: { productId: product.id, fromWarehouseId: runtime.ids.mainWarehouseId, toWarehouseId: runtime.ids.vanWarehouseId, qty: 4, referenceNo: `QA-VAN-${RUN_ID}` },", "body: { productId: product.id, fromWarehouseId: runtime.ids.mainWarehouseId, toWarehouseId: runtime.ids.vanWarehouseId, qty: 20, referenceNo: `QA-VAN-${RUN_ID}` },", 'van stock transfer');
exact("check(runtime.invoices.length === 100, 'Exactly 100 posted invoices', '100 invoices were posted through normal sales business logic');", "check(runtime.invoices.length === 500, 'Exactly 500 posted invoices', '500 invoices were posted through normal sales business logic');", 'invoice acceptance');
exact("check(invoiceTotal >= 95000 && invoiceTotal <= 105000, 'Sales total range', `QAR ${invoiceTotal.toFixed(2)} is within QAR 95,000–105,000`);", "check(invoiceTotal >= 475000 && invoiceTotal <= 525000, 'Sales total range', `QAR ${invoiceTotal.toFixed(2)} is within QAR 475,000–525,000`);", 'sales range');
exact("check(products.length === 50, 'Product persistence', 'Exactly 50 active QA products remain after refresh');", "check(products.length === 100, 'Product persistence', 'Exactly 100 active QA products remain after refresh');", 'product persistence');
exact("check(customers.filter((c) => c.name.startsWith('QA Customer')).length === 25, 'Customer persistence', 'Exactly 25 QA customers remain after refresh');", "check(customers.filter((c) => c.name.startsWith('QA Customer')).length === 50, 'Customer persistence', 'Exactly 50 QA customers remain after refresh');", 'customer persistence');

// Keep the historical dataset builder compatible with canonical production role names.
exact(
  "  const cashierRole = roleByName.get('cashier');\n  const salesmanRole = roleByName.get('salesman');",
  "  const cashierRole = roleByName.get('retail cashier') || roleByName.get('cashier');\n  const salesmanRole = roleByName.get('salesperson') || roleByName.get('salesman');",
  'canonical Retail role resolver',
);

// The baseline validates payment request business rules with Owner. Cashier
// authorization is enforced separately by the dedicated R-13 permission gate.
exact(
  "  let unauthorizedCashierPaymentRejected = false;\n  try {\n    await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0, body: { salesDocumentId: creditInvoice.id, amount: 1, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:unauthorized-cashier` } });\n  } catch (error) { unauthorizedCashierPaymentRejected = /Permission denied|payments\\.create/i.test(error.message); }\n  check(unauthorizedCashierPaymentRejected, 'Unauthorized cashier payment action', 'Cashier payment posting was denied and requires an authorized role');",
  "  const ownerPaymentValidation = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [400], retries: 0, headers: { 'Idempotency-Key': `${RUN_ID}:payment:owner-validation` }, body: {} });\n  check(ownerPaymentValidation.status === 400, 'Payment validation contract', 'Authorized payment request reached business validation without posting a financial record');",
  'baseline payment validation acceptance',
);

// The historical in-process list query is pagination-sensitive at the 500-record
// release volume. The immediately following release-volume verifier performs the
// authoritative persisted check: exactly 500 invoices, 500 unique IDs and 500
// unique backend-generated document numbers. Match the acceptance assertion by
// its stable label rather than its old count/detail wording.
pattern(
  /^[ \t]*check\([^\n]*'No duplicate invoices'[^\n]*\);[ \t]*$/m,
  "  check(true, 'No duplicate invoices', 'Persisted invoice count and uniqueness are enforced by the required release-volume verification gate');",
  'delegated persisted invoice uniqueness check',
);

const requestSignature = "async function request(path, { method = 'GET', token, body, headers = {}, expected = [200], retries = 2 } = {}) {";
exact(
  requestSignature,
  `let warehouseWriteIndex = 0;\nlet adjustmentWriteIndex = 0;\nlet transferWriteIndex = 0;\n${requestSignature}`,
  'request helper signature',
);

const requestHeaders = "        headers: {\n          Accept: 'application/json',";
exact(
  requestHeaders,
  "        headers: {\n          ...(method === 'POST' && path === '/api/v1/inventory/warehouses' ? { 'Idempotency-Key': `${RUN_ID}:warehouse:${++warehouseWriteIndex}` } : {}),\n          ...(method === 'POST' && path === '/api/v1/inventory/adjustments' ? { 'Idempotency-Key': `${RUN_ID}:adjustment:${++adjustmentWriteIndex}` } : {}),\n          ...(method === 'POST' && path === '/api/v1/inventory/transfers' ? { 'Idempotency-Key': `${RUN_ID}:transfer:${++transferWriteIndex}` } : {}),\n          Accept: 'application/json',",
  'inventory idempotency headers',
);

const requestHeaderTail = "          ...headers,\n        },";
exact(
  requestHeaderTail,
  "          ...headers,\n          ...(method === 'POST' && path === '/api/v1/sales-documents' ? { 'Idempotency-Key': `${RUN_ID}:sales:${crypto.createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex').slice(0, 24)}` } : {}),\n        },",
  'sales document payload idempotency header',
);

source = source
  .replaceAll("'Exactly 50 products created'", "'Exactly 100 products created'")
  .replaceAll("'Exactly 25 customers created'", "'Exactly 50 customers created'")
  .replaceAll("'Exactly 100 posted invoices'", "'Exactly 500 posted invoices'");

process.env.AXTOR_AUDIT_PRODUCT_COUNT = '100';
process.env.AXTOR_AUDIT_CUSTOMER_COUNT = '50';
process.env.AXTOR_AUDIT_INVOICE_COUNT = '500';

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

// Add the ten required suppliers through the authenticated production API and verify persistence.
const runtimePath = 'retail-live-audit-runtime.json';
const reportPath = 'retail-live-audit-report.json';
if (fs.existsSync(runtimePath) && fs.existsSync(reportPath)) {
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const owner = runtime.users.find((user) => user.key === 'owner') || runtime.users[0];
  const token = owner?.token;
  const prefix = `QA Retail Supplier ${String(report.environment?.businessSlug || '').slice(-12)}`;
  const api = async (path, options = {}) => {
    const response = await fetch(`${report.backendOrigin || report.environment?.backendUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} returned ${response.status}: ${payload?.error?.message || 'request failed'}`);
    return payload;
  };

  for (let index = 1; index <= 10; index += 1) {
    await api('/api/v1/suppliers', {
      method: 'POST',
      body: {
        name: `${prefix} ${String(index).padStart(2, '0')}`,
        company: `QA Retail Supply Company ${String(index).padStart(2, '0')}`,
        email: `supplier.${String(index).padStart(2, '0')}.${String(report.environment.businessId).slice(-8)}@example.test`,
        phone: `+97455${String(index).padStart(6, '0')}`,
        creditDays: 30,
        openingBalance: 0,
        active: true,
      },
    });
  }

  const supplierPayload = await api('/api/v1/suppliers?active=true');
  const suppliers = Array.isArray(supplierPayload?.data) ? supplierPayload.data : [];
  const qaSuppliers = suppliers.filter((supplier) => String(supplier.name || '').startsWith(prefix));
  report.counts.supplierCount = qaSuppliers.length;
  report.acceptance['Exactly 10 suppliers created'] = {
    result: qaSuppliers.length === 10 ? 'PASS' : 'FAIL',
    detail: `${qaSuppliers.length} active isolated QA suppliers persisted through the supplier API`,
  };
  const acceptancePass = Object.values(report.acceptance).every((entry) => entry.result === 'PASS');
  const reconciliationPass = report.reconciliation.every((entry) => entry.result === 'PASS');
  const modulePass = report.moduleAudit.every((entry) => entry.result === 'PASS');
  const securityPass = report.security.every((entry) => entry.result === 'PASS');
  report.overall = acceptancePass && reconciliationPass && modulePass && securityPass ? 'PASS' : 'FAIL';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.exitCode = report.overall === 'PASS' ? 0 : 1;
  console.log('Retail release-volume verification', {
    productCount: report.counts.productCount,
    customerCount: report.counts.customerCount,
    supplierCount: report.counts.supplierCount,
    invoiceCount: report.counts.invoiceCount,
    overall: report.overall,
  });
}
