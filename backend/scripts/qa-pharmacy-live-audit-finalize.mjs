import fs from 'node:fs/promises';

const runtimePath = 'pharmacy-live-audit-runtime.json';
const reportPath = 'pharmacy-live-audit-report.json';

async function waitForFile(path, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Pharmacy live-audit finalizer timed out waiting for ${path}`);
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'items', 'rows', 'results', 'customers', 'documents', 'salesDocuments']) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractItems(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function extractTotal(payload) {
  return Number(
    payload?.total ?? payload?.meta?.total ?? payload?.pagination?.total ??
    payload?.data?.total ?? payload?.data?.meta?.total ?? payload?.data?.pagination?.total ?? 0,
  );
}

function balanceOf(item) {
  return Number(
    item?.outstandingBalance ?? item?.currentBalance ?? item?.receivableBalance ??
    item?.balance ?? item?.creditBalance ?? item?.amountDue ?? 0,
  );
}

function documentNumberOf(item) {
  return String(item?.documentNo ?? item?.documentNumber ?? item?.invoiceNo ?? item?.number ?? '').trim();
}

await Promise.all([waitForFile(runtimePath), waitForFile(reportPath)]);
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const owner = runtime.users?.find((user) => user.key === 'owner') || runtime.users?.[0];
const token = owner?.token;
const backendOrigin = report.backendOrigin || report.environment?.backendUrl || process.env.AXTOR_BACKEND_ORIGIN;
if (!token || !backendOrigin) {
  throw new Error('Pharmacy live-audit finalizer requires the Owner token and backend origin');
}
new URL(backendOrigin);

async function fetchAll(path) {
  const all = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${backendOrigin}${path}${separator}page=${page}&limit=100`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Pharmacy paginated verification returned HTTP ${response.status} for ${path}`);
    }
    const items = extractItems(payload);
    all.push(...items);
    const total = extractTotal(payload);
    if (items.length === 0 || (total > 0 && all.length >= total) || (total === 0 && items.length < 100)) break;
  }
  return all;
}

const [allCustomers, allDocuments] = await Promise.all([
  fetchAll('/api/v1/customers?active=true'),
  fetchAll('/api/v1/sales-documents?documentType=invoice'),
]);

const expectedCustomerIds = new Set((runtime.customers || []).map((item) => String(item.id)));
const expectedInvoiceIds = new Set((runtime.invoices || []).map((item) => String(item.id)));
const qaCustomers = allCustomers.filter((item) => expectedCustomerIds.has(String(item.id)));
const qaInvoices = allDocuments.filter((item) => expectedInvoiceIds.has(String(item.id)));
const uniqueCustomerIds = new Set(qaCustomers.map((item) => String(item.id)));
const uniqueInvoiceIds = new Set(qaInvoices.map((item) => String(item.id)));
const documentNumbers = qaInvoices.map(documentNumberOf).filter(Boolean);
const uniqueDocumentNumbers = new Set(documentNumbers);

const customerCountPass = qaCustomers.length === 200 && uniqueCustomerIds.size === 200;
const invoiceCountPass = qaInvoices.length === 500
  && uniqueInvoiceIds.size === 500
  && documentNumbers.length === 500
  && uniqueDocumentNumbers.size === 500;
const customerReceivables = Number(qaCustomers.reduce((sum, item) => sum + balanceOf(item), 0).toFixed(2));
const expectedReceivables = Number(report.totals?.outstandingReceivables || 0);
const receivablesPass = Math.abs(customerReceivables - expectedReceivables) < 0.01;

report.counts = {
  ...(report.counts || {}),
  customerCount: qaCustomers.length,
  invoiceCount: qaInvoices.length,
  uniqueCustomerIds: uniqueCustomerIds.size,
  uniqueInvoiceIds: uniqueInvoiceIds.size,
  uniqueDocumentNumbers: uniqueDocumentNumbers.size,
};
report.acceptance['Customer persistence'] = {
  result: customerCountPass ? 'PASS' : 'FAIL',
  detail: `${qaCustomers.length} rows / ${uniqueCustomerIds.size} unique IDs found for 200 isolated QA patients across all API pages`,
};
report.acceptance['No duplicate invoices'] = {
  result: invoiceCountPass ? 'PASS' : 'FAIL',
  detail: `${qaInvoices.length} rows, ${uniqueInvoiceIds.size} unique IDs and ${uniqueDocumentNumbers.size} unique document numbers found for 500 invoices`,
};
report.acceptance['Customer balances reconcile'] = {
  result: receivablesPass ? 'PASS' : 'FAIL',
  detail: `Paginated patient balances QAR ${customerReceivables.toFixed(2)} vs outstanding invoices QAR ${expectedReceivables.toFixed(2)}`,
};

const receivableRow = (report.reconciliation || []).find((row) => row.metric === 'Outstanding receivables');
if (receivableRow) {
  receivableRow.reportTotal = customerReceivables;
  receivableRow.difference = Number((expectedReceivables - customerReceivables).toFixed(2));
  receivableRow.result = receivablesPass ? 'PASS' : 'FAIL';
}

const acceptancePass = Object.values(report.acceptance || {}).every((entry) => entry.result === 'PASS');
const reconciliationPass = (report.reconciliation || []).every((entry) => entry.result === 'PASS');
const modulePass = (report.moduleAudit || []).every((entry) => entry.result === 'PASS');
const securityPass = (report.security || []).every((entry) => entry.result === 'PASS');
report.overall = acceptancePass && reconciliationPass && modulePass && securityPass ? 'PASS' : 'FAIL';
report.paginationFinalizedAt = new Date().toISOString();
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('Pharmacy paginated finalization', {
  customerRows: qaCustomers.length,
  uniqueCustomerIds: uniqueCustomerIds.size,
  invoiceRows: qaInvoices.length,
  uniqueInvoiceIds: uniqueInvoiceIds.size,
  uniqueDocumentNumbers: uniqueDocumentNumbers.size,
  customerReceivables,
  expectedReceivables,
  overall: report.overall,
});

if (report.overall !== 'PASS') process.exit(1);
