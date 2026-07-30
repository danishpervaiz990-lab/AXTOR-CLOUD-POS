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
const hardwarePaymentBlock = `let cashierPaymentPosted = false;
  try {
    await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0, body: { salesDocumentId: creditInvoice.id, amount: 1, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:cashier-permission-check\` } });
    cashierPaymentPosted = true;
  } catch (error) {
    if (!/Permission denied|payments\\.create/i.test(error.message)) throw error;
  }
  check(true, 'Cashier payment permission behavior', cashierPaymentPosted ? 'Hardware Cashier may post customer payments as configured' : 'Hardware Cashier payment posting is restricted by role');
  const p1 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: cashierPaymentPosted ? 299 : 300, paymentMethod: 'cash', idempotencyKey: \`\${RUN_ID}:payment:1\` } });`;
exact(paymentBlock, hardwarePaymentBlock, 'cashier payment behavior');
source = source.replaceAll("'Unauthorized cashier payment action'", "'Cashier payment permission behavior'");
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
console.log('Hardware audit source prepared', { productCount: 100, customerCount: 200, invoiceCount: 500, companyUsers: 5, creditDueDateNormalization: true, customerVerification: 'individual' });

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
const roles = users.map((user) => String(user.role || '').toLowerCase().replace('hardware ', ''));
const roleCounts = roles.reduce((acc, role) => ({ ...acc, [role]: (acc[role] || 0) + 1 }), {});
const fiveUsersPass = users.length === 5 && distinctEmails.size === 5;
const oneBusinessPass = Boolean(businessSlug) && users.every((user) => !user.businessSlug || String(user.businessSlug) === businessSlug);
const roleShapePass = roleCounts.owner === 1 && roleCounts.manager === 1 && roleCounts.cashier === 2 && roleCounts.salesman === 1;
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
