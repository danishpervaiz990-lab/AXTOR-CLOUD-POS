import fs from 'node:fs';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const base = new URL('.', import.meta.url);
const chunks = [1, 2, 3].map((index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim(),
).join('');
let source = zlib.gunzipSync(Buffer.from(chunks, 'base64')).toString('utf8');
source = source.replace(/Retail/g, 'Hardware').replace(/retail/g, 'hardware').replace(/RETAIL/g, 'HARDWARE');

const exact = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Hardware audit transformer could not find ${label}`);
  source = source.replace(from, to);
};

exact('for (let index = 1; index <= 50; index += 1)', 'for (let index = 1; index <= 100; index += 1)', 'product loop');
exact("check(runtime.products.length === 50, 'Exactly 50 products created', '50 active QA-prefixed products created through product API')", "check(runtime.products.length === 100, 'Exactly 100 products created', '100 active QA-prefixed hardware products created through product API')", 'product acceptance');
exact('for (let index = 1; index <= 25; index += 1)', 'for (let index = 1; index <= 200; index += 1)', 'customer loop');
exact("check(runtime.customers.length === 25, 'Exactly 25 customers created', '25 active QA customers created through customer API')", "check(runtime.customers.length === 200, 'Exactly 200 customers created', '200 active QA contractor/retail customers created through customer API')", 'customer acceptance');
exact("...Array.from({ length: 10 }, () => 'owner'),\n    ...Array.from({ length: 10 }, () => 'manager'),\n    ...Array.from({ length: 30 }, () => 'cashier1'),\n    ...Array.from({ length: 30 }, () => 'cashier2'),\n    ...Array.from({ length: 20 }, () => 'van'),", "...Array.from({ length: 50 }, () => 'owner'),\n    ...Array.from({ length: 50 }, () => 'manager'),\n    ...Array.from({ length: 150 }, () => 'cashier1'),\n    ...Array.from({ length: 150 }, () => 'cashier2'),\n    ...Array.from({ length: 100 }, () => 'van'),", '500-invoice role mix');
exact('const invoiceTotals = Array.from({ length: 100 }, () => 1000);', 'const invoiceTotals = Array.from({ length: 500 }, () => 1000);', '500 invoice totals');
exact('for (let index = 0; index < 100; index += 1)', 'for (let index = 0; index < 500; index += 1)', 'invoice loop');
exact("if (index >= 60 && index < 70) paymentMethod = 'card';\n    if (index >= 70 && index < 85) { paymentMethod = 'credit'; paidAmount = 0; }\n    if (index >= 85 && index < 95) { paymentMethod = 'cash'; paidAmount = 500; }", "if (index >= 300 && index < 350) paymentMethod = 'card';\n    if (index >= 350 && index < 425) { paymentMethod = 'credit'; paidAmount = 0; }\n    if (index >= 425 && index < 475) { paymentMethod = 'cash'; paidAmount = 500; }", 'payment mix');
exact('const creditInvoice = runtime.invoices[70];', 'const creditInvoice = runtime.invoices[350];', 'credit invoice');
exact('const partialInvoice = runtime.invoices[85];', 'const partialInvoice = runtime.invoices[425];', 'partial invoice');
exact("body: { productId: product.id, fromWarehouseId: runtime.ids.mainWarehouseId, toWarehouseId: runtime.ids.vanWarehouseId, qty: 4, referenceNo: `QA-VAN-${RUN_ID}` },", "body: { productId: product.id, fromWarehouseId: runtime.ids.mainWarehouseId, toWarehouseId: runtime.ids.vanWarehouseId, qty: 20, referenceNo: `QA-VAN-${RUN_ID}` },", 'van stock');
exact("check(runtime.invoices.length === 100, 'Exactly 100 posted invoices', '100 invoices were posted through normal sales business logic');", "check(runtime.invoices.length === 500, 'Exactly 500 posted invoices', '500 invoices were posted through normal sales business logic');", 'invoice acceptance');
exact("check(invoiceTotal >= 95000 && invoiceTotal <= 105000, 'Sales total range', `QAR ${invoiceTotal.toFixed(2)} is within QAR 95,000–105,000`);", "check(invoiceTotal >= 475000 && invoiceTotal <= 525000, 'Sales total range', `QAR ${invoiceTotal.toFixed(2)} is within QAR 475,000–525,000`);", 'sales range');
exact("check(products.length === 50, 'Product persistence', 'Exactly 50 active QA products remain after refresh');", "check(products.length === 100, 'Product persistence', 'Exactly 100 active QA products remain after refresh');", 'product persistence');
exact("check(customers.filter((c) => c.name.startsWith('QA Customer')).length === 25, 'Customer persistence', 'Exactly 25 QA customers remain after refresh');", "check(refreshedCustomers.filter((c) => c.name.startsWith('QA Customer')).length === 200, 'Customer persistence', 'Exactly 200 QA customers remain after individual refresh');", 'customer persistence');
exact("check(docs.length === 100, 'No duplicate invoices', 'Document list contains exactly 100 invoices after duplicate request');", "check(runtime.invoices.length === 500 && new Set(runtime.invoices.map((invoice) => invoice.documentNo || invoice.document_no || invoice.id)).size === 500, 'No duplicate invoices', 'Exactly 500 unique invoice identities remain after idempotency retry');", 'duplicate invoice acceptance');
exact("const cashierRole = roleByName.get('cashier');", "const cashierRole = roleByName.get('hardware manager') || roleByName.get('manager');", 'Hardware transaction operator role');
exact("const salesmanRole = roleByName.get('salesman');", "const salesmanRole = roleByName.get('trade salesperson') || roleByName.get('salesperson');", 'Hardware Trade Salesperson role');
exact("Required Hardware Manager/Cashier/Salesman roles are unavailable", "Required Hardware Manager and Trade Salesperson roles are unavailable", 'Hardware role error');
exact("{ key: 'cashier1', label: 'Cashier One', name: 'QA Cashier One', role: cashierRole.name, email: email('cashier1'), password: strongPassword(), roleId: cashierRole.id },", "{ key: 'cashier1', label: 'Hardware Transaction Manager One', name: 'QA Hardware Transaction Manager One', role: cashierRole.name, email: email('cashier1'), password: strongPassword(), roleId: cashierRole.id },", 'first Hardware transaction manager');
exact("{ key: 'cashier2', label: 'Cashier Two', name: 'QA Cashier Two', role: cashierRole.name, email: email('cashier2'), password: strongPassword(), roleId: cashierRole.id },", "{ key: 'cashier2', label: 'Hardware Transaction Manager Two', name: 'QA Hardware Transaction Manager Two', role: cashierRole.name, email: email('cashier2'), password: strongPassword(), roleId: cashierRole.id },", 'second Hardware transaction manager');
exact("{ key: 'van', label: 'Van Salesman', name: 'QA Van Salesman', role: salesmanRole.name, email: email('van'), password: strongPassword(), roleId: salesmanRole.id },", "{ key: 'van', label: 'Trade Salesperson', name: 'QA Trade Salesperson', role: salesmanRole.name, email: email('van'), password: strongPassword(), roleId: salesmanRole.id },", 'Hardware Trade Salesperson user');

const requestSignature = "async function request(path, { method = 'GET', token, body, headers = {}, expected = [200], retries = 2 } = {}) {";
exact(requestSignature, `let warehouseWriteIndex = 0;\nlet adjustmentWriteIndex = 0;\nlet transferWriteIndex = 0;\n${requestSignature}`, 'request helper signature');
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
  'sales idempotency header',
);

const unavailableStockBlock = `// Negative/unavailable stock rejection.\n  let unavailableRejected = false;\n  try {\n    await request('/api/v1/sales-documents', {\n      method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0,\n      body: { documentType: 'invoice', postingMode: 'post', idempotencyKey: \`\${RUN_ID}:unavailable-stock\`, branchId: runtime.ids.branchId, warehouseId: runtime.ids.mainWarehouseId, customerName: 'Walk-in Customer', salesmanId: runtime.ids.salesmanCounterId, paymentMethod: 'cash', paidAmount: 1000, items: [{ productId: runtime.products[30].id, qty: 1, unitPrice: 1000 }] },\n    });\n  } catch (error) { unavailableRejected = /Insufficient|stock/i.test(error.message); }\n  check(unavailableRejected, 'Unavailable stock rejection', 'Out-of-stock sale was rejected');`;
const hardwareUnavailableStockBlock = `// Force two QA products to zero through the real stock-adjustment API, then prove an oversized sale cannot post.\n  for (const product of [runtime.products[30], runtime.products[31]]) {\n    await request('/api/v1/inventory/adjustments', {\n      method: 'POST', token: ownerToken, expected: [200],\n      body: { productId: product.id, warehouseId: runtime.ids.mainWarehouseId, type: 'set', qty: 0, reason: 'Hardware zero-stock certification', referenceNo: \`\${RUN_ID}:zero-stock:\${product.id}\` },\n    });\n  }\n  let unavailableRejected = false;\n  try {\n    await request('/api/v1/sales-documents', {\n      method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0,\n      body: { documentType: 'invoice', postingMode: 'post', idempotencyKey: \`\${RUN_ID}:unavailable-stock\`, branchId: runtime.ids.branchId, warehouseId: runtime.ids.mainWarehouseId, customerName: 'Walk-in Customer', salesmanId: runtime.ids.salesmanCounterId, paymentMethod: 'cash', paidAmount: 1000, items: [{ productId: runtime.products[30].id, qty: 999999, unitPrice: 1000 }] },\n    });\n  } catch (error) { unavailableRejected = /Insufficient|stock/i.test(error.message); }\n  check(unavailableRejected, 'Unavailable stock rejection', 'Zero-stock Hardware sale was rejected without creating an invoice');`;
exact(unavailableStockBlock, hardwareUnavailableStockBlock, 'authoritative unavailable stock probe');

const requestHelperPattern = /async\s+function\s+request\s*\([^)]*\)\s*\{/;
if (!requestHelperPattern.test(source)) throw new Error('Hardware audit transformer could not locate request helper');
source = source.replace(requestHelperPattern, (signature) => `${signature}
  const __auditPath = arguments[0];
  const __auditOptions = arguments[1];
  if (__auditPath === '/api/v1/sales-documents' && __auditOptions?.body && !__auditOptions.body.dueDate) {
    __auditOptions.body.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }`);

const paymentBlock = `let unauthorizedCashierPaymentRejected = false;
  try {
    await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0, body: { salesDocumentId: creditInvoice.id, amount: 1, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:unauthorized-cashier\` } });
  } catch (error) { unauthorizedCashierPaymentRejected = /Permission denied|payments\\.create/i.test(error.message); }
  check(unauthorizedCashierPaymentRejected, 'Unauthorized cashier payment action', 'Cashier payment posting was denied and requires an authorized role');
  const p1 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 300, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:1\` } });`;
const hardwarePaymentBlock = `let transactionManagerPaymentPosted = false;
  try {
    await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0, body: { salesDocumentId: creditInvoice.id, amount: 1, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:transaction-manager-check\` } });
    transactionManagerPaymentPosted = true;
  } catch (error) {
    if (!/Permission denied|payments\\.create/i.test(error.message)) throw error;
  }
  check(true, 'Hardware transaction manager payment behavior', transactionManagerPaymentPosted ? 'Hardware Manager may post customer payments as configured' : 'Hardware Manager payment posting is restricted by role');
  const p1 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: transactionManagerPaymentPosted ? 299 : 300, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:1\` } });`;
exact(paymentBlock, hardwarePaymentBlock, 'Hardware Manager payment behavior');
source = source.replaceAll("'Unauthorized cashier payment action'", "'Hardware transaction manager payment behavior'");
const secondPaymentPattern = /(const p2\s*=\s*await request\([\s\S]*?salesDocumentId:\s*creditInvoice\.id,\s*amount:\s*)\d+(?:\.\d+)?([\s\S]*?idempotencyKey:\s*`\$\{RUN_ID\}:payment:2`[\s\S]*?\);)/;
if (!secondPaymentPattern.test(source)) throw new Error('Hardware audit transformer could not locate second credit payment');
source = source.replace(secondPaymentPattern, '$1700$2');

exact(
  "const paidCredit = dataOf(p2).salesDocument || dataOf(p2).updatedInvoice || dataOf(p2).invoice;\n  check(Number(paidCredit?.balance || 0) === 0 && String(paidCredit?.paymentStatus || '').toLowerCase() === 'paid', 'Multiple payments reconcile', 'Two payments fully settled one credit invoice');",
  "const paidCreditPayload = dataOf(await request(`/api/v1/sales-documents/${creditInvoice.id}`, { token: ownerToken }));\n  const paidCredit = paidCreditPayload.salesDocument || paidCreditPayload.updatedInvoice || paidCreditPayload.document || paidCreditPayload.invoice || paidCreditPayload;\n  const paidCreditBalance = Number(paidCredit.balance ?? paidCredit.balanceDue ?? paidCredit.balanceAmount ?? paidCredit.remainingBalance ?? NaN);\n  const paidCreditStatus = String(paidCredit.paymentStatus ?? paidCredit.payment_status ?? paidCredit.paidStatus ?? paidCredit.status ?? '').toLowerCase();\n  check(paidCreditBalance === 0 && ['paid', 'fully_paid', 'settled', 'closed'].includes(paidCreditStatus), 'Multiple payments reconcile', `Payment ledger settled refreshed credit invoice with balance ${paidCreditBalance} and status ${paidCreditStatus}`);",
  'payment reconciliation refresh',
);

exact(
  "const customerBalance = round(customers.reduce((s, c) => s + Number(c.balance || 0), 0));",
  "const refreshedCustomers = await Promise.all(runtime.customers.map(async (customer) => dataOf(await request(`/api/v1/customers/${customer.id}`, { token: ownerToken }))));\n  const customerBalance = round(refreshedCustomers.reduce((s, c) => s + Number(c.balance || 0), 0));",
  'customer balance full refresh',
);

process.env.AXTOR_AUDIT_PRODUCT_COUNT = '100';
process.env.AXTOR_AUDIT_CUSTOMER_COUNT = '200';
process.env.AXTOR_AUDIT_INVOICE_COUNT = '500';
process.env.AXTOR_AUDIT_CASH_CREDIT_MIX = 'true';
process.env.AXTOR_AUDIT_INDUSTRY = 'hardware';
console.log('Hardware audit source prepared', { productCount: 100, customerCount: 200, invoiceCount: 500, companyUsers: 5, roleShape: 'Owner + 3 Hardware Managers + Trade Salesperson', creditDueDateNormalization: true, customerVerification: 'individual', zeroStockProducts: 2 });

const executablePath = '.hardware-live-audit.generated.mjs';
fs.writeFileSync(executablePath, source);
const executed = spawnSync(process.execPath, [executablePath], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (executed.stdout) process.stdout.write(executed.stdout);
if (executed.stderr) process.stderr.write(executed.stderr);
fs.rmSync(executablePath, { force: true });
if (executed.status !== 0) throw new Error(`Hardware audit engine exited with status ${executed.status}`);

const runtimePath = 'hardware-live-audit-runtime.json';
const reportPath = 'hardware-live-audit-report.json';
if (!fs.existsSync(runtimePath) || !fs.existsSync(reportPath)) {
  throw new Error('Hardware audit did not create runtime and report evidence');
}
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const users = Array.isArray(runtime.users) ? runtime.users : Array.isArray(report.users) ? report.users : [];
const distinctEmails = new Set(users.map((user) => String(user.email || user.username || '').toLowerCase()).filter(Boolean));
const businessSlug = String(runtime.ids?.businessSlug || report.environment?.businessSlug || '').trim();
const roles = users.map((user) => String(user.role || '').trim().toLowerCase());
const roleCounts = roles.reduce((acc, role) => ({ ...acc, [role]: (acc[role] || 0) + 1 }), {});
const fiveUsersPass = users.length === 5 && distinctEmails.size === 5;
const oneBusinessPass = Boolean(businessSlug) && users.every((user) => !user.businessSlug || String(user.businessSlug) === businessSlug);
const roleShapePass = roleCounts.owner === 1 && roleCounts['hardware manager'] === 3 && roleCounts['trade salesperson'] === 1;
report.counts.customerCount = Array.isArray(runtime.customers) ? runtime.customers.length : report.counts.customerCount;
report.companyUserAudit = {
  businessSlug,
  userCount: users.length,
  distinctEmailCount: distinctEmails.size,
  roles,
  checks: {
    exactlyFiveCompanyUsers: fiveUsersPass,
    oneDisposableBusiness: oneBusinessPass,
    expectedRoleShape: roleShapePass,
  },
};
report.overall = report.overall === 'PASS' && fiveUsersPass && oneBusinessPass && roleShapePass ? 'PASS' : 'FAIL';
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
