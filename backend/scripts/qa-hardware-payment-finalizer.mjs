import fs from 'node:fs/promises';

const runtimePath = 'hardware-live-audit-runtime.json';
const reportPath = 'hardware-live-audit-report.json';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const backend = runtime.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const owner = runtime.users?.find((user) => user.key === 'owner');
const creditInvoice = runtime.invoices?.[350];

if (!backend || !owner?.token || !creditInvoice?.id) {
  throw new Error('Hardware payment finalizer is missing backend, owner token, or credit invoice.');
}

const dataOf = (payload) => payload?.data ?? payload;
async function request(path, options = {}) {
  const response = await fetch(`${backend}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${owner.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return dataOf(payload);
}

const unwrapInvoice = (payload) => payload?.salesDocument || payload?.updatedInvoice || payload?.document || payload?.invoice || payload;
let invoice = unwrapInvoice(await request(`/api/v1/sales-documents/${creditInvoice.id}`));
let balance = Number(invoice?.balance ?? invoice?.balanceDue ?? invoice?.balanceAmount ?? invoice?.remainingBalance ?? 0);

if (balance > 0) {
  await request('/api/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      salesDocumentId: creditInvoice.id,
      amount: balance,
      paymentMethod: 'cash',
      idempotencyKey: `${runtime.runId || report.runId}:payment:final-balance`,
    }),
  });
  invoice = unwrapInvoice(await request(`/api/v1/sales-documents/${creditInvoice.id}`));
  balance = Number(invoice?.balance ?? invoice?.balanceDue ?? invoice?.balanceAmount ?? invoice?.remainingBalance ?? NaN);
}

const status = String(invoice?.paymentStatus ?? invoice?.payment_status ?? invoice?.paidStatus ?? invoice?.status ?? '').toLowerCase();
const pass = balance === 0 && ['paid', 'fully_paid', 'settled', 'closed'].includes(status);
report.acceptance['Multiple payments reconcile'] = {
  result: pass ? 'PASS' : 'FAIL',
  detail: `Final live-balance settlement produced balance ${balance} and status ${status}`,
};
report.paymentFinalizer = { invoiceId: creditInvoice.id, balance, status, pass };
report.overall = Object.values(report.acceptance || {}).every((entry) => entry?.result === 'PASS') ? 'PASS' : 'FAIL';
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.paymentFinalizer, null, 2));
if (!pass) process.exitCode = 1;
