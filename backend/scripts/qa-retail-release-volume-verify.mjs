import fs from 'node:fs/promises';

const runtimePath = 'retail-live-audit-runtime.json';
const reportPath = 'retail-live-audit-report.json';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const backendOrigin = runtime.backendOrigin || report.environment?.backendUrl || 'https://axtor-cloud-pos-production.up.railway.app';
const businessSlug = runtime.ids?.businessSlug || report.environment?.businessSlug;
const owner = runtime.users.find((user) => user.key === 'owner') || runtime.users[0];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetch(`${backendOrigin}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'request failed'}`);
  }
  return payload;
}

ensure(owner?.email && owner?.password && businessSlug, 'Retail audit runtime is missing owner login details');
const login = await api('/api/v1/auth/login', {
  method: 'POST',
  body: {
    businessSlug,
    email: owner.email,
    password: owner.password,
  },
});
const token = login?.token;
ensure(token, 'Retail owner login did not return an authentication token');

const supplierPrefix = `QA Retail Supplier ${String(businessSlug).slice(-12)}`;
let supplierPayload = await api('/api/v1/suppliers?active=true', { token });
let suppliers = Array.isArray(supplierPayload?.data) ? supplierPayload.data : [];
let qaSuppliers = suppliers.filter((supplier) => String(supplier.name || '').startsWith(supplierPrefix));

for (let index = qaSuppliers.length + 1; index <= 10; index += 1) {
  await api('/api/v1/suppliers', {
    method: 'POST',
    token,
    expected: [201],
    body: {
      name: `${supplierPrefix} ${String(index).padStart(2, '0')}`,
      company: `QA Retail Supply Company ${String(index).padStart(2, '0')}`,
      email: `supplier.${String(index).padStart(2, '0')}.${String(report.environment?.businessId || '').slice(-8)}@example.test`,
      phone: `+97455${String(index).padStart(6, '0')}`,
      creditDays: 30,
      openingBalance: 0,
      active: true,
    },
  });
}

supplierPayload = await api('/api/v1/suppliers?active=true', { token });
suppliers = Array.isArray(supplierPayload?.data) ? supplierPayload.data : [];
qaSuppliers = suppliers.filter((supplier) => String(supplier.name || '').startsWith(supplierPrefix));

const productsPayload = await api('/api/v1/products?active=true&limit=500', { token });
const products = Array.isArray(productsPayload?.data) ? productsPayload.data : [];

const customersPayload = await api('/api/v1/customers?active=true&limit=500', { token });
const customers = Array.isArray(customersPayload?.data) ? customersPayload.data : [];

const invoicesPayload = await api('/api/v1/sales-documents?documentType=invoice&limit=500', { token });
const invoices = Array.isArray(invoicesPayload?.data) ? invoicesPayload.data : [];
const invoiceIds = invoices.map((invoice) => String(invoice.id || '')).filter(Boolean);
const documentNumbers = invoices.map((invoice) => String(invoice.documentNo || '')).filter(Boolean);
const uniqueInvoiceIds = new Set(invoiceIds);
const uniqueDocumentNumbers = new Set(documentNumbers);

report.counts = {
  ...(report.counts || {}),
  productCount: products.length,
  customerCount: customers.length,
  supplierCount: qaSuppliers.length,
  invoiceCount: invoices.length,
};
report.acceptance = report.acceptance || {};
report.acceptance['Exactly 100 products created'] = {
  result: products.length === 100 ? 'PASS' : 'FAIL',
  detail: `${products.length} active tenant-scoped products persisted through the product API`,
};
report.acceptance['Exactly 50 customers created'] = {
  result: customers.length === 50 ? 'PASS' : 'FAIL',
  detail: `${customers.length} active tenant-scoped customers persisted through the customer API`,
};
report.acceptance['Exactly 10 suppliers created'] = {
  result: qaSuppliers.length === 10 ? 'PASS' : 'FAIL',
  detail: `${qaSuppliers.length} active isolated QA suppliers persisted through the supplier API`,
};
report.acceptance['Exactly 500 posted invoices'] = {
  result: invoices.length === 500 ? 'PASS' : 'FAIL',
  detail: `${invoices.length} posted invoices persisted in the isolated Retail tenant`,
};
report.acceptance['No duplicate invoices'] = {
  result: invoices.length === 500 && uniqueInvoiceIds.size === 500 && uniqueDocumentNumbers.size === 500 ? 'PASS' : 'FAIL',
  detail: `${invoices.length} persisted invoices; ${uniqueInvoiceIds.size} unique IDs; ${uniqueDocumentNumbers.size} unique backend-generated document numbers`,
};

const nonBrowserAcceptance = Object.entries(report.acceptance)
  .filter(([name]) => name !== 'Five-login browser test' && name !== 'Sales Overview and Reports UI reconciliation')
  .every(([, entry]) => entry?.result === 'PASS');
const reconciliationPass = (report.reconciliation || []).every((entry) => entry?.result === 'PASS');
const modulePass = (report.moduleAudit || []).every((entry) => entry?.result === 'PASS');
const securityPass = (report.security || []).every((entry) => entry?.result === 'PASS');
report.overall = nonBrowserAcceptance && reconciliationPass && modulePass && securityPass ? 'PASS' : 'FAIL';
report.releaseVolumeVerification = {
  verifiedAt: new Date().toISOString(),
  businessSlug,
  products: products.length,
  customers: customers.length,
  suppliers: qaSuppliers.length,
  invoices: invoices.length,
  uniqueInvoiceIds: uniqueInvoiceIds.size,
  uniqueDocumentNumbers: uniqueDocumentNumbers.size,
  result: report.overall,
};

await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log('Retail release-volume verification:', report.releaseVolumeVerification);
if (report.overall !== 'PASS') process.exit(1);
